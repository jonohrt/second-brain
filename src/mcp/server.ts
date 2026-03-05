import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../types.js';
import { SupabaseService } from '../services/supabase.js';
import { EmbeddingsService } from '../services/embeddings.js';
import { VaultService } from '../services/vault.js';
import { registerSearchTools } from './tools/search.js';
import { registerBranchTools } from './tools/branch.js';
import { registerProjectTools } from './tools/project.js';
import { registerPrTools } from './tools/pr.js';
import { registerCaptureTools } from './tools/capture.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerStandupTools } from './tools/standup.js';

export interface Services {
  supabase: SupabaseService;
  embeddings: EmbeddingsService;
  vault: VaultService;
  config: Config;
}

export function createServer(config: Config): McpServer {
  const server = new McpServer({
    name: 'second-brain',
    version: '0.1.0',
  });

  const supabase = new SupabaseService(config.supabase.url, config.supabase.key);
  const embeddings = new EmbeddingsService(config.ollama.baseUrl, config.ollama.model);
  const vault = new VaultService(config.vaultPath, config.contextDir);

  const services: Services = { supabase, embeddings, vault, config };

  registerSearchTools(server, services);
  registerBranchTools(server, services);
  registerProjectTools(server, services);
  registerPrTools(server, services);
  registerCaptureTools(server, services);
  registerTaskTools(server, services);
  registerStandupTools(server);

  return server;
}
