# Second Brain

Persistent dev context capture and retrieval for Claude Code sessions. Captures decisions, learnings, tasks, and session context to an Obsidian vault with vector embeddings in Supabase for semantic search.

## How It Works

```
Capture Flow:
  Claude Code hooks (commit, PR) → CLI → vault write + Supabase embed

Retrieval Flow:
  Claude Code → MCP tools → Supabase vector search → context returned

Manual Capture Flow:
  Claude Code → MCP capture tools → vault write + Supabase embed
```

## Setup

### Prerequisites

- Node.js 20+
- [Ollama](https://ollama.com) with `nomic-embed-text` model (`ollama pull nomic-embed-text`)
- Supabase project with pgvector enabled (schema in `supabase/schema.sql`)
- Obsidian vault (optional — works standalone, vault is for human browsing)

### Install

```bash
git clone <repo-url> && cd second-brain
npm install
npm run build
npm link  # registers `second-brain` and `second-brain-mcp` globally
```

### Configure

Create `~/.second-brain/config.yml`:

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
  my-project:
    repos:
      my-repo: ~/Code/my-repo
```

Set environment variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`, or inline them in the config.

### Register with Claude Code

Add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "second-brain": {
      "command": "second-brain-mcp",
      "type": "stdio"
    }
  }
}
```

Add hooks to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "command": "second-brain capture-hook --event post-commit"
      }
    ],
    "SessionStart": [
      {
        "command": "second-brain session-context"
      }
    ]
  }
}
```

## MCP Tools

### Retrieval

| Tool | Purpose |
|------|---------|
| `search_context` | Semantic search across all context entries |
| `get_branch_context` | Context for current/specified branch |
| `get_project_context` | All recent context for a project |
| `get_pr_context` | Context for a specific PR |
| `get_related` | Find related context entries by topic |
| `get_standup` | Recent GitHub activity summary |

### Capture

| Tool | Purpose |
|------|---------|
| `capture_decision` | Architecture or design decision with rationale |
| `capture_learned` | Technique, gotcha, pattern, or insight |
| `capture_status` | Current work status snapshot |
| `capture_session_summary` | End-of-session summary with next steps |
| `capture_task` | Task or TODO item |
| `complete_task` | Mark a task as done (fuzzy matches title) |
| `list_tasks` | List open or completed tasks |

### Auto-Detection

Most tools auto-detect `project`, `repo`, and `branch` from the current git working directory. If auto-detection fails (e.g., running from a subdirectory like `planning_docs/`), pass these parameters explicitly.

## CLI

```bash
second-brain capture-hook --event post-commit   # Hook: capture commit context
second-brain capture-hook --event pr-event       # Hook: capture PR context
second-brain session-context                     # Hook: output context for session start
second-brain sync                                # Re-embed vault entries missing from Supabase
```

## Architecture

```
src/
  index.ts              # MCP server entry point
  cli.ts                # CLI entry point (for hooks)
  config.ts             # Config loader
  types.ts              # Shared types
  mcp/
    server.ts           # MCP server setup, tool registration
    tools/
      search.ts         # search_context, get_related
      branch.ts         # get_branch_context
      project.ts        # get_project_context
      pr.ts             # get_pr_context
      capture.ts        # capture_decision, capture_learned, capture_status, capture_session_summary
      tasks.ts          # capture_task, complete_task, list_tasks
      standup.ts        # get_standup
  hooks/
    post-commit.ts      # Post-commit hook handler
    pr-event.ts         # PR event hook handler
    session-start.ts    # Session start hook handler
  services/
    embeddings.ts       # Ollama embedding calls
    supabase.ts         # Supabase client + vector search
    vault.ts            # Obsidian vault read/write
    git.ts              # Git context detection
    github.ts           # GitHub API (standup data)
    reminders.ts        # Apple Reminders integration
    whisper.ts          # Voice capture (experimental)
    processed-tracker.ts # Dedup tracking for hooks
```

## Data Storage

- **Obsidian vault** (iCloud-synced): Human-readable markdown with YAML frontmatter, organized by `{project}/{repo}/`
- **Supabase pgvector**: 768-dimension embeddings via Ollama `nomic-embed-text` for semantic search
- **Vault is source of truth** — Supabase can be rebuilt from vault via `second-brain sync`

## Development

```bash
npm run dev          # Run MCP server with tsx (hot reload)
npm run test         # Run tests (vitest)
npm run test:watch   # Watch mode
npm run build        # Compile TypeScript
```

## Claude Code Skill

A companion skill at `~/.claude/skills/second-brain/SKILL.md` provides systematic triggers for using these tools — loading context at session start, capturing decisions during work, and writing summaries at session end.
