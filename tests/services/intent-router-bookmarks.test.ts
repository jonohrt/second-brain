import { describe, it, expect, vi } from 'vitest';
import type { OllamaChatService } from '../../src/services/ollama-chat.js';
import { IntentRouter } from '../../src/services/intent-router.js';

function createMockChat(response: string) {
  return {
    chatWithFallback: vi.fn(async () => ({ content: response, model: 'test' })),
    chat: vi.fn(),
    classify: vi.fn(),
  } as unknown as OllamaChatService;
}

describe('IntentRouter — bookmark intents (unit)', () => {
  it('parses save_link with url, title, and link_type', async () => {
    const response = JSON.stringify({
      intent: 'save_link',
      title: 'React Server Components Deep Dive',
      url: 'https://example.com/rsc-deep-dive',
      link_type: 'article',
    });
    const mock = createMockChat(response);
    const router = new IntentRouter(mock);

    const result = await router.classify(
      'Save this article for later: https://example.com/rsc-deep-dive — React Server Components Deep Dive',
      [],
    );

    expect(result.intent).toBe('save_link');
    expect(result.title).toBe('React Server Components Deep Dive');
    expect(result.url).toBe('https://example.com/rsc-deep-dive');
    expect(result.link_type).toBe('article');
  });

  it('parses list_links intent', async () => {
    const response = JSON.stringify({ intent: 'list_links' });
    const mock = createMockChat(response);
    const router = new IntentRouter(mock);

    const result = await router.classify('Show my reading list', []);

    expect(result.intent).toBe('list_links');
  });

  it('parses complete_link with update_query', async () => {
    const response = JSON.stringify({
      intent: 'complete_link',
      update_query: 'React Server Components',
    });
    const mock = createMockChat(response);
    const router = new IntentRouter(mock);

    const result = await router.classify(
      'I finished reading the React Server Components article',
      [],
    );

    expect(result.intent).toBe('complete_link');
    expect(result.update_query).toBe('React Server Components');
  });

  it('parses delete_link with update_query', async () => {
    const response = JSON.stringify({
      intent: 'delete_link',
      update_query: 'old tutorial',
    });
    const mock = createMockChat(response);
    const router = new IntentRouter(mock);

    const result = await router.classify('Remove the old tutorial bookmark', []);

    expect(result.intent).toBe('delete_link');
    expect(result.update_query).toBe('old tutorial');
  });

  it('keyword fallback: "save this link" triggers save_link', async () => {
    // LLM returns invalid JSON → fallback to keywords
    const mock = createMockChat('not valid json');
    const router = new IntentRouter(mock);

    const result = await router.classify(
      'Save this link for later https://example.com/article',
      [],
    );

    expect(result.intent).toBe('save_link');
  });

  it('keyword fallback: "show my bookmarks" triggers list_links', async () => {
    const mock = createMockChat('not valid json');
    const router = new IntentRouter(mock);

    const result = await router.classify('Show my bookmarks', []);

    expect(result.intent).toBe('list_links');
  });

  it('keyword fallback: "I watched that video" triggers complete_link', async () => {
    const mock = createMockChat('not valid json');
    const router = new IntentRouter(mock);

    const result = await router.classify('I watched that video already', []);

    expect(result.intent).toBe('complete_link');
  });

  it('keyword fallback: "delete that bookmark" triggers delete_link', async () => {
    const mock = createMockChat('not valid json');
    const router = new IntentRouter(mock);

    const result = await router.classify('Delete that bookmark about TypeScript', []);

    expect(result.intent).toBe('delete_link');
  });

  it('keyword override: LLM says ask but message matches save_link keywords', async () => {
    const response = JSON.stringify({ intent: 'ask' });
    const mock = createMockChat(response);
    const router = new IntentRouter(mock);

    const result = await router.classify(
      'Bookmark this article https://example.com/thing',
      [],
    );

    expect(result.intent).toBe('save_link');
  });
});

describe('IntentRouter — bookmark intents (live LLM)', () => {
  // These tests hit the real Ollama instance.
  // Skip in CI or when Ollama is not available.
  const OLLAMA_URL = 'http://localhost:11434';

  async function ollamaAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
      return resp.ok;
    } catch {
      return false;
    }
  }

  // Lazy-init a real chat service + router
  let router: IntentRouter;
  let available: boolean | undefined;

  async function getRouter(): Promise<IntentRouter | null> {
    if (available === undefined) {
      available = await ollamaAvailable();
    }
    if (!available) return null;

    if (!router) {
      // Dynamic import to avoid loading config in unit-test context
      const { OllamaChatService } = await import('../../src/services/ollama-chat.js');
      const chat = new OllamaChatService(
        OLLAMA_URL,
        'qwen3:4b',
        'qwen3:4b',
        30000,
      );
      router = new IntentRouter(chat);
    }
    return router;
  }

  it('classifies "save this article for later" as save_link', async () => {
    const r = await getRouter();
    if (!r) return; // skip if Ollama not running

    const result = await r.classify(
      'Save this article for later: https://example.com/react-patterns — React Design Patterns',
      [],
    );
    expect(result.intent).toBe('save_link');
  }, 30000);

  it('classifies "show my reading list" as list_links', async () => {
    const r = await getRouter();
    if (!r) return;

    const result = await r.classify('Show my reading list', []);
    expect(result.intent).toBe('list_links');
  }, 30000);

  it('classifies "I finished watching that video" as complete_link', async () => {
    const r = await getRouter();
    if (!r) return;

    const result = await r.classify(
      'I finished watching that Kubernetes video, mark it as done',
      [],
    );
    expect(result.intent).toBe('complete_link');
  }, 30000);

  it('classifies "remove the bookmark about TypeScript" as delete_link', async () => {
    const r = await getRouter();
    if (!r) return;

    const result = await r.classify(
      'Remove the bookmark about TypeScript generics',
      [],
    );
    expect(result.intent).toBe('delete_link');
  }, 30000);

  it('classifies "I want to watch this later" as save_link', async () => {
    const r = await getRouter();
    if (!r) return;

    const result = await r.classify(
      'I want to watch this later: https://youtube.com/watch?v=abc123',
      [],
    );
    expect(result.intent).toBe('save_link');
  }, 30000);

  it('classifies "what articles have I saved" as list_links', async () => {
    const r = await getRouter();
    if (!r) return;

    const result = await r.classify('What articles have I saved?', []);
    expect(result.intent).toBe('list_links');
  }, 30000);
});
