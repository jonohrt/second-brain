import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Services } from '../server.js';

export function registerTaskTools(server: McpServer, services: Services): void {
  server.registerTool(
    'list_tasks',
    {
      description:
        'List tasks. Defaults to open tasks. Call with zero parameters to see all open tasks, or filter by project/status.',
      inputSchema: {
        project: z.string().optional().describe('Filter by project name'),
        status: z.enum(['open', 'done']).optional().describe('Filter by status (default: open)'),
        limit: z.number().optional().describe('Max results (default: 20)'),
      },
    },
    async ({ project, status, limit }) => {
      const tasks = await services.supabase.getTasksByStatus(
        status ?? 'open',
        { project: project ?? undefined, limit: limit ?? 20 }
      );

      if (tasks.length === 0) {
        const scope = project ? ` for ${project}` : '';
        return { content: [{ type: 'text' as const, text: `No ${status ?? 'open'} tasks${scope}.` }] };
      }

      const lines = tasks.map((t, i) => {
        const proj = t.project ? ` [${t.project}]` : '';
        const done = (t.metadata as Record<string, unknown>).status === 'done' ? ' (done)' : '';
        return `${i + 1}. ${t.title}${proj}${done}`;
      });

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.registerTool(
    'complete_task',
    {
      description:
        'Mark a task as done. Provide the task title or a substring — it will fuzzy match against open tasks.',
      inputSchema: {
        title: z.string().describe('Task title or substring to match'),
      },
    },
    async ({ title }) => {
      const matches = await services.supabase.findTaskByTitle(title);

      if (matches.length === 0) {
        return { content: [{ type: 'text' as const, text: `No open task matching "${title}".` }] };
      }

      if (matches.length > 1) {
        const list = matches.map((t) => `- ${t.title}`).join('\n');
        return {
          content: [{
            type: 'text' as const,
            text: `Multiple tasks match "${title}". Be more specific:\n${list}`,
          }],
        };
      }

      const task = matches[0];
      const now = new Date();
      task.metadata = { ...task.metadata, status: 'done', completedAt: now.toISOString() };
      task.updatedAt = now;

      // Re-write vault file
      const vaultPath = services.vault.writeEntry(task);
      task.vaultPath = vaultPath;

      // Re-embed and sync
      try {
        const available = await services.embeddings.isAvailable();
        if (available) {
          const embedding = await services.embeddings.embed(task.content);
          await services.supabase.upsertEntry(task, embedding);
        } else {
          await services.supabase.upsertEntry(task);
        }
      } catch {
        return {
          content: [{
            type: 'text' as const,
            text: `Completed "${task.title}" in vault. Warning: Supabase sync failed.`,
          }],
        };
      }

      return { content: [{ type: 'text' as const, text: `Completed: "${task.title}"` }] };
    }
  );
}
