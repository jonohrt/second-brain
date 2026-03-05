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
