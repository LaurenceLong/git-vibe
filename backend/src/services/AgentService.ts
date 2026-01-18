import { v4 as uuidv4 } from 'uuid';
import { projectsRepository } from '../repositories/ProjectsRepository.js';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { agentRunsRepository } from '../repositories/AgentRunsRepository.js';
import { pullRequestsRepository } from '../repositories/PullRequestsRepository.js';
import { gitService } from '../services/GitService.js';
import { workspaceService } from './WorkspaceService.js';
import { prService } from './PRService.js';
import { openCodeAgentAdapter } from './OpenCodeAgentAdapter.js';
import { claudeCodeAgentAdapter } from './ClaudeCodeAgentAdapter.js';
import { PromptBuilder } from './PromptBuilder.js';
import type { Project, WorkItem, AgentRun, PullRequest } from '../types/models.js';

export type AgentType = 'opencode' | 'claudecode';

export interface AgentConfig {
  executablePath: string;
  baseArgs?: string[];
  model?: string;
  agent?: string;
}

export interface AgentParams {
  agentType?: AgentType;
  model?: string;
  agent?: string;
  [key: string]: unknown;
}

export interface TaskExecutionResult {
  workItem: {
    id: string;
    title: string;
    body?: string;
  };
  pullRequest?: PullRequest;
  agentRun: AgentRun;
}

export class AgentService {
  private agentAdapters: Map<
    AgentType,
    typeof openCodeAgentAdapter | typeof claudeCodeAgentAdapter
  >;
  // Track running tasks per project for concurrency limit enforcement
  private runningTasksPerProject = new Map<string, Set<string>>();

  constructor() {
    this.agentAdapters = new Map([
      ['opencode', openCodeAgentAdapter],
      ['claudecode', claudeCodeAgentAdapter],
    ]);
  }

  /**
   * Get the number of currently running tasks for a project
   */
  private getRunningTaskCount(projectId: string): number {
    return this.runningTasksPerProject.get(projectId)?.size || 0;
  }

  /**
   * Check if a project can start a new task based on concurrency limit
   */
  private async canStartTask(projectId: string): Promise<boolean> {
    const project = await projectsRepository.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const maxConcurrency = project.maxAgentConcurrency || 3;
    const runningCount = this.getRunningTaskCount(projectId);

    return runningCount < maxConcurrency;
  }

  /**
   * Track a task as running for a project
   */
  private trackRunningTask(projectId: string, agentRunId: string): void {
    if (!this.runningTasksPerProject.has(projectId)) {
      this.runningTasksPerProject.set(projectId, new Set());
    }
    this.runningTasksPerProject.get(projectId)!.add(agentRunId);
  }

  /**
   * Untrack a running task for a project
   */
  private untrackRunningTask(projectId: string, agentRunId: string): void {
    const tasks = this.runningTasksPerProject.get(projectId);
    if (tasks) {
      tasks.delete(agentRunId);
      if (tasks.size === 0) {
        this.runningTasksPerProject.delete(projectId);
      }
    }
  }

  /**
   * Parse agent params from project's agentParams JSON string
   */
  private parseAgentParams(agentParamsJson: string | null): AgentParams {
    if (!agentParamsJson) {
      return {};
    }
    try {
      return JSON.parse(agentParamsJson) as AgentParams;
    } catch {
      return {};
    }
  }

  /**
   * Get the appropriate agent adapter for the given agent type
   */
  private getAgentAdapter(agentType: AgentType) {
    const adapter = this.agentAdapters.get(agentType);
    if (!adapter) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }
    return adapter;
  }

  /**
   * Build agent config from project settings
   */
  private buildAgentConfig(project: Project, agentParams: AgentParams): AgentConfig {
    const agentType = agentParams.agentType || (project.defaultAgent as AgentType) || 'opencode';

    // Default executable paths based on agent type
    const defaultExecutablePaths: Record<AgentType, string> = {
      opencode: 'opencode',
      claudecode: 'claude',
    };

    return {
      executablePath: (agentParams.executablePath as string) || defaultExecutablePaths[agentType],
      baseArgs: agentParams.baseArgs as string[],
      model: agentParams.model,
      agent: agentParams.agent,
    };
  }

  /**
   * Open a PR for a WorkItem
   * Rules:
   * - Deterministic branch name: Same WorkItem → same branch name every time
   * - Stable worktree: Don't delete worktree unless WorkItem is closed/deleted
   * - Reopen support: Reuse existing worktree when reopening a WorkItem
   */
  private async openPRForWorkItem(workItem: WorkItem, project: Project): Promise<PullRequest> {
    // Ensure workspace is initialized
    const updatedWorkItem = await workspaceService.ensureWorkspace(workItem, project);

    // Open PR for the WorkItem
    const pr = await prService.openPR(updatedWorkItem, project);

    return pr;
  }

  /**
   * Close existing PR if there's no diff between base and head
   * This ensures PRs with no changes are automatically closed
   */
  private async closeExistingPRIfNoDiff(workItem: WorkItem, headSha?: string): Promise<void> {
    // Check if PR exists for this WorkItem
    const existingPR = await pullRequestsRepository.findByWorkItemId(workItem.id);
    if (!existingPR || existingPR.status !== 'open') {
      // No PR exists or PR is already closed/merged
      return;
    }

    // Verify there's actually no diff before closing
    if (!workItem.worktreePath || !workItem.baseSha) {
      // Can't verify diff, skip closing
      return;
    }

    try {
      // Use provided headSha or get current HEAD
      const currentHeadSha = headSha || gitService.getHeadSha(workItem.worktreePath);
      const diff = gitService.getDiff(workItem.baseSha, currentHeadSha, workItem.worktreePath);
      const hasActualChanges = diff.trim().length > 0;

      if (!hasActualChanges) {
        // No diff - close the PR
        await prService.closePR(existingPR);
      }
    } catch (error) {
      // If we can't get the diff, don't close the PR (fail safe)
      console.error(`Failed to check diff for PR ${existingPR.id}:`, error);
    }
  }

  /**
   * Clean up worktree for a closed WorkItem
   * Only removes worktree when WorkItem is closed or deleted
   */
  async cleanupWorkItemWorktree(workItem: WorkItem): Promise<void> {
    const project = await projectsRepository.findById(workItem.projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Remove worktree
    await workspaceService.removeWorktree(workItem, project);
  }

  /**
   * Start an agent run for a WorkItem
   */
  private async startAgentRun(
    workItem: WorkItem,
    project: Project,
    prompt: string,
    agentParams: AgentParams,
    options?: {
      sessionId?: string;
      linkedAgentRunId?: string;
    }
  ): Promise<AgentRun> {
    // Validate prompt
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required and must be a string');
    }
    // Check concurrency limit
    const canStart = await this.canStartTask(project.id);
    if (!canStart) {
      throw new Error(
        `Maximum agent concurrency limit (${project.maxAgentConcurrency || 3}) reached for project. Please wait for existing tasks to complete.`
      );
    }

    // Ensure workspace is initialized
    const updatedWorkItem = await workspaceService.ensureWorkspace(workItem, project);

    // Acquire workspace lock
    const runId = uuidv4();
    const lockAcquired = await workItemsRepository.acquireLock(
      updatedWorkItem.id,
      runId,
      3600000 * 6 // Default TTL: 6 hour in milliseconds
    );

    if (!lockAcquired) {
      const lockStatus = await workItemsRepository.isLocked(updatedWorkItem.id);
      throw new Error(
        `WorkItem is locked by another agent run. Owner: ${lockStatus.ownerRunId}, Expires: ${lockStatus.expiresAt}`
      );
    }

    try {
      const agentType = agentParams.agentType || (project.defaultAgent as AgentType) || 'opencode';
      const adapter = this.getAgentAdapter(agentType);
      const config = this.buildAgentConfig(project, agentParams);

      // Validate agent executable
      await adapter.validate({ executablePath: config.executablePath });

      // Determine session_id: WorkItem-scoped by default
      const sessionId = options?.sessionId || `wi-${updatedWorkItem.id}`;

      // Determine head SHA before run
      const headShaBefore = gitService.getHeadSha(updatedWorkItem.worktreePath || '');

      // Create agent run record
      const agentRun = await agentRunsRepository.create({
        id: runId,
        workItemId: updatedWorkItem.id,
        projectId: project.id,
        agentKey: agentType,
        inputSummary: prompt ? prompt.substring(0, 200) : undefined,
        inputJson: JSON.stringify({
          prompt,
          config,
        }),
        sessionId,
        linkedAgentRunId: options?.linkedAgentRunId,
      });

      // Mark as running
      await agentRunsRepository.update(runId, {
        status: 'running',
        startedAt: new Date(),
        headShaBefore,
      });

      // Track as running
      this.trackRunningTask(project.id, runId);

      // Execute agent asynchronously
      adapter
        .run({
          worktreePath: updatedWorkItem.worktreePath || '',
          agentRunId: runId,
          prompt,
          config,
        })
        .catch(async (error: unknown) => {
          await agentRunsRepository.update(runId, {
            status: 'failed',
            log: `Failed to start agent process: ${error instanceof Error ? error.message : String(error)}`,
            finishedAt: new Date(),
          });
          this.untrackRunningTask(project.id, runId);
          // Release lock
          await workItemsRepository.releaseLock(updatedWorkItem.id, runId);
        });

      return agentRun;
    } catch (error) {
      // Release lock on error
      await workItemsRepository.releaseLock(updatedWorkItem.id, runId);
      throw error;
    }
  }

  /**
   * Execute a task: start agent automatically (PR will be created after agent finishes if there are changes)
   */
  async executeTask(
    projectId: string,
    workItemId: string,
    workItemTitle: string,
    workItemBody?: string,
    userMessage?: string
  ): Promise<TaskExecutionResult> {
    try {
      // Get project to retrieve agent settings
      const project = await projectsRepository.findById(projectId);
      if (!project) {
        throw new Error(`Project not found for work item ${workItemId}`);
      }

      // Get WorkItem
      const workItem = await workItemsRepository.findById(workItemId);
      if (!workItem) {
        throw new Error(`WorkItem not found: ${workItemId}`);
      }

      // Parse agent params from project
      const agentParams = this.parseAgentParams(project.agentParams);

      // Ensure workspace is initialized (needed for agent run, but don't create PR yet)
      await workspaceService.ensureWorkspace(workItem, project);

      // Build prompt from work item or user message
      let prompt: string;
      if (userMessage && userMessage.trim()) {
        // For conversation messages, use markdown format
        prompt = PromptBuilder.buildConversationPrompt(userMessage);
      } else {
        // For regular task execution, use markdown format
        const description = workItem.body ?? workItemBody ?? '';
        prompt = PromptBuilder.buildTaskPrompt(workItemTitle, description);
      }

      console.log(`[AgentService] Building prompt for work item ${workItemId}`);
      console.log(`[AgentService] Title: ${workItemTitle}`);
      console.log(`[AgentService] Final prompt length: ${prompt.length} characters`);

      // Start agent run
      const agentRun = await this.startAgentRun(workItem, project, prompt, agentParams);

      return {
        workItem: {
          id: workItemId,
          title: workItemTitle,
          body: workItemBody,
        },
        // PR will be created in finalizeAgentRun if there are changes
        agentRun,
      };
    } catch (error) {
      // Enhance error messages with context
      if (error instanceof Error) {
        const errorMessage = error.message;
        // Add context about which work item failed
        throw new Error(`Failed to execute task for work item ${workItemId}: ${errorMessage}`);
      }
      throw error;
    }
  }

  /**
   * Cancel a running agent task
   */
  async cancelTask(agentRunId: string): Promise<void> {
    const agentRun = await agentRunsRepository.findById(agentRunId);
    if (!agentRun) {
      throw new Error('Agent run not found');
    }

    const adapter = this.getAgentAdapter(agentRun.agentKey as AgentType);
    await adapter.cancel(agentRunId);

    await agentRunsRepository.update(agentRunId, {
      status: 'cancelled',
      finishedAt: new Date(),
    });

    // Get WorkItem to untrack task and release lock
    const workItem = await workItemsRepository.findById(agentRun.workItemId);
    if (workItem) {
      this.untrackRunningTask(workItem.projectId, agentRunId);
      await workItemsRepository.releaseLock(workItem.id, agentRunId);
    }
  }

  /**
   * Resume a task using the same session_id
   */
  async resumeTask(agentRunId: string, prompt: string): Promise<AgentRun> {
    const agentRun = await agentRunsRepository.findById(agentRunId);
    if (!agentRun) {
      throw new Error('Agent run not found');
    }

    // Check if the original run has a session_id
    if (!agentRun.sessionId) {
      throw new Error('Cannot resume task: original task has no session_id');
    }

    const workItem = await workItemsRepository.findById(agentRun.workItemId);
    if (!workItem) {
      throw new Error('WorkItem not found');
    }

    const project = await projectsRepository.findById(workItem.projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const agentParams = this.parseAgentParams(project.agentParams);
    const agentType = agentParams.agentType || (project.defaultAgent as AgentType) || 'opencode';
    const adapter = this.getAgentAdapter(agentType);
    const config = this.buildAgentConfig(project, agentParams);

    // Check concurrency limit
    const canStart = await this.canStartTask(project.id);
    if (!canStart) {
      throw new Error(
        `Maximum agent concurrency limit (${project.maxAgentConcurrency || 3}) reached for project. Please wait for existing tasks to complete.`
      );
    }

    // Extract original prompt from the original run
    let originalPrompt = '';
    try {
      const originalInputJson = JSON.parse(agentRun.inputJson) as {
        prompt?: string;
        config?: AgentConfig;
      };
      originalPrompt = originalInputJson.prompt || '';

      // Fallback to inputSummary if prompt is not available
      if (!originalPrompt && agentRun.inputSummary) {
        originalPrompt = agentRun.inputSummary;
      }
    } catch {
      // If JSON parsing fails, use inputSummary as fallback
      if (agentRun.inputSummary) {
        originalPrompt = agentRun.inputSummary;
      }
    }

    // Build resume prompt using markdown format
    const combinedPrompt = PromptBuilder.buildResumePrompt(
      originalPrompt || '',
      prompt,
      workItem.title
    );

    // Create new agent run record linked to the original
    const newRunId = uuidv4();
    const newAgentRun = await agentRunsRepository.create({
      id: newRunId,
      workItemId: workItem.id,
      projectId: project.id,
      agentKey: agentType,
      inputSummary: combinedPrompt ? combinedPrompt.substring(0, 200) : undefined,
      inputJson: JSON.stringify({
        prompt: combinedPrompt,
        originalPrompt,
        newPrompt: prompt,
        config,
      }),
      sessionId: agentRun.sessionId, // Reuse the same session_id
      linkedAgentRunId: agentRunId, // Link to the original run
    });

    // Mark as running
    await agentRunsRepository.update(newRunId, {
      status: 'running',
      startedAt: new Date(),
    });

    // Track as running
    this.trackRunningTask(project.id, newRunId);

    // Execute agent with session continuation
    adapter
      .correctWithReviewComments({
        worktreePath: workItem.worktreePath || '',
        agentRunId: newRunId,
        sessionId: agentRun.sessionId,
        reviewComments: combinedPrompt,
        config,
      })
      .catch(async (error: unknown) => {
        await agentRunsRepository.update(newRunId, {
          status: 'failed',
          log: `Failed to resume agent process: ${error instanceof Error ? error.message : String(error)}`,
          finishedAt: new Date(),
        });
        this.untrackRunningTask(project.id, newRunId);
        await workItemsRepository.releaseLock(workItem.id, newRunId);
      });

    return newAgentRun;
  }

  /**
   * Restart a task with the same prompt
   */
  async restartTask(agentRunId: string): Promise<AgentRun> {
    const agentRun = await agentRunsRepository.findById(agentRunId);
    if (!agentRun) {
      throw new Error('Agent run not found');
    }

    const workItem = await workItemsRepository.findById(agentRun.workItemId);
    if (!workItem) {
      throw new Error('WorkItem not found');
    }

    const project = await projectsRepository.findById(workItem.projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Parse original input and extract prompt
    let prompt: string;
    try {
      const inputJson = JSON.parse(agentRun.inputJson) as { prompt?: string; config?: AgentConfig };
      // Try to get prompt from inputJson
      prompt = inputJson.prompt || '';

      // Fallback to inputSummary if prompt is not available
      if (!prompt && agentRun.inputSummary) {
        prompt = agentRun.inputSummary;
      }

      // Final fallback to workItem title
      if (!prompt && workItem.title) {
        prompt = workItem.title;
      }

      // If still no prompt, throw an error
      if (!prompt) {
        throw new Error('Cannot restart task: original prompt not found');
      }
    } catch (error) {
      // If JSON parsing fails or prompt extraction fails, use fallbacks
      if (agentRun.inputSummary) {
        prompt = agentRun.inputSummary;
      } else if (workItem.title) {
        prompt = workItem.title;
      } else {
        throw new Error('Cannot restart task: no prompt available');
      }
    }

    const agentParams = this.parseAgentParams(project.agentParams);

    // Start new agent run
    return await this.startAgentRun(workItem, project, prompt, agentParams);
  }

  /**
   * Get task status
   */
  async getTaskStatus(agentRunId: string): Promise<{ status: string; agentRun: AgentRun }> {
    const agentRun = await agentRunsRepository.findById(agentRunId);
    if (!agentRun) {
      throw new Error('Agent run not found');
    }

    const adapter = this.getAgentAdapter(agentRun.agentKey as AgentType);
    const { status } = await adapter.getStatus(agentRunId);

    // Update status in database if it changed
    if (status !== agentRun.status) {
      await agentRunsRepository.update(agentRunId, {
        status,
        finishedAt: ['succeeded', 'failed', 'cancelled'].includes(status) ? new Date() : undefined,
      });

      // Untrack if task is no longer running
      if (status !== 'running') {
        const workItem = await workItemsRepository.findById(agentRun.workItemId);
        if (workItem) {
          this.untrackRunningTask(workItem.projectId, agentRunId);
          await workItemsRepository.releaseLock(workItem.id, agentRunId);
        }
      }
    }

    return {
      status,
      agentRun,
    };
  }

  /**
   * Get all running tasks for a project
   */
  async getProjectRunningTasks(projectId: string): Promise<AgentRun[]> {
    const workItems = await workItemsRepository.findByProjectId(projectId);
    const allAgentRuns: AgentRun[] = [];

    for (const workItem of workItems) {
      const runs = await agentRunsRepository.findByWorkItemId(workItem.id);
      allAgentRuns.push(...runs.filter((run) => run.status === 'running'));
    }

    return allAgentRuns;
  }

  /**
   * Get all agent runs for a work item
   */
  async getWorkItemTasks(workItemId: string): Promise<AgentRun[]> {
    return await agentRunsRepository.findByWorkItemId(workItemId);
  }

  /**
   * Correct with review comments
   * This is similar to resumeTask but specifically for addressing review feedback
   */
  async correctWithReviewComments(agentRunId: string, reviewComments: string): Promise<AgentRun> {
    const agentRun = await agentRunsRepository.findById(agentRunId);
    if (!agentRun) {
      throw new Error('Agent run not found');
    }

    // Check if the original run has a session_id
    if (!agentRun.sessionId) {
      throw new Error('Cannot correct with review comments: original task has no session_id');
    }

    const workItem = await workItemsRepository.findById(agentRun.workItemId);
    if (!workItem) {
      throw new Error('WorkItem not found');
    }

    const project = await projectsRepository.findById(workItem.projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const agentParams = this.parseAgentParams(project.agentParams);
    const agentType = agentParams.agentType || (project.defaultAgent as AgentType) || 'opencode';
    const adapter = this.getAgentAdapter(agentType);
    const config = this.buildAgentConfig(project, agentParams);

    // Check concurrency limit
    const canStart = await this.canStartTask(project.id);
    if (!canStart) {
      throw new Error(
        `Maximum agent concurrency limit (${project.maxAgentConcurrency || 3}) reached for project. Please wait for existing tasks to complete.`
      );
    }

    // Create new agent run record linked to the original
    const newRunId = uuidv4();
    const newAgentRun = await agentRunsRepository.create({
      id: newRunId,
      workItemId: workItem.id,
      projectId: project.id,
      agentKey: agentType,
      inputSummary: `Address review comments: ${reviewComments.substring(0, 180)}`,
      inputJson: JSON.stringify({
        prompt: reviewComments,
        config,
      }),
      sessionId: agentRun.sessionId, // Reuse the same session_id
      linkedAgentRunId: agentRunId, // Link to the original run
    });

    // Mark as running
    await agentRunsRepository.update(newRunId, {
      status: 'running',
      startedAt: new Date(),
    });

    // Track as running
    this.trackRunningTask(project.id, newRunId);

    // Execute agent with session continuation
    adapter
      .correctWithReviewComments({
        worktreePath: workItem.worktreePath || '',
        agentRunId: newRunId,
        sessionId: agentRun.sessionId,
        reviewComments,
        config,
      })
      .catch(async (error: unknown) => {
        await agentRunsRepository.update(newRunId, {
          status: 'failed',
          log: `Failed to correct with review comments: ${error instanceof Error ? error.message : String(error)}`,
          finishedAt: new Date(),
        });
        this.untrackRunningTask(project.id, newRunId);
        await workItemsRepository.releaseLock(workItem.id, newRunId);
      });

    return newAgentRun;
  }

  /**
   * Finalize agent run after completion
   * This performs backend auto-commit and updates WorkItem/PR SHAs
   */
  async finalizeAgentRun(agentRunId: string): Promise<void> {
    const agentRun = await agentRunsRepository.findById(agentRunId);
    if (!agentRun) {
      throw new Error('Agent run not found');
    }

    const workItem = await workItemsRepository.findById(agentRun.workItemId);
    if (!workItem || !workItem.worktreePath) {
      throw new Error('WorkItem or worktree not found');
    }

    const project = await projectsRepository.findById(workItem.projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Preserve the existing status (set by adapter when process completes)
    const existingStatus = agentRun.status;

    try {
      // Stage all changes first (including new files)
      // This is necessary because new files won't show up in git diff until staged
      gitService.stageAllChanges(workItem.worktreePath);

      // Check if there are staged changes after staging
      const hasStagedChanges = gitService.hasStagedChanges(workItem.worktreePath);

      let commitSha: string | null = null;
      let headShaAfter: string;

      if (hasStagedChanges) {
        // Commit if changes exist
        const commitMessage = `AgentRun ${agentRunId}: ${agentRun.inputSummary || 'Agent execution'}`;
        commitSha = gitService.commitChanges(workItem.worktreePath, commitMessage);
        headShaAfter = gitService.getHeadSha(workItem.worktreePath);

        // Check if there's an actual diff between base and head (to avoid creating PRs with no changes)
        if (!workItem.baseSha) {
          throw new Error(`WorkItem ${workItem.id} missing baseSha`);
        }
        const diff = gitService.getDiff(workItem.baseSha, headShaAfter, workItem.worktreePath);
        const hasActualChanges = diff.trim().length > 0;

        if (hasActualChanges) {
          // Create PR only if there are actual changes
          await this.openPRForWorkItem(workItem, project);
        } else {
          // No actual changes in diff - close any existing PR and update agent run log
          await this.closeExistingPRIfNoDiff(workItem, headShaAfter);
          const noChangesMessage =
            '\n\n[Finalization] No changes detected in diff - PR creation skipped.';
          await agentRunsRepository.update(agentRunId, {
            log: (agentRun.log ?? '') + noChangesMessage,
          });
        }
      } else {
        // No staged changes - close any existing PR and update agent run log
        headShaAfter = gitService.getHeadSha(workItem.worktreePath);
        await this.closeExistingPRIfNoDiff(workItem, headShaAfter);
        const noChangesMessage = '\n\n[Finalization] No changes detected - PR creation skipped.';
        await agentRunsRepository.update(agentRunId, {
          log: (agentRun.log ?? '') + noChangesMessage,
        });
      }

      // Update AgentRun - preserve existing status unless finalization fails
      await agentRunsRepository.update(agentRunId, {
        // Only update status if it's still 'running' (shouldn't happen, but be safe)
        // Otherwise preserve the status set by the adapter (succeeded/failed)
        status: existingStatus === 'running' ? 'succeeded' : existingStatus,
        finishedAt: agentRun.finishedAt || new Date(),
        headShaAfter,
        commitSha,
      });

      // Update WorkItem cached head SHA
      await workItemsRepository.update(workItem.id, {
        headSha: headShaAfter,
      });

      // PR head SHA is tracked in WorkItem, not in PR schema
      // PR only stores sourceBranch and targetBranch references
    } catch (error) {
      // Update AgentRun with failed status if finalization fails
      await agentRunsRepository.update(agentRunId, {
        status: 'failed',
        finishedAt: new Date(),
        log: `Failed to finalize agent run: ${error instanceof Error ? error.message : String(error)}`,
      });
      throw error;
    } finally {
      // Always release lock
      await workItemsRepository.releaseLock(workItem.id, agentRunId);
      this.untrackRunningTask(workItem.projectId, agentRunId);
    }
  }
}

export const agentService = new AgentService();
