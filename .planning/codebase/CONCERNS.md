# Codebase Concerns

**Analysis Date:** 2026-03-06

## Tech Debt

**Duplicated capture-to-sync pattern:**
- Issue: The pattern of "write to vault, check embeddings availability, embed, upsert to Supabase" is copy-pasted across 4+ locations with minor variations. No shared helper exists for hook code paths.
- Files: `src/mcp/tools/capture.ts` (lines 7-25), `src/hooks/post-commit.ts` (lines 42-52), `src/hooks/pr-event.ts` (lines 43-50), `src/mcp/tools/tasks.ts` (lines 74-82), `src/voice/processor.ts` (lines 71-81)
- Impact: Bug fixes or behavior changes (e.g., retry logic, error handling) must be applied in every location. Easy to miss one.
- Fix approach: Extract a shared `syncToSupabase(entry: ContextEntry, embeddings: EmbeddingsService, supabase: SupabaseService)` utility function. The `captureEntry` helper in `src/mcp/tools/capture.ts` is close but not reusable by hooks or voice processor because it also writes to vault and returns an MCP-formatted string.

**Hook handlers recreate all services from scratch:**
- Issue: `src/hooks/post-commit.ts`, `src/hooks/pr-event.ts`, and `src/hooks/session-start.ts` each independently call `getConfig()` and construct `VaultService`, `EmbeddingsService`, and `SupabaseService`. The CLI `voice-watch` command does the same in `src/cli.ts` (lines 96-118).
- Files: `src/hooks/post-commit.ts`, `src/hooks/pr-event.ts`, `src/hooks/session-start.ts`, `src/cli.ts`
- Impact: No service lifecycle management. Each hook invocation pays full initialization cost. Adding a new service requires updating every call site.
- Fix approach: Create a `createServices(config: Config)` factory in `src/services/index.ts` that returns a `Services` object (the interface already exists in `src/mcp/server.ts`). Reuse it everywhere.

**No config validation:**
- Issue: `src/config.ts` casts the parsed YAML to `Record<string, unknown>` and accesses properties with `as` casts. Missing or malformed config silently produces empty strings or undefined values rather than throwing a clear error.
- Files: `src/config.ts` (lines 28-63)
- Impact: Runtime errors in service constructors (e.g., Supabase URL is empty) that are hard to trace back to config issues. Silent failures when env vars are not set (`resolveEnvVars` replaces unset vars with empty string).
- Fix approach: Use Zod (already a dependency) to define and validate the config schema. Throw descriptive errors on missing required fields.

**ProcessedTracker grows unbounded:**
- Issue: `src/services/processed-tracker.ts` appends to a JSON array every time a voice memo is processed and never prunes old entries. The `isProcessed` check does a linear scan (`Array.some`).
- Files: `src/services/processed-tracker.ts`
- Impact: Over months/years, the JSON file grows and `isProcessed` lookups become slow. Not critical at low volume but scales poorly.
- Fix approach: Use a `Set` or `Map` keyed by filename for O(1) lookups. Optionally prune entries older than N days on load.

**Voice entries always typed as "learned":**
- Issue: Every voice memo is captured with `type: 'learned'` in `src/voice/processor.ts` (line 60), even if the content is a task, decision, or status update. The reminder detection is a special case that works around this.
- Files: `src/voice/processor.ts` (line 60)
- Impact: Voice-captured tasks land as "learned" entries in the vault and Supabase, making them invisible to `list_tasks` and `complete_task` tools.
- Fix approach: Add intent classification (even keyword-based) to detect task vs. decision vs. learned content from transcripts, similar to the existing `parseReminder` pattern.

## Security Considerations

**AppleScript injection in reminders:**
- Risk: Reminder titles derived from voice transcripts are passed into AppleScript strings in `src/services/reminders.ts`. The escaping only handles double quotes (`title.replace(/"/g, '\\"')` on line 7 and line 43), but does not escape backslashes or other AppleScript special characters.
- Files: `src/services/reminders.ts` (lines 7-13, lines 43-48)
- Current mitigation: Input comes from Whisper transcription (not direct user text input), which limits the attack surface.
- Recommendations: Escape backslashes before escaping quotes. Alternatively, use AppleScript's `quoted form of` or pass data via a different mechanism (e.g., the `reminders` CLI if available).

**Supabase anon key in config:**
- Risk: The Supabase anon key is stored in the YAML config file referenced via env vars. The `config.yml` is gitignored, but the `config.example.yml` shows the pattern uses `${SUPABASE_ANON_KEY}` which implies it may be set as a shell env var.
- Files: `config.example.yml`, `src/config.ts`
- Current mitigation: `config.yml` and `*.env` are in `.gitignore`.
- Recommendations: Document that Row Level Security (RLS) should be enabled on the `context_entries` table since the anon key is used client-side.

**No input sanitization on `findTaskByTitle`:**
- Risk: The `titleSubstring` parameter in `src/services/supabase.ts` (line 130) is passed directly into an `ilike` query as `%${titleSubstring}%`. While Supabase client likely parameterizes this, SQL wildcard characters (`%`, `_`) in user input could cause unexpected matching behavior.
- Files: `src/services/supabase.ts` (line 130)
- Current mitigation: Supabase JS client uses parameterized queries, so SQL injection is not possible.
- Recommendations: Escape `%` and `_` in the input if exact substring matching is desired.

## Performance Bottlenecks

**Sync command processes all entries sequentially:**
- Problem: The `sync` CLI command in `src/cli.ts` (lines 62-91) iterates all vault entries and calls `embeddings.embed()` + `supabase.upsertEntry()` one at a time with no concurrency.
- Files: `src/cli.ts` (lines 75-89)
- Cause: Simple `for...of` loop with `await` on each iteration.
- Improvement path: Use `Promise.all` with a concurrency limiter (e.g., batches of 5-10). Also consider skipping entries that already exist in Supabase with matching `updated_at` timestamps.

**VaultService.listEntries reads and parses every markdown file:**
- Problem: `listEntries()` in `src/services/vault.ts` (lines 140-148) calls `readEntry()` on every `.md` file in the vault directory tree, which reads the file, parses frontmatter, and constructs a `ContextEntry` object.
- Files: `src/services/vault.ts` (lines 140-170)
- Cause: No caching or lazy loading. Every call to `listEntries()` re-reads the entire vault from disk.
- Improvement path: Cache entries in memory after first read, or provide a lightweight `listPaths()` method that only returns file paths without parsing.

**Ollama availability check on every capture:**
- Problem: Every capture operation calls `embeddings.isAvailable()` which makes an HTTP request to the Ollama base URL. This adds latency to every write operation.
- Files: `src/services/embeddings.ts` (lines 22-29), called from `src/mcp/tools/capture.ts`, `src/hooks/post-commit.ts`, `src/hooks/pr-event.ts`, `src/voice/processor.ts`
- Cause: No caching of availability status.
- Improvement path: Cache the availability result for a configurable TTL (e.g., 60 seconds), or check once at startup and assume it stays available.

## Fragile Areas

**Voice watcher uses Node.js `fs.watch`:**
- Files: `src/voice/watcher.ts` (line 36)
- Why fragile: `fs.watch` is known to be unreliable across platforms and file systems. On macOS with iCloud Drive (the likely voice memos location), file sync events can trigger multiple or delayed watch events. The 3-second debounce (line 48-51) helps but is a heuristic.
- Safe modification: The debounce timer and handled set provide reasonable protection. Test changes by manually copying files into the watch directory.
- Test coverage: No tests exist for `VoiceWatcher`. Only `VoiceProcessor` is tested.

**Whisper transcription depends on macOS-specific `afconvert`:**
- Files: `src/services/whisper.ts` (lines 22-27)
- Why fragile: `afconvert` is a macOS-only binary. The service will fail silently or crash on Linux. The `whisper-cli` binary is also assumed to be installed and in PATH.
- Safe modification: Guard with platform checks or document the macOS-only requirement clearly.
- Test coverage: Tests for `WhisperService` exist at `tests/services/whisper.test.ts` but likely mock the exec calls.

**PR event hook relies on regex matching of git commands:**
- Files: `src/hooks/post-commit.ts` (line 22), `src/hooks/pr-event.ts` (line 19)
- Why fragile: The hooks match command strings with regexes like `/git\s+commit/` and `/gh\s+pr\s+(create|edit)/`. These will miss commands with flags before the subcommand, aliased commands, or commands run through scripts.
- Safe modification: These are best-effort capture hooks, so false negatives are acceptable. Do not add complex parsing.
- Test coverage: No tests for hook handlers.

**Vault path generation relies on slug uniqueness:**
- Files: `src/services/vault.ts` (lines 36-74)
- Why fragile: Two entries with the same title, type, and creation date will produce the same file path and silently overwrite each other via `writeFileSync`. The `slugify` function strips all non-alphanumeric characters.
- Safe modification: Add a short hash or counter suffix when a file already exists at the target path.
- Test coverage: `tests/services/vault.test.ts` exists but does not test collision scenarios.

## Scaling Limits

**Single-table database design:**
- Current capacity: All context types (branches, PRs, decisions, learned, sessions, tasks) share one `context_entries` table with a generic `metadata` JSONB column.
- Limit: As data grows, queries filtering by `metadata->>status` (used for task management) will not use indexes efficiently. The JSONB path operator is not indexed in the current schema (`supabase/schema.sql`).
- Scaling path: Add a GIN index on `metadata` or extract task-specific fields (status, priority) into dedicated columns. Consider separate tables if entry types diverge further.

**In-memory handled set in VoiceWatcher:**
- Current capacity: The `handled` Set in `src/voice/watcher.ts` (line 8) grows for the lifetime of the process.
- Limit: Not a practical concern since voice memos are low-volume, but the set is never pruned and persists only in memory (lost on restart, which is why `ProcessedTracker` exists as backup).
- Scaling path: No action needed at current scale.

## Dependencies at Risk

**`@modelcontextprotocol/sdk` (^1.27.1):**
- Risk: The MCP protocol and SDK are relatively new and evolving. Breaking API changes in the SDK could require significant refactoring of `src/mcp/server.ts` and all tool registrations.
- Impact: All 6 tool registration files in `src/mcp/tools/` would need updating.
- Migration plan: Pin to exact version in `package.json` instead of using caret range. Monitor changelogs before upgrading.

**Ollama dependency for embeddings:**
- Risk: Embeddings require a running Ollama instance with the `nomic-embed-text` model. If Ollama is down, all semantic search functionality is silently degraded (entries are stored without embeddings).
- Impact: `search_context` and `get_related` MCP tools return no results for entries stored without embeddings, since the `match_context_entries` SQL function filters `WHERE ce.embedding IS NOT NULL`.
- Migration plan: Consider logging a warning when entries are stored without embeddings, and providing a way to backfill (the `sync` command partially addresses this).

## Test Coverage Gaps

**No tests for MCP tool handlers:**
- What's not tested: All 6 tool registration modules in `src/mcp/tools/` have zero test coverage. This includes `capture.ts` (215 lines), `tasks.ts` (94 lines), `search.ts` (108 lines), `branch.ts` (66 lines), `project.ts` (79 lines), and `pr.ts` (56 lines).
- Files: `src/mcp/tools/capture.ts`, `src/mcp/tools/tasks.ts`, `src/mcp/tools/search.ts`, `src/mcp/tools/branch.ts`, `src/mcp/tools/project.ts`, `src/mcp/tools/pr.ts`
- Risk: Regressions in the primary user-facing API (MCP tools) go undetected. The `capture_task` tool has complex logic including Apple Reminder creation.
- Priority: High

**No tests for hook handlers:**
- What's not tested: `src/hooks/post-commit.ts`, `src/hooks/pr-event.ts`, `src/hooks/session-start.ts` have no tests.
- Files: `src/hooks/post-commit.ts`, `src/hooks/pr-event.ts`, `src/hooks/session-start.ts`
- Risk: Hook filtering logic (regex matching) and context assembly could break without detection. Session start hook assembles context that is injected into every Claude Code session.
- Priority: Medium

**No tests for VoiceWatcher:**
- What's not tested: The file watching, debouncing, and file deletion logic in `src/voice/watcher.ts`.
- Files: `src/voice/watcher.ts`
- Risk: The watcher handles file deletion after processing and has retry logic (removing from `handled` set on failure). Bugs here could cause data loss (premature deletion) or infinite retries.
- Priority: Medium

**No tests for CLI commands:**
- What's not tested: The `sync` and `voice-watch` CLI commands in `src/cli.ts`.
- Files: `src/cli.ts`
- Risk: The `sync` command's sequential processing logic and error handling are untested.
- Priority: Low

**No tests for reminders service:**
- What's not tested: `src/services/reminders.ts` - AppleScript generation, date formatting, duplicate detection.
- Files: `src/services/reminders.ts`
- Risk: Date formatting for AppleScript is locale-sensitive and could break on systems with non-US locale settings. The `toLocaleDateString` and `toLocaleTimeString` calls on lines 30-38 produce locale-dependent output that AppleScript must parse.
- Priority: Medium

---

*Concerns audit: 2026-03-06*
