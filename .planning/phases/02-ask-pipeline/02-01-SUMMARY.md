---
phase: 02-ask-pipeline
plan: 01
subsystem: api
tags: [ollama, searxng, supabase, fetch, abort-controller, tdd]

# Dependency graph
requires:
  - phase: 01-server-foundation
    provides: "SearXNG running on port 8888, Supabase with match_context_entries RPC, EmbeddingsService pattern"
provides:
  - "OllamaChatService with chat, chatWithFallback, classify methods"
  - "SearxngService with JSON API search"
  - "SupabaseService.searchWithScores with similarity threshold filtering"
affects: [02-ask-pipeline, ask-pipeline-orchestrator, ask-route]

# Tech tracking
tech-stack:
  added: []
  patterns: [model-fallback-cloud-to-local, abort-controller-timeout, similarity-threshold-filtering]

key-files:
  created:
    - src/services/ollama-chat.ts
    - src/services/searxng.ts
    - tests/services/ollama-chat.test.ts
    - tests/services/searxng.test.ts
  modified:
    - src/services/supabase.ts
    - tests/services/supabase.test.ts

key-decisions:
  - "OllamaChatService uses raw fetch consistent with EmbeddingsService pattern (no ollama npm package)"
  - "Default similarity threshold 0.65 for searchWithScores (configurable)"
  - "keep_alive: 0 in Ollama requests for immediate model unload (8GB memory constraint)"

patterns-established:
  - "Model fallback: try cloud model, catch error, retry with local model"
  - "AbortController timeout: configurable per-service with clearTimeout in finally block"
  - "Similarity threshold filtering: server-side filter on RPC results before returning to caller"

requirements-completed: [ASK-03, ASK-04, ASK-06, ASK-02]

# Metrics
duration: 2min
completed: 2026-03-06
---

# Phase 2 Plan 1: Leaf Services Summary

**OllamaChatService with cloud-to-local fallback, SearxngService JSON search client, and SupabaseService.searchWithScores with similarity threshold filtering**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T21:21:31Z
- **Completed:** 2026-03-06T21:23:48Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- OllamaChatService handles chat, chatWithFallback (cloud->local), classify (brain/web/both routing), and AbortController timeouts
- SearxngService queries SearXNG JSON API with configurable categories and result limits
- SupabaseService.searchWithScores returns entries with similarity scores, filtered by configurable threshold (default 0.65)
- 40 total tests passing (16 new ollama-chat + 7 new searxng + 6 new supabase + 11 existing supabase)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create OllamaChatService and SearxngService with tests** - `4430c7f` (feat)
2. **Task 2: Add searchWithScores to SupabaseService with tests** - `1b4f3f7` (feat)

_Both tasks followed TDD: RED (failing tests) -> GREEN (implementation) -> verified._

## Files Created/Modified
- `src/services/ollama-chat.ts` - Ollama /api/chat wrapper with model fallback and classify
- `src/services/searxng.ts` - SearXNG JSON API client with result parsing and limits
- `src/services/supabase.ts` - Added searchWithScores method with similarity threshold
- `tests/services/ollama-chat.test.ts` - 9 tests: chat, fallback, classify, timeout
- `tests/services/searxng.test.ts` - 7 tests: search, empty, errors, limits, categories
- `tests/services/supabase.test.ts` - 6 new tests: searchWithScores threshold, errors, empty

## Decisions Made
- Used raw fetch for Ollama (consistent with existing EmbeddingsService, no new dependency)
- Default 0.65 similarity threshold for searchWithScores (configurable, can tune empirically)
- keep_alive: 0 in all Ollama requests to immediately unload models (critical for 8GB Mac Mini)
- Added searchWithScores as new method rather than modifying searchByEmbedding (backward compatible)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three leaf services ready for Plan 02's AskPipeline orchestrator
- OllamaChatService exports: chat, chatWithFallback, classify
- SearxngService exports: search
- SupabaseService now has searchWithScores in addition to existing searchByEmbedding

## Self-Check: PASSED

All 7 files verified on disk. Both task commits (4430c7f, 1b4f3f7) confirmed in git log. 40 tests passing.

---
*Phase: 02-ask-pipeline*
*Completed: 2026-03-06*
