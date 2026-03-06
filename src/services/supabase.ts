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
    opts?: { project?: string; repo?: string; type?: ContextType; tag?: string; limit?: number }
  ): Promise<ContextEntry[]> {
    const { data, error } = await this.client.rpc('match_context_entries', {
      query_embedding: embedding,
      match_count: opts?.tag ? (opts?.limit ?? 10) * 3 : (opts?.limit ?? 10),
      filter_project: opts?.project ?? null,
      filter_repo: opts?.repo ?? null,
      filter_type: opts?.type ?? null,
    });

    if (error) throw new Error(`Supabase search failed: ${error.message}`);
    let results = (data ?? []).map(this.toContextEntry);

    if (opts?.tag) {
      results = results.filter((entry: ContextEntry) => {
        const tags = entry.metadata?.tags;
        return Array.isArray(tags) && tags.includes(opts.tag);
      });
      results = results.slice(0, opts?.limit ?? 10);
    }

    return results;
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

  async getTasksByStatus(
    status: string,
    opts?: { project?: string; limit?: number }
  ): Promise<ContextEntry[]> {
    let query = this.client
      .from('context_entries')
      .select('*')
      .eq('type', 'task')
      .eq('metadata->>status', status);

    if (opts?.project) query = query.eq('project', opts.project);
    query = query.order('created_at', { ascending: false });
    if (opts?.limit) query = query.limit(opts.limit);

    const { data, error } = await query;
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return (data ?? []).map(this.toContextEntry);
  }

  async findTaskByTitle(titleSubstring: string): Promise<ContextEntry[]> {
    const { data, error } = await this.client
      .from('context_entries')
      .select('*')
      .eq('type', 'task')
      .eq('metadata->>status', 'open')
      .ilike('title', `%${titleSubstring}%`);

    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return (data ?? []).map(this.toContextEntry);
  }

  async searchWithScores(
    embedding: number[],
    opts?: { limit?: number; threshold?: number },
  ): Promise<Array<{ entry: ContextEntry; similarity: number }>> {
    const { data, error } = await this.client.rpc('match_context_entries', {
      query_embedding: embedding,
      match_count: opts?.limit ?? 5,
      filter_project: null,
      filter_repo: null,
      filter_type: null,
    });

    if (error) throw new Error(`Supabase search failed: ${error.message}`);

    const threshold = opts?.threshold ?? 0.65;
    return (data ?? [])
      .filter((row: DbContextEntry & { similarity: number }) => row.similarity >= threshold)
      .map((row: DbContextEntry & { similarity: number }) => ({
        entry: this.toContextEntry(row),
        similarity: row.similarity,
      }));
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
