export interface SearchResult {
  title: string;
  url: string;
  content: string;
  engine: string;
  score: number;
}

export class SearxngService {
  constructor(private baseUrl: string) {}

  async search(
    query: string,
    opts?: { categories?: string; limit?: number },
  ): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      categories: opts?.categories ?? 'general',
    });

    const response = await fetch(`${this.baseUrl}/search?${params}`);

    if (!response.ok) {
      throw new Error(`SearXNG search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const results = data.results ?? [];
    const limit = opts?.limit ?? 5;

    return results.slice(0, limit).map((r: Record<string, unknown>) => ({
      title: r.title as string,
      url: r.url as string,
      content: r.content as string,
      engine: r.engine as string,
      score: r.score as number,
    }));
  }
}
