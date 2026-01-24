import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Service for managing bare Git mirror repositories
 * Mirror repos act as an intermediate layer between source and relay repos
 */
export class GitMirrorService {
  constructor(
    private execCommand: (command: string, cwd: string) => string,
    private getDefaultBranch: (repoPath: string) => string
  ) {}

  /**
   * Get the path for a mirror repo based on source repo path
   * Multiple projects with the same source path share the same mirror repo
   * Uses a hash of the normalized source path to create a unique identifier
   */
  getMirrorRepoPath(mirrorsDir: string, sourceRepoPath: string): string {
    // Normalize the source path to handle different path formats
    const normalizedPath = path.resolve(sourceRepoPath).replace(/\\/g, '/');
    
    // Create a hash from the normalized path
    // Using a simple hash function (could use crypto.createHash for stronger hashing)
    let hash = 0;
    for (let i = 0; i < normalizedPath.length; i++) {
      const char = normalizedPath.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Use absolute value and convert to hex for filename-safe string
    const hashStr = Math.abs(hash).toString(16).padStart(8, '0');
    
    // Create a safe directory name from the last part of the path
    const pathParts = normalizedPath.split('/').filter(p => p.length > 0);
    const lastPart = pathParts[pathParts.length - 1] || 'repo';
    const safeName = lastPart.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // Combine hash and safe name for uniqueness and readability
    return path.join(mirrorsDir, `${safeName}-${hashStr}.git`);
  }

  /**
   * Ensure mirror repo exists and is initialized as a bare repository
   * If it doesn't exist, create it from the source repo
   * Multiple projects with the same source path will share the same mirror repo
   */
  async ensureMirrorRepo(
    mirrorsDir: string,
    sourceRepoPath: string
  ): Promise<string> {
    // Ensure mirrors directory exists
    await fs.mkdir(mirrorsDir, { recursive: true });

    const mirrorRepoPath = this.getMirrorRepoPath(mirrorsDir, sourceRepoPath);

    // Check if mirror repo already exists
    try {
      await fs.access(mirrorRepoPath);
      // Verify it's a valid bare repo
      try {
        const isBare = this.execCommand('git rev-parse --is-bare-repository', mirrorRepoPath).trim();
        if (isBare !== 'true') {
          // Not a bare repo, recreate it
          await fs.rm(mirrorRepoPath, { recursive: true, force: true });
          await this.createMirrorRepo(mirrorRepoPath, sourceRepoPath);
        }
      } catch {
        // Not a valid git repo, recreate it
        await fs.rm(mirrorRepoPath, { recursive: true, force: true });
        await this.createMirrorRepo(mirrorRepoPath, sourceRepoPath);
      }
    } catch {
      // Mirror repo doesn't exist, create it
      await this.createMirrorRepo(mirrorRepoPath, sourceRepoPath);
    }

    return mirrorRepoPath;
  }

  /**
   * Create a new bare mirror repository from source repo
   */
  private async createMirrorRepo(
    mirrorRepoPath: string,
    sourceRepoPath: string
  ): Promise<void> {
    // Use git clone --bare to create mirror repo from source
    // This is more reliable than init + fetch for local repos
    const normalizedSourcePath = path.resolve(sourceRepoPath).replace(/\\/g, '/');
    const sourceUrl = process.platform === 'win32' 
      ? normalizedSourcePath 
      : `file://${normalizedSourcePath}`;

    try {
      // Try clone --bare (preferred method)
      this.execCommand(`git clone --bare "${sourceUrl}" "${mirrorRepoPath}"`, process.cwd());
    } catch {
      // Fallback: create bare repo and fetch
      await fs.mkdir(mirrorRepoPath, { recursive: true });
      this.execCommand('git init --bare', mirrorRepoPath);

      // Add source repo as remote using file:// protocol for local paths
      const remoteUrl = process.platform === 'win32'
        ? normalizedSourcePath
        : `file://${normalizedSourcePath}`;

      try {
        this.execCommand(`git remote add source "${remoteUrl}"`, mirrorRepoPath);
      } catch {
        // Remote might already exist, try to set URL
        this.execCommand(`git remote set-url source "${remoteUrl}"`, mirrorRepoPath);
      }

      // Fetch all branches and tags from source
      this.execCommand('git fetch source --all --tags', mirrorRepoPath);
    }

    // Get default branch from source
    const defaultBranch = this.getDefaultBranch(sourceRepoPath);

    // Set default branch in mirror
    try {
      this.execCommand(
        `git symbolic-ref HEAD refs/heads/${defaultBranch}`,
        mirrorRepoPath
      );
    } catch {
      // If default branch doesn't exist in mirror, use main/master
      try {
        this.execCommand('git symbolic-ref HEAD refs/heads/main', mirrorRepoPath);
      } catch {
        this.execCommand('git symbolic-ref HEAD refs/heads/master', mirrorRepoPath);
      }
    }
  }

  /**
   * Push from source repo to mirror repo using namespaced refs
   * Uses format: refs/heads/gv/<projectId>/tracking/<branch>
   */
  async pushSourceToMirror(
    sourceRepoPath: string,
    mirrorRepoPath: string,
    branch: string,
    projectId: string
  ): Promise<void> {
    // Normalize paths for remote URL
    const normalizedMirrorPath = path.resolve(mirrorRepoPath).replace(/\\/g, '/');
    const mirrorUrl = process.platform === 'win32'
      ? normalizedMirrorPath
      : `file://${normalizedMirrorPath}`;

    // Ensure mirror remote exists in source repo
    try {
      this.execCommand(`git remote add mirror "${mirrorUrl}"`, sourceRepoPath);
    } catch {
      // Remote exists, update URL
      this.execCommand(`git remote set-url mirror "${mirrorUrl}"`, sourceRepoPath);
    }

    // Push branch to mirror using namespaced ref
    const namespacedRef = `refs/heads/gv/${projectId}/tracking/${branch}`;
    this.execCommand(`git push mirror ${branch}:${namespacedRef}`, sourceRepoPath);

    // Push all tags
    try {
      this.execCommand('git push mirror --tags', sourceRepoPath);
    } catch {
      // No tags to push, continue
    }
  }

  /**
   * Fetch namespaced ref from mirror and update relay repo branch
   * Uses explicit fetch + reset for deterministic behavior
   */
  async fetchMirrorRefToRelay(
    mirrorRepoPath: string,
    relayRepoPath: string,
    branch: string,
    projectId: string,
    refType: 'tracking' | 'relay' = 'tracking'
  ): Promise<void> {
    // Normalize paths for remote URL
    const normalizedMirrorPath = path.resolve(mirrorRepoPath).replace(/\\/g, '/');
    const mirrorUrl = process.platform === 'win32'
      ? normalizedMirrorPath
      : `file://${normalizedMirrorPath}`;

    // Ensure mirror remote exists in relay repo
    try {
      this.execCommand(`git remote add mirror "${mirrorUrl}"`, relayRepoPath);
    } catch {
      // Remote exists, update URL
      this.execCommand(`git remote set-url mirror "${mirrorUrl}"`, relayRepoPath);
    }

    // Build namespaced ref path
    const namespacedRef = refType === 'tracking'
      ? `refs/heads/gv/${projectId}/tracking/${branch}`
      : `refs/heads/gv/${projectId}/relay`;
    const remoteRef = `refs/remotes/mirror/gv/${projectId}/${refType === 'tracking' ? `tracking/${branch}` : 'relay'}`;

    // Fetch specific namespaced ref (explicit fetch, no pull)
    this.execCommand(`git fetch mirror ${namespacedRef}:${remoteRef}`, relayRepoPath);

    // Checkout branch if needed
    try {
      this.execCommand(`git checkout ${branch}`, relayRepoPath);
    } catch {
      // Branch doesn't exist locally, create it from mirror
      this.execCommand(`git checkout -B ${branch} ${remoteRef}`, relayRepoPath);
    }

    // Reset to match mirror (deterministic, explicit reset)
    this.execCommand(`git reset --hard ${remoteRef}`, relayRepoPath);
    this.execCommand('git clean -fd', relayRepoPath);
  }

  /**
   * Push relay integration branch to mirror repo using namespaced refs
   * Uses format: refs/heads/gv/<projectId>/relay
   */
  async pushRelayToMirror(
    relayRepoPath: string,
    mirrorRepoPath: string,
    branch: string,
    projectId: string
  ): Promise<void> {
    // Normalize paths for remote URL
    const normalizedMirrorPath = path.resolve(mirrorRepoPath).replace(/\\/g, '/');
    const mirrorUrl = process.platform === 'win32'
      ? normalizedMirrorPath
      : `file://${normalizedMirrorPath}`;

    // Ensure mirror remote exists in relay repo
    try {
      this.execCommand(`git remote add mirror "${mirrorUrl}"`, relayRepoPath);
    } catch {
      // Remote exists, update URL
      this.execCommand(`git remote set-url mirror "${mirrorUrl}"`, relayRepoPath);
    }

    // Push relay branch to mirror using namespaced ref
    const namespacedRef = `refs/heads/gv/${projectId}/relay`;
    this.execCommand(`git push mirror ${branch}:${namespacedRef}`, relayRepoPath);

    // Push all tags
    try {
      this.execCommand('git push mirror --tags', relayRepoPath);
    } catch {
      // No tags to push, continue
    }
  }

  /**
   * Delete mirror repo
   * Note: Only deletes if no other projects share this source path
   * Caller should check if other projects use the same source path before deleting
   */
  async deleteMirrorRepo(mirrorsDir: string, sourceRepoPath: string): Promise<void> {
    const mirrorRepoPath = this.getMirrorRepoPath(mirrorsDir, sourceRepoPath);
    try {
      await fs.rm(mirrorRepoPath, { recursive: true, force: true });
    } catch {
      // Mirror repo may not exist, ignore error
    }
  }
}
