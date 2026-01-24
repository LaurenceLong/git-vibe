import type { Workflow, WorkflowNode, WorkflowRun, StepStatus } from 'git-vibe-shared';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { workflowsRepository } from '../repositories/WorkflowsRepository.js';
import { agentRunsRepository } from '../repositories/AgentRunsRepository.js';
import { pullRequestsRepository } from '../repositories/PullRequestsRepository.js';
import { workflowEventBus, type WorkItemEventType } from './WorkflowEventBus.js';
import { workItemEventService } from './WorkItemEventService.js';
import { WorkspaceNodeExecutor } from './workflow-executors/WorkspaceNodeExecutor.js';
import { AgentNodeExecutor } from './workflow-executors/AgentNodeExecutor.js';
import { PRNodeExecutor } from './workflow-executors/PRNodeExecutor.js';
import { EventNodeExecutor } from './workflow-executors/EventNodeExecutor.js';
import { GitNodeExecutor } from './workflow-executors/GitNodeExecutor.js';
import { CINodeExecutor } from './workflow-executors/CINodeExecutor.js';
import type { NodeExecutor } from './workflow-executors/BaseNodeExecutor.js';

export interface ExecutionContext {
  workItemId: string;
  workflow: Workflow;
  runId: string;
  nodeId?: string;
  stepId?: string;
  outputs: Map<string, unknown>;
  artifacts: unknown[];
  sessionId?: string;
  eventData?: Record<string, unknown>;
}

export class WorkflowExecutionService {
  private nodeExecutors: NodeExecutor[];

  constructor(
    private workItemsRepo = workItemsRepository,
    private workflowsRepo = workflowsRepository,
    private agentRunsRepo = agentRunsRepository,
    private prsRepo = pullRequestsRepository
  ) {
    // Initialize node executors
    this.nodeExecutors = [
      new WorkspaceNodeExecutor(),
      new AgentNodeExecutor(),
      new PRNodeExecutor(),
      new EventNodeExecutor(),
      new GitNodeExecutor(),
      new CINodeExecutor(),
    ];

    // Register event handlers
    this.setupEventHandlers();
    console.log('[WorkflowExecutionService] Event handlers registered');
  }

  /**
   * Recover interrupted workflow runs on service startup
   * Finds all runs with status 'running' or 'pending' and resumes them
   */
  async recoverInterruptedRuns(): Promise<void> {
    try {
      // First, release all stale locks from crashed services
      console.log('[WorkflowExecutionService] Cleaning up stale locks...');
      const releasedCount = await this.workItemsRepo.releaseStaleLocks();
      if (releasedCount > 0) {
        console.log(
          `[WorkflowExecutionService] Released ${releasedCount} stale lock(s) before recovering runs`
        );
      }

      // Find all interrupted runs (running or pending)
      const allRuns = await this.workflowsRepo.findAllRuns();
      const interruptedRuns = allRuns.filter(
        (r) => r.status === 'running' || r.status === 'pending'
      );

      if (interruptedRuns.length === 0) {
        return;
      }

      console.log(
        `[WorkflowExecutionService] Found ${interruptedRuns.length} interrupted workflow runs to recover`
      );

      for (const run of interruptedRuns) {
        try {
          await this.resumeWorkflowRun(run.id);
        } catch (error) {
          console.error(
            `[WorkflowExecutionService] Failed to recover workflow run ${run.id}:`,
            error
          );
          // Mark as failed if recovery fails
          await this.workflowsRepo.updateRun(run.id, {
            status: 'failed',
            finishedAt: new Date(),
          });
        }
      }
    } catch (error) {
      console.error('[WorkflowExecutionService] Error during workflow recovery:', error);
    }
  }

  /**
   * Resume a workflow run from the last completed step
   */
  private async resumeWorkflowRun(runId: string): Promise<void> {
    const run = await this.workflowsRepo.findRunById(runId);
    if (!run) {
      throw new Error(`Workflow run ${runId} not found`);
    }

    // If already completed, skip
    if (run.status === 'succeeded' || run.status === 'failed') {
      return;
    }

    // Load workflow definition
    const workflowRecord = await this.workflowsRepo.findById(run.workflowId);
    if (!workflowRecord) {
      throw new Error(`Workflow ${run.workflowId} not found`);
    }

    const workflow: Workflow = JSON.parse(workflowRecord.definition);

    // Get all step executions for this run
    const steps = await this.workflowsRepo.findStepExecutionsByRunId(runId);

    // Mark any 'running' steps as 'failed' (they were interrupted)
    for (const step of steps) {
      if (step.status === 'running') {
        await this.workflowsRepo.updateStepExecution(step.id, {
          status: 'failed',
          finishedAt: new Date(),
          errorMessage: 'Step was interrupted by service restart',
        });
      }
    }

    // Find the last succeeded step
    const succeededSteps = steps
      .filter((s) => s.status === 'succeeded')
      .sort((a, b) => {
        const aTime = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
        const bTime = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
        return bTime - aTime;
      });

    // Determine where to resume
    const flattenedNodes = this.flattenWorkflow(workflow);
    let resumeFromNodeId: string | undefined;

    if (succeededSteps.length > 0) {
      // Resume from the step after the last succeeded step
      const lastSucceededStep = succeededSteps[0]!;
      const lastSucceededIndex = flattenedNodes.findIndex(
        (n) => n?.id === lastSucceededStep.nodeId
      );

      if (lastSucceededIndex >= 0 && lastSucceededIndex < flattenedNodes.length - 1) {
        // Resume from the next node
        const nextNode = flattenedNodes[lastSucceededIndex + 1];
        if (nextNode) {
          resumeFromNodeId = nextNode.id;
        }
      }
    } else {
      // No succeeded steps, start from the beginning
      // Try to find the event node that triggered this run
      // For now, start from the first node
      const firstNode = flattenedNodes[0];
      if (firstNode) {
        resumeFromNodeId = firstNode.id;
      }
    }

    if (!resumeFromNodeId) {
      // No node to resume from, mark as failed
      await this.workflowsRepo.updateRun(runId, {
        status: 'failed',
        finishedAt: new Date(),
      });
      return;
    }

    // Rebuild outputs from succeeded steps
    const outputs = new Map<string, unknown>();
    for (const step of succeededSteps) {
      if (step.outputs) {
        const stepOutputs =
          typeof step.outputs === 'string' ? JSON.parse(step.outputs) : step.outputs;
        for (const [key, value] of Object.entries(stepOutputs)) {
          outputs.set(key, value);
        }
      }
    }

    // Resume execution from the determined node with accumulated outputs
    console.log(
      `[WorkflowExecutionService] Resuming workflow run ${runId} from node ${resumeFromNodeId}`
    );
    await this.executeWorkflowFromNode(workflow, runId, run.workItemId, resumeFromNodeId, outputs);
  }

  /**
   * Get the appropriate executor for a node
   */
  private getNodeExecutor(node: WorkflowNode): NodeExecutor | undefined {
    return this.nodeExecutors.find((executor) => executor.canHandle(node));
  }

  /**
   * Sync WorkItem state from workflow outputs
   */
  private async syncWorkItemStateFromOutputs(
    workItemId: string,
    outputs: Map<string, unknown>
  ): Promise<void> {
    const stateUpdate: any = {};

    // Map workflow outputs to WorkItem fields
    if (outputs.has('workspace.worktreePath')) {
      stateUpdate.worktreePath = outputs.get('workspace.worktreePath');
    }
    if (outputs.has('workspace.headBranch')) {
      stateUpdate.headBranch = outputs.get('workspace.headBranch');
    }
    if (outputs.has('workspace.baseBranch')) {
      stateUpdate.baseBranch = outputs.get('workspace.baseBranch');
    }
    if (outputs.has('workspace.baseSha')) {
      stateUpdate.baseSha = outputs.get('workspace.baseSha');
    }
    if (outputs.has('workspace.headSha') || outputs.has('agent.headShaAfter')) {
      stateUpdate.headSha = outputs.get('workspace.headSha') || outputs.get('agent.headShaAfter');
    }
    if (outputs.has('workspace.status')) {
      stateUpdate.workspaceStatus = outputs.get('workspace.status');
    }

    // Update WorkItem state via event service (which emits events)
    if (Object.keys(stateUpdate).length > 0) {
      await workItemEventService.updateWorkItemState(workItemId, stateUpdate);
    }
  }

  /**
   * Setup event handlers for WorkItem events
   */
  private setupEventHandlers(): void {
    workflowEventBus.on('workitem.created', async (event) => {
      console.log(
        `[WorkflowExecutionService] Received workitem.created event for ${event.workItemId}`
      );
      try {
        await this.handleWorkItemEvent(
          event.type as WorkItemEventType,
          event.workItemId,
          event.data as Record<string, unknown>
        );
        console.log(
          `[WorkflowExecutionService] Successfully handled workitem.created event for ${event.workItemId}`
        );
      } catch (error) {
        console.error(`Failed to handle workitem.created event for ${event.workItemId}:`, error);
      }
    });

    workflowEventBus.on('workitem.status.changed', async (event) => {
      try {
        await this.handleWorkItemEvent(
          event.type as WorkItemEventType,
          event.workItemId,
          event.data as Record<string, unknown>
        );
      } catch (error) {
        console.error(
          `Failed to handle workitem.status.changed event for ${event.workItemId}:`,
          error
        );
      }
    });

    workflowEventBus.on('workitem.closed', async (event) => {
      try {
        await this.handleWorkItemEvent(
          event.type as WorkItemEventType,
          event.workItemId,
          event.data as Record<string, unknown>
        );
      } catch (error) {
        console.error(`Failed to handle workitem.closed event for ${event.workItemId}:`, error);
      }
    });

    workflowEventBus.on('workitem.updated', async (event) => {
      try {
        await this.handleWorkItemEvent(
          event.type as WorkItemEventType,
          event.workItemId,
          event.data as Record<string, unknown>
        );
      } catch (error) {
        console.error(`Failed to handle workitem.updated event for ${event.workItemId}:`, error);
      }
    });

    workflowEventBus.on('workitem.workspace.ready', async (event) => {
      try {
        await this.handleWorkItemEvent(
          event.type as WorkItemEventType,
          event.workItemId,
          event.data as Record<string, unknown>
        );
      } catch (error) {
        console.error(
          `Failed to handle workitem.workspace.ready event for ${event.workItemId}:`,
          error
        );
      }
    });

    workflowEventBus.on('workitem.task.start', async (event) => {
      console.log(
        `[WorkflowExecutionService] Received workitem.task.start event for ${event.workItemId}`
      );
      try {
        await this.handleWorkItemEvent(
          event.type as WorkItemEventType,
          event.workItemId,
          event.data as Record<string, unknown>
        );
        console.log(
          `[WorkflowExecutionService] Successfully handled workitem.task.start event for ${event.workItemId}`
        );
      } catch (error) {
        console.error(`Failed to handle workitem.task.start event for ${event.workItemId}:`, error);
      }
    });

    workflowEventBus.on('workitem.task.resume', async (event) => {
      console.log(
        `[WorkflowExecutionService] Received workitem.task.resume event for ${event.workItemId}`
      );
      try {
        await this.handleWorkItemEvent(
          event.type as WorkItemEventType,
          event.workItemId,
          event.data as Record<string, unknown>
        );
        console.log(
          `[WorkflowExecutionService] Successfully handled workitem.task.resume event for ${event.workItemId}`
        );
      } catch (error) {
        console.error(
          `Failed to handle workitem.task.resume event for ${event.workItemId}:`,
          error
        );
      }
    });

    workflowEventBus.on('workitem.restarted', async (event) => {
      console.log(
        `[WorkflowExecutionService] Received workitem.restarted event for ${event.workItemId}`
      );
      try {
        await this.handleWorkItemEvent(
          event.type as WorkItemEventType,
          event.workItemId,
          event.data as Record<string, unknown>
        );
        console.log(
          `[WorkflowExecutionService] Successfully handled workitem.restarted event for ${event.workItemId}`
        );
      } catch (error) {
        console.error(`Failed to handle workitem.restarted event for ${event.workItemId}:`, error);
      }
    });
  }

  /**
   * Handle WorkItem events by finding and executing matching workflow event nodes
   */
  async handleWorkItemEvent(
    eventType: WorkItemEventType,
    workItemId: string,
    eventData?: Record<string, unknown>
  ): Promise<void> {
    console.log(
      `[WorkflowExecutionService] handleWorkItemEvent called: eventType=${eventType}, workItemId=${workItemId}`
    );

    const workItem = await this.workItemsRepo.findById(workItemId);
    if (!workItem) {
      throw new Error(`WorkItem ${workItemId} not found`);
    }

    // Load default workflow for the project, create if it doesn't exist
    let defaultWorkflow = await this.workflowsRepo.findDefault(workItem.projectId);
    if (!defaultWorkflow) {
      console.log(
        `[WorkflowExecutionService] No default workflow found for project ${workItem.projectId}, creating default workflow...`
      );
      // Import createDefaultWorkflow function
      const { createDefaultWorkflow } = await import('../routes/workflows.js');
      const expectedDefaultWorkflow = createDefaultWorkflow(workItem.projectId);
      const expectedWorkflowId = expectedDefaultWorkflow.workflow.id;

      try {
        defaultWorkflow = await this.workflowsRepo.create({
          id: expectedWorkflowId,
          projectId: workItem.projectId,
          name: expectedDefaultWorkflow.workflow.name,
          definition: expectedDefaultWorkflow,
          isDefault: true,
        });
        console.log(
          `[WorkflowExecutionService] Created default workflow: ${defaultWorkflow.id} (${defaultWorkflow.name}) for project ${workItem.projectId}`
        );
      } catch (error) {
        // If creation failed (e.g., race condition), try to find it again
        console.warn(
          `[WorkflowExecutionService] Failed to create default workflow, retrying find: ${error instanceof Error ? error.message : String(error)}`
        );
        defaultWorkflow = await this.workflowsRepo.findDefault(workItem.projectId);
        if (!defaultWorkflow) {
          console.error(
            `[WorkflowExecutionService] Failed to create or find default workflow for project ${workItem.projectId}, skipping event handling for ${eventType}`
          );
          return;
        }
      }
    } else {
      console.log(
        `[WorkflowExecutionService] Found default workflow: ${defaultWorkflow.id} (${defaultWorkflow.name}) for project ${workItem.projectId}`
      );
    }
    let workflow: Workflow = JSON.parse(defaultWorkflow.definition);

    // Ensure existing default workflows (created before workitem.restarted existed) have the node
    if (eventType === 'workitem.restarted') {
      const { workflow: patched, patched: didPatch } = this.ensureWorkitemRestartedNode(workflow);
      workflow = patched;
      if (didPatch) {
        await this.workflowsRepo.update(defaultWorkflow.id, {
          definition: workflow,
          name: defaultWorkflow.name,
          isDefault: defaultWorkflow.isDefault,
        });
        console.log(
          `[WorkflowExecutionService] Patched default workflow ${defaultWorkflow.id} with workitem_restarted node`
        );
      }
    }

    // Find event node matching the event type
    const eventNode = this.findEventNode(workflow, eventType);
    if (!eventNode) {
      console.warn(
        `[WorkflowExecutionService] No event node found for ${eventType} in workflow ${workflow.workflow.id}`
      );
      return;
    }

    console.log(
      `[WorkflowExecutionService] Found event node: ${eventNode.id} for event ${eventType}`
    );

    // Check if a workflow run already exists for this WorkItem
    const existingRuns = await this.workflowsRepo.findAllRuns(workItemId);
    const existingRun = existingRuns.find(
      (r) =>
        r.workflowId === defaultWorkflow.id && r.status !== 'succeeded' && r.status !== 'failed'
    );

    let runId: string;
    if (existingRun) {
      // Use existing run
      runId = existingRun.id;
      console.log(`[WorkflowExecutionService] Using existing workflow run: ${runId}`);
    } else {
      // Create new workflow run
      runId = crypto.randomUUID();
      await this.workflowsRepo.createRun({
        id: runId,
        workflowId: defaultWorkflow.id,
        workItemId,
      });
      console.log(`[WorkflowExecutionService] Created new workflow run: ${runId}`);
    }

    // Execute workflow starting from the event node
    console.log(
      `[WorkflowExecutionService] Executing workflow from node ${eventNode.id} for run ${runId}`
    );
    await this.executeWorkflowFromNode(
      workflow,
      runId,
      workItemId,
      eventNode.id,
      undefined,
      eventData
    );
    console.log(
      `[WorkflowExecutionService] Completed executing workflow from node ${eventNode.id} for run ${runId}`
    );
  }

  /**
   * Find event node by event type
   */
  private findEventNode(
    workflow: Workflow,
    eventType: WorkItemEventType
  ): WorkflowNode | undefined {
    const eventString = eventType;

    const backboneNode = workflow.workflow.backbone.find(
      (n) => n.type === 'event' && n.event === eventString
    );
    if (backboneNode) return backboneNode;

    const ext = workflow.workflow.extensions;
    const extensionNode = ext?.nodes?.find((n) => n.type === 'event' && n.event === eventString);
    if (extensionNode) return extensionNode;

    const controlNode = workflow.workflow.control.extraNodes?.find(
      (n) => n.type === 'event' && n.event === eventString
    );
    if (controlNode) return controlNode;

    return undefined;
  }

  /**
   * Ensure workflow has workitem_restarted extension node (for existing default workflows
   * created before restart support). Adds the node to slot between_created_and_process
   * if missing. Returns { workflow, patched }.
   */
  private ensureWorkitemRestartedNode(workflow: Workflow): {
    workflow: Workflow;
    patched: boolean;
  } {
    if (this.findEventNode(workflow, 'workitem.restarted')) {
      return { workflow, patched: false };
    }

    const w = workflow.workflow;
    if (!w.slots || !Array.isArray(w.slots)) {
      return { workflow, patched: false };
    }

    const slot = w.slots.find((s) => s.id === 'between_created_and_process');
    if (!slot) {
      return { workflow, patched: false };
    }

    if (!w.extensions) {
      w.extensions = { nodes: [] };
    }
    if (!Array.isArray(w.extensions.nodes)) {
      w.extensions.nodes = [];
    }

    if (w.extensions.nodes.some((n) => n.event === 'workitem.restarted')) {
      return { workflow, patched: false };
    }

    const allowed = slot.allowedNodeTypes ?? [];
    if (!allowed.includes('event')) {
      slot.allowedNodeTypes = ['event', ...allowed];
    }

    w.extensions.nodes.push({
      id: 'workitem_restarted',
      type: 'event',
      slot: 'between_created_and_process',
      display: { name: 'Work item restarted' },
      event: 'workitem.restarted',
    } as WorkflowNode & { slot: string });

    return { workflow, patched: true };
  }

  /**
   * Execute workflow starting from a specific node
   * @param workflow - The workflow definition
   * @param runId - The workflow run ID
   * @param workItemId - The work item ID
   * @param startNodeId - The node ID to start execution from
   * @param initialOutputs - Optional initial outputs to use (for resuming)
   * @param eventData - Optional event data to pass to execution context
   */
  private async executeWorkflowFromNode(
    workflow: Workflow,
    runId: string,
    workItemId: string,
    startNodeId: string,
    initialOutputs?: Map<string, unknown>,
    eventData?: Record<string, unknown>
  ): Promise<void> {
    await this.workflowsRepo.updateRun(runId, {
      status: 'running',
      startedAt: new Date(),
    });

    try {
      const flattenedNodes = this.flattenWorkflow(workflow);
      console.log(
        `[WorkflowExecutionService] Flattened workflow has ${flattenedNodes.length} nodes`
      );
      console.log(
        `[WorkflowExecutionService] Node IDs: ${flattenedNodes.map((n) => n?.id).join(', ')}`
      );

      const startIndex = flattenedNodes.findIndex((n) => n?.id === startNodeId);

      if (startIndex === -1) {
        throw new Error(`Node ${startNodeId} not found in workflow`);
      }

      console.log(
        `[WorkflowExecutionService] Starting execution from node index ${startIndex} (${startNodeId})`
      );
      console.log(
        `[WorkflowExecutionService] Flattened nodes count: ${flattenedNodes.length}, startIndex: ${startIndex}`
      );

      let currentIndex = startIndex;
      let continueExecution = true;

      console.log(
        `[WorkflowExecutionService] Entering while loop: currentIndex=${currentIndex}, continueExecution=${continueExecution}, nodes.length=${flattenedNodes.length}, condition=${continueExecution && currentIndex < flattenedNodes.length}`
      );

      while (continueExecution && currentIndex < flattenedNodes.length) {
        console.log(
          `[WorkflowExecutionService] Loop iteration: currentIndex=${currentIndex}, continueExecution=${continueExecution}, nodes.length=${flattenedNodes.length}`
        );
        const node = flattenedNodes[currentIndex];

        if (!node) {
          continueExecution = false;
          break;
        }

        await this.workflowsRepo.updateRun(runId, {
          currentStepId: node.id,
        });

        // Check gate condition (when clause)
        if (
          node.when?.expr &&
          !(await this.evaluateGateCondition(node.when.expr, workflow, runId))
        ) {
          const stepId = crypto.randomUUID();
          await this.workflowsRepo.createStepExecution({
            id: stepId,
            runId,
            nodeId: node.id,
            outputs: {},
            artifacts: [],
          });

          await this.workflowsRepo.updateStepExecution(stepId, {
            status: 'skipped',
            startedAt: new Date(),
            finishedAt: new Date(),
            outputs: {},
            artifacts: [],
          });

          currentIndex++;
          continue;
        }

        const stepId = crypto.randomUUID();

        await this.workflowsRepo.createStepExecution({
          id: stepId,
          runId,
          nodeId: node.id,
          outputs: {},
          artifacts: [],
        });

        await this.workflowsRepo.updateStepExecution(stepId, {
          status: 'running',
          startedAt: new Date(),
        });

        // Build execution context with accumulated outputs
        // Start with initialOutputs if provided (for resuming), otherwise start fresh
        const contextOutputs = initialOutputs
          ? new Map(initialOutputs)
          : new Map<string, unknown>();

        // Accumulate outputs from previous steps in this execution
        const previousSteps = await this.workflowsRepo.findStepExecutionsByRunId(runId);
        for (const prevStep of previousSteps) {
          if (prevStep.status === 'succeeded' && prevStep.outputs) {
            const prevOutputs =
              typeof prevStep.outputs === 'string'
                ? JSON.parse(prevStep.outputs)
                : prevStep.outputs;
            for (const [key, value] of Object.entries(prevOutputs)) {
              contextOutputs.set(key, value);
            }
          }
        }

        // Execute with retry logic
        const result = await this.executeNodeWithRetry(node, {
          workItemId,
          workflow,
          runId,
          nodeId: node.id,
          stepId,
          outputs: contextOutputs,
          artifacts: [],
          eventData: eventData,
        });

        const stepResult = await this.recordStepResult(stepId, node.id, runId, result);

        console.log(
          `[WorkflowExecutionService] Step ${node.id} completed with status: ${result.status}`
        );

        if (result.status !== 'succeeded') {
          console.log(
            `[WorkflowExecutionService] Step ${node.id} failed, stopping workflow execution`
          );
          continueExecution = false;
          break;
        }

        // Check if we should transition based on outputs
        const transitionTrigger = this.mapStatusToTrigger(result.status, result.outputs);
        console.log(
          `[WorkflowExecutionService] Looking for next step after ${node.id}, trigger: ${transitionTrigger}`
        );

        const nextIndex = await this.findNextStep(
          node,
          workflow,
          stepResult,
          runId,
          transitionTrigger
        );

        if (nextIndex !== null) {
          console.log(`[WorkflowExecutionService] Found transition to index ${nextIndex}`);
          currentIndex = nextIndex;
        } else {
          console.log(
            `[WorkflowExecutionService] No transition found, moving to next sequential node (${currentIndex + 1})`
          );
          currentIndex = currentIndex + 1;
        }

        console.log(
          `[WorkflowExecutionService] Next node index: ${currentIndex}, total nodes: ${flattenedNodes.length}`
        );
      }

      const finalStatus = continueExecution ? 'succeeded' : 'failed';
      await this.workflowsRepo.updateRun(runId, {
        status: finalStatus,
        finishedAt: new Date(),
      });
    } catch (error) {
      await this.workflowsRepo.updateRun(runId, {
        status: 'failed',
        finishedAt: new Date(),
      });
      throw error;
    }
  }

  async execute(workflowId: string, workItemId: string): Promise<WorkflowRun> {
    const workflowRecord = await this.workflowsRepo.findById(workflowId);
    if (!workflowRecord) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const workflow: Workflow = JSON.parse(workflowRecord.definition);
    const runId = crypto.randomUUID();

    const runRecord = await this.workflowsRepo.createRun({
      id: runId,
      workflowId,
      workItemId,
    });

    const run: WorkflowRun = {
      id: runId,
      workflowId,
      workItemId,
      status: 'pending',
      currentStepId: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      createdAt: runRecord.createdAt.toISOString(),
    };

    await this.executeWorkflow(workflow, runId, workItemId);

    return run;
  }

  private async executeWorkflow(
    workflow: Workflow,
    runId: string,
    workItemId: string
  ): Promise<void> {
    await this.workflowsRepo.updateRun(runId, {
      status: 'running',
      startedAt: new Date(),
    });

    try {
      const flattenedNodes = this.flattenWorkflow(workflow);
      let currentIndex = 0;
      let continueExecution = true;

      while (continueExecution && currentIndex < flattenedNodes.length) {
        const node = flattenedNodes[currentIndex];

        if (!node) {
          continueExecution = false;
          break;
        }

        await this.workflowsRepo.updateRun(runId, {
          currentStepId: node.id,
        });

        // Check gate condition (when clause)
        if (
          node.when?.expr &&
          !(await this.evaluateGateCondition(node.when.expr, workflow, runId))
        ) {
          await this.workflowsRepo.updateRun(runId, {
            currentStepId: node.id,
          });

          const stepId = crypto.randomUUID();
          await this.workflowsRepo.createStepExecution({
            id: stepId,
            runId,
            nodeId: node.id,
            outputs: {},
            artifacts: [],
          });

          await this.workflowsRepo.updateStepExecution(stepId, {
            status: 'skipped',
            startedAt: new Date(),
            finishedAt: new Date(),
            outputs: {},
            artifacts: [],
          });

          currentIndex++;
          continue;
        }

        const stepId = crypto.randomUUID();

        await this.workflowsRepo.createStepExecution({
          id: stepId,
          runId,
          nodeId: node.id,
          outputs: {},
          artifacts: [],
        });

        await this.workflowsRepo.updateStepExecution(stepId, {
          status: 'running',
          startedAt: new Date(),
        });

        // Execute with retry logic
        const result = await this.executeNodeWithRetry(node, {
          workItemId,
          workflow,
          runId,
          nodeId: node.id,
          stepId,
          outputs: new Map<string, unknown>(),
          artifacts: [],
        });

        const stepResult = await this.recordStepResult(stepId, node.id, runId, result);

        if (result.status !== 'succeeded') {
          continueExecution = false;
          break;
        }

        // Check if we should transition based on outputs (e.g., conflict)
        const transitionTrigger = this.mapStatusToTrigger(result.status, result.outputs);

        const nextIndex = await this.findNextStep(
          node,
          workflow,
          stepResult,
          runId,
          transitionTrigger
        );
        currentIndex = nextIndex !== null ? nextIndex : currentIndex + 1;
      }

      const finalStatus = continueExecution ? 'succeeded' : 'failed';
      await this.workflowsRepo.updateRun(runId, {
        status: finalStatus,
        finishedAt: new Date(),
      });
    } catch (error) {
      await this.workflowsRepo.updateRun(runId, {
        status: 'failed',
        finishedAt: new Date(),
      });
      throw error;
    }
  }

  private flattenWorkflow(workflow: Workflow): (WorkflowNode | null)[] {
    const flattened: (WorkflowNode | null)[] = [];

    // First, add all backbone nodes with extension nodes inserted at their slots
    for (let i = 0; i < workflow.workflow.backbone.length; i++) {
      const backboneNode = workflow.workflow.backbone[i];
      flattened.push(backboneNode);

      // Find slot that comes after this backbone node
      const nextBackboneNode = workflow.workflow.backbone[i + 1];
      const slot = workflow.workflow.slots.find(
        (s) => s.after === backboneNode.id && s.before === nextBackboneNode?.id
      );

      if (slot) {
        // Insert extension nodes for this slot
        const extensionsInSlot = workflow.workflow.extensions.nodes.filter(
          (n) => n.slot === slot.id
        );
        flattened.push(...extensionsInSlot);
      }
    }

    // Control extraNodes are typically referenced by transitions, not inserted into slots
    // They are handled via the transition logic, so we don't insert them here

    return flattened;
  }

  private async findNextStep(
    currentNode: WorkflowNode,
    workflow: Workflow,
    stepResult: any,
    _runId: string,
    trigger?: 'success' | 'failure' | 'conflict' | 'blocked'
  ): Promise<number | null> {
    const control = workflow.workflow.control;

    if (stepResult.outputs && control.transitions) {
      const effectiveTrigger = trigger || this.mapStatusToTrigger(stepResult.status);

      for (const transition of control.transitions) {
        if (transition.from === currentNode.id && transition.on === effectiveTrigger) {
          const targetNode = this.findNodeById(transition.to, workflow);
          if (targetNode) {
            const index = this.findIndexInFlattened(targetNode.id, workflow);
            return index;
          }
        }
      }
    }

    return null;
  }

  private mapStatusToTrigger(
    status: StepStatus,
    outputs?: Map<string, unknown>
  ): 'success' | 'failure' | 'conflict' | 'blocked' {
    // Check for conflict indicator in outputs
    if (outputs?.get('merge.conflict') === true) {
      return 'conflict';
    }

    switch (status) {
      case 'succeeded':
      case 'skipped':
        return 'success';
      case 'failed':
      case 'blocked':
        return 'failure';
      case 'running':
      case 'pending':
        return 'blocked';
    }
  }

  private findNodeById(nodeId: string, workflow: Workflow): WorkflowNode | undefined {
    const backboneNode = workflow.workflow.backbone.find((n) => n.id === nodeId);
    if (backboneNode) return backboneNode;

    const controlNode = workflow.workflow.control.extraNodes?.find((n) => n.id === nodeId);
    if (controlNode) return controlNode;

    return workflow.workflow.extensions.nodes.find((n: any) => n.id === nodeId);
  }

  private findIndexInFlattened(nodeId: string, workflow: Workflow): number {
    const flattened = this.flattenWorkflow(workflow);
    for (let i = 0; i < flattened.length; i++) {
      if (flattened[i]?.id === nodeId) {
        return i;
      }
    }
    return -1;
  }

  private async executeNodeWithRetry(
    node: WorkflowNode,
    ctx: ExecutionContext
  ): Promise<{ status: StepStatus; outputs: Map<string, unknown>; artifacts: unknown[] }> {
    const retryConfig = node.retry || { maxAttempts: 1, backoffSeconds: 0 };
    let lastResult: {
      status: StepStatus;
      outputs: Map<string, unknown>;
      artifacts: unknown[];
    } | null = null;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        // Reset outputs for each attempt (except preserve accumulated context)
        const attemptCtx: ExecutionContext = {
          ...ctx,
          outputs: attempt === 1 ? ctx.outputs : new Map(ctx.outputs),
          artifacts: attempt === 1 ? ctx.artifacts : [...ctx.artifacts],
        };

        const result = await this.executeNode(node, attemptCtx);
        lastResult = result;

        // Update context with result outputs
        for (const [key, value] of result.outputs.entries()) {
          ctx.outputs.set(key, value);
        }
        ctx.artifacts.push(...result.artifacts);

        if (result.status === 'succeeded') {
          return result;
        }

        // If failed and we have more attempts, wait and retry
        if (attempt < retryConfig.maxAttempts && retryConfig.backoffSeconds > 0) {
          const stepId = ctx.stepId || '';
          await this.workflowsRepo.updateStepExecution(stepId, {
            status: 'pending', // Reset to pending for retry
            errorMessage: `Retrying (attempt ${attempt + 1}/${retryConfig.maxAttempts})`,
          });

          await new Promise((resolve) => setTimeout(resolve, retryConfig.backoffSeconds * 1000));

          await this.workflowsRepo.updateStepExecution(stepId, {
            status: 'running',
            startedAt: new Date(),
          });
        }
      } catch (error) {
        const stepId = ctx.stepId || '';
        await this.workflowsRepo.updateStepExecution(stepId, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });

        // If this isn't the last attempt, wait and retry
        if (attempt < retryConfig.maxAttempts && retryConfig.backoffSeconds > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryConfig.backoffSeconds * 1000));
        } else {
          // Last attempt failed, rethrow
          throw error;
        }
      }
    }

    // All retries exhausted, return last result
    if (lastResult) {
      return lastResult;
    }

    return {
      status: 'failed',
      outputs: ctx.outputs,
      artifacts: ctx.artifacts,
    };
  }

  private async executeNode(
    node: WorkflowNode,
    ctx: ExecutionContext
  ): Promise<{ status: StepStatus; outputs: Map<string, unknown>; artifacts: unknown[] }> {
    const stepId = ctx.stepId || crypto.randomUUID();

    try {
      // Use node executors
      const executor = this.getNodeExecutor(node);
      if (!executor) {
        throw new Error(
          `No executor found for node type ${node.type} with action ${(node as any).action}`
        );
      }

      const result = await executor.execute(node, ctx);

      // Sync WorkItem state from outputs
      await this.syncWorkItemStateFromOutputs(ctx.workItemId, result.outputs);

      // Merge result outputs into context
      for (const [key, value] of result.outputs.entries()) {
        ctx.outputs.set(key, value);
      }
      ctx.artifacts.push(...result.artifacts);

      await this.workflowsRepo.updateStepExecution(stepId, {
        status: result.status,
        finishedAt: new Date(),
        outputs: Object.fromEntries(result.outputs.entries()),
        artifacts: result.artifacts,
      });

      return {
        status: result.status,
        outputs: result.outputs,
        artifacts: result.artifacts,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`[WorkflowExecutionService] Error executing node ${node.id}:`, errorMessage);
      if (errorStack) {
        console.error(`[WorkflowExecutionService] Error stack:`, errorStack);
      }

      await this.workflowsRepo.updateStepExecution(stepId, {
        status: 'failed',
        finishedAt: new Date(),
        errorMessage,
        outputs: Object.fromEntries(ctx.outputs.entries()),
        artifacts: ctx.artifacts,
      });

      return {
        status: 'failed',
        outputs: ctx.outputs,
        artifacts: ctx.artifacts,
      };
    }
  }

  private async evaluateGateCondition(
    expr: string,
    workflow: Workflow,
    runId: string
  ): Promise<boolean> {
    // Safe expression evaluator without eval()
    // Supports: ==, !=, &&, ||, boolean literals, and variable references

    // Get all step outputs for context
    const context = await this.buildEvaluationContext(workflow, runId);

    // Parse and evaluate expression safely
    return this.safeEvaluateExpression(expr, context);
  }

  private safeEvaluateExpression(expr: string, context: Record<string, unknown>): boolean {
    // Normalize whitespace
    expr = expr.trim();

    // Handle boolean literals
    if (expr === 'true') return true;
    if (expr === 'false') return false;

    // Handle parentheses (simple recursive evaluation)
    if (expr.startsWith('(') && expr.endsWith(')')) {
      return this.safeEvaluateExpression(expr.slice(1, -1), context);
    }

    // Handle logical AND (&&) - evaluate left to right
    if (expr.includes('&&')) {
      const parts = this.splitByOperator(expr, '&&');
      return parts.every((part) => this.safeEvaluateExpression(part.trim(), context));
    }

    // Handle logical OR (||) - evaluate left to right
    if (expr.includes('||')) {
      const parts = this.splitByOperator(expr, '||');
      return parts.some((part) => this.safeEvaluateExpression(part.trim(), context));
    }

    // Handle comparison operators
    if (expr.includes('==')) {
      const [left, right] = expr.split('==').map((s) => s.trim());
      return this.compareValues(
        this.resolveValue(left, context),
        this.resolveValue(right, context),
        '=='
      );
    }

    if (expr.includes('!=')) {
      const [left, right] = expr.split('!=').map((s) => s.trim());
      return this.compareValues(
        this.resolveValue(left, context),
        this.resolveValue(right, context),
        '!='
      );
    }

    // Handle single variable reference
    const resolved = this.resolveValue(expr, context);
    if (resolved !== null) {
      return Boolean(resolved);
    }

    // If we can't evaluate, default to false (block)
    return false;
  }

  private splitByOperator(expr: string, operator: string): string[] {
    // Split by operator while respecting parentheses
    const parts: string[] = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < expr.length; i++) {
      const char = expr[i];
      if (char === '(') depth++;
      if (char === ')') depth--;

      if (depth === 0 && expr.substring(i).startsWith(operator)) {
        if (current.trim()) {
          parts.push(current.trim());
          current = '';
        }
        i += operator.length - 1;
        continue;
      }

      current += char;
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }

  private resolveValue(value: string, context: Record<string, unknown>): unknown {
    // Remove quotes if present
    value = value.trim().replace(/^["']|["']$/g, '');

    // Check if it's a boolean literal
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Check if it's a number
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^-?\d*\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // Check context variables
    if (context.hasOwnProperty(value)) {
      return context[value];
    }

    // Try nested property access (e.g., "github.pr.exists")
    const parts = value.split('.');
    let result: unknown = context;
    for (const part of parts) {
      if (result && typeof result === 'object' && part in result) {
        result = (result as Record<string, unknown>)[part];
      } else {
        return null;
      }
    }

    return result;
  }

  private compareValues(left: unknown, right: unknown, operator: string): boolean {
    if (operator === '==') {
      return left === right;
    }
    if (operator === '!=') {
      return left !== right;
    }
    return false;
  }

  private async buildEvaluationContext(
    workflow: Workflow,
    runId: string
  ): Promise<Record<string, unknown>> {
    // Build a context map from workflow outputs by aggregating step execution outputs
    const context: Record<string, unknown> = {};

    // Fetch all step executions for this run
    const stepExecutions = await this.workflowsRepo.findStepExecutionsByRunId(runId);

    // Aggregate outputs from all completed steps
    for (const step of stepExecutions) {
      if (step.status === 'succeeded' && step.outputs) {
        try {
          const outputs =
            typeof step.outputs === 'string' ? JSON.parse(step.outputs) : step.outputs;

          // Merge outputs into context (later steps override earlier ones)
          Object.assign(context, outputs);
        } catch {
          // Skip invalid JSON
        }
      }
    }

    // Add computed context variables based on workflow state
    const workItemId = stepExecutions[0]
      ? (await this.workflowsRepo.findRunById(runId))?.workItemId
      : null;

    if (workItemId) {
      const pr = await this.prsRepo.findByWorkItemId(workItemId);
      context['github.pr.exists'] = !!pr;
      context['github.pr.merged'] = pr?.status === 'merged';
      context['github.pr.number'] = pr ? parseInt(pr.id) : null;

      // Check CI status from outputs or external sources
      context['ci.requiredChecksGreen'] = context['ci.requiredChecksGreen'] ?? false;
    }

    // Apply sync/reconciliation rules to detect external state changes
    await this.applySyncRules(workflow, runId, context);

    return context;
  }

  /**
   * Apply sync/reconciliation rules to detect external state changes
   * and satisfy workflow steps based on external events
   */
  private async applySyncRules(
    workflow: Workflow,
    runId: string,
    context: Record<string, unknown>
  ): Promise<void> {
    const syncConfig = workflow.workflow.control.sync;
    if (!syncConfig || syncConfig.mode !== 'reconcile') {
      return;
    }

    // Evaluate each sync rule
    for (const rule of syncConfig.rules) {
      // Evaluate the rule condition
      const conditionMet = rule.when?.expr
        ? await this.safeEvaluateExpression(rule.when.expr, context)
        : true;

      if (conditionMet) {
        // Rule condition is met - satisfy the step
        const stepNodeId = rule.satisfyStep;
        await this.satisfyStepFromSyncRule(runId, stepNodeId, rule.setOutputs || {});

        // Update context with outputs from sync rule
        if (rule.setOutputs) {
          Object.assign(context, rule.setOutputs);
        }
      }
    }
  }

  /**
   * Mark a workflow step as satisfied based on sync rule
   */
  private async satisfyStepFromSyncRule(
    runId: string,
    nodeId: string,
    outputs: Record<string, unknown>
  ): Promise<void> {
    // Find the step execution for this node
    const stepExecutions = await this.workflowsRepo.findStepExecutionsByRunId(runId);
    const step = stepExecutions.find((s) => s.nodeId === nodeId);

    if (step && step.status === 'pending') {
      // Mark step as succeeded with sync outputs
      await this.workflowsRepo.updateStepExecution(step.id, {
        status: 'succeeded',
        startedAt: new Date(),
        finishedAt: new Date(),
        outputs: outputs,
      });
    }
  }
  private async recordStepResult(
    stepId: string,
    nodeId: string,
    runId: string,
    result: { status: StepStatus; outputs: Map<string, unknown>; artifacts: unknown[] }
  ): Promise<any> {
    const updated = await this.workflowsRepo.updateStepExecution(stepId, {
      status: result.status,
      outputs: Object.fromEntries(result.outputs.entries()),
      artifacts: result.artifacts,
    });

    if (!updated) {
      throw new Error(`Failed to update step execution ${stepId}`);
    }

    return {
      id: stepId,
      runId,
      nodeId,
      status: result.status,
      startedAt: updated.startedAt,
      finishedAt: updated.finishedAt,
      errorMessage: updated.errorMessage,
      outputs: typeof updated.outputs === 'string' ? JSON.parse(updated.outputs) : updated.outputs,
      artifacts:
        typeof updated.artifacts === 'string' ? JSON.parse(updated.artifacts) : updated.artifacts,
    };
  }
}

export const workflowExecutionService = new WorkflowExecutionService();
