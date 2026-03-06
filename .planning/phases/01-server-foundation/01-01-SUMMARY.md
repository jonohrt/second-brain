---
phase: 01-server-foundation
plan: 01
subsystem: api
tags: [fastify, bearer-auth, health-check, server]

# Dependency graph
requires: []
provides:
  - "Fastify server scaffold with createApp()/startServer()"
  - "Bearer token auth middleware (protected scope pattern)"
  - "GET /health public endpoint"
  - "Config type extended with server.port and server.apiToken"
  - "createApp() protectedRoutes callback for route registration"
affects: [01-02-capture-endpoint, 02-ask-pipeline]

# Tech tracking
tech-stack:
  added: [fastify, "@fastify/bearer-auth", fastify-plugin]
  patterns: [scoped-auth-plugin, createApp-for-testing, public-vs-protected-route-separation]

key-files:
  created:
    - src/server/index.ts
    - src/server/plugins/auth.ts
    - src/server/routes/health.ts
    - tests/server/helpers.ts
    - tests/server/health.test.ts
    - tests/server/auth.test.ts
  modified:
    - src/types.ts
    - src/config.ts
    - package.json

key-decisions:
  - "Wrapped authPlugin with fastify-plugin (fp) to ensure bearer-auth hooks propagate to protected scope"
  - "createApp accepts optional protectedRoutes callback for extensibility and testing"
  - "Server logger disabled in createApp (set to false) for clean test output; startServer uses config-driven logging"

patterns-established:
  - "Protected scope pattern: public routes registered on app, auth routes via app.register(protectedScope) with bearer-auth"
  - "Test pattern: buildTestApp() creates app with test config and injects test routes into protected scope"
  - "Config snake_case YAML to camelCase TypeScript mapping in loadConfig()"

requirements-completed: [INFRA-01, INFRA-02, INFRA-04, INFRA-05]

# Metrics
duration: 5min
completed: 2026-03-06
---

# Phase 1 Plan 01: Server Foundation Summary

**Fastify HTTP server with scoped bearer-auth plugin, public /health endpoint, and createApp()/startServer() separation for testability**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T20:35:33Z
- **Completed:** 2026-03-06T20:39:57Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Fastify server scaffold with createApp() (testable, no listen) and startServer() (production, 0.0.0.0 binding)
- GET /health returns { status: "ok", timestamp } without requiring authentication
- Bearer token auth via @fastify/bearer-auth in scoped plugin, rejecting unauthorized requests with 401
- Config type and parser extended with optional server section (port, apiToken)
- 5 integration tests covering health and auth behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend config, create Fastify server with auth and /health** - `76aa30c` (test: RED) + `9e7016b` (feat: GREEN)
2. **Task 2: Integration tests for health and auth** - Tests delivered as part of Task 1 TDD cycle, all passing

**Plan metadata:** (pending)

_Note: TDD tasks had RED commit (failing tests) followed by GREEN commit (implementation)_

## Files Created/Modified
- `src/server/index.ts` - Fastify app factory (createApp) and production starter (startServer)
- `src/server/plugins/auth.ts` - Bearer auth plugin wrapped with fastify-plugin for scope propagation
- `src/server/routes/health.ts` - Public GET /health endpoint
- `src/types.ts` - Config type extended with optional server section
- `src/config.ts` - YAML parser handles server.port and server.api_token
- `package.json` - Added "server" npm script
- `tests/server/helpers.ts` - buildTestApp() factory with test config and protected test route
- `tests/server/health.test.ts` - Health endpoint tests (200 status, no auth required)
- `tests/server/auth.test.ts` - Auth tests (401 without token, 401 wrong token, pass with valid token)

## Decisions Made
- Wrapped authPlugin with fastify-plugin (fp) because @fastify/bearer-auth already uses fp internally, and without fp on the wrapper, the auth hooks were encapsulated inside the wrapper scope rather than propagating to the protected route scope
- Added CreateAppOptions interface with protectedRoutes callback to allow future plans (and tests) to register routes inside the auth-protected scope without modifying createApp itself
- Set Fastify logger to false in createApp for predictable test output; production logging handled by Fastify's built-in logger when started via startServer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Auth plugin required fastify-plugin wrapping**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** authPlugin without fp created its own encapsulation scope, preventing bearer-auth hooks from reaching the protected route scope. All protected routes returned 200 instead of 401.
- **Fix:** Wrapped authPlugin implementation with `fp()` from fastify-plugin so hooks propagate correctly through the scope chain
- **Files modified:** src/server/plugins/auth.ts
- **Verification:** All 5 tests pass including auth rejection tests
- **Committed in:** 9e7016b (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for bearer auth to function at all. No scope creep.

## Issues Encountered
None beyond the auth scoping issue documented above.

## User Setup Required
None - no external service configuration required. Note: OLLAMA_MAX_LOADED_MODELS=1 must be set as environment variable for the Ollama process (documented in server/index.ts comment, not enforced by application code).

## Next Phase Readiness
- Server scaffold ready for Plan 02 to register capture endpoint in protected scope via protectedRoutes callback
- createApp pattern established for all future route additions
- Test helper ready for any integration test to build on

---
*Phase: 01-server-foundation*
*Completed: 2026-03-06*
