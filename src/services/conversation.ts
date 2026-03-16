import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Conversation {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationWithPreview extends Conversation {
  messageCount: number;
  lastMessagePreview: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

interface DbConversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface DbMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface DbConversationWithPreview {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview: string | null;
}

export class ConversationService {
  private client: SupabaseClient;

  constructor(url: string, key: string) {
    this.client = createClient(url, key);
  }

  async createConversation(title?: string): Promise<Conversation> {
    const { data, error } = await this.client
      .from('conversations')
      .insert({ title: title ?? null })
      .select()
      .single();
    if (error) throw new Error(`Failed to create conversation: ${error.message}`);
    return this.toConversation(data);
  }

  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<Message> {
    const { data, error } = await this.client
      .from('messages')
      .insert({ conversation_id: conversationId, role, content, metadata: metadata ?? {} })
      .select()
      .single();
    if (error) throw new Error(`Failed to add message: ${error.message}`);

    // Update conversation timestamp
    const { error: updateError } = await this.client
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);
    if (updateError) {
      console.error(`Failed to update conversation timestamp: ${updateError.message}`);
    }

    return this.toMessage(data);
  }

  async getMessages(conversationId: string, limit?: number): Promise<Message[]> {
    let query = this.client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to get messages: ${error.message}`);
    return (data ?? []).map((row: DbMessage) => this.toMessage(row));
  }

  async getRecentMessages(conversationId: string, limit: number = 20): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to get recent messages: ${error.message}`);
    return (data ?? []).map((row: DbMessage) => this.toMessage(row)).reverse();
  }

  async listConversations(limit: number = 50): Promise<Conversation[]> {
    const { data, error } = await this.client
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to list conversations: ${error.message}`);
    return (data ?? []).map((row: DbConversation) => this.toConversation(row));
  }

  async listConversationsWithPreview(limit: number = 50): Promise<ConversationWithPreview[]> {
    const { data, error } = await this.client
      .rpc('conversations_with_preview', { row_limit: limit });

    if (error) throw new Error(`Failed to list conversations: ${error.message}`);

    return (data ?? []).map((row: DbConversationWithPreview) => ({
      id: row.id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messageCount: row.message_count ?? 0,
      lastMessagePreview: row.last_message_preview ?? null,
    }));
  }

  async deleteConversation(id: string): Promise<void> {
    const { error } = await this.client
      .from('conversations')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Failed to delete conversation: ${error.message}`);
  }

  async deleteConversations(ids: string[]): Promise<{ deleted: number; errors: string[] }> {
    const errors: string[] = [];
    let deleted = 0;
    for (const id of ids) {
      const { error } = await this.client
        .from('conversations')
        .delete()
        .eq('id', id);
      if (error) {
        errors.push(`${id}: ${error.message}`);
      } else {
        deleted++;
      }
    }
    return { deleted, errors };
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const { data, error } = await this.client
      .from('conversations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Failed to get conversation: ${error.message}`);
    return data ? this.toConversation(data) : null;
  }

  private toConversation(row: DbConversation): Conversation {
    return {
      id: row.id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private toMessage(row: DbMessage): Message {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      metadata: row.metadata ?? {},
      createdAt: new Date(row.created_at),
    };
  }
}
