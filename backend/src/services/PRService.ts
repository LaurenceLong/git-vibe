import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { pullRequestsRepository } from '../repositories/PullRequestsRepository.js';
import { agentRunsRepository } from '../repositories/AgentRunsRepository.js';
import { gitService } from './GitService.js';
import type { WorkItem, PullRequest, Project, AgentRun } from '../types/models.js';

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
   * Get commits with task grouping and file information
   * Optimized to only fetch commits that belong to this workitem
   */
  async getCommitsWithTasks(
    pr: PullRequest,
    workItem: WorkItem,
    project: Project
  ): Promise<
    Array<{
      task: AgentRun | null;
      commits: Array<{
        sha: string;
        message: string;
        author: string;
        date: string;
        filesChanged: string[];
      }>;
    }>
  > {
    if (!workItem.baseSha || !workItem.headSha) {
      throw new Error(`WorkItem ${workItem.id} has missing SHAs`);
    }

    const repoPath = project.relayRepoPath || project.sourceRepoPath;
    const gitRepoPath = workItem.worktreePath || repoPath;

    // Get all agent runs (tasks) for this work item, ordered by creation time
    const tasks = await agentRunsRepository.findByWorkItemId(workItem.id);
    const sortedTasks = tasks.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Collect commit SHAs that belong to tasks
    const taskCommitShas = sortedTasks
      .map((task) => task.commitSha)
      .filter((sha): sha is string => sha !== null && sha !== undefined);

    console.log(
      `WorkItem ${workItem.id}: Found ${taskCommitShas.length} task commits out of ${sortedTasks.length} tasks`
    );

    // Get commits that belong to tasks (optimized: only fetch these specific commits)
    const taskCommitsMap = new Map<string, AgentRun>();
    for (const task of sortedTasks) {
      if (task.commitSha) {
        taskCommitsMap.set(task.commitSha, task);
      }
    }

    // Get task commits with file changes in a single optimized call
    let taskCommits: Array<{
      sha: string;
      message: string;
      author: string;
      date: string;
      filesChanged: string[];
    }> = [];

    if (taskCommitShas.length > 0) {
      try {
        // Use optimized method to get commits by their SHAs with file changes
        taskCommits = gitService.getCommitsByShas(gitRepoPath, taskCommitShas);
        console.log(`Got ${taskCommits.length} task commits with file changes`);
      } catch (error) {
        console.warn(`Failed to get task commits by SHAs, falling back:`, error);
        // Fallback: get commits individually
        taskCommits = [];
        for (const sha of taskCommitShas) {
          try {
            const commitDetails = gitService.getLogDetailed(gitRepoPath, sha);
            if (commitDetails.length > 0) {
              const commit = commitDetails[0];
              const filesChanged = gitService.getFilesChangedForCommit(sha, gitRepoPath);
              taskCommits.push({
                ...commit,
                filesChanged,
              });
            }
          } catch (err) {
            console.warn(`Failed to get commit ${sha}:`, err);
          }
        }
      }
    }

    // Get unassigned commits (commits in range that don't belong to any task)
    // Only get commits in the workitem range that are not already in taskCommits
    const taskCommitShaSet = new Set(taskCommitShas);
    let unassignedCommits: Array<{
      sha: string;
      message: string;
      author: string;
      date: string;
      filesChanged: string[];
    }> = [];

    try {
      // Determine the range to query
      let range: string;
      if (workItem.worktreePath) {
        // Use worktree range
        if (workItem.headBranch) {
          range = `${workItem.baseSha}..${workItem.headBranch}`;
        } else {
          range = `${workItem.baseSha}..HEAD`;
        }
      } else {
        range = `${workItem.baseSha}..${workItem.headSha}`;
      }

      // Get all commits in range with file changes in a single call
      const allCommitsInRange = gitService.getCommitsWithFiles(gitRepoPath, range);
      console.log(`Got ${allCommitsInRange.length} total commits in range`);

      // Filter to only commits that don't belong to tasks
      unassignedCommits = allCommitsInRange.filter((commit) => !taskCommitShaSet.has(commit.sha));
      console.log(`Found ${unassignedCommits.length} unassigned commits`);
    } catch (error) {
      console.warn(`Failed to get unassigned commits:`, error);
      // If getting all commits fails, we'll just return task commits
      unassignedCommits = [];
    }

    // Group commits by task
    const result: Array<{
      task: AgentRun | null;
      commits: Array<{
        sha: string;
        message: string;
        author: string;
        date: string;
        filesChanged: string[];
      }>;
    }> = [];

    // Group task commits by their associated task
    const commitsByTask = new Map<AgentRun, Array<typeof taskCommits[0]>>();
    for (const commit of taskCommits) {
      const task = taskCommitsMap.get(commit.sha);
      if (task) {
        if (!commitsByTask.has(task)) {
          commitsByTask.set(task, []);
        }
        commitsByTask.get(task)!.push(commit);
      }
    }

    // Add task groups in creation order
    for (const task of sortedTasks) {
      const commits = commitsByTask.get(task);
      if (commits && commits.length > 0) {
        result.push({
          task,
          commits,
        });
      }
    }

    // Add unassigned commits group if any
    if (unassignedCommits.length > 0) {
      result.push({
        task: null,
        commits: unassignedCommits,
      });
    }

    console.log(
      `Returning ${result.length} commit groups (${taskCommits.length} task commits, ${unassignedCommits.length} unassigned) for WorkItem ${workItem.id}`
    );

    return result;
  }

  /**
   * Get PR statistics (files changed, additions, deletions)
   */
  async getStatistics(
    pr: PullRequest,
    workItem: WorkItem,
    project: Project
  ): Promise<{
    filesChanged: number;
    additions: number;
    deletions: number;
  }> {
    if (!workItem.baseSha || !workItem.headSha) {
      return { filesChanged: 0, additions: 0, deletions: 0 };
    }

    const repoPath = project.relayRepoPath || project.sourceRepoPath;
    return gitService.getDiffStats(workItem.baseSha, workItem.headSha, repoPath);
  }

  /**
   * Check if PR can be merged
   * Returns mergeability status with reasons
   */
  async checkMergeability(
    pr: PullRequest,
    workItem: WorkItem,
    repoPath?: string
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
    // Use provided repoPath or try to derive it from worktreePath
    let mainRepoPath = repoPath;
    if (!mainRepoPath && workItem.worktreePath) {
      // Extract main repo path from worktree path (worktrees are typically in a subdirectory)
      const worktreeDir = workItem.worktreePath.substring(0, workItem.worktreePath.lastIndexOf(path.sep));
      const worktreesIndex = worktreeDir.lastIndexOf(path.sep + 'worktrees');
      if (worktreesIndex !== -1) {
        mainRepoPath = worktreeDir.substring(0, worktreesIndex);
      } else {
        // Fallback: use worktree path itself (might be the main repo)
        mainRepoPath = workItem.worktreePath;
      }
    }
    
    if (!mainRepoPath) {
      reasons.push('Cannot determine repository path for merge check');
      return { canMerge: false, reasons };
    }
    
    // Find if target branch is checked out in a worktree
    const targetBranchWorktree = gitService.findWorktreeForBranch(mainRepoPath, pr.targetBranch);
    const testMergePath = targetBranchWorktree || mainRepoPath;
    
    try {
      // Test merge to check for conflicts
      gitService.checkoutBranch(testMergePath, pr.targetBranch);
      gitService.testMergeNoCommit(testMergePath, pr.sourceBranch);
      // If we get here, no conflicts
      gitService.abortMerge(testMergePath);
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
    const { canMerge, reasons } = await this.checkMergeability(pr, workItem, repoPath);
    if (!canMerge) {
      throw new Error(`Cannot merge PR: ${reasons.join(', ')}`);
    }

    // Find if target branch is checked out in a worktree
    // If so, use that worktree path for merge operations
    const targetBranchWorktree = gitService.findWorktreeForBranch(repoPath, pr.targetBranch);
    const mergePath = targetBranchWorktree || repoPath;

    let mergeCommitSha: string;

    switch (strategy) {
      case 'merge':
        // Strategy: merge commit
        gitService.checkoutBranch(mergePath, pr.targetBranch);
        gitService.mergeBranch(mergePath, pr.sourceBranch, `Merge PR #${pr.id}: ${pr.title}`);
        mergeCommitSha = gitService.getHeadSha(mergePath);
        break;

      case 'squash':
        // Strategy: squash
        gitService.checkoutBranch(mergePath, pr.targetBranch);
        gitService.mergeSquashBranch(mergePath, pr.sourceBranch);
        gitService.commitChanges(mergePath, `Squash PR #${pr.id}: ${pr.title}`);
        mergeCommitSha = gitService.getHeadSha(mergePath);
        break;

      case 'rebase':
        // Strategy: rebase
        // For rebase, source branch might also be in a worktree
        const sourceBranchWorktree = gitService.findWorktreeForBranch(repoPath, pr.sourceBranch);
        const rebaseSourcePath = sourceBranchWorktree || repoPath;
        
        gitService.checkoutBranch(rebaseSourcePath, pr.sourceBranch);
        gitService.rebaseBranch(rebaseSourcePath, pr.targetBranch);
        gitService.checkoutBranch(mergePath, pr.targetBranch);
        gitService.mergeFFOnly(mergePath, pr.sourceBranch);
        mergeCommitSha = gitService.getHeadSha(mergePath);
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
