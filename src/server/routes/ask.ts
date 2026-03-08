import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AskPipeline } from '../../services/ask-pipeline.js';
import type { Services } from '../../mcp/server.js';
import type { IntentRouter } from '../../services/intent-router.js';
import type { ConversationService } from '../../services/conversation.js';
import type { ContextEntry } from '../../types.js';
import { captureEntry } from '../../services/capture.js';
import { createAppleReminder, updateAppleReminder } from '../../services/reminders.js';

const askBodySchema = z.object({
  text: z.string().min(1, 'text is required'),
  conversation_id: z.string().uuid().optional(),
});

export interface AskRouteDeps {
  askPipeline: AskPipeline;
  services: Services;
  intentRouter: IntentRouter;
  conversations: ConversationService;
}

export async function askRoutes(
  app: FastifyInstance,
  opts: AskRouteDeps,
) {
  const { askPipeline, services, intentRouter, conversations } = opts;

  app.post('/ask', async (request, reply) => {
    const parsed = askBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    const { text, conversation_id } = parsed.data;

    // Get or create conversation
    let conversationId: string;
    if (conversation_id) {
      const existing = await conversations.getConversation(conversation_id);
      conversationId = existing ? existing.id : (await conversations.createConversation(text.slice(0, 60))).id;
    } else {
      conversationId = (await conversations.createConversation(text.slice(0, 60))).id;
    }

    // Store user message
    await conversations.addMessage(conversationId, 'user', text);

    // Get recent messages for context
    const recentMessages = await conversations.getRecentMessages(conversationId);
    const history = recentMessages
      .slice(0, -1) // exclude the message we just added
      .map((m) => ({ role: m.role, content: m.content }));

    // Classify intent
    const intent = await intentRouter.classify(text, history);

    let answer: string;
    let sources: unknown[] = [];
    let route: string = intent.intent;
    let model: string = 'none';

    try {
      switch (intent.intent) {
        case 'ask': {
          const result = await askPipeline.ask(text, history);
          answer = result.answer;
          sources = result.sources;
          route = result.route;
          model = result.model;
          break;
        }

        case 'reminder': {
          const reminderDate = intent.reminder_time ? new Date(intent.reminder_time) : new Date();
          const warning = await createAppleReminder(intent.title ?? text, reminderDate);
          const timeStr = reminderDate.toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit',
          });
          answer = warning
            ? `⚠️ ${warning}`
            : `Reminder set: "${intent.title ?? text}" — ${timeStr}`;
          route = 'reminder';
          break;
        }

        case 'capture_task': {
          const now = new Date();
          const entry: ContextEntry = {
            type: 'task',
            title: intent.title ?? text.slice(0, 60),
            content: intent.content ?? text,
            project: intent.project,
            metadata: { tags: intent.tags ?? [], status: 'open' },
            createdAt: now,
            updatedAt: now,
          };
          await captureEntry(entry, services);
          answer = `Task captured: "${entry.title}"`;
          route = 'capture';
          break;
        }

        case 'capture_note': {
          const now = new Date();
          const entry: ContextEntry = {
            type: 'learned',
            title: intent.title ?? text.slice(0, 60),
            content: intent.content ?? text,
            project: intent.project,
            metadata: { tags: intent.tags ?? [] },
            createdAt: now,
            updatedAt: now,
          };
          await captureEntry(entry, services);
          answer = `Saved to your second brain: "${entry.title}"`;
          route = 'capture';
          break;
        }

        case 'update_task': {
          if (!intent.update_query) {
            answer = 'Could not determine which task to update.';
            break;
          }
          const matches = await services.supabase.findTaskByTitle(intent.update_query);
          if (matches.length === 0) {
            answer = `No task found matching "${intent.update_query}".`;
            break;
          }
          const task = matches[0];
          if (intent.new_title) task.title = intent.new_title;
          if (intent.new_description) task.content = intent.new_description;
          task.updatedAt = new Date();

          const available = await services.embeddings.isAvailable();
          if (available) {
            const embedding = await services.embeddings.embed(task.content);
            await services.supabase.upsertEntry(task, embedding);
          } else {
            await services.supabase.upsertEntry(task);
          }
          answer = `Updated task: "${task.title}"`;
          route = 'update';
          break;
        }

        case 'update_reminder': {
          if (!intent.update_query) {
            answer = 'Could not determine which reminder to update.';
            break;
          }
          const updates: { newTitle?: string; newDate?: Date } = {};
          if (intent.new_title) updates.newTitle = intent.new_title;
          if (intent.reminder_time) updates.newDate = new Date(intent.reminder_time);
          const result = await updateAppleReminder(intent.update_query, updates);
          answer = result
            ? `⚠️ ${result}`
            : `Updated reminder: "${intent.update_query}"`;
          route = 'update';
          break;
        }

        default:
          answer = 'Unrecognized intent.';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ error: 'Ask failed', message });
    }

    // Store assistant response
    await conversations.addMessage(conversationId, 'assistant', answer);

    return reply.send({
      answer,
      sources,
      route,
      model,
      conversation_id: conversationId,
    });
  });
}
