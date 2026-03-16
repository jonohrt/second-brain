import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SearxngService } from '../../services/searxng.js';

export function registerWebSearchTools(server: McpServer, searxng: SearxngService): void {
  server.registerTool(
    'web_search',
    {
      description:
        'Search the web using SearXNG. Use this to find current information, documentation, news, or anything not in the user\'s personal notes.',
      inputSchema: {
        query: z.string().describe('The search query'),
        categories: z
          .enum(['general', 'news', 'science', 'it', 'images', 'videos', 'music', 'files'])
          .optional()
          .describe('Search category (default: general)'),
        limit: z.number().optional().describe('Maximum number of results (default: 5)'),
      },
    },
    async ({ query, categories, limit }) => {
      try {
        const results = await searxng.search(query, {
          categories: categories ?? 'general',
          limit: limit ?? 5,
        });

        if (results.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No web search results found.' }] };
        }

        const formatted = results
          .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.content}`)
          .join('\n\n');

        return {
          content: [{ type: 'text' as const, text: `Found ${results.length} result(s):\n\n${formatted}` }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Web search error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
