import type { FastifyInstance } from 'fastify';
import type { ConversationService } from '../../services/conversation.js';

export async function conversationRoutes(
  app: FastifyInstance,
  opts: { conversations: ConversationService },
) {
  const { conversations } = opts;

  app.get('/conversations', async (_request, reply) => {
    const list = await conversations.listConversationsWithPreview();
    return reply.send({ conversations: list });
  });

  app.get<{ Params: { id: string } }>('/conversations/:id/messages', async (request, reply) => {
    const { id } = request.params;
    const convo = await conversations.getConversation(id);
    if (!convo) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }
    const messages = await conversations.getMessages(id);
    return reply.send({ messages });
  });

  app.delete<{ Params: { id: string } }>('/conversations/:id', async (request, reply) => {
    const { id } = request.params;
    const convo = await conversations.getConversation(id);
    if (!convo) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }
    await conversations.deleteConversation(id);
    return reply.send({ success: true });
  });

  // Bulk delete conversations
  app.delete<{ Body: { ids: string[] } }>('/conversations', async (request, reply) => {
    const body = request.body as { ids?: unknown };
    if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return reply.status(400).send({ error: 'Request body must include a non-empty "ids" array.' });
    }

    // Validate all entries are strings
    const ids: string[] = body.ids;
    for (const id of ids) {
      if (typeof id !== 'string') {
        return reply.status(400).send({ error: 'All entries in "ids" must be strings.' });
      }
    }

    const result = await conversations.deleteConversations(ids);
    return reply.send(result);
  });
}
