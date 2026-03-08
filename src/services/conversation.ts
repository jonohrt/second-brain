import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface Conversation {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
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
    await this.client
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

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
    return (data ?? []).map(this.toMessage);
  }

  async getRecentMessages(conversationId: string, limit: number = 20): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to get recent messages: ${error.message}`);
    return (data ?? []).map(this.toMessage).reverse();
  }

  async listConversations(limit: number = 50): Promise<Conversation[]> {
    const { data, error } = await this.client
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to list conversations: ${error.message}`);
    return (data ?? []).map(this.toConversation);
  }

  async deleteConversation(id: string): Promise<void> {
    const { error } = await this.client
      .from('conversations')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Failed to delete conversation: ${error.message}`);
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
