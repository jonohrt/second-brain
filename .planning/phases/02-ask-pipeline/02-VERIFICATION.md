---
phase: 02-ask-pipeline
verified: 2026-03-06T13:32:00Z
status: passed
score: 13/13 must-haves verified
---

# Phase 2: Ask Pipeline Verification Report

**Phase Goal:** Build the Ask Pipeline -- classify, retrieve, generate flow with /ask endpoint
**Verified:** 2026-03-06T13:32:00Z
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | OllamaChatService can send a chat request and return the response content | VERIFIED | `src/services/ollama-chat.ts:30-66` -- chat() sends POST to /api/chat with stream:false, returns { content, model }. 3 tests cover happy path, error, and timeout. |
| 2 | OllamaChatService falls back to local model when cloud model fails | VERIFIED | `src/services/ollama-chat.ts:68-78` -- chatWithFallback() catches cloud error, retries with localModel. Test verifies first call uses cloud, second uses local. |
| 3 | OllamaChatService enforces timeouts via AbortController | VERIFIED | `src/services/ollama-chat.ts:36-37` -- AbortController with configurable timeout, clearTimeout in finally block. Test with 50ms timeout confirms abort. |
| 4 | SearxngService queries SearXNG and returns parsed results | VERIFIED | `src/services/searxng.ts:12-39` -- fetch GET with URLSearchParams (q, format=json, categories), maps and slices results. 7 tests cover happy path, empty, error, limit, categories. |
| 5 | SupabaseService.searchWithScores returns entries with similarity scores above threshold | VERIFIED | `src/services/supabase.ts:136-157` -- calls match_context_entries RPC, filters by threshold (default 0.65), maps to { entry, similarity }. 6 tests cover threshold, custom threshold, errors, empty. |
| 6 | User can send a question to /ask and receive an LLM-generated answer | VERIFIED | `src/server/routes/ask.ts:12-34` -- POST /ask validates with Zod, calls askPipeline.ask(), returns { answer, sources, route, model }. Integration test confirms 200 with valid payload. |
| 7 | Answer includes source vault paths when brain search was used | VERIFIED | `src/services/ask-pipeline.ts:91-97` -- brain results mapped to { type: 'vault', path: entry.vaultPath, title, similarity }. Unit test asserts vault source with path. |
| 8 | Answer includes web URLs when web search was used | VERIFIED | `src/services/ask-pipeline.ts:98-102` -- web results mapped to { type: 'web', url, title }. Unit test asserts web source with URL. |
| 9 | Questions about vault content route through brain search and return vault sources | VERIFIED | `tests/services/ask-pipeline.test.ts:45-83` -- brain route test: classify->brain, embed->vector, searchWithScores->results, chatWithFallback->answer. embed called, searxng NOT called. |
| 10 | General questions route through web search and return web sources | VERIFIED | `tests/services/ask-pipeline.test.ts:85-109` -- web route test: classify->web, searxng.search->results. embed NOT called, supabase NOT called. |
| 11 | Pipeline falls back from brain to web when no vault results pass threshold | VERIFIED | `src/services/ask-pipeline.ts:63-65` -- if route=brain and brainResults empty, route upgrades to "web". Test confirms searxng.search IS called after empty searchWithScores. |
| 12 | POST /ask returns 400 for missing or empty text | VERIFIED | `src/server/routes/ask.ts:5-6` -- Zod schema `z.string().min(1)`. Two integration tests: empty body -> 400, empty string -> 400. |
| 13 | POST /ask returns 401 without auth token | VERIFIED | `tests/server/ask.test.ts:61-71` -- test confirms 401 without authorization header. Server registers ask route in auth-protected scope. |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/ollama-chat.ts` | Ollama chat wrapper with fallback | VERIFIED | 99 lines. Exports OllamaChatService with chat, chatWithFallback, classify. Uses fetch + AbortController. |
| `src/services/searxng.ts` | SearXNG web search client | VERIFIED | 40 lines. Exports SearxngService with search(). Parses JSON results, respects limit. |
| `src/services/supabase.ts` | searchWithScores method added | VERIFIED | searchWithScores at line 136. Calls match_context_entries RPC, filters by threshold 0.65 default. |
| `src/services/ask-pipeline.ts` | AskPipeline orchestrator | VERIFIED | 157 lines. Exports AskPipeline, AskResult, AskConfig, Source. Full classify->retrieve->generate flow with fallback. |
| `src/server/routes/ask.ts` | /ask POST route handler | VERIFIED | 35 lines. Exports askRoutes. Zod validation, error handling, calls askPipeline.ask(). |
| `src/server/index.ts` | Server wiring with ask route | VERIFIED | Imports OllamaChatService, SearxngService, AskPipeline. buildAskPipeline() at line 37. askRoutes registered in protected scope at line 64. |
| `tests/services/ollama-chat.test.ts` | Unit tests for chat + fallback | VERIFIED | 9 tests covering chat, error, timeout, fallback, classify, parse failure. |
| `tests/services/searxng.test.ts` | Unit tests for search parsing | VERIFIED | 7 tests covering search, empty, missing results, error, limit, default limit, categories. |
| `tests/services/ask-pipeline.test.ts` | Unit tests for pipeline orchestration | VERIFIED | 7 tests: brain route, web route, both route, brain-to-web fallback, embeddings failure fallback, model name, both-sources-fail. |
| `tests/server/ask.test.ts` | Integration tests for /ask endpoint | VERIFIED | 5 tests: valid 200, empty body 400, empty text 400, no auth 401, pipeline error 500. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ask-pipeline.ts` | `ollama-chat.ts` | classify() and chatWithFallback() calls | WIRED | Line 50: `this.ollamaChat.classify(question)`, Line 88: `this.ollamaChat.chatWithFallback(messages)` |
| `ask-pipeline.ts` | `searxng.ts` | search() call for web route | WIRED | Line 76: `this.searxng.search(question, { limit })` |
| `ask-pipeline.ts` | `supabase.ts` | searchWithScores() call for brain route | WIRED | Line 57: `this.supabase.searchWithScores(embedding, { threshold, limit })` |
| `ask-pipeline.ts` | `embeddings.ts` | embed() call to vectorize query | WIRED | Line 56: `this.embeddings.embed(question)` |
| `routes/ask.ts` | `ask-pipeline.ts` | askPipeline.ask() call | WIRED | Line 23: `askPipeline.ask(parsed.data.text)` |
| `server/index.ts` | `routes/ask.ts` | Route registration in protected scope | WIRED | Line 11: import askRoutes, Line 64: `scoped.register(askRoutes, { askPipeline })` |
| `ollama-chat.ts` | Ollama /api/chat | fetch with AbortController timeout | WIRED | Line 40: `fetch(\`${this.baseUrl}/api/chat\`, ...)` with AbortController signal |
| `searxng.ts` | SearXNG /search | fetch with format=json | WIRED | Line 22: `fetch(\`${this.baseUrl}/search?${params}\`)` with format=json in URLSearchParams |
| `supabase.ts` | match_context_entries RPC | rpc call with threshold filter | WIRED | Line 140: `this.client.rpc('match_context_entries', {...})` with threshold filtering at line 150 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ASK-01 | 02-02 | /ask endpoint accepts text and returns text response with sources | SATISFIED | `src/server/routes/ask.ts` POST handler returns { answer, sources, route, model }. Integration tests confirm 200 response. |
| ASK-02 | 02-01, 02-02 | RAG retrieves relevant context from Supabase vector search with relevance threshold | SATISFIED | `supabase.ts:searchWithScores()` with threshold 0.65 default. Used by AskPipeline for brain/both routes. |
| ASK-03 | 02-01 | LLM routing classifies question as brain/web/both | SATISFIED | `ollama-chat.ts:classify()` sends routing system prompt, parses JSON, validates route, defaults to "both". |
| ASK-04 | 02-01 | SearXNG web search returns results for general knowledge questions | SATISFIED | `searxng.ts:search()` queries SearXNG JSON API with categories and limit. Used by AskPipeline for web/both routes. |
| ASK-05 | 02-02 | LLM generates answer grounded in retrieved context (qwen3.5:cloud via Ollama) | SATISFIED | `ask-pipeline.ts:88` calls chatWithFallback with context-assembled system prompt. buildGenerationPrompt includes vault notes and web results. |
| ASK-06 | 02-01 | Falls back to local 7B model when cloud model is unavailable | SATISFIED | `ollama-chat.ts:68-78` chatWithFallback catches cloud error, retries with local model. Server wires cloud='qwen3.5:cloud', local='qwen2.5:7b'. |

No orphaned requirements found. All 6 ASK requirements mapped to Phase 2 in REQUIREMENTS.md traceability table are covered by plans 01 and 02.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No TODOs, FIXMEs, placeholders, or stub implementations found in any phase 2 artifacts |

### Human Verification Required

### 1. End-to-End Ask Flow with Live Services

**Test:** Start the server with Ollama, SearXNG, and Supabase running. Send a POST to /ask with a real question about vault content.
**Expected:** Response includes answer grounded in vault notes with source attribution. Model field reflects actual model used.
**Why human:** Requires live Ollama, SearXNG, and Supabase services. Integration tests use mocks.

### 2. Cloud-to-Local Fallback Under Real Conditions

**Test:** Stop the cloud model (qwen3.5:cloud) and send a question. Verify the response comes from qwen2.5:7b.
**Expected:** Answer returned with model field showing "qwen2.5:7b". Response quality acceptable from smaller model.
**Why human:** Requires controlling model availability on live Ollama instance.

### 3. Brain-to-Web Fallback with Real Data

**Test:** Ask a question about something NOT in the vault.
**Expected:** Pipeline classifies as "brain", finds no results above 0.65 threshold, falls back to web search. Response includes web URL sources.
**Why human:** Requires real vector search results to verify threshold behavior with actual embeddings.

### Gaps Summary

No gaps found. All 13 observable truths verified. All 10 artifacts pass existence, substantive, and wiring checks. All 9 key links confirmed wired. All 6 requirements (ASK-01 through ASK-06) satisfied. No anti-patterns detected. 95 tests pass (1 pre-existing failure in unrelated git.test.ts).

---

_Verified: 2026-03-06T13:32:00Z_
_Verifier: Claude (gsd-verifier)_
