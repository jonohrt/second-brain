import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AskPipeline } from '../../services/ask-pipeline.js';

const askBodySchema = z.object({
  text: z.string().min(1, 'text is required'),
});

export async function askRoutes(app: FastifyInstance, opts: { askPipeline: AskPipeline }) {
  const { askPipeline } = opts;

  app.post('/ask', async (request, reply) => {
    const parsed = askBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    try {
      const result = await askPipeline.ask(parsed.data.text);
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
