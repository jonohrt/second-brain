import { describe, it, expect, vi } from 'vitest';
import { WhisperService } from '../../src/services/whisper.js';

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
