import { google } from 'googleapis';
import type { EmailAccountConfig } from '../types.js';
import type { Email, EmailProvider } from './email.js';

export class GmailProvider implements EmailProvider {
  label: string;
  private oauth2;
  private gmail;

  constructor(private config: EmailAccountConfig) {
    this.label = config.label;
    this.oauth2 = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri,
    );
    this.oauth2.setCredentials({ refresh_token: config.refreshToken });
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2 });
  }

  async fetchUnread(limit: number = 25): Promise<Email[]> {
    const res = await this.gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults: limit,
    });

    const messageIds = res.data.messages ?? [];
    if (messageIds.length === 0) return [];

    const emails = await Promise.all(
      messageIds.map((m) => this.getMessage(m.id!))
    );

    return emails.filter((e): e is Email => e !== null);
  }

  private async getMessage(id: string): Promise<Email | null> {
    try {
      const res = await this.gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });

      const headers = res.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

      const labelIds = res.data.labelIds ?? [];

      return {
        id: res.data.id!,
        threadId: res.data.threadId ?? undefined,
        from: getHeader('From'),
        to: getHeader('To').split(',').map((s) => s.trim()),
        subject: getHeader('Subject'),
        snippet: res.data.snippet ?? '',
        date: new Date(parseInt(res.data.internalDate ?? '0', 10)),
        isUnread: labelIds.includes('UNREAD'),
        labels: labelIds,
        hasAttachments: this.checkAttachments(res.data.payload),
      };
    } catch {
      return null;
    }
  }

  private checkAttachments(payload: unknown): boolean {
    const p = payload as { parts?: Array<{ filename?: string }> } | undefined;
    return p?.parts?.some((part) => !!part.filename) ?? false;
  }

  async markAsRead(emailIds: string[]): Promise<void> {
    await Promise.all(
      emailIds.map((id) =>
        this.gmail.users.messages.modify({
          userId: 'me',
          id,
          requestBody: { removeLabelIds: ['UNREAD'] },
        })
      )
    );
  }
}
