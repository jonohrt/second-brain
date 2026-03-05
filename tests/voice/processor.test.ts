import { describe, it, expect, vi } from 'vitest';
import { VoiceProcessor } from '../../src/voice/processor.js';

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
