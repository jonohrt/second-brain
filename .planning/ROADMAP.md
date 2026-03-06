# Roadmap: Second Brain LLM Conversational Interface

## Overview

This roadmap delivers a voice-powered iOS app backed by a self-hosted Mac Mini API server. The build order follows the dependency chain: the HTTP server and capture endpoint first (everything depends on the server existing), then the RAG-powered ask pipeline (the core intelligence), then the iOS client (thin client over a working API), and finally enhancements like TTS and source attribution. Each phase delivers a testable, end-to-end capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Server Foundation** - Fastify HTTP server with auth, SearXNG deployment, capture endpoint, and Ollama client with fallback
- [ ] **Phase 2: Ask Pipeline** - RAG retrieval, LLM routing, web search integration, and answer generation via /ask endpoint
- [ ] **Phase 3: iOS App** - SwiftUI client with push-to-talk recording, WhisperKit transcription, API integration, and response display
- [ ] **Phase 4: Enhancements** - Text-to-speech readback and source attribution display in the iOS app

## Phase Details

### Phase 1: Server Foundation
**Goal**: A running HTTP API server that can receive requests from the iOS app, authenticate them, capture thoughts into the existing vault pipeline, and manage Ollama models within 8GB RAM
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, CAP-01, CAP-02
**Success Criteria** (what must be TRUE):
  1. Sending a GET to /health returns a success response over the local network
  2. Sending a POST to /capture with valid auth token and text body returns a confirmation with note title and vault path
  3. Sending a request without a valid bearer token returns 401 on all protected endpoints
  4. SearXNG returns JSON search results when queried via its local API
  5. The server is reachable from an iPhone on the same Tailscale network
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: Ask Pipeline
**Goal**: Users can send a text question and receive an LLM-generated answer grounded in their vault notes and/or web search results, with automatic fallback when the cloud model is unavailable
**Depends on**: Phase 1
**Requirements**: ASK-01, ASK-02, ASK-03, ASK-04, ASK-05, ASK-06
**Success Criteria** (what must be TRUE):
  1. Sending a question about content known to be in the vault returns an answer that references that content
  2. Sending a general knowledge question routes to web search and returns an answer with web-sourced information
  3. The /ask response includes a list of source vault note paths when brain search was used
  4. When qwen3.5:cloud is unavailable, the endpoint still returns an answer using the local fallback model
  5. End-to-end /ask response completes within 15 seconds on the local network
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: iOS App
**Goal**: Users can hold a button to speak a question or thought, see it transcribed on-device, optionally edit it, send it to the Mac Mini, and read the response -- all from their iPhone
**Depends on**: Phase 2
**Requirements**: VOICE-01, VOICE-02, VOICE-03, VOICE-04, RESP-01, RESP-02
**Success Criteria** (what must be TRUE):
  1. User can press and hold a button to record audio, with visual feedback indicating recording is active
  2. After releasing the button, spoken audio is transcribed to text on-device without network access
  3. User can edit the transcribed text before sending it to the server
  4. After sending a question, a loading indicator is visible until the response arrives
  5. The LLM response displays as scrollable text, and failed requests show an error with a retry button
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Enhancements
**Goal**: Users can listen to responses hands-free and see which vault notes informed the answer
**Depends on**: Phase 3
**Requirements**: RESP-03, RESP-04
**Success Criteria** (what must be TRUE):
  1. User can toggle TTS on and the app reads the response aloud, splitting long text into sentences to avoid cutoff
  2. When the answer was informed by vault notes, the response screen shows the note titles/paths that were used
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Server Foundation | 0/2 | Not started | - |
| 2. Ask Pipeline | 0/2 | Not started | - |
| 3. iOS App | 0/2 | Not started | - |
| 4. Enhancements | 0/1 | Not started | - |
