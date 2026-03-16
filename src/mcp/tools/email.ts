import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EmailService } from '../../services/email.js';

export function registerEmailTools(server: McpServer, emailService: EmailService): void {
  const accountLabels = emailService.getProviders().map((p) => p.label);

  server.registerTool(
    'list_emails',
    {
      description:
        'Fetch unread emails. Returns sender, subject, snippet, date, and attachment info. Use this when the user asks about their emails, inbox, or unread messages. You can filter by account (e.g. "work" or "personal") or get all accounts at once. Results include email IDs you can use with mark_emails_read.',
      inputSchema: {
        account: z.string().optional().describe(
          `Filter by email account label. Available accounts: ${accountLabels.join(', ')}. Omit to fetch from all accounts.`
        ),
        limit: z.number().optional().describe('Max emails per account (default: 25)'),
      },
    },
    async ({ account, limit }) => {
      try {
        const results = await emailService.fetchUnread(account, limit ?? 25);

        if (results.every((r) => r.emails.length === 0)) {
          const scope = account ? ` in ${account}` : '';
          return { content: [{ type: 'text' as const, text: `No unread emails${scope}.` }] };
        }

        const sections = results.map((r) => {
          if (r.emails.length === 0) return `## ${r.account}\nNo unread emails.`;

          const lines = r.emails.map((e, i) => {
            const parts: string[] = [];
            parts.push(`${i + 1}. **${e.subject}**`);
            parts.push(`   From: ${e.from}`);
            parts.push(`   Date: ${e.date.toISOString().slice(0, 16).replace('T', ' ')}`);
            if (e.snippet) parts.push(`   Preview: ${e.snippet.slice(0, 150)}`);
            if (e.hasAttachments) parts.push(`   📎 Has attachments`);
            parts.push(`   ID: ${e.id}`);
            return parts.join('\n');
          });

          return `## ${r.account} (${r.emails.length} unread)\n\n${lines.join('\n\n')}`;
        });

        return { content: [{ type: 'text' as const, text: sections.join('\n\n---\n\n') }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error fetching emails: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'summarize_inbox',
    {
      description:
        'Fetch unread emails and return them in a structured format for you to summarize by importance. The AI should analyze the results and present a prioritized summary to the user. Use this when the user asks for an email summary or wants to know what\'s important.',
      inputSchema: {
        account: z.string().optional().describe(
          `Filter by email account label. Available accounts: ${accountLabels.join(', ')}. Omit for all accounts.`
        ),
        limit: z.number().optional().describe('Max emails per account (default: 50)'),
      },
    },
    async ({ account, limit }) => {
      try {
        const results = await emailService.fetchUnread(account, limit ?? 50);

        if (results.every((r) => r.emails.length === 0)) {
          return { content: [{ type: 'text' as const, text: 'Inbox zero — no unread emails.' }] };
        }

        const allEmails = results.flatMap((r) =>
          r.emails.map((e) => ({
            account: r.account,
            id: e.id,
            from: e.from,
            subject: e.subject,
            snippet: e.snippet,
            date: e.date.toISOString(),
            hasAttachments: e.hasAttachments,
          }))
        );

        const prompt = [
          `You have ${allEmails.length} unread email(s) across ${results.length} account(s).`,
          '',
          'Analyze these emails and present a prioritized summary to the user. Group by importance:',
          '1. **Urgent/Action Required** — direct requests, time-sensitive items, calendar invites',
          '2. **Important** — messages from people (not automated), project updates, discussions',
          '3. **FYI/Low Priority** — newsletters, notifications, automated alerts, marketing',
          '',
          'For each email, include: sender, subject, and a one-line summary of what it\'s about.',
          'Include the email IDs so the user can ask you to mark specific ones as read.',
          '',
          'Emails:',
          JSON.stringify(allEmails, null, 2),
        ].join('\n');

        return { content: [{ type: 'text' as const, text: prompt }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error fetching emails: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'mark_emails_read',
    {
      description:
        'Mark specific emails as read. Only use this when the user explicitly asks you to mark emails as read. Requires the account label and email IDs (from list_emails or summarize_inbox results).',
      inputSchema: {
        account: z.string().describe(
          `Email account label. Available accounts: ${accountLabels.join(', ')}`
        ),
        email_ids: z.array(z.string()).describe('Array of email IDs to mark as read'),
      },
    },
    async ({ account, email_ids }) => {
      try {
        await emailService.markAsRead(account, email_ids);
        return {
          content: [{
            type: 'text' as const,
            text: `Marked ${email_ids.length} email(s) as read in ${account}.`,
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error marking emails as read: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
