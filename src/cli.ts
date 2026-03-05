#!/usr/bin/env node

import { Command } from 'commander';
import { handlePostCommit } from './hooks/post-commit.js';
import { handlePrEvent } from './hooks/pr-event.js';
import { handleSessionStart } from './hooks/session-start.js';

const program = new Command();

program
  .name('second-brain')
  .description('Dev context capture and retrieval for Claude Code')
  .version('0.1.0');

program
  .command('capture-hook')
  .description('Handle a Claude Code hook event')
  .requiredOption('--event <type>', 'Hook event type (post-commit, pr-event)')
  .action(async (opts) => {
    // Read stdin for hook input
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString());

    switch (opts.event) {
      case 'post-commit':
        await handlePostCommit(input);
        break;
      case 'pr-event':
        await handlePrEvent(input);
        break;
      default:
        console.error(`Unknown event: ${opts.event}`);
        process.exit(1);
    }
  });

program
  .command('session-context')
  .description('Output context for current session (called by SessionStart hook)')
  .action(async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString());

    const context = await handleSessionStart(input);
    if (context) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: context,
        },
      }));
    }
  });

program
  .command('sync')
  .description('Re-embed any vault entries missing from Supabase')
  .action(async () => {
    const { getConfig } = await import('./config.js');
    const { VaultService } = await import('./services/vault.js');
    const { EmbeddingsService } = await import('./services/embeddings.js');
    const { SupabaseService } = await import('./services/supabase.js');

    const config = getConfig();
    const vault = new VaultService(config.vaultPath, config.contextDir);
    const embeddings = new EmbeddingsService(config.ollama.baseUrl, config.ollama.model);
    const supabase = new SupabaseService(config.supabase.url, config.supabase.key);

    const entries = vault.listEntries();
    console.log(`Found ${entries.length} vault entries. Syncing...`);

    let synced = 0;
    for (const entry of entries) {
      try {
        const embedding = await embeddings.embed(entry.content);
        await supabase.upsertEntry(entry, embedding);
        synced++;
        console.log(`  Synced: ${entry.vaultPath}`);
      } catch (err) {
        console.error(`  Failed: ${entry.vaultPath} — ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    console.log(`Done. Synced ${synced}/${entries.length} entries.`);
  });

program
  .command('voice-watch')
  .description('Watch for new Voice Memos and transcribe them into the second brain')
  .action(async () => {
    const { getConfig } = await import('./config.js');
    const { VaultService } = await import('./services/vault.js');
    const { EmbeddingsService } = await import('./services/embeddings.js');
    const { SupabaseService } = await import('./services/supabase.js');
    const { WhisperService } = await import('./services/whisper.js');
    const { ProcessedTracker } = await import('./services/processed-tracker.js');
    const { VoiceProcessor } = await import('./voice/processor.js');
    const { VoiceWatcher } = await import('./voice/watcher.js');

    const config = getConfig();
    if (!config.voice) {
      console.error('No voice config found in ~/.second-brain/config.yml');
      console.error('Add a voice section with watch_dir pointing to your Voice Memos directory.');
      process.exit(1);
    }

    const vault = new VaultService(config.vaultPath, config.contextDir);
    const embeddings = new EmbeddingsService(config.ollama.baseUrl, config.ollama.model);
    const supabase = new SupabaseService(config.supabase.url, config.supabase.key);
    const whisper = new WhisperService(config.voice.whisperBinary);
    const tracker = new ProcessedTracker(config.voice.processedLog);
    const processor = new VoiceProcessor(whisper, vault, embeddings, supabase, tracker);
    const watcher = new VoiceWatcher(config.voice.watchDir, processor);

    await watcher.processExisting();
    watcher.start();
  });

program.parse();
