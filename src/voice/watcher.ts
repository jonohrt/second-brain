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
