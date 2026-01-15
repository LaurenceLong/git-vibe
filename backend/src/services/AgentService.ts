import { v4 as uuidv4 } from 'uuid';
import { projectsRepository } from '../repositories/ProjectsRepository.js';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { agentRunsRepository } from '../repositories/AgentRunsRepository.js';
import { gitService } from '../services/GitService.js';
import { workspaceService } from './WorkspaceService.js';
import { prService } from './PRService.js';
import { openCodeAgentAdapter } from './OpenCodeAgentAdapter.js';
import { claudeCodeAgentAdapter } from './ClaudeCodeAgentAdapter.js';
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
  pullRequest: PullRequest;
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
      3600000 // Default TTL: 1 hour in milliseconds
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
        inputSummary: prompt.substring(0, 200),
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
   * Execute a task: open PR and start agent automatically
   */
  async executeTask(
    projectId: string,
    workItemId: string,
    workItemTitle: string,
    workItemBody?: string
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

      // Open PR for WorkItem
      const pullRequest = await this.openPRForWorkItem(workItem, project);

      // Build prompt from work item
      const prompt = `Task: ${workItemTitle}${workItemBody ? `\n\nDescription: ${workItemBody}` : ''}`;

      // Start agent run
      const agentRun = await this.startAgentRun(workItem, project, prompt, agentParams);

      return {
        workItem: {
          id: workItemId,
          title: workItemTitle,
          body: workItemBody,
        },
        pullRequest,
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

    // Create new agent run record linked to the original
    const newRunId = uuidv4();
    const newAgentRun = await agentRunsRepository.create({
      id: newRunId,
      workItemId: workItem.id,
      projectId: project.id,
      agentKey: agentType,
      inputSummary: prompt.substring(0, 200),
      inputJson: JSON.stringify({
        prompt,
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
        reviewComments: prompt,
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

    // Parse original input
    const inputJson = JSON.parse(agentRun.inputJson) as { prompt: string; config: AgentConfig };
    const prompt = inputJson.prompt;
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

    try {
      // Stage changes after agent exits
      gitService.stageAllChanges(workItem.worktreePath);

      // Check if there are staged changes
      const hasChanges = !gitService.hasStagedChanges(workItem.worktreePath);

      let commitSha: string | null = null;

      if (hasChanges) {
        // Commit if changes exist
        const commitMessage = `AgentRun ${agentRunId}: ${agentRun.inputSummary || 'Agent execution'}`;
        commitSha = gitService.commitChanges(workItem.worktreePath, commitMessage);
      }

      // Determine head SHA after
      const headShaAfter = gitService.getHeadSha(workItem.worktreePath);

      // Update AgentRun with final status
      await agentRunsRepository.update(agentRunId, {
        status: 'succeeded',
        finishedAt: new Date(),
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
      // Update AgentRun with failed status
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
