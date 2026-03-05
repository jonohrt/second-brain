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
