import type { OllamaChatService, ChatMessage } from './ollama-chat.js';
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
    private ollamaChat: OllamaChatService,
    private searxng: SearxngService,
    private embeddings: EmbeddingsService,
    private supabase: SupabaseService,
    config?: Partial<AskConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async ask(question: string): Promise<AskResult> {
    // 1. Classify question
    let route = await this.ollamaChat.classify(question);

    // 2. Retrieve brain context (if brain or both)
    let brainResults: BrainResult[] = [];
    if (route === 'brain' || route === 'both') {
      try {
        const embedding = await this.embeddings.embed(question);
        brainResults = await this.supabase.searchWithScores(embedding, {
          threshold: this.config.similarityThreshold,
          limit: this.config.maxBrainResults,
        });

        // Fall back from brain to web when no results found
        if (route === 'brain' && brainResults.length === 0) {
          route = 'web';
        }
      } catch {
        // Embeddings service unavailable -- fall back to web
        route = route === 'both' ? 'both' : 'web';
      }
    }

    // 3. Retrieve web context (if web or both, or after brain fallback)
    let webResults: SearchResult[] = [];
    if (route === 'web' || route === 'both') {
      try {
        webResults = await this.searxng.search(question, {
          limit: this.config.maxWebResults,
        });
      } catch {
        // SearXNG unavailable -- continue with whatever we have
      }
    }

    // 4. Build generation prompt
    const messages = buildGenerationPrompt(question, brainResults, webResults);

    // 5. Generate answer
    const result = await this.ollamaChat.chatWithFallback(messages);

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

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: question },
  ];
}
