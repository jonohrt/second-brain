import { describe, it, expect, vi, beforeEach } from 'vitest';

// Build chainable query mock (same pattern as supabase.test.ts)
function createQueryMock(resolvedValue: { data: unknown; error: unknown }) {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolvedValue);
          }
          if (!mock[prop]) {
            mock[prop] = vi.fn().mockReturnValue(chain());
          }
          return mock[prop];
        },
      },
    );
  return { chain: chain(), mocks: mock };
}

// Mock @supabase/supabase-js
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

// Import after mock setup
import { ConversationService } from '../../src/services/conversation.js';
import { createClient } from '@supabase/supabase-js';

describe('ConversationService', () => {
  let service: ConversationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ConversationService('https://example.supabase.co', 'test-key');
  });

  it('constructs without error', () => {
    expect(service).toBeInstanceOf(ConversationService);
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'test-key');
  });

  describe('createConversation', () => {
    it('inserts a conversation with title and returns mapped object', async () => {
      const query = createQueryMock({
        data: {
          id: 'conv-1',
          title: 'My Chat',
          created_at: '2026-03-07T00:00:00.000Z',
          updated_at: '2026-03-07T00:00:00.000Z',
        },
        error: null,
      });
      mockFrom.mockReturnValue(query.chain);

      const result = await service.createConversation('My Chat');

      expect(mockFrom).toHaveBeenCalledWith('conversations');
      expect(query.mocks['insert']).toHaveBeenCalledWith({ title: 'My Chat' });
      expect(query.mocks['select']).toHaveBeenCalled();
      expect(query.mocks['single']).toHaveBeenCalled();
      expect(result).toEqual({
        id: 'conv-1',
        title: 'My Chat',
        createdAt: new Date('2026-03-07T00:00:00.000Z'),
        updatedAt: new Date('2026-03-07T00:00:00.000Z'),
      });
    });

    it('inserts with null title when no title provided', async () => {
      const query = createQueryMock({
        data: {
          id: 'conv-2',
          title: null,
          created_at: '2026-03-07T00:00:00.000Z',
          updated_at: '2026-03-07T00:00:00.000Z',
        },
        error: null,
      });
      mockFrom.mockReturnValue(query.chain);

      const result = await service.createConversation();

      expect(query.mocks['insert']).toHaveBeenCalledWith({ title: null });
      expect(result.title).toBeNull();
    });

    it('throws on insert error', async () => {
      const query = createQueryMock({
        data: null,
        error: { message: 'insert failed' },
      });
      mockFrom.mockReturnValue(query.chain);

      await expect(service.createConversation()).rejects.toThrow(
        'Failed to create conversation: insert failed',
      );
    });
  });

  describe('addMessage', () => {
    it('inserts a message and updates conversation timestamp', async () => {
      // First call: insert message
      const insertQuery = createQueryMock({
        data: {
          id: 'msg-1',
          conversation_id: 'conv-1',
          role: 'user',
          content: 'Hello',
          metadata: {},
          created_at: '2026-03-07T01:00:00.000Z',
        },
        error: null,
      });
      // Second call: update conversation timestamp
      const updateQuery = createQueryMock({ data: null, error: null });

      mockFrom
        .mockReturnValueOnce(insertQuery.chain)
        .mockReturnValueOnce(updateQuery.chain);

      const result = await service.addMessage('conv-1', 'user', 'Hello');

      expect(mockFrom).toHaveBeenCalledWith('messages');
      expect(insertQuery.mocks['insert']).toHaveBeenCalledWith({
        conversation_id: 'conv-1',
        role: 'user',
        content: 'Hello',
        metadata: {},
      });
      expect(result).toEqual({
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        metadata: {},
        createdAt: new Date('2026-03-07T01:00:00.000Z'),
      });

      // Verify conversation timestamp was updated
      expect(mockFrom).toHaveBeenCalledWith('conversations');
    });

    it('passes metadata when provided', async () => {
      const insertQuery = createQueryMock({
        data: {
          id: 'msg-2',
          conversation_id: 'conv-1',
          role: 'assistant',
          content: 'Hi there',
          metadata: { model: 'gpt-4' },
          created_at: '2026-03-07T01:00:00.000Z',
        },
        error: null,
      });
      const updateQuery = createQueryMock({ data: null, error: null });
      mockFrom
        .mockReturnValueOnce(insertQuery.chain)
        .mockReturnValueOnce(updateQuery.chain);

      const result = await service.addMessage('conv-1', 'assistant', 'Hi there', {
        model: 'gpt-4',
      });

      expect(insertQuery.mocks['insert']).toHaveBeenCalledWith({
        conversation_id: 'conv-1',
        role: 'assistant',
        content: 'Hi there',
        metadata: { model: 'gpt-4' },
      });
      expect(result.metadata).toEqual({ model: 'gpt-4' });
    });

    it('throws on insert error', async () => {
      const query = createQueryMock({
        data: null,
        error: { message: 'fk violation' },
      });
      mockFrom.mockReturnValue(query.chain);

      await expect(
        service.addMessage('conv-1', 'user', 'Hello'),
      ).rejects.toThrow('Failed to add message: fk violation');
    });
  });

  describe('getMessages', () => {
    it('returns messages ordered by created_at ascending', async () => {
      const query = createQueryMock({
        data: [
          {
            id: 'msg-1',
            conversation_id: 'conv-1',
            role: 'user',
            content: 'Hello',
            metadata: {},
            created_at: '2026-03-07T01:00:00.000Z',
          },
          {
            id: 'msg-2',
            conversation_id: 'conv-1',
            role: 'assistant',
            content: 'Hi',
            metadata: {},
            created_at: '2026-03-07T01:01:00.000Z',
          },
        ],
        error: null,
      });
      mockFrom.mockReturnValue(query.chain);

      const result = await service.getMessages('conv-1');

      expect(mockFrom).toHaveBeenCalledWith('messages');
      expect(query.mocks['select']).toHaveBeenCalledWith('*');
      expect(query.mocks['eq']).toHaveBeenCalledWith('conversation_id', 'conv-1');
      expect(query.mocks['order']).toHaveBeenCalledWith('created_at', { ascending: true });
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Hello');
      expect(result[1].content).toBe('Hi');
    });

    it('applies limit when provided', async () => {
      const query = createQueryMock({ data: [], error: null });
      mockFrom.mockReturnValue(query.chain);

      await service.getMessages('conv-1', 5);

      expect(query.mocks['limit']).toHaveBeenCalledWith(5);
    });

    it('throws on query error', async () => {
      const query = createQueryMock({ data: null, error: { message: 'query failed' } });
      mockFrom.mockReturnValue(query.chain);

      await expect(service.getMessages('conv-1')).rejects.toThrow(
        'Failed to get messages: query failed',
      );
    });
  });

  describe('listConversations', () => {
    it('returns conversations ordered by updated_at descending', async () => {
      const query = createQueryMock({
        data: [
          {
            id: 'conv-2',
            title: 'Newer',
            created_at: '2026-03-07T02:00:00.000Z',
            updated_at: '2026-03-07T03:00:00.000Z',
          },
          {
            id: 'conv-1',
            title: 'Older',
            created_at: '2026-03-07T00:00:00.000Z',
            updated_at: '2026-03-07T01:00:00.000Z',
          },
        ],
        error: null,
      });
      mockFrom.mockReturnValue(query.chain);

      const result = await service.listConversations();

      expect(mockFrom).toHaveBeenCalledWith('conversations');
      expect(query.mocks['select']).toHaveBeenCalledWith('*');
      expect(query.mocks['order']).toHaveBeenCalledWith('updated_at', { ascending: false });
      expect(query.mocks['limit']).toHaveBeenCalledWith(50);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Newer');
      expect(result[1].title).toBe('Older');
    });

    it('respects custom limit', async () => {
      const query = createQueryMock({ data: [], error: null });
      mockFrom.mockReturnValue(query.chain);

      await service.listConversations(10);

      expect(query.mocks['limit']).toHaveBeenCalledWith(10);
    });

    it('throws on query error', async () => {
      const query = createQueryMock({ data: null, error: { message: 'list failed' } });
      mockFrom.mockReturnValue(query.chain);

      await expect(service.listConversations()).rejects.toThrow(
        'Failed to list conversations: list failed',
      );
    });
  });

  describe('getConversation', () => {
    it('returns a single conversation by id', async () => {
      const query = createQueryMock({
        data: {
          id: 'conv-1',
          title: 'Test',
          created_at: '2026-03-07T00:00:00.000Z',
          updated_at: '2026-03-07T00:00:00.000Z',
        },
        error: null,
      });
      mockFrom.mockReturnValue(query.chain);

      const result = await service.getConversation('conv-1');

      expect(mockFrom).toHaveBeenCalledWith('conversations');
      expect(query.mocks['eq']).toHaveBeenCalledWith('id', 'conv-1');
      expect(query.mocks['maybeSingle']).toHaveBeenCalled();
      expect(result).toEqual({
        id: 'conv-1',
        title: 'Test',
        createdAt: new Date('2026-03-07T00:00:00.000Z'),
        updatedAt: new Date('2026-03-07T00:00:00.000Z'),
      });
    });

    it('returns null when conversation not found', async () => {
      const query = createQueryMock({ data: null, error: null });
      mockFrom.mockReturnValue(query.chain);

      const result = await service.getConversation('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('deleteConversation', () => {
    it('deletes a conversation by id', async () => {
      const query = createQueryMock({ data: null, error: null });
      mockFrom.mockReturnValue(query.chain);

      await service.deleteConversation('conv-1');

      expect(mockFrom).toHaveBeenCalledWith('conversations');
      expect(query.mocks['delete']).toHaveBeenCalled();
      expect(query.mocks['eq']).toHaveBeenCalledWith('id', 'conv-1');
    });

    it('throws on delete error', async () => {
      const query = createQueryMock({ data: null, error: { message: 'delete failed' } });
      mockFrom.mockReturnValue(query.chain);

      await expect(service.deleteConversation('conv-1')).rejects.toThrow(
        'Failed to delete conversation: delete failed',
      );
    });
  });

  describe('getRecentMessages', () => {
    it('returns messages in chronological order after fetching most recent', async () => {
      const query = createQueryMock({
        data: [
          {
            id: 'msg-3',
            conversation_id: 'conv-1',
            role: 'assistant',
            content: 'Third',
            metadata: {},
            created_at: '2026-03-07T03:00:00.000Z',
          },
          {
            id: 'msg-2',
            conversation_id: 'conv-1',
            role: 'user',
            content: 'Second',
            metadata: {},
            created_at: '2026-03-07T02:00:00.000Z',
          },
        ],
        error: null,
      });
      mockFrom.mockReturnValue(query.chain);

      const result = await service.getRecentMessages('conv-1', 2);

      expect(query.mocks['order']).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(query.mocks['limit']).toHaveBeenCalledWith(2);
      // Should be reversed to chronological order
      expect(result[0].content).toBe('Second');
      expect(result[1].content).toBe('Third');
    });
  });
});
