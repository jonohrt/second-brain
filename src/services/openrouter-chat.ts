import type { ChatMessage, ChatResult, ChatService } from './ollama-chat.js';

export class OpenRouterChatService implements ChatService {
  constructor(
    private apiKey: string,
    private model: string,
    private timeout: number = 120000,
  ) {}

  async chat(opts: {
    model?: string;
    messages: ChatMessage[];
    format?: string | object;
  }): Promise<ChatResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    const model = opts.model ?? this.model;

    try {
      const body: Record<string, unknown> = {
        model,
        messages: opts.messages,
      };

      if (opts.format === 'json') {
        body.response_format = { type: 'json_object' };
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`OpenRouter chat failed: ${response.status} ${response.statusText} ${text}`);
      }

      const data = await response.json();
      return {
        content: data.choices[0].message.content,
        model: data.model ?? model,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async chatWithFallback(
    messages: ChatMessage[],
    format?: string | object,
  ): Promise<ChatResult> {
    return this.chat({ messages, format });
  }

  async classify(question: string): Promise<'brain' | 'web' | 'both'> {
    return 'both';
  }
}
