---
phase: 04-enhancements
plan: 01
subsystem: ui
tags: [tts, avspeechsynthesizer, nltokenizer, source-attribution, swiftui]

# Dependency graph
requires:
  - phase: 03-ios-app
    provides: SwiftUI app with AppViewModel, ContentView, APIModels, and APIClient
provides:
  - SpeechService with AVSpeechSynthesizer and NLTokenizer sentence splitting
  - TTS toggle in AppViewModel and ContentView header
  - AskSource.path field for vault source identification
  - Source attribution UI showing vault note titles below answers
affects: []

# Tech tracking
tech-stack:
  added: [AVFoundation, NaturalLanguage]
  patterns: [sentence-level TTS utterance queuing, NLTokenizer sentence boundary detection, computed property filtering for vault sources]

key-files:
  created:
    - ios/SecondBrain/Services/SpeechService.swift
    - ios/SecondBrainTests/SpeechServiceTests.swift
  modified:
    - ios/SecondBrain/Models/APIModels.swift
    - ios/SecondBrain/ViewModels/AppViewModel.swift
    - ios/SecondBrain/Views/ContentView.swift
    - ios/SecondBrainTests/APIClientTests.swift

key-decisions:
  - "NLTokenizer for sentence splitting instead of regex -- handles abbreviations (Dr., Mr.) correctly"
  - "SpeechService queues one AVSpeechUtterance per sentence to avoid iOS cutoff on long text"
  - "TTS stops on new recording, new question, or toggle off -- three cancellation paths"

patterns-established:
  - "Service delegation: SpeechService uses NSObject + AVSpeechSynthesizerDelegate for speech lifecycle"
  - "Computed property filtering: vaultSources filters currentSources by type for UI binding"

requirements-completed: [RESP-03, RESP-04]

# Metrics
duration: multi-session
completed: 2026-03-07
---

# Phase 4 Plan 01: TTS and Source Attribution Summary

**AVSpeechSynthesizer TTS with NLTokenizer sentence splitting and vault source attribution display below answers**

## Performance

- **Duration:** Multi-session (includes device verification checkpoint)
- **Tasks:** 3 (2 auto + 1 human-verify)
- **Files modified:** 6

## Accomplishments
- SpeechService wraps AVSpeechSynthesizer with sentence-level utterance queuing via NLTokenizer
- TTS toggle in header starts/stops speech, auto-stops on new recording or new question
- AskSource gains path field with Identifiable conformance for vault source identification
- Source attribution section displays vault note titles below answers when present
- Fixed broken APIClientTests mock (string array replaced with proper AskSource objects)

## Task Commits

Each task was committed atomically:

1. **Task 1: SpeechService, AskSource path field, and tests** - `e7a9b0b` (feat)
2. **Task 2: Wire TTS and source attribution into ViewModel and UI** - `592aea9` (feat)
3. **Task 3: Device verification of TTS and source attribution** - approved (checkpoint, no commit)

## Files Created/Modified
- `ios/SecondBrain/Services/SpeechService.swift` - AVSpeechSynthesizer wrapper with sentence splitting via NLTokenizer
- `ios/SecondBrain/Models/APIModels.swift` - Added path field and Identifiable conformance to AskSource
- `ios/SecondBrain/ViewModels/AppViewModel.swift` - TTS toggle state, speechService integration, currentSources/vaultSources
- `ios/SecondBrain/Views/ContentView.swift` - TTS toggle button in header, vault sources section below answer
- `ios/SecondBrainTests/SpeechServiceTests.swift` - Unit tests for sentence splitting (multi-sentence, empty, single, abbreviation)
- `ios/SecondBrainTests/APIClientTests.swift` - Fixed mock to use proper AskSource objects, added path field test

## Decisions Made
- NLTokenizer for sentence splitting instead of regex -- handles abbreviations correctly
- SpeechService queues one AVSpeechUtterance per sentence to avoid iOS cutoff on long text
- TTS stops on new recording, new question, or toggle off -- three cancellation paths

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All v1 requirements complete (RESP-03 and RESP-04 fulfilled)
- No further phases planned in current roadmap

## Self-Check: PASSED

- FOUND: ios/SecondBrain/Services/SpeechService.swift
- FOUND: ios/SecondBrainTests/SpeechServiceTests.swift
- FOUND: .planning/phases/04-enhancements/04-01-SUMMARY.md
- FOUND: commit e7a9b0b
- FOUND: commit 592aea9

---
*Phase: 04-enhancements*
*Completed: 2026-03-07*
