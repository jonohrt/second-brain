export type ContextType = 'branch_context' | 'pr_context' | 'decision' | 'learned' | 'session' | 'task';

export interface ContextEntry {
  id?: string;
  type: ContextType;
  project?: string;
  repo?: string;
  branch?: string;
  prNumber?: number;
  title: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  vaultPath?: string;
}

export interface Frontmatter {
  type: ContextType;
  project?: string;
  repo?: string;
  branch?: string;
  pr?: number;
  created: string;
  updated: string;
  tags: string[];
}

export interface ProjectConfig {
  repos: Record<string, string>;
  relatedRepos?: string[];
}

export interface Config {
  vaultPath: string;
  contextDir: string;
  supabase: {
    url: string;
    key: string;
  };
  ollama: {
    baseUrl: string;
    model: string;
  };
  openrouter?: {
    apiKey: string;
    model: string;
  };
  projects: Record<string, ProjectConfig>;
  voice?: {
    watchDir: string;
    processedLog: string;
    whisperBinary: string;
    whisperModel: string;
  };
  server?: {
    port: number;
    apiToken: string;
  };
}

export interface GitContext {
  branch: string;
  repoRoot: string;
  repoName: string;
  project?: string;
}
