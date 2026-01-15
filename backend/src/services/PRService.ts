import { v4 as uuidv4 } from 'uuid';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { pullRequestsRepository } from '../repositories/PullRequestsRepository.js';
import { gitService } from './GitService.js';
import type { WorkItem, PullRequest, Project } from '../types/models.js';

/**
 * PRService manages Pull Request operations for WorkItems
 *
 * Per PLAN.md Sections 8 and 9:
 * - Diff: git diff --no-color <base_sha>..<head_sha>
 * - Commits: git log --oneline <base_sha>..<head_sha>
 * - Mergeability: check PR status, no running runs, lock free, no conflicts
 * - Merge strategies: merge commit, squash, rebase
 */
export class PRService {
  /**
   * Open a PR for a WorkItem
   * Creates a PullRequest record if one doesn't exist
   */
  async openPR(workItem: WorkItem, project: Project): Promise<PullRequest> {
    // Check if PR already exists for this WorkItem
    const existingPR = await pullRequestsRepository.findByWorkItemId(workItem.id);
    if (existingPR) {
      return existingPR;
    }

    // Ensure workspace is initialized
    if (!workItem.worktreePath || !workItem.headBranch || !workItem.baseBranch) {
      throw new Error(`WorkItem ${workItem.id} workspace is not initialized`);
    }

    // Create new PR
    const pr = await pullRequestsRepository.create({
      id: uuidv4(),
      projectId: project.id,
      workItemId: workItem.id,
      title: workItem.title,
      description: workItem.body || undefined,
      status: 'open',
      sourceBranch: workItem.headBranch,
      targetBranch: workItem.baseBranch,
      mergeStrategy: 'merge',
    });

    return pr;
  }

  /**
   * Get diff between base and head SHAs
   * Returns: git diff --no-color <base_sha>..<head_sha>
   */
  async getDiff(_pr: PullRequest, workItem: WorkItem, project: Project): Promise<string> {
    if (!workItem.baseSha || !workItem.headSha) {
      throw new Error(`WorkItem ${workItem.id} has missing SHAs`);
    }

    const repoPath = project.relayRepoPath || project.sourceRepoPath;
    return gitService.getDiff(workItem.baseSha, workItem.headSha, repoPath);
  }

  /**
   * Get commits for PR
   * Returns: git log --oneline <base_sha>..<head_sha>
   */
  async getCommits(_pr: PullRequest, workItem: WorkItem, project: Project): Promise<string[]> {
    if (!workItem.baseSha || !workItem.headSha) {
      throw new Error(`WorkItem ${workItem.id} has missing SHAs`);
    }

    const repoPath = project.relayRepoPath || project.sourceRepoPath;

    // Use git log --oneline to get commit list
    const commits = gitService.getLogOneline(repoPath, `${workItem.baseSha}..${workItem.headSha}`);

    if (!commits) {
      return [];
    }

    return commits.split('\n').filter((line) => line.length > 0);
  }

  /**
   * Check if PR can be merged
   * Returns mergeability status with reasons
   */
  async checkMergeability(
    pr: PullRequest,
    workItem: WorkItem
  ): Promise<{
    canMerge: boolean;
    reasons: string[];
  }> {
    const reasons: string[] = [];

    // Check 1: PR status must be open
    if (pr.status !== 'open') {
      reasons.push(`PR is ${pr.status}`);
      return { canMerge: false, reasons };
    }

    // Check 2: No agent runs should be running for this WorkItem
    // This is checked via the lock mechanism
    const lockStatus = await workItemsRepository.isLocked(workItem.id);
    if (lockStatus.locked) {
      reasons.push('WorkItem is locked (agent run in progress)');
    }

    // Check 3: Workspace lock must be free
    if (lockStatus.locked) {
      reasons.push('Workspace lock is not free');
    }

    // Check 4: No conflicts when merging head into base
    const repoPath = workItem.worktreePath || '';
    try {
      // Test merge to check for conflicts
      gitService.checkoutBranch(repoPath, pr.targetBranch);
      gitService.testMergeNoCommit(repoPath, pr.sourceBranch);
      // If we get here, no conflicts
      gitService.abortMerge(repoPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('conflict') || errorMessage.includes('CONFLICT')) {
        reasons.push('Merge conflicts detected');
      } else {
        // Other errors (e.g., checkout failed)
        reasons.push(`Merge check failed: ${errorMessage}`);
      }
    }

    const canMerge = reasons.length === 0;
    return { canMerge, reasons };
  }

  /**
   * Merge PR into base branch using specified strategy
   * Strategies: merge, squash, rebase
   */
  async mergePR(
    pr: PullRequest,
    workItem: WorkItem,
    project: Project,
    strategy: 'merge' | 'squash' | 'rebase' = 'merge'
  ): Promise<PullRequest> {
    const repoPath = project.relayRepoPath || project.sourceRepoPath;

    // Check mergeability first
    const { canMerge, reasons } = await this.checkMergeability(pr, workItem);
    if (!canMerge) {
      throw new Error(`Cannot merge PR: ${reasons.join(', ')}`);
    }

    let mergeCommitSha: string;

    switch (strategy) {
      case 'merge':
        // Strategy: merge commit
        gitService.checkoutBranch(repoPath, pr.targetBranch);
        gitService.mergeBranch(repoPath, pr.sourceBranch, `Merge PR #${pr.id}: ${pr.title}`);
        mergeCommitSha = gitService.getHeadSha(repoPath);
        break;

      case 'squash':
        // Strategy: squash
        gitService.checkoutBranch(repoPath, pr.targetBranch);
        gitService.mergeSquashBranch(repoPath, pr.sourceBranch);
        gitService.commitChanges(repoPath, `Squash PR #${pr.id}: ${pr.title}`);
        mergeCommitSha = gitService.getHeadSha(repoPath);
        break;

      case 'rebase':
        // Strategy: rebase
        gitService.checkoutBranch(repoPath, pr.sourceBranch);
        gitService.rebaseBranch(repoPath, pr.targetBranch);
        gitService.checkoutBranch(repoPath, pr.targetBranch);
        gitService.mergeFFOnly(repoPath, pr.sourceBranch);
        mergeCommitSha = gitService.getHeadSha(repoPath);
        break;

      default:
        throw new Error(`Unknown merge strategy: ${strategy}`);
    }

    // Update PR status
    const updatedPR = await pullRequestsRepository.update(pr.id, {
      status: 'merged',
      mergedAt: new Date(),
      mergedBy: 'system', // Could be user ID in the future
      mergeCommitSha,
    });

    if (!updatedPR) {
      throw new Error(`Failed to update PR ${pr.id}`);
    }

    return updatedPR;
  }

  /**
   * Close PR without merging
   */
  async closePR(pr: PullRequest): Promise<PullRequest> {
    const updatedPR = await pullRequestsRepository.update(pr.id, {
      status: 'closed',
    });

    if (!updatedPR) {
      throw new Error(`Failed to update PR ${pr.id}`);
    }

    return updatedPR;
  }

  /**
   * Update PR base branch (optional)
   * Refreshes baseSha to latest base_branch and optionally rebases head
   */
  async updateBase(
    pr: PullRequest,
    workItem: WorkItem,
    project: Project,
    rebase: boolean = false
  ): Promise<{ pr: PullRequest; workItem: WorkItem }> {
    const repoPath = project.relayRepoPath || project.sourceRepoPath;

    // Get latest base SHA
    const latestBaseSha = gitService.getRefSha(repoPath, pr.targetBranch);

    // Update WorkItem baseSha
    const updatedWorkItem = await workItemsRepository.update(workItem.id, {
      baseSha: latestBaseSha,
    });

    if (!updatedWorkItem) {
      throw new Error(`Failed to update WorkItem ${workItem.id}`);
    }

    // Optionally rebase head onto new base
    if (rebase && workItem.worktreePath) {
      try {
        gitService.rebaseBranch(workItem.worktreePath, pr.targetBranch);
        // Update head SHA after rebase
        const newHeadSha = gitService.getHeadSha(workItem.worktreePath);
        await workItemsRepository.update(workItem.id, {
          headSha: newHeadSha,
        });
      } catch (error) {
        // Rebase failed, abort
        gitService.abortRebase(workItem.worktreePath);
        throw new Error(`Rebase failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Update PR target branch if changed
    const updatedPR = await pullRequestsRepository.update(pr.id, {
      targetBranch: pr.targetBranch,
    });

    if (!updatedPR) {
      throw new Error(`Failed to update PR ${pr.id}`);
    }

    return { pr: updatedPR, workItem: updatedWorkItem };
  }
}

export const prService = new PRService();
