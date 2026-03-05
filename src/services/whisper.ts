import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';

const execFileAsync = promisify(execFile);

export class WhisperService {
  private binary: string;
  private model: string;

  constructor(binary = 'whisper-cli', model = '') {
    this.binary = binary;
    this.model = model;
  }

  async transcribe(audioPath: string): Promise<string> {
    // Convert m4a to wav using macOS built-in afconvert
    const wavPath = join(tmpdir(), `whisper-${Date.now()}.wav`);
    try {
      await execFileAsync('afconvert', [
        '-f', 'WAVE',
        '-d', 'LEI16@16000',
        audioPath,
        wavPath,
      ]);

      const args = [
        '--no-prints',
        '--no-timestamps',
        ...(this.model ? ['-m', this.model] : []),
        wavPath,
      ];

      const { stdout } = await execFileAsync(this.binary, args, {
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout.trim();
    } finally {
      try { unlinkSync(wavPath); } catch {}
    }
  }
}
