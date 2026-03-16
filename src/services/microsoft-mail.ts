import type { EmailAccountConfig } from '../types.js';
import type { Email, EmailProvider } from './email.js';

interface GraphMessage {
  id: string;
  conversationId?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  categories?: string[];
}

export class MicrosoftMailProvider implements EmailProvider {
  label: string;
  private clientId: string;
  private clientSecret: string;
  private tenantId: string;
  private refreshToken: string;
  private redirectUri: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: EmailAccountConfig) {
    this.label = config.label;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.tenantId = config.tenantId ?? 'common';
    this.refreshToken = config.refreshToken;
    this.redirectUri = config.redirectUri;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
      redirect_uri: this.redirectUri,
      scope: 'https://graph.microsoft.com/Mail.ReadWrite offline_access',
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft token refresh failed (${res.status}): ${text}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  private async graphRequest<T>(path: string, method: string = 'GET', body?: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft Graph API error (${res.status}): ${text}`);
    }

    return await res.json() as T;
  }

  async fetchUnread(limit: number = 25): Promise<Email[]> {
    const data = await this.graphRequest<{ value: GraphMessage[] }>(
      `/me/messages?$filter=isRead eq false&$top=${limit}&$orderby=receivedDateTime desc&$select=id,conversationId,from,toRecipients,subject,bodyPreview,receivedDateTime,isRead,hasAttachments,categories`
    );

    return (data.value ?? []).map((msg): Email => {
      const fromAddr = msg.from?.emailAddress;
      const fromStr = fromAddr?.name
        ? `${fromAddr.name} <${fromAddr.address}>`
        : fromAddr?.address ?? 'unknown';

      return {
        id: msg.id,
        threadId: msg.conversationId,
        from: fromStr,
        to: (msg.toRecipients ?? []).map((r) => r.emailAddress?.address ?? ''),
        subject: msg.subject ?? '(no subject)',
        snippet: msg.bodyPreview ?? '',
        date: new Date(msg.receivedDateTime ?? 0),
        isUnread: !msg.isRead,
        labels: msg.categories,
        hasAttachments: msg.hasAttachments ?? false,
      };
    });
  }

  async markAsRead(emailIds: string[]): Promise<void> {
    await Promise.all(
      emailIds.map((id) =>
        this.graphRequest(`/me/messages/${id}`, 'PATCH', { isRead: true })
      )
    );
  }
}
