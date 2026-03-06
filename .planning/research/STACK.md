# Technology Stack

**Project:** Second Brain - LLM Conversational Interface
**Researched:** 2026-03-06
**Scope:** New components only (iOS app + HTTP API + integrations). Existing stack (TypeScript, Supabase, Ollama, whisper-cpp on Mac) is not re-evaluated.

## Recommended Stack

### iOS App - Core

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Swift 5.10+ | 5.10+ | App language | Required for SwiftUI + WhisperKit compatibility. Swift 6 concurrency is opt-in, stick with 5.10 for now. | HIGH |
| SwiftUI | iOS 17+ | UI framework | Declarative, modern, sufficient for a 3-button interface. iOS 17 is minimum for WhisperKit and good AVSpeechSynthesizer voice selection. No reason to support older versions for a personal-use app. | HIGH |
| Xcode 16 | 16.x | IDE | Current stable. Required for iOS 18 SDK. | HIGH |

### iOS App - Speech

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| WhisperKit | ^0.16.0 | On-device STT | Native Swift + CoreML, runs on Apple Neural Engine (ANE) for fastest inference on iPhone. Actively maintained by Argmax (v0.16.0 released March 2026). Uses CoreML-compiled Whisper models optimized for Apple Silicon. Better than SwiftWhisper (C++ wrapper, less Apple-optimized) or whisper.spm (raw C, no ANE acceleration). | HIGH |
| WhisperKit base-en model | - | Whisper model | Good accuracy/size tradeoff for English. Runs fast on ANE. Tiny-en is faster but noticeably less accurate. | MEDIUM |
| AVSpeechSynthesizer | iOS 17+ | TTS | Free, on-device, no network needed. 150+ voices on iOS 17. Limitation: requires full text before speaking (no streaming). Acceptable for v1 since responses are complete before TTS starts. | HIGH |
| AVAudioRecorder | iOS 17+ | Voice recording | Standard iOS audio recording API. Record to AAC at 16kHz mono (WhisperKit input format). Wrap in an ObservableObject for SwiftUI binding. | HIGH |

**WhisperKit model download strategy:** WhisperKit downloads models on first launch from Hugging Face. For a personal app, this is fine. No need to bundle the model in the app binary.

### iOS App - Networking

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| URLSession | Built-in | HTTP client | Built-in, async/await support, no dependency needed. The API surface is 2 endpoints (/ask, /capture) -- a full HTTP client library is overkill. | HIGH |
| Codable | Built-in | JSON serialization | Swift standard. Define request/response structs with Codable conformance. | HIGH |

### Mac Mini - HTTP API Server

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Fastify | ^5.8.0 | HTTP framework | 2-3x faster than Express in benchmarks, first-class TypeScript support with generics-based validation, built-in JSON schema validation. The existing codebase is TypeScript/ESM -- Fastify v5 aligns perfectly (requires Node 20+, ESM-native). Express's TypeScript support is retrofitted via @types/express. | HIGH |
| @fastify/cors | ^11.0.0 | CORS middleware | Needed for development. In production the iOS app talks directly to the API, but CORS is cheap insurance. | HIGH |

**Not Express.** Express works, but Fastify is the better choice for a new TypeScript API in 2026. Native types, faster, modern plugin system. The existing codebase uses Commander for CLI and MCP SDK for the MCP server -- neither constrains the HTTP server choice.

### Mac Mini - Ollama Integration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| ollama (npm) | ^0.6.3 | Ollama client | Official Ollama TypeScript library. Direct API for chat, generate, embeddings. Already using Ollama on the Mac Mini for embeddings, this is the natural client. Simpler than using the OpenAI-compatible endpoint via the `openai` package. | HIGH |

**Not the openai npm package.** While Ollama exposes an OpenAI-compatible API at `/v1`, using the official `ollama` package gives access to Ollama-specific features (model management, pull, native streaming via AsyncIterable). The OpenAI compatibility layer is useful if you might swap to OpenAI later -- but this project explicitly targets $0 cost with local models.

### Mac Mini - Web Search

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| SearXNG | latest (Docker) | Meta-search engine | Self-hosted, free, aggregates 246+ search engines. JSON API at `/search?q=...&format=json`. Already decided in project spec. | HIGH |
| Docker Compose | v2 | SearXNG orchestration | SearXNG Docker setup includes SearXNG + Redis (Valkey). Single `docker compose up -d`. | HIGH |

**SearXNG API integration is trivial.** It's a simple HTTP GET: `GET /search?q=query&format=json&engines=google,duckduckgo`. Returns JSON with `results[]` array containing `title`, `url`, `content`. No SDK needed -- use native `fetch()` in Node.js.

**Required SearXNG config change:** JSON format is disabled by default. Must enable it in `settings.yml`:
```yaml
search:
  formats:
    - html
    - json
```

### Mac Mini - Existing Stack (unchanged)

| Technology | Already In Use | Purpose |
|------------|---------------|---------|
| Supabase + pgvector | Yes | Vector search for RAG context retrieval |
| Ollama (nomic-embed-text) | Yes | Embedding generation |
| TypeScript 5.9 / Node.js / ESM | Yes | Runtime |
| npm | Yes | Package manager |

### Networking - Remote Access

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Tailscale | Latest | VPN mesh network | Creates encrypted WireGuard tunnel between iPhone and Mac Mini. Zero config, works behind NAT, no port forwarding needed. Free for personal use (up to 100 devices). Better than Cloudflare Tunnel for this use case because the app is private (no public access needed) and Tailscale gives a stable IP/hostname on the tailnet. | HIGH |

**Not Cloudflare Tunnel.** Cloudflare Tunnel is for exposing services publicly. This is a personal app talking to a personal server -- Tailscale's private mesh is simpler and more secure. Install Tailscale on Mac Mini + iPhone, they see each other on the tailnet. The iOS app hits `http://mac-mini:3000/ask` via the Tailscale network.

## Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| zod | ^4.3.0 | Request validation | Validate /ask and /capture request bodies on the server. Already in the codebase. | HIGH |
| @fastify/type-provider-zod | ^4.0.0 | Fastify + Zod integration | Wire Zod schemas into Fastify route definitions for automatic validation + TypeScript inference. | MEDIUM |
| pino | (bundled) | Logging | Fastify bundles Pino. Use it -- don't add winston or another logger. | HIGH |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| iOS STT | WhisperKit | SwiftWhisper | SwiftWhisper wraps whisper.cpp C code; WhisperKit is native Swift with CoreML/ANE optimization, faster on iPhone |
| iOS STT | WhisperKit | Apple Speech Framework | Less accurate than Whisper for general transcription, requires network for best results |
| HTTP Server | Fastify v5 | Express v5 | Express TypeScript support is community-maintained @types; Fastify has native TS. Fastify is 2-3x faster. |
| HTTP Server | Fastify v5 | Hono | Hono is excellent but optimized for edge/serverless. Fastify is better for a long-running Node.js server on a Mac Mini. |
| Ollama Client | ollama (npm) | openai (npm) | openai package adds abstraction for OpenAI compat layer; ollama package is direct and Ollama-specific |
| Remote Access | Tailscale | Cloudflare Tunnel | Private app doesn't need public exposure. Tailscale is simpler for device-to-device. |
| TTS | AVSpeechSynthesizer | WhisperKit TTSKit | TTSKit (v0.16.0) uses Qwen3-TTS models (0.6B-1.7B params) -- too large for iPhone, and AVSpeechSynthesizer is free/instant/built-in |

## Anti-Recommendations

**Do NOT use these:**

| Technology | Why Not |
|------------|---------|
| Alamofire (iOS) | URLSession with async/await is sufficient for 2 endpoints. Alamofire adds 10K+ lines of dependency for no benefit here. |
| SwiftUI + Combine for networking | Use async/await. Combine is effectively legacy for new SwiftUI code. |
| LangChain (TypeScript) | Massive dependency for what amounts to: embed query, search Supabase, format prompt, call Ollama. Write it directly in ~100 lines. |
| Prisma / TypeORM | No new database. Supabase client already exists in the codebase. |
| Socket.io / WebSockets | Out of scope. V1 is request/response, not streaming. |
| React Native / Flutter | Native SwiftUI for a single-platform app. Cross-platform frameworks add complexity for zero benefit. |

## Installation

### Mac Mini (server additions)

```bash
# New API server dependencies
npm install fastify @fastify/cors ollama

# Dev dependencies (if not already present)
npm install -D @types/node

# SearXNG via Docker
git clone https://github.com/searxng/searxng-docker.git
cd searxng-docker
# Edit .env and searxng/settings.yml to enable JSON format
docker compose up -d

# Tailscale
brew install tailscale
```

### iOS App (Swift Package Manager)

In Xcode, add package dependency:
```
https://github.com/argmaxinc/WhisperKit.git
```
Minimum version: `0.16.0`

No other external dependencies needed. URLSession, AVAudioRecorder, AVSpeechSynthesizer, and Codable are all built-in.

## Version Compatibility Matrix

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| Node.js | 20.x | 22.x LTS | Fastify v5 requires Node 20+ |
| iOS | 17.0 | 18.0 | WhisperKit requires iOS 17+, target 17 for broader compat |
| Xcode | 16.0 | 16.x latest | Required for iOS 18 SDK |
| Swift | 5.10 | 5.10 | Swift 6 strict concurrency is opt-in, not required |
| macOS (Mac Mini) | 13.0 | Current | For running Tailscale + Docker + Ollama |

## Sources

- [WhisperKit GitHub](https://github.com/argmaxinc/WhisperKit) - v0.16.0, March 2026
- [WhisperKit Swift Package Index](https://swiftpackageindex.com/argmaxinc/WhisperKit/)
- [Fastify Official](https://fastify.dev/) - v5.8.1, March 2026
- [Fastify TypeScript Docs](https://fastify.dev/docs/latest/Reference/TypeScript/)
- [Ollama npm package](https://www.npmjs.com/package/ollama) - v0.6.3
- [Ollama OpenAI Compatibility](https://docs.ollama.com/api/openai-compatibility)
- [SearXNG Search API](https://docs.searxng.org/dev/search_api.html)
- [SearXNG Docker Setup](https://github.com/searxng/searxng-docker)
- [AVSpeechSynthesizer Apple Docs](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer)
- [Tailscale vs Cloudflare Comparison](https://tailscale.com/compare/cloudflare-access)
- [Express vs Fastify 2025](https://betterstack.com/community/guides/scaling-nodejs/fastify-express/)
