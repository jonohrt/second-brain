import type { FastifyInstance } from 'fastify';
import bearerAuth from '@fastify/bearer-auth';
import fp from 'fastify-plugin';

async function authPluginImpl(
  app: FastifyInstance,
  opts: { apiToken: string }
) {
  await app.register(bearerAuth, {
    keys: new Set([opts.apiToken]),
    errorResponse: () => ({ error: 'Unauthorized' }),
  });
}

export const authPlugin = fp(authPluginImpl, {
  name: 'auth-plugin',
});
