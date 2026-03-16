import type { FastifyInstance } from 'fastify';
import type { EmailService } from '../../services/email.js';

export async function emailRoutes(
  app: FastifyInstance,
  opts: { emailService: EmailService }
) {
  const { emailService } = opts;

  app.get('/emails/unread', async (req, reply) => {
    const { account, limit } = req.query as { account?: string; limit?: string };
    const results = await emailService.fetchUnread(account, limit ? parseInt(limit, 10) : 25);
    return results;
  });

  app.post('/emails/mark-read', async (req, reply) => {
    const { account, email_ids } = req.body as { account: string; email_ids: string[] };
    if (!account || !email_ids?.length) {
      return reply.status(400).send({ error: 'account and email_ids are required' });
    }
    await emailService.markAsRead(account, email_ids);
    return { marked: email_ids.length };
  });
}
