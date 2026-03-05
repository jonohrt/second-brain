import { getConfig } from '../config.js';
import { getGitContext } from '../services/git.js';
import { VaultService } from '../services/vault.js';
import { EmbeddingsService } from '../services/embeddings.js';
import { SupabaseService } from '../services/supabase.js';
import type { ContextEntry } from '../types.js';

interface HookInput {
  cwd: string;
  tool_input?: {
    command?: string;
  };
  tool_response?: unknown;
}

export async function handlePostCommit(input: HookInput): Promise<void> {
  const { cwd, tool_input } = input;
  const command = tool_input?.command ?? '';

  // Only trigger on git commit commands
  if (!command.match(/git\s+commit/)) return;

  const config = getConfig();
  const gitCtx = await getGitContext(cwd, config);
  const vault = new VaultService(config.vaultPath, config.contextDir);
  const embeddings = new EmbeddingsService(config.ollama.baseUrl, config.ollama.model);
  const supabase = new SupabaseService(config.supabase.url, config.supabase.key);

  const now = new Date();
  const entry: ContextEntry = {
    type: 'branch_context',
    project: gitCtx.project,
    repo: gitCtx.repoName,
    branch: gitCtx.branch,
    title: `Branch: ${gitCtx.branch}`,
    content: `## Latest Activity\nCommit on ${now.toISOString()}\n\nCommand: \`${command}\``,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };

  const vaultPath = vault.writeEntry(entry);
  entry.vaultPath = vaultPath;

  try {
    if (await embeddings.isAvailable()) {
      const embedding = await embeddings.embed(entry.content);
      await supabase.upsertEntry(entry, embedding);
    }
  } catch {
    // Vault write is the priority — DB sync can happen later
  }
}
