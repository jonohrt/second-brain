# Architecture Research

**Domain:** Voice-powered LLM assistant (iOS app + self-hosted Mac Mini backend)
**Researched:** 2026-03-06
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         iOS App (Swift/SwiftUI)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ AVAudioEngine│  │  WhisperKit  │  │  AVSpeechSynthesizer      │ │
│  │ (recording)  │──│ (on-device   │  │  (text-to-speech)         │ │
│  │              │  │  transcribe) │  │                           │ │
│  └──────────────┘  └──────┬───────┘  └───────────────────────────┘ │
│                           │ transcript text                        │
│  ┌────────────────────────┴──────────────────────────────────────┐ │
│  │            APIClient (URLSession, async/await)                │ │
│  │            POST /ask  |  POST /capture                       │ │
│  └──────────────────────────┬────────────────────────────────────┘ │
└─────────────────────────────┼───────────────────────────────────────┘
                              │ HTTPS (Tailscale / Cloudflare Tunnel)
┌─────────────────────────────┼───────────────────────────────────────┐
│                    Mac Mini API Server (TypeScript)                  │
│  ┌──────────────────────────┴────────────────────────────────────┐  │
│  │                    HTTP Router (Hono/Express)                  │  │
│  │                    POST /ask  |  POST /capture                │  │
│  └──────┬───────────────────────────────────────┬────────────────┘  │
│         │                                       │                   │
│  ┌──────┴──────┐                        ┌───────┴───────┐          │
│  │  AskPipeline │                       │ CapturePipeline│          │
│  │             │                        │               │          │
│  │  1. Route   │                        │ Reuse existing│          │
│  │  2. Retrieve│                        │ VoiceProcessor│          │
│  │  3. Generate│                        │ pipeline      │          │
│  └──┬──┬──┬────┘                        └───────────────┘          │
│     │  │  │                                                         │
│  ┌──┴┐┌┴──┴──┐┌──────────┐                                         │
│  │LLM││RAG   ││SearXNG   │                                         │
│  │Svc││Search││Client    │                                         │
│  └─┬─┘└──┬───┘└────┬─────┘                                         │
│    │     │         │                                                │
├────┼─────┼─────────┼────────────────────────────────────────────────┤
│    │     │         │        External Services (localhost)           │
│ ┌──┴─────┴──┐  ┌───┴──────────┐  ┌────────────────────┐           │
│ │  Ollama   │  │  SearXNG     │  │  Supabase          │           │
│ │  :11434   │  │  (Docker)    │  │  (cloud/pgvector)  │           │
│ │ qwen3.5   │  │  :8080       │  │                    │           │
│ │ nomic-emb │  └──────────────┘  └────────────────────┘           │
│ └───────────┘                                                      │
│                                                                     │
│ ┌───────────────────────────────────────────────────────────────┐   │
│ │                    Existing Second Brain                       │   │
│ │  VaultService | SupabaseService | EmbeddingsService           │   │
│ │  VoiceProcessor | WhisperService | ProcessedTracker           │   │
│ └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| iOS Audio Capture | Record voice via microphone, manage audio session | AVAudioEngine with tap on input node, PCM float buffer |
| WhisperKit (on-device STT) | Transcribe audio to text entirely on-device | WhisperKit SPM package, base.en model (~142MB) |
| iOS APIClient | Send transcript text to Mac Mini, receive answer | URLSession async/await, JSON Codable request/response |
| iOS TTS | Read answers aloud when toggled on | AVSpeechSynthesizer (free, on-device) |
| HTTP API Server | Accept /ask and /capture requests, orchestrate pipelines | Lightweight HTTP framework (Hono or bare http module) |
| Query Router | Classify question as brain-only, web-only, or both | Small LLM call via Ollama with classification prompt |
| RAG Search | Embed query, search Supabase pgvector, return context chunks | Existing EmbeddingsService + SupabaseService.searchByEmbedding |
| SearXNG Client | Fetch web search results for web-routed questions | HTTP GET to localhost SearXNG with format=json |
| LLM Answer Generator | Generate answer from retrieved context + question | Ollama /api/generate with qwen3.5:cloud, local 7B fallback |
| Capture Pipeline | Save transcribed thoughts to vault + Supabase | Existing VoiceProcessor pipeline (minus audio transcription) |

## Recommended Project Structure

### New server code (added to existing codebase)

```
src/
├── api/                    # NEW: HTTP API server
│   ├── server.ts           # Hono/Express app with /ask and /capture routes
│   ├── routes/
│   │   ├── ask.ts          # /ask endpoint handler
│   │   └── capture.ts      # /capture endpoint handler
│   └── middleware/
│       └── auth.ts         # Shared-secret auth (Tailscale handles network security)
├── llm/                    # NEW: LLM orchestration
│   ├── router.ts           # Classify questions (brain/web/both)
│   ├── generator.ts        # Generate answers with context
│   └── ollama-client.ts    # Typed Ollama HTTP client (generate + chat + embed)
├── search/                 # NEW: Search integrations
│   ├── rag.ts              # RAG pipeline: embed query → vector search → rank
│   └── searxng.ts          # SearXNG JSON API client
├── services/               # EXISTING: unchanged
│   ├── embeddings.ts
│   ├── supabase.ts
│   ├── vault.ts
│   └── ...
├── mcp/                    # EXISTING: unchanged
├── hooks/                  # EXISTING: unchanged
├── voice/                  # EXISTING: unchanged
├── cli.ts                  # EXISTING: add start-api command
├── index.ts                # EXISTING: unchanged
├── config.ts               # EXISTING: extend with api + searxng config
└── types.ts                # EXISTING: extend with AskRequest/AskResponse types
```

### iOS app (separate Xcode project)

```
SecondBrain/
├── SecondBrainApp.swift         # App entry point
├── Models/
│   ├── AskRequest.swift         # Codable request model
│   ├── AskResponse.swift        # Codable response model
│   └── AppState.swift           # Observable app state
├── Services/
│   ├── AudioRecorder.swift      # AVAudioEngine wrapper
│   ├── Transcriber.swift        # WhisperKit wrapper
│   ├── APIClient.swift          # URLSession HTTP client
│   └── SpeechPlayer.swift       # AVSpeechSynthesizer wrapper
├── Views/
│   ├── ContentView.swift        # Main view with record/ask/capture buttons
│   ├── ResponseView.swift       # Shows LLM answer
│   └── SettingsView.swift       # Server URL configuration
└── Resources/
    └── ggml-base.en.bin         # Whisper model (bundled or downloaded on first launch)
```

### Structure Rationale

- **src/api/:** Isolated from MCP server -- the HTTP API is a separate entry point with its own lifecycle. Keeps the existing MCP server and CLI unaffected.
- **src/llm/:** Separates LLM orchestration (routing, generation) from search/retrieval. The router and generator have different concerns and change for different reasons.
- **src/search/:** Groups all retrieval strategies (RAG vector search and SearXNG web search) behind a common interface so the generator does not care where context came from.
- **iOS app as separate project:** Swift/SwiftUI app has its own build system (Xcode). It communicates with the server only via HTTP -- no shared code, no monorepo coupling.

## Architectural Patterns

### Pattern 1: Two-Call LLM Routing

**What:** Use a small, fast LLM call to classify the question before the main generation call. The router returns one of three categories: `brain` (search personal knowledge base), `web` (search the internet), or `both` (search both, merge context).

**When to use:** When you have multiple retrieval sources and want the system to decide which to query without tool-use complexity.

**Trade-offs:** Adds one extra LLM round-trip (~200-500ms with a small model) but keeps the pipeline predictable, debuggable, and easy to tune. Avoids the complexity of tool-calling/agent loops which are hard to control on small models.

**Example:**
```typescript
// src/llm/router.ts
const ROUTE_PROMPT = `Classify this question. Reply with exactly one word: brain, web, or both.
- brain: personal knowledge, notes, past decisions, project context
- web: current events, general knowledge, how-to guides, documentation
- both: question that benefits from personal context AND web information

Question: {question}`;

async function routeQuestion(question: string): Promise<'brain' | 'web' | 'both'> {
  const response = await ollamaGenerate({
    model: 'qwen3.5:cloud',  // fast, follows instructions well
    prompt: ROUTE_PROMPT.replace('{question}', question),
    options: { temperature: 0, num_predict: 5 }
  });
  const route = response.trim().toLowerCase();
  if (['brain', 'web', 'both'].includes(route)) return route;
  return 'both'; // safe default
}
```

### Pattern 2: Retrieval-Augmented Generation with Context Assembly

**What:** Embed the question, search Supabase pgvector for relevant entries, optionally search SearXNG, then assemble a prompt with retrieved context and send to the LLM for answer generation.

**When to use:** Every /ask request. This is the core pipeline.

**Trade-offs:** Quality depends on embedding quality and chunk relevance. The existing nomic-embed-text embeddings are already in Supabase, so this leverages the existing infrastructure with zero additional setup.

**Example:**
```typescript
// src/llm/generator.ts
async function generateAnswer(
  question: string,
  brainContext: string[],
  webContext: string[]
): Promise<string> {
  const contextBlock = [
    brainContext.length ? `## From Your Notes\n${brainContext.join('\n\n')}` : '',
    webContext.length ? `## From the Web\n${webContext.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const prompt = `You are a helpful assistant. Answer the question using the provided context.
If the context doesn't contain the answer, say so.

${contextBlock}

Question: ${question}
Answer:`;

  return ollamaGenerate({ model: 'qwen3.5:cloud', prompt });
}
```

### Pattern 3: Graceful LLM Fallback

**What:** Try qwen3.5:cloud first (best quality, free via Ollama cloud routing). If it fails (rate limit, timeout), fall back to a local 7B model (e.g., qwen2.5:7b-instruct-q4_K_M).

**When to use:** Every LLM generation call. Cloud model is rate-limited so fallback is essential.

**Trade-offs:** Local 7B on 8GB RAM Mac Mini will be slower (~10-20 tokens/sec) and lower quality, but always available. The user gets a degraded but functional experience rather than an error.

**Example:**
```typescript
async function ollamaGenerateWithFallback(opts: GenerateOpts): Promise<string> {
  try {
    return await ollamaGenerate({ ...opts, model: 'qwen3.5:cloud' });
  } catch (err) {
    console.error('Cloud model failed, falling back to local:', err.message);
    return await ollamaGenerate({ ...opts, model: 'qwen2.5:7b-instruct-q4_K_M' });
  }
}
```

## Data Flow

### Ask Flow (primary use case)

```
[User taps "Ask" button on iPhone]
    |
    v
[AVAudioEngine records PCM audio]
    |
    v
[WhisperKit transcribes on-device] ──> transcript text
    |
    v
[APIClient sends POST /ask { text: "..." }]
    |
    v  (HTTPS over Tailscale)
[Mac Mini API Server receives request]
    |
    v
[Router classifies: brain / web / both]
    |
    ├── brain ──> EmbeddingsService.embed(query) ──> SupabaseService.searchByEmbedding()
    |                                                        |
    ├── web ───> SearXNG GET /search?q=...&format=json       |
    |                |                                       |
    ├── both ──> (parallel: brain search + web search)       |
    |                                                        |
    v                                                        v
[Context assembled: brain results + web results]
    |
    v
[LLM Generator: prompt with context + question ──> Ollama /api/generate]
    |
    v
[Response: { answer: "...", sources: [...] }]
    |
    v  (HTTPS response)
[iOS app displays answer text]
    |
    v (optional)
[AVSpeechSynthesizer reads answer aloud]
```

### Capture Flow (secondary use case)

```
[User taps "Capture" button on iPhone]
    |
    v
[AVAudioEngine records PCM audio]
    |
    v
[WhisperKit transcribes on-device] ──> transcript text
    |
    v
[APIClient sends POST /capture { text: "..." }]
    |
    v  (HTTPS over Tailscale)
[Mac Mini API Server receives request]
    |
    v
[Reuse existing pipeline: VaultService.writeEntry() + EmbeddingsService.embed() + SupabaseService.upsert()]
    |
    v
[Response: { success: true }]
```

### Key Data Flows

1. **Audio never leaves the iPhone.** WhisperKit transcribes on-device. Only text travels over the network. This reduces latency (no audio upload), saves bandwidth, and preserves privacy.

2. **The API server is stateless per-request.** No conversation history, no session state. Each /ask request is independent. This keeps the server simple and avoids memory pressure on the 8GB Mac Mini.

3. **Retrieval is parallel when route is "both."** Brain search (embed + pgvector) and web search (SearXNG HTTP) can run concurrently via Promise.all, minimizing total latency.

4. **Capture reuses the existing write path.** The /capture endpoint does exactly what VoiceProcessor already does after transcription: create a ContextEntry and persist to vault + Supabase. No new logic needed, just a new entry point.

## Integration Points

### Existing Services Reused Directly

| Existing Service | Used By | How |
|------------------|---------|-----|
| EmbeddingsService | RAG search pipeline | Embed the user's question for vector similarity search |
| SupabaseService | RAG search pipeline | searchByEmbedding() returns relevant context entries |
| VaultService | Capture pipeline | writeEntry() persists captured thoughts to Obsidian vault |
| Config | API server startup | Extended with api port, searxng URL, LLM model preferences |

### New External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Ollama /api/generate | HTTP POST to localhost:11434 | Already running for embeddings. Add generate calls for routing + answer generation. |
| SearXNG | HTTP GET to localhost:8080/search?format=json | Must enable JSON format in SearXNG settings.yaml. Docker Compose alongside existing services. |
| Tailscale / Cloudflare Tunnel | Network tunnel for remote access | iOS app connects to Mac Mini's Tailscale IP or tunnel URL. No code changes -- transparent to the HTTP server. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| iOS App <-> API Server | HTTP JSON (POST /ask, POST /capture) | Simple request/response. No WebSocket, no streaming for v1. |
| API Server <-> Ollama | HTTP JSON (localhost) | Two calls per /ask: one route classification, one answer generation. Plus one embed call for RAG. |
| API Server <-> SearXNG | HTTP JSON (localhost) | Only called when route is "web" or "both". |
| API Server <-> Supabase | Supabase JS client (existing) | Only for vector search. Same client already in use. |
| API Server <-> Vault | Filesystem (existing) | Only for /capture. Same VaultService already in use. |

## Scaling Considerations

This is a single-user personal system. "Scaling" means performance on constrained hardware.

| Concern | Current (8GB Mac Mini) | If Slow |
|---------|------------------------|---------|
| LLM generation latency | qwen3.5:cloud is fast (cloud-routed). Local 7B: ~10-20 tok/sec. | Accept local model is slower. Could upgrade to 16GB Mac Mini for larger models. |
| Concurrent requests | Single user, so 1 request at a time is fine. | Ollama queues requests natively. No need for request pooling. |
| Embedding generation | nomic-embed-text is small and fast (~50ms per embed). | Not a bottleneck. |
| SearXNG response time | Meta-search depends on upstream engines. Usually 1-3 seconds. | Set a timeout (5s) and proceed without web results if slow. |
| Whisper on iPhone | base.en model: ~1-2 seconds for 10-second audio on modern iPhone. | Could use tiny.en for faster but lower quality. |

### What Breaks First

1. **Cloud model rate limits** -- qwen3.5:cloud will throttle on heavy use. The fallback to local 7B handles this. Monitor how often fallback triggers.
2. **Memory pressure** -- Running a local 7B model on 8GB RAM alongside Ollama embedding model and SearXNG Docker container. May need to unload models between uses (Ollama does this automatically with `OLLAMA_KEEP_ALIVE`).

## Anti-Patterns

### Anti-Pattern 1: Streaming Audio to Server for Transcription

**What people do:** Send raw audio from iOS to the backend for server-side Whisper transcription.
**Why it's wrong:** Adds 1-5 seconds of upload latency for audio files, requires audio codec handling on the server, wastes bandwidth, and provides worse UX than on-device transcription.
**Do this instead:** Use WhisperKit on-device. Send only the transcript text to the server. Audio never leaves the phone.

### Anti-Pattern 2: Agent/Tool-Use Loops for Routing

**What people do:** Give the LLM tools (search_brain, search_web) and let it decide via tool calls in a loop.
**Why it's wrong:** Small local models are unreliable at tool-use. Agent loops are unpredictable in latency (1-5+ LLM calls). Hard to debug. Overkill for a system with exactly two retrieval sources.
**Do this instead:** Use a single classification call (brain/web/both) followed by deterministic retrieval. Predictable, fast, debuggable.

### Anti-Pattern 3: Building a Custom HTTP Framework

**What people do:** Build request routing, middleware, JSON parsing from scratch with Node's http module.
**Why it's wrong:** Wastes time on solved problems. Error handling, content-type parsing, and CORS are tedious to get right.
**Do this instead:** Use Hono (lightweight, TypeScript-first, fast) or Express. Hono is preferred: smaller, faster, better TypeScript types, works with Node.

### Anti-Pattern 4: Shared Codebase Between iOS and Server

**What people do:** Try to share TypeScript types or models between Swift iOS app and TypeScript server via code generation or monorepo tooling.
**Why it's wrong:** Swift and TypeScript are different ecosystems. Code generation adds tooling complexity. The API surface is small (2 endpoints) -- maintaining matching Codable structs in Swift is trivial.
**Do this instead:** Define the JSON contract once in documentation. Implement Codable models in Swift and TypeScript types independently. The contract is simple enough that drift is not a realistic risk.

### Anti-Pattern 5: Overcomplicating the iOS UI

**What people do:** Build complex navigation, multiple screens, conversation history, settings panels.
**Why it's wrong:** This is a voice-first utility app. The user presses a button, speaks, and gets an answer. Complex UI adds development time without adding value.
**Do this instead:** Single screen with three controls: Ask button, Capture button, text/speech toggle. Show the latest response below. That is the entire UI for v1.

## Build Order (Dependencies)

The components have clear dependency ordering that should inform phase structure:

```
1. HTTP API Server skeleton (routes, middleware)
   └── No dependencies on new code. Can stub responses.

2. Ollama client (typed wrapper for /api/generate and /api/embed)
   └── Depends on: Ollama running (already is)

3. SearXNG deployment + client
   └── Depends on: Docker (already available). Independent of other new code.

4. Query Router (classify brain/web/both)
   └── Depends on: Ollama client (#2)

5. RAG pipeline (embed query → vector search → return context)
   └── Depends on: Existing EmbeddingsService + SupabaseService (already built)

6. LLM Answer Generator (assemble context + generate)
   └── Depends on: Ollama client (#2), RAG pipeline (#5), SearXNG client (#3)

7. /ask endpoint (wire router + retrieval + generation)
   └── Depends on: #1, #4, #5, #6

8. /capture endpoint (wire to existing VoiceProcessor)
   └── Depends on: #1, existing services

9. iOS app: Audio recording + WhisperKit transcription
   └── Independent of server. Can develop in parallel.

10. iOS app: APIClient + UI
    └── Depends on: #7, #8 (server must be running)

11. Remote access (Tailscale/Cloudflare Tunnel)
    └── Depends on: #7 (server must work locally first)
```

**Critical path:** Items 1-7 are sequential and form the server-side critical path. Item 9 (iOS audio/transcription) can be developed in parallel with 1-6 because it has no server dependency.

**Suggested phases:**
1. Server foundation: HTTP server + Ollama client + SearXNG setup (items 1-3)
2. RAG + LLM pipeline: Router, retrieval, generation, /ask endpoint (items 4-7)
3. iOS app: Recording, transcription, API client, UI (items 9-10)
4. Integration: /capture endpoint, remote access, polish (items 8, 11)

## Sources

- [WhisperKit - Argmax](https://www.argmaxinc.com/blog/whisperkit) -- on-device Whisper for Apple Silicon, actively maintained (v0.16.0 as of March 2026)
- [WhisperKit GitHub](https://github.com/argmaxinc/WhisperKit) -- SPM integration, Core ML optimized
- [Apple SpeechAnalyzer and WhisperKit](https://www.argmaxinc.com/blog/apple-and-argmax) -- WWDC 2025 context on Apple's native STT vs WhisperKit
- [Ollama API documentation](https://github.com/ollama/ollama/blob/main/docs/api.md) -- /api/generate, /api/chat, /api/embed endpoints
- [SearXNG Search API](https://docs.searxng.org/dev/search_api.html) -- JSON format configuration, query parameters
- [RAG with query routing (Towards Data Science)](https://towardsdatascience.com/rags-with-query-routing-5552e4e41c54/) -- classifier-based routing patterns
- [REST API Calls in Swift](https://matteomanferdini.com/swift-rest-api/) -- URLSession async/await patterns

---
*Architecture research for: voice-powered LLM assistant*
*Researched: 2026-03-06*
