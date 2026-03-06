import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { SearxngService } from '../../src/services/searxng.js';

describe('SearxngService', () => {
  let service: SearxngService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SearxngService('http://localhost:8888');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('search()', () => {
    it('sends GET to /search with correct query params and returns parsed results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              title: 'TypeScript Guide',
              url: 'https://example.com/ts',
              content: 'A guide to TypeScript',
              engine: 'google',
              score: 1.5,
            },
            {
              title: 'TS Docs',
              url: 'https://typescriptlang.org',
              content: 'Official docs',
              engine: 'duckduckgo',
              score: 1.2,
            },
          ],
        }),
      });

      const results = await service.search('TypeScript tutorial');

      expect(results).toEqual([
        {
          title: 'TypeScript Guide',
          url: 'https://example.com/ts',
          content: 'A guide to TypeScript',
          engine: 'google',
          score: 1.5,
        },
        {
          title: 'TS Docs',
          url: 'https://typescriptlang.org',
          content: 'Official docs',
          engine: 'duckduckgo',
          score: 1.2,
        },
      ]);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('http://localhost:8888/search?');
      expect(calledUrl).toContain('q=TypeScript+tutorial');
      expect(calledUrl).toContain('format=json');
      expect(calledUrl).toContain('categories=general');
    });

    it('returns empty array when results is empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });

      const results = await service.search('nothing');
      expect(results).toEqual([]);
    });

    it('returns empty array when results is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const results = await service.search('nothing');
      expect(results).toEqual([]);
    });

    it('throws on non-2xx response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(service.search('test')).rejects.toThrow(
        'SearXNG search failed: 500 Internal Server Error',
      );
    });

    it('respects limit option', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: Array.from({ length: 10 }, (_, i) => ({
            title: `Result ${i}`,
            url: `https://example.com/${i}`,
            content: `Content ${i}`,
            engine: 'google',
            score: 1.0,
          })),
        }),
      });

      const results = await service.search('test', { limit: 3 });
      expect(results).toHaveLength(3);
    });

    it('defaults to 5 results max', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: Array.from({ length: 10 }, (_, i) => ({
            title: `Result ${i}`,
            url: `https://example.com/${i}`,
            content: `Content ${i}`,
            engine: 'google',
            score: 1.0,
          })),
        }),
      });

      const results = await service.search('test');
      expect(results).toHaveLength(5);
    });

    it('passes custom categories', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });

      await service.search('test', { categories: 'science' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('categories=science');
    });
  });
});
