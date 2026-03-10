import { describe, it, expect } from 'vitest';
import { getGitContext } from '../../src/services/git.js';

describe('getGitContext', () => {
  it('detects branch and repo for the current repo', async () => {
    const ctx = await getGitContext(process.cwd());
    expect(ctx.repoRoot).toBeTruthy();
    expect(ctx.branch).toBeTruthy();
    expect(ctx.repoName).toBeTruthy();
  });

  it('throws for a non-git directory', async () => {
    await expect(getGitContext('/tmp')).rejects.toThrow();
  });
});
