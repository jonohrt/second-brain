import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AskPipeline } from '../../services/ask-pipeline.js';
import type { Services } from '../../mcp/server.js';
import type { ContextEntry } from '../../types.js';
import { captureEntry } from '../../services/capture.js';

const askBodySchema = z.object({
  text: z.string().min(1, 'text is required'),
});

const CAPTURE_PATTERNS = [
  /^(remember|save|store|note|capture|record|log)\b/i,
  /\b(remember|save|store|note|capture) (this|that)\b/i,
  /\bdon'?t forget\b/i,
  /\bkeep in mind\b/i,
  /\bmake a note\b/i,
];

function isCaptureIntent(text: string): boolean {
  return CAPTURE_PATTERNS.some((p) => p.test(text));
}

export async function askRoutes(
  app: FastifyInstance,
  opts: { askPipeline: AskPipeline; services: Services },
) {
  const { askPipeline, services } = opts;

  app.post('/ask', async (request, reply) => {
    const parsed = askBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    const text = parsed.data.text;

    // Auto-detect capture intent
    if (isCaptureIntent(text)) {
      try {
        const now = new Date();
        const entry: ContextEntry = {
          type: 'learned',
          title: text.slice(0, 60),
          content: text,
          metadata: { tags: [] },
          createdAt: now,
          updatedAt: now,
        };
        await captureEntry(entry, services);
        return reply.send({
          answer: `Saved to your second brain: "${entry.title}"`,
          sources: [],
          route: 'capture',
          model: 'none',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ error: 'Capture failed', message });
      }
    }

    try {
      const result = await askPipeline.ask(text);
      return reply.send({
        answer: result.answer,
        sources: result.sources,
        route: result.route,
        model: result.model,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ error: 'Ask failed', message });
    }
  });
}
