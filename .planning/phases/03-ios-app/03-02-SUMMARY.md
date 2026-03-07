---
phase: 03-ios-app
plan: 02
subsystem: ios
tags: [swift, swiftui, whisperkit, avfoundation, speech-to-text, voice-input]

# Dependency graph
requires:
  - phase: 03-ios-app
    plan: 01
    provides: "XcodeGen project scaffold, APIClient, API models"
provides:
  - "AudioRecorder wrapping AVAudioEngine for press-hold recording to WAV"
  - "TranscriptionService wrapping WhisperKit for on-device speech-to-text"
  - "AppViewModel orchestrating record -> transcribe -> send -> display flow"
  - "ContentView and RecordButton delivering full SwiftUI user interface"
  - "Reminder intent detection via Apple Reminders integration"
  - "News query routing to SearXNG news category"
affects: [04-01-PLAN]

# Tech tracking
tech-stack:
  added: [WhisperKit (on-device transcription), AVAudioEngine, EventKit (Reminders)]
  patterns: [Observable macro for SwiftUI state, DragGesture for press-hold recording, ATS exception for local HTTP]

key-files:
  created:
    - ios/SecondBrain/Services/AudioRecorder.swift
    - ios/SecondBrain/Services/TranscriptionService.swift
    - ios/SecondBrain/ViewModels/AppViewModel.swift
    - ios/SecondBrain/Views/ContentView.swift
    - ios/SecondBrain/Views/RecordButton.swift
    - ios/SecondBrainTests/TranscriptionServiceTests.swift
    - ios/SecondBrain/Assets.xcassets/AppIcon.appiconset/icon-1024.png
    - ios/Generated/Info.plist
  modified:
    - ios/SecondBrain/SecondBrainApp.swift
    - ios/SecondBrain/Config.swift
    - ios/SecondBrain/Models/APIModels.swift
    - ios/SecondBrain/Services/APIClient.swift
    - ios/project.yml
    - src/services/ask-pipeline.ts
    - src/services/ollama-chat.ts
    - src/server/routes/ask.ts
    - src/server/index.ts

key-decisions:
  - "gemma3:12b-cloud model for fast ~3s response pipeline"
  - "Skip classify step, fetch brain+web in parallel for speed"
  - "ATS exception for HTTP networking to Tailscale Mac Mini"
  - "Let WhisperKit manage its own model cache directory"
  - "Auto-detect reminder intent in /ask for Apple Reminders creation"
  - "Route news queries to SearXNG news category for real articles"
  - "Full-screen response area with compact input bar UI layout"

patterns-established:
  - "DragGesture(minimumDistance: 0) for press-and-hold recording interaction"
  - "Observable macro (@Observable @MainActor) for SwiftUI view model"
  - "Pre-warm LLM on app startup for instant first response"

requirements-completed: [VOICE-01, VOICE-02, VOICE-03, VOICE-04, RESP-01]

# Metrics
duration: manual-verification
completed: 2026-03-06
---

# Phase 3 Plan 2: Voice Input and SwiftUI Interface Summary

**Complete iOS app with press-hold recording, on-device WhisperKit transcription, editable text, API integration, full-screen response display, reminder detection, and news query routing -- verified on physical iPhone**

## Performance

- **Duration:** Multi-session (included device verification and iterative fixes)
- **Tasks:** 4 (3 auto + 1 human-verify)
- **Commits:** 31
- **Files modified:** 21

## Accomplishments

- AudioRecorder wrapping AVAudioEngine for microphone recording to WAV files with tap-based buffer writing
- TranscriptionService wrapping WhisperKit base model for on-device speech-to-text (no network needed)
- AppViewModel orchestrating the full flow: record -> transcribe -> edit -> send -> display with proper loading/error states
- RecordButton with DragGesture press-hold interaction and visual feedback (color change + scale animation)
- ContentView with full-screen scrollable response area, compact input bar, and WhisperKit download progress
- Reminder intent detection -- asking "remind me to..." creates an Apple Reminder automatically
- News query routing to SearXNG news category for current event questions
- Server-side optimizations: parallel brain+web fetch (skip classify), gemma3:12b-cloud model, LLM pre-warming
- App icon added
- Verified working end-to-end on a physical iPhone device

## Task Commits

Core task commits:

1. **Task 1: AudioRecorder and TranscriptionService** - `f4de9d9` (feat)
2. **Task 2: AppViewModel** - `6c2e93d` (feat)
3. **Task 3: SwiftUI views and entry point** - `2a8a19b` (feat)
4. **Task 4: Human verification** - APPROVED on physical device

## Verification Fixes (during device testing)

Iterative fixes applied during human verification on physical iPhone:

- `349ead0` - Add ios/.DS_Store to gitignore
- `6d9cae2` - Add Foundation import, disable code signing for simulator
- `51cba28` - Fix code signing and WhisperKit non-optional return type
- `9b37c30` - Enable automatic code signing for simulator
- `7a9fb30` - Guard against double start/stop recording
- `17fb006` - Allow plain HTTP for Tailscale networking (ATS exception)
- `e433d7f` - Fix missing Info.plist keys preventing device install
- `27d13d7` - Use XcodeGen info key for ATS exception
- `fcb7c54` - Generate Info.plist via XcodeGen with ATS exception
- `e33d4c9` - Fix AskResponse sources type to match server JSON structure
- `47fd02b` - Increase request timeout to 60s for Ollama cloud model
- `6850c04` - Use Ollama cloud model, increase timeouts, keep model warm
- `9e70695` - Switch to glm-5:cloud for faster responses
- `9f45eff` - Use custom URLSession config for proper timeout handling
- `c0b6175` - Skip classify step, fetch brain+web in parallel for speed
- `d72ed14` - Use relative URL construction instead of appendingPathComponent
- `a3ef817` - Disable GENERATE_INFOPLIST_FILE so Xcode uses our ATS plist
- `0d1fa9a` - Add debug logging for decode failures
- `4a2f791` - Dismiss keyboard on Send so response is visible
- `24ada6c` - Switch to gemma3:12b-cloud for fast responses (~3s pipeline)
- `7d4a28f` - Auto-detect capture intent in /ask endpoint
- `d097943` - Auto-detect reminder intent and create Apple Reminders
- `dafba9f` - Redesign UI with full-screen response area, compact input bar
- `2b746a3` - Improve startup UX with pre-warm LLM, fix loading message
- `cd6433b` - Persist WhisperKit model to Documents dir
- `cb1871f` - Revert custom modelFolder, let WhisperKit manage its own cache
- `c63f40f` - Route news queries to SearXNG news category
- `838374a` - Add app icon and scroll response to top on new answer

## Files Created/Modified

**iOS app (created):**
- `ios/SecondBrain/Services/AudioRecorder.swift` - AVAudioEngine wrapper for mic recording to WAV
- `ios/SecondBrain/Services/TranscriptionService.swift` - WhisperKit wrapper for on-device transcription
- `ios/SecondBrain/ViewModels/AppViewModel.swift` - Observable view model orchestrating all app state
- `ios/SecondBrain/Views/ContentView.swift` - Main screen with response area, input bar, record button
- `ios/SecondBrain/Views/RecordButton.swift` - Press-hold circular button with recording animation
- `ios/SecondBrainTests/TranscriptionServiceTests.swift` - Guard logic tests for transcription service
- `ios/SecondBrain/Assets.xcassets/AppIcon.appiconset/` - App icon assets

**iOS app (modified):**
- `ios/SecondBrain/SecondBrainApp.swift` - Wired ContentView as main view
- `ios/SecondBrain/Config.swift` - Updated server URL and timeout config
- `ios/SecondBrain/Models/APIModels.swift` - Fixed sources type to match server JSON
- `ios/SecondBrain/Services/APIClient.swift` - Fixed URL construction, custom URLSession config
- `ios/project.yml` - ATS exception, Info.plist generation, code signing

**Server-side (modified):**
- `src/services/ask-pipeline.ts` - Parallel brain+web fetch, skip classify, capture/reminder detection
- `src/services/ollama-chat.ts` - Model switch to gemma3:12b-cloud, keep_alive tuning
- `src/server/routes/ask.ts` - News category routing, capture intent handling
- `src/server/index.ts` - Route registration updates

## Decisions Made

- **gemma3:12b-cloud model** -- Switched from qwen3.5 through several models to gemma3:12b-cloud for ~3s end-to-end response time
- **Skip classify, parallel fetch** -- Brain and web search run in parallel instead of sequential classify-then-fetch, cutting latency significantly
- **ATS exception** -- Required for HTTP (not HTTPS) networking to local Tailscale Mac Mini
- **WhisperKit manages own cache** -- Letting WhisperKit handle model storage avoids path issues
- **Reminder intent detection** -- Natural language "remind me to..." triggers Apple Reminders via EventKit
- **News query routing** -- Questions about news/current events route to SearXNG news category
- **Full-screen response layout** -- Redesigned from stacked layout to full-screen response area with compact bottom input bar

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ATS exception for HTTP networking**
- **Found during:** Task 4 verification
- **Issue:** iOS blocks plain HTTP by default; Tailscale Mac Mini uses HTTP
- **Fix:** Added NSAppTransportSecurity exception in Info.plist via XcodeGen
- **Commits:** `17fb006`, `27d13d7`, `fcb7c54`, `a3ef817`

**2. [Rule 1 - Bug] APIClient URL construction**
- **Found during:** Task 4 verification
- **Issue:** appendingPathComponent double-encoded the URL path
- **Fix:** Used relative URL construction with URL(string:relativeTo:)
- **Commit:** `d72ed14`

**3. [Rule 1 - Bug] Response JSON decoding**
- **Found during:** Task 4 verification
- **Issue:** AskResponse expected sources as [String] but server sends [{title,path}] objects
- **Fix:** Updated AskResponse.sources type to match server JSON structure
- **Commit:** `e33d4c9`

**4. [Rule 1 - Bug] URLSession timeout handling**
- **Found during:** Task 4 verification
- **Issue:** Default URLSession ignores custom timeout on individual requests
- **Fix:** Created URLSession with custom URLSessionConfiguration for proper timeouts
- **Commit:** `9f45eff`

**5. [Rule 2 - Missing functionality] Keyboard dismissal**
- **Found during:** Task 4 verification
- **Issue:** Keyboard stayed up after tapping Send, covering the response
- **Fix:** Added keyboard dismissal on send action
- **Commit:** `4a2f791`

**6. [Rule 2 - Missing functionality] UI redesign for usability**
- **Found during:** Task 4 verification
- **Issue:** Stacked layout wasted screen space; response area too small
- **Fix:** Redesigned with full-screen response area and compact input bar
- **Commit:** `dafba9f`

**7. [Rule 2 - Missing functionality] Reminder intent detection**
- **Found during:** Task 4 verification
- **Issue:** "Remind me to..." questions returned LLM answers instead of creating reminders
- **Fix:** Auto-detect reminder intent via /ask pipeline, create Apple Reminder via EventKit
- **Commits:** `d097943`

**8. [Rule 2 - Missing functionality] News query routing**
- **Found during:** Task 4 verification
- **Issue:** News questions returned stale web results
- **Fix:** Route news queries to SearXNG news category for current articles
- **Commit:** `c63f40f`

---

**Total deviations:** 8 auto-fixed (4 bugs, 4 missing functionality)
**Impact on plan:** All fixes were discovered during device verification (Task 4). Server-side changes to ask-pipeline and ollama-chat were necessary for acceptable end-to-end performance and UX.

## Issues Encountered

- Multiple model switches (qwen3.5:cloud -> glm-5:cloud -> gemma3:12b-cloud) to find one with acceptable latency on 8GB Mac Mini
- WhisperKit model caching required experimentation (custom path vs letting WhisperKit manage)
- Info.plist generation through XcodeGen required multiple iterations to get ATS exceptions working

## Next Phase Readiness

- All Phase 3 requirements (VOICE-01 through VOICE-04, RESP-01) are complete and verified on device
- RESP-02 (error with retry) was completed in Plan 03-01
- Phase 4 (Enhancements: TTS readback and source attribution) can proceed
- Server-side pipeline is optimized for ~3s response times

## Self-Check: PASSED

- All 6 key Swift files verified on disk
- All 4 key commit hashes verified in git history (f4de9d9, 6c2e93d, 2a8a19b, 838374a)

---
*Phase: 03-ios-app*
*Completed: 2026-03-06*
