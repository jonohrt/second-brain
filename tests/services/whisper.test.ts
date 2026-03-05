import { describe, it, expect, vi } from 'vitest';
import { WhisperService } from '../../src/services/whisper.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));
vi.mock('node:util', () => ({
  promisify: (fn: Function) => fn,
}));
vi.mock('node:fs', () => ({
  unlinkSync: vi.fn(),
}));

describe('WhisperService', () => {
  it('converts m4a to wav then calls whisper-cli', async () => {
    const { execFile } = await import('node:child_process');
    const mockExecFile = vi.mocked(execFile);
    // First call: afconvert, second call: whisper-cli
    mockExecFile
      .mockResolvedValueOnce({ stdout: '', stderr: '' } as any)
      .mockResolvedValueOnce({ stdout: 'Hello world', stderr: '' } as any);

    const service = new WhisperService();
    const result = await service.transcribe('/path/to/audio.m4a');

    expect(mockExecFile).toHaveBeenCalledWith(
      'afconvert',
      expect.arrayContaining(['/path/to/audio.m4a']),
    );
    expect(mockExecFile).toHaveBeenCalledWith(
      'whisper-cli',
      expect.arrayContaining(['--no-prints', '--no-timestamps']),
      expect.any(Object),
    );
    expect(result).toBe('Hello world');
  });

  it('trims whitespace from output', async () => {
    const { execFile } = await import('node:child_process');
    const mockExecFile = vi.mocked(execFile);
    mockExecFile
      .mockResolvedValueOnce({ stdout: '', stderr: '' } as any)
      .mockResolvedValueOnce({ stdout: '  Hello world  \n', stderr: '' } as any);

    const service = new WhisperService();
    const result = await service.transcribe('/path/to/audio.m4a');

    expect(result).toBe('Hello world');
  });

  it('throws on whisper-cli failure', async () => {
    const { execFile } = await import('node:child_process');
    const mockExecFile = vi.mocked(execFile);
    mockExecFile
      .mockResolvedValueOnce({ stdout: '', stderr: '' } as any)
      .mockRejectedValueOnce(new Error('whisper-cli not found'));

    const service = new WhisperService();
    await expect(service.transcribe('/path/to/audio.m4a')).rejects.toThrow('whisper-cli not found');
  });

  it('passes model path when configured', async () => {
    const { execFile } = await import('node:child_process');
    const mockExecFile = vi.mocked(execFile);
    mockExecFile
      .mockResolvedValueOnce({ stdout: '', stderr: '' } as any)
      .mockResolvedValueOnce({ stdout: 'Hello', stderr: '' } as any);

    const service = new WhisperService('whisper-cli', '/path/to/model.bin');
    await service.transcribe('/path/to/audio.m4a');

    expect(mockExecFile).toHaveBeenCalledWith(
      'whisper-cli',
      expect.arrayContaining(['-m', '/path/to/model.bin']),
      expect.any(Object),
    );
  });
});
