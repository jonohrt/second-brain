import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitHubEvent {
  type: string;
  repo: { name: string };
  payload: Record<string, unknown>;
  created_at: string;
}

export class GitHubService {
  constructor(private username: string) {}

  async fetchEvents(): Promise<GitHubEvent[]> {
    try {
      const { stdout } = await execFileAsync('gh', [
        'api', `users/${this.username}/events?per_page=100`,
        '--hostname', 'github.com',
      ]);
      return JSON.parse(stdout) as GitHubEvent[];
    } catch {
      return [];
    }
  }

  async fetchPRTitle(repoFullName: string, prNumber: number): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('gh', [
        'api', `repos/${repoFullName}/pulls/${prNumber}`,
        '--hostname', 'github.com',
      ]);
      const pr = JSON.parse(stdout);
      return pr.title ?? null;
    } catch {
      return null;
    }
  }
}
