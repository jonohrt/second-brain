# Phase 3: iOS App - Research

**Researched:** 2026-03-06
**Domain:** iOS native app (SwiftUI + WhisperKit + HTTP networking)
**Confidence:** HIGH

## Summary

This phase builds a native iOS app that records audio via press-and-hold, transcribes it on-device using WhisperKit, lets the user edit the transcription, sends it to the Mac Mini server (Fastify on Tailscale), and displays the LLM response. The server API is already complete: `POST /ask` accepts `{ text }` with bearer auth and returns `{ answer, sources, route, model }`, and `POST /capture` accepts `{ text, title?, type?, tags? }`.

WhisperKit is the clear choice for on-device transcription -- it is a pure Swift package, uses CoreML/ANE for fast inference, supports iOS 16+, and automatically downloads the best model for the device. Apple's new SpeechAnalyzer (WWDC 2025) requires iOS 26 and is not yet stable, so it is not appropriate for this project.

The app architecture uses SwiftUI with the `@Observable` macro (iOS 17+), async/await for networking, and AVAudioEngine for audio capture. The app is simple enough that a single Xcode project with 4-5 files is sufficient -- no need for complex multi-module architecture.

**Primary recommendation:** Build a minimal SwiftUI app targeting iOS 17+ with WhisperKit for transcription, URLSession async/await for API calls, and AVAudioEngine for audio recording. Use `@Observable` view models.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VOICE-01 | User can press and hold to record audio with visual feedback | SwiftUI `.onLongPressGesture` + DragGesture combo or `.gesture(LongPressGesture().sequenced(before: DragGesture()))` for press-hold-release; AVAudioEngine for mic capture; NSMicrophoneUsageDescription in Info.plist |
| VOICE-02 | Audio is transcribed on-device via WhisperKit (base model) | WhisperKit SPM package, `WhisperKitConfig(model: "base")`, `pipe.transcribe(audioPath:)` -- works offline, ~180MB RAM |
| VOICE-03 | User sees a loading indicator while waiting for server response | SwiftUI `ProgressView()` bound to `@Observable` viewmodel loading state |
| VOICE-04 | User can edit transcribed text before sending to server | SwiftUI `TextEditor` or `TextField` bound to transcription text state, with a Send button |
| RESP-01 | User sees LLM answer as scrollable text | SwiftUI `ScrollView { Text(answer) }` with markdown rendering via `Text(attributedString)` |
| RESP-02 | User sees error messages with retry button | Error state in viewmodel, conditional view with error message + `Button("Retry")` that re-triggers the request |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SwiftUI | iOS 17+ | UI framework | Native Apple, declarative, modern |
| WhisperKit | 0.9.0+ | On-device speech-to-text | Pure Swift, CoreML/ANE optimized, auto model selection |
| AVAudioEngine | Built-in | Audio recording from microphone | Low-level control, buffer access for WhisperKit |
| URLSession | Built-in | HTTP networking to Mac Mini API | Native async/await support, no dependency needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| SwiftUI Observation | iOS 17+ | `@Observable` macro for view models | All view model state management |
| AVFoundation | Built-in | Audio session configuration | Setting up mic recording category |
| Foundation | Built-in | JSONEncoder/JSONDecoder, URL | API request/response serialization |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| WhisperKit | Apple SpeechAnalyzer | Requires iOS 26 (beta only) -- not viable yet |
| WhisperKit | SwiftWhisper | Less maintained, WhisperKit is Argmax's flagship |
| URLSession | Alamofire | Overkill for 2 endpoints, adds dependency |
| AVAudioEngine | AVAudioRecorder | AVAudioRecorder writes to file; AVAudioEngine gives buffer access for real-time processing |

**Installation (via Xcode SPM):**
```
Package URL: https://github.com/argmaxinc/WhisperKit.git
Version: from 0.9.0
Product: WhisperKit
```

No other external dependencies needed -- everything else is system frameworks.

## Architecture Patterns

### Recommended Project Structure
```
SecondBrain/
├── SecondBrainApp.swift          # @main entry point
├── Views/
│   ├── ContentView.swift         # Main screen with record button + response area
│   └── TranscriptionEditView.swift  # Edit transcription before sending (could be inline)
├── ViewModels/
│   └── AppViewModel.swift        # @Observable: recording state, transcription, API calls
├── Services/
│   ├── AudioRecorder.swift       # AVAudioEngine wrapper, saves WAV for WhisperKit
│   ├── TranscriptionService.swift # WhisperKit wrapper, transcribe audio file
│   └── APIClient.swift           # URLSession calls to /ask and /capture
├── Models/
│   └── APIModels.swift           # Codable request/response types
├── Config.swift                  # Server URL, API token (from Keychain or config)
└── Info.plist                    # NSMicrophoneUsageDescription
```

### Pattern 1: Press-and-Hold Recording
**What:** User presses and holds a button to record; releasing stops recording and triggers transcription.
**When to use:** VOICE-01 implementation.
**Example:**
```swift
// SwiftUI gesture pattern for press-and-hold recording
struct RecordButton: View {
    @State private var isRecording = false
    let onStart: () -> Void
    let onStop: () -> Void

    var body: some View {
        Circle()
            .fill(isRecording ? Color.red : Color.blue)
            .frame(width: 80, height: 80)
            .scaleEffect(isRecording ? 1.2 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: isRecording)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        if !isRecording {
                            isRecording = true
                            onStart()
                        }
                    }
                    .onEnded { _ in
                        isRecording = false
                        onStop()
                    }
            )
    }
}
```

### Pattern 2: @Observable ViewModel with Async Networking
**What:** Single view model holds all app state, uses async/await for API calls.
**When to use:** All state management and networking.
**Example:**
```swift
import Observation

@Observable
@MainActor
class AppViewModel {
    var transcription: String = ""
    var answer: String = ""
    var isRecording = false
    var isTranscribing = false
    var isLoading = false
    var error: String?

    private let apiClient: APIClient
    private let recorder: AudioRecorder
    private let transcriber: TranscriptionService

    func sendQuestion() async {
        isLoading = true
        error = nil
        do {
            let response = try await apiClient.ask(text: transcription)
            answer = response.answer
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func retry() async {
        await sendQuestion()
    }
}
```

### Pattern 3: API Client with Bearer Auth
**What:** Simple URLSession wrapper that adds bearer token to all requests.
**When to use:** All server communication.
**Example:**
```swift
struct APIClient {
    let baseURL: URL    // e.g. http://100.x.x.x:3000 (Tailscale IP)
    let apiToken: String

    func ask(text: String) async throws -> AskResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("ask"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(AskRequest(text: text))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.requestFailed
        }
        return try JSONDecoder().decode(AskResponse.self, from: data)
    }
}
```

### Anti-Patterns to Avoid
- **Recording to file then re-reading:** AVAudioEngine can write directly to a temp WAV; do not use AVAudioRecorder separately then pass to WhisperKit -- just save the buffer to a temp file and transcribe.
- **Blocking the main thread during transcription:** WhisperKit transcription is async but CPU-intensive -- always run in a Task, show a spinner.
- **Hardcoding server URL:** Store the Tailscale IP and API token in app configuration, not in source code. Use a simple Config struct or UserDefaults for now (this is a personal app, not App Store).
- **Over-engineering the architecture:** This is a single-purpose personal app with 2 API calls. Do not add Combine, dependency injection frameworks, or coordinator patterns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Speech-to-text | Custom Whisper model loading | WhisperKit | Handles CoreML compilation, model download, ANE optimization |
| Audio format conversion | PCM buffer to WAV conversion | AVAudioEngine + temp file | WhisperKit accepts file paths in wav/mp3/m4a/flac |
| Auth token header injection | Manual header building per request | Single APIClient helper | Consistent, single place to change |
| JSON serialization | Manual dictionary building | Codable structs | Type-safe, compiler-checked |

**Key insight:** WhisperKit abstracts away all the complexity of model downloading, CoreML compilation, and audio preprocessing. Use it as a black box -- pass audio file path, get text back.

## Common Pitfalls

### Pitfall 1: WhisperKit Model Download on First Launch
**What goes wrong:** First app launch takes 30+ seconds as WhisperKit downloads the model (~142MB for base).
**Why it happens:** Models are not bundled in the app binary; they download from HuggingFace on first use.
**How to avoid:** Show a one-time "Downloading speech model..." progress indicator on first launch. Initialize WhisperKit early (in app init or onAppear of root view). Consider pre-specifying `model: "base"` to avoid downloading a larger model.
**Warning signs:** App appears frozen on first launch with no feedback.

### Pitfall 2: Microphone Permission Not Requested
**What goes wrong:** App crashes or silently fails to record.
**Why it happens:** Missing NSMicrophoneUsageDescription in Info.plist, or not calling `AVAudioSession.sharedInstance().requestRecordPermission()`.
**How to avoid:** Add Info.plist key AND request permission before first recording attempt. Handle denial gracefully with a message directing to Settings.
**Warning signs:** Recording starts but audio buffers are empty/silent.

### Pitfall 3: Audio Session Category Misconfiguration
**What goes wrong:** Recording works but playback or other apps' audio breaks.
**Why it happens:** Not setting the correct AVAudioSession category.
**How to avoid:** Set category to `.playAndRecord` with `.defaultToSpeaker` option before recording.
**Warning signs:** Audio from other apps stops when your app opens.

### Pitfall 4: Tailscale Connection Timeout
**What goes wrong:** API calls hang for 60+ seconds then fail.
**Why it happens:** Tailscale VPN not active on iPhone, or Mac Mini is asleep/offline.
**How to avoid:** Set a reasonable URLSession timeout (15 seconds). Show clear error messages distinguishing "cannot reach server" from "server error". Consider a health check on app launch.
**Warning signs:** Works on local WiFi but not remotely.

### Pitfall 5: Main Thread Blocking During Transcription
**What goes wrong:** UI freezes for 2-5 seconds during WhisperKit transcription.
**Why it happens:** Calling `transcribe()` on main actor without proper async handling.
**How to avoid:** Run transcription in a detached Task or on a background actor. Show "Transcribing..." indicator.
**Warning signs:** Record button animation stutters after release.

## Code Examples

### Audio Recording with AVAudioEngine
```swift
// Source: AVFoundation documentation + community patterns
class AudioRecorder {
    private let engine = AVAudioEngine()
    private var audioFile: AVAudioFile?

    func startRecording() throws -> URL {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, options: .defaultToSpeaker)
        try session.setActive(true)

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("recording.wav")

        let inputNode = engine.inputNode
        let format = inputNode.outputFormat(forBus: 0)

        audioFile = try AVAudioFile(
            forWriting: url,
            settings: format.settings
        )

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) {
            [weak self] buffer, _ in
            try? self?.audioFile?.write(from: buffer)
        }

        engine.prepare()
        try engine.start()
        return url
    }

    func stopRecording() -> URL? {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        audioFile = nil
        return FileManager.default.temporaryDirectory
            .appendingPathComponent("recording.wav")
    }
}
```

### WhisperKit Transcription
```swift
// Source: WhisperKit GitHub README
import WhisperKit

class TranscriptionService {
    private var whisperKit: WhisperKit?

    func initialize() async throws {
        // Downloads model on first run (~142MB for base)
        let config = WhisperKitConfig(model: "base")
        whisperKit = try await WhisperKit(config)
    }

    func transcribe(audioURL: URL) async throws -> String {
        guard let pipe = whisperKit else {
            throw TranscriptionError.notInitialized
        }
        let results = try await pipe.transcribe(audioPath: audioURL.path)
        return results?.text ?? ""
    }
}
```

### API Response Models (matching server)
```swift
// Matches Fastify /ask and /capture response shapes
struct AskRequest: Encodable {
    let text: String
}

struct AskResponse: Decodable {
    let answer: String
    let sources: [String]?
    let route: String?
    let model: String?
}

struct AskErrorResponse: Decodable {
    let error: String
    let message: String?
}

struct CaptureRequest: Encodable {
    let text: String
    let title: String?
    let type: String?
    let tags: [String]?
}

struct CaptureResponse: Decodable {
    let success: Bool
    let title: String?
    let vaultPath: String?
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SFSpeechRecognizer | WhisperKit / SpeechAnalyzer | 2024-2025 | On-device, no Apple server dependency, better accuracy |
| @Published + ObservableObject | @Observable macro | iOS 17 (2023) | Simpler syntax, better performance, no Combine needed |
| Completion handlers | async/await | Swift 5.5 (2021) | Cleaner networking code, structured concurrency |
| Storyboard/UIKit | SwiftUI | iOS 13+ (mature by iOS 17) | Declarative UI, less boilerplate |

**Deprecated/outdated:**
- `SFSpeechRecognizer`: Requires network for best accuracy, limited offline. Still works but WhisperKit is better for this use case.
- `@ObservedObject` / `@StateObject` with `ObservableObject`: Replaced by `@Observable` macro in iOS 17+. Still works but adds unnecessary Combine dependency.
- `URLSession` completion handlers: Replaced by async/await overloads. No reason to use callbacks anymore.

## Open Questions

1. **WhisperKit model variant for iPhone**
   - What we know: "base" model is ~142MB RAM, auto-selection picks device-appropriate model
   - What's unclear: Whether `base` or `base.en` is better for English-only use (`.en` variants are faster for English)
   - Recommendation: Start with auto-selection (no model specified), test performance, then pin to `base.en` if English-only is confirmed

2. **Server URL configuration**
   - What we know: Mac Mini is on Tailscale with a stable IP; server runs on port 3000
   - What's unclear: Whether to use Tailscale IP directly or MagicDNS hostname
   - Recommendation: Use Tailscale IP for simplicity (e.g., `http://100.x.x.x:3000`). Store in a Config struct, changeable in a settings view later if needed.

3. **API token storage**
   - What we know: Server requires bearer token auth; this is a personal app not on App Store
   - What's unclear: Whether to use Keychain, UserDefaults, or hardcode for personal use
   - Recommendation: Hardcode in a Config.swift file for v1. This is a personal-use app with a private API. Keychain is overkill.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Xcode XCTest (built-in) |
| Config file | auto-generated by Xcode project |
| Quick run command | `xcodebuild test -scheme SecondBrain -destination 'platform=iOS Simulator,name=iPhone 16'` |
| Full suite command | `xcodebuild test -scheme SecondBrain -destination 'platform=iOS Simulator,name=iPhone 16'` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOICE-01 | Press-hold records audio with visual feedback | manual-only | Manual: run on device, verify button animation and recording | N/A -- UI gesture requires device |
| VOICE-02 | On-device transcription via WhisperKit | unit | `xcodebuild test -scheme SecondBrain -only-testing:SecondBrainTests/TranscriptionServiceTests` | Wave 0 |
| VOICE-03 | Loading indicator during server request | manual-only | Manual: verify ProgressView appears during /ask call | N/A -- visual verification |
| VOICE-04 | Edit transcribed text before sending | manual-only | Manual: verify TextEditor is editable after transcription | N/A -- UI interaction |
| RESP-01 | LLM answer as scrollable text | manual-only | Manual: verify ScrollView with long response | N/A -- visual verification |
| RESP-02 | Error messages with retry button | unit | `xcodebuild test -scheme SecondBrain -only-testing:SecondBrainTests/APIClientTests` | Wave 0 |

### Sampling Rate
- **Per task commit:** Build succeeds (`xcodebuild build -scheme SecondBrain`)
- **Per wave merge:** Full test suite + manual device test
- **Phase gate:** All unit tests green, manual walkthrough of all 6 requirements on device/simulator

### Wave 0 Gaps
- [ ] Xcode project creation (SecondBrain.xcodeproj) -- entire project is new
- [ ] `SecondBrainTests/APIClientTests.swift` -- covers RESP-02 (error handling, retry)
- [ ] `SecondBrainTests/TranscriptionServiceTests.swift` -- covers VOICE-02 (mock WhisperKit)
- [ ] Test bundle target in Xcode project

Note: Most requirements (VOICE-01, VOICE-03, VOICE-04, RESP-01) are UI behaviors best validated by manual testing on device/simulator. Unit tests focus on testable logic: API client error handling and transcription service integration.

## Sources

### Primary (HIGH confidence)
- [WhisperKit GitHub](https://github.com/argmaxinc/WhisperKit) - Package.swift platform requirements (iOS 16+), API usage, model selection
- [WhisperKit Package.swift](https://github.com/argmaxinc/WhisperKit/blob/main/Package.swift) - Exact platform versions: iOS .v16, macOS .v13
- Server source code (local): `src/server/routes/ask.ts`, `src/server/routes/capture.ts` - API contract

### Secondary (MEDIUM confidence)
- [Apple SpeechAnalyzer docs](https://developer.apple.com/documentation/speech/speechanalyzer) - Requires iOS 26, not suitable
- [SwiftUI MVVM + async/await patterns](https://khush7068.medium.com/building-a-swiftui-app-with-mvvm-and-async-await-for-networking-ef777b2bf7e8) - Architecture patterns
- [AVAudioEngine recording patterns](https://www.hackingwithswift.com/read/33/2/recording-from-the-microphone-with-avaudiorecorder) - Audio recording setup

### Tertiary (LOW confidence)
- WhisperKit base model exact download size (~142MB) -- referenced in project docs but not verified against HuggingFace manifest

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - WhisperKit is well-documented, SwiftUI/URLSession are stable Apple frameworks
- Architecture: HIGH - Simple app with proven patterns, no novel architecture needed
- Pitfalls: HIGH - Well-known iOS audio/permission patterns, WhisperKit first-run behavior documented

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable -- WhisperKit and SwiftUI are mature)
