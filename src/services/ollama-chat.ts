export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatResult {
  content: string;
  model: string;
}

export type Route = 'brain' | 'web' | 'both';

const VALID_ROUTES: Route[] = ['brain', 'web', 'both'];

const ROUTING_SYSTEM_PROMPT = `You are a question router. Classify the user's question into one category.
Reply with JSON: { "route": "brain" | "web" | "both" }

- "brain": Questions about the user's personal notes, projects, decisions, learnings
- "web": General knowledge questions, current events, how-to questions not about personal content
- "both": Questions that benefit from both personal context and web information`;

export class OllamaChatService {
  constructor(
    private baseUrl: string,
    private cloudModel: string,
    private localModel: string,
    private timeout: number = 10000,
  ) {}

  async chat(opts: {
    model: string;
    messages: ChatMessage[];
    format?: string | object;
    options?: Record<string, unknown>;
  }): Promise<ChatResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.model,
          messages: opts.messages,
          stream: false,
          keep_alive: 0,
          ...(opts.format !== undefined && { format: opts.format }),
          ...(opts.options !== undefined && { options: opts.options }),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama chat failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return {
        content: data.message.content,
        model: data.model,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async chatWithFallback(
    messages: ChatMessage[],
    format?: string | object,
  ): Promise<ChatResult> {
    try {
      return await this.chat({ model: this.cloudModel, messages, format });
    } catch {
      // Cloud model failed -- fall back to local
      return await this.chat({ model: this.localModel, messages, format });
    }
  }

  async classify(question: string): Promise<Route> {
    try {
      const result = await this.chatWithFallback(
        [
          { role: 'system', content: ROUTING_SYSTEM_PROMPT },
          { role: 'user', content: question },
        ],
        'json',
      );

      const parsed = JSON.parse(result.content);
      if (VALID_ROUTES.includes(parsed.route)) {
        return parsed.route;
      }
      return 'both';
    } catch {
      return 'both';
    }
  }
}
