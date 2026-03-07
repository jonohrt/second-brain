# iOS Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add conversation history, LLM intent routing, task capture/update, and iOS UI improvements (TTS stop, clear button, cancel request, chat bubbles).

**Architecture:** Server-side conversation history in Supabase with new `conversations` and `messages` tables. LLM-powered intent router replaces regex-based detection in the `/ask` route. iOS app refactored from single-response view to chat-bubble conversation UI with conversation list.

**Tech Stack:** TypeScript (Fastify, Zod, Vitest), Swift (SwiftUI), Supabase (pgvector), Ollama

**Design doc:** `docs/plans/2026-03-07-ios-enhancements-design.md`

---

## Task 1: Fix TTS stop behavior (iOS)

**Files:**
- Modify: `ios/SecondBrain/ViewModels/AppViewModel.swift:140-148`

The current `toggleTTS()` always toggles `isTTSEnabled`, which changes the user's TTS preference when they just want to stop current speech. Fix: if speech is playing, stop it without toggling.

**Step 1: Update toggleTTS method**

Replace the `toggleTTS()` method in `AppViewModel.swift` (lines 140-148) with:

```swift
/// Toggles text-to-speech readback on/off.
/// If speech is currently playing, stops it without changing the TTS preference.
func toggleTTS() {
    if speechService.isSpeaking {
        speechService.stop()
        return
    }
    isTTSEnabled.toggle()
    if isTTSEnabled && !answer.isEmpty {
        speechService.speak(answer)
    }
}
```

**Step 2: Build and verify**

Open Xcode, build the project (Cmd+B). No errors expected.

**Step 3: Manual test**

1. Ask a question with TTS enabled
2. While speaking, tap the speaker button
3. Speech should stop immediately
4. `isTTSEnabled` should still be `true` (speaker icon still blue)
5. Ask another question — TTS should read the response automatically

**Step 4: Commit**

```bash
cd /Users/jimi/Code/second-brain
git add ios/SecondBrain/ViewModels/AppViewModel.swift
git commit -m "fix(ios): stop TTS speech without toggling preference off"
```

---

## Task 2: Add clear button and cancel request (iOS)

**Files:**
- Modify: `ios/SecondBrain/Views/ContentView.swift:120-163`
- Modify: `ios/SecondBrain/ViewModels/AppViewModel.swift:112-131`

**Step 1: Add request cancellation to AppViewModel**

Add a private property to store the current request task. In `AppViewModel.swift`, add after line 50 (after `private let speechService = SpeechService()`):

```swift
private var currentRequestTask: Task<Void, Never>?
```

Replace `sendQuestion()` (lines 114-131) with:

```swift
/// Sends the current transcription to the /ask endpoint and populates the answer.
func sendQuestion() {
    let trimmed = transcription.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    isLoading = true
    error = nil
    speechService.stop()

    currentRequestTask = Task {
        do {
            let response = try await apiClient.ask(text: trimmed)
            guard !Task.isCancelled else { return }
            answer = response.answer
            currentSources = response.sources ?? []
            if isTTSEnabled {
                speechService.speak(response.answer)
            }
        } catch {
            guard !Task.isCancelled else { return }
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}

/// Cancels the current in-flight request.
func cancelRequest() {
    currentRequestTask?.cancel()
    currentRequestTask = nil
    isLoading = false
}
```

Also update `retry()` (line 134-136):

```swift
/// Retries the last question.
func retry() {
    sendQuestion()
}
```

**Step 2: Update ContentView input area**

Replace the input area section in `ContentView.swift` (lines 120-164) with:

```swift
            Divider()
                .padding(.top, 8)

            // Input area — compact at bottom
            HStack(alignment: .bottom, spacing: 12) {
                // Record button
                RecordButton(
                    isRecording: viewModel.isRecording,
                    isDisabled: !viewModel.isWhisperReady,
                    onStart: { viewModel.startRecording() },
                    onStop: { viewModel.stopRecording() }
                )
                .frame(width: 56, height: 56)

                // Text input + send/stop
                VStack(spacing: 6) {
                    ZStack(alignment: .topLeading) {
                        TextEditor(text: $viewModel.transcription)
                            .focused($isEditorFocused)
                            .frame(minHeight: 40, maxHeight: 80)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color(.systemGray4), lineWidth: 1)
                            )
                            .overlay(alignment: .topTrailing) {
                                if !viewModel.transcription.isEmpty {
                                    Button {
                                        viewModel.transcription = ""
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundColor(.secondary)
                                    }
                                    .padding(8)
                                }
                            }
                        if viewModel.transcription.isEmpty {
                            Text("Ask anything...")
                                .foregroundColor(Color(.placeholderText))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 12)
                                .allowsHitTesting(false)
                        }
                    }

                    if viewModel.isLoading {
                        Button {
                            viewModel.cancelRequest()
                        } label: {
                            Label("Stop", systemImage: "stop.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.red)
                    } else {
                        Button {
                            isEditorFocused = false
                            viewModel.sendQuestion()
                        } label: {
                            Text("Send")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(
                            viewModel.transcription
                                .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        )
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 12)
```

**Step 3: Build and verify**

Open Xcode, build (Cmd+B). No errors expected.

**Step 4: Manual test**

1. Type text in the input — X button appears at top-right of text editor
2. Tap X — text clears instantly
3. Send a question — Send button becomes red Stop button
4. Tap Stop — request cancels, loading indicator disappears, no error shown
5. Send another question — works normally

**Step 5: Commit**

```bash
cd /Users/jimi/Code/second-brain
git add ios/SecondBrain/Views/ContentView.swift ios/SecondBrain/ViewModels/AppViewModel.swift
git commit -m "feat(ios): add clear button, cancel request, and async sendQuestion"
```

---

## Task 3: Create Supabase conversation tables

**Files:**
- Create: `supabase/migrations/20260307_conversations.sql`

**Step 1: Write the migration SQL**

```sql
-- Conversation history for iOS app
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
```

**Step 2: Run the migration**

```bash
cd /Users/jimi/Code/second-brain
# Apply via Supabase dashboard SQL editor or CLI:
# supabase db push (if using Supabase CLI)
# Or paste into Supabase dashboard > SQL Editor > Run
```

**Step 3: Verify tables exist**

In Supabase dashboard, check that `conversations` and `messages` tables appear with correct columns and indexes.

**Step 4: Commit**

```bash
cd /Users/jimi/Code/second-brain
git add supabase/migrations/20260307_conversations.sql
git commit -m "feat: add conversations and messages tables to Supabase"
```

---

## Task 4: Add ConversationService to server

**Files:**
- Create: `src/services/conversation.ts`
- Create: `tests/services/conversation.test.ts`

**Step 1: Write the failing tests**

Create `tests/services/conversation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

import { ConversationService } from '../../src/services/conversation.js';

function createQueryMock(result: { data: unknown; error: unknown }) {
  const mocks: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = new Proxy({}, {
    get(_, prop: string) {
      if (prop === 'then') return undefined;
      if (!mocks[prop]) {
        mocks[prop] = vi.fn(() => {
          if (['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit', 'single', 'maybeSingle'].includes(prop)) {
            return chain;
          }
          return Promise.resolve(result);
        });
        // Make chainable methods return chain, terminal methods return result
        mocks[prop].mockReturnValue(chain);
      }
      return mocks[prop];
    },
  });
  // Make the chain thenable (for await)
  (chain as Record<string, unknown>)['then'] = (resolve: (v: unknown) => void) => resolve(result);
  return { chain, mocks };
}

describe('ConversationService', () => {
  let service: ConversationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ConversationService('http://localhost:54321', 'test-key');
  });

  describe('createConversation', () => {
    it('inserts a new conversation and returns it', async () => {
      const mockConvo = { id: 'conv-1', title: 'Test', created_at: '2026-03-07T00:00:00Z', updated_at: '2026-03-07T00:00:00Z' };
      const query = createQueryMock({ data: mockConvo, error: null });
      mockFrom.mockReturnValue(query.chain);

      const result = await service.createConversation('Test');

      expect(mockFrom).toHaveBeenCalledWith('conversations');
      expect(query.mocks['insert']).toHaveBeenCalled();
      expect(result.id).toBe('conv-1');
    });
  });

  describe('addMessage', () => {
    it('inserts a message and updates conversation timestamp', async () => {
      const mockMsg = { id: 'msg-1', conversation_id: 'conv-1', role: 'user', content: 'Hello', metadata: {}, created_at: '2026-03-07T00:00:00Z' };
      const query = createQueryMock({ data: mockMsg, error: null });
      mockFrom.mockReturnValue(query.chain);

      const result = await service.addMessage('conv-1', 'user', 'Hello');

      expect(mockFrom).toHaveBeenCalledWith('messages');
      expect(query.mocks['insert']).toHaveBeenCalled();
      expect(result.id).toBe('msg-1');
    });
  });

  describe('getMessages', () => {
    it('queries messages for a conversation ordered by created_at', async () => {
      const query = createQueryMock({ data: [], error: null });
      mockFrom.mockReturnValue(query.chain);

      await service.getMessages('conv-1');

      expect(mockFrom).toHaveBeenCalledWith('messages');
      expect(query.mocks['eq']).toHaveBeenCalledWith('conversation_id', 'conv-1');
      expect(query.mocks['order']).toHaveBeenCalledWith('created_at', { ascending: true });
    });
  });

  describe('listConversations', () => {
    it('returns conversations ordered by updated_at desc', async () => {
      const query = createQueryMock({ data: [], error: null });
      mockFrom.mockReturnValue(query.chain);

      await service.listConversations();

      expect(mockFrom).toHaveBeenCalledWith('conversations');
      expect(query.mocks['order']).toHaveBeenCalledWith('updated_at', { ascending: false });
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/jimi/Code/second-brain && npx vitest run tests/services/conversation.test.ts`
Expected: FAIL — module not found

**Step 3: Implement ConversationService**

Create `src/services/conversation.ts`:

```typescript
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
      .insert({
        conversation_id: conversationId,
        role,
        content,
        metadata: metadata ?? {},
      })
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
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/jimi/Code/second-brain && npx vitest run tests/services/conversation.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
cd /Users/jimi/Code/second-brain
git add src/services/conversation.ts tests/services/conversation.test.ts
git commit -m "feat: add ConversationService for chat history in Supabase"
```

---

## Task 5: Add Intent Router service

**Files:**
- Create: `src/services/intent-router.ts`
- Create: `tests/services/intent-router.test.ts`

The intent router uses the LLM to classify user messages and extract structured data.

**Step 1: Write the failing tests**

Create `tests/services/intent-router.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentRouter, type IntentResult } from '../../src/services/intent-router.js';
import type { OllamaChatService } from '../../src/services/ollama-chat.js';

function createMockChat(response: string) {
  return {
    chatWithFallback: vi.fn(async () => ({ content: response, model: 'test' })),
    chat: vi.fn(),
    classify: vi.fn(),
  } as unknown as OllamaChatService;
}

describe('IntentRouter', () => {
  describe('classify', () => {
    it('returns ask intent for a question', async () => {
      const chat = createMockChat(JSON.stringify({
        intent: 'ask',
      }));
      const router = new IntentRouter(chat);

      const result = await router.classify('What is TypeScript?', []);

      expect(result.intent).toBe('ask');
    });

    it('returns capture_task intent with extracted fields', async () => {
      const chat = createMockChat(JSON.stringify({
        intent: 'capture_task',
        title: 'Fix the login bug',
        project: 'tesla',
        tags: ['bug'],
      }));
      const router = new IntentRouter(chat);

      const result = await router.classify('Capture a task to fix the login bug for the tesla project', []);

      expect(result.intent).toBe('capture_task');
      expect(result.title).toBe('Fix the login bug');
      expect(result.project).toBe('tesla');
      expect(result.tags).toEqual(['bug']);
    });

    it('returns update_task intent with update_query', async () => {
      const chat = createMockChat(JSON.stringify({
        intent: 'update_task',
        update_query: 'login bug',
        new_description: 'Fix the login bug — also affects signup',
      }));
      const router = new IntentRouter(chat);

      const result = await router.classify('Update the login bug task to mention it also affects signup', []);

      expect(result.intent).toBe('update_task');
      expect(result.update_query).toBe('login bug');
      expect(result.new_description).toBe('Fix the login bug — also affects signup');
    });

    it('returns reminder intent with time', async () => {
      const chat = createMockChat(JSON.stringify({
        intent: 'reminder',
        title: 'Dentist appointment',
        reminder_time: '2026-03-10T15:00:00',
      }));
      const router = new IntentRouter(chat);

      const result = await router.classify('Remind me about my dentist appointment on March 10 at 3pm', []);

      expect(result.intent).toBe('reminder');
      expect(result.title).toBe('Dentist appointment');
      expect(result.reminder_time).toBe('2026-03-10T15:00:00');
    });

    it('falls back to ask intent on LLM failure', async () => {
      const chat = createMockChat('not json at all');
      const router = new IntentRouter(chat);

      const result = await router.classify('anything', []);

      expect(result.intent).toBe('ask');
    });

    it('falls back to ask intent on thrown error', async () => {
      const chat = {
        chatWithFallback: vi.fn().mockRejectedValue(new Error('LLM down')),
        chat: vi.fn(),
        classify: vi.fn(),
      } as unknown as OllamaChatService;
      const router = new IntentRouter(chat);

      const result = await router.classify('anything', []);

      expect(result.intent).toBe('ask');
    });

    it('includes conversation history in the prompt', async () => {
      const chat = createMockChat(JSON.stringify({ intent: 'ask' }));
      const router = new IntentRouter(chat);

      const history = [
        { role: 'user' as const, content: 'Tell me about login bugs' },
        { role: 'assistant' as const, content: 'There are 3 open login bugs...' },
      ];

      await router.classify('Capture that as a task', history);

      const callArgs = (chat.chatWithFallback as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const systemMsg = callArgs.find((m: { role: string }) => m.role === 'system');
      expect(systemMsg.content).toContain('Conversation history');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/jimi/Code/second-brain && npx vitest run tests/services/intent-router.test.ts`
Expected: FAIL — module not found

**Step 3: Implement IntentRouter**

Create `src/services/intent-router.ts`:

```typescript
import type { OllamaChatService, ChatMessage } from './ollama-chat.js';

export type Intent = 'ask' | 'reminder' | 'capture_task' | 'update_task' | 'update_reminder' | 'capture_note';

export interface IntentResult {
  intent: Intent;
  title?: string;
  content?: string;
  project?: string;
  tags?: string[];
  update_query?: string;
  new_description?: string;
  new_title?: string;
  reminder_time?: string;
}

const VALID_INTENTS: Intent[] = ['ask', 'reminder', 'capture_task', 'update_task', 'update_reminder', 'capture_note'];

const INTENT_SYSTEM_PROMPT = `You are an intent classifier for a personal knowledge system. Classify the user's message into exactly one intent and extract structured data.

Intents:
- "ask": A question or conversational message (default)
- "reminder": User wants to create a new reminder (contains phrases like "remind me", "set a reminder")
- "capture_task": User wants to capture/create a new task or TODO (contains phrases like "capture a task", "add a task", "create a task", "add a todo")
- "update_task": User wants to modify an existing task (contains phrases like "update the task", "change the task", "modify the task")
- "update_reminder": User wants to modify an existing reminder (contains phrases like "change my reminder", "update the reminder", "reschedule")
- "capture_note": User wants to save a note or learning (contains phrases like "remember that", "save this", "note that", "don't forget")

Reply with JSON only:
{
  "intent": "ask" | "reminder" | "capture_task" | "update_task" | "update_reminder" | "capture_note",
  "title": "short title for the item (for capture/reminder intents)",
  "content": "full description if provided",
  "project": "project name if mentioned or inferrable",
  "tags": ["relevant", "tags"],
  "update_query": "search string to find the existing item (for update intents)",
  "new_description": "the new description for the item (for update intents)",
  "new_title": "new title if changing (for update intents)",
  "reminder_time": "ISO 8601 datetime string (for reminder intents)"
}

Only include fields relevant to the intent. For "ask" intent, return just {"intent": "ask"}.
Today's date is ${new Date().toISOString().slice(0, 10)}.`;

export class IntentRouter {
  constructor(private ollamaChat: OllamaChatService) {}

  async classify(text: string, conversationHistory: Array<{ role: string; content: string }>): Promise<IntentResult> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
      ];

      if (conversationHistory.length > 0) {
        const historyText = conversationHistory
          .slice(-6)
          .map(m => `${m.role}: ${m.content}`)
          .join('\n');
        messages.push({
          role: 'system',
          content: `Conversation history (for context — the user may refer to previous messages):\n${historyText}`,
        });
      }

      messages.push({ role: 'user', content: text });

      const result = await this.ollamaChat.chatWithFallback(messages, 'json');
      const parsed = JSON.parse(result.content);

      if (!parsed.intent || !VALID_INTENTS.includes(parsed.intent)) {
        return { intent: 'ask' };
      }

      return parsed as IntentResult;
    } catch {
      return { intent: 'ask' };
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/jimi/Code/second-brain && npx vitest run tests/services/intent-router.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
cd /Users/jimi/Code/second-brain
git add src/services/intent-router.ts tests/services/intent-router.test.ts
git commit -m "feat: add LLM-powered IntentRouter service"
```

---

## Task 6: Add reminder update to reminders service

**Files:**
- Modify: `src/services/reminders.ts:1-58`
- Create: `tests/services/reminders.test.ts`

**Step 1: Write the failing test**

Create `tests/services/reminders.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));
vi.mock('node:util', () => ({
  promisify: () => mockExecFile,
}));

import { updateAppleReminder, findAppleReminder } from '../../src/services/reminders.js';

describe('findAppleReminder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when reminder exists', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'true' });
    const found = await findAppleReminder('Dentist');
    expect(found).toBe(true);
  });

  it('returns false when reminder does not exist', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'false' });
    const found = await findAppleReminder('Nonexistent');
    expect(found).toBe(false);
  });
});

describe('updateAppleReminder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls osascript to update reminder name', async () => {
    mockExecFile.mockResolvedValue({ stdout: '' });
    const result = await updateAppleReminder('Old Title', { newTitle: 'New Title' });
    expect(result).toBeNull();
    expect(mockExecFile).toHaveBeenCalled();
    const script = mockExecFile.mock.calls[0][1][1];
    expect(script).toContain('Old Title');
    expect(script).toContain('New Title');
  });

  it('returns error message on failure', async () => {
    mockExecFile.mockRejectedValue(new Error('osascript failed'));
    const result = await updateAppleReminder('Old Title', { newTitle: 'New Title' });
    expect(result).toContain('failed');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/jimi/Code/second-brain && npx vitest run tests/services/reminders.test.ts`
Expected: FAIL — `updateAppleReminder` and `findAppleReminder` not exported

**Step 3: Add exports and updateAppleReminder function**

In `src/services/reminders.ts`, rename the existing `reminderExists` to `findAppleReminder` and export it. Add the `updateAppleReminder` function. Replace the full file:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function findAppleReminder(title: string): Promise<boolean> {
  const escapedTitle = title.replace(/"/g, '\\"');
  const script = `tell application "Reminders"
  tell list "Reminders"
    set matches to (every reminder whose name contains "${escapedTitle}" and completed is false)
    return (count of matches) > 0
  end tell
end tell`;

  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script]);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

export async function createAppleReminder(title: string, remindAt: Date): Promise<string | null> {
  const exists = await findAppleReminder(title);
  if (exists) {
    return `Reminder "${title}" already exists, skipping.`;
  }

  const dateStr = remindAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = remindAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  const appleDate = `${dateStr} at ${timeStr}`;
  const escapedTitle = title.replace(/"/g, '\\"');

  const script = `tell application "Reminders"
  tell list "Reminders"
    make new reminder with properties {name:"${escapedTitle}", remind me date:date "${appleDate}"}
  end tell
end tell`;

  try {
    await execFileAsync('osascript', ['-e', script]);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Reminder creation failed: ${message}`;
  }
}

export async function updateAppleReminder(
  currentTitle: string,
  updates: { newTitle?: string; newDate?: Date },
): Promise<string | null> {
  const escapedCurrent = currentTitle.replace(/"/g, '\\"');
  const setParts: string[] = [];

  if (updates.newTitle) {
    const escapedNew = updates.newTitle.replace(/"/g, '\\"');
    setParts.push(`set name of matched to "${escapedNew}"`);
  }

  if (updates.newDate) {
    const dateStr = updates.newDate.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr = updates.newDate.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });
    setParts.push(`set remind me date of matched to date "${dateStr} at ${timeStr}"`);
  }

  if (setParts.length === 0) return 'No updates provided';

  const script = `tell application "Reminders"
  tell list "Reminders"
    set matches to (every reminder whose name contains "${escapedCurrent}" and completed is false)
    if (count of matches) > 0 then
      set matched to item 1 of matches
      ${setParts.join('\n      ')}
    else
      error "No reminder found matching \\"${escapedCurrent}\\""
    end if
  end tell
end tell`;

  try {
    await execFileAsync('osascript', ['-e', script]);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Reminder update failed: ${message}`;
  }
}
```

Note: The `findAppleReminder` now uses `contains` instead of `is` for fuzzy matching.

**Step 4: Update the import in ask.ts**

The ask route imports `createAppleReminder` — verify it still works since we didn't change that export. Also, if `reminderExists` was used internally, it's now `findAppleReminder`. Check that `src/server/routes/ask.ts` only imports `createAppleReminder` — yes, confirmed at line 8. No change needed.

**Step 5: Run tests to verify they pass**

Run: `cd /Users/jimi/Code/second-brain && npx vitest run tests/services/reminders.test.ts`
Expected: All tests PASS

**Step 6: Run all tests to verify no regressions**

Run: `cd /Users/jimi/Code/second-brain && npx vitest run`
Expected: All tests PASS

**Step 7: Commit**

```bash
cd /Users/jimi/Code/second-brain
git add src/services/reminders.ts tests/services/reminders.test.ts
git commit -m "feat: add updateAppleReminder and export findAppleReminder"
```

---

## Task 7: Refactor ask route with intent router and conversations

**Files:**
- Modify: `src/server/routes/ask.ts:1-122`
- Modify: `src/server/index.ts:1-119`
- Modify: `tests/server/helpers.ts:1-77`
- Modify: `tests/server/ask.test.ts:1-91`

This is the central wiring task. The ask route now:
1. Accepts optional `conversation_id`
2. Uses IntentRouter instead of regex patterns
3. Stores messages in ConversationService
4. Passes conversation history to the LLM

**Step 1: Update the ask route**

Replace `src/server/routes/ask.ts` entirely:

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AskPipeline } from '../../services/ask-pipeline.js';
import type { Services } from '../../mcp/server.js';
import type { IntentRouter } from '../../services/intent-router.js';
import type { ConversationService } from '../../services/conversation.js';
import type { ContextEntry } from '../../types.js';
import { captureEntry } from '../../services/capture.js';
import { createAppleReminder, updateAppleReminder } from '../../services/reminders.js';

const askBodySchema = z.object({
  text: z.string().min(1, 'text is required'),
  conversation_id: z.string().uuid().optional(),
});

export interface AskRouteDeps {
  askPipeline: AskPipeline;
  services: Services;
  intentRouter: IntentRouter;
  conversations: ConversationService;
}

export async function askRoutes(app: FastifyInstance, opts: AskRouteDeps) {
  const { askPipeline, services, intentRouter, conversations } = opts;

  app.post('/ask', async (request, reply) => {
    const parsed = askBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    const { text, conversation_id } = parsed.data;

    try {
      // Get or create conversation
      let convId = conversation_id;
      if (!convId) {
        const conv = await conversations.createConversation(text.slice(0, 60));
        convId = conv.id;
      }

      // Store user message
      await conversations.addMessage(convId, 'user', text);

      // Get conversation history for context
      const recentMessages = await conversations.getRecentMessages(convId, 20);
      const history = recentMessages
        .slice(0, -1) // exclude the message we just added
        .map(m => ({ role: m.role, content: m.content }));

      // Classify intent
      const intent = await intentRouter.classify(text, history);

      let answer: string;
      let metadata: Record<string, unknown> = {};

      switch (intent.intent) {
        case 'reminder': {
          const reminderTime = intent.reminder_time ? new Date(intent.reminder_time) : null;
          if (!reminderTime || !intent.title) {
            answer = "I couldn't understand the reminder details. Could you try again with a specific time?";
          } else {
            const warning = await createAppleReminder(intent.title, reminderTime);
            const timeStr = reminderTime.toLocaleString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: 'numeric', minute: '2-digit',
            });
            answer = warning
              ? `Warning: ${warning}`
              : `Reminder set: "${intent.title}" — ${timeStr}`;
          }
          metadata = { route: 'reminder', model: 'none', intent: 'reminder' };
          break;
        }

        case 'capture_task': {
          const now = new Date();
          const entry: ContextEntry = {
            type: 'task',
            title: intent.title ?? text.slice(0, 60),
            content: intent.content ?? intent.title ?? text,
            project: intent.project,
            metadata: { status: 'open', tags: intent.tags ?? [] },
            createdAt: now,
            updatedAt: now,
          };
          await captureEntry(entry, services);
          const tagStr = intent.tags?.length ? ` [${intent.tags.join(', ')}]` : '';
          const projStr = intent.project ? ` under project ${intent.project}` : '';
          answer = `Captured task: "${entry.title}"${projStr}${tagStr}`;
          metadata = { route: 'capture', model: 'none', intent: 'capture_task' };
          break;
        }

        case 'capture_note': {
          const now = new Date();
          const entry: ContextEntry = {
            type: 'learned',
            title: intent.title ?? text.slice(0, 60),
            content: intent.content ?? text,
            project: intent.project,
            metadata: { tags: intent.tags ?? [] },
            createdAt: now,
            updatedAt: now,
          };
          await captureEntry(entry, services);
          answer = `Saved to your second brain: "${entry.title}"`;
          metadata = { route: 'capture', model: 'none', intent: 'capture_note' };
          break;
        }

        case 'update_task': {
          if (!intent.update_query) {
            answer = "I couldn't determine which task to update. Could you be more specific?";
          } else {
            const matches = await services.supabase.findTaskByTitle(intent.update_query);
            if (matches.length === 0) {
              answer = `No open task matching "${intent.update_query}".`;
            } else if (matches.length > 1) {
              const list = matches.map(t => `- ${t.title}`).join('\n');
              answer = `Multiple tasks match "${intent.update_query}". Which one?\n${list}`;
            } else {
              const task = matches[0];
              if (intent.new_description) task.content = intent.new_description;
              if (intent.new_title) task.title = intent.new_title;
              task.updatedAt = new Date();

              const vaultPath = services.vault.writeEntry(task);
              task.vaultPath = vaultPath;
              try {
                const available = await services.embeddings.isAvailable();
                if (available) {
                  const embedding = await services.embeddings.embed(task.content);
                  await services.supabase.upsertEntry(task, embedding);
                } else {
                  await services.supabase.upsertEntry(task);
                }
              } catch { /* sync failure is non-fatal */ }
              answer = `Updated task: "${task.title}"`;
            }
          }
          metadata = { route: 'update', model: 'none', intent: 'update_task' };
          break;
        }

        case 'update_reminder': {
          if (!intent.update_query) {
            answer = "I couldn't determine which reminder to update. Could you be more specific?";
          } else {
            const updates: { newTitle?: string; newDate?: Date } = {};
            if (intent.new_title) updates.newTitle = intent.new_title;
            if (intent.reminder_time) updates.newDate = new Date(intent.reminder_time);

            const result = await updateAppleReminder(intent.update_query, updates);
            answer = result
              ? `Warning: ${result}`
              : `Updated reminder matching "${intent.update_query}"`;
          }
          metadata = { route: 'update', model: 'none', intent: 'update_reminder' };
          break;
        }

        case 'ask':
        default: {
          const result = await askPipeline.ask(text, history);
          answer = result.answer;
          metadata = {
            route: result.route,
            model: result.model,
            sources: result.sources,
            intent: 'ask',
          };
          break;
        }
      }

      // Store assistant response
      await conversations.addMessage(convId, 'assistant', answer, metadata);

      return reply.send({
        answer,
        sources: (metadata.sources as unknown[]) ?? [],
        route: metadata.route ?? 'ask',
        model: metadata.model ?? 'none',
        conversation_id: convId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ error: 'Ask failed', message });
    }
  });
}
```

**Step 2: Update AskPipeline to accept conversation history**

Modify `src/services/ask-pipeline.ts`. Update the `ask` method signature (line 52) to accept optional history and include it in the generation prompt:

Replace `async ask(question: string): Promise<AskResult>` (line 52) with:

```typescript
async ask(question: string, conversationHistory?: Array<{ role: string; content: string }>): Promise<AskResult> {
```

And update the prompt building (line 85) to include history:

Replace line 85:
```typescript
    const messages = buildGenerationPrompt(question, brainResults, webResults);
```

With:
```typescript
    const messages = buildGenerationPrompt(question, brainResults, webResults, conversationHistory);
```

Update the `buildGenerationPrompt` function signature (line 114) and body:

Replace lines 114-157 with:

```typescript
function buildGenerationPrompt(
  question: string,
  brainResults: BrainResult[],
  webResults: SearchResult[],
  conversationHistory?: Array<{ role: string; content: string }>,
): ChatMessage[] {
  const contextParts: string[] = [];

  if (brainResults.length > 0) {
    contextParts.push('## Your Personal Notes:');
    for (const { entry, similarity } of brainResults) {
      contextParts.push(`### ${entry.title} (relevance: ${(similarity * 100).toFixed(0)}%)`);
      if (entry.vaultPath) contextParts.push(`Source: ${entry.vaultPath}`);
      contextParts.push(entry.content);
      contextParts.push('');
    }
  }

  if (webResults.length > 0) {
    contextParts.push('## Web Search Results:');
    for (const result of webResults) {
      contextParts.push(`### ${result.title}`);
      contextParts.push(`URL: ${result.url}`);
      contextParts.push(result.content);
      contextParts.push('');
    }
  }

  let systemContent: string;
  if (contextParts.length > 0) {
    systemContent = `You are a helpful assistant answering questions using the provided context.
Ground your answer in the context below. If the context does not contain relevant information, say so.
When citing personal notes, mention the note title. When citing web results, mention the source.

${contextParts.join('\n')}`;
  } else {
    systemContent =
      'You are a helpful assistant. Answer based on your general knowledge. Note that no personal notes or web results were found.';
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemContent },
  ];

  // Include conversation history for multi-turn context
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: question });

  return messages;
}
```

**Step 3: Update server index to wire new services**

In `src/server/index.ts`, add imports at the top (after line 15):

```typescript
import { IntentRouter } from '../services/intent-router.js';
import { ConversationService } from '../services/conversation.js';
```

Update `createApp` function. Add `intentRouter` and `conversations` to `CreateAppOptions` (line 21-28):

```typescript
export interface CreateAppOptions {
  protectedRoutes?: (scoped: FastifyInstance) => Promise<void> | void;
  services?: Services;
  askPipeline?: AskPipeline;
  intentRouter?: IntentRouter;
  conversations?: ConversationService;
}
```

In the `createApp` function body, build the new services (after line 50):

```typescript
  const ollamaChat = new OllamaChatService(
    config.ollama.baseUrl,
    'gpt-oss:120b-cloud',
    'gpt-oss:120b-cloud',
  );
  const intentRouter = opts?.intentRouter ?? new IntentRouter(ollamaChat);
  const conversationService = opts?.conversations ?? new ConversationService(config.supabase.url, config.supabase.key);
```

Note: the `ollamaChat` is currently built inside `buildAskPipeline`. We'll need to extract it so it can be shared. Refactor `buildAskPipeline` to accept the chat service, or build it outside. The simplest approach: build `OllamaChatService` in `createApp` and pass it to both `buildAskPipeline` and `IntentRouter`.

Replace the `createApp` function entirely:

```typescript
export function createApp(config: Config, opts?: CreateAppOptions): FastifyInstance {
  const app = Fastify({ logger: true });
  const services = opts?.services ?? buildServices(config);

  const ollamaChat = new OllamaChatService(
    config.ollama.baseUrl,
    'gpt-oss:120b-cloud',
    'gpt-oss:120b-cloud',
  );
  const searxng = new SearxngService('http://localhost:8888');
  const askPipeline = opts?.askPipeline ?? new AskPipeline(ollamaChat, searxng, services.embeddings, services.supabase);
  const intentRouter = opts?.intentRouter ?? new IntentRouter(ollamaChat);
  const conversationService = opts?.conversations ?? new ConversationService(config.supabase.url, config.supabase.key);

  // Public routes
  app.register(healthRoutes);

  // Protected scope
  if (config.server?.apiToken) {
    app.register(async function protectedScope(scoped) {
      await scoped.register(authPlugin, { apiToken: config.server!.apiToken });
      await scoped.register(captureRoutes, { services });
      await scoped.register(askRoutes, {
        askPipeline,
        services,
        intentRouter,
        conversations: conversationService,
      });

      if (opts?.protectedRoutes) {
        await opts.protectedRoutes(scoped);
      }
    });
  }

  return app;
}
```

Remove the now-unused `buildAskPipeline` function (lines 37-45).

**Step 4: Update test helpers**

In `tests/server/helpers.ts`, update `buildTestAppWithAsk` to include mock intent router and conversations:

```typescript
import { vi } from 'vitest';
import { createApp } from '../../src/server/index.js';
import type { Config } from '../../src/types.js';
import type { Services } from '../../src/mcp/server.js';
import type { AskPipeline } from '../../src/services/ask-pipeline.js';
import type { IntentRouter } from '../../src/services/intent-router.js';
import type { ConversationService } from '../../src/services/conversation.js';

const TEST_CONFIG: Config = {
  vaultPath: '/tmp/test-vault',
  contextDir: 'context',
  supabase: { url: 'http://localhost:54321', key: 'test-key' },
  ollama: { baseUrl: 'http://localhost:11434', model: 'test-model' },
  projects: {},
  server: {
    port: 0,
    apiToken: 'test-token-123',
  },
};

export function buildTestApp() {
  return createApp(TEST_CONFIG, {
    protectedRoutes: async (scoped) => {
      scoped.post('/test-protected', async () => {
        return { ok: true };
      });
    },
  });
}

interface MockOverrides {
  vaultWriteEntry?: ReturnType<typeof vi.fn>;
}

export function buildTestAppWithServices(overrides?: MockOverrides) {
  const mockServices: Services = {
    vault: {
      writeEntry: overrides?.vaultWriteEntry ?? vi.fn(() => '/vault/test/note.md'),
      readEntry: vi.fn(),
      listEntries: vi.fn(() => []),
      getEntryPath: vi.fn(() => '/vault/test/note.md'),
    } as unknown as Services['vault'],
    embeddings: {
      isAvailable: vi.fn(async () => false),
      embed: vi.fn(),
    } as unknown as Services['embeddings'],
    supabase: {
      upsertEntry: vi.fn(async () => {}),
    } as unknown as Services['supabase'],
    config: TEST_CONFIG,
  };

  return createApp(TEST_CONFIG, { services: mockServices });
}

interface AskMockOverrides {
  askFn?: ReturnType<typeof vi.fn>;
  intentFn?: ReturnType<typeof vi.fn>;
}

export function buildTestAppWithAsk(overrides?: AskMockOverrides) {
  const mockServices: Services = {
    vault: { writeEntry: vi.fn(), readEntry: vi.fn(), listEntries: vi.fn(() => []), getEntryPath: vi.fn() } as unknown as Services['vault'],
    embeddings: { isAvailable: vi.fn(async () => false), embed: vi.fn() } as unknown as Services['embeddings'],
    supabase: { upsertEntry: vi.fn(async () => {}), findTaskByTitle: vi.fn(async () => []) } as unknown as Services['supabase'],
    config: TEST_CONFIG,
  };

  const mockAskPipeline = {
    ask: overrides?.askFn ?? vi.fn(async () => ({
      answer: 'test answer',
      sources: [],
      route: 'brain',
      model: 'test-model',
    })),
  } as unknown as AskPipeline;

  const mockIntentRouter = {
    classify: overrides?.intentFn ?? vi.fn(async () => ({ intent: 'ask' })),
  } as unknown as IntentRouter;

  const mockConversations = {
    createConversation: vi.fn(async () => ({ id: 'conv-test-123', title: 'Test', createdAt: new Date(), updatedAt: new Date() })),
    addMessage: vi.fn(async () => ({ id: 'msg-1', conversationId: 'conv-test-123', role: 'user', content: '', metadata: {}, createdAt: new Date() })),
    getRecentMessages: vi.fn(async () => []),
    getMessages: vi.fn(async () => []),
    listConversations: vi.fn(async () => []),
    deleteConversation: vi.fn(async () => {}),
    getConversation: vi.fn(async () => null),
  } as unknown as ConversationService;

  return createApp(TEST_CONFIG, {
    services: mockServices,
    askPipeline: mockAskPipeline,
    intentRouter: mockIntentRouter,
    conversations: mockConversations,
  });
}
```

**Step 5: Update ask tests**

Update `tests/server/ask.test.ts` to include `conversation_id` in responses:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildTestAppWithAsk } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('POST /ask', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 200 with answer, sources, route, model, conversation_id for valid request', async () => {
    app = buildTestAppWithAsk();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      headers: { authorization: 'Bearer test-token-123' },
      payload: { text: 'What did I write about TypeScript?' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.answer).toBe('test answer');
    expect(body.sources).toEqual([]);
    expect(body.route).toBe('brain');
    expect(body.model).toBe('test-model');
    expect(body.conversation_id).toBe('conv-test-123');
  });

  it('returns 400 for empty body', async () => {
    app = buildTestAppWithAsk();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      headers: { authorization: 'Bearer test-token-123' },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid request body');
  });

  it('returns 400 for empty text string', async () => {
    app = buildTestAppWithAsk();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      headers: { authorization: 'Bearer test-token-123' },
      payload: { text: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth header', async () => {
    app = buildTestAppWithAsk();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/ask',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 500 when pipeline throws', async () => {
    app = buildTestAppWithAsk({
      askFn: vi.fn().mockRejectedValue(new Error('LLM exploded')),
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      headers: { authorization: 'Bearer test-token-123' },
      payload: { text: 'This will fail' },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Ask failed');
    expect(body.message).toContain('LLM exploded');
  });

  it('handles capture_task intent', async () => {
    app = buildTestAppWithAsk({
      intentFn: vi.fn(async () => ({
        intent: 'capture_task',
        title: 'Fix login bug',
        project: 'tesla',
        tags: ['bug'],
      })),
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/ask',
      headers: { authorization: 'Bearer test-token-123' },
      payload: { text: 'Capture a task to fix the login bug' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.answer).toContain('Fix login bug');
    expect(body.route).toBe('capture');
  });
});
```

**Step 6: Run tests**

Run: `cd /Users/jimi/Code/second-brain && npx vitest run`
Expected: All tests PASS

**Step 7: Commit**

```bash
cd /Users/jimi/Code/second-brain
git add src/server/routes/ask.ts src/server/index.ts src/services/ask-pipeline.ts tests/server/helpers.ts tests/server/ask.test.ts
git commit -m "feat: wire intent router and conversation history into ask route"
```

---

## Task 8: Add conversation API routes (list, messages, delete)

**Files:**
- Create: `src/server/routes/conversations.ts`
- Create: `tests/server/conversations.test.ts`

**Step 1: Write the failing tests**

Create `tests/server/conversations.test.ts`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildTestAppWithAsk } from './helpers.js';
import type { FastifyInstance } from 'fastify';

describe('Conversation routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET /conversations returns 200 with conversation list', async () => {
    app = buildTestAppWithAsk();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: { authorization: 'Bearer test-token-123' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.conversations).toEqual([]);
  });

  it('GET /conversations/:id/messages returns 200 with messages', async () => {
    app = buildTestAppWithAsk();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/conversations/conv-test-123/messages',
      headers: { authorization: 'Bearer test-token-123' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.messages).toEqual([]);
  });

  it('DELETE /conversations/:id returns 200', async () => {
    app = buildTestAppWithAsk();
    await app.ready();

    const res = await app.inject({
      method: 'DELETE',
      url: '/conversations/conv-test-123',
      headers: { authorization: 'Bearer test-token-123' },
    });

    expect(res.statusCode).toBe(200);
  });

  it('GET /conversations returns 401 without auth', async () => {
    app = buildTestAppWithAsk();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/conversations',
    });

    expect(res.statusCode).toBe(401);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/jimi/Code/second-brain && npx vitest run tests/server/conversations.test.ts`
Expected: FAIL — 404 (routes not registered)

**Step 3: Implement conversation routes**

Create `src/server/routes/conversations.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import type { ConversationService } from '../../services/conversation.js';

export async function conversationRoutes(
  app: FastifyInstance,
  opts: { conversations: ConversationService },
) {
  const { conversations } = opts;

  app.get('/conversations', async (_request, reply) => {
    const list = await conversations.listConversations();
    return reply.send({ conversations: list });
  });

  app.get<{ Params: { id: string } }>('/conversations/:id/messages', async (request, reply) => {
    const { id } = request.params;
    const messages = await conversations.getMessages(id);
    return reply.send({ messages });
  });

  app.delete<{ Params: { id: string } }>('/conversations/:id', async (request, reply) => {
    const { id } = request.params;
    await conversations.deleteConversation(id);
    return reply.send({ success: true });
  });
}
```

**Step 4: Register in server index**

In `src/server/index.ts`, add import:

```typescript
import { conversationRoutes } from './routes/conversations.js';
```

Inside the `protectedScope` function in `createApp`, after the ask routes registration, add:

```typescript
      await scoped.register(conversationRoutes, { conversations: conversationService });
```

**Step 5: Run tests**

Run: `cd /Users/jimi/Code/second-brain && npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
cd /Users/jimi/Code/second-brain
git add src/server/routes/conversations.ts src/server/index.ts tests/server/conversations.test.ts
git commit -m "feat: add conversation list, messages, and delete API routes"
```

---

## Task 9: Update iOS API models and client

**Files:**
- Modify: `ios/SecondBrain/Models/APIModels.swift:1-65`
- Modify: `ios/SecondBrain/Services/APIClient.swift:1-99`

**Step 1: Update API models**

Replace `ios/SecondBrain/Models/APIModels.swift`:

```swift
import Foundation

// MARK: - Request Types

struct AskRequest: Encodable {
    let text: String
    let conversation_id: String?
}

struct CaptureRequest: Encodable {
    let text: String
    let title: String?
    let type: String?
    let tags: [String]?
}

// MARK: - Response Types

struct AskSource: Decodable, Identifiable {
    let type: String?
    let url: String?
    let title: String?
    let path: String?

    var id: String { path ?? url ?? title ?? UUID().uuidString }
}

struct AskResponse: Decodable {
    let answer: String
    let sources: [AskSource]?
    let route: String?
    let model: String?
    let conversation_id: String?
}

struct CaptureResponse: Decodable {
    let success: Bool
    let title: String?
    let vaultPath: String?
}

// MARK: - Conversation Types

struct ConversationSummary: Decodable, Identifiable {
    let id: String
    let title: String?
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    // Custom decoding to handle ISO 8601 dates
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        let createdStr = try container.decode(String.self, forKey: .createdAt)
        let updatedStr = try container.decode(String.self, forKey: .updatedAt)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        createdAt = formatter.date(from: createdStr) ?? Date()
        updatedAt = formatter.date(from: updatedStr) ?? Date()
    }
}

struct ConversationsResponse: Decodable {
    let conversations: [ConversationSummary]
}

struct ChatMessage: Decodable, Identifiable {
    let id: String
    let conversationId: String
    let role: String
    let content: String
    let metadata: [String: AnyCodable]?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, role, content, metadata
        case conversationId = "conversation_id"
        case createdAt = "created_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        conversationId = try container.decode(String.self, forKey: .conversationId)
        role = try container.decode(String.self, forKey: .role)
        content = try container.decode(String.self, forKey: .content)
        metadata = try container.decodeIfPresent([String: AnyCodable].self, forKey: .metadata)
        let createdStr = try container.decode(String.self, forKey: .createdAt)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        createdAt = formatter.date(from: createdStr) ?? Date()
    }

    /// Local-only initializer for optimistic UI updates
    init(id: String = UUID().uuidString, conversationId: String, role: String, content: String, createdAt: Date = Date()) {
        self.id = id
        self.conversationId = conversationId
        self.role = role
        self.content = content
        self.metadata = nil
        self.createdAt = createdAt
    }
}

struct MessagesResponse: Decodable {
    let messages: [ChatMessage]
}

/// Type-erased Codable wrapper for JSON values
struct AnyCodable: Decodable {
    let value: Any

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) { value = str }
        else if let int = try? container.decode(Int.self) { value = int }
        else if let double = try? container.decode(Double.self) { value = double }
        else if let bool = try? container.decode(Bool.self) { value = bool }
        else { value = "" }
    }
}

// MARK: - Error Types

struct APIErrorResponse: Decodable {
    let error: String
    let message: String?
}

enum APIError: Error, LocalizedError {
    case requestFailed(statusCode: Int, message: String)
    case networkError(Error)
    case decodingError(Error)
    case serverUnreachable

    var errorDescription: String? {
        switch self {
        case .requestFailed(let statusCode, let message):
            return "Request failed (\(statusCode)): \(message)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Failed to parse response: \(error.localizedDescription)"
        case .serverUnreachable:
            return "Cannot reach the server. Check your network connection and Tailscale status."
        }
    }
}
```

**Step 2: Update APIClient with new methods**

Add these methods to `APIClient` in `ios/SecondBrain/Services/APIClient.swift`, after the existing `capture` method (line 42):

```swift
    func listConversations() async throws -> [ConversationSummary] {
        let response: ConversationsResponse = try await performRequest(method: "GET", path: "/conversations")
        return response.conversations
    }

    func getMessages(conversationId: String) async throws -> [ChatMessage] {
        let response: MessagesResponse = try await performRequest(method: "GET", path: "/conversations/\(conversationId)/messages")
        return response.messages
    }

    func deleteConversation(id: String) async throws {
        let _: [String: Bool] = try await performRequest(method: "DELETE", path: "/conversations/\(id)")
    }
```

Also update the `ask` method to accept an optional `conversationId`:

```swift
    func ask(text: String, conversationId: String? = nil) async throws -> AskResponse {
        try await performRequest(method: "POST", path: "/ask", body: AskRequest(text: text, conversation_id: conversationId))
    }
```

Add a `performRequest` overload for GET requests (no body). Add after the existing `performRequest` at line 46:

```swift
    private func performRequest<Response: Decodable>(
        method: String,
        path: String
    ) async throws -> Response {
        let url = URL(string: path, relativeTo: baseURL)!
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = AppConfig.requestTimeout

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch let urlError as URLError {
            if urlError.code == .timedOut ||
               urlError.code == .cannotConnectToHost ||
               urlError.code == .cannotFindHost ||
               urlError.code == .networkConnectionLost {
                throw APIError.serverUnreachable
            }
            throw APIError.networkError(urlError)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverUnreachable
        }

        guard httpResponse.statusCode == 200 else {
            let message: String
            if let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
                message = errorResponse.message ?? errorResponse.error
            } else {
                message = "HTTP \(httpResponse.statusCode)"
            }
            throw APIError.requestFailed(statusCode: httpResponse.statusCode, message: message)
        }

        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            let raw = String(data: data, encoding: .utf8) ?? "non-utf8"
            print("[APIClient] Decode failed. Raw response: \(raw.prefix(500))")
            print("[APIClient] Decode error: \(error)")
            throw APIError.decodingError(error)
        }
    }
```

**Step 3: Build and verify**

Open Xcode, build (Cmd+B). No errors expected.

**Step 4: Commit**

```bash
cd /Users/jimi/Code/second-brain
git add ios/SecondBrain/Models/APIModels.swift ios/SecondBrain/Services/APIClient.swift
git commit -m "feat(ios): add conversation models and API client methods"
```

---

## Task 10: Refactor iOS ViewModel for conversations

**Files:**
- Modify: `ios/SecondBrain/ViewModels/AppViewModel.swift`

This refactors AppViewModel to manage conversations: track current conversation ID, maintain a messages array for chat bubbles, and support switching conversations.

**Step 1: Rewrite AppViewModel**

Replace `ios/SecondBrain/ViewModels/AppViewModel.swift` entirely:

```swift
import Foundation
import Observation

@Observable
@MainActor
class AppViewModel {
    // MARK: - Published State

    /// Editable transcription text (bound to TextEditor)
    var transcription: String = ""

    /// Chat messages for current conversation
    var messages: [ChatMessage] = []

    /// Whether TTS readback is enabled
    var isTTSEnabled: Bool = false

    /// Sources from the last API response
    var currentSources: [AskSource] = []

    /// Vault sources filtered from currentSources
    var vaultSources: [AskSource] { currentSources.filter { $0.type == "vault" } }

    /// Whether TTS is actively speaking
    var isSpeaking: Bool { speechService.isSpeaking }

    /// Whether the mic is actively recording
    var isRecording: Bool = false

    /// Whether WhisperKit is transcribing audio to text
    var isTranscribing: Bool = false

    /// Whether an API request is in flight
    var isLoading: Bool = false

    /// User-visible error message
    var error: String? = nil

    /// Whether WhisperKit has finished downloading and loading the model
    var isWhisperReady: Bool = false

    /// Setup message shown while WhisperKit loads
    var setupMessage: String? = nil

    /// Current conversation ID (nil = no active conversation)
    var currentConversationId: String? = nil

    /// List of conversations for the conversation list screen
    var conversations: [ConversationSummary] = []

    /// Whether we're loading the conversation list
    var isLoadingConversations: Bool = false

    // MARK: - Private

    private let apiClient: APIClient
    private let recorder: AudioRecorder
    private let transcriber: TranscriptionService
    private let speechService = SpeechService()
    private var currentRequestTask: Task<Void, Never>?

    // MARK: - Init

    init(
        apiClient: APIClient = APIClient(),
        recorder: AudioRecorder = AudioRecorder(),
        transcriber: TranscriptionService = TranscriptionService()
    ) {
        self.apiClient = apiClient
        self.recorder = recorder
        self.transcriber = transcriber
    }

    // MARK: - WhisperKit Initialization

    func initializeWhisper() async {
        setupMessage = "Loading speech model..."
        do {
            try await transcriber.initialize()
            isWhisperReady = true
            setupMessage = nil
        } catch {
            setupMessage = nil
            self.error = "Voice unavailable: \(error.localizedDescription)"
        }
    }

    // MARK: - Recording

    func startRecording() {
        speechService.stop()
        guard isWhisperReady, !isRecording else { return }
        error = nil
        do {
            _ = try recorder.startRecording()
            isRecording = true
        } catch {
            self.error = "Failed to start recording: \(error.localizedDescription)"
        }
    }

    func stopRecording() {
        guard isRecording else { return }
        isRecording = false
        guard let url = recorder.stopRecording() else { return }
        isTranscribing = true
        Task {
            do {
                transcription = try await transcriber.transcribe(audioURL: url)
            } catch {
                self.error = "Transcription failed: \(error.localizedDescription)"
            }
            isTranscribing = false
        }
    }

    // MARK: - API

    func sendQuestion() {
        let trimmed = transcription.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isLoading = true
        error = nil
        speechService.stop()

        // Optimistic: show user message immediately
        let userMsg = ChatMessage(
            conversationId: currentConversationId ?? "pending",
            role: "user",
            content: trimmed
        )
        messages.append(userMsg)
        transcription = ""

        currentRequestTask = Task {
            do {
                let response = try await apiClient.ask(text: trimmed, conversationId: currentConversationId)
                guard !Task.isCancelled else { return }

                // Update conversation ID
                if let convId = response.conversation_id {
                    currentConversationId = convId
                }

                currentSources = response.sources ?? []

                // Add assistant message
                let assistantMsg = ChatMessage(
                    conversationId: currentConversationId ?? "",
                    role: "assistant",
                    content: response.answer
                )
                messages.append(assistantMsg)

                if isTTSEnabled {
                    speechService.speak(response.answer)
                }
            } catch {
                guard !Task.isCancelled else { return }
                self.error = error.localizedDescription
                // Remove optimistic user message on error
                if messages.last?.role == "user" {
                    messages.removeLast()
                }
            }
            isLoading = false
        }
    }

    func cancelRequest() {
        currentRequestTask?.cancel()
        currentRequestTask = nil
        isLoading = false
    }

    func retry() {
        sendQuestion()
    }

    // MARK: - TTS

    func toggleTTS() {
        if speechService.isSpeaking {
            speechService.stop()
            return
        }
        isTTSEnabled.toggle()
        if isTTSEnabled, let lastAssistant = messages.last(where: { $0.role == "assistant" }) {
            speechService.speak(lastAssistant.content)
        }
    }

    // MARK: - Conversations

    func loadConversations() async {
        isLoadingConversations = true
        do {
            conversations = try await apiClient.listConversations()
        } catch {
            self.error = "Failed to load conversations: \(error.localizedDescription)"
        }
        isLoadingConversations = false
    }

    func openConversation(_ conversation: ConversationSummary) async {
        currentConversationId = conversation.id
        messages = []
        isLoading = true
        do {
            messages = try await apiClient.getMessages(conversationId: conversation.id)
        } catch {
            self.error = "Failed to load messages: \(error.localizedDescription)"
        }
        isLoading = false
    }

    func startNewConversation() {
        currentConversationId = nil
        messages = []
        currentSources = []
        error = nil
        transcription = ""
        speechService.stop()
    }

    func deleteConversation(_ conversation: ConversationSummary) async {
        do {
            try await apiClient.deleteConversation(id: conversation.id)
            conversations.removeAll { $0.id == conversation.id }
            if currentConversationId == conversation.id {
                startNewConversation()
            }
        } catch {
            self.error = "Failed to delete conversation: \(error.localizedDescription)"
        }
    }
}
```

**Step 2: Build and verify**

Open Xcode, build (Cmd+B). Expect compile errors in ContentView since it references `viewModel.answer` which no longer exists. We'll fix that in the next task.

**Step 3: Commit (will have compile errors until Task 11)**

```bash
cd /Users/jimi/Code/second-brain
git add ios/SecondBrain/ViewModels/AppViewModel.swift
git commit -m "feat(ios): refactor AppViewModel for conversation support"
```

---

## Task 11: Build chat bubble UI and conversation list (iOS)

**Files:**
- Create: `ios/SecondBrain/Views/ChatBubbleView.swift`
- Create: `ios/SecondBrain/Views/ConversationListView.swift`
- Modify: `ios/SecondBrain/Views/ContentView.swift`

**Step 1: Create ChatBubbleView**

Create `ios/SecondBrain/Views/ChatBubbleView.swift`:

```swift
import SwiftUI

struct ChatBubbleView: View {
    let message: ChatMessage
    let sources: [AskSource]

    var isUser: Bool { message.role == "user" }

    var body: some View {
        HStack {
            if isUser { Spacer(minLength: 60) }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .textSelection(.enabled)
                    .padding(12)
                    .background(isUser ? Color.blue : Color(.systemGray5))
                    .foregroundColor(isUser ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                // Source attribution for assistant messages
                if !isUser && !sources.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(sources) { source in
                            HStack(spacing: 4) {
                                Image(systemName: "doc.text")
                                Text(source.title ?? source.path ?? "Unknown")
                            }
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        }
                    }
                    .padding(.horizontal, 4)
                }
            }

            if !isUser { Spacer(minLength: 60) }
        }
    }
}
```

**Step 2: Create ConversationListView**

Create `ios/SecondBrain/Views/ConversationListView.swift`:

```swift
import SwiftUI

struct ConversationListView: View {
    @Bindable var viewModel: AppViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoadingConversations {
                    ProgressView("Loading...")
                } else if viewModel.conversations.isEmpty {
                    ContentUnavailableView(
                        "No Conversations",
                        systemImage: "bubble.left.and.bubble.right",
                        description: Text("Start a new conversation to get going.")
                    )
                } else {
                    List {
                        ForEach(viewModel.conversations) { conversation in
                            Button {
                                Task {
                                    await viewModel.openConversation(conversation)
                                    dismiss()
                                }
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(conversation.title ?? "Untitled")
                                        .font(.body)
                                        .foregroundColor(.primary)
                                        .lineLimit(1)
                                    Text(conversation.updatedAt, style: .relative)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                        .onDelete { indexSet in
                            for index in indexSet {
                                let conversation = viewModel.conversations[index]
                                Task { await viewModel.deleteConversation(conversation) }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Conversations")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        viewModel.startNewConversation()
                        dismiss()
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .task {
                await viewModel.loadConversations()
            }
        }
    }
}
```

**Step 3: Rewrite ContentView with chat bubbles**

Replace `ios/SecondBrain/Views/ContentView.swift`:

```swift
import SwiftUI

struct ContentView: View {
    @State private var viewModel = AppViewModel()
    @FocusState private var isEditorFocused: Bool
    @State private var showConversationList = false

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Button {
                    showConversationList = true
                } label: {
                    Image(systemName: "list.bullet")
                        .font(.title3)
                }

                Spacer()

                Text(viewModel.currentConversationId != nil ? "Conversation" : "New Chat")
                    .font(.headline)

                Spacer()

                Button {
                    viewModel.toggleTTS()
                } label: {
                    Image(systemName: viewModel.isTTSEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                        .font(.title3)
                        .foregroundColor(viewModel.isTTSEnabled ? .blue : .secondary)
                }

                Button {
                    viewModel.startNewConversation()
                } label: {
                    Image(systemName: "plus.bubble")
                        .font(.title3)
                }
            }
            .padding(.horizontal)
            .padding(.top, 8)
            .padding(.bottom, 4)

            // Setup message (WhisperKit model download)
            if let setupMessage = viewModel.setupMessage {
                HStack(spacing: 8) {
                    ProgressView()
                    Text(setupMessage)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 8)
            }

            // Chat messages area
            ScrollViewReader { proxy in
                ScrollView {
                    if viewModel.messages.isEmpty && !viewModel.isLoading {
                        Text("Ask a question or record a voice note")
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 80)
                    } else {
                        LazyVStack(spacing: 8) {
                            ForEach(viewModel.messages) { message in
                                ChatBubbleView(
                                    message: message,
                                    sources: message.role == "assistant" && message == viewModel.messages.last(where: { $0.role == "assistant" })
                                        ? viewModel.vaultSources
                                        : []
                                )
                                .id(message.id)
                            }

                            if viewModel.isLoading {
                                HStack {
                                    ProgressView()
                                    Text("Thinking...")
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                    Spacer()
                                }
                                .padding(.horizontal)
                                .id("loading")
                            }
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 8)
                    }
                }
                .onChange(of: viewModel.messages.count) {
                    if let lastId = viewModel.messages.last?.id {
                        withAnimation {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
                .onChange(of: viewModel.isLoading) {
                    if viewModel.isLoading {
                        withAnimation {
                            proxy.scrollTo("loading", anchor: .bottom)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)

            // Error area
            if let errorMessage = viewModel.error {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.red)
                    Text(errorMessage)
                        .font(.subheadline)
                        .foregroundColor(.red)
                    Spacer()
                    Button("Retry") {
                        viewModel.sendQuestion()
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
            }

            // Transcribing indicator
            if viewModel.isTranscribing {
                ProgressView("Transcribing...")
                    .padding(.vertical, 8)
            }

            Divider()
                .padding(.top, 8)

            // Input area
            HStack(alignment: .bottom, spacing: 12) {
                RecordButton(
                    isRecording: viewModel.isRecording,
                    isDisabled: !viewModel.isWhisperReady,
                    onStart: { viewModel.startRecording() },
                    onStop: { viewModel.stopRecording() }
                )
                .frame(width: 56, height: 56)

                VStack(spacing: 6) {
                    ZStack(alignment: .topLeading) {
                        TextEditor(text: $viewModel.transcription)
                            .focused($isEditorFocused)
                            .frame(minHeight: 40, maxHeight: 80)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color(.systemGray4), lineWidth: 1)
                            )
                            .overlay(alignment: .topTrailing) {
                                if !viewModel.transcription.isEmpty {
                                    Button {
                                        viewModel.transcription = ""
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundColor(.secondary)
                                    }
                                    .padding(8)
                                }
                            }
                        if viewModel.transcription.isEmpty {
                            Text("Ask anything...")
                                .foregroundColor(Color(.placeholderText))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 12)
                                .allowsHitTesting(false)
                        }
                    }

                    if viewModel.isLoading {
                        Button {
                            viewModel.cancelRequest()
                        } label: {
                            Label("Stop", systemImage: "stop.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.red)
                    } else {
                        Button {
                            isEditorFocused = false
                            viewModel.sendQuestion()
                        } label: {
                            Text("Send")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(
                            viewModel.transcription
                                .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        )
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 12)
        }
        .onTapGesture {
            isEditorFocused = false
        }
        .sheet(isPresented: $showConversationList) {
            ConversationListView(viewModel: viewModel)
        }
        .task {
            await viewModel.initializeWhisper()
        }
    }
}
```

Note: The `ChatMessage` equality check on line with `message == viewModel.messages.last(where:)` requires `ChatMessage` to be `Equatable`. Add `Equatable` conformance. In `APIModels.swift`, update the `ChatMessage` struct declaration:

```swift
struct ChatMessage: Decodable, Identifiable, Equatable {
```

And add at the bottom of the struct:

```swift
    static func == (lhs: ChatMessage, rhs: ChatMessage) -> Bool {
        lhs.id == rhs.id
    }
```

**Step 4: Build and verify**

Open Xcode, build (Cmd+B). All compile errors should be resolved.

**Step 5: Manual test**

1. Launch app — should show "New Chat" header with conversation list button
2. Type and send a message — shows as blue bubble on right
3. Response appears as gray bubble on left
4. Tap list icon — shows conversation list (empty initially, then shows the conversation)
5. Tap + bubble icon — starts new conversation, clears messages
6. X button clears text input
7. Stop button cancels in-flight requests
8. Speaker button stops TTS without disabling it

**Step 6: Commit**

```bash
cd /Users/jimi/Code/second-brain
git add ios/SecondBrain/Views/ChatBubbleView.swift ios/SecondBrain/Views/ConversationListView.swift ios/SecondBrain/Views/ContentView.swift ios/SecondBrain/Models/APIModels.swift
git commit -m "feat(ios): chat bubble UI with conversation list and history"
```

---

## Task 12: Build, run full test suite, and smoke test

**Step 1: Build the server**

Run: `cd /Users/jimi/Code/second-brain && npm run build`
Expected: Clean build, no TypeScript errors

**Step 2: Run full test suite**

Run: `cd /Users/jimi/Code/second-brain && npx vitest run`
Expected: All tests PASS

**Step 3: Build iOS in Xcode**

Open Xcode, build (Cmd+B). No errors expected.

**Step 4: Apply Supabase migration**

Run the SQL from Task 3 in the Supabase dashboard SQL editor.

**Step 5: Restart the server**

```bash
# Restart the launchd service or run directly:
cd /Users/jimi/Code/second-brain && npm run build && node dist/server/index.js
```

**Step 6: End-to-end smoke test on iPhone**

1. Open iOS app
2. Ask "What projects have I been working on?" — should get conversational answer in chat bubble
3. Follow up: "Tell me more about the most recent one" — should use conversation context
4. Tap conversation list — should show the conversation
5. Start new conversation
6. Say "Capture a task to review the API error handling" — should confirm task captured
7. Say "Update the API error handling task to mention we also need retry logic" — should confirm updated
8. Say "Remind me to check the deployment tomorrow at 9am" — should set reminder
9. Test TTS: enable it, get a response, tap speaker to stop — should stop without disabling
10. Test cancel: send a question, tap Stop — should cancel cleanly

**Step 7: Final commit if any adjustments needed**

```bash
cd /Users/jimi/Code/second-brain
git add -A
git commit -m "chore: final adjustments from smoke testing"
```
