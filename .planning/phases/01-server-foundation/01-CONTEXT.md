# Phase 1: Server Foundation - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

A running Fastify HTTP API server on the Mac Mini that can receive requests from the iOS app, authenticate them via bearer token, capture thoughts into the existing vault pipeline, deploy SearXNG for web search, and manage Ollama models within 8GB RAM. Covers requirements INFRA-01 through INFRA-05, CAP-01, and CAP-02.

</domain>

<decisions>
## Implementation Decisions

### Auth & token management
- Static bearer token stored in config.yml (new `api_token` field) — simplest approach for single-user personal server
- iOS app stores the token once, no rotation mechanism needed
- Generic 401 response for unauthenticated requests — no descriptive error messages
- /health endpoint is public (no auth required) — useful for monitoring, no sensitive data
- All other endpoints require valid bearer token

### Server binding
- Listen on 0.0.0.0 (all interfaces) — Tailscale handles network isolation, simplest config

### Claude's Discretion
- Capture endpoint design — how /capture maps to existing captureEntry logic (VoiceProcessor is for audio; API receives text, so reuse the MCP-style captureEntry pattern)
- API response JSON structure and status codes
- Server lifecycle and process management (how it runs persistently)
- SearXNG Docker configuration details
- Ollama sequential model loading strategy
- Port number selection
- Error handling patterns

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `captureEntry()` in `src/mcp/tools/capture.ts` — writes to vault + syncs to Supabase, perfect pattern for /capture endpoint
- `VaultService` — handles markdown file creation with frontmatter
- `EmbeddingsService` — generates embeddings via Ollama (nomic-embed-text)
- `SupabaseService` — upsert and vector search already implemented
- `loadConfig()` in `src/config.ts` — YAML config loader with env var resolution and tilde expansion

### Established Patterns
- Service classes instantiated with config, passed via dependency injection (see MCP server's `Services` type)
- YAML config at `~/.second-brain/config.yml` — add `api_token` and `server` section here
- TypeScript with ES modules, built with tsc, run with tsx in dev
- Zod for input validation (used in MCP tools)

### Integration Points
- New `src/server/` directory for Fastify server (parallel to `src/mcp/` and `src/cli.ts`)
- Reuse existing service layer (vault, supabase, embeddings) — same instantiation pattern as MCP server
- New CLI command or separate entry point to start the HTTP server
- Config extends with `server.port`, `server.api_token` fields

</code_context>

<specifics>
## Specific Ideas

- Personal use only, single iPhone client — keep everything as simple as possible
- User explicitly prefers the simplest viable approach at each decision point

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-server-foundation*
*Context gathered: 2026-03-06*
