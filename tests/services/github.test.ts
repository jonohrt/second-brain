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

  describe('fetchPRTitle', () => {
    it('fetches PR title from repo API', async () => {
      mockExecFile.mockResolvedValue({ stdout: JSON.stringify({ title: 'Fix auth flow', state: 'closed', merged: true }), stderr: '' });

      const title = await github.fetchPRTitle('optimumenergyco/core-ui', 42);

      expect(mockExecFile).toHaveBeenCalledWith('gh', [
        'api', 'repos/optimumenergyco/core-ui/pulls/42',
        '--hostname', 'github.com',
      ]);
      expect(title).toBe('Fix auth flow');
    });

    it('returns null when API call fails', async () => {
      mockExecFile.mockRejectedValue(new Error('not found'));

      const title = await github.fetchPRTitle('org/repo', 999);
      expect(title).toBeNull();
    });
  });

  describe('findPRForBranch', () => {
    it('finds an open PR matching the branch', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify([{ number: 55, title: 'Dashboard redesign', state: 'open' }]),
        stderr: '',
      });

      const pr = await github.findPRForBranch('optimumenergyco/core-ui', 'feature/dashboard');

      expect(mockExecFile).toHaveBeenCalledWith('gh', [
        'api', 'repos/optimumenergyco/core-ui/pulls?head=optimumenergyco:feature/dashboard&state=all&per_page=1',
        '--hostname', 'github.com',
      ]);
      expect(pr).toEqual({ number: 55, title: 'Dashboard redesign' });
    });

    it('returns null when no PR exists for branch', async () => {
      mockExecFile.mockResolvedValue({ stdout: '[]', stderr: '' });

      const pr = await github.findPRForBranch('org/repo', 'no-pr-branch');
      expect(pr).toBeNull();
    });
  });
});
