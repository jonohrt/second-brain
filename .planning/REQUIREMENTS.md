# Requirements: Second Brain LLM Conversational Interface

**Defined:** 2026-03-06
**Core Value:** Ask a question by voice from anywhere and get an answer grounded in your personal knowledge base and the web — hands-free, free of cost.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Voice Input

- [x] **VOICE-01**: User can press and hold to record audio with visual feedback
- [x] **VOICE-02**: Audio is transcribed on-device via WhisperKit (base model)
- [x] **VOICE-03**: User sees a loading indicator while waiting for server response
- [x] **VOICE-04**: User can edit transcribed text before sending to server

### Response Display

- [x] **RESP-01**: User sees LLM answer as scrollable text
- [x] **RESP-02**: User sees error messages with a retry button when requests fail
- [x] **RESP-03**: User can toggle TTS to have responses read aloud (AVSpeechSynthesizer, sentence-split)
- [x] **RESP-04**: User sees which vault notes informed the answer (source attribution)

### Ask Pipeline

- [x] **ASK-01**: /ask endpoint accepts text and returns text response with sources
- [x] **ASK-02**: RAG retrieves relevant context from Supabase vector search with relevance threshold
- [x] **ASK-03**: LLM routing classifies question as brain/web/both via two-call approach
- [x] **ASK-04**: SearXNG web search returns results for general knowledge questions
- [x] **ASK-05**: LLM generates answer grounded in retrieved context (qwen3.5:cloud via Ollama)
- [x] **ASK-06**: Falls back to local 7B model when cloud model is unavailable

### Capture Pipeline

- [x] **CAP-01**: /capture endpoint accepts text and runs existing voice processor pipeline
- [x] **CAP-02**: Returns confirmation with title and vault path

### Infrastructure

- [x] **INFRA-01**: Fastify HTTP server with /health endpoint
- [x] **INFRA-02**: Bearer token authentication on all API endpoints
- [x] **INFRA-03**: SearXNG running via Docker with JSON API enabled
- [x] **INFRA-04**: API server accessible remotely via Tailscale (already installed)
- [x] **INFRA-05**: Sequential Ollama model loading to fit 8GB RAM

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Conversation

- **CONV-01**: Multi-turn conversation with context carry-over
- **CONV-02**: Conversation history persisted and searchable

### Response Enhancements

- **RENH-01**: Streaming responses (token-by-token display)
- **RENH-02**: Response history (past Q&A accessible in app)

### Voice Enhancements

- **VENH-01**: Waveform visualization during recording
- **VENH-02**: Continuous listening mode (auto-detect speech end)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Android app | iOS only for personal use |
| Paid APIs (OpenAI, Claude) | Must be $0 operating cost |
| Always-listening / wake word | Explicit button press, not ambient |
| Push notifications | App is open when in use |
| Real-time streaming | Simple request/response sufficient for v1 |
| Multi-turn conversation | Each question is independent for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| VOICE-01 | Phase 3 | Complete |
| VOICE-02 | Phase 3 | Complete |
| VOICE-03 | Phase 3 | Complete |
| VOICE-04 | Phase 3 | Complete |
| RESP-01 | Phase 3 | Complete |
| RESP-02 | Phase 3 | Complete |
| RESP-03 | Phase 4 | Complete |
| RESP-04 | Phase 4 | Complete |
| ASK-01 | Phase 2 | Complete |
| ASK-02 | Phase 2 | Complete |
| ASK-03 | Phase 2 | Complete |
| ASK-04 | Phase 2 | Complete |
| ASK-05 | Phase 2 | Complete |
| ASK-06 | Phase 2 | Complete |
| CAP-01 | Phase 1 | Complete |
| CAP-02 | Phase 1 | Complete |
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Complete |
| INFRA-05 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-03-06*
*Last updated: 2026-03-06 after roadmap creation*
