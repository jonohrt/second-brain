# Architecture

**Analysis Date:** 2026-03-06

## Pattern Overview

**Overall:** Service-oriented CLI + MCP server with dual storage (Obsidian vault files + Supabase vector DB)

**Key Characteristics:**
- Two entry points: MCP server (for Claude Code integration) and CLI (for hooks and standalone commands)
- Vault-first persistence: Obsidian markdown files are the primary store; Supabase is a secondary sync target for semantic search
- Hook-driven capture: Claude Code hooks (post-commit, pr-event, session-start) automatically capture developer context
- Voice pipeline: filesystem watcher transcribes audio to context entries via Whisper

## Layers

**Entry Points:**
- Purpose: Bootstrap the application via MCP server or CLI commands
- Location: `src/index.ts` (MCP server), `src/cli.ts` (CLI)
- Contains: Top-level wiring, stdin parsing, command definitions
- Depends on: Config, MCP server factory, Hook handlers, Voice subsystem
- Used by: External callers (Claude Code MCP client, shell hooks, launchd)

**MCP Server:**
- Purpose: Expose tools to Claude Code via the Model Context Protocol
- Location: `src/mcp/server.ts`
- Contains: Server factory that instantiates services and registers tool groups
- Depends on: Services layer, Tool registrations
- Used by: `src/index.ts` via stdio transport

**MCP Tools:**
- Purpose: Define individual MCP tools that Claude Code can invoke
- Location: `src/mcp/tools/*.ts`
- Contains: Tool registration functions, input schemas (Zod), request handlers
- Depends on: `Services` interface from `src/mcp/server.ts`, types
- Used by: MCP server via `registerXxxTools()` pattern

**Hooks:**
- Purpose: Handle Claude Code hook events to automatically capture context
- Location: `src/hooks/*.ts`
- Contains: Event handlers that create context entries from hook input
- Depends on: Config, Services (git, vault, embeddings, supabase)
- Used by: CLI `capture-hook` and `session-context` commands

**Services:**
- Purpose: Core business logic and external integrations
- Location: `src/services/*.ts`
- Contains: Stateful service classes (VaultService, SupabaseService, EmbeddingsService, WhisperService, ProcessedTracker) and a stateless function (getGitContext), plus the reminders AppleScript bridge
- Depends on: Types, Config, external APIs (Supabase, Ollama, whisper-cli, osascript)
- Used by: MCP tools, hooks, voice processor, CLI commands

**Voice Subsystem:**
- Purpose: Watch for audio files, transcribe, create context entries, detect reminders
- Location: `src/voice/*.ts`
- Contains: VoiceWatcher (filesystem watcher with debounce) and VoiceProcessor (orchestrates transcription-to-entry pipeline)
- Depends on: Services (whisper, vault, embeddings, supabase, processed-tracker, reminders)
- Used by: CLI `voice-watch` command

**Configuration:**
- Purpose: Load and resolve YAML config with env var substitution and tilde expansion
- Location: `src/config.ts`
- Contains: Config loading, env var resolution, project-to-path mapping
- Depends on: Types, filesystem (`~/.second-brain/config.yml`)
- Used by: All entry points

**Types:**
- Purpose: Shared type definitions
- Location: `src/types.ts`
- Contains: `Config`, `ContextEntry`, `ContextType`, `Frontmatter`, `ProjectConfig`, `GitContext`
- Depends on: Nothing
- Used by: Everything

## Data Flow

**Context Capture (Hook-driven):**

1. Claude Code fires a hook event (post-commit or pr-event) and pipes JSON to CLI stdin
2. CLI parses the event, calls the appropriate handler in `src/hooks/`
3. Handler resolves git context (branch, repo, project) via `src/services/git.ts`
4. Handler builds a `ContextEntry` and writes it to the Obsidian vault via `VaultService.writeEntry()`
5. Handler optionally generates an embedding via `EmbeddingsService.embed()` and upserts to Supabase
6. Vault write is the priority; Supabase sync failure is caught and silently ignored

**Context Retrieval (MCP):**

1. Claude Code calls an MCP tool (e.g., `search_context`, `get_branch_context`)
2. MCP server routes to the registered tool handler in `src/mcp/tools/`
3. For semantic search: text is embedded via Ollama, then matched against Supabase pgvector using `match_context_entries` RPC
4. For structured queries: direct Supabase queries by branch, project, or PR number
5. Results are formatted as markdown text and returned to Claude Code

**Voice Capture:**

1. `voice-watch` CLI command starts `VoiceWatcher` on a configured directory
2. Watcher detects new audio files (m4a, wav, mp3, etc.) via `fs.watch` with 3-second debounce
3. `VoiceProcessor.process()` transcribes audio via `WhisperService` (whisper-cli + afconvert)
4. Transcript is saved as a `learned` type `ContextEntry` to vault and Supabase
5. If transcript matches reminder pattern (`remind me`), `chrono-node` parses the date and an Apple Reminder is created via osascript
6. Audio file is deleted after processing; `ProcessedTracker` prevents re-processing

**Session Start:**

1. Claude Code fires `SessionStart` hook, pipes JSON with `cwd` to CLI
2. Handler queries Supabase for current branch context and recent project activity (last 7 days)
3. Returns formatted markdown as `additionalContext` for Claude Code to inject into the session

**Sync (Manual):**

1. CLI `sync` command reads all vault entries via `VaultService.listEntries()`
2. For each entry, generates embedding and upserts to Supabase
3. Used to backfill the vector DB from vault contents

**State Management:**
- Obsidian vault (markdown files with YAML frontmatter) is the source of truth
- Supabase `context_entries` table with pgvector is the queryable mirror
- `ProcessedTracker` uses a JSON file (`~/.second-brain/processed-voice.json`) for voice memo deduplication
- `VoiceWatcher` maintains an in-memory `handled` Set for session-level deduplication
- Upsert conflict resolution is on `vault_path` (unique column in Supabase)

## Key Abstractions

**ContextEntry:**
- Purpose: Universal data structure for all captured context (branches, PRs, decisions, learnings, sessions, tasks)
- Examples: `src/types.ts` (interface), used in every service and tool
- Pattern: A single type with a `type` discriminator field (`ContextType`) and optional fields for different subtypes

**Services Interface:**
- Purpose: Bundle of instantiated services passed to MCP tool registrations
- Examples: `src/mcp/server.ts` (`Services` interface)
- Pattern: Poor man's dependency injection — services are constructed in `createServer()` and passed as a bag to all tool registration functions

**Tool Registration:**
- Purpose: Modular MCP tool definition
- Examples: `src/mcp/tools/search.ts`, `src/mcp/tools/capture.ts`, `src/mcp/tools/tasks.ts`
- Pattern: Each file exports a `registerXxxTools(server, services)` function that calls `server.registerTool()` with Zod schemas

**VaultService Path Resolution:**
- Purpose: Deterministic file paths for context entries based on type, project, repo, branch
- Examples: `src/services/vault.ts` (`getEntryPath()`)
- Pattern: Switch on `ContextType` to build hierarchical vault paths (e.g., `{project}/{repo}/branches/{branch}.md`)

## Entry Points

**MCP Server (`src/index.ts`):**
- Location: `src/index.ts`
- Triggers: Claude Code connects via stdio MCP transport
- Responsibilities: Load config, create MCP server with all tools, connect stdio transport
- Binary: `second-brain-mcp` (defined in `package.json` `bin`)

**CLI (`src/cli.ts`):**
- Location: `src/cli.ts`
- Triggers: Shell invocation via `second-brain` binary
- Responsibilities: Parse commands via Commander, dispatch to handlers
- Binary: `second-brain` (defined in `package.json` `bin`)
- Commands:
  - `capture-hook --event <type>` — handle post-commit or pr-event hooks
  - `session-context` — output session start context
  - `sync` — re-embed vault entries to Supabase
  - `voice-watch` — start voice memo watcher daemon

## Error Handling

**Strategy:** Vault-first with graceful degradation on network services

**Patterns:**
- Vault writes are always attempted first; if they fail, the error propagates
- Supabase and embedding failures are caught silently in hooks and voice processor — vault is the priority
- MCP tools wrap all logic in try/catch and return `{ isError: true }` responses with error messages
- `EmbeddingsService.isAvailable()` is checked before embedding to gracefully handle Ollama being offline
- Voice watcher removes files from the `handled` set on failure to allow retry

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` throughout. No structured logging framework.

**Validation:** Zod schemas validate MCP tool inputs. No validation on hook inputs or config beyond TypeScript types.

**Authentication:** Supabase anon key and Ollama are configured via `~/.second-brain/config.yml` with env var substitution (`${SUPABASE_URL}`).

**Database Schema:** Single `context_entries` table in Supabase with pgvector extension. Schema defined in `supabase/schema.sql`. Vector similarity search via `match_context_entries` PostgreSQL function.

---

*Architecture analysis: 2026-03-06*
