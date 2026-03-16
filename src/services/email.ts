import type { EmailAccountConfig } from '../types.js';
import { GmailProvider } from './gmail.js';
import { MicrosoftMailProvider } from './microsoft-mail.js';

export interface Email {
  id: string;
  threadId?: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  body?: string;
  date: Date;
  isUnread: boolean;
  labels?: string[];
  hasAttachments: boolean;
}

export interface EmailProvider {
  label: string;
  fetchUnread(limit?: number): Promise<Email[]>;
  markAsRead(emailIds: string[]): Promise<void>;
}

export class EmailService {
  private providers: EmailProvider[] = [];

  constructor(accounts: EmailAccountConfig[]) {
    for (const account of accounts) {
      if (account.provider === 'gmail') {
        this.providers.push(new GmailProvider(account));
      } else if (account.provider === 'microsoft') {
        this.providers.push(new MicrosoftMailProvider(account));
      }
    }
  }

  getProviders(): EmailProvider[] {
    return this.providers;
  }

  getProvider(label: string): EmailProvider | undefined {
    return this.providers.find((p) => p.label.toLowerCase() === label.toLowerCase());
  }

  async fetchUnread(account?: string, limit?: number): Promise<{ account: string; emails: Email[] }[]> {
    const targets = account
      ? this.providers.filter((p) => p.label.toLowerCase() === account.toLowerCase())
      : this.providers;

    const results = await Promise.all(
      targets.map(async (provider) => ({
        account: provider.label,
        emails: await provider.fetchUnread(limit),
      }))
    );

    return results;
  }

  async markAsRead(account: string, emailIds: string[]): Promise<void> {
    const provider = this.getProvider(account);
    if (!provider) throw new Error(`No email account found with label "${account}"`);
    await provider.markAsRead(emailIds);
  }
}
