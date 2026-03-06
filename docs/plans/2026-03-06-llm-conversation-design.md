# LLM Conversational Interface — Design Document

**Date:** 2026-03-06
**Status:** Approved
**Scope:** iOS app with voice input, LLM-powered responses from second-brain knowledge and web search

## Problem

The second brain captures information well but has no way to query it conversationally. Asking questions requires opening Claude Code and using MCP tools manually. There's also no way to ask general knowledge questions on the go.

## Solution

A native iOS app that lets you speak questions, transcribes them on-device with whisper.cpp, sends the text to a Mac Mini API server, which routes the question to second-brain search and/or web search, generates an answer via LLM, and returns it. The app can optionally read responses aloud.

## Architecture

```
iPhone App (SwiftUI)
  1. Record audio
  2. Transcribe locally (whisper.cpp base model, ~142MB)
  3. Send text to Mac Mini via POST /ask or POST /capture
  4. Display response text
  5. Optionally speak response (AVSpeechSynthesizer)

Mac Mini HTTP API (new entry point in second-brain)
  /ask:
    1. Routing call: LLM classifies question as brain/web/both
    2. If brain: embed query → Supabase vector search
    3. If web: SearXNG search
    4. If both: parallel search
    5. Answer call: LLM generates response with retrieved context
    6. Return { text: string }

  /capture:
    1. Run existing voice processor pipeline
    2. Vault write + Supabase embed + reminder extraction
    3. Return { title: string, vaultPath: string }
```

## Components

### iOS App (SwiftUI)

- Minimal UI: Record button, Ask button, Capture button, text/speech toggle
- whisper.cpp compiled as static library with Core ML acceleration
- Ships with whisper `base` model (~142MB bundled or downloaded on first launch)
- AVSpeechSynthesizer for text-to-speech (on-device, free)
- Configurable server URL (for Tailscale/Tunnel address)

### Mac Mini HTTP API Server

New entry point in the second-brain project alongside the existing MCP server and CLI.

- HTTP framework: Express or Fastify (TypeScript, consistent with existing codebase)
- Endpoints:
  - `POST /ask` — `{ text: string }` → `{ text: string }`
  - `POST /capture` — `{ text: string }` → `{ title: string, vaultPath: string }`
  - `GET /health` — liveness check
- Reuses existing services: EmbeddingsService, SupabaseService, VaultService
- New services: LLM chat service (Ollama), web search service (SearXNG)
- Runs as launchd daemon (like the voice watcher)

### LLM Routing (Two-Call Approach)

**Call 1 — Route classification:**
- System prompt instructs LLM to classify the question
- Returns one of: `brain`, `web`, `both`
- Uses qwen3.5:cloud via Ollama

**Call 2 — Answer generation:**
- System prompt with retrieved context (second-brain results and/or web results)
- Generates conversational answer grounded in the context
- Same model (qwen3.5:cloud)

**Fallback:** If qwen3.5:cloud is unavailable or rate-limited, fall back to a local 7B model (e.g., qwen2.5:7b).

### Web Search (SearXNG)

- Self-hosted via Docker on Mac Mini
- JSON API: `GET /search?q=query&format=json`
- Returns titles, URLs, snippets
- Top N results fed to LLM as context

### RAG Pipeline (Second-Brain Search)

Reuses existing infrastructure:
1. Embed question via Ollama (nomic-embed-text)
2. Vector search via Supabase `match_context_entries` RPC
3. Format top results as context for LLM

## Network Access

Mac Mini exposed via Tailscale or Cloudflare Tunnel so the app works from anywhere, not just local network.

## Data Flow — Ask

```
User speaks → whisper.cpp (iPhone) → text
  → POST /ask { text } → Mac Mini
  → LLM routing call → "brain" | "web" | "both"
  → search(es) execute → context retrieved
  → LLM answer call with context → response text
  → { text } → iPhone
  → Display text + optional TTS
```

## Data Flow — Capture

```
User speaks → whisper.cpp (iPhone) → text
  → POST /capture { text } → Mac Mini
  → VoiceProcessor pipeline (vault + Supabase + reminders)
  → { title, vaultPath } → iPhone
  → Display confirmation
```

## Configuration

Extend existing second-brain config:
- `api.port` — HTTP server port (default 3000)
- `api.host` — bind address (default 0.0.0.0)
- `llm.model` — Ollama model for chat (default qwen3.5:cloud)
- `llm.fallbackModel` — local fallback model
- `searxng.url` — SearXNG instance URL (default http://localhost:8080)

## Error Handling

- Ollama unavailable: return error with message, app displays it
- SearXNG down: skip web search, answer with second-brain only (or LLM's own knowledge)
- Supabase down: skip brain search, answer with web only (or LLM's own knowledge)
- Both down: LLM answers from its own knowledge with a disclaimer
- Network timeout: app shows error, allows retry

## Security

- API server binds to localhost; external access only through Tailscale/Tunnel (both encrypted)
- No authentication needed initially (Tailscale provides identity)
- No secrets stored in the iOS app beyond the server URL

## Dependencies

**Mac Mini (new):**
- Express or Fastify (HTTP server)
- Docker + SearXNG (web search)
- New launchd plist for the API server

**iOS App (new project):**
- whisper.cpp (compiled for iOS)
- AVFoundation (audio recording)
- AVSpeechSynthesizer (TTS)

**Reused:**
- Ollama (already running for embeddings, add chat model)
- Supabase (existing vector store)
- EmbeddingsService, SupabaseService, VaultService

## Acceptance Criteria

1. Record a voice question on iPhone, receive a text answer from second-brain knowledge
2. Ask a general knowledge question, receive an answer sourced from web search
3. Toggle voice response on, hear the answer spoken
4. Capture a voice note, confirm it appears in vault and Supabase
5. Works over Tailscale from outside the local network
6. Graceful degradation when SearXNG or Supabase is unavailable
