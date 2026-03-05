import { watch, readdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { VoiceProcessor } from './processor.js';

export class VoiceWatcher {
  private watchDir: string;
  private processor: VoiceProcessor;
  private handled = new Set<string>();
  private debounce = new Map<string, NodeJS.Timeout>();

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

    watch(this.watchDir, (_eventType, filename) => {
      if (!filename || !filename.endsWith('.m4a')) return;

      const filePath = join(this.watchDir, filename);

      // Skip files we've already handled this session
      if (this.handled.has(filePath)) return;

      // Debounce: fs.watch fires multiple events per file
      const existing = this.debounce.get(filePath);
      if (existing) clearTimeout(existing);

      this.debounce.set(filePath, setTimeout(() => {
        this.debounce.delete(filePath);
        this.handleFile(filePath);
      }, 3000));
    });
  }

  private async handleFile(filePath: string): Promise<void> {
    // Permanent guard — once handled, never again
    if (this.handled.has(filePath)) return;
    this.handled.add(filePath);

    try {
      const result = await this.processor.process(filePath);
      if (result) {
        console.log(`Captured: "${result.title}" → ${result.vaultPath}`);
      }
      // Delete regardless of whether it was a new capture or already processed
      try {
        if (existsSync(filePath)) {
          unlinkSync(filePath);
          console.log(`Deleted: ${filePath}`);
        }
      } catch (error) {
        console.error(`Warning: could not delete ${filePath}:`, error);
      }
    } catch (error) {
      console.error(`Failed to process ${filePath}:`, error);
      // Don't keep in handled set if it failed — allow retry
      this.handled.delete(filePath);
    }
  }
}
