import { gitService } from './GitService.js';
import type { WorkItem, Project } from '../types/models.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { STORAGE_CONFIG } from '../config/storage.js';

/**
 * Workspace state returned by workspace operations
 */
export interface WorkspaceState {
  worktreePath: string;
  headBranch: string;
  baseBranch: string;
  baseSha: string;
  headSha: string;
  workspaceStatus: 'ready' | 'not_initialized' | 'error';
}

/**
 * WorkspaceService manages worktree initialization and maintenance for WorkItems
 * Refactored to be stateless - returns workspace state instead of updating WorkItem directly
 *
 * Per PLAN.md Section 6:
 * - Ensure relay repo is present and clean
 * - Fetch/refresh base branch if needed
 * - Resolve base SHA: git rev-parse <base_branch>
 * - Create head branch name: head_branch = "wi/<workItemId>"
 * - Create worktree: git worktree add -b <head_branch> <worktree_path> <base_branch>
 * - Return workspace state (workflow will update WorkItem)
 */
export class WorkspaceService {
  /**
   * Initialize workspace for a WorkItem
   * Creates worktree and branch if they don't exist
   * Returns workspace state - workflow will update WorkItem
   */
  async initWorkspace(workItemId: string, project: Project): Promise<WorkspaceState> {
    const repoPath = project.relayRepoPath || project.sourceRepoPath;
    const baseBranch = project.defaultBranch;

    // Step 1: Ensure relay repo is present and clean
    await gitService.validateRepo(repoPath);
    gitService.ensureCleanWorktree(repoPath);

    // Step 2: Fetch/refresh base branch if needed (optional, assuming repo is up-to-date)

    // Step 3: Resolve base SHA
    const baseSha = gitService.getRefSha(repoPath, baseBranch);

    // Step 4: Create head branch name
    const headBranch = `wi/${workItemId}`;

    // Step 5: Create worktree path
    const worktreePath = path.join(STORAGE_CONFIG.worktreesDir, workItemId);

    // Step 6: Check if worktree already exists
    const worktreeStatus = gitService.getWorktreeStatus(repoPath, worktreePath);

    if (worktreeStatus === 'present') {
      // Worktree is registered in Git, check if directory exists on disk
      const dirExists = await fs
        .access(worktreePath)
        .then(() => true)
        .catch(() => false);

      if (dirExists) {
        // Worktree exists and directory is present, refresh head SHA
        const headSha = gitService.getWorktreeHead(worktreePath);

        // Return workspace state - workflow will update WorkItem
        return {
          worktreePath,
          headBranch,
          baseBranch,
          baseSha,
          headSha,
          workspaceStatus: 'ready',
        };
      } else {
        // Worktree is registered but directory is missing, prune stale worktree
        try {
          gitService.pruneWorktrees(repoPath);
        } catch (error) {
          console.warn(
            `Warning when pruning worktrees: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    // Step 7: Check if worktree directory exists on disk but is not registered
    try {
      const dirExists = await fs
        .access(worktreePath)
        .then(() => true)
        .catch(() => false);
      if (dirExists) {
        // Directory exists but is not a valid worktree, remove it
        await fs.rm(worktreePath, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore errors when checking/removing directory, proceed with worktree creation
      console.warn(
        `Warning when checking worktree directory: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Step 8: Create worktree with new branch
    try {
      gitService.createWorktree(repoPath, worktreePath, headBranch, baseBranch);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('already exists')) {
        // Branch already exists, try to create worktree from existing branch
        gitService.createWorktreeFromExistingBranch(repoPath, worktreePath, headBranch);
      } else {
        throw error;
      }
    }

    // Step 9: Get initial head SHA (same as baseSha initially)
    const headSha = gitService.getWorktreeHead(worktreePath);

    // Step 10: Return workspace state - workflow will update WorkItem
    return {
      worktreePath,
      headBranch,
      baseBranch,
      baseSha,
      headSha,
      workspaceStatus: 'ready',
    };
  }

  /**
   * Refresh cached head SHA for a WorkItem
   * Returns the new head SHA - workflow will update WorkItem
   */
  async refreshHeadSha(worktreePath: string): Promise<string> {
    // Get current head SHA from worktree
    return gitService.getWorktreeHead(worktreePath);
  }

  /**
   * Get workspace state if workspace already exists
   * Returns null if workspace doesn't exist
   */
  async getWorkspaceState(workItem: WorkItem, project: Project): Promise<WorkspaceState | null> {
    if (workItem.workspaceStatus === 'ready' && workItem.worktreePath) {
      const repoPath = project.relayRepoPath || project.sourceRepoPath;
      const worktreeStatus = gitService.getWorktreeStatus(repoPath, workItem.worktreePath);

      if (worktreeStatus === 'present') {
        // Worktree exists, refresh head SHA
        const headSha = await this.refreshHeadSha(workItem.worktreePath);
        return {
          worktreePath: workItem.worktreePath,
          headBranch: workItem.headBranch || `wi/${workItem.id}`,
          baseBranch: workItem.baseBranch || project.defaultBranch,
          baseSha: workItem.baseSha || gitService.getRefSha(repoPath, project.defaultBranch),
          headSha,
          workspaceStatus: 'ready',
        };
      }
    }

    return null;
  }

  /**
   * Ensure workspace exists (idempotent)
   * Returns workspace state - workflow will update WorkItem
   */
  async ensureWorkspace(workItem: WorkItem, project: Project): Promise<WorkspaceState> {
    // Check if workspace already exists
    const existingState = await this.getWorkspaceState(workItem, project);
    if (existingState) {
      return existingState;
    }

    // Initialize workspace
    return await this.initWorkspace(workItem.id, project);
  }

  /**
   * Remove worktree for a WorkItem
   * Does not delete the branch, only removes the worktree
   * Returns updated workspace state (workflow will persist)
   */
  async removeWorktree(workItem: WorkItem, project: Project): Promise<Partial<WorkspaceState>> {
    if (!workItem.worktreePath) {
      // No worktree to remove
      return {
        workspaceStatus: 'not_initialized',
      };
    }

    const repoPath = project.relayRepoPath || project.sourceRepoPath;

    // Check if worktree exists
    const worktreeStatus = gitService.getWorktreeStatus(repoPath, workItem.worktreePath);

    if (worktreeStatus === 'present') {
      // Remove worktree
      gitService.removeWorktree(workItem.worktreePath, repoPath);
    }

    // Return state indicating worktree removal (workflow will update WorkItem)
    return {
      worktreePath: '',
      workspaceStatus: 'not_initialized',
    };
  }

  /**
   * Delete both worktree and branch for a WorkItem
   * Use this when permanently deleting a WorkItem
   * Does not update the WorkItem in the database (since it's being deleted)
   */
  async deleteWorkspace(workItem: WorkItem, project: Project): Promise<void> {
    if (!workItem.worktreePath) {
      // No workspace to delete
      return;
    }

    const repoPath = project.relayRepoPath || project.sourceRepoPath;

    // Remove worktree directly (don't call removeWorktree as it tries to update the WorkItem)
    try {
      const worktreeStatus = gitService.getWorktreeStatus(repoPath, workItem.worktreePath);
      if (worktreeStatus === 'present') {
        gitService.removeWorktree(workItem.worktreePath, repoPath);
      }
    } catch (error) {
      // Worktree may not exist or may have been removed, log and continue
      console.warn(`Failed to remove worktree ${workItem.worktreePath}:`, error);
    }

    // Ensure worktree directory is removed (git worktree remove should do this, but be safe)
    try {
      const dirExists = await fs
        .access(workItem.worktreePath)
        .then(() => true)
        .catch(() => false);
      if (dirExists) {
        await fs.rm(workItem.worktreePath, { recursive: true, force: true });
      }
    } catch (error) {
      // Directory may not exist or may have been removed, log and continue
      console.warn(`Failed to remove worktree directory ${workItem.worktreePath}:`, error);
    }

    // Delete branch if it exists
    if (workItem.headBranch) {
      try {
        gitService.deleteBranch(workItem.headBranch, repoPath);
      } catch (error) {
        // Branch may not exist or may have been merged, continue
        console.warn(`Failed to delete branch ${workItem.headBranch}:`, error);
      }
    }
  }
}

export const workspaceService = new WorkspaceService();
