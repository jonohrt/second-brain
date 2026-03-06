# External Integrations

**Analysis Date:** 2026-03-06

## APIs & External Services

**Ollama (Local LLM):**
- Purpose: Generate text embeddings for semantic search
- SDK/Client: Native `fetch` calls to REST API (`src/services/embeddings.ts`)
- Endpoint: `{baseUrl}/api/embeddings` (POST)
- Model: Configurable, default `nomic-embed-text` (768-dimension vectors)
- Auth: None (local service)
- Config: `ollama.base_url` and `ollama.model` in `config.yml`
- Availability check: GET to base URL, graceful degradation if unavailable

**Whisper.cpp (Local Speech-to-Text):**
- Purpose: Transcribe voice memos to text
- Client: `execFile` shell invocation of `whisper-cli` binary (`src/services/whisper.ts`)
- Audio conversion: Uses macOS `afconvert` to convert m4a/other formats to 16kHz WAV
- Config: `voice.whisper_binary` and `voice.whisper_model` in `config.yml`
- Flags: `--no-prints --no-timestamps`

**Apple Reminders (macOS):**
- Purpose: Create reminders from voice memo transcripts containing "remind me" phrases
- Client: `osascript` (AppleScript) via `execFile` (`src/services/reminders.ts`)
- Operations: Create reminder with title and date, check for duplicate reminders
- Target list: "Reminders" (hardcoded)
- Triggered by: `chrono-node` date parsing in `src/voice/processor.ts`

**Claude Code (MCP Protocol):**
- Purpose: This project IS an MCP server consumed by Claude Code
- Transport: stdio (`@modelcontextprotocol/sdk/server/stdio.js`)
- Entry point: `src/index.ts` (MCP server), `src/cli.ts` (hook handler)
- Tools exposed: `search_context`, `get_related`, `get_branch_context`, `get_project_context`, `get_pr_context`, `capture_decision`, `capture_learning`, `capture_task`, `list_tasks`, `complete_task`
- Hook events consumed: `post-commit`, `pr-event`, `SessionStart`

## Data Storage

**Supabase (PostgreSQL + pgvector):**
- Purpose: Primary queryable store for context entries with vector similarity search
- Client: `@supabase/supabase-js` (`src/services/supabase.ts`)
- Auth: `SUPABASE_URL` and `SUPABASE_ANON_KEY` env vars (referenced via config interpolation)
- Table: `context_entries` (schema in `supabase/schema.sql`)
  - Columns: `id` (uuid), `type`, `project`, `repo`, `branch`, `pr_number`, `title`, `content`, `embedding` (vector(768)), `metadata` (jsonb), `vault_path` (unique), `created_at`, `updated_at`
  - Indexes on: `project`, `repo`, `branch`, `pr_number`, `type`
- RPC function: `match_context_entries` - vector similarity search with optional project/repo/type filters
- Upsert conflict key: `vault_path`

**Obsidian Vault (Markdown Files):**
- Purpose: Primary durable store; human-readable markdown files with YAML frontmatter
- Client: `src/services/vault.ts` (VaultService) using `gray-matter` for frontmatter
- Location: Configured via `vault_path` and `context_dir` in `config.yml`
- Default: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/SecondBrain`
- Directory structure: `{vault_path}/{context_dir}/{project}/{repo}/{type}/`
- Write pattern: Vault write is always primary; Supabase sync is secondary with graceful failure

**Processed Voice Memo Log (JSON):**
- Purpose: Track which audio files have been transcribed to prevent reprocessing
- Client: `src/services/processed-tracker.ts` (ProcessedTracker)
- Location: `~/.second-brain/processed-voice.json` (default, configurable)
- Format: JSON array of `{ file, processedAt, vaultPath }` entries

**File Storage:**
- Local filesystem only (Obsidian vault + JSON tracker)
- No cloud file storage

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- None - This is a local CLI/MCP tool, no user authentication
- Supabase uses anon key (not user-scoped auth)

## Monitoring & Observability

**Error Tracking:**
- None - Console.error for warnings/failures

**Logs:**
- `console.log` / `console.error` throughout
- Voice watcher daemon logs to `/tmp/second-brain-voice-watch.log` (configured in launchd plist)

## CI/CD & Deployment

**Hosting:**
- Local machine only (macOS)
- No cloud deployment

**CI Pipeline:**
- None detected (no `.github/workflows/`, no CI config files)

**Installation:**
- `npm link` or direct `npm install` for local use
- Binary names: `second-brain` (CLI), `second-brain-mcp` (MCP server)

## Environment Configuration

**Required env vars (set externally, referenced in config.yml):**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous/service key

**Config file location:**
- `~/.second-brain/config.yml` (primary)
- `config.example.yml` (template in repo root)

**Secrets location:**
- Environment variables interpolated into `config.yml` at runtime
- `config.yml` is gitignored; `*.env` is gitignored

## Webhooks & Callbacks

**Incoming:**
- Claude Code hooks via stdin JSON:
  - `post-commit` hook: Captures branch context after git commits (`src/hooks/post-commit.ts`)
  - `pr-event` hook: Captures PR context after `gh pr create/edit` (`src/hooks/pr-event.ts`)
  - `SessionStart` hook: Injects context into new Claude Code sessions (`src/hooks/session-start.ts`)

**Outgoing:**
- None

## Filesystem Watchers

**Voice Memo Watcher:**
- Watches a configured directory for new audio files (m4a, wav, mp3, ogg, flac, caf)
- Implementation: Node.js `fs.watch` with 3-second debounce (`src/voice/watcher.ts`)
- Processes existing files on startup, then watches for new ones
- Deletes audio files after successful processing
- Runs as macOS launchd daemon (`resources/com.second-brain.voice-watch.plist`)

---

*Integration audit: 2026-03-06*
