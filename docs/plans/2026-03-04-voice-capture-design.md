# Voice Capture Pipeline — Design Document

**Date:** 2026-03-04
**Status:** Approved
**Scope:** Voice Memos → Whisper transcription → second-brain capture on Mac Mini

## Problem

Can't capture thoughts into the second brain when away from a computer. Voice Memos exist on iPhone but the audio never gets transcribed or stored as searchable context.

## Solution

A file watcher daemon on the Mac Mini that detects new Voice Memos synced via iCloud, transcribes them with whisper-cpp, and captures them into the second brain via the existing pipeline.

## Architecture

```
Voice Memos (iPhone) → iCloud sync → Mac Mini watches folder
  → whisper-cpp transcription → second-brain capture → vault + Supabase
```

## Components

### File Watcher
- New CLI command: `second-brain voice-watch`
- Watches Voice Memos iCloud directory for new `.m4a` files
- Runs as a launchd daemon on Mac Mini (survives reboot)

### Whisper
- `whisper-cpp` installed via Homebrew on Mac Mini
- Runs locally on Apple Silicon (Metal accelerated)
- No external API calls

### Processing Flow
1. Watcher detects new `.m4a` in Voice Memos directory
2. Check processed log — skip if already handled
3. Run whisper-cpp on the audio file → raw transcript
4. Extract first sentence as title, full transcript as content
5. Call second-brain capture pipeline as `learned` type
6. Record file in processed log

### Processed File Tracking
- Simple JSON log at `~/.second-brain/processed-voice.json`
- Array of `{ file: string, processedAt: string, vaultPath: string }`
- Checked before processing to avoid duplicates

## Voice Memos iCloud Path

To be confirmed on Mac Mini — typically:
`~/Library/Group Containers/group.com.apple.voicememos.shared/Recordings/`

## Dependencies

- `whisper-cpp` (Homebrew) — local Whisper inference
- No new npm dependencies — uses `child_process` to shell out to whisper-cpp
- Existing second-brain capture pipeline for vault write + Supabase embed

## Daemon (launchd)

Plist at `~/Library/LaunchAgents/com.second-brain.voice-watch.plist`:
- Runs `second-brain voice-watch` on login
- KeepAlive: true
- Logs to `~/.second-brain/voice-watch.log`

## Error Handling

- iCloud not synced: watcher simply waits — no file, no action
- whisper-cpp fails: log error, skip file, retry on next watcher cycle
- second-brain capture fails: log error, do not mark as processed (will retry)
- Daemon crashes: launchd restarts it (KeepAlive)

## Acceptance Verification

1. Record a Voice Memo on iPhone, wait for iCloud sync, confirm transcript appears in vault + Supabase
2. Same file is not re-processed on restart
3. Daemon survives Mac Mini reboot
