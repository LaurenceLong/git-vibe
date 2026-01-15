import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { gitService } from './GitService.js';
import type { WorkItem, Project } from '../types/models.js';
import path from 'node:path';
import { STORAGE_CONFIG } from '../config/storage.js';

/**
 * WorkspaceService manages worktree initialization and maintenance for WorkItems
 *
 * Per PLAN.md Section 6:
 * - Ensure relay repo is present and clean
 * - Fetch/refresh base branch if needed
 * - Resolve base SHA: git rev-parse <base_branch>
 * - Create head branch name: head_branch = "wi/<workItemId>"
 * - Create worktree: git worktree add -b <head_branch> <worktree_path> <base_branch>
 * - Persist workspace fields and set workspace_status=ready
 */
export class WorkspaceService {
  /**
   * Initialize workspace for a WorkItem
   * Creates worktree and branch if they don't exist
   */
  async initWorkspace(workItem: WorkItem, project: Project): Promise<WorkItem> {
    const repoPath = project.relayRepoPath || project.sourceRepoPath;
    const baseBranch = project.defaultBranch;

    // Step 1: Ensure relay repo is present and clean
    await gitService.validateRepo(repoPath);
    gitService.ensureCleanWorktree(repoPath);

    // Step 2: Fetch/refresh base branch if needed (optional, assuming repo is up-to-date)

    // Step 3: Resolve base SHA
    const baseSha = gitService.getRefSha(repoPath, baseBranch);

    // Step 4: Create head branch name
    const headBranch = `wi/${workItem.id}`;

    // Step 5: Create worktree path
    const worktreePath = path.join(STORAGE_CONFIG.worktreesDir, workItem.id);

    // Step 6: Check if worktree already exists
    const worktreeStatus = gitService.getWorktreeStatus(repoPath, worktreePath);

    if (worktreeStatus === 'present') {
      // Worktree already exists, refresh head SHA
      const headSha = gitService.getWorktreeHead(worktreePath);

      // Update WorkItem with current state
      const updated = await workItemsRepository.update(workItem.id, {
        worktreePath,
        headBranch,
        baseBranch,
        baseSha,
        headSha,
        workspaceStatus: 'ready',
      });

      if (!updated) {
        throw new Error(`Failed to update WorkItem ${workItem.id}`);
      }

      return updated;
    }

    // Step 7: Create worktree with new branch
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

    // Step 8: Get initial head SHA (same as baseSha initially)
    const headSha = gitService.getWorktreeHead(worktreePath);

    // Step 9: Persist workspace fields
    const updated = await workItemsRepository.update(workItem.id, {
      worktreePath,
      headBranch,
      baseBranch,
      baseSha,
      headSha,
      workspaceStatus: 'ready',
    });

    if (!updated) {
      throw new Error(`Failed to update WorkItem ${workItem.id}`);
    }

    return updated;
  }

  /**
   * Ensure workspace exists (idempotent)
   * Returns the WorkItem with workspace initialized
   */
  async ensureWorkspace(workItem: WorkItem, project: Project): Promise<WorkItem> {
    // If workspace is already ready, just refresh head SHA
    if (workItem.workspaceStatus === 'ready' && workItem.worktreePath) {
      const repoPath = project.relayRepoPath || project.sourceRepoPath;
      const worktreeStatus = gitService.getWorktreeStatus(repoPath, workItem.worktreePath);

      if (worktreeStatus === 'present') {
        // Worktree exists, refresh head SHA
        return await this.refreshHeadSha(workItem);
      }
    }

    // Initialize workspace
    return await this.initWorkspace(workItem, project);
  }

  /**
   * Refresh cached head SHA for a WorkItem
   */
  async refreshHeadSha(workItem: WorkItem): Promise<WorkItem> {
    if (!workItem.worktreePath) {
      throw new Error(`WorkItem ${workItem.id} has no worktree path`);
    }

    // Get current head SHA from worktree
    const headSha = gitService.getWorktreeHead(workItem.worktreePath);

    // Update WorkItem with new head SHA
    const updated = await workItemsRepository.update(workItem.id, {
      headSha,
    });

    if (!updated) {
      throw new Error(`Failed to update WorkItem ${workItem.id}`);
    }

    return updated;
  }

  /**
   * Remove worktree for a WorkItem
   * Does not delete the branch, only removes the worktree
   */
  async removeWorktree(workItem: WorkItem, project: Project): Promise<void> {
    if (!workItem.worktreePath) {
      // No worktree to remove
      return;
    }

    const repoPath = project.relayRepoPath || project.sourceRepoPath;

    // Check if worktree exists
    const worktreeStatus = gitService.getWorktreeStatus(repoPath, workItem.worktreePath);

    if (worktreeStatus === 'present') {
      // Remove worktree
      gitService.removeWorktree(workItem.worktreePath, repoPath);
    }

    // Update WorkItem to reflect worktree removal
    await workItemsRepository.update(workItem.id, {
      worktreePath: undefined,
      workspaceStatus: 'not_initialized',
    });
  }

  /**
   * Delete both worktree and branch for a WorkItem
   * Use this when permanently deleting a WorkItem
   */
  async deleteWorkspace(workItem: WorkItem, project: Project): Promise<void> {
    if (!workItem.worktreePath) {
      // No workspace to delete
      return;
    }

    const repoPath = project.relayRepoPath || project.sourceRepoPath;

    // Remove worktree first
    await this.removeWorktree(workItem, project);

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
