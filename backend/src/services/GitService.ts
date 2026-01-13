import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';

export class GitService {
  private execCommand(command: string, cwd: string): string {
    try {
      return execSync(command, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; status?: number };
      throw new Error(`Git command failed: ${command}\nStderr: ${err.stderr}`);
    }
  }

  async validateRepo(repoPath: string): Promise<boolean> {
    try {
      await fs.access(`${repoPath}/.git`);
      return true;
    } catch {
      throw new Error(`Not a valid Git repository: ${repoPath}`);
    }
  }

  getCurrentBranch(repoPath: string): string {
    return this.execCommand('git rev-parse --abbrev-ref HEAD', repoPath).trim();
  }

  getDefaultBranch(repoPath: string): string {
    try {
      return this.execCommand(
        'git symbolic-ref refs/remotes/origin/HEAD | sed "s@^refs/remotes/origin/@@"',
        repoPath,
      ).trim();
    } catch {
      return 'main';
    }
  }

  getHeadSha(repoPath: string): string {
    return this.execCommand('git rev-parse HEAD', repoPath).trim();
  }

  getRefSha(repoPath: string, ref: string): string {
    return this.execCommand(`git rev-parse ${ref}`, repoPath).trim();
  }

  ensureCleanWorktree(repoPath: string): void {
    // empty output means clean
    const status = this.execCommand('git status --porcelain', repoPath).trim();
    if (status.length > 0) {
      throw new Error(`Repository has uncommitted changes: ${repoPath}`);
    }
  }

  createWorktree(repoPath: string, worktreePath: string, branch: string, baseRef: string): void {
    // Create new branch from baseRef and check it out in the worktree
    this.execCommand(`git worktree add -b ${branch} ${worktreePath} ${baseRef}`, repoPath);
  }

  removeWorktree(worktreePath: string, repoPath: string): void {
    this.execCommand(`git worktree remove ${worktreePath}`, repoPath);
  }

  getWorktreeHead(worktreePath: string): string {
    return this.getHeadSha(worktreePath);
  }

  getDiff(baseSha: string, headSha: string, repoPath: string): string {
    return this.execCommand(`git diff --no-color ${baseSha}..${headSha}`, repoPath);
  }

  generatePatch(baseSha: string, headSha: string, repoPath: string): string {
    return this.execCommand(`git diff --no-color ${baseSha}..${headSha}`, repoPath);
  }

  async applyPatch(repoPath: string, patchContent: string): Promise<void> {
    const patchPath = `${repoPath}/.gitvibe-temp.patch`;
    await fs.writeFile(patchPath, patchContent, 'utf-8');

    try {
      this.execCommand('git apply --3way --whitespace=nowarn .gitvibe-temp.patch', repoPath);
      this.execCommand('git add -A', repoPath);
      await fs.unlink(patchPath);
    } catch (error) {
      await fs.unlink(patchPath).catch(() => {});
      throw error;
    }
  }

  commitChanges(repoPath: string, message: string): string {
    this.execCommand(`git commit -m "${message}"`, repoPath);
    return this.getHeadSha(repoPath);
  }
}

export const gitService = new GitService();