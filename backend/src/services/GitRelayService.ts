import fs from 'node:fs/promises';
import path from 'node:path';
import { GitMirrorService } from './GitMirrorService.js';

/**
 * Service for Git relay repository operations
 * Uses mirror repo as intermediate layer: source <-> mirror <-> relay
 */
export class GitRelayService {
  private mirrorService: GitMirrorService;

  constructor(
    private execCommand: (command: string, cwd: string) => string,
    private getDefaultBranch: (repoPath: string) => string,
    private mirrorsDir: string
  ) {
    this.mirrorService = new GitMirrorService(execCommand, getDefaultBranch);
  }

  async createRelayRepo(
    sourceRepoPath: string,
    relayRepoPath: string,
    mirrorRepoPath: string,
    projectId: string,
    branch?: string
  ): Promise<void> {
    // Use provided branch or get the default branch from source repo
    const defaultBranch = branch || this.getDefaultBranch(sourceRepoPath);

    // Step 1: Ensure mirror repo exists (using provided mirrorRepoPath)
    await this.mirrorService.ensureMirrorRepo(
      this.mirrorsDir,
      sourceRepoPath
    );

    // Step 2: Push source default branch to mirror using namespaced ref
    await this.mirrorService.pushSourceToMirror(
      sourceRepoPath,
      mirrorRepoPath,
      defaultBranch,
      projectId
    );

    // Step 3: Create relay repo directory
    await fs.mkdir(relayRepoPath, { recursive: true });

    // Step 4: Initialize relay repo
    this.execCommand('git init', relayRepoPath);

    // Step 5: Add mirror as remote
    const normalizedMirrorPath = path.resolve(mirrorRepoPath).replace(/\\/g, '/');
    const mirrorUrl = process.platform === 'win32'
      ? normalizedMirrorPath
      : `file://${normalizedMirrorPath}`;
    this.execCommand(`git remote add mirror "${mirrorUrl}"`, relayRepoPath);

    // Step 6: Fetch namespaced tracking ref from mirror
    const namespacedRef = `refs/heads/gv/${projectId}/tracking/${defaultBranch}`;
    const remoteRef = `refs/remotes/mirror/gv/${projectId}/tracking/${defaultBranch}`;
    this.execCommand(`git fetch mirror ${namespacedRef}:${remoteRef}`, relayRepoPath);

    // Step 7: Create local default branch from mirror tracking
    this.execCommand(`git checkout -B ${defaultBranch} ${remoteRef}`, relayRepoPath);

    // Step 8: Create relay integration branch from default
    this.execCommand(`git checkout -B relay ${defaultBranch}`, relayRepoPath);

    // Step 9: Push relay branch to mirror using namespaced ref
    await this.mirrorService.pushRelayToMirror(
      relayRepoPath,
      mirrorRepoPath,
      'relay',
      projectId
    );

    // Step 10: Remove origin remote if it exists (to prevent accidental pushes)
    try {
      this.execCommand('git remote remove origin', relayRepoPath);
    } catch {
      // Origin remote may not exist, continue silently
    }
  }

  async syncRelayToSource(
    relayRepoPath: string,
    sourceRepoPath: string,
    mirrorRepoPath: string,
    projectId: string
  ): Promise<string | null> {
    // Get the default branch from source repo
    const defaultBranch = this.getDefaultBranch(sourceRepoPath);

    // Phase 0: Ensure relay integration branch is up to date
    // (This should have been done before sync, but ensure it here)
    this.execCommand('git checkout relay', relayRepoPath);
    
    // Push relay integration branch to mirror using namespaced ref
    await this.mirrorService.pushRelayToMirror(
      relayRepoPath,
      mirrorRepoPath,
      'relay',
      projectId
    );

    // Phase 1: Refresh mirror tracking/<A> from source
    // Update source from origin if applicable, then push to mirror
    try {
      this.execCommand('git fetch origin --prune --tags', sourceRepoPath);
      this.execCommand(`git checkout ${defaultBranch}`, sourceRepoPath);
      this.execCommand(`git reset --hard origin/${defaultBranch}`, sourceRepoPath);
    } catch {
      // Origin may not exist or branch may not be tracked, continue
    }

    // Push source default branch to mirror using namespaced ref
    await this.mirrorService.pushSourceToMirror(
      sourceRepoPath,
      mirrorRepoPath,
      defaultBranch,
      projectId
    );

    // Phase 2: Rebase/merge latest A into relay integration & resolve conflicts
    // Fetch latest tracking A from mirror
    const namespacedTrackingRef = `refs/heads/gv/${projectId}/tracking/${defaultBranch}`;
    const remoteTrackingRef = `refs/remotes/mirror/gv/${projectId}/tracking/${defaultBranch}`;
    
    const normalizedMirrorPath = path.resolve(mirrorRepoPath).replace(/\\/g, '/');
    const mirrorUrl = process.platform === 'win32'
      ? normalizedMirrorPath
      : `file://${normalizedMirrorPath}`;
    
    try {
      this.execCommand(`git remote add mirror "${mirrorUrl}"`, relayRepoPath);
    } catch {
      this.execCommand(`git remote set-url mirror "${mirrorUrl}"`, relayRepoPath);
    }

    // Explicit fetch (no pull)
    this.execCommand(`git fetch mirror ${namespacedTrackingRef}:${remoteTrackingRef}`, relayRepoPath);

    // Update local default branch to match mirror tracking
    this.execCommand(`git checkout ${defaultBranch}`, relayRepoPath);
    this.execCommand(`git reset --hard ${remoteTrackingRef}`, relayRepoPath);

    // Merge default branch into relay
    this.execCommand('git checkout relay', relayRepoPath);
    try {
      this.execCommand(`git merge --no-ff ${defaultBranch} -m "Merge ${defaultBranch} into relay"`, relayRepoPath);
    } catch {
      // Merge conflict - commit if needed
      const status = this.execCommand('git status --porcelain', relayRepoPath).trim();
      if (status.length > 0) {
        this.execCommand('git add -A', relayRepoPath);
        this.execCommand('git commit -m "Resolve merge conflicts"', relayRepoPath);
      }
    }

    // Push updated relay to mirror
    await this.mirrorService.pushRelayToMirror(
      relayRepoPath,
      mirrorRepoPath,
      'relay',
      projectId
    );

    // Phase 3: Apply relay integration to source A
    // Fetch relay from mirror
    const namespacedRelayRef = `refs/heads/gv/${projectId}/relay`;
    const remoteRelayRef = `refs/remotes/mirror/gv/${projectId}/relay`;
    
    try {
      this.execCommand(`git remote add mirror "${mirrorUrl}"`, sourceRepoPath);
    } catch {
      this.execCommand(`git remote set-url mirror "${mirrorUrl}"`, sourceRepoPath);
    }

    // Explicit fetch (no pull)
    this.execCommand(`git fetch mirror ${namespacedRelayRef}:${remoteRelayRef}`, sourceRepoPath);

    // Ensure on default branch and clean
    this.execCommand(`git checkout ${defaultBranch}`, sourceRepoPath);

    // Merge relay into default (no reset --hard, preserve working directory)
    try {
      this.execCommand(`git merge --no-ff ${remoteRelayRef} -m "Merge relay into ${defaultBranch}"`, sourceRepoPath);
    } catch (error) {
      // Merge conflict - this is expected in some cases
      throw new Error(`Merge conflict when merging relay into ${defaultBranch}. Please resolve conflicts manually.`);
    }

    // Push updates to origin (if exists) and mirror
    try {
      this.execCommand(`git push origin ${defaultBranch}`, sourceRepoPath);
    } catch {
      // Origin may not exist, continue
    }

    // Push updated default branch to mirror
    await this.mirrorService.pushSourceToMirror(
      sourceRepoPath,
      mirrorRepoPath,
      defaultBranch,
      projectId
    );

    // Phase 4: Sync relay default branch to mirror tracking
    await this.mirrorService.fetchMirrorRefToRelay(
      mirrorRepoPath,
      relayRepoPath,
      defaultBranch,
      projectId,
      'tracking'
    );

    // Return the commit SHA of the default branch in source repo
    const commitSha = this.execCommand('git rev-parse HEAD', sourceRepoPath).trim();
    return commitSha;
  }
}
