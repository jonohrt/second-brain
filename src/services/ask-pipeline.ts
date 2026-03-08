import type { ChatService, ChatMessage } from './ollama-chat.js';
import type { SearxngService, SearchResult } from './searxng.js';
import type { EmbeddingsService } from './embeddings.js';
import type { SupabaseService } from './supabase.js';
import type { ContextEntry } from '../types.js';

export interface AskConfig {
  similarityThreshold: number;
  maxBrainResults: number;
  maxWebResults: number;
}

const DEFAULT_CONFIG: AskConfig = {
  similarityThreshold: 0.65,
  maxBrainResults: 5,
  maxWebResults: 5,
};

export type Source =
  | { type: 'vault'; path: string; title: string; similarity: number }
  | { type: 'web'; url: string; title: string };

export interface AskResult {
  answer: string;
  sources: Source[];
  route: 'brain' | 'web' | 'both';
  model: string;
}

interface BrainResult {
  entry: ContextEntry;
  similarity: number;
}

export class AskPipeline {
  private config: AskConfig;

  constructor(
    private chatService: ChatService,
    private searxng: SearxngService,
    private embeddings: EmbeddingsService,
    private supabase: SupabaseService,
    config?: Partial<AskConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private isNewsQuery(question: string): boolean {
    return /\b(news|headline|article|current event|happening|latest|today'?s|breaking)\b/i.test(question);
  }

  async ask(question: string, conversationHistory?: Array<{ role: string; content: string }>): Promise<AskResult> {
    const searchCategories = this.isNewsQuery(question) ? 'news' : 'general';

    // Fetch brain + web context in parallel (skip classify step for speed)
    const [brainResults, webResults] = await Promise.all([
      (async (): Promise<BrainResult[]> => {
        try {
          const embedding = await this.embeddings.embed(question);
          return await this.supabase.searchWithScores(embedding, {
            threshold: this.config.similarityThreshold,
            limit: this.config.maxBrainResults,
          });
        } catch {
          return [];
        }
      })(),
      (async (): Promise<SearchResult[]> => {
        try {
          return await this.searxng.search(question, {
            categories: searchCategories,
            limit: this.config.maxWebResults,
          });
        } catch {
          return [];
        }
      })(),
    ]);

    let route: 'brain' | 'web' | 'both' = 'both';
    if (brainResults.length > 0 && webResults.length === 0) route = 'brain';
    else if (brainResults.length === 0) route = 'web';

    // 4. Build generation prompt
    const messages = buildGenerationPrompt(question, brainResults, webResults, conversationHistory);

    // 5. Generate answer
    const result = await this.chatService.chatWithFallback(messages);

    // 6. Assemble sources
    const sources: Source[] = [
      ...brainResults.map((r): Source => ({
        type: 'vault',
        path: r.entry.vaultPath ?? '',
        title: r.entry.title,
        similarity: r.similarity,
      })),
      ...webResults.map((r): Source => ({
        type: 'web',
        url: r.url,
        title: r.title,
      })),
    ];

    return {
      answer: result.content,
      sources,
      route,
      model: result.model,
    };
  }
}

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

  const messages: ChatMessage[] = [{ role: 'system', content: systemContent }];

  // Include conversation history for multi-turn context
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: question });
  return messages;
}
