---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Completed 04-01-PLAN.md
last_updated: "2026-03-07T18:40:32.106Z"
last_activity: 2026-03-07 -- Plan 04-01 executed (TTS with sentence splitting, source attribution, device verified)
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 8
  completed_plans: 8
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** Ask a question by voice from anywhere and get an answer grounded in your personal knowledge base and the web -- hands-free, free of cost.
**Current focus:** All phases complete -- v1.0 milestone achieved

## Current Position

Phase: 4 of 4 (Enhancements) -- COMPLETE
Plan: 1 of 1 in current phase (1 complete)
Status: All phases complete, v1.0 milestone achieved
Last activity: 2026-03-07 -- Plan 04-01 executed (TTS with sentence splitting, source attribution, device verified)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: varies (5 auto plans ~7min avg, 2 iOS plans included device verification)
- Total execution time: ~1 hour

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-server-foundation | 3 | 31min | 10min |
| 02-ask-pipeline | 2 | 5min | 2.5min |

**Recent Trend:**
- Last 5 plans: 01-01 (5min), 01-03 (24min), 01-02 (2min), 02-01 (2min), 02-02 (3min)
- Trend: Progressing

*Updated after each plan completion*
| Phase 02 P02 | 3min | 2 tasks | 6 files |
| Phase 03 P01 | 3min | 2 tasks | 8 files |
| Phase 03 P02 | multi-session | 4 tasks | 21 files |
| Phase 04 P01 | multi-session | 3 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Build server-side first (Phases 1-2), then iOS (Phase 3), then enhancements (Phase 4)
- [Roadmap]: Capture endpoint in Phase 1 since it reuses existing pipeline with minimal new logic
- [Roadmap]: SearXNG deployment in Phase 1 so it is ready for Ask Pipeline in Phase 2
- [01-01]: Wrapped authPlugin with fastify-plugin (fp) for correct scope propagation of bearer-auth hooks
- [01-01]: createApp accepts protectedRoutes callback for extensible route registration in auth scope
- [01-03]: SearXNG on port 8888 to avoid conflicts with common 8080 services
- [01-03]: Rate limiter disabled for local-only API usage
- [01-02]: captureEntry extracted to src/services/capture.ts as shared function for MCP and HTTP code paths
- [01-02]: createApp accepts optional Services object for test mocking
- [02-01]: Raw fetch for Ollama chat (consistent with EmbeddingsService, no new dependency)
- [02-01]: Default 0.65 similarity threshold for searchWithScores (configurable)
- [02-01]: keep_alive: 0 in Ollama requests for immediate model unload (8GB memory constraint)
- [Phase 02]: AskPipeline takes all four services as constructor deps for clean testability
- [Phase 02]: CreateAppOptions extended with optional askPipeline for test injection
- [Phase 02]: Brain-to-web fallback when searchWithScores returns empty results
- [03-01]: XcodeGen for project generation instead of manual .xcodeproj
- [03-01]: MockURLProtocol for test isolation -- no real server needed
- [03-01]: Generic performRequest<Body,Response> helper for DRY HTTP calls
- [03-02]: gemma3:12b-cloud model for fast ~3s response pipeline
- [03-02]: Skip classify step, fetch brain+web in parallel for speed
- [03-02]: ATS exception for HTTP networking to Tailscale Mac Mini
- [03-02]: Auto-detect reminder intent in /ask for Apple Reminders creation
- [03-02]: Route news queries to SearXNG news category
- [03-02]: Full-screen response area with compact input bar layout
- [Phase 04]: NLTokenizer for sentence splitting instead of regex -- handles abbreviations correctly
- [Phase 04]: SpeechService queues one AVSpeechUtterance per sentence to avoid iOS cutoff on long text

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: 8GB Mac Mini memory pressure when running Ollama + SearXNG + Node.js needs empirical validation in Phase 1
- [Research]: Ollama qwen3.5:cloud rate limits are undocumented -- build local fallback first

## Session Continuity

Last session: 2026-03-07T18:38:20.245Z
Stopped at: Completed 04-01-PLAN.md
Resume file: None
