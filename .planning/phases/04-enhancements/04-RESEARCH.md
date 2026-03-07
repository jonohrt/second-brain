# Phase 4: Enhancements - Research

**Researched:** 2026-03-07
**Domain:** iOS TTS (AVSpeechSynthesizer), source attribution UI
**Confidence:** HIGH

## Summary

Phase 4 adds two independent features to the existing iOS app: (1) text-to-speech readback of LLM responses using Apple's built-in AVSpeechSynthesizer, and (2) displaying which vault notes informed the answer. Both features are iOS-only changes -- no server modifications needed since the /ask endpoint already returns structured source objects with type, path/url, and title fields.

The server already returns `sources: [{ type: "vault", path: string, title: string, similarity: number } | { type: "web", url: string, title: string }]` in every /ask response. The iOS `AskSource` model already decodes `type`, `url`, and `title` fields. The `AskResponse` model already has `sources: [AskSource]?`. However, `path` is not currently decoded -- it needs to be added to `AskSource`. The existing test mock uses a string array for sources which is incorrect vs the actual server response; this should be fixed.

**Primary recommendation:** Implement TTS as a standalone `SpeechService` class wrapping AVSpeechSynthesizer with sentence-level utterance splitting, and add source attribution as a simple filtered list in the response UI. Both features are additive with no changes to existing working code paths.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RESP-03 | User can toggle TTS to have responses read aloud (AVSpeechSynthesizer, sentence-split) | AVSpeechSynthesizer with sentence splitting via NLTokenizer or string splitting; wrap in SpeechService with delegate for state tracking |
| RESP-04 | User sees which vault notes informed the answer (source attribution) | Server already returns vault sources with path+title; add `path` to AskSource model, filter sources by type=="vault", display in UI |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| AVSpeechSynthesizer | iOS 7+ (AVFoundation) | Text-to-speech synthesis | Apple's built-in TTS engine, zero cost, no dependency, works offline |
| NaturalLanguage (NLTokenizer) | iOS 12+ | Sentence boundary detection | Apple's NLP framework for accurate sentence splitting vs naive regex |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AVAudioSession | iOS 7+ (AVFoundation) | Audio routing configuration | Set audio category before TTS playback to ensure speaker output |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AVSpeechSynthesizer | Third-party TTS (e.g., server-side) | AVSpeechSynthesizer is free, offline, already on device -- no reason to add complexity |
| NLTokenizer | Manual string split on "." | NLTokenizer handles abbreviations, decimals, ellipses correctly; naive split does not |

**No additional package dependencies required.** AVFoundation and NaturalLanguage are system frameworks already available on iOS 17+.

## Architecture Patterns

### Recommended Changes to Existing Structure
```
ios/SecondBrain/
├── Services/
│   ├── APIClient.swift          # existing (no changes)
│   ├── AudioRecorder.swift      # existing (no changes)
│   ├── TranscriptionService.swift # existing (no changes)
│   └── SpeechService.swift      # NEW: AVSpeechSynthesizer wrapper
├── Models/
│   └── APIModels.swift          # MODIFY: add `path` to AskSource
├── ViewModels/
│   └── AppViewModel.swift       # MODIFY: add TTS toggle, sources state
└── Views/
    ├── ContentView.swift        # MODIFY: add TTS button, sources section
    └── RecordButton.swift       # existing (no changes)
```

### Pattern 1: SpeechService as NSObject + AVSpeechSynthesizerDelegate
**What:** Wrap AVSpeechSynthesizer in a dedicated service class that conforms to NSObject and AVSpeechSynthesizerDelegate. Split text into sentences, create one AVSpeechUtterance per sentence, queue them all.
**When to use:** Always -- AVSpeechSynthesizerDelegate requires NSObject conformance, and the service needs to track isSpeaking state.
**Example:**
```swift
import AVFoundation
import NaturalLanguage

final class SpeechService: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private(set) var isSpeaking = false
    var onFinished: (() -> Void)?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func speak(_ text: String) {
        stop()
        let sentences = splitIntoSentences(text)
        guard !sentences.isEmpty else { return }
        isSpeaking = true
        for sentence in sentences {
            let utterance = AVSpeechUtterance(string: sentence)
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
            synthesizer.speak(utterance)
        }
    }

    func stop() {
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }
        isSpeaking = false
    }

    private func splitIntoSentences(_ text: String) -> [String] {
        let tokenizer = NLTokenizer(unit: .sentence)
        tokenizer.string = text
        return tokenizer.tokens(for: text.startIndex..<text.endIndex)
            .map { String(text[$0]) }
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    // MARK: - AVSpeechSynthesizerDelegate

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           didFinish utterance: AVSpeechUtterance) {
        // Only mark finished when no more queued utterances
        if !synthesizer.isSpeaking {
            isSpeaking = false
            onFinished?()
        }
    }
}
```

### Pattern 2: Source Attribution via Filtered AskSource Array
**What:** The server already returns sources. Filter for `type == "vault"` and display path/title in the response area.
**When to use:** After every /ask response that contains vault sources.
**Example:**
```swift
// In AppViewModel
var vaultSources: [AskSource] {
    currentSources.filter { $0.type == "vault" }
}

// In ContentView -- below the answer text
if !viewModel.vaultSources.isEmpty {
    Divider()
    VStack(alignment: .leading, spacing: 4) {
        Text("Sources")
            .font(.caption.bold())
            .foregroundColor(.secondary)
        ForEach(viewModel.vaultSources, id: \.path) { source in
            HStack(spacing: 4) {
                Image(systemName: "doc.text")
                    .font(.caption)
                Text(source.title ?? source.path ?? "Unknown")
                    .font(.caption)
            }
            .foregroundColor(.secondary)
        }
    }
    .padding(.horizontal)
}
```

### Anti-Patterns to Avoid
- **Single giant utterance for long text:** AVSpeechSynthesizer can cut off or behave poorly with very long strings. Always split into sentences.
- **Creating a new AVSpeechSynthesizer per speak call:** Reuse one instance. Creating new instances can cause audio session issues.
- **Forgetting to stop TTS when user sends a new question:** Stop any in-progress speech when starting a new question to avoid overlap.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sentence splitting | Regex split on periods | NLTokenizer(unit: .sentence) | Handles abbreviations (Dr., U.S.), decimals (3.14), ellipses correctly |
| Text-to-speech engine | Custom audio synthesis | AVSpeechSynthesizer | Built-in, free, offline, handles queuing |
| Audio session management | Manual audio routing | AVAudioSession.sharedInstance() | System manages interruptions and routing |

## Common Pitfalls

### Pitfall 1: iOS 17 didFinish Delegate Called Prematurely
**What goes wrong:** On iOS 17, `speechSynthesizer(_:didFinish:)` can fire before the utterance is actually finished speaking.
**Why it happens:** Known Apple bug documented in developer forums.
**How to avoid:** Check `synthesizer.isSpeaking` in the delegate callback before updating state. With sentence-level splitting, this is less impactful because subsequent utterances still play. The bug appears mostly resolved in iOS 18+.
**Warning signs:** TTS toggle shows "not speaking" while audio is still playing.

### Pitfall 2: AskSource Model Missing `path` Field
**What goes wrong:** Server returns `{ type: "vault", path: "...", title: "..." }` but the Swift `AskSource` model only decodes `type`, `url`, and `title` -- `path` is missing.
**Why it happens:** Phase 3 only needed the answer text, not the sources details.
**How to avoid:** Add `let path: String?` to `AskSource`. Also fix the test mock which uses a string array `["note.md"]` instead of proper source objects.
**Warning signs:** Sources always show nil path even when server sends them.

### Pitfall 3: Audio Session Conflict with AudioRecorder
**What goes wrong:** TTS playback and microphone recording use the same audio session. Starting recording while TTS is playing (or vice versa) causes one to fail silently.
**Why it happens:** Both AVSpeechSynthesizer and AVAudioRecorder manage AVAudioSession.
**How to avoid:** Stop TTS before starting recording. Stop recording before starting TTS. Enforce this in AppViewModel.
**Warning signs:** No audio output from TTS, or recording produces empty files.

### Pitfall 4: TTS Continues After User Navigates Away or Sends New Question
**What goes wrong:** Speech continues playing in the background when the user has moved on.
**Why it happens:** AVSpeechSynthesizer continues until all queued utterances are spoken.
**How to avoid:** Call `speechService.stop()` in `sendQuestion()` before making the API call. Consider stopping in `startRecording()` too.

### Pitfall 5: AppViewModel Not Storing Sources from Response
**What goes wrong:** Sources are returned from API but discarded -- only `answer` is saved.
**Why it happens:** Current `sendQuestion()` does `answer = response.answer` but ignores `response.sources`.
**How to avoid:** Add `var currentSources: [AskSource] = []` to AppViewModel and populate it from the response.

## Code Examples

### Adding `path` to AskSource
```swift
// APIModels.swift -- updated
struct AskSource: Decodable, Identifiable {
    let type: String?
    let url: String?
    let title: String?
    let path: String?  // NEW: vault note path from server

    var id: String { path ?? url ?? title ?? UUID().uuidString }
}
```

### Audio Session Configuration for TTS
```swift
// Before speaking, ensure audio session is set for playback
func configureTTSAudioSession() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playback, mode: .spokenContent)
    try? session.setActive(true)
}
```

### Updated sendQuestion with Sources and TTS
```swift
func sendQuestion() async {
    let trimmed = transcription.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    speechService.stop()  // Stop any in-progress TTS
    isLoading = true
    error = nil
    do {
        let response = try await apiClient.ask(text: trimmed)
        answer = response.answer
        currentSources = response.sources ?? []
        if isTTSEnabled {
            speechService.speak(response.answer)
        }
    } catch {
        self.error = error.localizedDescription
    }
    isLoading = false
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single AVSpeechUtterance for all text | Sentence-split into multiple utterances | Best practice since iOS 13+ | Prevents cutoff on long responses |
| Manual sentence regex | NLTokenizer(unit: .sentence) | iOS 12+ NaturalLanguage framework | Handles edge cases (abbreviations, numbers) |
| ObservableObject + @Published | @Observable macro | iOS 17 / Swift 5.9 | Already used in project -- SpeechService state should integrate with this |

## Open Questions

1. **TTS Toggle Persistence**
   - What we know: User needs a toggle to enable/disable TTS
   - What's unclear: Should this preference persist across app launches (UserDefaults) or reset each session?
   - Recommendation: Use @AppStorage for persistence -- minimal effort, good UX

2. **Voice Selection**
   - What we know: AVSpeechSynthesisVoice supports multiple voices per language
   - What's unclear: Should user be able to pick a voice, or use system default?
   - Recommendation: Use system default for v1. Voice selection is a v2 enhancement.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | XCTest (bundled with Xcode 16) |
| Config file | ios/project.yml (XcodeGen) |
| Quick run command | `xcodebuild test -project ios/SecondBrain.xcodeproj -scheme SecondBrain -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing SecondBrainTests` |
| Full suite command | `xcodebuild test -project ios/SecondBrain.xcodeproj -scheme SecondBrain -destination 'platform=iOS Simulator,name=iPhone 16'` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RESP-03 | SpeechService splits text into sentences and queues utterances | unit | `xcodebuild test ... -only-testing SecondBrainTests/SpeechServiceTests` | No -- Wave 0 |
| RESP-03 | TTS toggle state reflected in UI | manual-only | Manual: toggle TTS, send question, verify audio plays | N/A |
| RESP-04 | AskSource decodes path field from server response | unit | `xcodebuild test ... -only-testing SecondBrainTests/APIClientTests` | Yes -- needs update |
| RESP-04 | Vault sources displayed in response view | manual-only | Manual: ask vault-related question, verify source titles shown | N/A |

### Sampling Rate
- **Per task commit:** Quick run command (unit tests only)
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green + manual device verification of TTS audio and source display

### Wave 0 Gaps
- [ ] `ios/SecondBrainTests/SpeechServiceTests.swift` -- covers RESP-03 (sentence splitting logic, speak/stop state)
- [ ] Update `ios/SecondBrainTests/APIClientTests.swift` -- fix mock sources from string array to proper AskSource objects, test `path` field decoding

## Sources

### Primary (HIGH confidence)
- [AVSpeechSynthesizer Apple Docs](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer) -- API surface, delegate protocol
- [speechSynthesizer(_:didFinish:) Apple Docs](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizerdelegate/1619700-speechsynthesizer) -- delegate lifecycle
- Project source code: `src/services/ask-pipeline.ts` -- server Source type definition
- Project source code: `ios/SecondBrain/Models/APIModels.swift` -- current Swift models

### Secondary (MEDIUM confidence)
- [Hacking with Swift AVSpeechSynthesizer](https://www.hackingwithswift.com/example-code/media/how-to-convert-text-to-speech-using-avspeechsynthesizer-avspeechutterance-and-avspeechsynthesisvoice) -- usage patterns
- [AVSpeechSynthesizer + SwiftUI Gist](https://gist.github.com/Libranner/052de5f482da046deae0ad6b6bc1b8ef) -- delegate wrapping pattern
- [Apple Developer Forums - iOS 17 Bug](https://developer.apple.com/forums/thread/737685) -- didFinish premature firing

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- AVSpeechSynthesizer is Apple's official TTS, well-documented, stable API
- Architecture: HIGH -- patterns verified against existing codebase structure and official examples
- Pitfalls: HIGH -- iOS 17 bug confirmed via Apple Developer Forums; model gaps confirmed by reading source code

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable Apple frameworks, unlikely to change)
