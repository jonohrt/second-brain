import { createApp } from '../../src/server/index.js';
import type { Config } from '../../src/types.js';

export function buildTestApp() {
  const config: Config = {
    vaultPath: '/tmp/test-vault',
    contextDir: 'context',
    supabase: { url: 'http://localhost:54321', key: 'test-key' },
    ollama: { baseUrl: 'http://localhost:11434', model: 'test-model' },
    projects: {},
    server: {
      port: 0,
      apiToken: 'test-token-123',
    },
  };

  return createApp(config);
}
