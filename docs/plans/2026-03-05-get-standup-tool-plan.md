# get_standup Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `get_standup` MCP tool that queries GitHub Events API for the `optijon` account and returns a concise summary of merged PRs and commits pushed to PR branches on the last active day.

**Architecture:** New service (`src/services/github.ts`) handles all GitHub API calls via `gh` CLI. New tool file (`src/mcp/tools/standup.ts`) registers the MCP tool and formats output. The service fetches events, identifies the last active day, enriches PR events with titles via follow-up API calls, and matches push events to PRs by branch name.

**Tech Stack:** `gh` CLI via `child_process.execFile`, vitest for tests.

**Important API constraints:** Private repo events from the GitHub Events API are stripped — PullRequestEvent has no title, PushEvent has no commit count. We must make follow-up `gh api repos/{owner}/{repo}/pulls/{number}` calls to get PR titles, and `gh api repos/{owner}/{repo}/pulls?head={branch}` to match pushes to PRs.

---

### Task 1: GitHub Service — fetchEvents

**Files:**
- Create: `src/services/github.ts`
- Create: `tests/services/github.test.ts`

**Step 1: Write the failing test**

```typescript
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
  const mockExecFile = vi.mocked(execFile);

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
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/johrt/Code/second-brain && npx vitest run tests/services/github.test.ts`
Expected: FAIL — cannot find `../../src/services/github.js`

**Step 3: Write minimal implementation**

```typescript
// src/services/github.ts
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
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/johrt/Code/second-brain && npx vitest run tests/services/github.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
cd /Users/johrt/Code/second-brain
git add src/services/github.ts tests/services/github.test.ts
git commit -m "feat: add GitHubService with fetchEvents method"
```

---

### Task 2: GitHub Service — fetchPRTitle

**Files:**
- Modify: `src/services/github.ts`
- Modify: `tests/services/github.test.ts`

**Step 1: Write the failing test**

Add to the existing describe block in `tests/services/github.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/johrt/Code/second-brain && npx vitest run tests/services/github.test.ts`
Expected: FAIL — `fetchPRTitle` is not a function

**Step 3: Write minimal implementation**

Add to `src/services/github.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/johrt/Code/second-brain && npx vitest run tests/services/github.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
cd /Users/johrt/Code/second-brain
git add src/services/github.ts tests/services/github.test.ts
git commit -m "feat: add fetchPRTitle to GitHubService"
```

---

### Task 3: GitHub Service — findPRForBranch

**Files:**
- Modify: `src/services/github.ts`
- Modify: `tests/services/github.test.ts`

**Step 1: Write the failing test**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/johrt/Code/second-brain && npx vitest run tests/services/github.test.ts`
Expected: FAIL — `findPRForBranch` is not a function

**Step 3: Write minimal implementation**

Add to `src/services/github.ts`:

```typescript
  async findPRForBranch(repoFullName: string, branch: string): Promise<{ number: number; title: string } | null> {
    try {
      const owner = repoFullName.split('/')[0];
      const { stdout } = await execFileAsync('gh', [
        'api', `repos/${repoFullName}/pulls?head=${owner}:${branch}&state=all&per_page=1`,
        '--hostname', 'github.com',
      ]);
      const prs = JSON.parse(stdout);
      if (prs.length === 0) return null;
      return { number: prs[0].number, title: prs[0].title };
    } catch {
      return null;
    }
  }
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/johrt/Code/second-brain && npx vitest run tests/services/github.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
cd /Users/johrt/Code/second-brain
git add src/services/github.ts tests/services/github.test.ts
git commit -m "feat: add findPRForBranch to GitHubService"
```

---

### Task 4: GitHub Service — getStandupActivity

This is the main orchestration method that ties everything together.

**Files:**
- Modify: `src/services/github.ts`
- Modify: `tests/services/github.test.ts`

**Step 1: Write the failing test**

```typescript
  describe('getStandupActivity', () => {
    it('groups events by repo with merged PRs and push activity', async () => {
      const mockEvents: GitHubEvent[] = [
        // Today: March 5
        {
          type: 'PushEvent',
          repo: { name: 'org/core-ui' },
          payload: { ref: 'refs/heads/feature/dashboard' },
          created_at: '2026-03-05T16:00:00Z',
        },
        {
          type: 'PullRequestEvent',
          repo: { name: 'org/core-ui' },
          payload: { action: 'merged', number: 42, pull_request: { number: 42, head: { ref: 'hotfix' } } },
          created_at: '2026-03-05T15:00:00Z',
        },
        // Yesterday: should not appear
        {
          type: 'PushEvent',
          repo: { name: 'org/core-ui' },
          payload: { ref: 'refs/heads/old-branch' },
          created_at: '2026-03-04T10:00:00Z',
        },
      ];

      // First call: fetchEvents
      mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(mockEvents), stderr: '' });
      // Second call: fetchPRTitle for merged PR #42
      mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify({ title: 'Fix auth flow' }), stderr: '' });
      // Third call: findPRForBranch for push to feature/dashboard
      mockExecFile.mockResolvedValueOnce({
        stdout: JSON.stringify([{ number: 55, title: 'Dashboard redesign', state: 'open' }]),
        stderr: '',
      });

      const result = await github.getStandupActivity();

      expect(result.date).toBe('2026-03-05');
      expect(result.repos).toHaveLength(1);
      expect(result.repos[0].repo).toBe('org/core-ui');
      expect(result.repos[0].mergedPRs).toEqual([{ number: 42, title: 'Fix auth flow' }]);
      expect(result.repos[0].pushes).toEqual([{ branch: 'feature/dashboard', prNumber: 55, prTitle: 'Dashboard redesign' }]);
    });

    it('returns null when no events exist', async () => {
      mockExecFile.mockResolvedValue({ stdout: '[]', stderr: '' });

      const result = await github.getStandupActivity();
      expect(result).toBeNull();
    });

    it('skips pushes to default branches', async () => {
      const mockEvents: GitHubEvent[] = [
        {
          type: 'PushEvent',
          repo: { name: 'org/repo' },
          payload: { ref: 'refs/heads/main' },
          created_at: '2026-03-05T10:00:00Z',
        },
        {
          type: 'PushEvent',
          repo: { name: 'org/repo' },
          payload: { ref: 'refs/heads/production' },
          created_at: '2026-03-05T09:00:00Z',
        },
      ];
      mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify(mockEvents), stderr: '' });

      const result = await github.getStandupActivity();
      expect(result).toBeNull();
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/johrt/Code/second-brain && npx vitest run tests/services/github.test.ts`
Expected: FAIL — `getStandupActivity` is not a function

**Step 3: Write minimal implementation**

Add types and method to `src/services/github.ts`:

```typescript
export interface StandupRepo {
  repo: string;
  mergedPRs: { number: number; title: string }[];
  pushes: { branch: string; prNumber?: number; prTitle?: string }[];
}

export interface StandupActivity {
  date: string; // YYYY-MM-DD
  repos: StandupRepo[];
}

// Add these as class constants
const DEFAULT_BRANCHES = new Set(['refs/heads/main', 'refs/heads/master', 'refs/heads/production', 'refs/heads/develop']);
```

Add method to `GitHubService`:

```typescript
  async getStandupActivity(): Promise<StandupActivity | null> {
    const events = await this.fetchEvents();

    // Filter to relevant event types
    const relevant = events.filter(
      (e) => e.type === 'PullRequestEvent' || e.type === 'PushEvent'
    );
    if (relevant.length === 0) return null;

    // Find the last active day (calendar date of most recent event)
    const lastDate = relevant[0].created_at.slice(0, 10);

    // Filter to only that day
    const dayEvents = relevant.filter((e) => e.created_at.startsWith(lastDate));

    // Separate merged PRs and pushes
    const mergedPREvents = dayEvents.filter(
      (e) => e.type === 'PullRequestEvent' && (e.payload as any).action === 'merged'
    );
    const pushEvents = dayEvents.filter(
      (e) => e.type === 'PushEvent' && !DEFAULT_BRANCHES.has((e.payload as any).ref)
    );

    if (mergedPREvents.length === 0 && pushEvents.length === 0) return null;

    // Group by repo
    const repoMap = new Map<string, StandupRepo>();

    const getRepo = (name: string): StandupRepo => {
      if (!repoMap.has(name)) {
        repoMap.set(name, { repo: name, mergedPRs: [], pushes: [] });
      }
      return repoMap.get(name)!;
    };

    // Process merged PRs — fetch titles
    for (const event of mergedPREvents) {
      const prPayload = event.payload as any;
      const prNumber = prPayload.number ?? prPayload.pull_request?.number;
      const title = await this.fetchPRTitle(event.repo.name, prNumber);
      const repo = getRepo(event.repo.name);
      // Deduplicate
      if (!repo.mergedPRs.some((p) => p.number === prNumber)) {
        repo.mergedPRs.push({ number: prNumber, title: title ?? `PR #${prNumber}` });
      }
    }

    // Process pushes — deduplicate by branch, find associated PRs
    const seenBranches = new Set<string>();
    for (const event of pushEvents) {
      const ref = (event.payload as any).ref as string;
      const branch = ref.replace('refs/heads/', '');
      const key = `${event.repo.name}:${branch}`;
      if (seenBranches.has(key)) continue;
      seenBranches.add(key);

      // Skip if this branch was already merged (avoid double-reporting)
      const repo = getRepo(event.repo.name);
      const pr = await this.findPRForBranch(event.repo.name, branch);
      if (pr && repo.mergedPRs.some((p) => p.number === pr.number)) continue;

      repo.pushes.push({
        branch,
        prNumber: pr?.number,
        prTitle: pr?.title,
      });
    }

    // Filter out empty repos
    const repos = Array.from(repoMap.values()).filter(
      (r) => r.mergedPRs.length > 0 || r.pushes.length > 0
    );

    if (repos.length === 0) return null;

    return { date: lastDate, repos };
  }
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/johrt/Code/second-brain && npx vitest run tests/services/github.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
cd /Users/johrt/Code/second-brain
git add src/services/github.ts tests/services/github.test.ts
git commit -m "feat: add getStandupActivity orchestration method"
```

---

### Task 5: MCP Tool — register get_standup

**Files:**
- Create: `src/mcp/tools/standup.ts`
- Modify: `src/mcp/server.ts` (add import + register call)

**Step 1: Create the tool file**

```typescript
// src/mcp/tools/standup.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GitHubService } from '../../services/github.js';
import type { StandupActivity } from '../../services/github.js';

function formatStandup(activity: StandupActivity): string {
  const date = new Date(activity.date + 'T12:00:00Z');
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const lines: string[] = [`## Activity for ${dayName}`, ''];

  for (const repo of activity.repos) {
    const shortName = repo.repo.split('/')[1] ?? repo.repo;
    lines.push(`**${shortName}**`);

    for (const pr of repo.mergedPRs) {
      lines.push(`- Merged PR #${pr.number}: ${pr.title}`);
    }

    for (const push of repo.pushes) {
      if (push.prNumber) {
        lines.push(`- Pushed to PR #${push.prNumber}: ${push.prTitle ?? push.branch}`);
      } else {
        lines.push(`- Pushed to branch: ${push.branch}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

export function registerStandupTools(server: McpServer): void {
  server.registerTool(
    'get_standup',
    {
      description:
        'Get a standup summary of recent GitHub activity for the optijon account. Shows merged PRs and commits pushed to PR branches. Auto-detects the last active day — no parameters needed.',
      inputSchema: {},
    },
    async () => {
      try {
        const github = new GitHubService('optijon');
        const activity = await github.getStandupActivity();

        if (!activity) {
          return { content: [{ type: 'text' as const, text: 'No recent GitHub activity found.' }] };
        }

        const formatted = formatStandup(activity);
        return { content: [{ type: 'text' as const, text: formatted }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error fetching standup: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: Update server.ts**

Add import at the top:
```typescript
import { registerStandupTools } from './tools/standup.js';
```

Add registration after the existing `registerTaskTools(server, services);` line:
```typescript
  registerStandupTools(server);
```

Note: `registerStandupTools` does NOT take `services` — it creates its own `GitHubService` internally since it doesn't need Supabase/embeddings/vault.

**Step 3: Build and verify**

Run: `cd /Users/johrt/Code/second-brain && npm run build`
Expected: No TypeScript errors

**Step 4: Commit**

```bash
cd /Users/johrt/Code/second-brain
git add src/mcp/tools/standup.ts src/mcp/server.ts
git commit -m "feat: register get_standup MCP tool"
```

---

### Task 6: Verify end-to-end

**Step 1: Restart MCP server and test**

The user needs to restart Claude Code for the new MCP tool to be available. Once restarted, test by asking "what did I do yesterday?" or calling `get_standup` directly.

**Step 2: Verify the `gh auth` context**

The MCP server runs as a child process of Claude Code. Verify that `gh` resolves to the `optijon` account when called from the server process. If not, the `--hostname` flag should handle it, but we may need to add `GH_TOKEN` env var or explicit `gh auth switch` before calling.

**Step 3: Commit any fixes**

```bash
cd /Users/johrt/Code/second-brain
git add -A
git commit -m "fix: any adjustments from e2e testing"
```
