import { spawnSync } from 'node:child_process';

/**
 * Service for Git commit, log, and diff operations
 */
export class GitCommitService {
  constructor(private execCommand: (command: string, cwd: string) => string) {}

  getDiff(baseSha: string, headSha: string, repoPath: string): string {
    return this.execCommand(`git diff --no-color ${baseSha}..${headSha}`, repoPath);
  }

  generatePatch(baseSha: string, headSha: string, repoPath: string): string {
    return this.execCommand(`git diff --no-color ${baseSha}..${headSha}`, repoPath);
  }

  getLogOneline(repoPath: string, range: string): string {
    return this.execCommand(`git log --oneline ${range}`, repoPath).trim();
  }

  /**
   * Get detailed commit log with SHA, message, author, date
   * Returns array of commit objects
   */
  getLogDetailed(
    repoPath: string,
    range: string
  ): Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
  }> {
    const format = '%H|%s|%an|%ai';
    // Use spawnSync instead of execSync to better handle errors and avoid Windows cmd.exe issues
    // Pass command as array to avoid shell interpretation (prevents %s from being interpreted as env var on Windows)
    const result = spawnSync('git', ['log', `--format=${format}`, range], {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.error) {
      throw new Error(
        `Git command failed: git log --format=${format} ${range}\nError: ${result.error.message}`
      );
    }

    if (result.status !== 0) {
      const stderr = (result.stderr || '').toString();
      // If the error is about no commits found or invalid range, return empty array
      if (
        stderr.includes('does not have any commits') ||
        stderr.includes('unknown revision') ||
        stderr.includes('bad revision')
      ) {
        return [];
      }
      throw new Error(
        `Git command failed: git log --format=${format} ${range}\nStderr: ${stderr || 'No error details'}`
      );
    }

    const output = (result.stdout || '').toString().trim();
    if (!output) {
      return [];
    }

    return output.split('\n').map((line) => {
      const [sha, message, author, date] = line.split('|');
      return { sha, message, author, date };
    });
  }

  /**
   * Get diff statistics (files changed, additions, deletions)
   */
  getDiffStats(
    baseSha: string,
    headSha: string,
    repoPath: string
  ): {
    filesChanged: number;
    additions: number;
    deletions: number;
  } {
    try {
      const output = this.execCommand(`git diff --numstat ${baseSha}..${headSha}`, repoPath).trim();

      if (!output) {
        return { filesChanged: 0, additions: 0, deletions: 0 };
      }

      let filesChanged = 0;
      let additions = 0;
      let deletions = 0;

      const lines = output.split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          filesChanged++;
          const add = parseInt(parts[0], 10);
          const del = parseInt(parts[1], 10);
          if (!isNaN(add)) additions += add;
          if (!isNaN(del)) deletions += del;
        }
      }

      return { filesChanged, additions, deletions };
    } catch {
      return { filesChanged: 0, additions: 0, deletions: 0 };
    }
  }

  /**
   * Get files changed in a commit range
   */
  getFilesChanged(baseSha: string, headSha: string, repoPath: string): string[] {
    try {
      const output = this.execCommand(
        `git diff --name-only ${baseSha}..${headSha}`,
        repoPath
      ).trim();

      if (!output) {
        return [];
      }

      return output.split('\n').filter((file) => file.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Get files changed for a specific commit (relative to its parent)
   */
  getFilesChangedForCommit(commitSha: string, repoPath: string): string[] {
    try {
      // Use ^ to get parent commit, or use --name-only with commit range
      const output = this.execCommand(
        `git diff --name-only ${commitSha}^..${commitSha}`,
        repoPath
      ).trim();

      if (!output) {
        return [];
      }

      return output.split('\n').filter((file) => file.length > 0);
    } catch {
      // If commit has no parent (root commit), use show instead
      try {
        const output = this.execCommand(
          `git show --name-only --pretty=format: ${commitSha}`,
          repoPath
        ).trim();

        if (!output) {
          return [];
        }

        return output.split('\n').filter((file) => file.length > 0);
      } catch {
        return [];
      }
    }
  }

  /**
   * Get commits with file changes in a single command
   * Returns commits with their file changes for commits in the specified range
   */
  getCommitsWithFiles(
    repoPath: string,
    range: string
  ): Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
    filesChanged: string[];
  }> {
    try {
      // Use --name-status to get both commit info and file changes
      // Format: %H|%s|%an|%ai followed by file changes
      const format = '%H|%s|%an|%ai';
      const result = spawnSync('git', ['log', `--format=${format}`, '--name-only', range], {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (result.error) {
        throw new Error(
          `Git command failed: git log --format=${format} --name-only ${range}\nError: ${result.error.message}`
        );
      }

      if (result.status !== 0) {
        const stderr = (result.stderr || '').toString();
        if (
          stderr.includes('does not have any commits') ||
          stderr.includes('unknown revision') ||
          stderr.includes('bad revision')
        ) {
          return [];
        }
        throw new Error(
          `Git command failed: git log --format=${format} --name-only ${range}\nStderr: ${stderr || 'No error details'}`
        );
      }

      const output = (result.stdout || '').toString().trim();
      if (!output) {
        return [];
      }

      const lines = output.split('\n');
      const commits: Array<{
        sha: string;
        message: string;
        author: string;
        date: string;
        filesChanged: string[];
      }> = [];

      let currentCommit: {
        sha: string;
        message: string;
        author: string;
        date: string;
        filesChanged: string[];
      } | null = null;

      for (const line of lines) {
        if (line.includes('|')) {
          // This is a commit line
          if (currentCommit) {
            commits.push(currentCommit);
          }
          const [sha, message, author, date] = line.split('|');
          currentCommit = {
            sha,
            message,
            author,
            date,
            filesChanged: [],
          };
        } else if (currentCommit && line.trim().length > 0) {
          // This is a file change line
          currentCommit.filesChanged.push(line.trim());
        }
      }

      // Don't forget the last commit
      if (currentCommit) {
        commits.push(currentCommit);
      }

      return commits;
    } catch (error) {
      console.error(`Failed to get commits with files: ${error}`);
      return [];
    }
  }

  /**
   * Get commits for specific SHAs only (optimized for filtering)
   * Returns commits with their file changes
   */
  getCommitsByShas(
    repoPath: string,
    commitShas: string[]
  ): Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
    filesChanged: string[];
  }> {
    if (commitShas.length === 0) {
      return [];
    }

    try {
      // Use git log with specific SHAs
      const format = '%H|%s|%an|%ai';
      const result = spawnSync(
        'git',
        ['log', `--format=${format}`, '--name-only', '--no-walk=sorted', ...commitShas],
        {
          cwd: repoPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      if (result.error) {
        throw new Error(
          `Git command failed: git log --format=${format} --name-only --no-walk=sorted ${commitShas.join(' ')}\nError: ${result.error.message}`
        );
      }

      if (result.status !== 0) {
        const stderr = (result.stderr || '').toString();
        if (
          stderr.includes('does not have any commits') ||
          stderr.includes('unknown revision') ||
          stderr.includes('bad revision')
        ) {
          return [];
        }
        throw new Error(
          `Git command failed: git log --format=${format} --name-only --no-walk=sorted ${commitShas.join(' ')}\nStderr: ${stderr || 'No error details'}`
        );
      }

      const output = (result.stdout || '').toString().trim();
      if (!output) {
        return [];
      }

      const lines = output.split('\n');
      const commits: Array<{
        sha: string;
        message: string;
        author: string;
        date: string;
        filesChanged: string[];
      }> = [];

      let currentCommit: {
        sha: string;
        message: string;
        author: string;
        date: string;
        filesChanged: string[];
      } | null = null;

      for (const line of lines) {
        if (line.includes('|')) {
          // This is a commit line
          if (currentCommit) {
            commits.push(currentCommit);
          }
          const [sha, message, author, date] = line.split('|');
          currentCommit = {
            sha,
            message,
            author,
            date,
            filesChanged: [],
          };
        } else if (currentCommit && line.trim().length > 0) {
          // This is a file change line
          currentCommit.filesChanged.push(line.trim());
        }
      }

      // Don't forget the last commit
      if (currentCommit) {
        commits.push(currentCommit);
      }

      return commits;
    } catch (error) {
      console.error(`Failed to get commits by SHAs: ${error}`);
      // Fallback: get commits individually
      return this.getCommitsByShasFallback(repoPath, commitShas);
    }
  }

  /**
   * Fallback method to get commits by SHAs individually
   */
  private getCommitsByShasFallback(
    repoPath: string,
    commitShas: string[]
  ): Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
    filesChanged: string[];
  }> {
    const commits: Array<{
      sha: string;
      message: string;
      author: string;
      date: string;
      filesChanged: string[];
    }> = [];

    for (const sha of commitShas) {
      try {
        const commitDetails = this.getLogDetailed(repoPath, sha);
        if (commitDetails.length > 0) {
          const commit = commitDetails[0];
          const filesChanged = this.getFilesChangedForCommit(sha, repoPath);
          commits.push({
            ...commit,
            filesChanged,
          });
        }
      } catch (error) {
        console.warn(`Failed to get commit ${sha}: ${error}`);
      }
    }

    return commits;
  }
}
