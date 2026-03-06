import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Services } from '../../mcp/server.js';
import type { ContextType, ContextEntry } from '../../types.js';
import { captureEntry } from '../../services/capture.js';

const VALID_CONTEXT_TYPES: ContextType[] = [
  'branch_context', 'pr_context', 'decision', 'learned', 'session', 'task',
];

const captureBodySchema = z.object({
  text: z.string().min(1, 'text is required and must not be empty'),
  title: z.string().optional(),
  type: z.enum(VALID_CONTEXT_TYPES as [ContextType, ...ContextType[]]).default('learned'),
  tags: z.array(z.string()).optional(),
});

export async function captureRoutes(app: FastifyInstance, opts: { services: Services }) {
  const { services } = opts;

  app.post('/capture', async (request, reply) => {
    const parsed = captureBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    const { text, title, type, tags } = parsed.data;
    const now = new Date();

    const entry: ContextEntry = {
      type,
      title: title ?? text.slice(0, 60),
      content: text,
      metadata: { tags: tags ?? [] },
      createdAt: now,
      updatedAt: now,
    };

    try {
      await captureEntry(entry, services);
      return reply.status(201).send({
        success: true,
        title: entry.title,
        vaultPath: entry.vaultPath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({
        error: 'Capture failed',
        message,
      });
    }
  });
}
