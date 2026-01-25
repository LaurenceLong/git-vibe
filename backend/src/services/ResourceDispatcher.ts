/**
 * ResourceDispatcher - Central dispatcher that routes to DomainDispatcher or OpsDispatcher
 *
 * Implements the optimized workflow design exactly as specified:
 * - Separates Domain resources (WorkItem, Task, PullRequest) from Op resources (Worktree, AgentRun, GitOps, CommandExec)
 * - Enforces idempotency at NodeRun and Resource levels
 * - Resources call completion callback (NOT event bus)
 * - Subject is always business entity (workitem), never synthetic resource_call
 * - Call signature: call(resourceType, input, causedBy, idempotencyKey, complete) -> Promise<void>
 *
 * Per optimized_workflow_design.md:
 * - Domain Resources: state transitions (no long-running external execution implied)
 * - Op Resources: external execution (often long-running, asynchronous)
 * - Resources NEVER emit events - only Nodes emit events
 */

import type { WorkItem, NodeRun } from '../types/models';
import type { ResourceType, EventCausedBy } from 'git-vibe-shared';
import { RESOURCE_STATUS_SUCCEEDED } from 'git-vibe-shared';
import { workItemsRepository } from '../repositories/WorkItemsRepository';
import { pullRequestsRepository } from '../repositories/PullRequestsRepository';
import { tasksRepository } from '../repositories/TasksRepository';
import { getDb } from '../db/client.js';
import { nodeRuns, workItems } from '../models/schema.js';
import { eq, and, ne } from 'drizzle-orm';
import { domainDispatcher, type ResourceResult } from './DomainDispatcher.js';
import { opsDispatcher } from './OpsDispatcher.js';

export interface ResourceHandlerContext {
  workItem: WorkItem;
  nodeRun: NodeRun;
  input: Record<string, any>;
  complete?: CompleteFn; // Completion callback for async resources (like AgentRun)
}

/**
 * Completion callback type for resource completion
 * Resources call this when they finish (succeeded, failed, or canceled)
 */
export type CompleteFn = (outcome: ResourceOutcome) => Promise<void>;

/**
 * Resource outcome returned to the engine via completion callback
 */
export interface ResourceOutcome {
  resourceType: ResourceType;
  resourceId: string;
  status: 'succeeded' | 'failed' | 'canceled';
  summary?: string;
  outputs?: Record<string, unknown>;
}

export class ResourceDispatcher {
  /**
   * Call a resource with completion callback (matches spec signature exactly)
   * call(resourceType, input, causedBy, idempotencyKey, complete) -> Promise<void>
   */
  async call(
    resourceType: ResourceType,
    input: Record<string, any>,
    causedBy: EventCausedBy,
    idempotencyKey: string | undefined,
    complete: CompleteFn
  ): Promise<void> {
    if (!causedBy.workflowRunId || !causedBy.nodeRunId) {
      throw new Error('causedBy must include workflowRunId and nodeRunId');
    }

    const db = await getDb();

    const nodeRunRecord = await db
      .select()
      .from(nodeRuns)
      .where(eq(nodeRuns.id, causedBy.nodeRunId))
      .limit(1);

    if (nodeRunRecord.length === 0) {
      throw new Error(`NodeRun ${causedBy.nodeRunId} not found`);
    }

    const nodeRunData = nodeRunRecord[0];

    // Store the called resource type for safety validation on completion
    await db.update(nodeRuns).set({ resourceType }).where(eq(nodeRuns.id, causedBy.nodeRunId));

    // Check for idempotency - return cached result if exists
    if (idempotencyKey) {
      const previousSuccess = await db
        .select()
        .from(nodeRuns)
        .where(
          and(
            eq(nodeRuns.workflowRunId, causedBy.workflowRunId!),
            eq(nodeRuns.nodeId, causedBy.nodeId!),
            eq(nodeRuns.idempotencyKey, idempotencyKey),
            ne(nodeRuns.id, nodeRunData.id),
            eq(nodeRuns.status, 'succeeded')
          )
        )
        .limit(1);

      if (previousSuccess.length > 0) {
        const output =
          typeof previousSuccess[0].output === 'string'
            ? JSON.parse(previousSuccess[0].output)
            : previousSuccess[0].output;
        // Complete with cached result via callback (not event bus)
        await complete({
          resourceType: previousSuccess[0].resourceType as ResourceType,
          resourceId: output?.resourceId || previousSuccess[0].id,
          status: RESOURCE_STATUS_SUCCEEDED,
          summary: output?.summary || 'Cached result from previous execution',
          outputs: output?.outputs || output || {},
        });
        return;
      }
    }

    let workItemId: string;
    const subjectKind = nodeRunData.subjectKind as string;

    if (subjectKind === 'task') {
      const task = await tasksRepository.findById(nodeRunData.subjectId);
      if (!task) {
        throw new Error(`Task ${nodeRunData.subjectId} not found`);
      }
      workItemId = task.workItemId;
    } else if (subjectKind === 'pr_request') {
      const pr = await pullRequestsRepository.findById(nodeRunData.subjectId);
      if (!pr) {
        throw new Error(`PR request ${nodeRunData.subjectId} not found`);
      }
      workItemId = pr.workItemId;
    } else if (subjectKind === 'worktree') {
      // subjectId is the worktree path (worktree.id in context is worktreePath)
      const [workItemByPath] = await db
        .select()
        .from(workItems)
        .where(eq(workItems.worktreePath, nodeRunData.subjectId))
        .limit(1);
      if (!workItemByPath) {
        throw new Error(`WorkItem for worktree ${nodeRunData.subjectId} not found`);
      }
      workItemId = workItemByPath.id;
    } else {
      workItemId = nodeRunData.subjectId;
    }

    const workItem = await workItemsRepository.findById(workItemId);
    if (!workItem) {
      throw new Error(`WorkItem ${workItemId} not found`);
    }

    const nodeRun: NodeRun = {
      runId: nodeRunData.id,
      workflowRunId: nodeRunData.workflowRunId,
      nodeId: nodeRunData.nodeId,
      resourceType: nodeRunData.resourceType as ResourceType,
      subjectKind: nodeRunData.subjectKind as any,
      subjectId: nodeRunData.subjectId,
      subjectVersionAtStart: nodeRunData.subjectVersionAtStart,
      status: nodeRunData.status as any,
      attempt: nodeRunData.attempt,
      idempotencyKey: nodeRunData.idempotencyKey || undefined,
      input:
        typeof nodeRunData.input === 'string' ? JSON.parse(nodeRunData.input) : nodeRunData.input,
      output:
        typeof nodeRunData.output === 'string'
          ? JSON.parse(nodeRunData.output)
          : nodeRunData.output,
      startedAt: nodeRunData.startedAt?.toISOString(),
      finishedAt: nodeRunData.finishedAt?.toISOString(),
    };

    const context: ResourceHandlerContext = {
      workItem,
      nodeRun,
      input,
      complete, // Pass completion callback to handlers for async resources
    };

    let result: ResourceResult;

    try {
      if (domainDispatcher.canHandle(resourceType)) {
        result = await domainDispatcher.call(resourceType, input, context);
        // Domain resources complete synchronously
        await complete({
          resourceType: result.resourceType,
          resourceId: result.resourceId,
          status: result.status,
          summary: result.summary,
          outputs: result.outputs,
        });
      } else if (opsDispatcher.canHandle(resourceType)) {
        result = await opsDispatcher.call(resourceType, input, context);
        // Op resources: AgentRun completes asynchronously (callback stored in handler)
        // Other Op resources complete synchronously
        if (resourceType !== 'AgentRun') {
          await complete({
            resourceType: result.resourceType,
            resourceId: result.resourceId,
            status: result.status,
            summary: result.summary,
            outputs: result.outputs,
          });
        }
        // For AgentRun, the completion callback is stored in AgentRunResourceHandler
        // and will be called by AgentService.finalizeAgentRun() when the agent completes
      } else {
        throw new Error(`No handler for resource type: ${resourceType}`);
      }
    } catch (error) {
      // Complete with failed outcome on error
      console.error(`[ResourceDispatcher] Resource call failed for NodeRun ${causedBy.nodeRunId}`, {
        resourceType,
        error: error instanceof Error ? error.message : String(error),
        causedBy,
      });
      await complete({
        resourceType,
        resourceId: nodeRunData.id,
        status: 'failed',
        summary: error instanceof Error ? error.message : 'Unknown error',
        outputs: {},
      });
    }
  }
}

export const resourceDispatcher = new ResourceDispatcher();
