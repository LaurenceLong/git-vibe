/**
 * WorkflowExecutionService - Orchestrates workflow execution using NodeSpec model
 *
 * Implements the optimized workflow design:
 * - Event-driven execution based on listen/emit
 * - NodeSpec with listen, trigger, onResult
 * - Uniform event envelope format
 * - Resource versioning and idempotency
 * - Nodes call Resources via ResourceDispatcher with completion callback
 * - Resources complete via callback (NOT event bus)
 * - Only Nodes emit events
 */

import type {
  Workflow,
  NodeSpec,
  WorkflowEvent,
  ResourceKind,
  NodeRunStatus,
  ResourceType,
} from 'git-vibe-shared';
import {
  WORKFLOW_RUN_STATUS_SUCCEEDED,
  WORKFLOW_RUN_STATUS_FAILED,
  WORKFLOW_RUN_STATUS_RUNNING,
  WORKFLOW_RUN_STATUS_PENDING,
  NODE_RUN_STATUS_RUNNING,
  NODE_RUN_STATUS_SUCCEEDED,
  NODE_RUN_STATUS_FAILED,
  RESOURCE_STATUS_SUCCEEDED,
  RESOURCE_STATUS_FAILED,
} from 'git-vibe-shared';
import type { NodeRun, WorkflowRun } from '../../types/models.js';
import { workItemsRepository } from '../../repositories/WorkItemsRepository.js';
import { workflowsRepository } from '../../repositories/WorkflowsRepository.js';
import { workflowEventBus, type WorkflowEventType } from './WorkflowEventBus.js';
import { resourceDispatcher, type ResourceOutcome } from '../ResourceDispatcher.js';
import { eventOutboxService } from '../EventOutbox.js';
import { agentRunsRepository } from '../../repositories/AgentRunsRepository.js';
import { pullRequestsRepository } from '../../repositories/PullRequestsRepository.js';
import { tasksRepository } from '../../repositories/TasksRepository.js';
import { getDb } from '../../db/client.js';
import { nodeRuns, workItems } from '../../models/schema.js';
import { eq } from 'drizzle-orm';
import {
  createDefaultWorkflow,
  getDefaultWorkflowVersion,
  getWorkflowVersion,
} from './defaultWorkflow.js';

/** Evaluation context: event, subject (workitem/task), and related entities. No aggregation of node runs. */
interface ResourceContext {
  workitem?: Record<string, unknown>;
  workItem?: Record<string, unknown>;
  task?: Record<string, unknown>;
  pr_request?: Record<string, unknown>;
  worktree?: Record<string, unknown>;
  ci?: Record<string, unknown>;
  event?: WorkflowEvent;
}

interface EvaluationContext extends ResourceContext {}

export class WorkflowExecutionService {
  // Simple bounded in-memory de-dup cache to avoid unbounded Set growth.
  // Persistent de-duplication should be handled at the event outbox consumer layer.
  private processedEventIds: string[] = [];
  private readonly MAX_PROCESSED_EVENTS = 10_000;

  // Track completed NodeRun attempts for exactly-once completion guarantee
  private completedNodeRunAttempts: Set<string> = new Set();

  /**
   * Evaluate a boolean expression (safe-by-default facade).
   * IMPORTANT: Do not fall back to unsafe evaluation.
   */
  private async evaluateExpression(expr: string, context: EvaluationContext): Promise<boolean> {
    return this.evaluateExpressionSafe(expr, context);
  }

  constructor(
    private workItemsRepo = workItemsRepository,
    private workflowsRepo = workflowsRepository
  ) {
    // Register event handlers
    this.setupEventHandlers();
    console.log('[WorkflowExecutionService] Event handlers registered');
  }

  /**
   * Execute a workflow for a workitem (manual trigger)
   * Creates a workflow run and triggers the initial event
   */
  async execute(workflowId: string, workItemId: string): Promise<WorkflowRun> {
    // Return type is backend's WorkflowRun with Date fields
    const workItem = await this.workItemsRepo.findById(workItemId);
    if (!workItem) {
      throw new Error(`WorkItem ${workItemId} not found`);
    }

    const workflowRecord = await this.workflowsRepo.findById(workflowId);
    if (!workflowRecord) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Get or create workflow run
    const existingRuns = await this.workflowsRepo.findAllRuns(workItemId);
    let workflowRun = existingRuns.find(
      (r: { workflowId: string; status: string }) =>
        r.workflowId === workflowId &&
        r.status !== WORKFLOW_RUN_STATUS_SUCCEEDED &&
        r.status !== WORKFLOW_RUN_STATUS_FAILED
    );

    if (!workflowRun) {
      const runId = crypto.randomUUID();
      workflowRun = await this.workflowsRepo.createRun({
        id: runId,
        workflowId,
        workItemId,
      });
    }

    // Trigger workflow by emitting workitem.created event to match default workflow entry node
    // The default workflow's ev_workitem_created node listens to 'workitem.created'
    const event = workflowEventBus.createEvent(
      'workitem.created',
      { kind: 'workitem', id: workItemId },
      {
        title: workItem.title,
        body: workItem.body,
      },
      {
        resourceVersion: (workItem as any).version || 1,
      }
    );
    await eventOutboxService.addEvent(event);

    return {
      id: workflowRun.id,
      workflowId: workflowRun.workflowId,
      workItemId: workflowRun.workItemId,
      status: workflowRun.status as NodeRunStatus,
      currentStepId: workflowRun.currentStepId,
      startedAt: workflowRun.startedAt ? new Date(workflowRun.startedAt) : null,
      finishedAt: workflowRun.finishedAt ? new Date(workflowRun.finishedAt) : null,
      createdAt: workflowRun.createdAt,
    } as WorkflowRun;
  }

  /**
   * Recover interrupted workflow runs on service startup
   * Finds all runs with status 'running' or 'pending' and resumes them
   */
  async recoverInterruptedRuns(): Promise<void> {
    try {
      // Find all interrupted runs (running or pending)
      const allRuns = await this.workflowsRepo.findAllRuns();
      const interruptedRuns = allRuns.filter(
        (r: { status: string }) =>
          r.status === WORKFLOW_RUN_STATUS_RUNNING || r.status === WORKFLOW_RUN_STATUS_PENDING
      );

      if (interruptedRuns.length === 0) {
        return;
      }

      console.log(
        `[WorkflowExecutionService] Found ${interruptedRuns.length} interrupted workflow runs to recover`
      );

      for (const run of interruptedRuns) {
        try {
          // Mark as failed for now (new format doesn't support resuming the same way)
          await this.workflowsRepo.updateRun(run.id, {
            status: WORKFLOW_RUN_STATUS_FAILED,
            finishedAt: new Date(),
          });
          console.log(`[WorkflowExecutionService] Marked interrupted run ${run.id} as failed`);
        } catch (error) {
          console.error(
            `[WorkflowExecutionService] Failed to recover workflow run ${run.id}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error('[WorkflowExecutionService] Error during workflow recovery:', error);
    }
  }

  /**
   * Setup event handlers for workflow events
   * Uses array-driven approach to reduce duplication
   */
  private setupEventHandlers(): void {
    // Only handle regular node-emitted events
    // resource.result events no longer exist - resources complete via callback
    workflowEventBus.onAny(async (event) => {
      await this.handleEvent(event);
    });
  }

  /**
   * Complete a NodeRun from resource outcome (callback-based completion)
   * This is called by resources via the completion callback
   */
  private async completeNodeRun(nodeRunId: string, outcome: ResourceOutcome): Promise<void> {
    console.log(
      `[WorkflowExecutionService] Completing NodeRun ${nodeRunId} with outcome:`,
      outcome
    );

    const db = await getDb();

    // Get the NodeRun record
    const [nodeRunRecord] = await db
      .select()
      .from(nodeRuns)
      .where(eq(nodeRuns.id, nodeRunId))
      .execute();

    if (!nodeRunRecord) {
      console.error(`[WorkflowExecutionService] NodeRun ${nodeRunId} not found`);
      throw new Error(`NodeRun ${nodeRunId} not found`);
    }

    // Exactly-once completion guarantee
    const completionKey = `${nodeRunId}:${nodeRunRecord.attempt}`;
    if (this.completedNodeRunAttempts.has(completionKey)) {
      console.log(
        `[WorkflowExecutionService] NodeRun ${nodeRunId} attempt ${nodeRunRecord.attempt} already completed, ignoring duplicate`
      );
      return;
    }

    // Safety check: validate resource type matches what was called
    if (nodeRunRecord.resourceType !== outcome.resourceType) {
      console.error(
        `[WorkflowExecutionService] Resource type mismatch: expected ${nodeRunRecord.resourceType}, got ${outcome.resourceType}`
      );
      throw new Error(
        `Resource type mismatch for NodeRun ${nodeRunId}: expected ${nodeRunRecord.resourceType}, got ${outcome.resourceType}`
      );
    }

    // Mark as completed
    this.completedNodeRunAttempts.add(completionKey);

    // Load workflow and node spec
    const workflowRun = await this.workflowsRepo.findRunById(nodeRunRecord.workflowRunId);
    if (!workflowRun) {
      console.error(
        `[WorkflowExecutionService] WorkflowRun ${nodeRunRecord.workflowRunId} not found`
      );
      throw new Error(`WorkflowRun ${nodeRunRecord.workflowRunId} not found`);
    }

    const workflowRecord = await this.workflowsRepo.findById(workflowRun.workflowId);
    if (!workflowRecord) {
      console.error(`[WorkflowExecutionService] Workflow ${workflowRun.workflowId} not found`);
      throw new Error(`Workflow ${workflowRun.workflowId} not found`);
    }

    const workflow: Workflow =
      typeof workflowRecord.definition === 'string'
        ? JSON.parse(workflowRecord.definition)
        : (workflowRecord.definition as Workflow);

    const allNodes = this.getAllNodes(workflow);
    const nodeSpec = allNodes.find((n) => n.id === nodeRunRecord.nodeId);
    if (!nodeSpec) {
      console.error(`[WorkflowExecutionService] NodeSpec ${nodeRunRecord.nodeId} not found`);
      throw new Error(`NodeSpec ${nodeRunRecord.nodeId} not found`);
    }

    // Build evaluation context with outcome
    const workItemId = await this.resolveWorkItemId({
      kind: nodeRunRecord.subjectKind as ResourceKind,
      id: nodeRunRecord.subjectId,
    });
    if (!workItemId) {
      console.error(
        `[WorkflowExecutionService] Could not resolve workItemId for NodeRun ${nodeRunId}`
      );
      return;
    }

    const workItem = await this.workItemsRepo.findById(workItemId);
    if (!workItem) {
      console.error(`[WorkflowExecutionService] WorkItem ${workItemId} not found`);
      return;
    }

    // Create a synthetic event for context building (resource outcome as event)
    const syntheticEvent: WorkflowEvent = {
      eventId: crypto.randomUUID(),
      type: 'node.completed', // Internal event type for completion
      at: new Date().toISOString(),
      subject: {
        kind: nodeRunRecord.subjectKind as ResourceKind,
        id: nodeRunRecord.subjectId,
      },
      causedBy: {
        workflowRunId: nodeRunRecord.workflowRunId,
        nodeId: nodeRunRecord.nodeId,
        nodeRunId: nodeRunId,
        attempt: nodeRunRecord.attempt,
      },
      data: {
        resourceType: outcome.resourceType,
        resourceId: outcome.resourceId,
        status: outcome.status,
        summary: outcome.summary,
        outputs: outcome.outputs,
      },
    };

    const context = await this.buildEvaluationContext(
      workflow,
      nodeRunRecord.workflowRunId,
      workItemId,
      syntheticEvent
    );

    // Add ctx.outcome for onResult evaluation
    (context as any).outcome = outcome;

    // Evaluate onResult rules
    let ruleMatched = false;
    for (const onResultRule of nodeSpec.onResult) {
      const conditionMet = await this.evaluateExpression(onResultRule.when, context);
      if (conditionMet) {
        ruleMatched = true;
        // Apply patches to resources
        if (onResultRule.patch) {
          await this.applyResourcePatches(nodeSpec, context, onResultRule.patch);
        }

        // Emit events via outbox
        if (onResultRule.emit) {
          for (const emit of onResultRule.emit) {
            // Resolve templates in emit.data
            let emitData = emit.data as any;
            if (typeof emitData === 'object' && emitData !== null) {
              emitData = await this.parsePatchValues(emitData as Record<string, unknown>, context);
            }

            // Determine event subject
            let eventSubject = syntheticEvent.subject;
            if (emit.type.startsWith('task.')) {
              const taskId = emitData?.taskId || emitData?.task?.id;
              if (taskId) {
                eventSubject = { kind: 'task' as ResourceKind, id: String(taskId) };
              } else if (context.task) {
                eventSubject = { kind: 'task' as ResourceKind, id: String(context.task.id) };
              }
            }

            const resultEvent = workflowEventBus.createEvent(
              emit.type as WorkflowEventType,
              eventSubject,
              emitData,
              {
                causedBy: syntheticEvent.causedBy,
              }
            );
            await eventOutboxService.addEvent(resultEvent);
          }
        }

        // Determine node run status based on resource result
        const nodeStatus: NodeRunStatus =
          outcome.status === RESOURCE_STATUS_SUCCEEDED
            ? NODE_RUN_STATUS_SUCCEEDED
            : outcome.status === RESOURCE_STATUS_FAILED
              ? NODE_RUN_STATUS_FAILED
              : NODE_RUN_STATUS_SUCCEEDED; // Default to succeeded

        // Update node run status
        await this.updateNodeRunStatus(
          nodeRunId,
          nodeStatus,
          outcome.outputs,
          outcome.status === RESOURCE_STATUS_FAILED ? outcome.summary : undefined
        );

        // Update workflow run status based on node run completion
        await this.updateWorkflowRunStatus(nodeRunRecord.workflowRunId);
        break; // Only process first matching rule
      }
    }

    // If no rule matched, still update node run status based on resource result
    if (!ruleMatched) {
      const nodeStatus: NodeRunStatus =
        outcome.status === RESOURCE_STATUS_SUCCEEDED
          ? NODE_RUN_STATUS_SUCCEEDED
          : outcome.status === RESOURCE_STATUS_FAILED
            ? NODE_RUN_STATUS_FAILED
            : NODE_RUN_STATUS_SUCCEEDED;

      await this.updateNodeRunStatus(
        nodeRunId,
        nodeStatus,
        outcome.outputs,
        outcome.status === RESOURCE_STATUS_FAILED ? outcome.summary : undefined
      );
      await this.updateWorkflowRunStatus(nodeRunRecord.workflowRunId);
    }
  }

  /**
   * Handle a workflow event
   * Implements the event handling loop from optimized design
   */
  private async handleEvent(event: WorkflowEvent): Promise<void> {
    // Event de-dup by eventId
    if (this.processedEventIds.includes(event.eventId)) {
      console.log(`[WorkflowExecutionService] Event ${event.eventId} already processed, skipping`);
      return;
    }
    this.processedEventIds.push(event.eventId);
    if (this.processedEventIds.length > this.MAX_PROCESSED_EVENTS) {
      // Drop oldest entries to bound memory usage
      this.processedEventIds.splice(0, this.processedEventIds.length - this.MAX_PROCESSED_EVENTS);
    }

    console.log(
      `[WorkflowExecutionService] Handling event ${event.type} (${event.eventId}) for subject ${event.subject.kind}:${event.subject.id}`
    );

    try {
      // Load impacted resources and active WorkflowRuns
      const workItemId =
        event.subject.kind === 'workitem'
          ? event.subject.id
          : await this.resolveWorkItemId(event.subject);
      if (!workItemId) {
        console.warn(
          `[WorkflowExecutionService] Could not resolve workItemId for event ${event.eventId}`
        );
        return;
      }

      // Load default workflow for the project
      const workItem = await this.workItemsRepo.findById(workItemId);
      if (!workItem) {
        console.warn(`[WorkflowExecutionService] WorkItem ${workItemId} not found`);
        return;
      }

      let defaultWorkflow = await this.workflowsRepo.findDefault(workItem.projectId);
      if (!defaultWorkflow) {
        // Create default workflow if it doesn't exist
        const expectedDefaultWorkflow = createDefaultWorkflow(workItem.projectId);
        defaultWorkflow = await this.workflowsRepo.create({
          id: expectedDefaultWorkflow.workflow.id,
          projectId: workItem.projectId,
          name: expectedDefaultWorkflow.workflow.name,
          definition: expectedDefaultWorkflow,
          isDefault: true,
          version: getDefaultWorkflowVersion(),
        });
      }

      // Parse workflow and check if it needs updating based on version
      // Handle both string and object definitions
      let workflow: Workflow =
        typeof defaultWorkflow.definition === 'string'
          ? JSON.parse(defaultWorkflow.definition)
          : (defaultWorkflow.definition as Workflow);
      const expectedDefaultWorkflow = createDefaultWorkflow(workItem.projectId);
      const CURRENT_VERSION = getDefaultWorkflowVersion();
      const dbVersion = defaultWorkflow.version || getWorkflowVersion(workflow) || 1;

      // Check if workflow version is outdated
      if (dbVersion < CURRENT_VERSION) {
        console.log(
          `[WorkflowExecutionService] Workflow ${defaultWorkflow.id} version ${dbVersion} is outdated, updating to v${CURRENT_VERSION}...`
        );

        const oldId = defaultWorkflow.id;
        const newId = expectedDefaultWorkflow.workflow.id;

        // If ID changed (due to version change), preserve old version and create new default
        if (oldId !== newId) {
          // Mark old workflow as non-default (preserve for traceability)
          await this.workflowsRepo.update(oldId, {
            isDefault: false,
          });
          // Create new default workflow with new ID
          const newWorkflowRecord = await this.workflowsRepo.create({
            id: newId,
            projectId: workItem.projectId,
            name: expectedDefaultWorkflow.workflow.name,
            definition: expectedDefaultWorkflow,
            isDefault: true,
            version: CURRENT_VERSION,
          });
          // Handle both string and object definitions
          workflow =
            typeof newWorkflowRecord.definition === 'string'
              ? JSON.parse(newWorkflowRecord.definition)
              : (newWorkflowRecord.definition as Workflow);
          defaultWorkflow = newWorkflowRecord;
          console.log(
            `[WorkflowExecutionService] Created new default workflow ${newId} (v${CURRENT_VERSION}), preserved old workflow ${oldId} as non-default`
          );
        } else {
          // Same ID, just update the definition (preserve old version in history if needed)
          const updatedWorkflowRecord = await this.workflowsRepo.update(oldId, {
            name: expectedDefaultWorkflow.workflow.name,
            definition: expectedDefaultWorkflow,
            version: CURRENT_VERSION,
            isDefault: true,
          });

          if (updatedWorkflowRecord) {
            // Handle both string and object definitions
            workflow =
              typeof updatedWorkflowRecord.definition === 'string'
                ? JSON.parse(updatedWorkflowRecord.definition)
                : (updatedWorkflowRecord.definition as Workflow);
            defaultWorkflow = updatedWorkflowRecord;
            console.log(
              `[WorkflowExecutionService] Updated workflow ${oldId} to v${CURRENT_VERSION}`
            );
          } else {
            // If update failed, create new workflow with new ID and preserve old one
            await this.workflowsRepo.update(oldId, {
              isDefault: false,
            });
            const newWorkflowRecord = await this.workflowsRepo.create({
              id: newId,
              projectId: workItem.projectId,
              name: expectedDefaultWorkflow.workflow.name,
              definition: expectedDefaultWorkflow,
              isDefault: true,
              version: CURRENT_VERSION,
            });
            // Handle both string and object definitions
            workflow =
              typeof newWorkflowRecord.definition === 'string'
                ? JSON.parse(newWorkflowRecord.definition)
                : (newWorkflowRecord.definition as Workflow);
            defaultWorkflow = newWorkflowRecord;
            console.log(
              `[WorkflowExecutionService] Created new default workflow ${newId} (v${CURRENT_VERSION}), preserved old workflow ${oldId} as non-default`
            );
          }
        }
      }

      let allNodes = this.getAllNodes(workflow);
      console.log(
        `[WorkflowExecutionService] Using workflow ${defaultWorkflow.id} v${getWorkflowVersion(workflow)} with ${allNodes.length} nodes`
      );

      // Get or create workflow run
      const existingRuns = await this.workflowsRepo.findAllRuns(workItemId);
      let runId: string;
      let workflowRun = existingRuns.find(
        (r: { workflowId: string; status: string }) =>
          r.workflowId === defaultWorkflow.id &&
          r.status !== WORKFLOW_RUN_STATUS_SUCCEEDED &&
          r.status !== WORKFLOW_RUN_STATUS_FAILED
      );

      if (workflowRun) {
        runId = workflowRun.id;
      } else {
        runId = crypto.randomUUID();
        await this.workflowsRepo.createRun({
          id: runId,
          workflowId: defaultWorkflow.id,
          workItemId,
        });
      }

      // Find NodeSpecs whose listens[].on matches event type
      // allNodes is already declared above
      const context = await this.buildEvaluationContext(workflow, runId, workItemId, event);
      const candidateNodes: NodeSpec[] = [];
      for (const node of allNodes) {
        const matches = await this.matchesListenRule(node, event, context);
        if (matches) {
          candidateNodes.push(node);
        }
      }

      console.log(
        `[WorkflowExecutionService] Found ${candidateNodes.length} candidate nodes for event ${event.type}`
      );

      // For each candidate node, evaluate and execute
      for (const nodeSpec of candidateNodes) {
        console.log(
          `[WorkflowExecutionService] Processing candidate node ${nodeSpec.id} for event ${event.type}`
        );
        await this.processNode(nodeSpec, runId, context);
      }

      // Terminal completion: only mark succeeded when the workflow emits a terminal anchor.
      // This avoids incorrectly completing event-driven workflows where many nodes are never triggered.
      if (event.type === 'workflow.anchor.reached' && (event.data as any)?.anchor === 'merged') {
        await this.workflowsRepo.updateRun(runId, {
          status: WORKFLOW_RUN_STATUS_SUCCEEDED,
          finishedAt: new Date(),
        });
      }
    } catch (error) {
      console.error(`[WorkflowExecutionService] Error handling event ${event.eventId}:`, error);
    }
  }

  /**
   * Process a node based on event
   */
  private async processNode(
    nodeSpec: NodeSpec,
    runId: string,
    context: EvaluationContext
  ): Promise<void> {
    try {
      // Resolve subject resource using full context
      const subjectId = await this.resolveIdRef(nodeSpec.subject.idRef, context);
      if (!subjectId) {
        console.warn(
          `[WorkflowExecutionService] Could not resolve subject for node ${nodeSpec.id}`,
          `idRef=${nodeSpec.subject.idRef}`,
          `eventType=${context.event?.type}`,
          `eventSubject=${JSON.stringify(context.event?.subject)}`,
          `hasContextTask=${!!context.task}`,
          `contextTaskId=${context.task?.id}`
        );
        return;
      }

      // Evaluate trigger.when (new format)
      const shouldTrigger = await this.evaluateExpression(nodeSpec.trigger.when, context);
      console.log(
        `[WorkflowExecutionService] Node ${nodeSpec.id} trigger condition "${nodeSpec.trigger.when}" evaluated to: ${shouldTrigger}`
      );
      if (shouldTrigger) {
        // Check idempotency: prevent duplicate execution
        // Resolve idempotency key expression (if provided)
        let idempotencyKey: string | undefined = undefined;
        if (nodeSpec.trigger.call.idempotencyKey) {
          idempotencyKey = await this.resolveExpression(
            nodeSpec.trigger.call.idempotencyKey,
            context
          );
        }

        // Check if this node run already exists and succeeded
        const existingNodeRun = await this.findExistingNodeRun(
          runId,
          nodeSpec.id,
          subjectId,
          nodeSpec.subject.kind,
          idempotencyKey
        );

        if (existingNodeRun) {
          if (existingNodeRun.status === 'succeeded') {
            console.log(
              `[WorkflowExecutionService] Node ${nodeSpec.id} already succeeded, skipping duplicate execution`
            );
            return; // Skip duplicate execution
          }

          // Handle retry logic for failed/canceled nodes
          const maxAttempts = nodeSpec.retry?.maxAttempts || 1;
          const backoffSeconds = nodeSpec.retry?.backoffSeconds || 0;

          if (existingNodeRun.status === 'failed' || existingNodeRun.status === 'canceled') {
            if (existingNodeRun.attempt < maxAttempts) {
              console.log(
                `[WorkflowExecutionService] Node ${nodeSpec.id} failed on attempt ${existingNodeRun.attempt}, will retry (attempt ${existingNodeRun.attempt + 1}/${maxAttempts})`
              );

              // Apply backoff delay if specified
              if (backoffSeconds > 0) {
                await new Promise((resolve) => setTimeout(resolve, backoffSeconds * 1000));
              }

              // Create retry NodeRun with incremented attempt number
              const retryNodeRunId = crypto.randomUUID();
              const resolvedInput = await this.parsePatchValues(
                nodeSpec.trigger.call.input as Record<string, unknown>,
                context
              );
              const retryNodeRun: NodeRun = {
                runId: retryNodeRunId,
                workflowRunId: runId,
                nodeId: nodeSpec.id,
                resourceType: nodeSpec.trigger.call.resourceType,
                subjectKind: nodeSpec.subject.kind,
                subjectId,
                subjectVersionAtStart: await this.getResourceVersion(
                  nodeSpec.subject.kind,
                  subjectId
                ),
                status: NODE_RUN_STATUS_RUNNING,
                attempt: existingNodeRun.attempt + 1,
                idempotencyKey: idempotencyKey ?? undefined,
                input: resolvedInput,
                output: {},
                startedAt: new Date(),
                finishedAt: null,
              };

              await this.persistNodeRun(retryNodeRun);

              // Emit trigger events via outbox
              if (nodeSpec.trigger.emit) {
                for (const emit of nodeSpec.trigger.emit) {
                  const triggerEvent = workflowEventBus.createEvent(
                    emit.type as WorkflowEventType,
                    { kind: nodeSpec.subject.kind, id: subjectId },
                    emit.data,
                    {
                      causedBy: {
                        workflowRunId: runId,
                        nodeId: nodeSpec.id,
                        nodeRunId: retryNodeRunId,
                        attempt: existingNodeRun.attempt + 1,
                      },
                    }
                  );
                  await eventOutboxService.addEvent(triggerEvent);
                }
              }

              // Create completion callback for retry NodeRun
              const completeCallback = async (outcome: ResourceOutcome) => {
                await this.completeNodeRun(retryNodeRunId, outcome);
              };

              // Call ResourceDispatcher with completion callback
              await resourceDispatcher.call(
                nodeSpec.trigger.call.resourceType,
                resolvedInput,
                {
                  workflowRunId: runId,
                  nodeId: nodeSpec.id,
                  nodeRunId: retryNodeRunId,
                  attempt: existingNodeRun.attempt + 1,
                },
                idempotencyKey,
                completeCallback
              );
              return;
            } else {
              console.log(
                `[WorkflowExecutionService] Node ${nodeSpec.id} failed after ${maxAttempts} attempts, giving up`
              );
              return;
            }
          }

          // If existing run is still running/pending, skip to avoid duplicate resource calls
          console.log(
            `[WorkflowExecutionService] Node ${nodeSpec.id} has existing run with status ${existingNodeRun.status}, skipping duplicate execution`
          );
          return;
        }

        // Create NodeRun record
        const nodeRunId = crypto.randomUUID();
        // Resolve templates in trigger input BEFORE calling the resource.
        // Best practice: workflow engine evaluates expressions; resources get concrete inputs.
        const resolvedInput = await this.parsePatchValues(
          nodeSpec.trigger.call.input as Record<string, unknown>,
          context
        );
        const nodeRun: NodeRun = {
          runId: nodeRunId,
          workflowRunId: runId,
          nodeId: nodeSpec.id,
          resourceType: nodeSpec.trigger.call.resourceType,
          subjectKind: nodeSpec.subject.kind,
          subjectId,
          subjectVersionAtStart: await this.getResourceVersion(nodeSpec.subject.kind, subjectId),
          status: NODE_RUN_STATUS_RUNNING,
          attempt: 1,
          idempotencyKey: idempotencyKey ?? undefined,
          input: resolvedInput,
          output: {},
          startedAt: new Date(),
          finishedAt: null,
        };

        // Persist node run to database (status is already running)
        await this.persistNodeRun(nodeRun);

        // Update workflow run status to running when first node starts
        await this.updateWorkflowRunStatus(runId);

        // Emit trigger events via outbox
        if (nodeSpec.trigger.emit) {
          for (const emit of nodeSpec.trigger.emit) {
            const triggerEvent = workflowEventBus.createEvent(
              emit.type as WorkflowEventType,
              { kind: nodeSpec.subject.kind, id: subjectId },
              emit.data,
              {
                causedBy: {
                  workflowRunId: runId,
                  nodeId: nodeSpec.id,
                  nodeRunId,
                  attempt: 1,
                },
              }
            );
            await eventOutboxService.addEvent(triggerEvent);
          }
        }

        // Create completion callback for this NodeRun
        const completeCallback = async (outcome: ResourceOutcome) => {
          await this.completeNodeRun(nodeRunId, outcome);
        };

        // Call ResourceDispatcher with completion callback (NOT event bus)
        await resourceDispatcher.call(
          nodeSpec.trigger.call.resourceType,
          resolvedInput,
          {
            workflowRunId: runId,
            nodeId: nodeSpec.id,
            nodeRunId,
            attempt: 1,
          },
          idempotencyKey,
          completeCallback
        );
      }
    } catch (error) {
      console.error(`[WorkflowExecutionService] Error processing node ${nodeSpec.id}:`, error);
    }
  }

  /**
   * Persist node run to database
   */
  private async persistNodeRun(nodeRun: NodeRun): Promise<void> {
    const db = await getDb();

    // Insert new node run
    await db.insert(nodeRuns).values({
      id: nodeRun.runId,
      runId: nodeRun.runId,
      workflowRunId: nodeRun.workflowRunId,
      nodeId: nodeRun.nodeId,
      resourceType: nodeRun.resourceType,
      subjectKind: nodeRun.subjectKind,
      subjectId: nodeRun.subjectId,
      subjectVersionAtStart: nodeRun.subjectVersionAtStart,
      status: nodeRun.status,
      attempt: nodeRun.attempt,
      idempotencyKey: nodeRun.idempotencyKey || null,
      input: JSON.stringify(nodeRun.input),
      output: JSON.stringify(nodeRun.output),
      startedAt: nodeRun.startedAt ? new Date(nodeRun.startedAt) : null,
      createdAt: new Date(),
    });
  }

  /**
   * Update workflow run status based on node runs
   * Sets status to running when first node starts, succeeded when all nodes succeed, failed when any node fails
   */
  private async updateWorkflowRunStatus(workflowRunId: string): Promise<void> {
    const nodeRuns = await this.getNodeRunsForWorkflowRun(workflowRunId);

    if (nodeRuns.length === 0) {
      return; // No node runs yet
    }

    // NOTE: In an event-driven workflow, not all nodes will be triggered (and therefore not all will have nodeRuns).
    // So we must NOT mark the whole workflow run succeeded based on nodeRuns reaching terminal states.
    // Success is handled by an explicit terminal event/anchor (see handleEvent).

    // Check if any node failed
    const hasFailed = nodeRuns.some((nr) => nr.status === 'failed');

    // Check if any node is running
    const hasRunning = nodeRuns.some((nr) => nr.status === 'running');

    type WorkflowRunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'skipped';
    let newStatus: WorkflowRunStatus;
    if (hasFailed) {
      newStatus = WORKFLOW_RUN_STATUS_FAILED;
    } else if (hasRunning) {
      newStatus = WORKFLOW_RUN_STATUS_RUNNING;
    } else {
      newStatus = WORKFLOW_RUN_STATUS_PENDING;
    }

    // Get current workflow run to check if status changed (avoid full table scan)
    const workflowRun = await this.workflowsRepo.findRunById(workflowRunId);

    if (!workflowRun) {
      return;
    }

    // Only update if status changed
    if (workflowRun.status !== newStatus) {
      await this.workflowsRepo.updateRun(workflowRunId, {
        status: newStatus,
        startedAt: workflowRun.startedAt ? new Date(workflowRun.startedAt) : new Date(),
        finishedAt: newStatus === WORKFLOW_RUN_STATUS_FAILED ? new Date() : null,
      });
    }
  }

  /**
   * Update node run status
   */
  private async updateNodeRunStatus(
    nodeRunId: string,
    status: NodeRunStatus,
    output?: Record<string, unknown>,
    error?: string
  ): Promise<void> {
    const db = await getDb();

    // Get existing node run to preserve output if not provided
    const [existing] = await db.select().from(nodeRuns).where(eq(nodeRuns.id, nodeRunId)).execute();

    const updateData: {
      status: NodeRunStatus;
      finishedAt: Date | null;
      output?: string;
      error?: string | null;
    } = {
      status,
      finishedAt:
        status === NODE_RUN_STATUS_SUCCEEDED || status === NODE_RUN_STATUS_FAILED
          ? new Date()
          : null,
    };

    // Only update output if provided (merge with existing if needed)
    if (output !== undefined) {
      const existingOutput =
        existing && existing.output
          ? typeof existing.output === 'string'
            ? JSON.parse(existing.output)
            : existing.output
          : {};
      updateData.output = JSON.stringify({ ...existingOutput, ...output });
    }

    // Update error if provided
    if (error !== undefined) {
      updateData.error = error || null;
    }

    await db.update(nodeRuns).set(updateData).where(eq(nodeRuns.id, nodeRunId));
  }

  /**
   * Apply resource patches
   * Resolves resource ID by resourceKind (not nodeSpec.subject) and parses expressions in patch values
   */
  private async applyResourcePatches(
    _nodeSpec: NodeSpec,
    context: EvaluationContext,
    patches: Record<string, Record<string, unknown>>
  ): Promise<void> {
    for (const [resourceKind, patch] of Object.entries(patches)) {
      if (typeof patch === 'object' && patch !== null) {
        // Resolve resource ID by resourceKind (not nodeSpec.subject)
        let resourceId: string | null = null;
        if (resourceKind === 'workitem') {
          resourceId =
            (context.workitem?.id as string | null) ||
            (context.workItem?.id as string | null) ||
            null;
        } else if (resourceKind === 'task') {
          resourceId = (context.task?.id as string | null) || null;
        } else if (resourceKind === 'pr_request') {
          resourceId = (context.pr_request?.id as string | null) || null;
        } else if (resourceKind === 'worktree') {
          // Worktree ID is typically the workitem's worktreePath
          resourceId =
            (context.workitem?.worktreePath as string | null) ||
            (context.workItem?.worktreePath as string | null) ||
            null;
        }

        if (!resourceId) {
          console.warn(
            `[WorkflowExecutionService] Could not resolve resource ID for patch ${resourceKind}`
          );
          continue;
        }

        // Parse expressions in patch values recursively
        const parsedPatch = await this.parsePatchValues(patch, context);

        // Apply patch based on resource kind
        if (resourceKind === 'workitem') {
          const updated = await this.workItemsRepo.update(resourceId, parsedPatch as any);
          if (updated) {
            // Emit workitem.updated event to trigger nodes listening to it
            const updateEvent = workflowEventBus.createEvent(
              'workitem.updated',
              { kind: 'workitem', id: resourceId },
              {
                ...parsedPatch,
              },
              {
                causedBy: context.event?.causedBy,
              }
            );
            await eventOutboxService.addEvent(updateEvent);
          }
        } else if (resourceKind === 'task') {
          // Tasks are now separate from AgentRuns - update task status
          await tasksRepository.update(resourceId, {
            ...(parsedPatch.status != null ? { status: parsedPatch.status as any } : {}),
            ...(parsedPatch.currentAgentRunId !== undefined && {
              currentAgentRunId: parsedPatch.currentAgentRunId as string | null,
            }),
            ...(parsedPatch.output !== undefined && {
              output: parsedPatch.output as Record<string, unknown>,
            }),
          });
          console.log(
            `[WorkflowExecutionService] Applied patch to task ${resourceId}:`,
            parsedPatch
          );
        } else if (resourceKind === 'pr_request') {
          // PR requests are PullRequests
          await pullRequestsRepository.update(resourceId, parsedPatch as any);
        } else {
          console.log(
            `[WorkflowExecutionService] Applying patch to ${resourceKind} ${resourceId}:`,
            parsedPatch
          );
        }
      }
    }
  }

  /**
   * Parse expressions in patch values recursively
   * Supports both {path} and ctx.path syntax, and 'ctx.path' string literals
   */
  private async parsePatchValues(
    patch: Record<string, unknown>,
    context: EvaluationContext
  ): Promise<Record<string, unknown>> {
    const parsed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(patch)) {
      if (typeof value === 'string') {
        // ctx.path => treat as a context path lookup (NOT resolveExpression, which only handles "{...}" templates)
        if (value.startsWith('ctx.')) {
          parsed[key] = this.getContextValue(value.replace(/^ctx\./, ''), context);
          continue;
        }

        // {path} or {ctx.path} => template placeholder
        if (value.match(/^\{[a-zA-Z_][a-zA-Z0-9_.]*\}$/)) {
          const innerPath = value.slice(1, -1);
          if (innerPath.startsWith('ctx.')) {
            parsed[key] = this.getContextValue(innerPath.replace(/^ctx\./, ''), context);
          } else {
            parsed[key] = await this.resolveExpression(value, context);
          }
          continue;
        }

        // event.data.sessionId (or similar) => support path strings as values
        if (
          value.match(/^(event|workitem|workItem|task|pr_request|worktree|ci)\.[a-zA-Z0-9_.]+$/)
        ) {
          parsed[key] = this.getContextValue(value, context);
          continue;
        } else if (value.includes('{') && value.includes('}')) {
          // Template string with {path} or {ctx.path} references.
          // Do not replace single-brace placeholders that are inside double-brace {{path}} —
          // those are resolved by the resource handler (e.g. OpsDispatcher.parseTemplate).
          let resolved = value;
          const pathPattern = /\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;
          resolved = resolved.replace(pathPattern, (match, path, offset, fullString) => {
            if (offset > 0 && fullString[offset - 1] === '{') return match;
            const lookupPath = path.startsWith('ctx.') ? path.replace(/^ctx\./, '') : path;
            const pathValue = this.getContextValue(lookupPath, context);
            return String(pathValue ?? '');
          });
          parsed[key] = resolved;
        } else {
          // Plain string, keep as is
          parsed[key] = value;
        }
      } else if (Array.isArray(value)) {
        // Recursively parse arrays
        parsed[key] = await Promise.all(
          value.map(async (item) => {
            if (typeof item === 'string') {
              const resolved = await this.parsePatchValues({ __v: item }, context);
              return resolved.__v;
            }
            if (Array.isArray(item)) {
              const resolved = await this.parsePatchValues({ __v: item }, context);
              return resolved.__v;
            }
            if (typeof item === 'object' && item !== null) {
              return await this.parsePatchValues(item as Record<string, unknown>, context);
            }
            return item;
          })
        );
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursively parse nested objects
        parsed[key] = await this.parsePatchValues(value as Record<string, unknown>, context);
      } else {
        // Primitive value, keep as is
        parsed[key] = value;
      }
    }

    return parsed;
  }

  /**
   * Get value from context by path (e.g., "event.data.outputs.url")
   */
  private getContextValue(path: string, context: EvaluationContext): unknown {
    const parts = path.split('.');
    let value: any = context;
    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) return undefined;
    }
    return value;
  }

  /**
   * Build evaluation context
   */
  private async buildEvaluationContext(
    _workflow: Workflow,
    _runId: string,
    workItemId: string,
    event: WorkflowEvent
  ): Promise<EvaluationContext> {
    const context: EvaluationContext = {
      event,
    };

    // Load workitem
    const workItem = await this.workItemsRepo.findById(workItemId);
    if (workItem) {
      context.workitem = {
        id: workItem.id,
        type: (workItem as { type?: string }).type ?? '',
        status: workItem.status,
        title: workItem.title,
        body: workItem.body,
        worktreePath: workItem.worktreePath,
        headBranch: workItem.headBranch,
        baseBranch: workItem.baseBranch,
        headSha: workItem.headSha,
        baseSha: workItem.baseSha,
        workspaceStatus: workItem.workspaceStatus,
        lockOwnerRunId: (workItem as any).lockOwnerRunId || null,
      };
      context.workItem = context.workitem; // Alias for compatibility
      console.log(
        `[WorkflowExecutionService] Built context for workitem ${workItem.id}: status=${workItem.status}, workspaceStatus=${workItem.workspaceStatus}, lockOwnerRunId=${(workItem as any).lockOwnerRunId || null}`
      );
    }

    // Load task context for task.* events.
    //
    // Best-practice per optimized_workflow_design.md:
    // - Task is a Domain resource with its own table and lifecycle.
    // - AgentRun is an Op resource linked from Task via currentAgentRunId.
    //
    // Therefore: event.subject.kind === 'task' must load from TasksRepository (NOT AgentRunsRepository).
    if (event.subject.kind === 'task') {
      const task = await tasksRepository.findById(event.subject.id);
      if (task) {
        let agentRun = null;
        if (task.currentAgentRunId) {
          agentRun = await agentRunsRepository.findById(task.currentAgentRunId);
        }
        const eventData = event.data as any;
        context.task = {
          id: task.id,
          taskType: task.taskType,
          status: task.status,
          currentAgentRunId: task.currentAgentRunId,
          agentRunId: task.currentAgentRunId,
          sessionId: agentRun?.sessionId || null,
          workItemId: task.workItemId,
          generation: 1,
          cancelRequested: false,
          result: eventData?.result || task.status,
          // task.created event payload: autoStart is not on the task row, needed for listen "when"
          autoStart: eventData?.autoStart,
        };
      }
    } else if (event.type === 'task.completed' && event.data) {
      // Load task from event.data.taskId when subject is workitem
      const eventData = event.data as any;
      if (eventData.taskId) {
        const task = await tasksRepository.findById(String(eventData.taskId));
        if (task) {
          let agentRun = null;
          if (task.currentAgentRunId) {
            agentRun = await agentRunsRepository.findById(task.currentAgentRunId);
          }
          context.task = {
            id: task.id,
            taskType: task.taskType,
            status: task.status,
            currentAgentRunId: task.currentAgentRunId,
            agentRunId: task.currentAgentRunId,
            sessionId: agentRun?.sessionId || null,
            workItemId: task.workItemId,
            generation: 1,
            cancelRequested: false,
            result: eventData.result || task.status,
          };
        }
      }
    }

    // Load PR request data - always load for workitem if it exists
    if (event.subject.kind === 'pr_request') {
      const pr = await pullRequestsRepository.findById(event.subject.id);
      if (pr) {
        context.pr_request = {
          id: pr.id,
          status: pr.status,
          prNumber: pr.id,
          prUrl: '',
          workItemId: pr.workItemId,
          mergeCommitSha: pr.mergeCommitSha,
        };
      }
    } else {
      // Load PR request for workitem if it exists
      const pr = await pullRequestsRepository.findByWorkItemId(workItemId);
      if (pr) {
        context.pr_request = {
          id: pr.id,
          status: pr.status,
          prNumber: pr.id,
          prUrl: '',
          workItemId: pr.workItemId,
          mergeCommitSha: pr.mergeCommitSha,
        };
      }
    }

    // Load CI context from event data (for ci.checks.updated events)
    if (event.type === 'ci.checks.updated' && event.data) {
      const eventData = event.data as any;
      context.ci = {
        requiredChecksGreen: eventData.requiredChecksGreen || false,
      };
    }

    // Load worktree context if available
    if (context.workitem?.worktreePath) {
      context.worktree = {
        id: context.workitem.worktreePath,
        path: context.workitem.worktreePath,
      };
    }

    return context;
  }

  /**
   * Safe expression parser - replaces dangerous new Function() approach
   * Supports: == != && || ! ( ) string/number/boolean literals, path access, "in" operator
   */
  private async evaluateExpressionSafe(expr: string, context: EvaluationContext): Promise<boolean> {
    try {
      // Strip "ctx." prefixes
      let normalized = expr.replace(/\bctx\./g, '');

      // Get context value helper
      const getValue = (path: string): unknown => {
        const parts = path.split('.');
        let value: any = context;
        for (const part of parts) {
          value = value?.[part];
          if (value === undefined) return undefined;
        }
        return value;
      };

      // Simple tokenizer
      const tokens: Array<{ type: string; value: string }> = [];
      let i = 0;
      const skipWhitespace = () => {
        while (i < normalized.length && /\s/.test(normalized[i])) i++;
      };

      while (i < normalized.length) {
        skipWhitespace();
        if (i >= normalized.length) break;

        const char = normalized[i];

        // Operators
        if (normalized.slice(i, i + 2) === '==') {
          tokens.push({ type: 'OP', value: '==' });
          i += 2;
          continue;
        }
        if (normalized.slice(i, i + 2) === '!=') {
          tokens.push({ type: 'OP', value: '!=' });
          i += 2;
          continue;
        }
        if (normalized.slice(i, i + 2) === '&&') {
          tokens.push({ type: 'OP', value: '&&' });
          i += 2;
          continue;
        }
        if (normalized.slice(i, i + 2) === '||') {
          tokens.push({ type: 'OP', value: '||' });
          i += 2;
          continue;
        }
        if (char === '!') {
          tokens.push({ type: 'OP', value: '!' });
          i++;
          continue;
        }
        if (char === '(' || char === '[') {
          tokens.push({ type: 'LPAREN', value: char });
          i++;
          continue;
        }
        if (char === ')' || char === ']') {
          tokens.push({ type: 'RPAREN', value: char });
          i++;
          continue;
        }
        if (char === ',') {
          tokens.push({ type: 'COMMA', value: ',' });
          i++;
          continue;
        }

        // String literals
        if (char === '"' || char === "'") {
          const quote = char;
          i++;
          let value = '';
          while (i < normalized.length && normalized[i] !== quote) {
            if (normalized[i] === '\\' && i + 1 < normalized.length) {
              value += normalized[i + 1];
              i += 2;
            } else {
              value += normalized[i];
              i++;
            }
          }
          if (i < normalized.length) i++; // skip closing quote
          tokens.push({ type: 'STRING', value });
          continue;
        }

        // Numbers
        if (/\d/.test(char)) {
          let value = '';
          while (i < normalized.length && /[\d.]/.test(normalized[i])) {
            value += normalized[i];
            i++;
          }
          tokens.push({ type: 'NUMBER', value });
          continue;
        }

        // Identifiers and paths
        if (/[a-zA-Z_]/.test(char)) {
          let value = '';
          while (i < normalized.length && /[a-zA-Z0-9_.]/.test(normalized[i])) {
            value += normalized[i];
            i++;
          }

          // Check for boolean literals
          if (value === 'true') {
            tokens.push({ type: 'BOOLEAN', value: 'true' });
          } else if (value === 'false') {
            tokens.push({ type: 'BOOLEAN', value: 'false' });
          } else if (value === 'null') {
            tokens.push({ type: 'NULL', value: 'null' });
          } else {
            tokens.push({ type: 'IDENTIFIER', value });
          }
          continue;
        }

        // Unknown character - skip
        i++;
      }

      // Recursive descent parser
      let tokenIndex = 0;
      const currentToken = () => tokens[tokenIndex];
      const consume = (expectedType?: string, expectedValue?: string) => {
        if (tokenIndex >= tokens.length) {
          throw new Error(`Unexpected end of expression`);
        }
        const token = tokens[tokenIndex];
        if (expectedType && token.type !== expectedType) {
          throw new Error(`Expected ${expectedType}, got ${token.type}`);
        }
        if (expectedValue && token.value !== expectedValue) {
          throw new Error(`Expected ${expectedValue}, got ${token.value}`);
        }
        tokenIndex++;
        return token;
      };

      // Deep equality helper (MUST be defined before use; function declaration avoids hoisting bugs)
      function deepEqual(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (a == null || b == null) return a === b;
        if (typeof a !== typeof b) return false;
        if (typeof a === 'object') {
          const aObj = a as Record<string, unknown>;
          const bObj = b as Record<string, unknown>;
          const keysA = Object.keys(aObj);
          const keysB = Object.keys(bObj);
          if (keysA.length !== keysB.length) return false;
          for (const key of keysA) {
            if (!keysB.includes(key) || !deepEqual(aObj[key], bObj[key])) {
              return false;
            }
          }
          return true;
        }
        return false;
      }

      // Parse expression: OR -> AND -> Comparison -> Unary -> Primary
      const parseExpression = (): boolean => {
        let left = parseAnd();
        while (tokenIndex < tokens.length && currentToken().value === '||') {
          consume('OP', '||');
          const right = parseAnd();
          left = left || right;
        }
        return left;
      };

      const parseAnd = (): boolean => {
        let left = parseComparison();
        while (tokenIndex < tokens.length && currentToken().value === '&&') {
          consume('OP', '&&');
          const right = parseComparison();
          left = left && right;
        }
        return left;
      };

      const parseComparison = (): boolean => {
        const left = parseUnary();
        if (tokenIndex < tokens.length) {
          const op = currentToken();
          if (op.value === '==' || op.value === '!=') {
            consume('OP');
            const right = parseUnary();
            if (op.value === '==') {
              return deepEqual(left, right);
            } else {
              return !deepEqual(left, right);
            }
          }
        }
        return Boolean(left);
      };

      const parseUnary = (): unknown => {
        if (tokenIndex < tokens.length && currentToken().value === '!') {
          consume('OP', '!');
          return !parseUnary();
        }
        return parsePrimary();
      };

      const parsePrimary = (): unknown => {
        if (tokenIndex >= tokens.length) {
          throw new Error('Unexpected end of expression');
        }

        const token = currentToken();

        if (token.type === 'LPAREN') {
          consume('LPAREN');
          const result = parseExpression();
          consume('RPAREN');
          return result;
        }

        if (token.type === 'BOOLEAN') {
          return consume('BOOLEAN').value === 'true';
        }

        if (token.type === 'NULL') {
          consume('NULL');
          return null;
        }

        if (token.type === 'STRING') {
          return consume('STRING').value;
        }

        if (token.type === 'NUMBER') {
          const num = parseFloat(consume('NUMBER').value);
          return isNaN(num) ? 0 : num;
        }

        if (token.type === 'IDENTIFIER') {
          const identifier = consume('IDENTIFIER').value;
          const identifierValue = getValue(identifier);

          // Handle "in" operator: x in [a, b, c]
          // Check if next token is "in" identifier
          if (
            tokenIndex < tokens.length &&
            currentToken().type === 'IDENTIFIER' &&
            currentToken().value === 'in'
          ) {
            consume('IDENTIFIER', 'in'); // consume "in"

            // Expect '[' after "in"
            if (
              tokenIndex >= tokens.length ||
              currentToken().type !== 'LPAREN' ||
              currentToken().value !== '['
            ) {
              throw new Error('Expected "[" after "in" operator');
            }
            consume('LPAREN'); // consume '['

            // Parse array elements
            const array: unknown[] = [];
            if (tokenIndex < tokens.length && currentToken().type !== 'RPAREN') {
              // Parse first element
              array.push(parsePrimary());
              // Parse remaining elements
              while (tokenIndex < tokens.length && currentToken().type !== 'RPAREN') {
                // Expect comma
                if (currentToken().type === 'COMMA') {
                  consume('COMMA');
                }
                if (tokenIndex < tokens.length && currentToken().type !== 'RPAREN') {
                  array.push(parsePrimary());
                }
              }
            }
            // Expect ']'
            if (
              tokenIndex >= tokens.length ||
              currentToken().type !== 'RPAREN' ||
              currentToken().value !== ']'
            ) {
              throw new Error('Expected "]" to close array');
            }
            consume('RPAREN'); // consume ']'

            // Check if identifierValue is in array
            return array.some((item) => deepEqual(item, identifierValue));
          }

          // Regular identifier - get value from context
          return identifierValue;
        }

        throw new Error(`Unexpected token: ${token.type} ${token.value}`);
      };

      const result = parseExpression();
      return Boolean(result);
    } catch (error) {
      console.error(
        `[WorkflowExecutionService] Error in safe expression parser for "${expr}":`,
        error
      );
      // IMPORTANT: Do not fall back to unsafe evaluation.
      // Treat expression errors as "condition not met" to avoid RCE risk.
      return false;
    }
  }

  /**
   * Resolve ID reference expression
   */
  private async resolveIdRef(idRef: string, context: EvaluationContext): Promise<string | null> {
    // Strip "ctx." prefix if present (workflow definitions use ctx.event.subject.id)
    let path = idRef;
    if (path.startsWith('ctx.')) {
      path = path.substring(4); // Remove "ctx." prefix
    }

    // Simple resolution: if it's "event.subject.id", return event.subject.id
    if (path === 'event.subject.id' && context.event) {
      return context.event.subject.id;
    }
    if (path === 'workitem.id' && context.workitem) {
      return (context.workitem as { id: string }).id;
    }
    if (path === 'workitem.id' && context.workItem) {
      return (context.workItem as { id: string }).id;
    }
    // Support dot notation (e.g., "task.id", "pr_request.id", "event.subject.id")
    const parts = path.split('.');
    let value: any = context;
    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) return null;
    }
    return String(value || '');
  }

  /**
   * Resolve expression (for idempotency keys and other string expressions)
   */
  private async resolveExpression(expr: string, context: EvaluationContext): Promise<string> {
    // Replace variable references with actual values
    let resolved = expr;

    // Build a map of all available paths in context
    const contextPaths = new Map<string, unknown>();

    // First, collect all nested properties
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          const path = `${key}.${nestedKey}`;
          contextPaths.set(path, nestedValue);
        }
        contextPaths.set(key, value);
      } else if (!Array.isArray(value)) {
        contextPaths.set(key, value);
      }
    }

    // Replace known paths (longest paths first)
    const sortedPaths = Array.from(contextPaths.entries()).sort(
      (a, b) => b[0].length - a[0].length
    );
    for (const [path, pathValue] of sortedPaths) {
      const pattern = new RegExp(`\\{${path.replace(/\./g, '\\.')}\\}`, 'g');
      resolved = resolved.replace(pattern, String(pathValue || ''));
    }

    // Replace {variable} patterns
    for (const [path, pathValue] of sortedPaths) {
      const pattern = new RegExp(`\\{${path.replace(/\./g, '\\.')}\\}`, 'g');
      resolved = resolved.replace(pattern, String(pathValue || ''));
    }

    return resolved;
  }

  /**
   * Resolve workItemId from subject
   */
  private async resolveWorkItemId(subject: {
    kind: ResourceKind;
    id: string;
  }): Promise<string | null> {
    if (subject.kind === 'workitem') {
      return subject.id;
    }
    if (subject.kind === 'task') {
      // Tasks are now separate from AgentRuns, get workItemId from task
      const task = await tasksRepository.findById(subject.id);
      return task?.workItemId || null;
    }
    if (subject.kind === 'pr_request') {
      // PR requests are PullRequests, get workItemId from PR
      const pr = await pullRequestsRepository.findById(subject.id);
      return pr?.workItemId || null;
    }
    if (subject.kind === 'worktree') {
      // Worktrees belong to workitems - find workitem by worktree path
      // subject.id is the worktree path, not the workitem id
      // Use direct DB query to avoid full table scan
      const db = await getDb();
      const [workItem] = await db
        .select()
        .from(workItems)
        .where(eq(workItems.worktreePath, subject.id))
        .execute();
      return workItem?.id || null;
    }
    return null;
  }

  /**
   * Get all nodes from workflow (backbone + extensions)
   */
  private getAllNodes(workflow: Workflow): NodeSpec[] {
    const nodes: NodeSpec[] = [];
    nodes.push(...workflow.workflow.backbone.nodes);
    nodes.push(...workflow.workflow.extensions.nodes);
    return nodes;
  }

  /**
   * Check if node matches listen rule for event
   */
  private async matchesListenRule(
    nodeSpec: NodeSpec,
    event: WorkflowEvent,
    context: EvaluationContext
  ): Promise<boolean> {
    for (const listen of nodeSpec.listens) {
      if (this.matchesEventType(listen.on, event.type)) {
        // Check optional "when" condition
        if (listen.when) {
          const conditionMet = await this.evaluateExpression(listen.when, context);
          if (!conditionMet) {
            continue; // This listen rule doesn't match
          }
        }
        return true; // Event type matches and when condition (if any) is satisfied
      }
    }
    return false;
  }

  /**
   * Check if event type matches pattern
   */
  private matchesEventType(pattern: string, eventType: string): boolean {
    // Simple exact match for now
    // TODO: Support wildcards/patterns
    return pattern === eventType;
  }

  /**
   * Get resource version
   */
  private async getResourceVersion(kind: ResourceKind, id: string): Promise<number> {
    if (kind === 'workitem') {
      const workItem = await this.workItemsRepo.findById(id);
      return (workItem as any)?.version || 1;
    }
    // TODO: Implement versioning for other resource types
    return 1;
  }

  /**
   * Find existing node run for idempotency check
   * Checks for existing runs with same workflowRunId + nodeId + subjectId + idempotencyKey
   */
  private async findExistingNodeRun(
    workflowRunId: string,
    nodeId: string,
    subjectId: string,
    subjectKind: ResourceKind,
    idempotencyKey?: string
  ): Promise<NodeRun | null> {
    const db = await getDb();
    const { and, eq } = await import('drizzle-orm');

    // Build where conditions
    const conditions = [
      eq(nodeRuns.workflowRunId, workflowRunId),
      eq(nodeRuns.nodeId, nodeId),
      eq(nodeRuns.subjectId, subjectId),
      eq(nodeRuns.subjectKind, subjectKind),
    ];

    // If idempotencyKey is provided, also match on it
    if (idempotencyKey) {
      conditions.push(eq(nodeRuns.idempotencyKey, idempotencyKey));
    }

    const results = await db
      .select()
      .from(nodeRuns)
      .where(and(...conditions))
      .execute();

    if (results.length === 0) {
      return null;
    }

    // Return the most recent run (highest attempt or latest createdAt)
    const sorted = results.sort((a, b) => {
      if (a.attempt !== b.attempt) {
        return b.attempt - a.attempt;
      }
      const aTime =
        a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const bTime =
        b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

    const r = sorted[0];
    return {
      runId: r.id,
      workflowRunId: r.workflowRunId,
      nodeId: r.nodeId,
      resourceType: r.resourceType as ResourceType,
      subjectKind: r.subjectKind as ResourceKind,
      subjectId: r.subjectId,
      subjectVersionAtStart: r.subjectVersionAtStart,
      status: r.status as NodeRunStatus,
      attempt: r.attempt,
      idempotencyKey: r.idempotencyKey ?? undefined,
      input: typeof r.input === 'string' ? JSON.parse(r.input) : r.input,
      output: typeof r.output === 'string' ? JSON.parse(r.output) : r.output,
      error: r.error ?? undefined,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    };
  }

  /**
   * Get node runs for workflow run
   */
  private async getNodeRunsForWorkflowRun(runId: string): Promise<NodeRun[]> {
    const db = await getDb();

    const runs = await db.select().from(nodeRuns).where(eq(nodeRuns.workflowRunId, runId));

    return runs.map((r: any) => ({
      runId: r.id,
      workflowRunId: r.workflowRunId,
      nodeId: r.nodeId,
      resourceType: r.resourceType as ResourceType,
      subjectKind: r.subjectKind as ResourceKind,
      subjectId: r.subjectId,
      subjectVersionAtStart: r.subjectVersionAtStart,
      status: r.status as NodeRunStatus,
      attempt: r.attempt,
      idempotencyKey: r.idempotencyKey ?? undefined,
      input: typeof r.input === 'string' ? JSON.parse(r.input) : r.input,
      output: typeof r.output === 'string' ? JSON.parse(r.output) : r.output,
      error: r.error ?? undefined,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    }));
  }
}

export const workflowExecutionService = new WorkflowExecutionService();
