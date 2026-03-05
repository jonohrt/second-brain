export class EmbeddingsService {
  constructor(
    private baseUrl: string,
    private model: string
  ) {}

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl);
      return response.ok;
    } catch {
      return false;
    }
  }
}
