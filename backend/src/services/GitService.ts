import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cp } from 'node:fs';

export interface RepoFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

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

  listBranches(repoPath: string): string[] {
    try {
      const output = this.execCommand('git branch --format=%(refname:short)', repoPath).trim();
      if (!output) {
        return [];
      }
      // Get local branches and remove duplicates
      const branches = output
        .split('\n')
        .map((branch) => branch.trim())
        .filter((branch) => branch.length > 0);
      return [...new Set(branches)];
    } catch {
      return [];
    }
  }

  getDefaultBranch(repoPath: string): string {
    try {
      const output = this.execCommand('git symbolic-ref refs/remotes/origin/HEAD', repoPath).trim();
      // Remove the "refs/remotes/origin/" prefix using JavaScript instead of sed
      return output.replace('refs/remotes/origin/', '');
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

  async createRelayRepo(
    sourceRepoPath: string,
    relayRepoPath: string,
    branch?: string
  ): Promise<void> {
    // Create the relay repo directory
    await fs.mkdir(relayRepoPath, { recursive: true });

    // Copy the .git directory from source to relay repo
    const sourceGitDir = path.join(sourceRepoPath, '.git');
    const relayGitDir = path.join(relayRepoPath, '.git');

    // Use recursive copy for .git directory
    await fs.cp(sourceGitDir, relayGitDir, { recursive: true, force: true });

    // Use provided branch or get the default branch from source repo
    const defaultBranch = branch || this.getDefaultBranch(sourceRepoPath);

    // Checkout the default branch in the relay repo
    this.execCommand(`git checkout ${defaultBranch}`, relayRepoPath);

    // Reset the working tree to restore files from the git history
    this.execCommand('git reset --hard HEAD', relayRepoPath);
    this.execCommand('git clean -fd', relayRepoPath);
  }

  async syncRelayToSource(
    relayRepoPath: string,
    sourceRepoPath: string,
    projectName: string
  ): Promise<void> {
    // Get the default branch from source repo
    const defaultBranch = this.getDefaultBranch(sourceRepoPath);

    // Switch to or create the relay branch
    const relayBranch = `relay-${projectName}`;
    try {
      // Try to checkout the relay branch
      this.execCommand(`git checkout ${relayBranch}`, sourceRepoPath);
    } catch {
      // Branch doesn't exist, create it from default branch
      this.execCommand(`git checkout -b ${relayBranch} ${defaultBranch}`, sourceRepoPath);
    }

    // Copy all files from relay repo to source repo (excluding .git directory)
    const relayFiles = await fs.readdir(relayRepoPath);
    for (const file of relayFiles) {
      if (file !== '.git') {
        const srcPath = path.join(relayRepoPath, file);
        const destPath = path.join(sourceRepoPath, file);
        const srcStat = await fs.stat(srcPath);
        if (srcStat.isDirectory()) {
          await fs.cp(srcPath, destPath, { recursive: true, force: true });
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    }

    // Stage all changes
    this.execCommand('git add -A', sourceRepoPath);

    // Check if there are changes to commit
    const status = this.execCommand('git status --porcelain', sourceRepoPath).trim();
    if (status.length > 0) {
      const commitMessage = `GitVibe sync from relay repo: ${new Date().toISOString()}`;
      this.execCommand(`git commit -m "${commitMessage}"`, sourceRepoPath);
    }
  }

  async listFiles(repoPath: string, relativePath: string = ''): Promise<RepoFile[]> {
    const files: RepoFile[] = [];
    const fullPath = path.join(repoPath, relativePath);

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip .git directory
        if (entry.name === '.git') {
          continue;
        }

        const entryPath = path.join(relativePath, entry.name);

        if (entry.isDirectory()) {
          files.push({
            name: entry.name,
            path: entryPath,
            type: 'directory',
          });
          // Recursively get files in subdirectory
          const subFiles = await this.listFiles(repoPath, entryPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          try {
            const stats = await fs.stat(path.join(fullPath, entry.name));
            files.push({
              name: entry.name,
              path: entryPath,
              type: 'file',
              size: stats.size,
            });
          } catch {
            // If we can't get stats, still include the file without size
            files.push({
              name: entry.name,
              path: entryPath,
              type: 'file',
            });
          }
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to list files in ${fullPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return files;
  }

  async getFileContent(repoPath: string, filePath: string): Promise<string> {
    const fullPath = path.join(repoPath, filePath);
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to read file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const gitService = new GitService();
