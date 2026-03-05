import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContextEntry } from '../../src/types.js';

// Build chainable query mock
function createQueryMock(resolvedValue: { data: unknown; error: unknown }) {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === 'then') {
            // Make it thenable so await works
            return (resolve: (v: unknown) => void) => resolve(resolvedValue);
          }
          if (!mock[prop]) {
            mock[prop] = vi.fn().mockReturnValue(chain());
          }
          return mock[prop];
        },
      },
    );
  return { chain: chain(), mocks: mock };
}

// Mock @supabase/supabase-js
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

// Import after mock setup
import { SupabaseService } from '../../src/services/supabase.js';
import { createClient } from '@supabase/supabase-js';

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SupabaseService('https://example.supabase.co', 'test-key');
  });

  it('constructs without error', () => {
    expect(service).toBeInstanceOf(SupabaseService);
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'test-key');
  });

  it('has expected methods', () => {
    expect(typeof service.upsertEntry).toBe('function');
    expect(typeof service.searchByEmbedding).toBe('function');
    expect(typeof service.getByBranch).toBe('function');
    expect(typeof service.getByProject).toBe('function');
    expect(typeof service.getByPr).toBe('function');
  });

  describe('upsertEntry', () => {
    it('calls supabase.from("context_entries").upsert() with correctly mapped fields', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      const entry: ContextEntry = {
        id: 'test-id',
        type: 'branch_context',
        project: 'my-project',
        repo: 'my-repo',
        branch: 'feature/test',
        prNumber: 42,
        title: 'Test Entry',
        content: 'Some content',
        metadata: { key: 'value' },
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:00:00Z'),
        vaultPath: 'context/test.md',
      };
      const embedding = [0.1, 0.2, 0.3];

      await service.upsertEntry(entry, embedding);

      expect(mockFrom).toHaveBeenCalledWith('context_entries');
      expect(mockUpsert).toHaveBeenCalledWith(
        {
          id: 'test-id',
          type: 'branch_context',
          project: 'my-project',
          repo: 'my-repo',
          branch: 'feature/test',
          pr_number: 42,
          title: 'Test Entry',
          content: 'Some content',
          embedding: [0.1, 0.2, 0.3],
          metadata: { key: 'value' },
          vault_path: 'context/test.md',
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-02T00:00:00.000Z',
        },
        { onConflict: 'vault_path' },
      );
    });

    it('maps undefined optional fields to null', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      const entry: ContextEntry = {
        type: 'decision',
        title: 'Minimal',
        content: 'content',
        metadata: {},
        createdAt: new Date('2025-06-01T00:00:00Z'),
        updatedAt: new Date('2025-06-01T00:00:00Z'),
      };

      await service.upsertEntry(entry);

      const row = mockUpsert.mock.calls[0][0];
      expect(row.project).toBeNull();
      expect(row.repo).toBeNull();
      expect(row.branch).toBeNull();
      expect(row.pr_number).toBeNull();
      expect(row.embedding).toBeNull();
      expect(row.vault_path).toBeNull();
    });

    it('throws on upsert error', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({
        error: { message: 'duplicate key' },
      });
      mockFrom.mockReturnValue({ upsert: mockUpsert });

      const entry: ContextEntry = {
        type: 'decision',
        title: 'Test',
        content: 'content',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(service.upsertEntry(entry)).rejects.toThrow('Supabase upsert failed: duplicate key');
    });
  });

  describe('searchByEmbedding', () => {
    it('calls supabase.rpc("match_context_entries") with correct params', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      const embedding = [0.1, 0.2, 0.3];
      await service.searchByEmbedding(embedding, {
        project: 'proj',
        repo: 'repo',
        type: 'decision',
        limit: 5,
      });

      expect(mockRpc).toHaveBeenCalledWith('match_context_entries', {
        query_embedding: [0.1, 0.2, 0.3],
        match_count: 5,
        filter_project: 'proj',
        filter_repo: 'repo',
        filter_type: 'decision',
      });
    });

    it('uses defaults when no opts provided', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      await service.searchByEmbedding([1, 2, 3]);

      expect(mockRpc).toHaveBeenCalledWith('match_context_entries', {
        query_embedding: [1, 2, 3],
        match_count: 10,
        filter_project: null,
        filter_repo: null,
        filter_type: null,
      });
    });

    it('maps returned rows to ContextEntry', async () => {
      mockRpc.mockResolvedValue({
        data: [
          {
            id: 'r1',
            type: 'learned',
            project: null,
            repo: 'my-repo',
            branch: null,
            pr_number: null,
            title: 'Learned Thing',
            content: 'details',
            metadata: { a: 1 },
            vault_path: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-02T00:00:00.000Z',
          },
        ],
        error: null,
      });

      const results = await service.searchByEmbedding([1, 2]);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'r1',
        type: 'learned',
        project: undefined,
        repo: 'my-repo',
        branch: undefined,
        prNumber: undefined,
        title: 'Learned Thing',
        content: 'details',
        metadata: { a: 1 },
        vaultPath: undefined,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-02T00:00:00.000Z'),
      });
    });

    it('throws on rpc error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc failed' } });
      await expect(service.searchByEmbedding([1])).rejects.toThrow('Supabase search failed: rpc failed');
    });
  });

  describe('getByBranch', () => {
    it('queries context_entries filtered by branch', async () => {
      const query = createQueryMock({ data: [], error: null });
      mockFrom.mockReturnValue(query.chain);

      await service.getByBranch('feature/x');

      expect(mockFrom).toHaveBeenCalledWith('context_entries');
      expect(query.mocks['select']).toHaveBeenCalledWith('*');
      expect(query.mocks['eq']).toHaveBeenCalledWith('branch', 'feature/x');
      expect(query.mocks['order']).toHaveBeenCalledWith('updated_at', { ascending: false });
    });

    it('adds repo and project filters when provided', async () => {
      const query = createQueryMock({ data: [], error: null });
      mockFrom.mockReturnValue(query.chain);

      await service.getByBranch('main', 'my-repo', 'my-project');

      // eq is called 3 times: branch, repo, project
      expect(query.mocks['eq']).toHaveBeenCalledWith('branch', 'main');
      expect(query.mocks['eq']).toHaveBeenCalledWith('repo', 'my-repo');
      expect(query.mocks['eq']).toHaveBeenCalledWith('project', 'my-project');
    });
  });

  describe('getByProject', () => {
    it('queries context_entries filtered by project', async () => {
      const query = createQueryMock({ data: [], error: null });
      mockFrom.mockReturnValue(query.chain);

      await service.getByProject('my-project');

      expect(mockFrom).toHaveBeenCalledWith('context_entries');
      expect(query.mocks['select']).toHaveBeenCalledWith('*');
      expect(query.mocks['eq']).toHaveBeenCalledWith('project', 'my-project');
      expect(query.mocks['order']).toHaveBeenCalledWith('updated_at', { ascending: false });
    });

    it('adds since filter when provided', async () => {
      const query = createQueryMock({ data: [], error: null });
      mockFrom.mockReturnValue(query.chain);

      const since = new Date('2025-06-01T00:00:00Z');
      await service.getByProject('proj', since);

      expect(query.mocks['gte']).toHaveBeenCalledWith('updated_at', '2025-06-01T00:00:00.000Z');
    });
  });

  describe('getByPr', () => {
    it('queries context_entries filtered by pr_number and repo', async () => {
      const query = createQueryMock({ data: [], error: null });
      mockFrom.mockReturnValue(query.chain);

      await service.getByPr(123, 'my-repo');

      expect(mockFrom).toHaveBeenCalledWith('context_entries');
      expect(query.mocks['select']).toHaveBeenCalledWith('*');
      expect(query.mocks['eq']).toHaveBeenCalledWith('pr_number', 123);
      expect(query.mocks['eq']).toHaveBeenCalledWith('repo', 'my-repo');
    });
  });
});
