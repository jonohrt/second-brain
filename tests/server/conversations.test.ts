import { describe, it, expect, afterEach } from 'vitest';
import { buildTestAppWithAsk } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('Conversation routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET /conversations returns 200 with conversation list', async () => {
    app = buildTestAppWithAsk();
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: { authorization: 'Bearer test-token-123' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.conversations).toEqual([]);
  });

  it('GET /conversations/:id/messages returns 200', async () => {
    app = buildTestAppWithAsk();
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/conversations/conv-test-123/messages',
      headers: { authorization: 'Bearer test-token-123' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.messages).toEqual([]);
  });

  it('DELETE /conversations/:id returns 200', async () => {
    app = buildTestAppWithAsk();
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: '/conversations/conv-test-123',
      headers: { authorization: 'Bearer test-token-123' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /conversations returns 401 without auth', async () => {
    app = buildTestAppWithAsk();
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/conversations',
    });
    expect(res.statusCode).toBe(401);
  });
});
