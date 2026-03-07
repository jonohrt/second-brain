---
phase: 04
slug: enhancements
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-07
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | XCTest (bundled with Xcode 16) |
| **Config file** | ios/project.yml (XcodeGen) |
| **Quick run command** | `xcodebuild test -project ios/SecondBrain.xcodeproj -scheme SecondBrain -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing SecondBrainTests` |
| **Full suite command** | `xcodebuild test -project ios/SecondBrain.xcodeproj -scheme SecondBrain -destination 'platform=iOS Simulator,name=iPhone 16'` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command (unit tests only)
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green + manual device verification
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | RESP-03 | unit | `xcodebuild test ... -only-testing SecondBrainTests/SpeechServiceTests` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | RESP-04 | unit | `xcodebuild test ... -only-testing SecondBrainTests/APIClientTests` | ✅ (needs update) | ⬜ pending |
| 04-01-03 | 01 | 1 | RESP-03 | manual | Manual: toggle TTS, send question, verify audio | N/A | ⬜ pending |
| 04-01-04 | 01 | 1 | RESP-04 | manual | Manual: ask vault question, verify sources shown | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `ios/SecondBrainTests/SpeechServiceTests.swift` — stubs for RESP-03 (sentence splitting, speak/stop state)
- [ ] Update `ios/SecondBrainTests/APIClientTests.swift` — fix mock sources from string array to proper AskSource objects, test `path` field decoding

*Existing XCTest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TTS audio plays when toggle enabled | RESP-03 | Requires audio output hardware | Toggle TTS on, send question, verify audio plays through speaker |
| TTS stops when toggle disabled mid-speech | RESP-03 | Audio hardware interaction | While TTS playing, toggle off, verify speech stops immediately |
| Vault source titles displayed below answer | RESP-04 | Visual UI verification | Ask vault-related question, verify source note titles appear below answer |
| No sources section when only web results | RESP-04 | Visual UI verification | Ask general knowledge question, verify no vault sources section shown |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
