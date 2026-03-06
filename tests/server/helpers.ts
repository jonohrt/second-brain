import { vi } from 'vitest';
import { createApp } from '../../src/server/index.js';
import type { Config } from '../../src/types.js';
import type { Services } from '../../src/mcp/server.js';

const TEST_CONFIG: Config = {
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

export function buildTestApp() {
  return createApp(TEST_CONFIG, {
    protectedRoutes: async (scoped) => {
      scoped.post('/test-protected', async () => {
        return { ok: true };
      });
    },
  });
}

interface MockOverrides {
  vaultWriteEntry?: ReturnType<typeof vi.fn>;
}

export function buildTestAppWithServices(overrides?: MockOverrides) {
  const mockServices: Services = {
    vault: {
      writeEntry: overrides?.vaultWriteEntry ?? vi.fn(() => '/vault/test/note.md'),
      readEntry: vi.fn(),
      listEntries: vi.fn(() => []),
      getEntryPath: vi.fn(() => '/vault/test/note.md'),
    } as unknown as Services['vault'],
    embeddings: {
      isAvailable: vi.fn(async () => false),
      embed: vi.fn(),
    } as unknown as Services['embeddings'],
    supabase: {
      upsertEntry: vi.fn(async () => {}),
    } as unknown as Services['supabase'],
    config: TEST_CONFIG,
  };

  return createApp(TEST_CONFIG, { services: mockServices });
}
