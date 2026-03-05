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
