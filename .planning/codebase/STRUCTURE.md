# Codebase Structure

**Analysis Date:** 2026-03-06

## Directory Layout

```
second-brain/
├── src/                    # TypeScript source code
│   ├── index.ts            # MCP server entry point
│   ├── cli.ts              # CLI entry point (Commander)
│   ├── config.ts           # YAML config loading with env var resolution
│   ├── types.ts            # Shared type definitions
│   ├── mcp/                # MCP server and tool definitions
│   │   ├── server.ts       # Server factory, service wiring
│   │   └── tools/          # MCP tool registrations (one file per domain)
│   │       ├── search.ts   # search_context, get_related
│   │       ├── branch.ts   # get_branch_context
│   │       ├── project.ts  # get_project_context
│   │       ├── pr.ts       # get_pr_context
│   │       ├── capture.ts  # capture_decision, capture_learned, capture_status, capture_session_summary, capture_task
│   │       └── tasks.ts    # list_tasks, complete_task
│   ├── hooks/              # Claude Code hook handlers
│   │   ├── post-commit.ts  # Captures branch context on git commit
│   │   ├── pr-event.ts     # Captures PR context on gh pr create/edit
│   │   └── session-start.ts # Returns context for new Claude Code sessions
│   ├── services/           # Core business logic and integrations
│   │   ├── vault.ts        # Obsidian vault read/write (markdown + frontmatter)
│   │   ├── supabase.ts     # Supabase client (upsert, search, queries)
│   │   ├── embeddings.ts   # Ollama embedding generation
│   │   ├── git.ts          # Git context resolution (branch, repo, project)
│   │   ├── whisper.ts      # Audio transcription via whisper-cli
│   │   ├── reminders.ts    # Apple Reminders creation via osascript
│   │   └── processed-tracker.ts # JSON-file tracker for processed voice memos
│   └── voice/              # Voice memo capture subsystem
│       ├── watcher.ts      # Filesystem watcher with debounce
│       └── processor.ts    # Transcription + entry creation + reminder detection
├── tests/                  # Test files (mirrors src/ structure)
│   ├── config.test.ts
│   ├── services/
│   │   ├── vault.test.ts
│   │   ├── supabase.test.ts
│   │   ├── embeddings.test.ts
│   │   ├── git.test.ts
│   │   ├── whisper.test.ts
│   │   └── processed-tracker.test.ts
│   └── voice/
│       └── processor.test.ts
├── dist/                   # Compiled JS output (generated, not committed)
├── supabase/               # Database schema
│   └── schema.sql          # context_entries table + pgvector + match function
├── resources/              # System resources
│   └── com.second-brain.voice-watch.plist  # macOS launchd config for voice-watch daemon
├── docs/                   # Documentation
│   └── plans/              # Implementation plans
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript config (ES2022, Node16 modules)
├── tsconfig.test.json      # TypeScript config for tests
├── config.example.yml      # Example config file
└── .gitignore              # Ignores node_modules/, dist/, *.env, config.yml
```

## Directory Purposes

**`src/`:**
- Purpose: All application source code
- Contains: TypeScript files compiled to `dist/` via `tsc`
- Key files: `index.ts` (MCP entry), `cli.ts` (CLI entry), `config.ts`, `types.ts`

**`src/mcp/`:**
- Purpose: MCP protocol server and tool definitions
- Contains: Server factory and tool registration modules
- Key files: `server.ts` (creates server, wires services, registers tools)

**`src/mcp/tools/`:**
- Purpose: Individual MCP tool definitions grouped by domain
- Contains: One file per domain, each exporting a `registerXxxTools()` function
- Key files: `capture.ts` (5 capture tools), `search.ts` (2 search tools), `tasks.ts` (2 task tools)

**`src/hooks/`:**
- Purpose: Claude Code hook event handlers
- Contains: One handler per hook event type
- Key files: `post-commit.ts`, `pr-event.ts`, `session-start.ts`

**`src/services/`:**
- Purpose: Core services encapsulating external integrations and business logic
- Contains: Service classes and utility functions
- Key files: `vault.ts` (Obsidian I/O), `supabase.ts` (DB client), `embeddings.ts` (Ollama), `reminders.ts` (Apple Reminders)

**`src/voice/`:**
- Purpose: Voice memo capture pipeline
- Contains: Filesystem watcher and audio processing orchestrator
- Key files: `watcher.ts` (fs.watch loop), `processor.ts` (transcribe + store + remind)

**`tests/`:**
- Purpose: Unit and integration tests
- Contains: Test files mirroring `src/` structure
- Key files: Tests for services and voice processor

**`supabase/`:**
- Purpose: Database schema definitions
- Contains: SQL migration files
- Key files: `schema.sql` (single table + pgvector function)

**`resources/`:**
- Purpose: System-level configuration files
- Contains: macOS launchd plist for running voice-watch as a daemon
- Key files: `com.second-brain.voice-watch.plist`

## Key File Locations

**Entry Points:**
- `src/index.ts`: MCP server entry point (stdio transport)
- `src/cli.ts`: CLI entry point (Commander with 4 subcommands)

**Configuration:**
- `src/config.ts`: Config loading logic (YAML + env var resolution)
- `config.example.yml`: Example config showing all settings
- `~/.second-brain/config.yml`: Actual config location at runtime (not in repo)

**Core Logic:**
- `src/services/vault.ts`: Obsidian vault read/write with frontmatter
- `src/services/supabase.ts`: All database operations including vector search
- `src/mcp/server.ts`: MCP server creation and service wiring
- `src/voice/processor.ts`: Voice transcription pipeline with reminder detection

**Types:**
- `src/types.ts`: All shared interfaces (`Config`, `ContextEntry`, `ContextType`, `Frontmatter`, `ProjectConfig`, `GitContext`)

**Database:**
- `supabase/schema.sql`: Table definition, indexes, and `match_context_entries` function

**Testing:**
- `tests/services/*.test.ts`: Service-level tests
- `tests/voice/processor.test.ts`: Voice processor tests
- `tests/config.test.ts`: Config loading tests

## Naming Conventions

**Files:**
- kebab-case for multi-word files: `post-commit.ts`, `processed-tracker.ts`, `session-start.ts`
- Single-word lowercase for simple files: `vault.ts`, `search.ts`, `capture.ts`

**Directories:**
- Lowercase single words: `services/`, `hooks/`, `voice/`, `tools/`

**Exports:**
- Service classes use PascalCase: `VaultService`, `SupabaseService`, `EmbeddingsService`
- Hook handlers use `handleXxx` functions: `handlePostCommit`, `handlePrEvent`, `handleSessionStart`
- Tool registrations use `registerXxxTools` functions: `registerSearchTools`, `registerCaptureTools`
- Utility functions use camelCase: `getConfig`, `getGitContext`, `resolveProjectFromPath`

**MCP Tool Names:**
- snake_case: `search_context`, `get_branch_context`, `capture_decision`, `list_tasks`, `complete_task`

## Where to Add New Code

**New MCP Tool:**
- Create `src/mcp/tools/{domain}.ts` exporting `registerXxxTools(server: McpServer, services: Services)`
- Register it in `src/mcp/server.ts` by importing and calling the registration function
- Use Zod for input schema validation
- Tests: `tests/mcp/tools/{domain}.test.ts` (note: no MCP tool tests exist yet)

**New Service:**
- Create `src/services/{name}.ts` exporting a class
- If needed by MCP tools, add to the `Services` interface in `src/mcp/server.ts` and instantiate in `createServer()`
- Tests: `tests/services/{name}.test.ts`

**New Hook Handler:**
- Create `src/hooks/{event-name}.ts` exporting `handleXxx(input: HookInput)`
- Add the event to the switch in `src/cli.ts` `capture-hook` command
- Tests: `tests/hooks/{event-name}.test.ts` (note: no hook tests exist yet)

**New CLI Command:**
- Add a new `program.command()` block in `src/cli.ts`
- Use lazy imports (`await import()`) to keep startup fast

**New Context Type:**
- Add the type string to `ContextType` union in `src/types.ts`
- Add a path case in `VaultService.getEntryPath()` in `src/services/vault.ts`
- Add corresponding Zod enum value in MCP tool input schemas that filter by type

**New Voice Feature:**
- Voice processing logic goes in `src/voice/processor.ts`
- Filesystem watching logic goes in `src/voice/watcher.ts`
- New services supporting voice go in `src/services/`

## Special Directories

**`dist/`:**
- Purpose: Compiled JavaScript output
- Generated: Yes, by `tsc` (via `npm run build`)
- Committed: No (in `.gitignore`)

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes, by `npm install`
- Committed: No (in `.gitignore`)

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: By planning tools
- Committed: Varies

**`docs/plans/`:**
- Purpose: Implementation plan documents
- Generated: Manually or by planning tools
- Committed: Yes

---

*Structure analysis: 2026-03-06*
