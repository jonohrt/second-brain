import { simpleGit } from 'simple-git';
import { basename } from 'path';
import type { GitContext, Config } from '../types.js';
import { resolveProjectFromPath } from '../config.js';

export async function getGitContext(cwd: string, config?: Config): Promise<GitContext> {
  const git = simpleGit(cwd);

  const isRepo = await git.checkIsRepo();
  if (!isRepo) throw new Error(`Not a git repository: ${cwd}`);

  const repoRoot = await git.revparse(['--show-toplevel']);
  const branch = await git.revparse(['--abbrev-ref', 'HEAD']);

  const context: GitContext = {
    branch: branch.trim(),
    repoRoot: repoRoot.trim(),
    repoName: basename(repoRoot.trim()),
  };

  if (config) {
    const mapping = resolveProjectFromPath(repoRoot.trim(), config);
    if (mapping) {
      context.project = mapping.project;
      context.repoName = mapping.repo;
    }
  }

  return context;
}
