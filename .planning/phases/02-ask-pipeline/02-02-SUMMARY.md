---
phase: 02-ask-pipeline
plan: 02
subsystem: api
tags: [rag, ollama, searxng, supabase, fastify, zod, tdd]

# Dependency graph
requires:
  - phase: 02-ask-pipeline
    plan: 01
    provides: "OllamaChatService, SearxngService, SupabaseService.searchWithScores"
  - phase: 01-server-foundation
    provides: "Fastify server with auth, capture route pattern, EmbeddingsService"
provides:
  - "AskPipeline orchestrator with classify -> retrieve -> generate flow"
  - "POST /ask endpoint returning { answer, sources, route, model }"
  - "Brain/web/both routing with automatic fallback"
affects: [voice-pipeline, ios-app, ask-enhancements]

# Tech tracking
tech-stack:
  added: []
  patterns: [pipeline-orchestrator, route-fallback-brain-to-web, context-assembly-for-llm]

key-files:
  created:
    - src/services/ask-pipeline.ts
    - src/server/routes/ask.ts
    - tests/services/ask-pipeline.test.ts
    - tests/server/ask.test.ts
  modified:
    - src/server/index.ts
    - tests/server/helpers.ts

key-decisions:
  - "AskPipeline takes all four services as constructor deps for clean testability"
  - "CreateAppOptions extended with optional askPipeline for test injection"
  - "Brain-to-web fallback when searchWithScores returns empty (no results above threshold)"
  - "Embeddings failure caught and gracefully falls back to web-only route"

patterns-established:
  - "Pipeline orchestrator: classify -> retrieve -> generate with fallback at each stage"
  - "Context assembly: brain results and web results formatted into system prompt for LLM"
  - "Test helper buildTestAppWithAsk: mock AskPipeline injection for route integration tests"

requirements-completed: [ASK-01, ASK-02, ASK-05]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 2 Plan 2: Ask Pipeline Orchestrator Summary

**AskPipeline orchestrator wiring classify/retrieve/generate with brain-to-web fallback, exposed via POST /ask with Zod validation and auth**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T21:26:11Z
- **Completed:** 2026-03-06T21:29:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- AskPipeline.ask() orchestrates question classification, context retrieval (vault + web), and LLM answer generation in a single pipeline
- POST /ask endpoint validates input with Zod, requires auth, returns { answer, sources, route, model }
- Automatic fallback: brain route upgrades to web when no vault results pass similarity threshold; embeddings failure also falls back to web
- 12 new tests (7 unit + 5 integration), 95 total tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AskPipeline orchestrator with tests** - `afff66b` (feat)
2. **Task 2: Create /ask route, wire into server, add integration tests** - `c874640` (feat)

_Both tasks followed TDD: RED (failing tests) -> GREEN (implementation) -> verified._

## Files Created/Modified
- `src/services/ask-pipeline.ts` - AskPipeline class with ask(), types (AskConfig, Source, AskResult), buildGenerationPrompt helper
- `src/server/routes/ask.ts` - POST /ask route handler with Zod validation and error handling
- `src/server/index.ts` - Wired OllamaChatService, SearxngService, AskPipeline into server; added askPipeline to CreateAppOptions
- `tests/services/ask-pipeline.test.ts` - 7 tests: brain/web/both routes, fallbacks, edge cases
- `tests/server/ask.test.ts` - 5 tests: valid 200, empty body 400, empty text 400, no auth 401, error 500
- `tests/server/helpers.ts` - Added buildTestAppWithAsk helper with mock pipeline injection

## Decisions Made
- AskPipeline takes all four services as constructor deps for clean testability and separation of concerns
- CreateAppOptions extended with optional askPipeline (same pattern as optional services for test mocking)
- Brain-to-web fallback triggered by empty searchWithScores results, not by low scores (threshold filtering already done by searchWithScores)
- Embeddings failure caught silently and falls back to web route (Ollama may be down)
- SearXNG failure caught silently, pipeline continues with whatever context is available
- No-context prompt tells LLM to use general knowledge when both sources fail

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ask pipeline complete: full /ask endpoint ready for voice integration in Phase 3
- All six ASK requirements now covered (ASK-01 through ASK-06) across plans 01 and 02
- Server exports: createApp with askPipeline injection, all services wired

## Self-Check: PASSED

All 6 files verified on disk. Both task commits (afff66b, c874640) confirmed in git log. 95 tests passing (12 new).

---
*Phase: 02-ask-pipeline*
*Completed: 2026-03-06*
