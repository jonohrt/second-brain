import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { OllamaChatService } from '../../src/services/ollama-chat.js';

describe('OllamaChatService', () => {
  let service: OllamaChatService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OllamaChatService('http://localhost:11434', 'qwen3.5:cloud', 'qwen2.5:7b');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('chat()', () => {
    it('sends POST to /api/chat and returns content and model', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: 'Paris is the capital of France.' },
          model: 'qwen3.5:cloud',
          done: true,
        }),
      });

      const result = await service.chat({
        model: 'qwen3.5:cloud',
        messages: [{ role: 'user', content: 'What is the capital of France?' }],
      });

      expect(result).toEqual({
        content: 'Paris is the capital of France.',
        model: 'qwen3.5:cloud',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('qwen3.5:cloud');
      expect(body.stream).toBe(false);
      expect(body.keep_alive).toBe(0);
      expect(body.messages).toEqual([{ role: 'user', content: 'What is the capital of France?' }]);
    });

    it('throws on non-2xx response with status in error message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(
        service.chat({
          model: 'qwen3.5:cloud',
          messages: [{ role: 'user', content: 'test' }],
        }),
      ).rejects.toThrow('Ollama chat failed: 500 Internal Server Error');
    });

    it('aborts after timeout ms via AbortController', async () => {
      // Create a service with a very short timeout
      const shortTimeoutService = new OllamaChatService(
        'http://localhost:11434',
        'qwen3.5:cloud',
        'qwen2.5:7b',
        50, // 50ms timeout
      );

      mockFetch.mockImplementation(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'));
            });
            // Never resolves - simulates a hanging request
          }),
      );

      await expect(
        shortTimeoutService.chat({
          model: 'qwen3.5:cloud',
          messages: [{ role: 'user', content: 'test' }],
        }),
      ).rejects.toThrow('aborted');
    });
  });

  describe('chatWithFallback()', () => {
    it('returns cloud model result on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: 'cloud answer' },
          model: 'qwen3.5:cloud',
          done: true,
        }),
      });

      const result = await service.chatWithFallback([
        { role: 'user', content: 'test' },
      ]);

      expect(result.content).toBe('cloud answer');
      expect(result.model).toBe('qwen3.5:cloud');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('catches cloud error and retries with local model', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            message: { content: 'local answer' },
            model: 'qwen2.5:7b',
            done: true,
          }),
        });

      const result = await service.chatWithFallback([
        { role: 'user', content: 'test' },
      ]);

      expect(result.content).toBe('local answer');
      expect(result.model).toBe('qwen2.5:7b');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify first call used cloud model, second used local
      const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(firstBody.model).toBe('qwen3.5:cloud');
      expect(secondBody.model).toBe('qwen2.5:7b');
    });

    it('throws if both cloud and local fail', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

      await expect(
        service.chatWithFallback([{ role: 'user', content: 'test' }]),
      ).rejects.toThrow();
    });
  });

  describe('classify()', () => {
    it('returns parsed route from JSON response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: '{"route": "brain"}' },
          model: 'qwen3.5:cloud',
          done: true,
        }),
      });

      const route = await service.classify('What did I write about TypeScript?');

      expect(route).toBe('brain');
    });

    it('defaults to "both" on JSON parse failure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: 'not valid json' },
          model: 'qwen3.5:cloud',
          done: true,
        }),
      });

      const route = await service.classify('something');

      expect(route).toBe('both');
    });

    it('defaults to "both" on invalid route value', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: '{"route": "invalid"}' },
          model: 'qwen3.5:cloud',
          done: true,
        }),
      });

      const route = await service.classify('something');

      expect(route).toBe('both');
    });
  });
});
