import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../types.js';
import type { Services } from '../mcp/server.js';
import { getConfig } from '../config.js';
import { SupabaseService } from '../services/supabase.js';
import { EmbeddingsService } from '../services/embeddings.js';
import { VaultService } from '../services/vault.js';
import { healthRoutes } from './routes/health.js';
import { captureRoutes } from './routes/capture.js';
import { askRoutes } from './routes/ask.js';
import { authPlugin } from './plugins/auth.js';
import { OllamaChatService } from '../services/ollama-chat.js';
import { SearxngService } from '../services/searxng.js';
import { AskPipeline } from '../services/ask-pipeline.js';

// NOTE: The Ollama process must be started with OLLAMA_MAX_LOADED_MODELS=1
// to avoid memory pressure on the 8GB Mac Mini. Ollama handles this natively
// via environment variable -- no application code needed.

export interface CreateAppOptions {
  /** Callback to register routes inside the auth-protected scope */
  protectedRoutes?: (scoped: FastifyInstance) => Promise<void> | void;
  /** Pre-built services (for testing with mocks) */
  services?: Services;
  /** Pre-built AskPipeline (for testing with mocks) */
  askPipeline?: AskPipeline;
}

function buildServices(config: Config): Services {
  const supabase = new SupabaseService(config.supabase.url, config.supabase.key);
  const embeddings = new EmbeddingsService(config.ollama.baseUrl, config.ollama.model);
  const vault = new VaultService(config.vaultPath, config.contextDir);
  return { supabase, embeddings, vault, config };
}

function buildAskPipeline(config: Config, services: Services): AskPipeline {
  const ollamaChat = new OllamaChatService(
    config.ollama.baseUrl,
    'qwen3.5:cloud',
    'qwen3:4b',
  );
  const searxng = new SearxngService('http://localhost:8888');
  return new AskPipeline(ollamaChat, searxng, services.embeddings, services.supabase);
}

export function createApp(config: Config, opts?: CreateAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const services = opts?.services ?? buildServices(config);
  const askPipeline = opts?.askPipeline ?? buildAskPipeline(config, services);

  // Public routes -- no auth required
  app.register(healthRoutes);

  // Protected scope -- bearer auth required for all routes registered within
  if (config.server?.apiToken) {
    app.register(async function protectedScope(scoped) {
      await scoped.register(authPlugin, { apiToken: config.server!.apiToken });

      // Capture endpoint
      await scoped.register(captureRoutes, { services });

      // Ask endpoint
      await scoped.register(askRoutes, { askPipeline });

      // Register any protected routes passed via options
      if (opts?.protectedRoutes) {
        await opts.protectedRoutes(scoped);
      }
    });
  }

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  const config = getConfig();

  if (!config.server) {
    throw new Error('Server config is required. Add a "server" section to config.yml.');
  }
  if (!config.server.apiToken) {
    throw new Error('server.api_token is required in config.yml.');
  }

  const app = createApp(config);

  const port = config.server.port ?? 3000;
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Server listening on 0.0.0.0:${port} -- accessible via Tailscale`);

  return app;
}

// Start server when run directly
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMain) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
