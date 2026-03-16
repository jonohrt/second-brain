import type { ChatService, ChatMessage } from './ollama-chat.js';

export type Intent = 'ask' | 'reminder' | 'capture_task' | 'update_task' | 'delete_task' | 'update_reminder' | 'delete_reminder' | 'list_reminders' | 'capture_note' | 'edit_note' | 'delete_note' | 'search_notes' | 'list_tasks' | 'send_message';

export interface IntentResult {
  intent: Intent;
  title?: string;
  content?: string;
  project?: string;
  exclude_project?: string;
  tags?: string[];
  update_query?: string;
  new_description?: string;
  new_title?: string;
  reminder_time?: string;
  recipient?: string;
  message_body?: string;
  list_name?: string;
}

const VALID_INTENTS: Intent[] = ['ask', 'reminder', 'capture_task', 'update_task', 'delete_task', 'update_reminder', 'delete_reminder', 'list_reminders', 'capture_note', 'edit_note', 'delete_note', 'search_notes', 'list_tasks', 'send_message'];

const CLASSIFY_SYSTEM_PROMPT = `You are an intent classifier for a personal productivity assistant. Classify the user's message into exactly one intent and extract relevant fields.

IMPORTANT: When the user is telling you a fact to store or remember, that is ALWAYS "capture_note" — never "ask". The "ask" intent is ONLY for questions or lookups where the user wants information back.

Valid intents:
- "ask": General questions or knowledge lookups where the user wants an answer. ONLY use this when the user is asking a question, NOT when they are telling you something to remember.
- "reminder": Setting a new reminder (e.g. "remind me to...", "set a reminder for...", "remind me in 5 minutes...")
- "capture_task": Creating a new task or todo (e.g. "add a task to...", "create a todo...", "I need to...")
- "update_task": Modifying an existing task (e.g. "change the task...", "update the todo...")
- "delete_task": Deleting/removing a task (e.g. "delete the task...", "remove the todo...", "cancel the task...")
- "update_reminder": Modifying an existing reminder (e.g. "reschedule my reminder...", "change the reminder...")
- "delete_reminder": Deleting/removing a reminder (e.g. "delete my reminder about...", "remove the reminder for...", "cancel the reminder...")
- "list_reminders": Listing current reminders (e.g. "show my reminders", "what reminders do I have?", "list reminders")
- "capture_note": Saving or remembering a piece of information. Use this whenever the user states a fact, gives you info to store, or tells you something to remember. Examples: "remember that...", "note that...", "save a note...", "the wifi password is...", "my garage code is 4521", "John's birthday is March 5th", "the spare key is under the mat"
- "edit_note": Editing/updating an existing note (e.g. "edit my note about...", "update the note on...", "change my note about...")
- "delete_note": Deleting/removing a note (e.g. "delete my note about...", "remove the note on...")
- "search_notes": Searching or finding notes (e.g. "find my notes about...", "search notes for...", "what did I note about...")
- "list_tasks": Listing current tasks/todos (e.g. "show my tasks", "what are my todos?"). Use "project" to filter to a specific project, or "exclude_project" to exclude tasks from a project (e.g. "show my personal tasks" → exclude_project: "work")
- "send_message": Sending a message to someone (e.g. "send a message to...", "text John...", "message John saying...", "message John, hey!")

Respond with JSON only. Include only the fields that are clearly present in the message.

Schema:
{
  "intent": one of the valid intents above,
  "title": extracted title or summary (for tasks, notes, reminders),
  "content": full description if different from title,
  "project": project name if mentioned,
  "tags": array of tags if mentioned,
  "update_query": what to search for when updating/editing/deleting an existing item,
  "new_description": new description for an update,
  "new_title": new title for an update,
  "reminder_time": date/time in ISO 8601 format,
  "recipient": contact name or phone number for messages,
  "message_body": the message text to send,
  "exclude_project": project name to exclude from list (e.g. "work" when user asks for personal tasks),
  "list_name": specific reminder list name (for list_reminders),
  "query": the search query if intent is "ask"
}

Today's date is ${new Date().toISOString().slice(0, 10)}.`;

// Keyword signals used both as fallback (when LLM fails) and as validation
// (to override LLM when it misclassifies an action as "ask")
const KEYWORD_SIGNALS: Array<{ intent: Intent; keywords: RegExp }> = [
  { intent: 'list_tasks', keywords: /\b(list|show|display|view)\b.*\b(tasks?|todos?)\b/i },
  { intent: 'list_reminders', keywords: /\b(list|show|display|view)\b.*\b(reminders?|alarms?)\b/i },
  { intent: 'delete_reminder', keywords: /\b(delete|remove|cancel)\b.*\b(reminder|alarm)\b/i },
  { intent: 'delete_note', keywords: /\b(delete|remove)\b.*\b(note|learned|entry)\b/i },
  { intent: 'edit_note', keywords: /\b(edit|update|change|modify)\b.*\b(note|learned|entry)\b/i },
  { intent: 'search_notes', keywords: /\b(search|find|look\s*up)\b.*\b(notes?|learned|entries)\b/i },
  { intent: 'update_reminder', keywords: /\b(change|update|modify|reschedule)\b.*\b(reminder|alarm)\b/i },
  { intent: 'delete_task', keywords: /\b(delete|remove|cancel|complete|finish|done)\b.*\b(task|todo)\b/i },
  { intent: 'update_task', keywords: /\b(change|update|modify|edit)\b.*\b(task|todo)\b/i },
  { intent: 'capture_task', keywords: /\b(capture|add|create|make|new)\b.*\b(task|todo)\b/i },
  { intent: 'reminder', keywords: /\b(remind\s+me|set\s+a?\s*reminder|create\s+a?\s*reminder)\b/i },
  { intent: 'send_message', keywords: /\b(send|text)\b.*\b(to|message)\b|\bmessage\b\s+\w/i },
  { intent: 'capture_note', keywords: /\b(remember\s+that|save\s+a?\s*note|note\s+that|the\s+\w+\s+(password|code|key|number|address|pin)\s+(is|are)\b)/i },
];

export class IntentRouter {
  constructor(private chatService: ChatService) {}

  private keywordMatch(text: string): Intent | null {
    for (const { intent, keywords } of KEYWORD_SIGNALS) {
      if (keywords.test(text)) {
        return intent;
      }
    }
    return null;
  }

  private fallbackClassify(text: string): IntentResult {
    const matched = this.keywordMatch(text);
    return { intent: matched ?? 'ask', title: text.slice(0, 60) };
  }

  async classify(text: string, conversationHistory: Array<{ role: string; content: string }>): Promise<IntentResult> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
      ];

      // Include last 6 messages of conversation history for context
      if (conversationHistory.length > 0) {
        const recent = conversationHistory.slice(-6);
        const historyText = recent
          .map(m => `${m.role}: ${m.content}`)
          .join('\n');
        messages.push({
          role: 'system',
          content: `Recent conversation history:\n${historyText}`,
        });
      }

      messages.push({ role: 'user', content: text });

      const result = await this.chatService.chatWithFallback(messages, 'json');
      const parsed = JSON.parse(result.content);

      // Validate intent
      let intent: Intent = VALID_INTENTS.includes(parsed.intent) ? parsed.intent : 'ask';

      // Keyword override: if the LLM said "ask" but keywords strongly match
      // a specific action intent, trust the keywords
      if (intent === 'ask') {
        const keywordIntent = this.keywordMatch(text);
        if (keywordIntent) {
          console.log(`[intent] keyword override: LLM said "ask" but keywords matched "${keywordIntent}"`);
          intent = keywordIntent;
        }
      }

      // Build result, only including fields that are present
      const intentResult: IntentResult = { intent };
      if (parsed.title) intentResult.title = parsed.title;
      if (parsed.content) intentResult.content = parsed.content;
      if (parsed.project) intentResult.project = parsed.project;
      if (Array.isArray(parsed.tags) && parsed.tags.length > 0) intentResult.tags = parsed.tags;
      if (parsed.update_query) intentResult.update_query = parsed.update_query;
      if (parsed.new_description) intentResult.new_description = parsed.new_description;
      if (parsed.new_title) intentResult.new_title = parsed.new_title;
      if (parsed.reminder_time) intentResult.reminder_time = parsed.reminder_time;
      if (parsed.recipient) intentResult.recipient = parsed.recipient;
      if (parsed.message_body) intentResult.message_body = parsed.message_body;
      if (parsed.exclude_project) intentResult.exclude_project = parsed.exclude_project;
      if (parsed.list_name) intentResult.list_name = parsed.list_name;

      return intentResult;
    } catch {
      // LLM call failed — fall back to keyword matching
      return this.fallbackClassify(text);
    }
  }
}
