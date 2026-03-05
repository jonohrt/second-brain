import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, resolveProjectFromPath } from '../src/config.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('loadConfig', () => {
  const tmpDir = join(tmpdir(), 'second-brain-test-config');
  const configPath = join(tmpDir, 'config.yml');

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads and parses a valid config file', () => {
    writeFileSync(configPath, `
vault_path: /tmp/vault
context_dir: Work/Dev-Context
supabase:
  url: https://example.supabase.co
  key: test-key
ollama:
  base_url: http://localhost:11434
  model: nomic-embed-text
projects:
  tesla:
    repos:
      core-ui: /tmp/core-ui
      tesla-site: /tmp/tesla-site
`);
    const config = loadConfig(configPath);
    expect(config.vaultPath).toBe('/tmp/vault');
    expect(config.contextDir).toBe('Work/Dev-Context');
    expect(config.supabase.url).toBe('https://example.supabase.co');
    expect(config.ollama.model).toBe('nomic-embed-text');
    expect(config.projects.tesla.repos['core-ui']).toBe('/tmp/core-ui');
  });

  it('expands ~ in vault_path', () => {
    writeFileSync(configPath, `
vault_path: ~/Documents/Vault
context_dir: Dev
supabase:
  url: https://x.supabase.co
  key: k
ollama:
  base_url: http://localhost:11434
  model: nomic-embed-text
projects: {}
`);
    const config = loadConfig(configPath);
    expect(config.vaultPath).not.toContain('~');
    expect(config.vaultPath).toContain('/Documents/Vault');
  });

  it('resolves env vars in supabase config', () => {
    process.env.TEST_SB_URL = 'https://env.supabase.co';
    process.env.TEST_SB_KEY = 'env-key';
    writeFileSync(configPath, `
vault_path: /tmp/vault
context_dir: Dev
supabase:
  url: \${TEST_SB_URL}
  key: \${TEST_SB_KEY}
ollama:
  base_url: http://localhost:11434
  model: nomic-embed-text
projects: {}
`);
    const config = loadConfig(configPath);
    expect(config.supabase.url).toBe('https://env.supabase.co');
    expect(config.supabase.key).toBe('env-key');
    delete process.env.TEST_SB_URL;
    delete process.env.TEST_SB_KEY;
  });

  it('throws on missing config file', () => {
    expect(() => loadConfig('/nonexistent/config.yml')).toThrow();
  });
});

describe('resolveProjectFromPath', () => {
  it('finds project and repo for a known path', () => {
    const config = {
      vaultPath: '/tmp',
      contextDir: 'Dev',
      supabase: { url: '', key: '' },
      ollama: { baseUrl: '', model: '' },
      projects: {
        tesla: {
          repos: {
            'core-ui': '/Users/johrt/Code/tesla/projects/core-ui',
            'tesla-site': '/Users/johrt/Code/tesla/projects/tesla-site',
          },
        },
      },
    };
    const result = resolveProjectFromPath('/Users/johrt/Code/tesla/projects/core-ui', config);
    expect(result).toEqual({ project: 'tesla', repo: 'core-ui' });
  });

  it('matches paths inside a repo (subdirectory)', () => {
    const config = {
      vaultPath: '/tmp',
      contextDir: 'Dev',
      supabase: { url: '', key: '' },
      ollama: { baseUrl: '', model: '' },
      projects: {
        tesla: {
          repos: {
            'core-ui': '/Users/johrt/Code/tesla/projects/core-ui',
          },
        },
      },
    };
    const result = resolveProjectFromPath('/Users/johrt/Code/tesla/projects/core-ui/src/components', config);
    expect(result).toEqual({ project: 'tesla', repo: 'core-ui' });
  });

  it('returns undefined for unknown paths', () => {
    const config = {
      vaultPath: '/tmp',
      contextDir: 'Dev',
      supabase: { url: '', key: '' },
      ollama: { baseUrl: '', model: '' },
      projects: {},
    };
    const result = resolveProjectFromPath('/unknown/path', config);
    expect(result).toBeUndefined();
  });
});
