# Phase 2: Ask Pipeline - Research

**Researched:** 2026-03-06
**Domain:** RAG pipeline, LLM routing, Ollama chat API, SearXNG web search, Fastify route integration
**Confidence:** HIGH

## Summary

This phase builds the `/ask` endpoint -- the core intelligence of the system. A user sends a text question; the server classifies it (brain/web/both), retrieves relevant context from Supabase vector search and/or SearXNG web search, generates an LLM answer grounded in that context, and returns the answer with source attribution. The entire pipeline must complete within 15 seconds and gracefully degrade when the cloud model is unavailable.

The existing codebase provides strong foundations: `EmbeddingsService` for Ollama embeddings, `SupabaseService.searchByEmbedding()` for vector search (with a `match_context_entries` RPC that returns similarity scores), and SearXNG already running on port 8888 with JSON format enabled. The main new work is: (1) an Ollama chat service wrapping `/api/chat`, (2) a SearXNG client service, (3) a question router (LLM classification call), (4) a RAG context assembler with relevance filtering, and (5) the `/ask` route that orchestrates these components.

A critical finding: the existing `SupabaseService.searchByEmbedding()` drops the `similarity` score from the RPC response during mapping via `toContextEntry()`. The RAG pipeline needs this score for relevance thresholding (reject results below ~0.7 cosine similarity). This requires either modifying the existing method or adding a new one that returns scores.

**Primary recommendation:** Build three new services (`OllamaChat`, `SearxngSearch`, `AskPipeline`) and one new route (`/ask`), following the same patterns as the existing capture route. Keep the Ollama interaction as plain `fetch()` calls to `/api/chat` (consistent with `EmbeddingsService`) rather than adding an npm dependency.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ASK-01 | /ask endpoint accepts text and returns text response with sources | Fastify route pattern from capture.ts, Zod validation, response schema documented below |
| ASK-02 | RAG retrieves relevant context from Supabase vector search with relevance threshold | Existing `searchByEmbedding()` + `match_context_entries` RPC returns similarity scores; need to surface scores and filter at ~0.7 threshold |
| ASK-03 | LLM routing classifies question as brain/web/both via two-call approach | Ollama `/api/chat` with `stream: false`, structured JSON output via `format: "json"`, classification prompt patterns documented below |
| ASK-04 | SearXNG web search returns results for general knowledge questions | SearXNG running on port 8888, JSON API via `?format=json`, response parsing documented below |
| ASK-05 | LLM generates answer grounded in retrieved context (qwen3.5:cloud via Ollama) | Ollama `/api/chat` with system prompt containing assembled context, `stream: false` for simple request/response |
| ASK-06 | Falls back to local 7B model when cloud model is unavailable | Try cloud model first, catch errors/timeouts, retry with local model name; Ollama handles model loading automatically |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.8.1 | HTTP server (already installed) | Existing dependency, route registration pattern established |
| zod | ^4.3.6 | Request/response validation (already installed) | Existing dependency, used in capture route |
| node built-in fetch | - | Ollama API and SearXNG API calls | Consistent with existing EmbeddingsService pattern, no extra dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @supabase/supabase-js | ^2.98.0 | Vector search (already installed) | RAG retrieval via existing SupabaseService |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw fetch for Ollama | `ollama` npm package | Adds a dependency; raw fetch is consistent with existing EmbeddingsService and gives full control over error handling and timeouts |
| Custom SearXNG client | `langchain` SearXNG integration | Massive dependency for a single HTTP GET call |

**Installation:**
```bash
# No new dependencies needed -- all required packages are already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  server/
    routes/
      ask.ts            # /ask route handler (like capture.ts)
    plugins/
      auth.ts           # existing auth plugin
  services/
    ask-pipeline.ts     # orchestrates routing, retrieval, generation
    ollama-chat.ts      # wraps Ollama /api/chat endpoint
    searxng.ts          # wraps SearXNG JSON API
    supabase.ts         # existing -- needs searchWithScores() addition
    embeddings.ts       # existing -- used for query embedding
```

### Pattern 1: Service Composition (AskPipeline orchestrator)
**What:** A single `AskPipeline` class that takes all services as constructor deps and orchestrates the full ask flow: classify -> retrieve -> generate.
**When to use:** For the `/ask` route handler -- keeps the route file thin (like capture.ts).
**Example:**
```typescript
// Source: Pattern from existing captureEntry() and route structure
export class AskPipeline {
  constructor(
    private ollamaChat: OllamaChatService,
    private searxng: SearxngService,
    private embeddings: EmbeddingsService,
    private supabase: SupabaseService,
    private config: AskConfig
  ) {}

  async ask(question: string): Promise<AskResult> {
    // 1. Classify question
    const route = await this.classify(question);
    // 2. Retrieve context based on route
    const context = await this.retrieve(question, route);
    // 3. Generate answer with context
    return this.generate(question, context);
  }
}
```

### Pattern 2: Ollama Chat via Raw Fetch (consistent with EmbeddingsService)
**What:** Direct `fetch()` calls to Ollama `/api/chat` with `stream: false`.
**When to use:** For both the routing classification call and the answer generation call.
**Example:**
```typescript
// Source: Consistent with existing src/services/embeddings.ts pattern
export class OllamaChatService {
  constructor(private baseUrl: string) {}

  async chat(opts: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    format?: string | object;
    options?: Record<string, unknown>;
  }): Promise<{ content: string; model: string }> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...opts, stream: false }),
    });

    if (!response.ok) {
      throw new Error(`Ollama chat failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.message.content,
      model: data.model,
    };
  }
}
```

### Pattern 3: Model Fallback
**What:** Try cloud model, catch failure, retry with local model.
**When to use:** For both classification and generation calls.
**Example:**
```typescript
// Try cloud model first, fall back to local
async chatWithFallback(messages: Message[], format?: string | object): Promise<ChatResult> {
  try {
    return await this.chat({
      model: this.cloudModel,  // 'qwen3.5:cloud'
      messages,
      format,
    });
  } catch (error) {
    // Cloud model unavailable -- fall back to local
    return await this.chat({
      model: this.localModel,  // 'qwen2.5:7b' or similar
      messages,
      format,
    });
  }
}
```

### Pattern 4: Structured JSON Output for Classification
**What:** Use Ollama's `format: "json"` parameter to get reliable JSON from the routing call.
**When to use:** For the LLM classification call that returns `{ route: "brain" | "web" | "both" }`.
**Example:**
```typescript
const result = await this.ollamaChat.chat({
  model: this.config.model,
  messages: [
    {
      role: 'system',
      content: `You are a question router. Classify the user's question into one category.
Reply with JSON: { "route": "brain" | "web" | "both" }

- "brain": Questions about the user's personal notes, projects, decisions, learnings
- "web": General knowledge questions, current events, how-to questions not about personal content
- "both": Questions that benefit from both personal context and web information`
    },
    { role: 'user', content: question }
  ],
  format: 'json',
});
const { route } = JSON.parse(result.content);
```

### Anti-Patterns to Avoid
- **Loading both models simultaneously:** Always sequence embed -> unload -> chat. Ollama with `OLLAMA_MAX_LOADED_MODELS=1` handles this automatically but be aware of the ~2-3s model swap time.
- **Using /api/generate for chat:** Use `/api/chat` with message arrays. `/api/generate` handles system prompts differently and is for raw completions.
- **Streaming responses:** The requirements explicitly state simple request/response for v1. Use `stream: false` to get a single JSON response.
- **Large context windows:** Keep `num_ctx` reasonable (4096 is enough). Larger contexts consume more memory on the 8GB Mac Mini.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector similarity search | Custom cosine similarity in Node.js | Supabase `match_context_entries` RPC | PostgreSQL pgvector is optimized, handles indexing, already deployed |
| Web search | Scraping Google/Bing | SearXNG JSON API | Already deployed, meta-search across multiple engines, privacy-preserving |
| LLM inference | Custom model loading | Ollama `/api/chat` | Handles model management, memory, GPU acceleration, model swapping |
| Request validation | Manual type checking | Zod schemas | Already used in capture route, type-safe, good error messages |
| Embeddings | Custom embedding code | Existing `EmbeddingsService` | Already built and tested |

**Key insight:** This phase is primarily orchestration -- connecting existing services in the right order. The hard infrastructure (Ollama, Supabase, SearXNG, Fastify) is already in place from Phase 1 and the existing codebase.

## Common Pitfalls

### Pitfall 1: Similarity Score Not Surfaced from Supabase
**What goes wrong:** The `match_context_entries` RPC returns a `similarity` column, but the current `SupabaseService.searchByEmbedding()` method maps results through `toContextEntry()` which drops the similarity score. Without it, you cannot filter irrelevant results.
**Why it happens:** The original codebase was built for MCP search tools where showing all results was fine. The RAG pipeline needs quality filtering.
**How to avoid:** Add a new method `searchWithScores()` that returns `{ entry: ContextEntry, similarity: number }[]`, or modify the existing method to include scores. Apply a threshold (start with 0.65, tune empirically) to reject low-relevance results.
**Warning signs:** LLM answers reference notes completely unrelated to the question.

### Pitfall 2: Embedding Model and Chat Model Memory Collision
**What goes wrong:** The `/ask` pipeline needs to: (1) embed the query with nomic-embed-text, then (2) run chat with qwen3.5:cloud. If `OLLAMA_MAX_LOADED_MODELS` is not set to 1, both models load and the 8GB Mac Mini swaps or OOMs.
**Why it happens:** Ollama keeps models loaded for 5 minutes by default. The embed call loads nomic-embed-text, and the chat call loads qwen3.5 before nomic-embed-text is unloaded.
**How to avoid:** The Phase 1 research already established `OLLAMA_MAX_LOADED_MODELS=1`. With this setting, Ollama automatically unloads the previous model before loading the next one. The ~2-3 second model swap time is acceptable within the 15-second budget. No application code needed beyond the env var already configured.
**Warning signs:** Ollama returns 500 errors or responses take 30+ seconds (swapping to disk).

### Pitfall 3: SearXNG Returns HTML Instead of JSON
**What goes wrong:** If `format=json` is not in the query parameters, SearXNG returns an HTML search page. The JSON response is also only available if `json` is listed in the `search.formats` setting.
**Why it happens:** JSON format is not enabled by default in SearXNG. Developers test with a browser and assume the API works the same way.
**How to avoid:** Already handled -- the Phase 1 SearXNG settings.yml has `formats: [html, json]`. Always include `format=json` in the query string. Parse and validate the response structure.
**Warning signs:** `JSON.parse()` throws on HTML content.

### Pitfall 4: Cloud Model Timeout Eating the 15-Second Budget
**What goes wrong:** The cloud model (qwen3.5:cloud) routes through Ollama's cloud infrastructure. If the cloud is slow or rate-limited, the request hangs for 30+ seconds before timing out, then the local fallback adds another 5-10 seconds, blowing the 15-second total budget.
**Why it happens:** Default `fetch()` has no timeout. The cloud model's latency is unpredictable.
**How to avoid:** Set explicit timeouts on the Ollama chat calls using `AbortController`. Give the cloud model 8 seconds for the classification call and 10 seconds for the generation call. If the classification call times out, immediately fall back to local model for both calls. Use `keep_alive: 0` or `"0"` in the Ollama request to immediately unload after response.
**Warning signs:** Sporadic slow responses that work fine when retried.

### Pitfall 5: Empty or No RAG Results Confuse the LLM
**What goes wrong:** When the vault has no relevant content for a question classified as "brain", the LLM receives an empty context and either hallucinates an answer or says "I don't have enough information" without trying web search.
**Why it happens:** The routing and retrieval are separate steps. The router classifies based on the question text alone, not on whether relevant vault content actually exists.
**How to avoid:** After retrieval, check if brain search returned results above the similarity threshold. If not, upgrade the route: `brain` -> `web`, `both` with no brain results -> `web` only. Include this fallback logic in the pipeline orchestrator.
**Warning signs:** Questions about topics that should be in the vault get "I don't have information" responses.

## Code Examples

Verified patterns from official sources and existing codebase:

### Ollama /api/chat (Non-Streaming)
```typescript
// Source: https://docs.ollama.com/api/chat
// Non-streaming call with system prompt
const response = await fetch('http://localhost:11434/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'qwen3.5:cloud',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is the capital of France?' },
    ],
    stream: false,
    keep_alive: 0,  // Immediately unload after response
  }),
});

const data = await response.json();
// data.message.content -> "The capital of France is Paris."
// data.model -> "qwen3.5:cloud"
// data.done -> true
```

### Ollama Structured JSON Output
```typescript
// Source: https://docs.ollama.com/api/chat
// Force JSON output with format parameter
const response = await fetch('http://localhost:11434/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'qwen3.5:cloud',
    messages: [
      { role: 'system', content: 'Classify and reply with JSON: { "route": "brain" | "web" | "both" }' },
      { role: 'user', content: 'What did I write about TypeScript last week?' },
    ],
    stream: false,
    format: 'json',
  }),
});

const data = await response.json();
const classification = JSON.parse(data.message.content);
// classification.route -> "brain"
```

### SearXNG JSON API
```typescript
// Source: https://docs.searxng.org/dev/search_api.html
// SearXNG is already running on port 8888 (Phase 1 docker-compose)
const params = new URLSearchParams({
  q: 'TypeScript generics tutorial',
  format: 'json',
  categories: 'general',
});

const response = await fetch(`http://localhost:8888/search?${params}`);
const data = await response.json();

// Response structure (verified from SearXNG source and community docs):
// data.results: Array<{
//   url: string;
//   title: string;
//   content: string;        // snippet/description
//   engine: string;         // which search engine
//   parsed_url: string[];
//   positions: number[];
//   score: number;
// }>
// data.number_of_results: number;
// data.query: string;
```

### Supabase Search with Similarity Scores
```typescript
// Source: Existing supabase/schema.sql match_context_entries function
// The RPC already returns a similarity column -- need to surface it
async searchWithScores(
  embedding: number[],
  opts?: { limit?: number; threshold?: number }
): Promise<Array<{ entry: ContextEntry; similarity: number }>> {
  const { data, error } = await this.client.rpc('match_context_entries', {
    query_embedding: embedding,
    match_count: opts?.limit ?? 5,
    filter_project: null,
    filter_repo: null,
    filter_type: null,
  });

  if (error) throw new Error(`Supabase search failed: ${error.message}`);

  const threshold = opts?.threshold ?? 0.65;
  return (data ?? [])
    .filter((row: any) => row.similarity >= threshold)
    .map((row: any) => ({
      entry: this.toContextEntry(row),
      similarity: row.similarity,
    }));
}
```

### /ask Route Handler
```typescript
// Source: Pattern from existing src/server/routes/capture.ts
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

const askBodySchema = z.object({
  text: z.string().min(1, 'text is required'),
});

export async function askRoutes(app: FastifyInstance, opts: { services: AskServices }) {
  const { services } = opts;

  app.post('/ask', async (request, reply) => {
    const parsed = askBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    try {
      const result = await services.askPipeline.ask(parsed.data.text);
      return reply.send({
        answer: result.answer,
        sources: result.sources,  // vault paths or web URLs
        route: result.route,      // brain/web/both
        model: result.model,      // which model actually answered
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ error: 'Ask failed', message });
    }
  });
}
```

### Context Assembly for LLM Prompt
```typescript
// Assembling retrieved context into the generation prompt
function buildGenerationPrompt(
  question: string,
  brainResults: Array<{ entry: ContextEntry; similarity: number }>,
  webResults: Array<{ title: string; url: string; content: string }>,
): Array<{ role: string; content: string }> {
  let contextParts: string[] = [];

  if (brainResults.length > 0) {
    contextParts.push('## Your Personal Notes:');
    for (const { entry, similarity } of brainResults) {
      contextParts.push(`### ${entry.title} (relevance: ${(similarity * 100).toFixed(0)}%)`);
      if (entry.vaultPath) contextParts.push(`Source: ${entry.vaultPath}`);
      contextParts.push(entry.content);
      contextParts.push('');
    }
  }

  if (webResults.length > 0) {
    contextParts.push('## Web Search Results:');
    for (const result of webResults) {
      contextParts.push(`### ${result.title}`);
      contextParts.push(`URL: ${result.url}`);
      contextParts.push(result.content);
      contextParts.push('');
    }
  }

  return [
    {
      role: 'system',
      content: `You are a helpful assistant answering questions using the provided context.
Ground your answer in the context below. If the context does not contain relevant information, say so.
When citing personal notes, mention the note title. When citing web results, mention the source.

${contextParts.join('\n')}`,
    },
    { role: 'user', content: question },
  ];
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `/api/generate` for all Ollama calls | `/api/chat` with message arrays | Ollama 0.3+ | Chat endpoint handles system prompts correctly, supports tool calling |
| No structured output | `format: "json"` parameter | Ollama 0.5+ | Reliable JSON output without brittle parsing |
| SearXNG HTML scraping | `format=json` query parameter | Always available | Clean JSON response, no HTML parsing needed |

**Deprecated/outdated:**
- `ollama` npm package v0.x had different API shape; if used, ensure v1.x+ compatibility. However, raw fetch is recommended for this project to stay consistent with the existing `EmbeddingsService` pattern.

## Open Questions

1. **Similarity threshold tuning**
   - What we know: The `match_context_entries` RPC returns cosine similarity (1 - distance). Typical thresholds for nomic-embed-text are 0.6-0.8.
   - What's unclear: The right threshold depends on vault content diversity and question style. Too high = misses relevant results, too low = includes noise.
   - Recommendation: Start at 0.65, make it configurable, tune after testing with real vault data.

2. **qwen3.5:cloud rate limits**
   - What we know: Ollama's cloud models are free with "light usage" limits. No documented rate limits.
   - What's unclear: What triggers rate limiting, how the error manifests (HTTP 429? timeout? different error?).
   - Recommendation: Build the fallback path from the start. Catch any non-2xx response or timeout and fall back immediately.

3. **Local fallback model choice**
   - What we know: 8GB Mac Mini can run Q4-quantized 7B models (~4-5GB). qwen2.5:7b is a reasonable choice.
   - What's unclear: Whether 7B fits alongside SearXNG Docker + Node.js in practice. The 3B alternative (qwen2.5:3b) is safer on memory but lower quality.
   - Recommendation: Default to 7B, document the 3B alternative as a config option if memory is tight.

4. **SearXNG JSON response schema**
   - What we know: Returns a `results` array with `url`, `title`, `content`, `engine`, `score` fields.
   - What's unclear: Exact field names and edge cases (missing fields, empty results).
   - Recommendation: Test against the running instance in early implementation. Validate response shape with Zod.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.18 |
| Config file | None (vitest uses package.json config) |
| Quick run command | `npx vitest run tests/server/ask.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ASK-01 | /ask accepts text, returns answer + sources | integration | `npx vitest run tests/server/ask.test.ts` | No - Wave 0 |
| ASK-02 | RAG retrieves with relevance threshold | unit | `npx vitest run tests/services/ask-pipeline.test.ts` | No - Wave 0 |
| ASK-03 | LLM routing classifies brain/web/both | unit | `npx vitest run tests/services/ollama-chat.test.ts` | No - Wave 0 |
| ASK-04 | SearXNG returns web results | unit | `npx vitest run tests/services/searxng.test.ts` | No - Wave 0 |
| ASK-05 | LLM generates grounded answer | unit | `npx vitest run tests/services/ask-pipeline.test.ts` | No - Wave 0 |
| ASK-06 | Fallback to local model on cloud failure | unit | `npx vitest run tests/services/ollama-chat.test.ts` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/server/ask.test.ts tests/services/ask-pipeline.test.ts tests/services/ollama-chat.test.ts tests/services/searxng.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/services/ollama-chat.test.ts` -- covers ASK-03, ASK-06 (mock fetch, test fallback logic)
- [ ] `tests/services/searxng.test.ts` -- covers ASK-04 (mock fetch, test response parsing)
- [ ] `tests/services/ask-pipeline.test.ts` -- covers ASK-02, ASK-05 (mock all services, test orchestration)
- [ ] `tests/server/ask.test.ts` -- covers ASK-01 (integration test with mocked services, like capture.test.ts)

## Sources

### Primary (HIGH confidence)
- [Ollama API Chat Docs](https://docs.ollama.com/api/chat) - Request/response format, streaming, format parameter, message structure
- [Ollama API GitHub](https://github.com/ollama/ollama/blob/main/docs/api.md) - Full API reference including /api/generate, /api/tags
- [SearXNG Search API](https://docs.searxng.org/dev/search_api.html) - Query parameters, format options, endpoint structure
- Existing codebase: `src/services/embeddings.ts`, `src/services/supabase.ts`, `supabase/schema.sql` - Verified patterns and API shapes

### Secondary (MEDIUM confidence)
- [qwen3.5:cloud model page](https://ollama.com/library/qwen3.5:cloud) - Model availability confirmed, no rate limit info found
- [Ollama cloud models](https://ollama.com/search?c=cloud) - Cloud routing mechanism confirmed
- `.planning/research/PITFALLS.md` - Memory management, RAG quality, SearXNG format pitfalls

### Tertiary (LOW confidence)
- SearXNG JSON response field names - Inferred from community docs and source code, needs validation against running instance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All dependencies already installed, patterns established in Phase 1
- Architecture: HIGH - Follows existing service/route patterns, straightforward orchestration
- Ollama API: HIGH - Verified from official docs
- SearXNG API: MEDIUM - Endpoint and parameters verified, exact response schema needs runtime validation
- Pitfalls: HIGH - Memory issues and RAG quality documented in project research, Ollama API patterns verified
- Fallback mechanism: MEDIUM - Cloud model error behavior undocumented, defensive coding required

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain, Ollama API and SearXNG are mature)
