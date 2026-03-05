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
      console.error(`Warning: sync failed for ${audioPath}:`, error);
    }

    this.tracker.markProcessed(audioPath, vaultPath);
    return { vaultPath, title };
  }
}
