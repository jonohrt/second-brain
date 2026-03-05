import matter from 'gray-matter';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import type { ContextEntry, ContextType, Frontmatter } from '../types.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface EntryPathOpts {
  type: ContextType;
  project?: string;
  repo?: string;
  branch?: string;
  prNumber?: number;
  title?: string;
  createdAt?: Date;
}

export class VaultService {
  private vaultPath: string;
  private contextDir: string;

  constructor(vaultPath: string, contextDir: string) {
    this.vaultPath = vaultPath;
    this.contextDir = contextDir;
  }

  getEntryPath(opts: EntryPathOpts): string {
    const base = join(this.vaultPath, this.contextDir);
    const project = opts.project ?? 'unknown';

    switch (opts.type) {
      case 'branch_context': {
        const repo = opts.repo ?? 'unknown';
        const branch = opts.branch ?? 'unknown';
        return join(base, project, repo, 'branches', `${branch}.md`);
      }
      case 'pr_context': {
        const repo = opts.repo ?? 'unknown';
        const num = opts.prNumber ?? 0;
        const slug = slugify(opts.title ?? 'untitled');
        return join(base, project, repo, 'prs', `PR-${num}-${slug}.md`);
      }
      case 'decision': {
        const date = formatDate(opts.createdAt ?? new Date());
        const slug = slugify(opts.title ?? 'untitled');
        return join(base, project, 'decisions', `${date}-${slug}.md`);
      }
      case 'learned': {
        const date = formatDate(opts.createdAt ?? new Date());
        const slug = slugify(opts.title ?? 'untitled');
        return join(base, project, 'learned', `${date}-${slug}.md`);
      }
      case 'session': {
        const repo = opts.repo ?? 'unknown';
        const date = formatDate(opts.createdAt ?? new Date());
        const slug = slugify(opts.title ?? 'untitled');
        return join(base, project, repo, 'sessions', `${date}-${slug}.md`);
      }
    }
  }

  writeEntry(entry: ContextEntry): string {
    const filePath = this.getEntryPath({
      type: entry.type,
      project: entry.project,
      repo: entry.repo,
      branch: entry.branch,
      prNumber: entry.prNumber,
      title: entry.title,
      createdAt: entry.createdAt,
    });

    const frontmatter: Frontmatter = {
      type: entry.type,
      project: entry.project,
      repo: entry.repo,
      branch: entry.branch,
      pr: entry.prNumber,
      created: entry.createdAt.toISOString(),
      updated: entry.updatedAt.toISOString(),
      tags: (entry.metadata?.tags as string[]) ?? [],
    };

    // Add title to frontmatter data
    const data: Record<string, unknown> = { ...frontmatter, title: entry.title };

    // Remove undefined values
    for (const key of Object.keys(data)) {
      if (data[key] === undefined) {
        delete data[key];
      }
    }

    const output = matter.stringify(entry.content, data);

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, output, 'utf-8');

    return filePath;
  }

  readEntry(filePath: string): ContextEntry {
    const raw = readFileSync(filePath, 'utf-8');
    const { data, content } = matter(raw);

    const title =
      (data.title as string) ??
      content.match(/^#\s+(.+)$/m)?.[1] ??
      'Untitled';

    return {
      type: data.type as ContextType,
      project: data.project as string | undefined,
      repo: data.repo as string | undefined,
      branch: data.branch as string | undefined,
      prNumber: data.pr as number | undefined,
      title,
      content: content.trim(),
      metadata: { tags: data.tags ?? [] },
      createdAt: new Date(data.created as string),
      updatedAt: new Date(data.updated as string),
      vaultPath: filePath,
    };
  }

  listEntries(subdir?: string): ContextEntry[] {
    const baseDir = subdir
      ? join(this.vaultPath, this.contextDir, subdir)
      : join(this.vaultPath, this.contextDir);

    const entries: ContextEntry[] = [];
    this.walkDir(baseDir, entries);
    return entries;
  }

  private walkDir(dir: string, entries: ContextEntry[]): void {
    let items;
    try {
      items = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of items) {
      const fullPath = join(dir, item.name);
      if (item.isDirectory()) {
        this.walkDir(fullPath, entries);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        try {
          entries.push(this.readEntry(fullPath));
        } catch {
          // Skip files that can't be parsed
        }
      }
    }
  }
}
