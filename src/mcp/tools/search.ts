import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Services } from '../server.js';
import type { ContextEntry } from '../../types.js';

function formatEntryDetailed(entry: ContextEntry): string {
  const parts: string[] = [];
  parts.push(`## ${entry.title}`);
  parts.push('');
  const meta: string[] = [];
  if (entry.type) meta.push(`**Type:** ${entry.type}`);
  if (entry.project) meta.push(`**Project:** ${entry.project}`);
  if (entry.repo) meta.push(`**Repo:** ${entry.repo}`);
  if (entry.branch) meta.push(`**Branch:** ${entry.branch}`);
  if (entry.prNumber) meta.push(`**PR:** #${entry.prNumber}`);
  meta.push(`**Updated:** ${entry.updatedAt.toISOString().slice(0, 10)}`);
  parts.push(meta.join(' | '));
  parts.push('');
  parts.push(entry.content);
  return parts.join('\n');
}

function formatEntryCompact(entry: ContextEntry): string {
  const meta: string[] = [];
  if (entry.project) meta.push(entry.project);
  if (entry.repo) meta.push(entry.repo);
  meta.push(entry.type);
  return `- **${entry.title}** (${meta.join('/')}) — ${entry.updatedAt.toISOString().slice(0, 10)}`;
}

export function registerSearchTools(server: McpServer, services: Services): void {
  server.registerTool(
    'search_context',
    {
      description:
        'Semantic search across all stored context entries (branch notes, PR summaries, decisions, learnings, sessions). Returns the most relevant entries for a given query.',
      inputSchema: {
        query: z.string().describe('The search query to find relevant context'),
        project: z.string().optional().describe('Filter by project name'),
        repo: z.string().optional().describe('Filter by repository name'),
        type: z
          .enum(['branch_context', 'pr_context', 'decision', 'learned', 'session'])
          .optional()
          .describe('Filter by entry type'),
        limit: z.number().optional().describe('Maximum number of results (default 10)'),
      },
    },
    async ({ query, project, repo, type, limit }) => {
      try {
        const embedding = await services.embeddings.embed(query);
        const results = await services.supabase.searchByEmbedding(embedding, {
          project,
          repo,
          type,
          limit: limit ?? 10,
        });

        if (results.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No matching context entries found.' }] };
        }

        const formatted = results.map(formatEntryDetailed).join('\n\n---\n\n');
        const header = `Found ${results.length} result(s):\n\n`;
        return { content: [{ type: 'text' as const, text: header + formatted }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error searching context: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'get_related',
    {
      description:
        'Find context entries related to a given topic. Returns a compact list of matching entries, useful for discovering connections between branches, PRs, and decisions.',
      inputSchema: {
        query: z.string().describe('The topic or question to find related context for'),
        limit: z.number().optional().describe('Maximum number of results (default 10)'),
      },
    },
    async ({ query, limit }) => {
      try {
        const embedding = await services.embeddings.embed(query);
        const results = await services.supabase.searchByEmbedding(embedding, {
          limit: limit ?? 10,
        });

        if (results.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No related context entries found.' }] };
        }

        const formatted = results.map(formatEntryCompact).join('\n');
        const header = `Found ${results.length} related entry(ies):\n\n`;
        return { content: [{ type: 'text' as const, text: header + formatted }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error finding related context: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
