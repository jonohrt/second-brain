import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubService } from '../../src/services/github.js';

// Mock execFile
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));
vi.mock('node:util', () => ({
  promisify: (fn: Function) => fn,
}));

import { execFile } from 'node:child_process';

describe('GitHubService', () => {
  let github: GitHubService;
  const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    github = new GitHubService('optijon');
  });

  describe('fetchEvents', () => {
    it('calls gh api with correct user and returns parsed events', async () => {
      const mockEvents = [
        {
          type: 'PushEvent',
          repo: { name: 'org/repo' },
          payload: { ref: 'refs/heads/feature-branch' },
          created_at: '2026-03-05T15:00:00Z',
        },
        {
          type: 'PullRequestEvent',
          repo: { name: 'org/repo' },
          payload: { action: 'merged', number: 42, pull_request: { number: 42, head: { ref: 'feature-branch' } } },
          created_at: '2026-03-05T14:00:00Z',
        },
      ];
      mockExecFile.mockResolvedValue({ stdout: JSON.stringify(mockEvents), stderr: '' });

      const events = await github.fetchEvents();

      expect(mockExecFile).toHaveBeenCalledWith('gh', [
        'api', 'users/optijon/events?per_page=100',
        '--hostname', 'github.com',
      ]);
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('PushEvent');
    });

    it('returns empty array when gh fails', async () => {
      mockExecFile.mockRejectedValue(new Error('gh not found'));

      const events = await github.fetchEvents();
      expect(events).toEqual([]);
    });
  });
});
