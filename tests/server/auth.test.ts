import { describe, it, expect, afterEach } from 'vitest';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('Bearer auth on protected routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 401 without Authorization header', async () => {
    app = buildTestApp();
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/test-protected' });
    expect(res.statusCode).toBe(401);

    const body = JSON.parse(res.body);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 with wrong bearer token', async () => {
    app = buildTestApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/test-protected',
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(res.statusCode).toBe(401);

    const body = JSON.parse(res.body);
    expect(body.error).toBe('Unauthorized');
  });

  it('does NOT return 401 with valid bearer token', async () => {
    app = buildTestApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/test-protected',
      headers: { authorization: 'Bearer test-token-123' },
    });
    // Should not be 401 -- may be 404 since no actual handler, but not auth failure
    expect(res.statusCode).not.toBe(401);
  });
});
