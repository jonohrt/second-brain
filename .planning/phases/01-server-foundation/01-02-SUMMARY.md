---
phase: 01-server-foundation
plan: 02
subsystem: api
tags: [fastify, capture, zod, shared-service, rest-api]

# Dependency graph
requires:
  - phase: 01-server-foundation/01
    provides: "Fastify server scaffold with createApp() and scoped bearer-auth"
provides:
  - "POST /capture endpoint accepting text and returning 201 with title and vaultPath"
  - "Shared captureEntry service function used by both MCP tools and HTTP API"
  - "buildTestAppWithServices() helper for integration tests with mock services"
affects: [02-ask-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared-service-extraction, zod-request-validation, mock-services-for-testing]

key-files:
  created:
    - src/services/capture.ts
    - src/server/routes/capture.ts
    - tests/server/capture.test.ts
  modified:
    - src/mcp/tools/capture.ts
    - src/server/index.ts
    - tests/server/helpers.ts

key-decisions:
  - "captureEntry extracted to src/services/capture.ts as shared function for MCP and HTTP code paths"
  - "createApp accepts optional services via CreateAppOptions for test mocking"

patterns-established:
  - "Shared service pattern: domain logic in src/services/, imported by both mcp/tools/ and server/routes/"
  - "Test mock pattern: buildTestAppWithServices() creates app with vi.fn() mocks for vault, embeddings, supabase"
  - "Route validation pattern: Zod schema in route file, safeParse with 400 error details on failure"

requirements-completed: [CAP-01, CAP-02]

# Metrics
duration: 2min
completed: 2026-03-06
---

# Phase 1 Plan 02: Capture Endpoint Summary

**POST /capture endpoint with Zod validation, shared captureEntry service extracted from MCP tools, and 6 integration tests covering success, validation, auth, and error paths**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T21:01:51Z
- **Completed:** 2026-03-06T21:04:08Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Extracted captureEntry from MCP tools to shared src/services/capture.ts, used by both MCP and HTTP routes
- POST /capture accepts { text, title?, type?, tags? } with Zod validation, returns 201 with title and vaultPath
- 6 new integration tests: valid capture (201), custom title (201), empty body (400), empty text (400), no auth (401), server error (500)
- All 11 server tests pass (health + auth + capture), all 55 passing tests in full suite unaffected

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract captureEntry to shared service and wire /capture route** - `5cb0c39` (feat)
2. **Task 2: Integration tests for /capture endpoint** - `bc83b53` (test)

**Plan metadata:** (pending)

## Files Created/Modified
- `src/services/capture.ts` - Shared captureEntry function extracted from MCP tools
- `src/server/routes/capture.ts` - POST /capture route with Zod validation
- `src/mcp/tools/capture.ts` - Updated to import captureEntry from shared service
- `src/server/index.ts` - Register capture routes in auth scope, accept optional services
- `tests/server/capture.test.ts` - 6 integration tests for capture endpoint
- `tests/server/helpers.ts` - Extended with buildTestAppWithServices() and mock services

## Decisions Made
- Extracted captureEntry to src/services/capture.ts rather than re-exporting from MCP tools, keeping clean separation between MCP and HTTP layers
- createApp accepts optional Services object via CreateAppOptions, defaulting to real service construction from config when not provided (production path)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Capture endpoint ready for iOS app integration
- Shared captureEntry pattern established for any future endpoints needing vault+Supabase pipeline
- Test helper with mock services ready for additional endpoint testing

## Self-Check: PASSED

- FOUND: src/services/capture.ts
- FOUND: src/server/routes/capture.ts
- FOUND: tests/server/capture.test.ts
- FOUND: commit 5cb0c39
- FOUND: commit bc83b53

---
*Phase: 01-server-foundation*
*Completed: 2026-03-06*
