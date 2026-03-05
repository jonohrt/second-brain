import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ProcessedTracker } from '../../src/services/processed-tracker.js';

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
