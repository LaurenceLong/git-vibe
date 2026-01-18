import { execSync } from 'node:child_process';

/**
 * Service for managing Git worktrees
 */
export class GitWorktreeService {
  constructor(private execCommand: (command: string, cwd: string) => string) {}

  createWorktree(repoPath: string, worktreePath: string, branch: string, baseRef: string): void {
    // Create new branch from baseRef and check it out in the worktree
    // Use -f flag to force creation if worktree is registered but missing on disk
    this.execCommand(`git worktree add -f -b ${branch} ${worktreePath} ${baseRef}`, repoPath);
  }

  createWorktreeFromExistingBranch(repoPath: string, worktreePath: string, branch: string): void {
    // Create worktree from existing branch (without -b flag)
    // Use -f flag to force creation if worktree is registered but missing on disk
    this.execCommand(`git worktree add -f ${worktreePath} ${branch}`, repoPath);
  }

  removeWorktree(worktreePath: string, repoPath: string): void {
    this.execCommand(`git worktree remove ${worktreePath}`, repoPath);
  }

  pruneWorktrees(repoPath: string): void {
    // Prune stale worktree registrations (worktrees that are registered but missing on disk)
    this.execCommand('git worktree prune', repoPath);
  }

  listWorktrees(repoPath: string): Array<{ worktreePath: string; branch: string }> {
    try {
      const output = this.execCommand('git worktree list --porcelain', repoPath);
      const worktrees: Array<{ worktreePath: string; branch: string }> = [];
      const lines = output.split('\n');
      let currentWorktree: { worktreePath: string; branch: string } | null = null;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          currentWorktree = { worktreePath: line.substring(9), branch: '' };
        } else if (line.startsWith('branch ') && currentWorktree) {
          currentWorktree.branch = line.substring(7);
          worktrees.push(currentWorktree);
          currentWorktree = null;
        }
      }

      return worktrees;
    } catch {
      return [];
    }
  }

  /**
   * Find the worktree path where a branch is checked out
   * Returns null if the branch is not checked out in any worktree
   */
  findWorktreeForBranch(repoPath: string, branch: string): string | null {
    const worktrees = this.listWorktrees(repoPath);
    // Normalize branch name (remove refs/heads/ prefix if present)
    const normalizedBranch = branch.replace(/^refs\/heads\//, '');

    for (const worktree of worktrees) {
      const normalizedWorktreeBranch = worktree.branch.replace(/^refs\/heads\//, '');
      if (normalizedWorktreeBranch === normalizedBranch) {
        return worktree.worktreePath;
      }
    }

    return null;
  }

  recreateWorktree(
    repoPath: string,
    worktreePath: string,
    branchName: string,
    baseRef: string
  ): void {
    // Remove existing worktree if it exists
    try {
      this.removeWorktree(worktreePath, repoPath);
    } catch {
      // Worktree doesn't exist, continue
    }
    // Create new worktree
    this.createWorktree(repoPath, worktreePath, branchName, baseRef);
  }

  getWorktreeStatus(repoPath: string, worktreePath: string): 'present' | 'missing' {
    try {
      // Check if worktree exists by listing worktrees
      const worktrees = this.execCommand('git worktree list --porcelain', repoPath);
      const worktreeExists = worktrees
        .split('\n')
        .some((line) => line.startsWith('worktree ') && line.substring(9) === worktreePath);
      return worktreeExists ? 'present' : 'missing';
    } catch {
      return 'missing';
    }
  }
}
