import type { OllamaChatService, ChatMessage } from './ollama-chat.js';

export type Intent = 'ask' | 'reminder' | 'capture_task' | 'update_task' | 'update_reminder' | 'capture_note' | 'list_tasks';

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

const VALID_INTENTS: Intent[] = ['ask', 'reminder', 'capture_task', 'update_task', 'update_reminder', 'capture_note', 'list_tasks'];

const INTENT_SYSTEM_PROMPT = `You are an intent classifier for a personal knowledge system. Classify the user's message into exactly one intent and extract structured data.

Intents:
- "ask": A question or conversational message (default)
- "reminder": User wants to create a new reminder (contains phrases like "remind me", "set a reminder")
- "capture_task": User wants to capture/create a new task or TODO (contains phrases like "capture a task", "add a task", "create a task", "add a todo")
- "update_task": User wants to modify an existing task (contains phrases like "update the task", "change the task", "modify the task")
- "update_reminder": User wants to modify an existing reminder (contains phrases like "change my reminder", "update the reminder", "reschedule")
- "capture_note": User wants to save a note or learning (contains phrases like "remember that", "save this", "note that", "don't forget")
- "list_tasks": User wants to see/list their tasks or TODOs (contains phrases like "list my tasks", "show my tasks", "what are my tasks", "what's on my todo", "open tasks")

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

  private static LIST_TASKS_PATTERN = /\b(list|show|what(?:'s| are| do i have)|display|view)\b.*\b(tasks?|todos?|to-dos?)\b/i;

  async classify(text: string, conversationHistory: Array<{ role: string; content: string }>): Promise<IntentResult> {
    // Fast-path: list_tasks is unambiguous and LLMs misclassify it
    if (IntentRouter.LIST_TASKS_PATTERN.test(text)) {
      return { intent: 'list_tasks' };
    }

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
