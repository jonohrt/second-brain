# Second Brain: Dev Context Capture — Design Document

**Date:** 2026-03-04
**Status:** Approved
**Scope:** MVP — Dev context capture and retrieval for Claude Code

## Problem

Context is lost between AI sessions, across repos, and across branches. Switching between 7-8 stacked PRs requires re-explaining architecture decisions, work status, and cross-PR dependencies every time.

## Solution

A TypeScript MCP server + CLI that captures dev context to an Obsidian vault with vector embeddings in Supabase, and retrieves it on demand during Claude Code sessions.

## Architecture

**Approach:** Single TypeScript project serving as both MCP server (retrieval + manual capture) and CLI (hook-triggered auto-capture).

```
Capture Flow:
  Claude Code hooks (commit, PR) → CLI → vault write + Supabase embed

Retrieval Flow:
  Claude Code → MCP tools → Supabase vector search → context returned

Manual Capture Flow:
  Claude Code → MCP capture tools → vault write + Supabase embed
```

## Data Model

### Vault Structure

```
SecondBrain/Work/Dev-Context/
  {project}/
    {repo}/
      branches/{branch-name}.md
      prs/PR-{number}-{slug}.md
    decisions/{date}-{slug}.md
```

### Context Entry Format

```markdown
---
type: branch_context | pr_context | decision | learned | session
project: tesla
repo: core-ui
branch: feature-page-builder-migration
pr: 423
created: 2026-03-04T15:30:00Z
updated: 2026-03-04T16:45:00Z
tags: [auth, refactor]
---

# {Title}

## Status
Current state of work.

## Architecture Decisions
Key choices and reasoning.

## Dependencies
Related PRs and branches.

## Where I Left Off
What's done, what's next, what's blocked.
```

### Supabase Schema

```sql
create table context_entries (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  project text,
  repo text,
  branch text,
  pr_number int,
  title text not null,
  content text not null,
  embedding vector(768),  -- nomic-embed-text via Ollama
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  vault_path text
);
```

## MCP Server Tools

### Retrieval

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `search_context` | Semantic search across all context | `query`, `project?`, `repo?`, `type?` |
| `get_branch_context` | Context for current/specified branch | `branch?`, `repo?`, `project?` |
| `get_project_context` | All recent context for a project | `project`, `since?` |
| `get_pr_context` | Context for a specific PR | `pr_number`, `repo` |
| `get_related` | Related context entries | `entry_id` or `query`, `limit?` |

### Capture

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `capture_decision` | Architecture/design decision | `title`, `content`, `tags?` |
| `capture_learned` | Something learned | `title`, `content`, `tags?` |
| `capture_status` | Current work status snapshot | `status`, `next_steps?`, `blockers?` |
| `capture_session_summary` | Session summary | `summary`, `decisions?`, `next_steps?` |

Auto-detection: project/repo/branch inferred from cwd via git when omitted.

## Capture Pipeline (Hooks)

### Post-Commit Hook
- Trigger: Successful `git commit` via Claude Code
- Action: Extract commit info → upsert branch context → embed

### PR Event Hook
- Trigger: `gh pr create` or `gh pr edit`
- Action: Extract PR details → create/update PR context → embed

### Session Start Hook
- Trigger: Claude Code session starts
- Action: Detect repo/branch → query relevant context → output summary

### Hook Configuration

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Bash",
      "command": "second-brain capture-hook --event post-commit"
    }],
    "SessionStart": [{
      "command": "second-brain session-context"
    }]
  }
}
```

## Configuration

`~/.second-brain/config.yml`:

```yaml
vault_path: ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/SecondBrain
context_dir: Work/Dev-Context

supabase:
  url: ${SUPABASE_URL}
  key: ${SUPABASE_ANON_KEY}

ollama:
  base_url: http://localhost:11434
  model: nomic-embed-text

projects:
  tesla:
    repos:
      core-ui: ~/Code/tesla/projects/core-ui
      tesla-site: ~/Code/tesla/projects/tesla-site
      tesla-ui: ~/Code/tesla/projects/tesla-ui
    related_repos:
      - core-ui <-> tesla-site
```

## Project Structure

```
second-brain/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── cli.ts                # CLI entry point (for hooks)
│   ├── config.ts             # Config loader
│   ├── mcp/
│   │   ├── server.ts
│   │   └── tools/
│   │       ├── search.ts
│   │       ├── branch.ts
│   │       ├── project.ts
│   │       ├── pr.ts
│   │       └── capture.ts
│   ├── hooks/
│   │   ├── post-commit.ts
│   │   ├── pr-event.ts
│   │   └── session-start.ts
│   ├── services/
│   │   ├── embeddings.ts     # Ollama embedding calls
│   │   ├── supabase.ts
│   │   ├── vault.ts
│   │   └── git.ts
│   └── types.ts
├── config.example.yml
└── tests/
```

### Dependencies

- `@modelcontextprotocol/sdk` — MCP server framework
- `@supabase/supabase-js` — Supabase client
- `js-yaml` — Config parsing
- `gray-matter` — Markdown frontmatter parsing
- `commander` — CLI framework
- `simple-git` — Git operations

### Embeddings

- Ollama + nomic-embed-text (local, 768 dimensions)
- No external API keys required
- Swappable to OpenAI text-embedding-3-small later if desired

## Error Handling

1. **Ollama not running:** Vault write succeeds, embedding queued for next sync
2. **Supabase unreachable:** Vault write succeeds, `second-brain sync` re-embeds missing entries
3. **Branch detection fails:** Fall back to repo-level context, log warning
4. **Vault file conflicts:** Timestamp-based filenames, append-only patterns where possible
5. **Large entries:** Chunk >8K tokens, multiple embedding rows per vault file

## Testing Strategy

- Unit tests: git detection, config loading, markdown generation
- Integration tests: local Supabase (Docker) + Ollama
- Manual testing: Claude Code hook behavior

## Future Upgrades

- Voice capture pipeline (Whisper → vault → embed)
- Learning/idea capture categories
- Provider-agnostic retrieval proxy (beyond Claude Code)
- Obsidian plugin for non-dev captures
- Notification/reminder system for tasks
