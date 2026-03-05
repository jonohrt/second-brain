# Voice Capture Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Watch for new Voice Memos synced via iCloud on Mac Mini, transcribe with whisper-cpp, and capture into second-brain vault + Supabase.

**Architecture:** New `voice-watch` CLI command using `fs.watch` on the Voice Memos iCloud directory. On new `.m4a` files, shells out to `whisper-cpp` for transcription, then uses the existing capture pipeline (VaultService + EmbeddingsService + SupabaseService) to store the result as a `learned` entry. A launchd plist keeps it running.

**Tech Stack:** TypeScript, `whisper-cpp` (Homebrew CLI), `fs.watch`, existing second-brain services, launchd.

**Design doc:** `docs/plans/2026-03-04-voice-capture-design.md`

---

## Prerequisites

1. `whisper-cpp` installed on Mac Mini: `brew install whisper-cpp`
2. Confirm Voice Memos iCloud path on Mac Mini (expected: `~/Library/Group Containers/group.com.apple.voicememos.shared/Recordings/`)
3. Existing second-brain project built and linked

---

## Task 1: Whisper Transcription Service

**Files:**
- Create: `src/services/whisper.ts`
- Create: `tests/services/whisper.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/services/whisper.test.ts
import { describe, it, expect, vi } from 'vitest';
import { WhisperService } from '../src/services/whisper.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));
vi.mock('node:util', () => ({
  promisify: (fn: Function) => fn,
}));

describe('WhisperService', () => {
  it('calls whisper-cpp with correct arguments', async () => {
    const { execFile } = await import('node:child_process');
    const mockExecFile = vi.mocked(execFile);
    mockExecFile.mockResolvedValue({ stdout: 'Hello world', stderr: '' } as any);

    const service = new WhisperService();
    const result = await service.transcribe('/path/to/audio.m4a');

    expect(mockExecFile).toHaveBeenCalledWith(
      'whisper-cpp',
      expect.arrayContaining(['/path/to/audio.m4a']),
    );
    expect(result).toBe('Hello world');
  });

  it('trims whitespace from output', async () => {
    const { execFile } = await import('node:child_process');
    const mockExecFile = vi.mocked(execFile);
    mockExecFile.mockResolvedValue({ stdout: '  Hello world  \n', stderr: '' } as any);

    const service = new WhisperService();
    const result = await service.transcribe('/path/to/audio.m4a');

    expect(result).toBe('Hello world');
  });

  it('throws on whisper-cpp failure', async () => {
    const { execFile } = await import('node:child_process');
    const mockExecFile = vi.mocked(execFile);
    mockExecFile.mockRejectedValue(new Error('whisper-cpp not found'));

    const service = new WhisperService();
    await expect(service.transcribe('/path/to/audio.m4a')).rejects.toThrow('whisper-cpp not found');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/whisper.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/services/whisper.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class WhisperService {
  private binary: string;

  constructor(binary = 'whisper-cpp') {
    this.binary = binary;
  }

  async transcribe(audioPath: string): Promise<string> {
    const { stdout } = await execFileAsync(this.binary, [
      '--no-timestamps',
      '--no-prints',
      '--output-txt',
      '--output-file', '-',
      audioPath,
    ]);
    return stdout.trim();
  }
}
```

> **Note:** The exact `whisper-cpp` CLI flags may vary. Check `whisper-cpp --help` on the Mac Mini and adjust. The key flags are: suppress timestamps, output plain text to stdout.

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/services/whisper.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/whisper.ts tests/services/whisper.test.ts
git commit -m "feat: add WhisperService for audio transcription"
```

---

## Task 2: Processed File Tracker

**Files:**
- Create: `src/services/processed-tracker.ts`
- Create: `tests/services/processed-tracker.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/services/processed-tracker.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ProcessedTracker } from '../src/services/processed-tracker.js';

describe('ProcessedTracker', () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'processed-tracker-'));
    logPath = join(tempDir, 'processed-voice.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true });
  });

  it('returns false for unprocessed files', () => {
    const tracker = new ProcessedTracker(logPath);
    expect(tracker.isProcessed('/path/to/file.m4a')).toBe(false);
  });

  it('marks a file as processed', () => {
    const tracker = new ProcessedTracker(logPath);
    tracker.markProcessed('/path/to/file.m4a', '/vault/path.md');
    expect(tracker.isProcessed('/path/to/file.m4a')).toBe(true);
  });

  it('persists to disk and reloads', () => {
    const tracker1 = new ProcessedTracker(logPath);
    tracker1.markProcessed('/path/to/file.m4a', '/vault/path.md');

    const tracker2 = new ProcessedTracker(logPath);
    expect(tracker2.isProcessed('/path/to/file.m4a')).toBe(true);
  });

  it('stores metadata in the log', () => {
    const tracker = new ProcessedTracker(logPath);
    tracker.markProcessed('/path/to/file.m4a', '/vault/path.md');

    const data = JSON.parse(readFileSync(logPath, 'utf-8'));
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      file: '/path/to/file.m4a',
      vaultPath: '/vault/path.md',
    });
    expect(data[0].processedAt).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/processed-tracker.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/services/processed-tracker.ts
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

interface ProcessedEntry {
  file: string;
  processedAt: string;
  vaultPath: string;
}

export class ProcessedTracker {
  private logPath: string;
  private entries: ProcessedEntry[];

  constructor(logPath: string) {
    this.logPath = logPath;
    this.entries = this.load();
  }

  isProcessed(filePath: string): boolean {
    return this.entries.some((e) => e.file === filePath);
  }

  markProcessed(filePath: string, vaultPath: string): void {
    this.entries.push({
      file: filePath,
      processedAt: new Date().toISOString(),
      vaultPath,
    });
    this.save();
  }

  private load(): ProcessedEntry[] {
    try {
      return JSON.parse(readFileSync(this.logPath, 'utf-8'));
    } catch {
      return [];
    }
  }

  private save(): void {
    mkdirSync(dirname(this.logPath), { recursive: true });
    writeFileSync(this.logPath, JSON.stringify(this.entries, null, 2), 'utf-8');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/services/processed-tracker.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/processed-tracker.ts tests/services/processed-tracker.test.ts
git commit -m "feat: add ProcessedTracker for voice memo dedup"
```

---

## Task 3: Voice Processor

This is the core logic: given an audio file, transcribe it and capture it.

**Files:**
- Create: `src/voice/processor.ts`
- Create: `tests/voice/processor.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/voice/processor.test.ts
import { describe, it, expect, vi } from 'vitest';
import { VoiceProcessor } from '../src/voice/processor.js';

describe('VoiceProcessor', () => {
  it('transcribes and captures a voice memo', async () => {
    const mockWhisper = { transcribe: vi.fn().mockResolvedValue('Remember to refactor the auth module. It has too many responsibilities.') };
    const mockVault = { writeEntry: vi.fn().mockReturnValue('/vault/path.md') };
    const mockEmbeddings = { isAvailable: vi.fn().mockResolvedValue(true), embed: vi.fn().mockResolvedValue([0.1, 0.2]) };
    const mockSupabase = { upsertEntry: vi.fn().mockResolvedValue(undefined) };
    const mockTracker = { isProcessed: vi.fn().mockReturnValue(false), markProcessed: vi.fn() };

    const processor = new VoiceProcessor(
      mockWhisper as any,
      mockVault as any,
      mockEmbeddings as any,
      mockSupabase as any,
      mockTracker as any,
    );

    const result = await processor.process('/path/to/memo.m4a');

    expect(mockWhisper.transcribe).toHaveBeenCalledWith('/path/to/memo.m4a');
    expect(mockVault.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'learned',
        title: 'Remember to refactor the auth module.',
        content: 'Remember to refactor the auth module. It has too many responsibilities.',
      }),
    );
    expect(mockTracker.markProcessed).toHaveBeenCalledWith('/path/to/memo.m4a', '/vault/path.md');
    expect(result).toEqual({ vaultPath: '/vault/path.md', title: 'Remember to refactor the auth module.' });
  });

  it('skips already-processed files', async () => {
    const mockWhisper = { transcribe: vi.fn() };
    const mockVault = { writeEntry: vi.fn() };
    const mockEmbeddings = { isAvailable: vi.fn() };
    const mockSupabase = { upsertEntry: vi.fn() };
    const mockTracker = { isProcessed: vi.fn().mockReturnValue(true), markProcessed: vi.fn() };

    const processor = new VoiceProcessor(
      mockWhisper as any,
      mockVault as any,
      mockEmbeddings as any,
      mockSupabase as any,
      mockTracker as any,
    );

    const result = await processor.process('/path/to/memo.m4a');

    expect(result).toBeNull();
    expect(mockWhisper.transcribe).not.toHaveBeenCalled();
  });

  it('extracts first sentence as title', async () => {
    const mockWhisper = { transcribe: vi.fn().mockResolvedValue('First sentence here. Second sentence. Third.') };
    const mockVault = { writeEntry: vi.fn().mockReturnValue('/vault/path.md') };
    const mockEmbeddings = { isAvailable: vi.fn().mockResolvedValue(false) };
    const mockSupabase = { upsertEntry: vi.fn().mockResolvedValue(undefined) };
    const mockTracker = { isProcessed: vi.fn().mockReturnValue(false), markProcessed: vi.fn() };

    const processor = new VoiceProcessor(
      mockWhisper as any,
      mockVault as any,
      mockEmbeddings as any,
      mockSupabase as any,
      mockTracker as any,
    );

    const result = await processor.process('/path/to/memo.m4a');

    expect(result!.title).toBe('First sentence here.');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/voice/processor.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/voice/processor.ts
import type { WhisperService } from '../services/whisper.js';
import type { VaultService } from '../services/vault.js';
import type { EmbeddingsService } from '../services/embeddings.js';
import type { SupabaseService } from '../services/supabase.js';
import type { ProcessedTracker } from '../services/processed-tracker.js';
import type { ContextEntry } from '../types.js';

function extractTitle(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : text.slice(0, 80).trim();
}

export class VoiceProcessor {
  constructor(
    private whisper: WhisperService,
    private vault: VaultService,
    private embeddings: EmbeddingsService,
    private supabase: SupabaseService,
    private tracker: ProcessedTracker,
  ) {}

  async process(audioPath: string): Promise<{ vaultPath: string; title: string } | null> {
    if (this.tracker.isProcessed(audioPath)) {
      return null;
    }

    const transcript = await this.whisper.transcribe(audioPath);
    const title = extractTitle(transcript);
    const now = new Date();

    const entry: ContextEntry = {
      type: 'learned',
      title,
      content: transcript,
      metadata: { tags: ['voice-capture'], source: audioPath },
      createdAt: now,
      updatedAt: now,
    };

    const vaultPath = this.vault.writeEntry(entry);
    entry.vaultPath = vaultPath;

    try {
      const available = await this.embeddings.isAvailable();
      if (available) {
        const embedding = await this.embeddings.embed(entry.content);
        await this.supabase.upsertEntry(entry, embedding);
      } else {
        await this.supabase.upsertEntry(entry);
      }
    } catch (error) {
      // Vault write succeeded — log warning but don't fail
      console.error(`Warning: sync failed for ${audioPath}:`, error);
    }

    this.tracker.markProcessed(audioPath, vaultPath);
    return { vaultPath, title };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/voice/processor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/voice/processor.ts tests/voice/processor.test.ts
git commit -m "feat: add VoiceProcessor for transcribe-and-capture pipeline"
```

---

## Task 4: Voice Watcher

**Files:**
- Create: `src/voice/watcher.ts`

**Step 1: Write the implementation**

This uses `fs.watch` which is difficult to unit test reliably. We'll test it via integration in Task 5.

```typescript
// src/voice/watcher.ts
import { watch, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { VoiceProcessor } from './processor.js';

export class VoiceWatcher {
  private watchDir: string;
  private processor: VoiceProcessor;
  private processing = new Set<string>();

  constructor(watchDir: string, processor: VoiceProcessor) {
    this.watchDir = watchDir;
    this.processor = processor;
  }

  async processExisting(): Promise<void> {
    if (!existsSync(this.watchDir)) {
      console.error(`Watch directory does not exist: ${this.watchDir}`);
      return;
    }

    const files = readdirSync(this.watchDir).filter((f) => f.endsWith('.m4a'));
    for (const file of files) {
      await this.handleFile(join(this.watchDir, file));
    }
  }

  start(): void {
    if (!existsSync(this.watchDir)) {
      console.error(`Watch directory does not exist: ${this.watchDir}`);
      process.exit(1);
    }

    console.log(`Watching for voice memos in: ${this.watchDir}`);

    watch(this.watchDir, async (eventType, filename) => {
      if (!filename || !filename.endsWith('.m4a')) return;

      const filePath = join(this.watchDir, filename);
      await this.handleFile(filePath);
    });
  }

  private async handleFile(filePath: string): Promise<void> {
    if (this.processing.has(filePath)) return;
    this.processing.add(filePath);

    try {
      const result = await this.processor.process(filePath);
      if (result) {
        console.log(`Captured: "${result.title}" → ${result.vaultPath}`);
      }
    } catch (error) {
      console.error(`Failed to process ${filePath}:`, error);
    } finally {
      this.processing.delete(filePath);
    }
  }
}
```

**Step 2: Build to verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/voice/watcher.ts
git commit -m "feat: add VoiceWatcher for iCloud Voice Memos directory"
```

---

## Task 5: CLI Command + Config

**Files:**
- Modify: `src/cli.ts` — add `voice-watch` command
- Modify: `src/types.ts` — add optional `voice` config section
- Modify: `src/config.ts` — parse `voice` config

**Step 1: Add voice config to types**

Add to `src/types.ts`:

```typescript
// Add to the Config interface:
  voice?: {
    watchDir: string;
    processedLog: string;
    whisperBinary: string;
  };
```

**Step 2: Update config parser**

Add to `src/config.ts` in the `loadConfig` function, before the `return` statement:

```typescript
  const voice = parsed.voice as Record<string, string> | undefined;
  const voiceConfig = voice
    ? {
        watchDir: expandTilde(voice.watch_dir),
        processedLog: expandTilde(voice.processed_log ?? '~/.second-brain/processed-voice.json'),
        whisperBinary: voice.whisper_binary ?? 'whisper-cpp',
      }
    : undefined;
```

And add `voice: voiceConfig,` to the return object.

**Step 3: Add the CLI command**

Add to `src/cli.ts` before `program.parse()`:

```typescript
program
  .command('voice-watch')
  .description('Watch for new Voice Memos and transcribe them into the second brain')
  .action(async () => {
    const { getConfig } = await import('./config.js');
    const { VaultService } = await import('./services/vault.js');
    const { EmbeddingsService } = await import('./services/embeddings.js');
    const { SupabaseService } = await import('./services/supabase.js');
    const { WhisperService } = await import('./services/whisper.js');
    const { ProcessedTracker } = await import('./services/processed-tracker.js');
    const { VoiceProcessor } = await import('./voice/processor.js');
    const { VoiceWatcher } = await import('./voice/watcher.js');

    const config = getConfig();
    if (!config.voice) {
      console.error('No voice config found in ~/.second-brain/config.yml');
      console.error('Add a voice section with watch_dir pointing to your Voice Memos directory.');
      process.exit(1);
    }

    const vault = new VaultService(config.vaultPath, config.contextDir);
    const embeddings = new EmbeddingsService(config.ollama.baseUrl, config.ollama.model);
    const supabase = new SupabaseService(config.supabase.url, config.supabase.key);
    const whisper = new WhisperService(config.voice.whisperBinary);
    const tracker = new ProcessedTracker(config.voice.processedLog);
    const processor = new VoiceProcessor(whisper, vault, embeddings, supabase, tracker);
    const watcher = new VoiceWatcher(config.voice.watchDir, processor);

    await watcher.processExisting();
    watcher.start();
  });
```

**Step 4: Build and verify**

Run: `npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add src/cli.ts src/types.ts src/config.ts
git commit -m "feat: add voice-watch CLI command with config support"
```

---

## Task 6: launchd Plist

**Files:**
- Create: `resources/com.second-brain.voice-watch.plist`

**Step 1: Create the plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.second-brain.voice-watch</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/second-brain</string>
        <string>voice-watch</string>
    </array>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/second-brain-voice-watch.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/second-brain-voice-watch.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

> **Note:** The `ProgramArguments` path may need adjusting based on where `second-brain` is linked on the Mac Mini. Check with `which second-brain`. Also ensure the PATH includes Homebrew's bin for `whisper-cpp`.

**Step 2: Commit**

```bash
git add resources/com.second-brain.voice-watch.plist
git commit -m "feat: add launchd plist for voice-watch daemon"
```

---

## Task 7: Config + Manual Smoke Test on Mac Mini

**Step 1: Add voice config to Mac Mini's `~/.second-brain/config.yml`**

```yaml
voice:
  watch_dir: ~/Library/Group Containers/group.com.apple.voicememos.shared/Recordings
  processed_log: ~/.second-brain/processed-voice.json
  whisper_binary: whisper-cpp
```

> **Note:** Verify the Voice Memos path first: `ls ~/Library/Group\ Containers/group.com.apple.voicememos.shared/Recordings/`

**Step 2: Install whisper-cpp**

```bash
brew install whisper-cpp
```

**Step 3: Build and link on Mac Mini**

```bash
cd /path/to/second-brain
npm run build
npm link
```

**Step 4: Test manually**

```bash
second-brain voice-watch
```

Record a Voice Memo on iPhone. Wait for iCloud sync. Confirm output shows the memo was transcribed and captured.

**Step 5: Install the launchd daemon**

```bash
cp resources/com.second-brain.voice-watch.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.second-brain.voice-watch.plist
```

**Step 6: Verify daemon is running**

```bash
launchctl list | grep second-brain
```

**Step 7: Reboot Mac Mini, verify daemon starts automatically**

Check logs: `cat /tmp/second-brain-voice-watch.log`
