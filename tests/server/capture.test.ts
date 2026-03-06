import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildTestAppWithServices } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('POST /capture', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 201 with success, title, and vaultPath for valid request', async () => {
    app = buildTestAppWithServices();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/capture',
      headers: { authorization: 'Bearer test-token-123' },
      payload: { text: 'My thought about testing' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(typeof body.title).toBe('string');
    expect(typeof body.vaultPath).toBe('string');
  });

  it('uses custom title when provided', async () => {
    app = buildTestAppWithServices();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/capture',
      headers: { authorization: 'Bearer test-token-123' },
      payload: { text: 'My thought', title: 'Custom Title' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.title).toBe('Custom Title');
  });

  it('returns 400 for empty body', async () => {
    app = buildTestAppWithServices();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/capture',
      headers: { authorization: 'Bearer test-token-123' },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid request body');
  });

  it('returns 400 for empty text string', async () => {
    app = buildTestAppWithServices();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/capture',
      headers: { authorization: 'Bearer test-token-123' },
      payload: { text: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth header', async () => {
    app = buildTestAppWithServices();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/capture',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 500 when captureEntry throws', async () => {
    app = buildTestAppWithServices({
      vaultWriteEntry: vi.fn(() => { throw new Error('Vault disk full'); }),
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/capture',
      headers: { authorization: 'Bearer test-token-123' },
      payload: { text: 'This will fail' },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Capture failed');
    expect(body.message).toContain('Vault disk full');
  });
});
