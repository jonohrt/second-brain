# Second Brain: Dev Context MVP — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an MCP server + CLI that captures dev context to Obsidian vault with vector embeddings in Supabase, and retrieves it on demand during Claude Code sessions.

**Architecture:** Single TypeScript project. MCP server for retrieval + manual capture. CLI entry point for hook-triggered auto-capture. Obsidian vault as source of truth. Supabase pgvector for semantic search. Ollama nomic-embed-text for local embeddings.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` v1.27+, `@supabase/supabase-js`, `zod`, `commander`, `simple-git`, `gray-matter`, `js-yaml`, Vitest for tests.

**Design doc:** `docs/plans/2026-03-04-second-brain-dev-context-design.md`

---

## Prerequisites

Before starting implementation:

1. **Supabase project:** Create a free project at supabase.com. Save the URL and anon key.
2. **Ollama:** `brew install ollama && ollama pull nomic-embed-text`
3. **Node 20+** and npm

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/types.ts`
- Create: `config.example.yml`
- Create: `.gitignore`

**Step 1: Initialize the project**

```bash
cd /Users/johrt/Code/second-brain
npm init -y
```

**Step 2: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk zod @supabase/supabase-js commander simple-git gray-matter js-yaml
npm install -D typescript @types/node @types/js-yaml vitest tsx
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
*.env
config.yml
```

**Step 5: Create src/types.ts**

```typescript
export type ContextType = 'branch_context' | 'pr_context' | 'decision' | 'learned' | 'session';

export interface ContextEntry {
  id?: string;
  type: ContextType;
  project?: string;
  repo?: string;
  branch?: string;
  prNumber?: number;
  title: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  vaultPath?: string;
}

export interface Frontmatter {
  type: ContextType;
  project?: string;
  repo?: string;
  branch?: string;
  pr?: number;
  created: string;
  updated: string;
  tags: string[];
}

export interface ProjectConfig {
  repos: Record<string, string>;
  relatedRepos?: string[];
}

export interface Config {
  vaultPath: string;
  contextDir: string;
  supabase: {
    url: string;
    key: string;
  };
  ollama: {
    baseUrl: string;
    model: string;
  };
  projects: Record<string, ProjectConfig>;
}

export interface GitContext {
  branch: string;
  repoRoot: string;
  repoName: string;
  project?: string;
}
```

**Step 6: Create config.example.yml**

```yaml
vault_path: ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/SecondBrain
context_dir: Work/Dev-Context

supabase:
  url: ${SUPABASE_URL}
  key: ${SUPABASE_ANON_KEY}

ollama:
  base_url: http://localhost:11434
  model: nomic-embed-text

projects:
  tesla:
    repos:
      core-ui: ~/Code/tesla/projects/core-ui
      tesla-site: ~/Code/tesla/projects/tesla-site
      tesla-ui: ~/Code/tesla/projects/tesla-ui
    related_repos:
      - core-ui <-> tesla-site
```

**Step 7: Add scripts to package.json**

Add to `package.json`:
```json
{
  "type": "module",
  "bin": {
    "second-brain": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "cli": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold project with dependencies and types"
```

---

## Task 2: Config Service

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

**Step 1: Write the failing test**

Create `tests/config.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/config.test.ts
```

Expected: FAIL — `../src/config.js` does not exist.

**Step 3: Implement config.ts**

Create `src/config.ts`:

```typescript
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import yaml from 'js-yaml';
import type { Config } from './types.js';

function expandTilde(p: string): string {
  return p.startsWith('~') ? resolve(homedir(), p.slice(2)) : p;
}

function resolveEnvVars(str: string): string {
  return str.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '');
}

function resolveEnvVarsDeep(obj: unknown): unknown {
  if (typeof obj === 'string') return resolveEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(resolveEnvVarsDeep);
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolveEnvVarsDeep(v);
    }
    return result;
  }
  return obj;
}

export function loadConfig(configPath: string): Config {
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = resolveEnvVarsDeep(yaml.load(raw)) as Record<string, unknown>;

  const supabase = parsed.supabase as Record<string, string>;
  const ollama = parsed.ollama as Record<string, string>;
  const projects = parsed.projects as Record<string, { repos: Record<string, string>; related_repos?: string[] }>;

  const resolvedProjects: Config['projects'] = {};
  for (const [name, proj] of Object.entries(projects ?? {})) {
    const repos: Record<string, string> = {};
    for (const [repoName, repoPath] of Object.entries(proj.repos ?? {})) {
      repos[repoName] = expandTilde(repoPath);
    }
    resolvedProjects[name] = { repos, relatedRepos: proj.related_repos };
  }

  return {
    vaultPath: expandTilde(parsed.vault_path as string),
    contextDir: parsed.context_dir as string,
    supabase: { url: supabase.url, key: supabase.key },
    ollama: { baseUrl: ollama.base_url, model: ollama.model },
    projects: resolvedProjects,
  };
}

const DEFAULT_CONFIG_PATH = resolve(homedir(), '.second-brain', 'config.yml');

export function getConfig(configPath?: string): Config {
  return loadConfig(configPath ?? DEFAULT_CONFIG_PATH);
}

export function resolveProjectFromPath(
  dirPath: string,
  config: Config
): { project: string; repo: string } | undefined {
  const normalized = resolve(dirPath);
  for (const [projectName, projectConfig] of Object.entries(config.projects)) {
    for (const [repoName, repoPath] of Object.entries(projectConfig.repos)) {
      const resolvedRepo = resolve(expandTilde(repoPath));
      if (normalized === resolvedRepo || normalized.startsWith(resolvedRepo + '/')) {
        return { project: projectName, repo: repoName };
      }
    }
  }
  return undefined;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/config.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config loader with env var and tilde expansion"
```

---

## Task 3: Git Service

**Files:**
- Create: `src/services/git.ts`
- Create: `tests/services/git.test.ts`

**Step 1: Write the failing test**

Create `tests/services/git.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getGitContext } from '../../src/services/git.js';
import { resolve } from 'path';

describe('getGitContext', () => {
  it('detects branch and repo for the current repo', async () => {
    // second-brain is a git repo
    const ctx = await getGitContext(resolve(__dirname, '..', '..'));
    expect(ctx.repoRoot).toBeTruthy();
    expect(ctx.branch).toBeTruthy();
    expect(ctx.repoName).toBe('second-brain');
  });

  it('throws for a non-git directory', async () => {
    await expect(getGitContext('/tmp')).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/services/git.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement git.ts**

Create `src/services/git.ts`:

```typescript
import simpleGit from 'simple-git';
import { basename } from 'path';
import type { GitContext, Config } from '../types.js';
import { resolveProjectFromPath } from '../config.js';

export async function getGitContext(cwd: string, config?: Config): Promise<GitContext> {
  const git = simpleGit(cwd);

  const isRepo = await git.checkIsRepo();
  if (!isRepo) throw new Error(`Not a git repository: ${cwd}`);

  const repoRoot = await git.revparse(['--show-toplevel']);
  const branch = await git.revparse(['--abbrev-ref', 'HEAD']);

  const context: GitContext = {
    branch: branch.trim(),
    repoRoot: repoRoot.trim(),
    repoName: basename(repoRoot.trim()),
  };

  if (config) {
    const mapping = resolveProjectFromPath(repoRoot.trim(), config);
    if (mapping) {
      context.project = mapping.project;
      context.repoName = mapping.repo;
    }
  }

  return context;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/git.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/services/git.ts tests/services/git.test.ts
git commit -m "feat: add git context detection service"
```

---

## Task 4: Vault Service

**Files:**
- Create: `src/services/vault.ts`
- Create: `tests/services/vault.test.ts`

**Step 1: Write the failing test**

Create `tests/services/vault.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VaultService } from '../../src/services/vault.js';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ContextEntry } from '../../src/types.js';

describe('VaultService', () => {
  const tmpDir = join(tmpdir(), 'second-brain-test-vault');
  let vault: VaultService;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    vault = new VaultService(tmpDir, 'Dev-Context');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a branch context entry as markdown with frontmatter', () => {
    const entry: ContextEntry = {
      type: 'branch_context',
      project: 'tesla',
      repo: 'core-ui',
      branch: 'feature-auth',
      title: 'Branch: feature-auth',
      content: '## Status\nIn progress.\n\n## Where I Left Off\nMigrating auth module.',
      metadata: { tags: ['auth'] },
      createdAt: new Date('2026-03-04T15:00:00Z'),
      updatedAt: new Date('2026-03-04T15:00:00Z'),
    };

    const filePath = vault.writeEntry(entry);

    expect(existsSync(filePath)).toBe(true);
    const raw = readFileSync(filePath, 'utf-8');
    expect(raw).toContain('type: branch_context');
    expect(raw).toContain('project: tesla');
    expect(raw).toContain('repo: core-ui');
    expect(raw).toContain('branch: feature-auth');
    expect(raw).toContain('## Status');
    expect(raw).toContain('Migrating auth module');
  });

  it('generates correct vault path for branch context', () => {
    const path = vault.getEntryPath({
      type: 'branch_context',
      project: 'tesla',
      repo: 'core-ui',
      branch: 'feature-auth',
    });
    expect(path).toBe(join(tmpDir, 'Dev-Context', 'tesla', 'core-ui', 'branches', 'feature-auth.md'));
  });

  it('generates correct vault path for PR context', () => {
    const path = vault.getEntryPath({
      type: 'pr_context',
      project: 'tesla',
      repo: 'core-ui',
      prNumber: 423,
      title: 'Auth Refactor',
    });
    expect(path).toBe(join(tmpDir, 'Dev-Context', 'tesla', 'core-ui', 'prs', 'PR-423-auth-refactor.md'));
  });

  it('generates correct vault path for decisions', () => {
    const path = vault.getEntryPath({
      type: 'decision',
      project: 'tesla',
      title: 'Use JWT for auth',
      createdAt: new Date('2026-03-04'),
    });
    expect(path).toBe(join(tmpDir, 'Dev-Context', 'tesla', 'decisions', '2026-03-04-use-jwt-for-auth.md'));
  });

  it('reads an existing entry back with parsed frontmatter', () => {
    const entry: ContextEntry = {
      type: 'decision',
      project: 'tesla',
      title: 'Use JWT',
      content: 'We chose JWT because...',
      metadata: { tags: ['auth', 'security'] },
      createdAt: new Date('2026-03-04T10:00:00Z'),
      updatedAt: new Date('2026-03-04T10:00:00Z'),
    };

    const filePath = vault.writeEntry(entry);
    const read = vault.readEntry(filePath);

    expect(read.type).toBe('decision');
    expect(read.project).toBe('tesla');
    expect(read.title).toBe('Use JWT');
    expect(read.content).toContain('We chose JWT');
  });

  it('lists all entries in the vault', () => {
    vault.writeEntry({
      type: 'branch_context',
      project: 'tesla',
      repo: 'core-ui',
      branch: 'feature-a',
      title: 'A',
      content: 'content a',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vault.writeEntry({
      type: 'branch_context',
      project: 'tesla',
      repo: 'core-ui',
      branch: 'feature-b',
      title: 'B',
      content: 'content b',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const entries = vault.listEntries();
    expect(entries.length).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/services/vault.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement vault.ts**

Create `src/services/vault.ts`:

```typescript
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { globSync } from 'fs';
import matter from 'gray-matter';
import type { ContextEntry, Frontmatter, ContextType } from '../types.js';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export class VaultService {
  constructor(
    private vaultPath: string,
    private contextDir: string
  ) {}

  private get contextRoot(): string {
    return join(this.vaultPath, this.contextDir);
  }

  getEntryPath(opts: {
    type: ContextType;
    project?: string;
    repo?: string;
    branch?: string;
    prNumber?: number;
    title?: string;
    createdAt?: Date;
  }): string {
    const base = this.contextRoot;
    const project = opts.project ?? '_unlinked';

    switch (opts.type) {
      case 'branch_context':
        return join(base, project, opts.repo ?? '_unknown', 'branches', `${opts.branch}.md`);
      case 'pr_context':
        return join(base, project, opts.repo ?? '_unknown', 'prs', `PR-${opts.prNumber}-${slugify(opts.title ?? 'untitled')}.md`);
      case 'decision':
        return join(base, project, 'decisions', `${formatDate(opts.createdAt ?? new Date())}-${slugify(opts.title ?? 'untitled')}.md`);
      case 'learned':
        return join(base, project, 'learned', `${formatDate(opts.createdAt ?? new Date())}-${slugify(opts.title ?? 'untitled')}.md`);
      case 'session':
        return join(base, project, opts.repo ?? '_unknown', 'sessions', `${formatDate(opts.createdAt ?? new Date())}-${slugify(opts.title ?? 'session')}.md`);
      default:
        throw new Error(`Unknown context type: ${opts.type}`);
    }
  }

  writeEntry(entry: ContextEntry): string {
    const filePath = entry.vaultPath ?? this.getEntryPath(entry);

    const frontmatter: Frontmatter = {
      type: entry.type,
      project: entry.project,
      repo: entry.repo,
      branch: entry.branch,
      pr: entry.prNumber,
      created: entry.createdAt.toISOString(),
      updated: entry.updatedAt.toISOString(),
      tags: (entry.metadata.tags as string[]) ?? [],
    };

    // Remove undefined values
    const cleanFrontmatter = Object.fromEntries(
      Object.entries(frontmatter).filter(([, v]) => v !== undefined)
    );

    const markdown = matter.stringify(entry.content, cleanFrontmatter);

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, markdown);

    return filePath;
  }

  readEntry(filePath: string): ContextEntry {
    const raw = readFileSync(filePath, 'utf-8');
    const { data, content } = matter(raw);

    return {
      type: data.type,
      project: data.project,
      repo: data.repo,
      branch: data.branch,
      prNumber: data.pr,
      title: data.title ?? content.split('\n').find((l: string) => l.startsWith('# '))?.replace('# ', '') ?? 'Untitled',
      content: content.trim(),
      metadata: { tags: data.tags ?? [] },
      createdAt: new Date(data.created),
      updatedAt: new Date(data.updated),
      vaultPath: filePath,
    };
  }

  listEntries(subdir?: string): ContextEntry[] {
    const searchDir = subdir ? join(this.contextRoot, subdir) : this.contextRoot;
    if (!existsSync(searchDir)) return [];

    const files = this.findMarkdownFiles(searchDir);
    return files.map((f) => this.readEntry(f));
  }

  private findMarkdownFiles(dir: string): string[] {
    // Use Node's built-in recursive directory reading
    const { readdirSync } = require('fs');
    const results: string[] = [];

    function walk(d: string) {
      const items = readdirSync(d, { withFileTypes: true });
      for (const item of items) {
        const fullPath = join(d, item.name);
        if (item.isDirectory()) walk(fullPath);
        else if (item.name.endsWith('.md')) results.push(fullPath);
      }
    }

    walk(dir);
    return results;
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/vault.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/services/vault.ts tests/services/vault.test.ts
git commit -m "feat: add vault service for reading/writing context entries"
```

---

## Task 5: Embeddings Service

**Files:**
- Create: `src/services/embeddings.ts`
- Create: `tests/services/embeddings.test.ts`

**Step 1: Write the failing test**

Create `tests/services/embeddings.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingsService } from '../../src/services/embeddings.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;

  beforeEach(() => {
    service = new EmbeddingsService('http://localhost:11434', 'nomic-embed-text');
    mockFetch.mockReset();
  });

  it('calls Ollama API and returns embedding vector', async () => {
    const fakeEmbedding = Array.from({ length: 768 }, (_, i) => i * 0.001);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embedding: fakeEmbedding }),
    });

    const result = await service.embed('test text');

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: 'test text' }),
    });
    expect(result).toEqual(fakeEmbedding);
    expect(result).toHaveLength(768);
  });

  it('throws when Ollama is not reachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(service.embed('test')).rejects.toThrow('ECONNREFUSED');
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(service.embed('test')).rejects.toThrow();
  });

  it('isAvailable returns true when Ollama responds', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    expect(await service.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when Ollama is down', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await service.isAvailable()).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/services/embeddings.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement embeddings.ts**

Create `src/services/embeddings.ts`:

```typescript
export class EmbeddingsService {
  constructor(
    private baseUrl: string,
    private model: string
  ) {}

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl);
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/embeddings.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/services/embeddings.ts tests/services/embeddings.test.ts
git commit -m "feat: add Ollama embeddings service"
```

---

## Task 6: Supabase Service

**Files:**
- Create: `src/services/supabase.ts`
- Create: `tests/services/supabase.test.ts`

**Step 1: Write the failing test**

Create `tests/services/supabase.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseService } from '../../src/services/supabase.js';

// We'll mock the supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  })),
}));

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeEach(() => {
    service = new SupabaseService('https://test.supabase.co', 'test-key');
  });

  it('constructs without error', () => {
    expect(service).toBeDefined();
  });

  it('has upsertEntry method', () => {
    expect(typeof service.upsertEntry).toBe('function');
  });

  it('has searchByEmbedding method', () => {
    expect(typeof service.searchByEmbedding).toBe('function');
  });

  it('has getByBranch method', () => {
    expect(typeof service.getByBranch).toBe('function');
  });

  it('has getByProject method', () => {
    expect(typeof service.getByProject).toBe('function');
  });

  it('has getByPr method', () => {
    expect(typeof service.getByPr).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/services/supabase.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement supabase.ts**

Create `src/services/supabase.ts`:

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ContextEntry, ContextType } from '../types.js';

interface DbContextEntry {
  id?: string;
  type: string;
  project: string | null;
  repo: string | null;
  branch: string | null;
  pr_number: number | null;
  title: string;
  content: string;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  vault_path: string | null;
  created_at: string;
  updated_at: string;
}

export class SupabaseService {
  private client: SupabaseClient;

  constructor(url: string, key: string) {
    this.client = createClient(url, key);
  }

  async upsertEntry(entry: ContextEntry, embedding?: number[]): Promise<void> {
    const row: DbContextEntry = {
      id: entry.id,
      type: entry.type,
      project: entry.project ?? null,
      repo: entry.repo ?? null,
      branch: entry.branch ?? null,
      pr_number: entry.prNumber ?? null,
      title: entry.title,
      content: entry.content,
      embedding: embedding ?? null,
      metadata: entry.metadata,
      vault_path: entry.vaultPath ?? null,
      created_at: entry.createdAt.toISOString(),
      updated_at: entry.updatedAt.toISOString(),
    };

    const { error } = await this.client
      .from('context_entries')
      .upsert(row, { onConflict: 'vault_path' });

    if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  async searchByEmbedding(
    embedding: number[],
    opts?: { project?: string; repo?: string; type?: ContextType; limit?: number }
  ): Promise<ContextEntry[]> {
    const { data, error } = await this.client.rpc('match_context_entries', {
      query_embedding: embedding,
      match_count: opts?.limit ?? 10,
      filter_project: opts?.project ?? null,
      filter_repo: opts?.repo ?? null,
      filter_type: opts?.type ?? null,
    });

    if (error) throw new Error(`Supabase search failed: ${error.message}`);
    return (data ?? []).map(this.toContextEntry);
  }

  async getByBranch(branch: string, repo?: string, project?: string): Promise<ContextEntry[]> {
    let query = this.client
      .from('context_entries')
      .select('*')
      .eq('branch', branch);

    if (repo) query = query.eq('repo', repo);
    if (project) query = query.eq('project', project);

    const { data, error } = await query.order('updated_at', { ascending: false });
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return (data ?? []).map(this.toContextEntry);
  }

  async getByProject(project: string, since?: Date): Promise<ContextEntry[]> {
    let query = this.client
      .from('context_entries')
      .select('*')
      .eq('project', project);

    if (since) query = query.gte('updated_at', since.toISOString());

    const { data, error } = await query.order('updated_at', { ascending: false });
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return (data ?? []).map(this.toContextEntry);
  }

  async getByPr(prNumber: number, repo: string): Promise<ContextEntry[]> {
    const { data, error } = await this.client
      .from('context_entries')
      .select('*')
      .eq('pr_number', prNumber)
      .eq('repo', repo);

    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return (data ?? []).map(this.toContextEntry);
  }

  private toContextEntry(row: DbContextEntry): ContextEntry {
    return {
      id: row.id,
      type: row.type as ContextType,
      project: row.project ?? undefined,
      repo: row.repo ?? undefined,
      branch: row.branch ?? undefined,
      prNumber: row.pr_number ?? undefined,
      title: row.title,
      content: row.content,
      metadata: row.metadata ?? {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      vaultPath: row.vault_path ?? undefined,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/supabase.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/services/supabase.ts tests/services/supabase.test.ts
git commit -m "feat: add Supabase service for context entry storage and search"
```

---

## Task 7: Supabase Database Setup

**Files:**
- Create: `supabase/schema.sql`

**Step 1: Create the SQL migration**

Create `supabase/schema.sql`:

```sql
-- Enable pgvector extension
create extension if not exists vector;

-- Context entries table
create table if not exists context_entries (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  project text,
  repo text,
  branch text,
  pr_number int,
  title text not null,
  content text not null,
  embedding vector(768),
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  vault_path text unique
);

-- Indexes
create index if not exists idx_context_entries_project on context_entries (project);
create index if not exists idx_context_entries_repo on context_entries (repo);
create index if not exists idx_context_entries_branch on context_entries (branch);
create index if not exists idx_context_entries_pr on context_entries (pr_number);
create index if not exists idx_context_entries_type on context_entries (type);
create index if not exists idx_context_entries_vault_path on context_entries (vault_path);

-- Vector similarity search function
create or replace function match_context_entries(
  query_embedding vector(768),
  match_count int default 10,
  filter_project text default null,
  filter_repo text default null,
  filter_type text default null
)
returns table (
  id uuid,
  type text,
  project text,
  repo text,
  branch text,
  pr_number int,
  title text,
  content text,
  metadata jsonb,
  vault_path text,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ce.id,
    ce.type,
    ce.project,
    ce.repo,
    ce.branch,
    ce.pr_number,
    ce.title,
    ce.content,
    ce.metadata,
    ce.vault_path,
    ce.created_at,
    ce.updated_at,
    1 - (ce.embedding <=> query_embedding) as similarity
  from context_entries ce
  where
    ce.embedding is not null
    and (filter_project is null or ce.project = filter_project)
    and (filter_repo is null or ce.repo = filter_repo)
    and (filter_type is null or ce.type = filter_type)
  order by ce.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

**Step 2: Run this SQL in Supabase**

Go to Supabase Dashboard → SQL Editor → paste and run the schema.

**Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add Supabase schema with pgvector for context entries"
```

---

## Task 8: MCP Server — Core + Retrieval Tools

**Files:**
- Create: `src/mcp/server.ts`
- Create: `src/mcp/tools/search.ts`
- Create: `src/mcp/tools/branch.ts`
- Create: `src/mcp/tools/project.ts`
- Create: `src/mcp/tools/pr.ts`
- Create: `src/index.ts`

**Step 1: Create the MCP server setup**

Create `src/mcp/server.ts`:

```typescript
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

export function createServer(config: Config): McpServer {
  const server = new McpServer({
    name: 'second-brain',
    version: '0.1.0',
  });

  const supabase = new SupabaseService(config.supabase.url, config.supabase.key);
  const embeddings = new EmbeddingsService(config.ollama.baseUrl, config.ollama.model);
  const vault = new VaultService(config.vaultPath, config.contextDir);

  const services = { supabase, embeddings, vault, config };

  registerSearchTools(server, services);
  registerBranchTools(server, services);
  registerProjectTools(server, services);
  registerPrTools(server, services);
  registerCaptureTools(server, services);

  return server;
}
```

**Step 2: Create search tools**

Create `src/mcp/tools/search.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Config } from '../../types.js';
import type { SupabaseService } from '../../services/supabase.js';
import type { EmbeddingsService } from '../../services/embeddings.js';
import type { VaultService } from '../../services/vault.js';

interface Services {
  supabase: SupabaseService;
  embeddings: EmbeddingsService;
  vault: VaultService;
  config: Config;
}

export function registerSearchTools(server: McpServer, services: Services) {
  server.registerTool(
    'search_context',
    {
      description: 'Semantic search across all captured dev context. Use this to find relevant past decisions, branch status, PR context, or anything previously captured.',
      inputSchema: z.object({
        query: z.string().describe('Natural language search query'),
        project: z.string().optional().describe('Filter by project name'),
        repo: z.string().optional().describe('Filter by repo name'),
        type: z.enum(['branch_context', 'pr_context', 'decision', 'learned', 'session']).optional().describe('Filter by entry type'),
        limit: z.number().optional().default(5).describe('Max results to return'),
      }),
    },
    async ({ query, project, repo, type, limit }) => {
      const embedding = await services.embeddings.embed(query);
      const results = await services.supabase.searchByEmbedding(embedding, {
        project,
        repo,
        type,
        limit,
      });

      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No matching context found.' }] };
      }

      const formatted = results.map((r) =>
        `## ${r.title}\n**Type:** ${r.type} | **Project:** ${r.project ?? 'N/A'} | **Repo:** ${r.repo ?? 'N/A'}\n\n${r.content}`
      ).join('\n\n---\n\n');

      return { content: [{ type: 'text', text: formatted }] };
    }
  );

  server.registerTool(
    'get_related',
    {
      description: 'Find context entries related to a query. Useful for discovering connections between branches, PRs, and decisions.',
      inputSchema: z.object({
        query: z.string().describe('What to find related context for'),
        limit: z.number().optional().default(5).describe('Max results'),
      }),
    },
    async ({ query, limit }) => {
      const embedding = await services.embeddings.embed(query);
      const results = await services.supabase.searchByEmbedding(embedding, { limit });

      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No related context found.' }] };
      }

      const formatted = results.map((r) =>
        `- **${r.title}** (${r.type}) — ${r.project ?? ''}/${r.repo ?? ''}`
      ).join('\n');

      return { content: [{ type: 'text', text: `Related context:\n${formatted}` }] };
    }
  );
}
```

**Step 3: Create branch tools**

Create `src/mcp/tools/branch.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Config } from '../../types.js';
import type { SupabaseService } from '../../services/supabase.js';
import type { EmbeddingsService } from '../../services/embeddings.js';
import type { VaultService } from '../../services/vault.js';

interface Services {
  supabase: SupabaseService;
  embeddings: EmbeddingsService;
  vault: VaultService;
  config: Config;
}

export function registerBranchTools(server: McpServer, services: Services) {
  server.registerTool(
    'get_branch_context',
    {
      description: 'Get captured context for a specific branch. Shows status, decisions, dependencies, and where work left off. If branch/repo/project are omitted, they are auto-detected from cwd.',
      inputSchema: z.object({
        branch: z.string().optional().describe('Branch name (auto-detected if omitted)'),
        repo: z.string().optional().describe('Repo name (auto-detected if omitted)'),
        project: z.string().optional().describe('Project name (auto-detected if omitted)'),
      }),
    },
    async ({ branch, repo, project }) => {
      const results = await services.supabase.getByBranch(
        branch ?? 'unknown',
        repo,
        project
      );

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No context found for branch: ${branch ?? 'unknown'}` }] };
      }

      const formatted = results.map((r) => r.content).join('\n\n---\n\n');
      return { content: [{ type: 'text', text: formatted }] };
    }
  );
}
```

**Step 4: Create project tools**

Create `src/mcp/tools/project.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Config } from '../../types.js';
import type { SupabaseService } from '../../services/supabase.js';
import type { EmbeddingsService } from '../../services/embeddings.js';
import type { VaultService } from '../../services/vault.js';

interface Services {
  supabase: SupabaseService;
  embeddings: EmbeddingsService;
  vault: VaultService;
  config: Config;
}

export function registerProjectTools(server: McpServer, services: Services) {
  server.registerTool(
    'get_project_context',
    {
      description: 'Get all recent context for a project. Shows recent branch activity, PR context, decisions across all repos in the project.',
      inputSchema: z.object({
        project: z.string().describe('Project name'),
        since: z.string().optional().describe('ISO date string — only return entries updated after this date'),
      }),
    },
    async ({ project, since }) => {
      const sinceDate = since ? new Date(since) : undefined;
      const results = await services.supabase.getByProject(project, sinceDate);

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No context found for project: ${project}` }] };
      }

      const grouped: Record<string, string[]> = {};
      for (const r of results) {
        const key = `${r.repo ?? 'project-wide'} (${r.type})`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(`### ${r.title}\n${r.content}`);
      }

      const formatted = Object.entries(grouped)
        .map(([key, entries]) => `## ${key}\n\n${entries.join('\n\n')}`)
        .join('\n\n---\n\n');

      return { content: [{ type: 'text', text: formatted }] };
    }
  );
}
```

**Step 5: Create PR tools**

Create `src/mcp/tools/pr.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Config } from '../../types.js';
import type { SupabaseService } from '../../services/supabase.js';
import type { EmbeddingsService } from '../../services/embeddings.js';
import type { VaultService } from '../../services/vault.js';

interface Services {
  supabase: SupabaseService;
  embeddings: EmbeddingsService;
  vault: VaultService;
  config: Config;
}

export function registerPrTools(server: McpServer, services: Services) {
  server.registerTool(
    'get_pr_context',
    {
      description: 'Get captured context for a specific pull request, including its description, linked branch context, and decisions.',
      inputSchema: z.object({
        pr_number: z.number().describe('PR number'),
        repo: z.string().describe('Repo name'),
      }),
    },
    async ({ pr_number, repo }) => {
      const results = await services.supabase.getByPr(pr_number, repo);

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No context found for PR #${pr_number} in ${repo}` }] };
      }

      const formatted = results.map((r) => r.content).join('\n\n---\n\n');
      return { content: [{ type: 'text', text: formatted }] };
    }
  );
}
```

**Step 6: Create the MCP server entry point**

Create `src/index.ts`:

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getConfig } from './config.js';
import { createServer } from './mcp/server.js';

const config = getConfig();
const server = createServer(config);
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Step 7: Commit**

```bash
git add src/mcp/ src/index.ts
git commit -m "feat: add MCP server with retrieval tools (search, branch, project, PR)"
```

---

## Task 9: MCP Capture Tools

**Files:**
- Create: `src/mcp/tools/capture.ts`

**Step 1: Implement capture tools**

Create `src/mcp/tools/capture.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Config, ContextEntry } from '../../types.js';
import type { SupabaseService } from '../../services/supabase.js';
import type { EmbeddingsService } from '../../services/embeddings.js';
import type { VaultService } from '../../services/vault.js';

interface Services {
  supabase: SupabaseService;
  embeddings: EmbeddingsService;
  vault: VaultService;
  config: Config;
}

async function captureEntry(
  entry: ContextEntry,
  services: Services
): Promise<string> {
  // 1. Write to vault (always succeeds)
  const vaultPath = services.vault.writeEntry(entry);
  entry.vaultPath = vaultPath;

  // 2. Embed + store in Supabase (best effort)
  try {
    const available = await services.embeddings.isAvailable();
    if (available) {
      const embedding = await services.embeddings.embed(entry.content);
      await services.supabase.upsertEntry(entry, embedding);
    } else {
      // Store without embedding — sync later
      await services.supabase.upsertEntry(entry);
    }
  } catch (err) {
    // Vault write succeeded, DB will be synced later
    return `Captured to vault (${vaultPath}). DB sync pending: ${err instanceof Error ? err.message : 'unknown error'}`;
  }

  return `Captured to vault (${vaultPath}) and indexed in database.`;
}

export function registerCaptureTools(server: McpServer, services: Services) {
  server.registerTool(
    'capture_decision',
    {
      description: 'Capture an architecture or design decision. Records the what, why, and alternatives considered.',
      inputSchema: z.object({
        title: z.string().describe('Short title for the decision'),
        content: z.string().describe('Full decision content — what was decided, why, alternatives considered'),
        project: z.string().optional().describe('Project name (auto-detected if omitted)'),
        repo: z.string().optional().describe('Repo name (auto-detected if omitted)'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
      }),
    },
    async ({ title, content, project, repo, tags }) => {
      const now = new Date();
      const entry: ContextEntry = {
        type: 'decision',
        project,
        repo,
        title,
        content,
        metadata: { tags: tags ?? [] },
        createdAt: now,
        updatedAt: now,
      };

      const result = await captureEntry(entry, services);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  server.registerTool(
    'capture_learned',
    {
      description: 'Capture something you learned — a concept, technique, realization, or insight.',
      inputSchema: z.object({
        title: z.string().describe('What you learned (short)'),
        content: z.string().describe('Detailed explanation of what you learned'),
        project: z.string().optional().describe('Project name if relevant'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
      }),
    },
    async ({ title, content, project, tags }) => {
      const now = new Date();
      const entry: ContextEntry = {
        type: 'learned',
        project,
        title,
        content,
        metadata: { tags: tags ?? [] },
        createdAt: now,
        updatedAt: now,
      };

      const result = await captureEntry(entry, services);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  server.registerTool(
    'capture_status',
    {
      description: 'Snapshot the current status of work on a branch. Records what\'s done, what\'s next, and any blockers.',
      inputSchema: z.object({
        status: z.string().describe('Current status of the work'),
        next_steps: z.string().optional().describe('What needs to happen next'),
        blockers: z.string().optional().describe('Any blockers or dependencies'),
        branch: z.string().optional().describe('Branch name (auto-detected if omitted)'),
        repo: z.string().optional().describe('Repo name (auto-detected if omitted)'),
        project: z.string().optional().describe('Project name (auto-detected if omitted)'),
      }),
    },
    async ({ status, next_steps, blockers, branch, repo, project }) => {
      const now = new Date();
      let content = `## Status\n${status}`;
      if (next_steps) content += `\n\n## Next Steps\n${next_steps}`;
      if (blockers) content += `\n\n## Blockers\n${blockers}`;

      const entry: ContextEntry = {
        type: 'branch_context',
        project,
        repo,
        branch,
        title: `Branch: ${branch ?? 'unknown'}`,
        content,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };

      const result = await captureEntry(entry, services);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  server.registerTool(
    'capture_session_summary',
    {
      description: 'Summarize what was accomplished in this session. Records progress, decisions made, and next steps.',
      inputSchema: z.object({
        summary: z.string().describe('What was accomplished this session'),
        decisions: z.string().optional().describe('Key decisions made'),
        next_steps: z.string().optional().describe('What to do next session'),
        branch: z.string().optional().describe('Branch name (auto-detected if omitted)'),
        repo: z.string().optional().describe('Repo name (auto-detected if omitted)'),
        project: z.string().optional().describe('Project name (auto-detected if omitted)'),
      }),
    },
    async ({ summary, decisions, next_steps, branch, repo, project }) => {
      const now = new Date();
      let content = `## Summary\n${summary}`;
      if (decisions) content += `\n\n## Decisions\n${decisions}`;
      if (next_steps) content += `\n\n## Next Steps\n${next_steps}`;

      const entry: ContextEntry = {
        type: 'session',
        project,
        repo,
        branch,
        title: `Session: ${now.toISOString().split('T')[0]}`,
        content,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };

      const result = await captureEntry(entry, services);
      return { content: [{ type: 'text', text: result }] };
    }
  );
}
```

**Step 2: Commit**

```bash
git add src/mcp/tools/capture.ts
git commit -m "feat: add MCP capture tools (decision, learned, status, session)"
```

---

## Task 10: CLI Entry Point

**Files:**
- Create: `src/cli.ts`
- Create: `src/hooks/post-commit.ts`
- Create: `src/hooks/pr-event.ts`
- Create: `src/hooks/session-start.ts`

**Step 1: Create hook handlers**

Create `src/hooks/post-commit.ts`:

```typescript
import { getConfig } from '../config.js';
import { getGitContext } from '../services/git.js';
import { VaultService } from '../services/vault.js';
import { EmbeddingsService } from '../services/embeddings.js';
import { SupabaseService } from '../services/supabase.js';
import type { ContextEntry } from '../types.js';

interface PostCommitInput {
  cwd: string;
  tool_input?: {
    command?: string;
  };
  tool_response?: unknown;
}

export async function handlePostCommit(input: PostCommitInput): Promise<void> {
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
```

Create `src/hooks/pr-event.ts`:

```typescript
import { getConfig } from '../config.js';
import { getGitContext } from '../services/git.js';
import { VaultService } from '../services/vault.js';
import { EmbeddingsService } from '../services/embeddings.js';
import { SupabaseService } from '../services/supabase.js';
import type { ContextEntry } from '../types.js';

interface PrEventInput {
  cwd: string;
  tool_input?: {
    command?: string;
  };
}

export async function handlePrEvent(input: PrEventInput): Promise<void> {
  const { cwd, tool_input } = input;
  const command = tool_input?.command ?? '';

  // Only trigger on gh pr create/edit
  if (!command.match(/gh\s+pr\s+(create|edit)/)) return;

  const config = getConfig();
  const gitCtx = await getGitContext(cwd, config);
  const vault = new VaultService(config.vaultPath, config.contextDir);
  const embeddings = new EmbeddingsService(config.ollama.baseUrl, config.ollama.model);
  const supabase = new SupabaseService(config.supabase.url, config.supabase.key);

  const now = new Date();
  const entry: ContextEntry = {
    type: 'pr_context',
    project: gitCtx.project,
    repo: gitCtx.repoName,
    branch: gitCtx.branch,
    title: `PR from ${gitCtx.branch}`,
    content: `## PR Event\nBranch: ${gitCtx.branch}\nCommand: \`${command}\`\nTimestamp: ${now.toISOString()}`,
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
    // Vault is primary, DB sync later
  }
}
```

Create `src/hooks/session-start.ts`:

```typescript
import { getConfig } from '../config.js';
import { getGitContext } from '../services/git.js';
import { EmbeddingsService } from '../services/embeddings.js';
import { SupabaseService } from '../services/supabase.js';

interface SessionStartInput {
  cwd: string;
}

export async function handleSessionStart(input: SessionStartInput): Promise<string> {
  const config = getConfig();

  let gitCtx;
  try {
    gitCtx = await getGitContext(input.cwd, config);
  } catch {
    return '';  // Not in a git repo — no context to inject
  }

  const supabase = new SupabaseService(config.supabase.url, config.supabase.key);
  const embeddings = new EmbeddingsService(config.ollama.baseUrl, config.ollama.model);

  const parts: string[] = [];

  // Get branch context
  const branchContext = await supabase.getByBranch(gitCtx.branch, gitCtx.repoName, gitCtx.project);
  if (branchContext.length > 0) {
    parts.push(`## Current Branch: ${gitCtx.branch}\n\n${branchContext[0].content}`);
  }

  // Get recent project context
  if (gitCtx.project) {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const projectContext = await supabase.getByProject(gitCtx.project, oneWeekAgo);

    const otherEntries = projectContext
      .filter((e) => e.branch !== gitCtx!.branch)
      .slice(0, 5);

    if (otherEntries.length > 0) {
      const summaries = otherEntries.map((e) => `- **${e.title}** (${e.type}): ${e.content.split('\n')[0]}`);
      parts.push(`## Recent Project Activity (${gitCtx.project})\n\n${summaries.join('\n')}`);
    }
  }

  if (parts.length === 0) return '';

  return `# Second Brain Context\n\n${parts.join('\n\n---\n\n')}`;
}
```

**Step 2: Create the CLI**

Create `src/cli.ts`:

```typescript
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
      // Output JSON that Claude Code will inject as context
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

program.parse();
```

**Step 3: Commit**

```bash
git add src/cli.ts src/hooks/
git commit -m "feat: add CLI and hook handlers for auto-capture"
```

---

## Task 11: Claude Code Integration

**Files:**
- Modify: `~/.claude/settings.json` (add hooks)
- Modify: `~/.claude/mcp.json` (add second-brain MCP server)
- Create: `~/.second-brain/config.yml` (user config)

**Step 1: Build the project**

```bash
cd /Users/johrt/Code/second-brain
npm run build
npm link
```

This makes `second-brain` available globally as a CLI command.

**Step 2: Create user config**

Create `~/.second-brain/config.yml` with actual values:

```yaml
vault_path: ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/SecondBrain
context_dir: Work/Dev-Context

supabase:
  url: ${SUPABASE_URL}
  key: ${SUPABASE_ANON_KEY}

ollama:
  base_url: http://localhost:11434
  model: nomic-embed-text

projects:
  tesla:
    repos:
      core-ui: ~/Code/tesla/projects/core-ui
      tesla-site: ~/Code/tesla/projects/tesla-site
      tesla-ui: ~/Code/tesla/projects/tesla-ui
    related_repos:
      - core-ui <-> tesla-site
```

Set environment variables in your shell profile:
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
```

**Step 3: Add MCP server to Claude Code**

Add to `~/.claude/mcp.json` under `mcpServers`:

```json
{
  "second-brain": {
    "command": "second-brain-mcp",
    "args": [],
    "env": {
      "SUPABASE_URL": "${SUPABASE_URL}",
      "SUPABASE_ANON_KEY": "${SUPABASE_ANON_KEY}"
    }
  }
}
```

Note: We need to add a `second-brain-mcp` bin entry to package.json that runs `node dist/index.js`. Update package.json `bin`:

```json
{
  "bin": {
    "second-brain": "./dist/cli.js",
    "second-brain-mcp": "./dist/index.js"
  }
}
```

Then re-run `npm link`.

**Step 4: Add hooks to Claude Code settings**

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "second-brain capture-hook --event post-commit",
            "timeout": 10
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "second-brain capture-hook --event pr-event",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "second-brain session-context",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

**Step 5: Commit**

```bash
cd /Users/johrt/Code/second-brain
git add package.json config.example.yml
git commit -m "feat: add bin entries and config example for Claude Code integration"
```

---

## Task 12: Manual Smoke Test

**Step 1: Verify Ollama is running**

```bash
ollama list
curl http://localhost:11434/api/embeddings -d '{"model":"nomic-embed-text","prompt":"test"}'
```

Expected: Returns a JSON object with `embedding` array of 768 numbers.

**Step 2: Verify Supabase schema**

Go to Supabase dashboard → Table Editor → verify `context_entries` table exists with correct columns.

**Step 3: Test the MCP server**

Start a new Claude Code session. Verify the second-brain MCP tools appear in the tool list. Try:

- `search_context` with a query
- `capture_decision` with a test decision
- Check that the markdown file appeared in the Obsidian vault

**Step 4: Test hooks**

In a git repo listed in config:

1. Make a commit — verify a branch context file appears in the vault
2. Start a new session — verify context injection output

**Step 5: Test sync**

```bash
second-brain sync
```

Expected: Lists and syncs all vault entries to Supabase.

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```

---

## Summary

| Task | Description | Est. Complexity |
|------|-------------|----------------|
| 1 | Project scaffolding | Simple |
| 2 | Config service + tests | Simple |
| 3 | Git service + tests | Simple |
| 4 | Vault service + tests | Medium |
| 5 | Embeddings service + tests | Simple |
| 6 | Supabase service + tests | Medium |
| 7 | Supabase database setup | Simple |
| 8 | MCP server + retrieval tools | Medium |
| 9 | MCP capture tools | Medium |
| 10 | CLI + hook handlers | Medium |
| 11 | Claude Code integration | Simple |
| 12 | Smoke testing | Simple |

**Total: 12 tasks.** Tasks 2-6 are independent services that can be parallelized. Tasks 8-9 depend on services. Tasks 10-11 depend on everything. Task 12 is the final validation.
