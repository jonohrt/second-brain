# Second Brain — LLM Conversational Interface

## What This Is

A native iOS app that lets you speak questions and capture thoughts into your second brain. Questions are transcribed on-device with whisper.cpp, sent to a Mac Mini API server that retrieves context from your knowledge base (Obsidian vault + Supabase vector search) and/or the web (SearXNG), generates answers via Ollama (qwen3.5), and returns them. The app can optionally read responses aloud. This adds a conversational query layer to the existing second-brain capture/retrieval system.

## Core Value

Ask a question by voice from anywhere and get an answer grounded in your personal knowledge base and the web — hands-free, free of cost.

## Requirements

### Validated

- ✓ Voice memo transcription via whisper-cpp — existing
- ✓ Obsidian vault storage with markdown + frontmatter — existing
- ✓ Supabase vector search with pgvector embeddings — existing
- ✓ Ollama-based embeddings (nomic-embed-text) — existing
- ✓ Voice capture pipeline (watcher → transcribe → vault + Supabase) — existing
- ✓ Reminder extraction from voice transcripts — existing
- ✓ MCP server exposing search/capture tools — existing
- ✓ CLI with hook handlers and sync commands — existing

### Active

- [ ] iOS app with voice recording and on-device whisper.cpp transcription
- [ ] Mac Mini HTTP API server with /ask and /capture endpoints
- [ ] LLM routing (classify question as brain/web/both)
- [ ] RAG pipeline for /ask: embed query → Supabase search → context retrieval
- [ ] SearXNG web search integration
- [ ] LLM answer generation with retrieved context (qwen3.5:cloud via Ollama)
- [ ] Fallback to local 7B model when cloud model unavailable
- [ ] Text-to-speech toggle in iOS app (AVSpeechSynthesizer)
- [ ] Remote access via Tailscale or Cloudflare Tunnel
- [ ] Capture flow: iOS app → Mac Mini → existing voice processor pipeline

### Out of Scope

- Real-time streaming responses — simple request/response is sufficient for v1
- Conversation history/multi-turn — each question is independent for now
- Push notifications — app is open when you use it
- Android app — iOS only
- Paid APIs (OpenAI, Claude API) — must be $0 operating cost
- Always-listening/wake word — explicit button press to record

## Context

The second brain is a brownfield TypeScript project running on a Mac Mini. It has two entry points: an MCP server (for Claude Code integration) and a CLI (for hooks and voice-watch daemon). Storage is dual: Obsidian vault (markdown files, source of truth) and Supabase with pgvector (queryable mirror for semantic search). Embeddings are generated locally via Ollama (nomic-embed-text).

The existing voice pipeline watches an iCloud-synced folder for Voice Memos, transcribes via whisper-cpp, and saves to vault + Supabase. It also detects "remind me" patterns and creates Apple Reminders.

The new conversational interface adds a second voice pathway: instead of just capturing, the user can ask questions and get LLM-powered answers. The iOS app replaces the Voice Memo → iCloud → watcher pipeline with a direct connection to the Mac Mini API.

Ollama is already running on the Mac Mini for embeddings. qwen3.5:cloud is available through Ollama's free cloud routing (token-limited). SearXNG will be self-hosted via Docker on the Mac Mini for web search.

## Constraints

- **Cost**: $0 operating cost — local Ollama, self-hosted SearXNG, on-device TTS
- **Hardware**: Mac Mini M2 8GB RAM — limits local model size to ~7B quantized
- **iOS**: whisper.cpp base model (~142MB) for on-device transcription
- **Network**: Must work remotely via Tailscale or Cloudflare Tunnel
- **Stack**: TypeScript for Mac Mini server (consistent with existing codebase), Swift/SwiftUI for iOS app

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| On-device whisper.cpp transcription (iPhone) | Eliminates network latency for audio transfer, better UX | — Pending |
| Two-call LLM routing (classify then answer) | Simple, predictable, easy to debug vs tool-use or heuristics | — Pending |
| qwen3.5:cloud with local 7B fallback | Best free quality, graceful degradation when rate-limited | — Pending |
| SearXNG via Docker for web search | Free, private, self-hosted, powerful meta-search | — Pending |
| AVSpeechSynthesizer for TTS | Free, on-device, no audio transfer needed | — Pending |
| Three-button UI (Ask, Capture, text/speech toggle) | Minimal, explicit user intent, no ambiguity | — Pending |

---
*Last updated: 2026-03-06 after initialization*
