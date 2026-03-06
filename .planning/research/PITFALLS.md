# Pitfalls Research

**Domain:** Voice-powered LLM assistant (iOS app + self-hosted Mac Mini API with RAG)
**Researched:** 2026-03-06
**Confidence:** MEDIUM-HIGH (verified via GitHub issues, official docs, community reports)

## Critical Pitfalls

### Pitfall 1: CoreML Memory Leaks Kill iOS App on Long Sessions

**What goes wrong:**
whisper.cpp with CoreML leaks approximately 5-6 MB per transcription call. After 10-20 transcriptions in a session, the app gets terminated by iOS with "Terminated due to memory issue." This is a known, documented bug in whisper.cpp CoreML integration (GitHub issues #1202, #797).

**Why it happens:**
CoreML model inference allocates intermediate buffers that are not fully released between calls. The leak is specific to CoreML -- the CPU-only path does not exhibit this behavior. Developers choose CoreML for the 2-3x speed improvement over Metal and don't test sustained usage patterns.

**How to avoid:**
- Use Metal acceleration instead of CoreML for the iOS app. Metal is slightly slower (2-3x vs CoreML's ANE speedup) but does not have the memory leak. For a voice assistant where each transcription is a single utterance (5-30 seconds), the speed difference is negligible.
- If CoreML is used anyway, implement a `whisper_free()` / reinitialize cycle every N transcriptions to release accumulated memory.
- Set a memory budget watchdog using `os_proc_available_memory()` and force-restart the whisper context when available memory drops below 200 MB.

**Warning signs:**
- Memory usage in Xcode Instruments climbs after each transcription and never returns to baseline.
- App crashes after 15+ minutes of active use with no clear error in app logic.

**Phase to address:**
iOS App phase -- must be validated during initial whisper.cpp integration before building features on top.

---

### Pitfall 2: Audio Format Mismatch Produces Garbage Transcriptions

**What goes wrong:**
whisper.cpp requires 16-bit PCM audio at 16kHz mono. iOS records at 44.1kHz or 48kHz by default in compressed formats (AAC/m4a). If you feed the wrong format, whisper.cpp either crashes, produces empty output, or generates hallucinated text (repeating phrases, phantom words).

**Why it happens:**
`AVAudioRecorder` defaults to AAC encoding. `AVAudioEngine` tap buffers default to the hardware sample rate (48kHz on modern iPhones). Developers wire up recording, get audio data, feed it to whisper, and get plausible-looking but wrong transcriptions -- making it hard to diagnose.

**How to avoid:**
- Configure `AVAudioEngine` input node tap with explicit format: `AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false)`.
- Use `AVAudioConverter` to resample from hardware rate to 16kHz if the input node rejects 16kHz directly.
- Validate audio before feeding to whisper: check sample count matches expected duration, verify amplitude is non-zero.
- Write an integration test that records 3 seconds of silence, feeds to whisper, and verifies empty/minimal output (not hallucinated text).

**Warning signs:**
- Transcriptions contain repeated phrases or unrelated text for short utterances.
- Transcription output is empty for clearly spoken audio.
- Audio duration calculated from sample count does not match wall-clock recording time.

**Phase to address:**
iOS App phase -- this is the very first integration point and must work correctly before anything else.

---

### Pitfall 3: 8GB Mac Mini OOM When Running Embeddings + LLM Simultaneously

**What goes wrong:**
The Mac Mini M2 has 8GB unified memory shared between OS, apps, and GPU. A Q4-quantized 7B model needs ~4-5GB. nomic-embed-text needs ~300MB. If both are loaded simultaneously while the OS and other processes (Docker for SearXNG, the Node.js API server) consume memory, the system swaps heavily or Ollama crashes.

**Why it happens:**
Ollama keeps models loaded in memory for fast subsequent requests (default: 5 minutes). An /ask request that needs both embedding (for RAG retrieval) and LLM generation (for answer) will try to load both models. With SearXNG Docker container (~200-500MB), Node.js server, and macOS overhead, 8GB is extremely tight.

**How to avoid:**
- Set `OLLAMA_KEEP_ALIVE=0` so models are unloaded immediately after use. This adds ~2-3 seconds of model loading time per request but prevents OOM.
- Sequence operations: embed query first, unload embedding model, then load LLM for generation. Never run both concurrently.
- Set `OLLAMA_CONTEXT_LENGTH=2048` to limit context window memory. For a voice assistant with single-turn Q&A (no conversation history), 2048 tokens is sufficient.
- Monitor with `memory_pressure` command -- yellow is acceptable, red means you need to reduce load.
- Consider reducing the local fallback model to 3B (qwen3:3b) instead of 7B for the fallback path.

**Warning signs:**
- Ollama returns 500 errors intermittently under load.
- macOS shows red memory pressure in Activity Monitor.
- Response times spike from seconds to minutes (heavy swapping).
- `dmesg` shows jetsam events.

**Phase to address:**
API Server phase -- must be proven with load testing before building features that depend on reliable responses.

---

### Pitfall 4: RAG Retrieves Irrelevant Context, LLM Confabulates

**What goes wrong:**
The RAG pipeline returns context chunks that are semantically similar to the query embedding but not actually relevant to answering the question. The LLM then incorporates this irrelevant context into its answer, producing confident-sounding but wrong responses grounded in unrelated notes.

**Why it happens:**
The existing system stores full vault entries as single embeddings (see `supabase.ts` -- one embedding per `context_entry`). An Obsidian note about "Python project setup" and a question about "setting up the project" have high cosine similarity despite being about completely different things. The embedding model (nomic-embed-text) is general-purpose and encodes topic + structure similarly for different domains.

**How to avoid:**
- Add a relevance threshold to `searchByEmbedding` -- reject results below cosine similarity 0.7 (experiment with threshold). The current `match_context_entries` RPC returns all `match_count` results regardless of similarity score.
- Include similarity scores in the RAG context passed to the LLM, and instruct the LLM: "If retrieved context seems unrelated to the question, ignore it and answer from general knowledge."
- Prepend entry type and title as metadata to each chunk: `[voice-memo: "Python setup notes"] ...content...` so the LLM can assess relevance.
- For longer notes, chunk before embedding rather than embedding the entire document. Use 512-token recursive splitting with 50-token overlap as a starting point.

**Warning signs:**
- Answers reference notes you did not expect to be related.
- Questions about recent topics pull old, unrelated notes.
- The LLM prefaces answers with hedging like "Based on your notes about X" where X is not what you asked about.

**Phase to address:**
RAG Pipeline phase -- needs tuning before the LLM generation layer is added.

---

### Pitfall 5: Ollama Cloud Model Disappears Without Warning

**What goes wrong:**
`qwen3.5:cloud` routes through Ollama's free cloud tier. The free tier has undocumented rate limits and no SLA. The model tag could be removed, rate-limited, or the cloud service could change terms at any time. The app becomes non-functional if the primary model path breaks and there is no working fallback.

**Why it happens:**
Building on a free cloud service without contractual guarantees. The Ollama cloud pricing page exists but does not specify exact rate limits for the free tier, suggesting they are subject to change.

**How to avoid:**
- Build the fallback path (local 7B/3B model) FIRST, not as an afterthought. The local model should be the default, with cloud as an upgrade path.
- Implement model availability checking at startup: call Ollama's `/api/tags` to verify the cloud model is accessible, and fall back immediately if not.
- Design the prompt template to work with both model capabilities -- qwen3.5:cloud and a local 3B model have very different instruction-following ability. Test both paths in development.
- Cache the last-known-good model name in config so the fallback does not require code changes.

**Warning signs:**
- `ollama run qwen3.5:cloud` starts returning errors or empty responses.
- Response quality degrades suddenly (rate limiting may return truncated outputs before full blocking).

**Phase to address:**
API Server phase -- fallback logic must be built into the initial /ask endpoint design.

---

### Pitfall 6: AVSpeechSynthesizer Cuts Off Long Responses

**What goes wrong:**
AVSpeechSynthesizer on iOS 17+ has a documented regression where it stops speaking prematurely on long strings, especially with "Enhanced" voices. For an LLM assistant returning multi-paragraph answers, speech cuts off mid-sentence.

**Why it happens:**
Apple bug in AVFoundation (reported across iOS 16, 17, and later). The synthesizer drops the remaining utterance buffer without calling the `didFinish` delegate method, so the app does not know speech was interrupted.

**How to avoid:**
- Split LLM responses into sentences or short paragraphs and queue them as separate `AVSpeechUtterance` objects (one per sentence). This works around the long-string bug.
- Hold a strong reference to `AVSpeechSynthesizer` for the entire app lifecycle -- weak references cause premature deallocation and silent failures.
- Use system default voices rather than "Enhanced" or "Premium" downloaded voices, which trigger the bug more frequently.
- Implement a watchdog: if `didFinish` is not called within `expectedDuration * 1.5`, force-restart the remaining utterances.
- Test with responses of 500+ words before considering TTS "done."

**Warning signs:**
- TTS works for short responses ("The weather is sunny") but fails for longer answers.
- No error or delegate callback when speech stops -- it just goes silent.

**Phase to address:**
iOS App TTS phase -- must be tested with realistic LLM response lengths, not just short test strings.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Embedding full documents instead of chunks | Simpler pipeline, matches existing `upsertEntry` | Poor retrieval precision as vault grows past ~500 notes | MVP only -- chunk before beta |
| Hardcoded Ollama model names | Faster development | Breaks when models update or cloud model changes | Never -- use config from day one |
| No request timeout on Ollama calls | Simpler code | A stuck model inference blocks the API server indefinitely | Never -- 30s timeout minimum |
| Skipping audio format validation | Fewer lines of code in iOS | Silent transcription failures that are hard to diagnose | Never -- validate on every recording |
| Single SearXNG engine (Google only) | Simpler config, faster results | Google blocks your IP, search stops working entirely | MVP only -- add 3+ engines before relying on it |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| whisper.cpp via Swift | Importing whisper.cpp as source files | Use the official XCFramework or SPM package -- manual source compilation leads to missing Metal shaders and incorrect build settings |
| Ollama API | Using `/api/generate` for chat | Use `/api/chat` with message array format -- `/api/generate` is for completions and handles system prompts differently |
| Supabase vector search | Not passing embedding dimension in RPC | Ensure `match_context_entries` function signature matches your embedding dimension (nomic-embed-text = 768 dims) |
| SearXNG JSON API | Fetching HTML search page | Use `format=json` query parameter: `http://localhost:8080/search?q=query&format=json` -- the HTML page is not parseable |
| AVAudioSession | Setting category to `.record` | Use `.playAndRecord` with `.defaultToSpeaker` option -- `.record` disables audio output, breaking TTS |
| Tailscale | Exposing via Tailscale Funnel for public access | Use Tailscale for device-to-device mesh (iOS to Mac Mini) -- both devices must be on your tailnet, no public exposure needed |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading whisper model on every transcription | 2-5 second delay before each transcription starts | Load model once at app launch, keep in memory | Immediately noticeable on first use |
| Ollama model reload per request (KEEP_ALIVE=0) | 2-3 second cold start per request | Accept the tradeoff on 8GB machine, or use KEEP_ALIVE=30s if memory allows | Every request, but acceptable for single-user |
| SearXNG querying all 70+ default engines | 10-15 second search response time | Enable only 5-8 reliable engines (Google, Bing, DuckDuckGo, Wikipedia, Brave) | With default config |
| Embedding query + all retrieved chunks separately | N+1 Ollama calls per /ask request | Only embed the query; retrieved chunks already have stored embeddings | When retrieving 10+ chunks |
| Not streaming LLM response to TTS | User waits for complete LLM response before hearing anything | Send first sentence to TTS while LLM continues generating (out of scope for v1, but design API to support it later) | Responses longer than ~50 words |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing Ollama port (11434) directly to internet | Anyone can run arbitrary model inference on your Mac Mini | Bind Ollama to localhost only; access through your API server which handles auth |
| SearXNG without rate limiting | Automated abuse if accidentally exposed | Bind to localhost, access only through API server; add basic API key to your server |
| No authentication on /ask and /capture endpoints | Anyone on your tailnet (or network) can use your API | Add a simple bearer token or API key -- even a static secret in config is sufficient for single-user |
| Storing Supabase service key in iOS app binary | Key can be extracted from IPA, granting full DB access | iOS app should only talk to your Mac Mini API; never embed Supabase credentials in the mobile app |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No feedback during whisper transcription | User thinks app froze; re-records | Show a "Transcribing..." spinner with elapsed time; whisper base model takes 1-3 seconds for short utterances |
| Showing raw LLM output including thinking tokens | Confusing `<think>` blocks or reasoning traces visible to user | Strip model-specific tokens (qwen3.5 uses `<think>` tags) before displaying |
| Playing TTS immediately without visual indicator | User misses start of audio response | Show text first, then offer play button OR brief "Speaking..." indicator before audio starts |
| No indication of which source answered (brain vs web) | User cannot assess trustworthiness of answer | Tag response with source: "From your notes" vs "From web search" vs "General knowledge" |
| Recording starts instantly on button press | Captures the tap sound and initial breath | Add 200ms delay before starting recording, or trim first 200ms of audio |

## "Looks Done But Isn't" Checklist

- [ ] **whisper.cpp integration:** Transcription works for English but fails for names, technical terms, URLs -- test with domain-specific vocabulary and consider adding an initial prompt with common terms
- [ ] **RAG retrieval:** Returns results but does not filter by relevance score -- verify similarity threshold rejects genuinely unrelated notes
- [ ] **SearXNG search:** Returns results in development but engines get rate-limited after a few days of real use -- test sustained usage over a week
- [ ] **TTS playback:** Works for short text but cuts off on long LLM responses -- test with 500+ word responses
- [ ] **Remote access:** Works on local network but not tested through Tailscale from cellular -- verify with phone on LTE, not Wi-Fi
- [ ] **Error handling:** /ask returns answers but 500-errors on Ollama timeout are unhandled -- verify graceful degradation for every failure mode
- [ ] **Audio session:** Recording works but kills any background audio (music, podcasts) -- configure `AVAudioSession` with `.duckOthers` or `.mixWithOthers` if desired
- [ ] **Model fallback:** Cloud model works but local fallback has never been tested with the same prompt template -- test both paths with identical queries

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| CoreML memory leak crashes | LOW | Switch to Metal acceleration; one build setting change |
| Wrong audio format feeding whisper | LOW | Fix AVAudioEngine format config; no data loss |
| OOM on Mac Mini | MEDIUM | Restructure to sequential model loading; may need to adjust API server architecture |
| Poor RAG retrieval quality | MEDIUM | Add chunking pipeline to re-process vault entries; requires re-embedding all documents |
| Cloud model discontinued | LOW if fallback exists | Switch to local model; quality degrades but app works |
| AVSpeechSynthesizer regression | LOW | Implement sentence-splitting workaround; no architecture change |
| SearXNG engines blocked | LOW | Rotate engines in config; add more backup engines |
| No API authentication added late | MEDIUM | Retrofit auth middleware; update iOS app to send token; coordinate deployment |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| CoreML memory leaks | iOS App (whisper integration) | Run 50 consecutive transcriptions in Instruments; memory stays under 500MB |
| Audio format mismatch | iOS App (recording setup) | Integration test: record, transcribe "hello world", verify exact output |
| Mac Mini OOM | API Server (Ollama integration) | Run 20 sequential /ask requests with `memory_pressure` monitoring; no red pressure |
| RAG retrieval quality | RAG Pipeline | Query 10 known questions against vault; verify top-3 results are genuinely relevant |
| Cloud model disappears | API Server (model routing) | Kill network, send /ask request, verify local fallback returns an answer |
| TTS cuts off | iOS App (TTS integration) | Feed 500-word LLM response to TTS; verify complete playback via `didFinish` delegate |
| SearXNG rate limiting | API Server (search integration) | Run 50 searches in 10 minutes; verify no 429 errors from upstream engines |
| No authentication | API Server (initial setup) | Attempt /ask without token from another device; verify 401 response |

## Sources

- [whisper.cpp CoreML memory leak - Issue #1202](https://github.com/ggml-org/whisper.cpp/issues/1202)
- [whisper.cpp CoreML increasing memory - Issue #797](https://github.com/ggml-org/whisper.cpp/issues/797)
- [whisper.cpp CoreML app size inflation - Issue #2160](https://github.com/ggml-org/whisper.cpp/issues/2160)
- [whisper.cpp iOS CoreML crash - Issue #775](https://github.com/ggerganov/whisper.cpp/issues/775)
- [whisper.cpp GPU init failure on M5 - Issue #3560](https://github.com/ggml-org/whisper.cpp/issues/3560)
- [AVSpeechSynthesizer broken on iOS 17 - Apple Developer Forums](https://developer.apple.com/forums/thread/738048)
- [AVSpeechSynthesizer broken on iOS - Apple Developer Forums](https://developer.apple.com/forums/thread/737685)
- [Ollama context length docs](https://docs.ollama.com/context-length)
- [Ollama VRAM requirements guide](https://localllm.in/blog/ollama-vram-requirements-for-local-llms)
- [Qwen 2.5 7B on 8GB RAM guide](https://localaimaster.com/models/qwen-2-5-7b)
- [SearXNG self-hosting guide](https://chris-young.net/self-hosted-searching-with-searxng/)
- [SearXNG + Tailscale setup](https://hostbor.com/private-search-searxng-tailscale/)
- [Chunking strategies for RAG - Weaviate](https://weaviate.io/blog/chunking-strategies-for-rag)
- [RAG chunking impact on retrieval - Stack Overflow Blog](https://stackoverflow.blog/2024/12/27/breaking-up-is-hard-to-do-chunking-in-rag-applications/)
- [Tailscale vs Cloudflare Tunnel comparison](https://onidel.com/blog/tailscale-cloudflare-nginx-vps-2025)
- [Haptic feedback AVAudioSession conflicts](https://medium.com/@mi9nxi/haptic-feedback-and-avaudiosession-conflicts-in-ios-troubleshooting-recording-issues-666fae35bfc6)

---
*Pitfalls research for: Voice-powered LLM assistant (iOS + Mac Mini)*
*Researched: 2026-03-06*
