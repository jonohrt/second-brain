import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildTestAppWithAsk } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('POST /ask', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 200 with answer, sources, route, model, conversation_id for valid request', async () => {
    app = buildTestAppWithAsk();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      headers: { authorization: 'Bearer test-token-123' },
      payload: { text: 'What did I write about TypeScript?' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.answer).toBe('test answer');
    expect(body.sources).toEqual([]);
    expect(body.route).toBe('brain');
    expect(body.model).toBe('test-model');
    expect(body.conversation_id).toBe('conv-test-123');
  });

  it('returns 400 for empty body', async () => {
    app = buildTestAppWithAsk();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      headers: { authorization: 'Bearer test-token-123' },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid request body');
  });

  it('returns 400 for empty text string', async () => {
    app = buildTestAppWithAsk();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      headers: { authorization: 'Bearer test-token-123' },
      payload: { text: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth header', async () => {
    app = buildTestAppWithAsk();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/ask',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 500 when pipeline throws', async () => {
    app = buildTestAppWithAsk({
      askFn: vi.fn().mockRejectedValue(new Error('LLM exploded')),
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      headers: { authorization: 'Bearer test-token-123' },
      payload: { text: 'This will fail' },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Ask failed');
    expect(body.message).toContain('LLM exploded');
  });

  it('handles capture_task intent', async () => {
    app = buildTestAppWithAsk({
      intentFn: vi.fn(async () => ({
        intent: 'capture_task',
        title: 'Fix login bug',
        project: 'tesla',
        tags: ['bug'],
      })),
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      headers: { authorization: 'Bearer test-token-123' },
      payload: { text: 'Capture a task to fix the login bug' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.answer).toContain('Fix login bug');
    expect(body.route).toBe('capture');
  });
});
