/**
 * DomainDispatcher - Dispatcher for Domain resources (system-internal concepts)
 *
 * Domain Resources:
 * - WorkItem: create/update workitem fields
 * - Task: create/start/complete tasks; emits domain events (task.created/task.started/task.completed)
 * - PullRequest: create/update PR record
 *
 * Domain resource semantics:
 * - resource.result.status == succeeded means the requested state transition completed
 * - No long-running external execution implied
 * - State transitions are synchronous within the workflow
 */

import type { WorkItem, NodeRun } from '../types/models';
import type { ResourceType } from 'git-vibe-shared';
import {
  RESOURCE_STATUS_SUCCEEDED,
  RESOURCE_STATUS_FAILED,
  RESOURCE_STATUS_CANCELED,
  PR_STATUS_MERGED,
} from 'git-vibe-shared';
import { workItemsRepository } from '../repositories/WorkItemsRepository';
import { agentRunsRepository } from '../repositories/AgentRunsRepository';
import { pullRequestsRepository } from '../repositories/PullRequestsRepository';
import { tasksRepository } from '../repositories/TasksRepository';
import { prService } from './PRService';
import * as crypto from 'node:crypto';
import type { ResourceHandlerContext } from './ResourceDispatcher.js';

export interface ResourceResult {
  resourceType: ResourceType;
  resourceId: string;
  status:
    | typeof RESOURCE_STATUS_SUCCEEDED
    | typeof RESOURCE_STATUS_FAILED
    | typeof RESOURCE_STATUS_CANCELED;
  summary: string;
  outputs: Record<string, unknown>;
}

export interface ResourceHandler {
  canHandle(resourceType: ResourceType): boolean;
  execute(context: ResourceHandlerContext): Promise<ResourceResult>;
}

class WorkItemResourceHandler implements ResourceHandler {
  canHandle(resourceType: ResourceType): boolean {
    return resourceType === 'WorkItem';
  }

  async execute(context: ResourceHandlerContext): Promise<ResourceResult> {
    const { workItem, input, nodeRun } = context;

    if (input.ensureTasks && Array.isArray(input.ensureTasks)) {
      const taskHandler = new TaskResourceHandler();
      const createdTaskIds: string[] = [];
      const existingTaskIds: string[] = [];
      const autoStartTaskIds: string[] = [];

      for (const taskSpec of input.ensureTasks) {
        const existingTask = await tasksRepository.findByTaskType(workItem.id, taskSpec.taskType);

        if (existingTask) {
          existingTaskIds.push(existingTask.id);
          createdTaskIds.push(existingTask.id);
          console.log(
            `[WorkItemResourceHandler] Task ${taskSpec.taskType} already exists: ${existingTask.id}, status: ${existingTask.status}`
          );

          if (existingTask.status === 'pending' && taskSpec.autoStart) {
            autoStartTaskIds.push(existingTask.id);
          }
        } else {
          const taskInput = {
            id: crypto.randomUUID(),
            taskType: taskSpec.taskType,
            status: 'pending',
            input: taskSpec.input || {},
            idempotencyKey: `workitem:${workItem.id}:task:${taskSpec.taskType}:create`,
          };

          const taskResult = await taskHandler.execute({
            workItem,
            nodeRun,
            input: taskInput,
          });

          createdTaskIds.push(taskResult.resourceId);
        }
      }

      // Return task IDs in outputs for event emission by nodes
      return {
        resourceType: 'WorkItem',
        resourceId: workItem.id,
        status: RESOURCE_STATUS_SUCCEEDED,
        summary: `WorkItem ${workItem.id} processed ${createdTaskIds.length} tasks`,
        outputs: {
          createdTaskIds,
          existingTaskIds,
          autoStartTaskIds,
        },
      };
    }

    if (input.ensurePRRequest) {
      const existingPR = await pullRequestsRepository.findByWorkItemId(workItem.id);
      if (!existingPR && workItem.headBranch && workItem.baseBranch) {
        const pr = await prService.openPR(
          workItem.id,
          workItem.projectId,
          workItem.title,
          workItem.body,
          workItem.headBranch,
          workItem.baseBranch
        );

        if (pr) {
          console.log(`[WorkItemResourceHandler] Created PR request ${pr.id}`);
        } else {
          console.log(`[WorkItemResourceHandler] No changes detected, skipping PR creation`);
        }
      }
    }

    const updateData = Object.fromEntries(
      Object.entries(input).filter(
        ([key, value]) =>
          value !== undefined &&
          value !== null &&
          key !== 'ensureTasks' &&
          key !== 'ensurePRRequest'
      )
    );

    if (Object.keys(updateData).length > 0) {
      await workItemsRepository.update(workItem.id, updateData);
    }

    return {
      resourceType: 'WorkItem',
      resourceId: workItem.id,
      status: RESOURCE_STATUS_SUCCEEDED,
      summary:
        Object.keys(updateData).length > 0
          ? `WorkItem ${workItem.id} updated`
          : `WorkItem ${workItem.id} (no changes)`,
      outputs: {},
    };
  }
}

class TaskResourceHandler implements ResourceHandler {
  canHandle(resourceType: ResourceType): boolean {
    return resourceType === 'Task';
  }

  async execute(context: ResourceHandlerContext): Promise<ResourceResult> {
    const { workItem, input, nodeRun } = context;

    if (input.taskId) {
      const taskId = input.taskId as string;
      const existingTask = await tasksRepository.findById(taskId);

      if (!existingTask) {
        throw new Error(`Task ${taskId} not found`);
      }

      if (input.patch) {
        const patch = input.patch as Record<string, unknown>;
        const updates: Partial<{
          status: 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'blocked';
          output: Record<string, unknown>;
          currentAgentRunId: string | null;
        }> = {};

        if (patch.status) {
          updates.status = patch.status as any;
        }
        if (patch.output) {
          updates.output = patch.output as Record<string, unknown>;
        }
        if (patch.currentAgentRunId !== undefined) {
          updates.currentAgentRunId = patch.currentAgentRunId as string | null;
        }

        const updatedTask = await tasksRepository.update(taskId, updates);

        return {
          resourceType: 'Task',
          resourceId: taskId,
          status: RESOURCE_STATUS_SUCCEEDED,
          summary: `Task ${taskId} updated`,
          outputs: {
            taskId: taskId,
            status: updatedTask?.status,
          },
        };
      }

      if (input.completeFromAgentRunId) {
        const agentRunId = input.completeFromAgentRunId as string;
        const agentRun = await agentRunsRepository.findById(agentRunId);

        if (!agentRun) {
          throw new Error(`AgentRun ${agentRunId} not found`);
        }

        const taskStatus =
          agentRun.status === 'succeeded'
            ? 'succeeded'
            : agentRun.status === 'failed' || agentRun.status === 'cancelled'
              ? 'failed'
              : existingTask.status;

        await tasksRepository.update(taskId, {
          status: taskStatus,
          currentAgentRunId: agentRunId,
          output: {
            agentRunId: agentRunId,
            agentRunStatus: agentRun.status,
          },
        });

        return {
          resourceType: 'Task',
          resourceId: taskId,
          status: RESOURCE_STATUS_SUCCEEDED,
          summary: `Task ${taskId} completed from AgentRun ${agentRunId}`,
          outputs: {
            taskId: taskId,
            status: taskStatus,
            agentRunId: agentRunId,
          },
        };
      }
    }

    const taskId = input.id || crypto.randomUUID();
    const taskType = input.taskType as string;
    const idempotencyKey = input.idempotencyKey as string | undefined;

    if (idempotencyKey) {
      const existing = await tasksRepository.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        return {
          resourceType: 'Task',
          resourceId: existing.id,
          status: RESOURCE_STATUS_SUCCEEDED,
          summary: `Task ${existing.id} already exists (idempotent)`,
          outputs: {
            taskId: existing.id,
            status: existing.status,
            autoStart: false,
          },
        };
      }
    }

    const existingTask = await tasksRepository.findByTaskType(workItem.id, taskType);
    if (existingTask && existingTask.status !== 'succeeded' && existingTask.status !== 'failed') {
      return {
        resourceType: 'Task',
        resourceId: existingTask.id,
        status: RESOURCE_STATUS_SUCCEEDED,
        summary: `Task ${existingTask.id} already exists`,
        outputs: {
          taskId: existingTask.id,
          status: existingTask.status,
          autoStart: false,
        },
      };
    }

    const task = await tasksRepository.create({
      id: taskId,
      workItemId: workItem.id,
      taskType: taskType,
      status: input.status || 'pending',
      input: input.input || {},
      output: input.output || {},
      idempotencyKey: idempotencyKey || null,
      nodeRunId: nodeRun.runId,
    });

    return {
      resourceType: 'Task',
      resourceId: task.id,
      status: RESOURCE_STATUS_SUCCEEDED,
      summary: `Task ${task.id} created`,
      outputs: {
        taskId: task.id,
        status: task.status,
        autoStart: input.autoStart || false,
      },
    };
  }
}

class PullRequestResourceHandler implements ResourceHandler {
  canHandle(resourceType: ResourceType): boolean {
    return resourceType === 'PullRequest';
  }

  async execute(context: ResourceHandlerContext): Promise<ResourceResult> {
    const { workItem, input } = context;

    if (input.operation === 'merge') {
      const pr = await pullRequestsRepository.findByWorkItemId(workItem.id);
      if (!pr) {
        throw new Error(`No PR found for WorkItem ${workItem.id}`);
      }

      const { projectsRepository } = await import('../repositories/ProjectsRepository');
      const project = await projectsRepository.findById(workItem.projectId);
      if (!project) {
        throw new Error(`Project ${workItem.projectId} not found`);
      }

      const strategy = (input.strategy as 'merge' | 'squash' | 'rebase') || 'squash';
      const mergedPR = await prService.mergePR(pr, workItem, project, strategy);

      return {
        resourceType: 'PullRequest',
        resourceId: mergedPR.id,
        status: RESOURCE_STATUS_SUCCEEDED,
        summary: `PullRequest ${mergedPR.id} merged using ${strategy} strategy`,
        outputs: {
          prId: mergedPR.id,
          prNumber: mergedPR.id,
          merged: true,
          mergeCommitSha: mergedPR.mergeCommitSha,
        },
      };
    }

    if (!workItem.headBranch) {
      throw new Error(`WorkItem ${workItem.id} has no head branch`);
    }

    const title = input.titleFrom ? workItem.title : input.title || workItem.title;
    const description =
      input.bodyFrom || input.descriptionFrom
        ? workItem.body
        : input.description || workItem.body || undefined;

    const headBranch = input.head || workItem.headBranch;
    const baseBranch = input.base || workItem.baseBranch;

    const pr = await prService.openPR(
      workItem.id,
      workItem.projectId,
      title,
      description,
      headBranch,
      baseBranch
    );

    if (!pr) {
      return {
        resourceType: 'PullRequest',
        resourceId: workItem.id,
        status: RESOURCE_STATUS_FAILED,
        summary: 'No changes detected, skipping PR creation',
        outputs: {
          skipped: true,
          reason: 'no_diff',
        },
      };
    }

    return {
      resourceType: 'PullRequest',
      resourceId: pr.id,
      status: RESOURCE_STATUS_SUCCEEDED,
      summary: `PullRequest ${pr.id} opened`,
      outputs: {
        prId: pr.id,
        prNumber: pr.id,
        url: '',
        merged: pr.status === PR_STATUS_MERGED,
      },
    };
  }
}

export class DomainDispatcher {
  private handlers: Map<ResourceType, ResourceHandler>;

  constructor() {
    this.handlers = new Map();
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.handlers.set('WorkItem', new WorkItemResourceHandler());
    this.handlers.set('Task', new TaskResourceHandler());
    this.handlers.set('PullRequest', new PullRequestResourceHandler());
  }

  async call(
    resourceType: ResourceType,
    _input: Record<string, any>,
    context: ResourceHandlerContext
  ): Promise<ResourceResult> {
    const handler = this.handlers.get(resourceType);
    if (!handler) {
      throw new Error(`No Domain handler for resource type: ${resourceType}`);
    }

    return handler.execute(context);
  }

  canHandle(resourceType: ResourceType): boolean {
    const domainResources: ResourceType[] = ['WorkItem', 'Task', 'PullRequest'];
    return domainResources.includes(resourceType);
  }
}

export const domainDispatcher = new DomainDispatcher();
