# Feature Research

**Domain:** Voice-powered personal knowledge assistant (iOS app + Mac Mini API)
**Researched:** 2026-03-06
**Confidence:** MEDIUM-HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken or unusable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Push-to-talk voice recording | Every voice app has a record button. Users hold/tap to speak, release to send. Without this, there is no product. | LOW | Single large button, tap-to-start / tap-to-stop. Avoid hold-to-talk on mobile -- fatiguing for longer questions. |
| On-device speech-to-text | Users expect to see their words transcribed. Confirms the app heard them correctly before sending. | MEDIUM | whisper.cpp base model (~142MB). Show transcription before sending so user can verify/edit. |
| Text display of LLM response | Users need to read the answer. Voice-only response is not enough -- people re-read, skim, copy text. | LOW | Scrollable text view with markdown rendering (bold, lists, links at minimum). |
| Loading/processing indicator | Users need to know the app is working, not frozen. Voice apps feel especially broken without feedback. | LOW | Three states: "Transcribing...", "Thinking...", "Speaking..." with distinct visual indicators. |
| Error handling with clear messages | Network failures, model unavailable, transcription failures -- users need to know what went wrong and what to do. | LOW | "Can't reach server -- check connection" not "Error 500". Retry button for transient failures. |
| Response latency under 10 seconds | Users will not wait 30 seconds staring at a spinner. The entire pipeline (transcribe + embed + retrieve + generate) must complete in a reasonable window. | HIGH | This is an architecture constraint, not a feature to build. On-device transcription helps. May need to stream partial responses in v1.x if generation is slow. |
| Distinct Ask vs Capture modes | The existing system has two voice pathways (ask a question vs capture a thought). Users must explicitly choose intent -- ambiguity leads to wrong behavior. | LOW | Two buttons or a toggle. PROJECT.md already specifies three-button UI (Ask, Capture, toggle). |

### Differentiators (Competitive Advantage)

Features that set this product apart from Siri, ChatGPT Voice, or generic voice assistants.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Personal knowledge base grounding (RAG) | Answers come from YOUR notes, not generic internet. "What did I decide about X?" is answerable. This is the entire reason this product exists vs just using ChatGPT. | HIGH | Already partially built: Supabase pgvector + nomic-embed-text embeddings. Need query-time retrieval pipeline + context injection into prompt. |
| Source attribution in responses | Show which vault notes informed the answer. Builds trust, lets user navigate to original note. | MEDIUM | Return note titles/paths alongside the LLM response. Display as tappable links or a "Sources" section below the answer. |
| Hybrid brain + web search | "Check my notes first, then the web" -- answers grounded in personal knowledge supplemented by current web info. No other personal assistant does this well. | HIGH | Two-call LLM routing (classify as brain/web/both) per PROJECT.md. SearXNG for web. Merge contexts before generation. |
| Zero operating cost | No subscription, no API fees, no cloud dependency. Runs on hardware you already own. Compelling vs $20/mo ChatGPT Plus. | LOW | Already decided: Ollama local/cloud-free, self-hosted SearXNG, on-device TTS. This is a constraint that is also a feature. |
| Text-to-speech response readback | Hands-free use -- ask a question while cooking, driving, etc. Not all apps offer this; ChatGPT does but Siri's answers are shallow. | LOW | AVSpeechSynthesizer is free and on-device. Toggle on/off. Quality is adequate, not great -- but zero cost. |
| Works remotely via Tailscale | Use from anywhere, not just home network. Your personal knowledge base is accessible from the office, a cafe, anywhere. | MEDIUM | Tailscale or Cloudflare Tunnel. Already in PROJECT.md scope. Setup complexity is the main cost. |
| Voice capture with auto-categorization | Speak a thought, it gets transcribed, categorized, and stored in the right place in your vault automatically. Extends existing voice memo pipeline. | MEDIUM | Existing pipeline does this for voice memos. New iOS app replaces iCloud sync with direct API call -- simpler and faster. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems -- especially for a solo-developer, zero-cost, personal-use project.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Multi-turn conversation history | "I want follow-up questions" -- ChatGPT trained users to expect this. | Adds major complexity: context window management, conversation storage, session state, UI for conversation threads. For a personal knowledge query tool, most questions are one-shot. | Defer entirely for v1. Each question is independent. If a follow-up is needed, user can reference the previous answer in their next question naturally. Revisit only if single-turn feels limiting in practice. |
| Always-listening / wake word | "Hey Brain, what did I..." -- hands-free activation like Siri. | Requires constant microphone access (battery drain), background audio processing, wake word detection model, iOS background mode restrictions. Enormous complexity for marginal gain on a personal tool. | Explicit button press. If hands-free is needed, map to iOS Action Button shortcut or use Siri Shortcuts integration to launch the app. |
| Real-time streaming responses | "I want to see words appear as they're generated" like ChatGPT. | Requires SSE or WebSocket server, streaming-capable Ollama integration, incremental UI rendering, partial speech synthesis. Significant complexity across the entire stack. | Simple request/response for v1. If response times are acceptable (under 8-10 seconds), streaming adds visual polish but not functional value. Revisit only if latency is a real problem. |
| Multiple voice options / voice cloning | "I want it to sound like X" -- ChatGPT offers 5+ voices. | AVSpeechSynthesizer has limited voice options. Custom TTS requires a paid service (ElevenLabs, etc.) or a local TTS model that the Mac Mini may not have RAM for. Violates zero-cost constraint. | Use the best available AVSpeechSynthesizer voice. Accept that TTS quality is "good enough, not great." |
| Rich media responses (images, charts) | "Show me a chart of my notes over time" -- sounds cool. | LLM generates text, not images. Adding image generation requires another model, more RAM, different rendering. Massive scope expansion for rare use cases. | Text-only responses. If the user needs visuals, they can open their vault in Obsidian which has native graph/chart plugins. |
| Push notifications for answers | "Notify me when the answer is ready" -- for very slow queries. | Requires Apple Push Notification setup, server-side notification infrastructure, background processing. Over-engineering for a tool you use actively. | App stays open during query. If latency is bad enough to need notifications, fix the latency instead. |
| Android app | "I also have an Android phone." | Doubles the client development effort. Swift/SwiftUI skills don't transfer. Maintaining two native apps as a solo developer is unsustainable. | iOS only per PROJECT.md. If cross-platform is ever needed, consider a simple web client served from the Mac Mini instead. |
| Offline mode / on-device LLM | "I want it to work without network." | The Mac Mini IS the server. Without network, there is no RAG, no LLM, no web search. An on-device 7B model on iPhone would give generic answers without personal knowledge -- defeating the core value. | Require network. The app is a client for your home server. Tailscale ensures connectivity from most locations. |

## Feature Dependencies

```
[On-device transcription (whisper.cpp)]
    └──feeds──> [Ask flow: send transcribed text to /ask API]
    └──feeds──> [Capture flow: send transcribed text to /capture API]

[Mac Mini HTTP API server]
    └──required by──> [Ask flow]
    └──required by──> [Capture flow]
    └──required by──> [Remote access via Tailscale]

[Supabase vector search + embeddings]
    └──required by──> [RAG retrieval pipeline]
                           └──required by──> [Personal knowledge grounding]
                           └──enhances──> [Source attribution]

[LLM routing (classify question)]
    └──required by──> [Hybrid brain + web search]
    └──requires──> [Mac Mini HTTP API]

[SearXNG web search]
    └──required by──> [Hybrid brain + web search]
    └──requires──> [Docker on Mac Mini]

[Text-to-speech toggle]
    └──enhances──> [Ask flow response display]
    └──independent of──> [all server-side features]

[Source attribution]
    └──requires──> [RAG retrieval pipeline returning source metadata]
    └──enhances──> [Response display UI]
```

### Dependency Notes

- **Ask flow requires Mac Mini API + transcription:** The entire value chain depends on these two pieces working. Build and validate them first.
- **RAG retrieval requires existing embeddings infrastructure:** Already built (Supabase pgvector + nomic-embed-text). The new work is query-time retrieval, not embedding infrastructure.
- **Hybrid search requires both RAG and SearXNG:** These can be built independently and merged. SearXNG can be deferred -- brain-only search is still valuable.
- **TTS is fully independent:** Can be added at any time without touching the server. Low-risk enhancement.
- **Source attribution requires RAG metadata passthrough:** The retrieval pipeline must return note titles/paths alongside content chunks. Design this into the API response format from the start.

## MVP Definition

### Launch With (v1)

Minimum viable product -- validate that voice-to-knowledge-base-answer works end to end.

- [ ] iOS app with push-to-talk recording and on-device whisper.cpp transcription -- the input mechanism
- [ ] Mac Mini HTTP API with /ask endpoint -- the processing backbone
- [ ] RAG retrieval pipeline (embed query, search Supabase, inject context into prompt) -- the core differentiator
- [ ] LLM answer generation via Ollama (qwen3.5:cloud with local fallback) -- the output
- [ ] Text display of response with loading states -- minimum viable UI
- [ ] Error handling for network failures and model unavailability -- prevents confusion
- [ ] Capture flow via /capture endpoint reusing existing voice processor -- maintains existing functionality

### Add After Validation (v1.x)

Features to add once the core ask/answer loop is working and latency is acceptable.

- [ ] Text-to-speech toggle (AVSpeechSynthesizer) -- when hands-free use becomes a real need
- [ ] Source attribution in responses -- when users want to verify or explore answers
- [ ] LLM routing for hybrid brain + web search -- when brain-only answers feel incomplete
- [ ] SearXNG web search integration -- when routing is ready
- [ ] Remote access via Tailscale/Cloudflare Tunnel -- when using outside home network becomes a need
- [ ] Transcription editing before send -- when whisper.cpp accuracy proves insufficient

### Future Consideration (v2+)

Features to defer until v1 is stable and patterns of use emerge.

- [ ] Multi-turn conversation -- only if single-turn proves genuinely limiting in practice
- [ ] Streaming responses -- only if latency exceeds 10 seconds consistently
- [ ] Siri Shortcuts integration for quick launch -- quality of life, not core functionality
- [ ] Response history / search past answers -- only if users find themselves re-asking questions
- [ ] Widgets for quick capture from home screen -- convenience feature after core is solid

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Push-to-talk voice recording | HIGH | LOW | P1 |
| On-device whisper.cpp transcription | HIGH | MEDIUM | P1 |
| Mac Mini /ask API endpoint | HIGH | HIGH | P1 |
| RAG retrieval pipeline | HIGH | HIGH | P1 |
| LLM answer generation (Ollama) | HIGH | MEDIUM | P1 |
| Text response display + loading states | HIGH | LOW | P1 |
| Error handling | HIGH | LOW | P1 |
| Capture flow via /capture API | MEDIUM | LOW | P1 |
| Text-to-speech toggle | MEDIUM | LOW | P2 |
| Source attribution | MEDIUM | MEDIUM | P2 |
| LLM routing (brain/web/both) | MEDIUM | MEDIUM | P2 |
| SearXNG web search | MEDIUM | MEDIUM | P2 |
| Tailscale remote access | MEDIUM | MEDIUM | P2 |
| Transcription editing | LOW | LOW | P2 |
| Multi-turn conversation | MEDIUM | HIGH | P3 |
| Streaming responses | LOW | HIGH | P3 |
| Response history | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch -- the app does not work without these
- P2: Should have, add in v1.x -- meaningful improvements once core works
- P3: Nice to have, future consideration -- only build if usage patterns demand it

## Competitor Feature Analysis

| Feature | Siri / Apple Intelligence | ChatGPT Voice Mode | This Project |
|---------|---------------------------|--------------------|--------------|
| Voice input | Always-listening + wake word | Tap to talk | Tap to talk (simpler, reliable) |
| Knowledge source | Apple services + limited web | GPT training data + web browsing | Personal Obsidian vault + web (unique) |
| Response quality | Shallow, template-based | Deep, conversational | Deep, grounded in personal knowledge |
| Personalization | Learns from Apple services | Conversation memory (paid) | Built on YOUR notes -- maximum personalization |
| Cost | Free (with Apple device) | $20/mo for voice mode | $0 (self-hosted) |
| Privacy | Data sent to Apple/OpenAI | Data sent to OpenAI | Fully local -- data never leaves your network |
| TTS quality | Excellent (Apple voices) | Excellent (custom voices) | Adequate (AVSpeechSynthesizer) |
| Offline capability | Limited Siri | None | None (requires Mac Mini) |
| Multi-turn | Yes | Yes | No (v1) -- independent questions |
| System integration | Deep (calendar, messages, etc.) | None on iOS | None -- this is a knowledge tool, not a system controller |

**Key competitive insight:** This project cannot compete on voice quality, system integration, or conversational fluency. It wins on exactly one axis: **answers grounded in your personal knowledge base, for free, with full privacy.** Every feature decision should reinforce this advantage.

## Sources

- [Groove Technology - Top 16 AI Voice Assistants 2026](https://groovetechnology.com/blog/ai/ai-voice-assistant/) - feature landscape overview
- [eesel.ai - 8 Best Voice Assistant AI Tools 2025](https://www.eesel.ai/blog/best-voice-assistant-ai) - comparison of voice assistant capabilities
- [Tom's Guide - ChatGPT Voice vs Siri](https://www.tomsguide.com/ai/ive-been-using-chatgpt-voice-7-things-it-can-do-the-new-siri-cant) - competitive feature analysis
- [Google Design - VUI Principles](https://design.google/library/speaking-the-same-language-vui) - voice UX patterns
- [Obsidian Forum - RAG Personal AI Bot](https://forum.obsidian.md/t/obsidian-rag-personal-ai-bot/93020) - community patterns for Obsidian RAG
- [dasroot.net - RAG for PKM: Obsidian Integration](https://dasroot.net/posts/2025/12/rag-personal-knowledge-management-obsidian-integration/) - technical patterns
- [Logan Yang - Building Next Gen Personal Knowledge Assistant](https://loganyang.medium.com/building-the-next-generation-personal-knowledge-assistant-for-our-second-brain-c9583db4636c) - second brain assistant concepts

---
*Feature research for: voice-powered personal knowledge assistant*
*Researched: 2026-03-06*
