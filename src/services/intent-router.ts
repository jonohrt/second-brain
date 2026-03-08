import type { ChatService, ChatMessage } from './ollama-chat.js';

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

// Regex patterns for intent detection — ordered by specificity (most specific first)
const INTENT_PATTERNS: Array<{ intent: Intent; pattern: RegExp }> = [
  { intent: 'list_tasks', pattern: /\b(list|show|what(?:'s| are| do i have)|display|view)\b.*\b(tasks?|todos?|to-dos?)\b/i },
  { intent: 'update_reminder', pattern: /\b(change|update|modify|reschedule|move|push)\b.*\b(reminder|alarm|alert)\b/i },
  { intent: 'update_task', pattern: /\b(change|update|modify|edit)\b.*\b(task|todo|to-do)\b/i },
  { intent: 'capture_task', pattern: /\b(capture|add|create|make|new)\b.*\b(task|todo|to-do)\b/i },
  { intent: 'reminder', pattern: /\b(remind\s+me|set\s+a?\s*reminder|reminder\s+(for|to|at|on))\b/i },
  { intent: 'capture_note', pattern: /\b(remember\s+that|save\s+(this|that|a\s+note)|note\s+that|don'?t\s+forget)\b/i },
];

const EXTRACT_SYSTEM_PROMPT = `You extract structured data from a user message that has already been classified as a specific intent. Extract the relevant fields as JSON.

For "capture_task": extract title, content (full description), project (if mentioned), tags
For "reminder": extract title, reminder_time (ISO 8601 datetime)
For "update_task": extract update_query (what task to find), new_description, new_title
For "update_reminder": extract update_query (what reminder to find), new_title, reminder_time (ISO 8601)
For "capture_note": extract title, content, tags

Reply with JSON only. Only include fields that are clearly present in the message.
Today's date is ${new Date().toISOString().slice(0, 10)}.`;

export class IntentRouter {
  constructor(private chatService: ChatService) {}

  private extractFallback(intent: Intent, text: string): Partial<IntentResult> {
    // Strip common prefixes to get the actual content
    const stripped = text
      .replace(/^(capture|add|create|make|new|set|remind\s+me|remember\s+that|save|note\s+that|update|change|modify|edit)\s+(a\s+)?(task|todo|to-do|reminder|note)\s+(to|for|about|that)?\s*/i, '')
      .trim();
    const title = stripped || text.slice(0, 60);

    // Try to extract "on the X project" or "on project X"
    const projectMatch = text.match(/\b(?:on|for|in)\s+(?:the\s+)?(\w+)\s+project\b/i)
      ?? text.match(/\bproject\s+(\w+)\b/i);
    const project = projectMatch?.[1];

    return { title, project };
  }

  async classify(text: string, conversationHistory: Array<{ role: string; content: string }>): Promise<IntentResult> {
    // Detect intent via regex patterns
    let detectedIntent: Intent = 'ask';
    for (const { intent, pattern } of INTENT_PATTERNS) {
      if (pattern.test(text)) {
        detectedIntent = intent;
        break;
      }
    }

    // For simple intents, no extraction needed
    if (detectedIntent === 'ask' || detectedIntent === 'list_tasks') {
      return { intent: detectedIntent };
    }

    // Use LLM only for field extraction (not classification)
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
      ];

      if (conversationHistory.length > 0) {
        const historyText = conversationHistory
          .slice(-6)
          .map(m => `${m.role}: ${m.content}`)
          .join('\n');
        messages.push({
          role: 'system',
          content: `Conversation history:\n${historyText}`,
        });
      }

      messages.push({ role: 'user', content: `Intent: ${detectedIntent}\nMessage: ${text}` });

      const result = await this.chatService.chatWithFallback(messages, 'json');
      const parsed = JSON.parse(result.content);

      // If LLM didn't extract a title, use regex fallback
      if (!parsed.title) {
        const fallback = this.extractFallback(detectedIntent, text);
        return { intent: detectedIntent, ...fallback, ...parsed, title: parsed.title || fallback.title };
      }

      return { intent: detectedIntent, ...parsed };
    } catch {
      // Extraction failed — strip command prefix to get the actual content
      return { intent: detectedIntent, ...this.extractFallback(detectedIntent, text) };
    }
  }
}
