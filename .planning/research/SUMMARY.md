# Project Research Summary

**Project:** Second Brain - Voice-Powered Personal Knowledge Assistant
**Domain:** Voice-powered LLM assistant (iOS app + self-hosted Mac Mini backend with RAG)
**Researched:** 2026-03-06
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project builds a voice-powered iOS app that talks to a self-hosted Mac Mini backend, enabling a user to ask questions against their personal Obsidian vault (via RAG) and the web (via SearXNG), with zero recurring cost. The well-established pattern is: on-device speech-to-text (WhisperKit on iPhone), a lightweight HTTP API server (Fastify) that orchestrates retrieval and generation, and local LLM inference (Ollama). The existing codebase already provides the hard parts -- Supabase pgvector embeddings, vault management, and voice processing. The new work is wiring these together behind an HTTP API and building a minimal iOS client.

The recommended approach is to build server-side first (HTTP API, RAG pipeline, LLM generation), then the iOS app in parallel once the API is stable, and finally layer on enhancements (web search, TTS, remote access). This order is dictated by dependencies: the iOS app is useless without a working /ask endpoint, and the /ask endpoint requires the RAG pipeline and LLM integration. The iOS app's audio recording and transcription can be developed independently since WhisperKit runs entirely on-device.

The primary risks are: (1) 8GB Mac Mini memory pressure when running embeddings + LLM + SearXNG simultaneously -- mitigated by sequential model loading and `OLLAMA_KEEP_ALIVE=0`, (2) RAG retrieval quality degrading as the vault grows because entries are embedded as whole documents rather than chunks -- mitigated by adding a similarity threshold and planning for chunking in v1.x, and (3) dependency on Ollama's free cloud tier (`qwen3.5:cloud`) which has no SLA -- mitigated by building the local model fallback path first, not as an afterthought.

## Key Findings

### Recommended Stack

The stack splits cleanly into two independent build targets: a Swift/SwiftUI iOS app and a TypeScript server addition to the existing codebase. The iOS side uses only one external dependency (WhisperKit for on-device transcription); everything else is built-in Apple frameworks. The server side adds Fastify for HTTP, the official `ollama` npm package, and a simple HTTP GET to SearXNG. Tailscale provides secure remote access without exposing anything publicly.

**Core technologies:**
- **WhisperKit (iOS):** On-device speech-to-text -- native Swift + CoreML, optimized for Apple Neural Engine, actively maintained
- **AVSpeechSynthesizer (iOS):** Text-to-speech -- free, on-device, no dependency, adequate quality for v1
- **Fastify v5 (server):** HTTP framework -- native TypeScript support, 2-3x faster than Express, modern plugin system
- **ollama npm (server):** Ollama client -- official TypeScript library, direct API for chat/generate/embed
- **SearXNG (server):** Web search -- self-hosted meta-search engine, JSON API, Docker deployment
- **Tailscale (networking):** Remote access -- encrypted WireGuard mesh, zero config, free for personal use

**Critical version requirements:** Node.js 20+ (Fastify v5), iOS 17+ (WhisperKit), Swift 5.10+

### Expected Features

**Must have (table stakes):**
- Push-to-talk voice recording with tap-to-start/stop
- On-device WhisperKit transcription with visual confirmation
- Mac Mini /ask API endpoint with RAG retrieval pipeline
- LLM answer generation via Ollama with text display and loading states
- Error handling with user-friendly messages and retry
- Capture flow via /capture endpoint (reuses existing pipeline)
- Response latency under 10 seconds end-to-end

**Should have (v1.x differentiators):**
- Text-to-speech toggle for hands-free use
- Source attribution showing which vault notes informed the answer
- LLM routing for hybrid brain + web search via SearXNG
- Remote access via Tailscale
- Transcription editing before send

**Defer (v2+):**
- Multi-turn conversation history
- Streaming responses (SSE/WebSocket)
- Siri Shortcuts integration
- Response history / search past answers

### Architecture Approach

The system follows a clean client-server split: the iOS app handles all audio (record, transcribe, speak) and sends only text over the network; the Mac Mini API server orchestrates retrieval and generation. The /ask pipeline uses a two-call LLM pattern -- a fast classification call (brain/web/both) followed by deterministic retrieval and a generation call with assembled context. The /capture endpoint reuses the existing VoiceProcessor pipeline with a new HTTP entry point. The API server is stateless per-request with no conversation history or session state.

**Major components:**
1. **iOS Audio/Transcription** -- AVAudioEngine recording + WhisperKit on-device STT, fully independent of server
2. **HTTP API Server** -- Fastify with /ask and /capture routes, request validation via Zod
3. **Query Router** -- Small LLM classification call to route questions to brain, web, or both retrieval paths
4. **RAG Search Pipeline** -- Embed query via nomic-embed-text, search Supabase pgvector, return ranked context
5. **LLM Answer Generator** -- Assemble context from retrieval sources, generate answer via Ollama with fallback
6. **SearXNG Client** -- Simple HTTP GET for web search results when route is "web" or "both"

### Critical Pitfalls

1. **8GB Mac Mini OOM** -- Embedding model + LLM + SearXNG Docker exceeds memory. Mitigate with `OLLAMA_KEEP_ALIVE=0`, sequential model loading, and a 3B local fallback instead of 7B.
2. **Audio format mismatch** -- iOS defaults to 44.1/48kHz AAC; WhisperKit needs 16kHz PCM. Misconfiguration produces garbage or hallucinated transcriptions. Configure AVAudioEngine explicitly with 16kHz mono from the start.
3. **RAG retrieves irrelevant context** -- Whole-document embeddings match on surface similarity, LLM confabulates from bad context. Add similarity threshold (0.7+), include metadata in context, plan for chunking.
4. **Ollama cloud model has no SLA** -- `qwen3.5:cloud` could disappear or rate-limit without warning. Build local fallback first; test both model paths with identical prompts.
5. **AVSpeechSynthesizer cuts off long text** -- Known iOS bug. Split responses into sentence-level utterances, use system default voices, implement a watchdog timer.

## Implications for Roadmap

Based on combined research, the project has a clear dependency chain that dictates build order. The architecture research identifies 11 sequential build items with one parallelizable track (iOS audio/transcription). Here is the recommended phase structure:

### Phase 1: Server Foundation
**Rationale:** Everything depends on the HTTP API server existing. The iOS app, RAG pipeline, and all features are blocked without it. This phase establishes the skeleton that all subsequent work plugs into.
**Delivers:** Running Fastify server with stubbed /ask and /capture endpoints, Ollama client wrapper with fallback logic, SearXNG Docker deployment, basic auth middleware, Zod request validation.
**Addresses features:** HTTP API server (P1), error handling foundation (P1)
**Avoids pitfalls:** Hardcoded model names (use config), no request timeouts (add 30s timeout), no authentication (add bearer token from day one), Ollama cloud dependency (build local fallback first)

### Phase 2: RAG Pipeline and Ask Endpoint
**Rationale:** The RAG pipeline is the core differentiator -- "answers from YOUR notes." It depends on the Ollama client (Phase 1) and existing Supabase/embeddings infrastructure. The query router, retrieval, and generation must be built and tuned together.
**Delivers:** Working /ask endpoint that embeds a query, searches Supabase pgvector, assembles context, and generates an answer via Ollama. Query router classifies brain/web/both. Source metadata returned in response.
**Addresses features:** RAG retrieval pipeline (P1), LLM answer generation (P1), source attribution (P2)
**Avoids pitfalls:** RAG retrieval quality (add similarity threshold, metadata prefixing), OOM on Mac Mini (sequential model loading, memory monitoring)

### Phase 3: iOS App
**Rationale:** The iOS app has no server dependency for its core audio/transcription work (WhisperKit runs on-device). Audio recording and transcription can be developed in parallel with Phases 1-2, but the full end-to-end flow requires a working /ask endpoint. This phase builds the complete iOS client.
**Delivers:** SwiftUI app with push-to-talk recording, WhisperKit transcription, API client connecting to Mac Mini, response display with loading states, capture mode.
**Addresses features:** Push-to-talk recording (P1), on-device transcription (P1), text response display (P1), loading indicators (P1), ask/capture mode toggle (P1)
**Avoids pitfalls:** Audio format mismatch (configure 16kHz PCM explicitly), CoreML memory leaks (use Metal or implement memory watchdog), recording tap sound (200ms trim)

### Phase 4: Enhancements
**Rationale:** These features add significant value but are independent of the core ask/answer loop. Each can be built and shipped independently once Phases 1-3 are stable.
**Delivers:** TTS response readback, SearXNG web search integration wired to query router, Tailscale remote access, transcription editing.
**Addresses features:** TTS toggle (P2), hybrid brain+web search (P2), remote access (P2), transcription editing (P2)
**Avoids pitfalls:** AVSpeechSynthesizer long-text cutoff (sentence splitting), SearXNG engine rate limiting (configure 5-8 engines, not all defaults), Tailscale vs Cloudflare choice (use Tailscale for private mesh)

### Phase Ordering Rationale

- **Server before iOS** because the iOS app is a thin client -- its value is zero without a working backend. The server is the critical path.
- **RAG before web search** because personal knowledge grounding is the core differentiator. Brain-only search is already valuable; web search is an enhancement.
- **iOS audio/transcription can overlap with server phases** since WhisperKit has no server dependency. The roadmapper should consider starting iOS audio work during Phase 1.
- **TTS and remote access are independent enhancements** that can ship in any order after the core loop works. Grouping them avoids context-switching during critical-path phases.
- **Authentication must be in Phase 1**, not deferred. Retrofitting auth is a medium-cost recovery per pitfalls research.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (RAG Pipeline):** The similarity threshold tuning and context assembly prompt engineering require experimentation. The existing embedding strategy (whole documents) may need re-evaluation. Research the `match_context_entries` RPC function signature and current embedding dimensions.
- **Phase 3 (iOS App):** WhisperKit integration has specific memory and audio format pitfalls that need hands-on validation. The CoreML vs Metal decision for whisper acceleration needs profiling on the target iPhone.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Server Foundation):** Fastify setup, Ollama client, Docker SearXNG -- all well-documented with official guides and examples.
- **Phase 4 (Enhancements):** AVSpeechSynthesizer, Tailscale setup, SearXNG query integration -- established patterns with known workarounds for pitfalls.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies have official docs, active maintenance, and verified version compatibility. WhisperKit v0.16.0, Fastify v5.8, ollama v0.6.3 all current as of March 2026. |
| Features | MEDIUM-HIGH | Feature priorities are clear and well-reasoned. Competitor analysis confirms the differentiation axis (personal knowledge grounding). Latency target (<10s) needs validation on actual hardware. |
| Architecture | HIGH | Two-call LLM routing pattern is well-documented. Data flow is straightforward request/response. Build order dependencies are clear. Existing codebase services are already proven. |
| Pitfalls | MEDIUM-HIGH | Pitfalls sourced from GitHub issues, Apple Developer Forums, and community reports. CoreML memory leak and AVSpeechSynthesizer bugs are well-documented. 8GB memory pressure is the highest-uncertainty risk -- needs empirical validation. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **8GB memory budget:** No empirical data on actual memory consumption of the full stack (Ollama + SearXNG Docker + Node.js + macOS). Needs load testing in Phase 1 before committing to 7B local fallback vs 3B.
- **WhisperKit vs whisper.cpp:** Research references both. STACK.md recommends WhisperKit (native Swift + CoreML/ANE). PITFALLS.md discusses whisper.cpp CoreML memory leaks. Clarify: WhisperKit uses its own CoreML pipeline, not whisper.cpp. Verify WhisperKit does not share the same memory leak.
- **Ollama cloud model availability:** `qwen3.5:cloud` rate limits are undocumented. No way to predict when or how hard they throttle. Must validate during Phase 1 and have the local fallback ready.
- **Existing `match_context_entries` RPC:** The current function's similarity threshold behavior and return format need inspection before building the RAG pipeline. May need modification to support relevance filtering.
- **Prompt engineering for routing and generation:** The two-call LLM pattern depends on prompt quality. Routing accuracy with a small/fast model needs empirical testing. No research can substitute for hands-on prompt iteration.

## Sources

### Primary (HIGH confidence)
- [WhisperKit GitHub](https://github.com/argmaxinc/WhisperKit) -- v0.16.0, Swift SPM, CoreML optimized
- [Fastify Official](https://fastify.dev/) -- v5.8.1, TypeScript docs, plugin system
- [Ollama API docs](https://github.com/ollama/ollama/blob/main/docs/api.md) -- generate, chat, embed endpoints
- [SearXNG Search API](https://docs.searxng.org/dev/search_api.html) -- JSON format, query parameters
- [Apple AVSpeechSynthesizer docs](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer)

### Secondary (MEDIUM confidence)
- [whisper.cpp CoreML memory leak -- Issues #1202, #797](https://github.com/ggml-org/whisper.cpp/issues/1202) -- verified bug, unclear if WhisperKit shares it
- [AVSpeechSynthesizer iOS 17 regression -- Apple Forums](https://developer.apple.com/forums/thread/738048) -- confirmed by multiple developers
- [RAG query routing patterns -- Towards Data Science](https://towardsdatascience.com/rags-with-query-routing-5552e4e41c54/) -- classifier-based routing
- [Tailscale vs Cloudflare comparison](https://tailscale.com/compare/cloudflare-access)
- [Ollama VRAM requirements](https://localllm.in/blog/ollama-vram-requirements-for-local-llms)

### Tertiary (LOW confidence)
- Ollama cloud free tier rate limits -- undocumented, inferred from community reports
- 8GB Mac Mini memory budget estimates -- calculated, not measured on this specific workload

---
*Research completed: 2026-03-06*
*Ready for roadmap: yes*
