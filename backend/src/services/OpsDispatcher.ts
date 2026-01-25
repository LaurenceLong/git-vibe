/**
 * OpsDispatcher - Dispatcher for Op resources (system-external actions/resources)
 *
 * Op Resources:
 * - Worktree: checkout/init; completes synchronously via callback
 * - AgentRun: completes via callback when run finishes (callback stored, invoked from AgentService.finalizeAgentRun)
 * - GitOps: commit/push/merge primitives
 * - CommandExec: run commands
 *
 * Op resource semantics:
 * - resource.result.status == succeeded means the external operation completed successfully
 * - Not merely "started"
 * - Often long-running, asynchronous
 */

import type { WorkItem, NodeRun } from '../types/models';
import type { ResourceType } from 'git-vibe-shared';
import {
  RESOURCE_STATUS_SUCCEEDED,
  RESOURCE_STATUS_FAILED,
  RESOURCE_STATUS_CANCELED,
} from 'git-vibe-shared';
import { workItemsRepository } from '../repositories/WorkItemsRepository';
import { agentRunsRepository } from '../repositories/AgentRunsRepository';
import { projectsRepository } from '../repositories/ProjectsRepository';
import { tasksRepository } from '../repositories/TasksRepository';
import { worktreesRepository } from '../repositories/WorktreesRepository';
import { gitOpsRepository } from '../repositories/GitOpsRepository';
import { workspaceService } from './WorkspaceService';
import { agentService } from './agent/AgentService';
import { gitService } from './git/GitService.js';
import { getDb } from '../db/client.js';
import { commandExecs } from '../models/schema.js';
import { eq } from 'drizzle-orm';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG } from '../config/storage.js';
import type { CompleteFn } from './ResourceDispatcher.js';

/**
 * Registry to store completion callbacks for async Op resources (like AgentRun)
 * Key: agentRunId, Value: completion callback
 */
const agentRunCompletionCallbacks = new Map<string, CompleteFn>();

/**
 * Store completion callback for an AgentRun
 * Called by AgentRunResourceHandler when starting an agent run
 */
export function storeAgentRunCompletionCallback(agentRunId: string, complete: CompleteFn): void {
  agentRunCompletionCallbacks.set(agentRunId, complete);
}

/**
 * Get and remove completion callback for an AgentRun
 * Called by AgentService.finalizeAgentRun() when the agent completes
 */
export function getAndRemoveAgentRunCompletionCallback(agentRunId: string): CompleteFn | undefined {
  const callback = agentRunCompletionCallbacks.get(agentRunId);
  agentRunCompletionCallbacks.delete(agentRunId);
  return callback;
}

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

export interface ResourceHandlerContext {
  workItem: WorkItem;
  nodeRun: NodeRun;
  input: Record<string, any>;
  /** Set by ResourceDispatcher for async Op resources (e.g. AgentRun) to complete when run finishes */
  complete?: CompleteFn;
}

export interface ResourceHandler {
  canHandle(resourceType: ResourceType): boolean;
  execute(context: ResourceHandlerContext): Promise<ResourceResult>;
}

class WorktreeResourceHandler implements ResourceHandler {
  canHandle(resourceType: ResourceType): boolean {
    return resourceType === 'Worktree';
  }

  async execute(context: ResourceHandlerContext): Promise<ResourceResult> {
    const { workItem, input, nodeRun } = context;

    const project = await projectsRepository.findById(workItem.projectId);
    if (!project) {
      throw new Error(`Project ${workItem.projectId} not found`);
    }

    const idempotencyKey = input.idempotencyKey as string | undefined;

    if (idempotencyKey) {
      const existing = await worktreesRepository.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        return {
          resourceType: 'Worktree',
          resourceId: existing.id,
          status:
            existing.status === 'succeeded' ? RESOURCE_STATUS_SUCCEEDED : RESOURCE_STATUS_FAILED,
          summary: `Worktree ${existing.id} already exists (idempotent)`,
          outputs: {
            path: existing.path,
            branch: existing.branch,
            repoSha: existing.repoSha,
          },
        };
      }
    }

    if (input.removeWorktree === true) {
      const existingWorktree = await worktreesRepository.findByWorkItemId(workItem.id);

      if (existingWorktree) {
        await worktreesRepository.updateStatus(existingWorktree.id, 'running');

        if (workItem.worktreePath) {
          await workspaceService.removeWorktree(workItem, project);
        }

        await workItemsRepository.update(workItem.id, {
          worktreePath: undefined,
          headBranch: undefined,
          baseBranch: undefined,
          headSha: undefined,
          baseSha: undefined,
          workspaceStatus: 'not_initialized',
        });

        await worktreesRepository.updateStatus(existingWorktree.id, 'succeeded');

        return {
          resourceType: 'Worktree',
          resourceId: existingWorktree.id,
          status: RESOURCE_STATUS_SUCCEEDED,
          summary: `Worktree removed for workitem ${workItem.id}`,
          outputs: {
            path: existingWorktree.path,
            branch: existingWorktree.branch,
          },
        };
      }

      return {
        resourceType: 'Worktree',
        resourceId: workItem.id,
        status: RESOURCE_STATUS_SUCCEEDED,
        summary: `No worktree to remove for workitem ${workItem.id}`,
        outputs: {},
      };
    }

    if (input.ensureWorktree === true) {
      const worktreeId = input.id || crypto.randomUUID();

      const existingWorktree = await worktreesRepository.findByWorkItemId(workItem.id);
      if (existingWorktree && existingWorktree.status === 'succeeded') {
        return {
          resourceType: 'Worktree',
          resourceId: existingWorktree.id,
          status: RESOURCE_STATUS_SUCCEEDED,
          summary: `Worktree ${existingWorktree.id} already exists`,
          outputs: {
            path: existingWorktree.path,
            branch: existingWorktree.branch,
            repoSha: existingWorktree.repoSha,
          },
        };
      }

      const worktree = await worktreesRepository.create({
        id: worktreeId,
        workItemId: workItem.id,
        path: '',
        branch: '',
        status: 'running',
        idempotencyKey: idempotencyKey || null,
        nodeRunId: nodeRun.runId,
      });

      try {
        const workspaceState = await workspaceService.initWorkspace(workItem.id, project);

        await worktreesRepository.update(worktree.id, {
          path: workspaceState.worktreePath,
          branch: workspaceState.headBranch,
          repoSha: workspaceState.headSha,
          status: 'succeeded',
        });

        await workItemsRepository.update(workItem.id, {
          worktreePath: workspaceState.worktreePath,
          headBranch: workspaceState.headBranch,
          baseBranch: workspaceState.baseBranch,
          headSha: workspaceState.headSha,
          baseSha: workspaceState.baseSha,
          workspaceStatus: workspaceState.workspaceStatus,
        });

        return {
          resourceType: 'Worktree',
          resourceId: worktree.id,
          status: RESOURCE_STATUS_SUCCEEDED,
          summary: `Worktree initialized for workitem ${workItem.id}`,
          outputs: {
            path: workspaceState.worktreePath,
            branch: workspaceState.headBranch,
            repoSha: workspaceState.headSha,
          },
        };
      } catch (error) {
        await worktreesRepository.updateStatus(worktree.id, 'failed');
        throw error;
      }
    }

    const worktreeId = input.id || crypto.randomUUID();
    const existingWorktree = await worktreesRepository.findByWorkItemId(workItem.id);

    if (existingWorktree) {
      await worktreesRepository.update(existingWorktree.id, {
        path: input.path || existingWorktree.path,
        branch: input.branch || existingWorktree.branch,
        repoSha: input.repoSha || existingWorktree.repoSha,
        status: input.status || existingWorktree.status,
      });

      return {
        resourceType: 'Worktree',
        resourceId: existingWorktree.id,
        status: RESOURCE_STATUS_SUCCEEDED,
        summary: `Worktree ${existingWorktree.id} updated`,
        outputs: {
          path: existingWorktree.path,
          branch: existingWorktree.branch,
          repoSha: existingWorktree.repoSha,
        },
      };
    }

    const worktree = await worktreesRepository.create({
      id: worktreeId,
      workItemId: workItem.id,
      path: input.path || workItem.worktreePath || '',
      branch: input.branch || workItem.headBranch || '',
      repoSha: input.repoSha || workItem.headSha || null,
      status: 'succeeded',
      idempotencyKey: idempotencyKey || null,
      nodeRunId: nodeRun.runId,
    });

    return {
      resourceType: 'Worktree',
      resourceId: worktree.id,
      status: RESOURCE_STATUS_SUCCEEDED,
      summary: `Worktree ${worktree.id} created`,
      outputs: {
        path: worktree.path,
        branch: worktree.branch,
        repoSha: worktree.repoSha,
      },
    };
  }
}

class AgentRunResourceHandler implements ResourceHandler {
  canHandle(resourceType: ResourceType): boolean {
    return resourceType === 'AgentRun';
  }

  private async resolveProperty(path: string, context: ResourceHandlerContext): Promise<string> {
    const { workItem, nodeRun } = context;
    const parts = path.split('.');
    if (parts.length === 0) return '';

    const [root, ...rest] = parts;

    if (root === 'workitem' || root === 'workItem') {
      if (rest.length === 0) return '';
      const property = rest[0];
      switch (property) {
        case 'id':
          return workItem.id;
        case 'title':
          return workItem.title || '';
        case 'body':
        case 'description':
          return workItem.body || '';
        case 'type':
          return workItem.type || '';
        case 'status':
          return workItem.status || '';
        default:
          return '';
      }
    }

    if (root === 'task' && rest.length >= 1) {
      const taskType = rest[0];
      const previousRuns = await agentRunsRepository.findByWorkItemId(workItem.id);

      const taskRun = previousRuns.find((r) => {
        const taskData = typeof r.inputJson === 'string' ? JSON.parse(r.inputJson) : r.inputJson;
        return taskData.taskType === taskType;
      });

      if (!taskRun) return '';

      if (rest.length === 2 && (rest[1] === 'output' || rest[1] === 'log')) {
        if (rest[1] === 'log' && taskRun.log) {
          return taskRun.log;
        }
        if (rest[1] === 'output' && taskRun.inputJson) {
          const inputData =
            typeof taskRun.inputJson === 'string'
              ? JSON.parse(taskRun.inputJson)
              : taskRun.inputJson;
          if (inputData.prompt) {
            return inputData.prompt;
          }
        }
        return '';
      }

      if (taskRun.log) {
        return taskRun.log;
      }
      return '';
    }

    if (root === 'agentRun' && rest.length >= 1) {
      const previousRuns = await agentRunsRepository.findByWorkItemId(workItem.id);
      const completedRuns = previousRuns
        .filter(
          (r) => r.status === RESOURCE_STATUS_SUCCEEDED || r.status === RESOURCE_STATUS_FAILED
        )
        .sort((a, b) => {
          const aTime = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
          const bTime = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
          return bTime - aTime;
        });

      if (completedRuns.length === 0) return '';
      const lastRun = completedRuns[0];

      if (rest[0] === 'output' || rest[0] === 'log') {
        if (rest[0] === 'log' && lastRun.log) {
          return lastRun.log;
        }
        if (rest[0] === 'output' && lastRun.inputJson) {
          const inputData =
            typeof lastRun.inputJson === 'string'
              ? JSON.parse(lastRun.inputJson)
              : lastRun.inputJson;
          if (inputData.prompt) {
            return inputData.prompt;
          }
        }
        return '';
      }

      return lastRun.log || '';
    }

    if (root === 'nodeRun' && nodeRun && rest.length >= 1) {
      const property = rest[0];
      switch (property) {
        case 'id':
          return nodeRun.runId;
        case 'nodeId':
          return nodeRun.nodeId;
        case 'status':
          return nodeRun.status;
        case 'input':
          return JSON.stringify(nodeRun.input || {});
        case 'output':
          return JSON.stringify(nodeRun.output || {});
        default:
          return '';
      }
    }

    return '';
  }

  private async parseTemplate(template: string, context: ResourceHandlerContext): Promise<string> {
    const placeholderRegex = /\{\{([^}]+)\}\}/g;
    let result = template;

    const uniquePlaceholders = new Map<string, string>();
    const matches = Array.from(template.matchAll(placeholderRegex));

    for (const match of matches) {
      const propertyPath = match[1].trim();

      if (!uniquePlaceholders.has(propertyPath)) {
        const value = await this.resolveProperty(propertyPath, context);
        uniquePlaceholders.set(propertyPath, value);
      }
    }

    for (const [propertyPath, value] of uniquePlaceholders.entries()) {
      const placeholderPattern = new RegExp(
        `\\{\\{${propertyPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`,
        'g'
      );
      result = result.replace(placeholderPattern, value);
    }

    return result;
  }

  async execute(context: ResourceHandlerContext): Promise<ResourceResult> {
    const { workItem, input, nodeRun } = context;

    const project = await projectsRepository.findById(workItem.projectId);
    if (!project) {
      throw new Error(`Project ${workItem.projectId} not found`);
    }

    if (!workItem.worktreePath) {
      throw new Error(`WorkItem ${workItem.id} has no worktree path`);
    }

    const taskId = input.taskId as string | undefined;
    if (!taskId) {
      throw new Error('taskId is required for AgentRun resource');
    }

    const task = await tasksRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.workItemId !== workItem.id) {
      throw new Error(`Task ${taskId} does not belong to WorkItem ${workItem.id}`);
    }

    const idempotencyKey = input.idempotencyKey as string | undefined;
    if (idempotencyKey) {
      const existingRuns = await agentRunsRepository.findByWorkItemId(workItem.id);
      const existing = existingRuns.find((r) => r.idempotencyKey === idempotencyKey);
      if (existing) {
        const terminalStatus =
          existing.status === 'succeeded'
            ? RESOURCE_STATUS_SUCCEEDED
            : existing.status === 'failed'
              ? RESOURCE_STATUS_FAILED
              : existing.status === 'cancelled'
                ? RESOURCE_STATUS_CANCELED
                : null;
        const status: ResourceResult['status'] = terminalStatus ?? RESOURCE_STATUS_SUCCEEDED;
        const result: ResourceResult = {
          resourceType: 'AgentRun',
          resourceId: existing.id,
          status,
          summary: `AgentRun ${existing.id} already exists (idempotent)`,
          outputs: {
            agentRunId: existing.id,
            sessionId: existing.sessionId,
          },
        };
        if (terminalStatus && context.complete) {
          await context.complete({
            resourceType: 'AgentRun',
            resourceId: existing.id,
            status: terminalStatus,
            summary: result.summary,
            outputs: result.outputs,
          });
        }
        return result;
      }
    }

    let prompt: string;

    if (input.prompt) {
      prompt = input.prompt as string;
    } else if (input.template) {
      prompt = await this.parseTemplate(input.template as string, context);
    } else {
      prompt = workItem.title;
    }

    const agentParams = {
      agentType: input.agentKey || input.agentType || 'opencode',
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    };

    // Session ID comes from trigger input (resolved from event/context), not from a reuse flag
    const sessionId =
      typeof input.sessionId === 'string' && input.sessionId.trim() !== ''
        ? input.sessionId.trim()
        : undefined;

    const agentRun = await agentService.startAgentRun(
      workItem.id,
      project,
      workItem.worktreePath,
      prompt,
      agentParams,
      {
        sessionId,
        linkedAgentRunId: input.linkedAgentRunId,
        taskId: taskId,
        idempotencyKey: idempotencyKey,
        nodeRunId: nodeRun.runId,
      }
    );

    await tasksRepository.update(taskId, {
      currentAgentRunId: agentRun.id,
    });

    if (context.complete) {
      storeAgentRunCompletionCallback(agentRun.id, context.complete);
    }

    return {
      resourceType: 'AgentRun',
      resourceId: agentRun.id,
      status: RESOURCE_STATUS_SUCCEEDED,
      summary: `AgentRun ${agentRun.id} started for Task ${taskId}`,
      outputs: {
        agentRunId: agentRun.id,
        taskId: taskId,
        sessionId: agentRun.sessionId,
      },
    };
  }
}

class GitOpsResourceHandler implements ResourceHandler {
  canHandle(resourceType: ResourceType): boolean {
    return resourceType === 'GitOps';
  }

  async execute(context: ResourceHandlerContext): Promise<ResourceResult> {
    const { workItem, input, nodeRun } = context;

    const project = await projectsRepository.findById(workItem.projectId);
    if (!project) {
      throw new Error(`Project ${workItem.projectId} not found`);
    }

    if (!workItem.worktreePath) {
      throw new Error(`WorkItem ${workItem.id} has no worktree path`);
    }

    const operation = input.operation as string;
    if (!operation) {
      throw new Error('GitOps operation is required');
    }

    const idempotencyKey = input.idempotencyKey as string | undefined;
    const gitOpId = input.id || crypto.randomUUID();

    if (idempotencyKey) {
      const existing = await gitOpsRepository.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        return {
          resourceType: 'GitOps',
          resourceId: existing.id,
          status:
            existing.status === 'succeeded' ? RESOURCE_STATUS_SUCCEEDED : RESOURCE_STATUS_FAILED,
          summary: `GitOps ${existing.id} already exists (idempotent)`,
          outputs: existing.output as Record<string, unknown>,
        };
      }
    }

    const gitOp = await gitOpsRepository.create({
      id: gitOpId,
      workItemId: workItem.id,
      operation: operation,
      status: 'running',
      input: input,
      output: {},
      idempotencyKey: idempotencyKey || null,
      nodeRunId: nodeRun.runId,
    });

    try {
      let commitSha: string | undefined = undefined;
      let applied = false;

      switch (operation) {
        case 'commit':
          if (input.message && workItem.worktreePath) {
            commitSha = gitService.commitChanges(workItem.worktreePath, input.message as string);
            applied = true;
          }
          break;
        case 'push':
          if (workItem.headBranch) {
            applied = false;
          }
          break;
        case 'merge':
          if (input.baseBranch && workItem.worktreePath) {
            gitService.mergeBranch(
              workItem.worktreePath,
              input.baseBranch as string,
              `Merge ${input.baseBranch} into ${workItem.headBranch || 'current branch'}`
            );
            commitSha = gitService.getHeadSha(workItem.worktreePath);
            applied = true;
          }
          break;
        default:
          throw new Error(`Unknown GitOps operation: ${operation}`);
      }

      await gitOpsRepository.update(gitOp.id, {
        status: applied ? 'succeeded' : 'failed',
        output: {
          applied,
          commitSha,
          operation,
        },
      });

      return {
        resourceType: 'GitOps',
        resourceId: gitOp.id,
        status: applied ? RESOURCE_STATUS_SUCCEEDED : RESOURCE_STATUS_FAILED,
        summary: `Git operation ${operation} ${applied ? 'completed' : 'failed'} for workitem ${workItem.id}`,
        outputs: {
          applied,
          commitSha,
          operation,
        },
      };
    } catch (error: any) {
      await gitOpsRepository.update(gitOp.id, {
        status: 'failed',
        output: {
          error: error.message || 'Unknown error',
          operation,
        },
      });

      return {
        resourceType: 'GitOps',
        resourceId: gitOp.id,
        status: RESOURCE_STATUS_FAILED,
        summary: `Git operation ${operation} failed: ${error.message || 'Unknown error'}`,
        outputs: {
          applied: false,
          error: error.message || 'Unknown error',
          operation,
        },
      };
    }
  }
}

class CommandExecResourceHandler implements ResourceHandler {
  canHandle(resourceType: ResourceType): boolean {
    return resourceType === 'CommandExec';
  }

  async execute(context: ResourceHandlerContext): Promise<ResourceResult> {
    const { workItem, nodeRun, input } = context;

    const db = await getDb();

    const commandExecId = input.id || crypto.randomUUID();
    const idempotencyKey = input.idempotencyKey as string | undefined;

    if (idempotencyKey) {
      const existing = await db
        .select()
        .from(commandExecs)
        .where(eq(commandExecs.idempotencyKey, idempotencyKey))
        .limit(1)
        .execute();
      if (existing.length > 0) {
        const existingExec = existing[0];
        return {
          resourceType: 'CommandExec',
          resourceId: existingExec.id,
          status:
            existingExec.status === 'succeeded'
              ? RESOURCE_STATUS_SUCCEEDED
              : RESOURCE_STATUS_FAILED,
          summary: `CommandExec ${existingExec.id} already exists (idempotent)`,
          outputs: {
            exitCode: existingExec.exitCode || 0,
            stdoutPath: existingExec.stdoutPath || '',
            stderrPath: existingExec.stderrPath || '',
            logPath: existingExec.logPath || '',
          },
        };
      }
    }

    const logsDir = STORAGE_CONFIG.logsDir;
    await fs.mkdir(logsDir, { recursive: true });

    const logPath = path.join(logsDir, `command-exec-${commandExecId}.log`);
    const stdoutPath = path.join(logsDir, `command-exec-${commandExecId}-stdout.log`);
    const stderrPath = path.join(logsDir, `command-exec-${commandExecId}-stderr.log`);

    await db.insert(commandExecs).values({
      id: commandExecId,
      workItemId: workItem.id,
      nodeRunId: nodeRun.runId,
      command: input.command || input.steps?.[0]?.run || '',
      status: 'running',
      idempotencyKey: idempotencyKey || null,
      logPath,
      stdoutPath,
      stderrPath,
      startedAt: new Date(),
    });

    const execAsync = promisify(exec);

    const workingDirectory = input.workingDirectoryRef
      ? workItem.worktreePath || input.workingDirectoryRef
      : workItem.worktreePath;

    try {
      const { stdout, stderr } = await execAsync(input.command || input.steps?.[0]?.run || '', {
        cwd: workingDirectory,
        env: { ...process.env, ...input.env },
        shell: input.shell || 'bash',
      });

      const exitCode = 0;

      await Promise.all([
        fs.writeFile(stdoutPath, stdout || '', 'utf-8'),
        fs.writeFile(stderrPath, stderr || '', 'utf-8'),
        fs.writeFile(
          logPath,
          `Command: ${input.command || input.steps?.[0]?.run || ''}\n\nSTDOUT:\n${stdout || ''}\n\nSTDERR:\n${stderr || ''}\n`,
          'utf-8'
        ),
      ]);

      await db
        .update(commandExecs)
        .set({
          status: RESOURCE_STATUS_SUCCEEDED,
          exitCode,
          completedAt: new Date(),
        })
        .where(eq(commandExecs.id, commandExecId));

      return {
        resourceType: 'CommandExec',
        resourceId: commandExecId,
        status: RESOURCE_STATUS_SUCCEEDED,
        summary: `Command completed successfully`,
        outputs: {
          exitCode,
          stdoutPath,
          stderrPath,
          logPath,
        },
      };
    } catch (error: any) {
      const exitCode = error.code || 1;
      const errorStderr = error.stderr || error.message || '';
      const errorStdout = error.stdout || '';

      await Promise.all([
        fs.writeFile(stdoutPath, errorStdout, 'utf-8').catch(() => {}),
        fs.writeFile(stderrPath, errorStderr, 'utf-8').catch(() => {}),
        fs
          .writeFile(
            logPath,
            `Command: ${input.command || input.steps?.[0]?.run || ''}\n\nSTDOUT:\n${errorStdout}\n\nSTDERR:\n${errorStderr}\n`,
            'utf-8'
          )
          .catch(() => {}),
      ]);

      await db
        .update(commandExecs)
        .set({
          status: RESOURCE_STATUS_FAILED,
          exitCode,
          completedAt: new Date(),
        })
        .where(eq(commandExecs.id, commandExecId));

      return {
        resourceType: 'CommandExec',
        resourceId: commandExecId,
        status: 'failed',
        summary: `Command failed: ${error.message || 'Unknown error'}`,
        outputs: {
          exitCode,
          stdoutPath,
          stderrPath,
          logPath,
        },
      };
    }
  }
}

export class OpsDispatcher {
  private handlers: Map<ResourceType, ResourceHandler>;

  constructor() {
    this.handlers = new Map();
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.handlers.set('Worktree', new WorktreeResourceHandler());
    this.handlers.set('AgentRun', new AgentRunResourceHandler());
    this.handlers.set('GitOps', new GitOpsResourceHandler());
    this.handlers.set('CommandExec', new CommandExecResourceHandler());
  }

  async call(
    resourceType: ResourceType,
    _input: Record<string, any>,
    context: ResourceHandlerContext
  ): Promise<ResourceResult> {
    const handler = this.handlers.get(resourceType);
    if (!handler) {
      throw new Error(`No Ops handler for resource type: ${resourceType}`);
    }

    return handler.execute(context);
  }

  canHandle(resourceType: ResourceType): boolean {
    const opResources: ResourceType[] = ['Worktree', 'AgentRun', 'GitOps', 'CommandExec'];
    return opResources.includes(resourceType);
  }
}

export const opsDispatcher = new OpsDispatcher();
