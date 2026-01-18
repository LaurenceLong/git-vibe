import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Service for Git relay repository operations
 */
export class GitRelayService {
  constructor(
    private execCommand: (command: string, cwd: string) => string,
    private getDefaultBranch: (repoPath: string) => string
  ) {}

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

    // Remove upstream remote URL to prevent accidental pushes to the original repository
    try {
      this.execCommand('git remote remove origin', relayRepoPath);
    } catch {
      // Origin remote may not exist, continue silently
    }
  }

  async syncRelayToSource(
    relayRepoPath: string,
    sourceRepoPath: string,
    projectName: string
  ): Promise<string | null> {
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
      // Return the commit SHA
      return this.execCommand('git rev-parse HEAD', sourceRepoPath).trim();
    }

    // No changes, return null
    return null;
  }
}
