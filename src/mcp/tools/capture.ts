import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Services } from '../server.js';
import type { ContextEntry } from '../../types.js';
import { createAppleReminder } from '../../services/reminders.js';

async function captureEntry(entry: ContextEntry, services: Services): Promise<string> {
  const vaultPath = services.vault.writeEntry(entry);
  entry.vaultPath = vaultPath;

  try {
    const available = await services.embeddings.isAvailable();
    if (available) {
      const embedding = await services.embeddings.embed(entry.content);
      await services.supabase.upsertEntry(entry, embedding);
    } else {
      await services.supabase.upsertEntry(entry);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Captured "${entry.title}" to vault (${vaultPath}). Warning: sync failed — ${message}`;
  }

  return `Captured "${entry.title}" to vault (${vaultPath}) and synced to Supabase.`;
}

export function registerCaptureTools(server: McpServer, services: Services): void {
  server.registerTool(
    'capture_decision',
    {
      description:
        'Capture an architecture or design decision. Writes to the Obsidian vault and syncs to Supabase for semantic search.',
      inputSchema: {
        title: z.string().describe('Title of the decision'),
        content: z.string().describe('Full description of the decision, rationale, and alternatives considered'),
        project: z.string().optional().describe('Project name'),
        repo: z.string().optional().describe('Repository name'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
      },
    },
    async ({ title, content, project, repo, tags }) => {
      const now = new Date();
      const entry: ContextEntry = {
        type: 'decision',
        title,
        content,
        project,
        repo,
        metadata: { tags: tags ?? [] },
        createdAt: now,
        updatedAt: now,
      };

      const result = await captureEntry(entry, services);
      return { content: [{ type: 'text' as const, text: result }] };
    }
  );

  server.registerTool(
    'capture_learned',
    {
      description:
        'Capture something learned — a technique, gotcha, pattern, or insight worth remembering.',
      inputSchema: {
        title: z.string().describe('Title of what was learned'),
        content: z.string().describe('What was learned, including context and examples'),
        project: z.string().optional().describe('Project name'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
      },
    },
    async ({ title, content, project, tags }) => {
      const now = new Date();
      const entry: ContextEntry = {
        type: 'learned',
        title,
        content,
        project,
        metadata: { tags: tags ?? [] },
        createdAt: now,
        updatedAt: now,
      };

      const result = await captureEntry(entry, services);
      return { content: [{ type: 'text' as const, text: result }] };
    }
  );

  server.registerTool(
    'capture_status',
    {
      description:
        'Capture a current work status snapshot — what you are working on, next steps, and blockers.',
      inputSchema: {
        status: z.string().describe('Current work status'),
        next_steps: z.string().optional().describe('Planned next steps'),
        blockers: z.string().optional().describe('Current blockers or open questions'),
        branch: z.string().optional().describe('Git branch name'),
        repo: z.string().optional().describe('Repository name'),
        project: z.string().optional().describe('Project name'),
      },
    },
    async ({ status, next_steps, blockers, branch, repo, project }) => {
      const sections: string[] = [];
      sections.push(`## Status\n\n${status}`);
      if (next_steps) sections.push(`## Next Steps\n\n${next_steps}`);
      if (blockers) sections.push(`## Blockers\n\n${blockers}`);

      const content = sections.join('\n\n');
      const title = branch ? `Status: ${branch}` : 'Work Status';
      const now = new Date();

      const entry: ContextEntry = {
        type: 'branch_context',
        title,
        content,
        project,
        repo,
        branch,
        metadata: { tags: [] },
        createdAt: now,
        updatedAt: now,
      };

      const result = await captureEntry(entry, services);
      return { content: [{ type: 'text' as const, text: result }] };
    }
  );

  server.registerTool(
    'capture_session_summary',
    {
      description:
        'Capture a session summary — what was accomplished, decisions made, and next steps.',
      inputSchema: {
        summary: z.string().describe('Summary of the session'),
        decisions: z.string().optional().describe('Key decisions made during the session'),
        next_steps: z.string().optional().describe('Next steps after this session'),
        branch: z.string().optional().describe('Git branch name'),
        repo: z.string().optional().describe('Repository name'),
        project: z.string().optional().describe('Project name'),
      },
    },
    async ({ summary, decisions, next_steps, branch, repo, project }) => {
      const sections: string[] = [];
      sections.push(`## Summary\n\n${summary}`);
      if (decisions) sections.push(`## Decisions\n\n${decisions}`);
      if (next_steps) sections.push(`## Next Steps\n\n${next_steps}`);

      const content = sections.join('\n\n');
      const title = branch ? `Session: ${branch}` : 'Session Summary';
      const now = new Date();

      const entry: ContextEntry = {
        type: 'session',
        title,
        content,
        project,
        repo,
        branch,
        metadata: { tags: [] },
        createdAt: now,
        updatedAt: now,
      };

      const result = await captureEntry(entry, services);
      return { content: [{ type: 'text' as const, text: result }] };
    }
  );

  server.registerTool(
    'capture_task',
    {
      description:
        'Capture a task or TODO. Only title is required — project, repo, and branch are auto-detected from the working directory.',
      inputSchema: {
        title: z.string().describe('Short description of the task'),
        content: z.string().optional().describe('Additional details or context'),
        remind_at: z.string().optional().describe('ISO 8601 datetime for an Apple Reminder (e.g. "2026-03-05T07:00:00")'),
        project: z.string().optional().describe('Project name (auto-detected if omitted)'),
        repo: z.string().optional().describe('Repository name (auto-detected if omitted)'),
        branch: z.string().optional().describe('Git branch name (auto-detected if omitted)'),
        tags: z.array(z.string()).optional().describe('Tags for categorization'),
      },
    },
    async ({ title, content, remind_at, project, repo, branch, tags }) => {
      const now = new Date();
      const entry: ContextEntry = {
        type: 'task',
        title,
        content: content ?? title,
        project,
        repo,
        branch,
        metadata: { status: 'open', tags: tags ?? [], ...(remind_at ? { remind_at } : {}) },
        createdAt: now,
        updatedAt: now,
      };

      const result = await captureEntry(entry, services);

      let reminderNote = '';
      if (remind_at) {
        const remindDate = new Date(remind_at);
        const warning = await createAppleReminder(title, remindDate);
        if (warning) {
          reminderNote = ` ${warning}`;
        } else {
          reminderNote = ` Reminder set for ${remindDate.toLocaleString()}.`;
        }
      }

      return { content: [{ type: 'text' as const, text: result + reminderNote }] };
    }
  );
}
