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
