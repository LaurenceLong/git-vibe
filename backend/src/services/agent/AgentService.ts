import { v4 as uuidv4 } from 'uuid';
import {
  PR_STATUS_OPEN,
  AGENT_RUN_STATUS_RUNNING,
  AGENT_RUN_STATUS_SUCCEEDED,
  AGENT_RUN_STATUS_FAILED,
} from 'git-vibe-shared';
import { projectsRepository } from '../../repositories/ProjectsRepository.js';
import { workItemsRepository } from '../../repositories/WorkItemsRepository.js';
import { agentRunsRepository } from '../../repositories/AgentRunsRepository.js';
import { pullRequestsRepository } from '../../repositories/PullRequestsRepository.js';
import { gitService } from '../git/GitService.js';
import { workspaceService } from '../WorkspaceService.js';
import { prService } from '../PRService.js';
import { openCodeAgentAdapter } from './OpenCodeAgentAdapter.js';
import { claudeCodeAgentAdapter } from './ClaudeCodeAgentAdapter.js';
import { workflowEventBus } from '../workflow/WorkflowEventBus.js';
import { getAndRemoveAgentRunCompletionCallback } from '../OpsDispatcher.js';
import type { Project, WorkItem, AgentRun, PullRequest, Task } from '../../types/models.js';

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
   * Get count of running agent runs for a project
   */
  private getRunningTaskCount(projectId: string): number {
    return this.runningTasksPerProject.get(projectId)?.size ?? 0;
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
   * Start an agent run for a WorkItem (stateless)
   * Assumes workspace is already initialized - workflow handles workspace initialization
   * Returns AgentRun and does not orchestrate workspace or PR creation
   */
  async startAgentRun(
    workItemId: string,
    project: Project,
    worktreePath: string,
    prompt: string,
    agentParams: AgentParams,
    options?: {
      sessionId?: string;
      linkedAgentRunId?: string;
      taskId?: string;
      idempotencyKey?: string;
      nodeRunId?: string;
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

    // Acquire workspace lock
    const runId = uuidv4();
    const lockAcquired = await workItemsRepository.acquireLock(
      workItemId,
      runId,
      3600000 * 6 // Default TTL: 6 hour in milliseconds
    );

    if (!lockAcquired) {
      const lockStatus = await workItemsRepository.isLocked(workItemId);
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

      // Determine session_id: Use provided sessionId or null (adapter will persist actual session)
      // Do not create fake initial session - adapter will list and persist sessions before/during execution
      const sessionId = options?.sessionId || null;

      // Determine head SHA before run
      const headShaBefore = gitService.getHeadSha(worktreePath);

      // Create agent run record
      const agentRun = await agentRunsRepository.create({
        id: runId,
        workItemId,
        projectId: project.id,
        agentKey: agentType,
        inputSummary: prompt ? prompt.substring(0, 200) : undefined,
        inputJson: JSON.stringify({
          prompt,
          config,
        }),
        sessionId,
        linkedAgentRunId: options?.linkedAgentRunId,
        taskId: options?.taskId || null,
        idempotencyKey: options?.idempotencyKey || null,
        nodeRunId: options?.nodeRunId || null,
      });

      // Mark as running
      await agentRunsRepository.update(runId, {
        status: AGENT_RUN_STATUS_RUNNING,
        startedAt: new Date(),
        headShaBefore,
      });

      // Track as running
      this.trackRunningTask(project.id, runId);

      // Execute agent asynchronously
      adapter
        .run({
          worktreePath,
          agentRunId: runId,
          prompt,
          config,
          sessionId: sessionId ?? undefined,
        })
        .catch(async (error: unknown) => {
          await agentRunsRepository.update(runId, {
            status: AGENT_RUN_STATUS_FAILED,
            log: `Failed to start agent process: ${error instanceof Error ? error.message : String(error)}`,
            finishedAt: new Date(),
          });
          this.untrackRunningTask(project.id, runId);
          // Release lock
          await workItemsRepository.releaseLock(workItemId, runId);
        });

      return agentRun;
    } catch (error) {
      // Release lock on error
      await workItemsRepository.releaseLock(workItemId, runId);
      throw error;
    }
  }

  /**
   * Execute a task: ensure workspace and start agent run.
   * Used by the agent-runs route when starting a run from the API.
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

      const workspaceState = await workspaceService.ensureWorkspace(workItem, project);
      if (!workItem.worktreePath) {
        await workItemsRepository.update(workItemId, {
          ...workspaceState,
          worktreePath: workspaceState.worktreePath ?? undefined,
          body: workspaceState.body ?? undefined,
          headBranch: workspaceState.headBranch ?? undefined,
          baseBranch: workspaceState.baseBranch ?? undefined,
          baseSha: workspaceState.baseSha ?? undefined,
          headSha: workspaceState.headSha ?? undefined,
        });
        workItem.worktreePath = workspaceState.worktreePath;
      }

      // Build prompt from work item or user message
      let prompt: string;
      if (userMessage && userMessage.trim()) {
        // For conversation messages, use markdown format
        prompt = `## User Message\n\n${userMessage.trim()}`;
      } else {
        // For regular task execution, use markdown format
        const description = workItem.body ?? workItemBody ?? '';
        if (!description || !description.trim()) {
          prompt = `## Task\n\n${workItemTitle}`;
        } else {
          prompt = `## Task\n\n${workItemTitle}\n\n## Description\n\n${description.trim()}`;
        }
      }

      console.log(`[AgentService] Building prompt for work item ${workItemId}`);
      console.log(`[AgentService] Title: ${workItemTitle}`);
      console.log(`[AgentService] Final prompt length: ${prompt.length} characters`);

      // Start agent run (stateless version)
      const worktreePath = workItem.worktreePath || workspaceState.worktreePath;
      if (!worktreePath) {
        throw new Error(`WorkItem ${workItemId} has no worktree path`);
      }
      const agentRun = await this.startAgentRun(
        workItemId,
        project,
        worktreePath,
        prompt,
        agentParams
      );

      return {
        workItem: {
          id: workItemId,
          title: workItemTitle,
          body: workItemBody,
        },
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
  async cancelTask(taskId: string): Promise<void> {
    const { tasksRepository } = await import('../../repositories/TasksRepository.js');
    const task = await tasksRepository.findById(taskId);

    if (!task) {
      throw new Error('Task not found');
    }

    // Cancel the task's current agent run if running
    if (task.currentAgentRunId) {
      const agentRun = await agentRunsRepository.findById(task.currentAgentRunId);
      if (agentRun && agentRun.status === AGENT_RUN_STATUS_RUNNING) {
        const adapter = this.getAgentAdapter(agentRun.agentKey as AgentType);
        await adapter.cancel(agentRun.id);
        await agentRunsRepository.update(agentRun.id, {
          status: 'cancelled',
          finishedAt: new Date(),
        });
        const workItem = await workItemsRepository.findById(task.workItemId);
        if (workItem) {
          this.untrackRunningTask(workItem.projectId, agentRun.id);
          await workItemsRepository.releaseLock(workItem.id, agentRun.id);
        }
      }
    }

    // Update task status to canceled
    await tasksRepository.updateStatus(task.id, 'canceled');
  }

  /**
   * Resume a task using the same session_id
   * Triggers workflow by emitting workitem.task.resume event
   */
  async resumeTask(taskId: string, prompt: string): Promise<AgentRun> {
    const { tasksRepository } = await import('../../repositories/TasksRepository.js');
    const task = await tasksRepository.findById(taskId);

    if (!task) {
      throw new Error('Task not found');
    }

    const agentRun = task.currentAgentRunId
      ? ((await agentRunsRepository.findById(task.currentAgentRunId)) ?? null)
      : null;

    if (!agentRun || !agentRun.sessionId) {
      throw new Error('Cannot resume task: task has no active agent run with session_id');
    }

    const workItem = await workItemsRepository.findById(task.workItemId);
    if (!workItem) {
      throw new Error('WorkItem not found');
    }

    // Emit workitem.task.resume event to trigger workflow
    console.log(
      `[AgentService] Emitting workitem.task.resume event to resume task for ${workItem.id}`
    );

    await workflowEventBus.emit({
      eventId: crypto.randomUUID(),
      at: new Date().toISOString(),
      subject: { kind: 'workitem', id: workItem.id },
      type: 'workitem.task.resume',
      workItemId: workItem.id,
      data: {
        taskId: task.id,
        originalAgentRunId: agentRun.id,
        sessionId: agentRun.sessionId,
        prompt,
        title: workItem.title,
        body: workItem.body ?? '',
      },
    });

    // Return the original agent run (workflow will create a new one)
    // This maintains API compatibility while letting workflow handle the resume
    return agentRun;
  }

  /**
   * Restart a task with the same prompt
   * Canonical action: restart task. Emits workitem.restarted; workflow runs from
   * workitem_restarted → process_workitem (agent).
   */
  async restartTask(taskId: string): Promise<Task> {
    const { tasksRepository } = await import('../../repositories/TasksRepository.js');
    const task = await tasksRepository.findById(taskId);

    if (!task) {
      throw new Error('Task not found');
    }

    const workItem = await workItemsRepository.findById(task.workItemId);
    if (!workItem) {
      throw new Error('WorkItem not found');
    }

    console.log(`[AgentService] Emitting workitem.restarted event for ${workItem.id}`);

    await workflowEventBus.emit({
      eventId: crypto.randomUUID(),
      at: new Date().toISOString(),
      subject: { kind: 'workitem', id: workItem.id },
      type: 'workitem.restarted',
      workItemId: workItem.id,
      data: {
        taskId: task.id,
        taskType: task.taskType,
        title: workItem.title,
        body: workItem.body ?? '',
      },
    });

    return task;
  }

  /**
   * Get task status
   */
  async getTaskStatus(
    taskId: string
  ): Promise<{ status: string; task: Task; agentRun?: AgentRun | null }> {
    const { tasksRepository } = await import('../../repositories/TasksRepository.js');
    const task = await tasksRepository.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    let agentRun: AgentRun | null = null;
    if (task.currentAgentRunId) {
      agentRun = (await agentRunsRepository.findById(task.currentAgentRunId)) ?? null;
      if (agentRun && agentRun.status === AGENT_RUN_STATUS_RUNNING) {
        const adapter = this.getAgentAdapter(agentRun.agentKey as AgentType);
        const { status } = await adapter.getStatus(agentRun.id);
        const statusForCheck = status;

        if (status !== agentRun.status) {
          await agentRunsRepository.update(agentRun.id, {
            status,
            finishedAt: ['succeeded', 'failed', 'cancelled'].includes(status)
              ? new Date()
              : undefined,
          });

          // Update task status based on agent run status
          if (status === 'succeeded') {
            await tasksRepository.updateStatus(task.id, 'succeeded');
          } else if (status === 'failed' || status === 'cancelled') {
            await tasksRepository.updateStatus(task.id, 'failed');
          }

          if (statusForCheck !== AGENT_RUN_STATUS_RUNNING) {
            const workItem = await workItemsRepository.findById(task.workItemId);
            if (workItem) {
              this.untrackRunningTask(workItem.projectId, agentRun.id);
              await workItemsRepository.releaseLock(task.workItemId, agentRun.id);
            }
          }

          agentRun = {
            ...agentRun,
            status,
          };
        }
      }
    }

    const updatedTask = await tasksRepository.findById(taskId);
    return {
      status: updatedTask?.status || task.status,
      task: updatedTask || task,
      agentRun: agentRun ?? null,
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
      allAgentRuns.push(...runs.filter((run) => run.status === AGENT_RUN_STATUS_RUNNING));
    }

    return allAgentRuns;
  }

  /**
   * Get all tasks for a work item
   * Returns Tasks (Domain resources), not AgentRuns
   */
  async getWorkItemTasks(workItemId: string): Promise<Task[]> {
    const { tasksRepository } = await import('../../repositories/TasksRepository.js');
    return await tasksRepository.findByWorkItemId(workItemId);
  }

  /**
   * Get all agent runs for a work item
   */
  async getWorkItemAgentRuns(workItemId: string): Promise<AgentRun[]> {
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
      status: AGENT_RUN_STATUS_RUNNING,
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
      // Agent is expected to commit files itself, so we don't stage or commit automatically
      // Just check what the agent has already committed
      const headShaAfter = gitService.getHeadSha(workItem.worktreePath);
      const headShaBefore = agentRun.headShaBefore || workItem.baseSha || headShaAfter;

      // Check if agent made any new commits
      const hasNewCommits = headShaBefore !== headShaAfter;

      let commitSha: string | null = null;

      if (hasNewCommits) {
        // Agent has made commits - use the latest commit SHA
        commitSha = headShaAfter;

        // Check if there's an actual diff between base and head (to avoid creating PRs with no changes)
        if (!workItem.baseSha) {
          throw new Error(`WorkItem ${workItem.id} missing baseSha`);
        }
        const diff = gitService.getDiff(workItem.baseSha, headShaAfter, workItem.worktreePath);
        const hasActualChanges = diff.trim().length > 0;

        // Don't automatically create PR - workflow will handle PR creation
        // Just return information about whether changes exist
        if (!hasActualChanges) {
          // No actual changes in diff - update agent run log
          const noChangesMessage =
            '\n\n[Finalization] No changes detected in diff - PR creation skipped.';
          await agentRunsRepository.update(agentRunId, {
            log: (agentRun.log ?? '') + noChangesMessage,
          });
        }
      } else {
        // No new commits from agent - check if there are unstaged changes
        const hasUnstagedChanges = gitService.hasUnstagedChanges(workItem.worktreePath);
        const hasStagedChanges = gitService.hasStagedChanges(workItem.worktreePath);

        if (hasUnstagedChanges || hasStagedChanges) {
          // Agent didn't commit changes but there are changes present
          const noCommitMessage =
            '\n\n[Finalization] Agent did not commit changes, but changes are present in working directory.';
          await agentRunsRepository.update(agentRunId, {
            log: (agentRun.log ?? '') + noCommitMessage,
          });
        } else {
          // No changes at all
          const noChangesMessage = '\n\n[Finalization] No changes detected - PR creation skipped.';
          await agentRunsRepository.update(agentRunId, {
            log: (agentRun.log ?? '') + noChangesMessage,
          });
        }
      }

      // Update AgentRun - preserve existing status unless finalization fails
      await agentRunsRepository.update(agentRunId, {
        status:
          existingStatus === AGENT_RUN_STATUS_RUNNING ? AGENT_RUN_STATUS_SUCCEEDED : existingStatus,
        finishedAt: agentRun.finishedAt || new Date(),
        headShaAfter,
        commitSha,
      });

      const status =
        agentRun.status === 'succeeded'
          ? 'succeeded'
          : agentRun.status === 'failed'
            ? 'failed'
            : agentRun.status === 'cancelled'
              ? 'canceled'
              : null;
      const outcomeStatus: 'succeeded' | 'failed' | 'canceled' = status ?? 'failed';
      const outcome = {
        resourceType: 'AgentRun' as const,
        resourceId: agentRunId,
        status: outcomeStatus,
        summary: `AgentRun ${agentRunId} completed (${status ?? 'unknown'})`,
        outputs: {
          agentRunId,
          taskId: agentRun.taskId,
          sessionId: agentRun.sessionId,
          commitSha,
          headShaAfter,
        },
      };
      const complete = getAndRemoveAgentRunCompletionCallback(agentRunId);
      if (complete) {
        try {
          await complete(outcome);
        } catch (error) {
          console.error(
            `[AgentService] Failed to complete NodeRun for AgentRun ${agentRunId}:`,
            error
          );
        }
      }

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
