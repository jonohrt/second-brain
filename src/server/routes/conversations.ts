import type { FastifyInstance } from 'fastify';
import type { ConversationService } from '../../services/conversation.js';

export async function conversationRoutes(
  app: FastifyInstance,
  opts: { conversations: ConversationService },
) {
  const { conversations } = opts;

  app.get('/conversations', async (_request, reply) => {
    const list = await conversations.listConversations();
    return reply.send({ conversations: list });
  });

  app.get<{ Params: { id: string } }>('/conversations/:id/messages', async (request, reply) => {
    const { id } = request.params;
    const messages = await conversations.getMessages(id);
    return reply.send({ messages });
  });

  app.delete<{ Params: { id: string } }>('/conversations/:id', async (request, reply) => {
    const { id } = request.params;
    await conversations.deleteConversation(id);
    return reply.send({ success: true });
  });
}
