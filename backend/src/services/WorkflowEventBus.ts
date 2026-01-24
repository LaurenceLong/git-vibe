/**
 * WorkflowEventBus - Central event bus for workflow events
 *
 * Design principles:
 * - Every event has a strict typed payload (discriminated union).
 * - Every event is emitted only from a canonical "action" (command/use-case).
 * - WorkItem events drive workflow execution; each should have a handler and optionally a workflow node.
 * - WorkflowNode and External events are emitted by executors for observability; no handlers by design.
 */

// ---------------------------------------------------------------------------
// WorkItem events – drive workflow via handleWorkItemEvent / workflow event nodes
// ---------------------------------------------------------------------------

export type WorkItemEventType =
  | 'workitem.created'
  | 'workitem.updated'
  | 'workitem.status.changed'
  | 'workitem.closed'
  | 'workitem.workspace.ready'
  | 'workitem.task.start'
  | 'workitem.task.resume'
  | 'workitem.restarted';

/** Canonical actions: createWorkItem, updateWorkItem (metadata), updateWorkItem (status/close), updateWorkItemState (workspace), start-task API, resumeTask, restartTask */

export interface WorkItemCreatedPayload {
  projectId: string;
  type: 'issue' | 'feature-request';
  title: string;
  body?: string;
}

export interface WorkItemUpdatedPayload {
  title: string;
  body: string;
}

export interface WorkItemStatusChangedPayload {
  oldStatus: 'open' | 'closed';
  newStatus: 'open' | 'closed';
}

export interface WorkItemWorkspaceReadyPayload {
  worktreePath: string;
  headBranch: string;
}

export interface WorkItemTaskStartPayload {
  title: string;
  body: string;
  userMessage?: string;
}

export interface WorkItemTaskResumePayload {
  originalAgentRunId: string;
  sessionId: string;
  prompt: string;
  title: string;
  body: string;
}

export interface WorkItemRestartedPayload {
  originalAgentRunId: string;
  title: string;
  body: string;
}

// ---------------------------------------------------------------------------
// WorkflowNode events – emitted by node executors; no handlers by design
// (workflow execution is sequential within executeWorkflowFromNode)
// ---------------------------------------------------------------------------

export type WorkflowNodeEventType =
  | 'agent.started'
  | 'agent.completed'
  | 'pr.created'
  | 'pr.merged'
  | 'git.committed'
  | 'conflict.detected'
  | 'workspace.initialized'
  | 'workspace.ready'
  | 'ci.checks.completed';

export interface AgentStartedPayload {
  agentRunId: string;
}

export interface AgentCompletedPayload {
  agentRunId: string;
  status: string;
  commitSha?: string;
}

export interface PrCreatedPayload {
  prId: string;
  prNumber: string;
}

export interface PrMergedPayload {
  prId: string;
}

export interface GitCommittedPayload {
  commitSha: string;
  message: string;
}

export interface ConflictDetectedPayload {
  prId: string;
  reasons?: string[];
  error?: string;
}

export interface WorkspaceReadyPayload {
  worktreePath: string;
  headBranch: string;
}

export interface CiChecksCompletedPayload {
  results: unknown;
  allPassed: boolean;
}

// ---------------------------------------------------------------------------
// External events – emitted by executors (e.g. CI); no handlers by design
// (reserved for future sync/reconciliation or webhooks)
// ---------------------------------------------------------------------------

export type ExternalEventType =
  | 'github.pr.created'
  | 'github.pr.merged'
  | 'ci.checks.passed'
  | 'git.state.changed';

export interface CiChecksPassedPayload {
  results: unknown;
}

// ---------------------------------------------------------------------------
// Discriminated union: WorkItem events (each with minimal, typed payload)
// ---------------------------------------------------------------------------

export type WorkItemEvent =
  | { type: 'workitem.created'; workItemId: string; data: WorkItemCreatedPayload }
  | { type: 'workitem.updated'; workItemId: string; data: WorkItemUpdatedPayload }
  | { type: 'workitem.status.changed'; workItemId: string; data: WorkItemStatusChangedPayload }
  | { type: 'workitem.closed'; workItemId: string; data: Record<string, never> }
  | { type: 'workitem.workspace.ready'; workItemId: string; data: WorkItemWorkspaceReadyPayload }
  | { type: 'workitem.task.start'; workItemId: string; data: WorkItemTaskStartPayload }
  | { type: 'workitem.task.resume'; workItemId: string; data: WorkItemTaskResumePayload }
  | { type: 'workitem.restarted'; workItemId: string; data: WorkItemRestartedPayload };

// ---------------------------------------------------------------------------
// WorkflowNode / External events (typed payloads; structure only, not union)
// ---------------------------------------------------------------------------

export interface WorkflowNodeEvent {
  type: WorkflowNodeEventType;
  workItemId: string;
  workflowRunId: string;
  nodeId: string;
  data: Record<string, unknown>;
}

export interface ExternalEvent {
  type: ExternalEventType;
  workItemId: string;
  data: Record<string, unknown>;
}

export type WorkflowEventType = WorkItemEventType | WorkflowNodeEventType | ExternalEventType;

/** Event payload passed to handleWorkItemEvent (workitem.* only). */
export type WorkItemEventData = Record<string, unknown>;

export type WorkflowEvent = WorkItemEvent | WorkflowNodeEvent | ExternalEvent;

export type EventHandler = (event: WorkflowEvent) => Promise<void> | void;

/** Event types that are emitted but have no handlers by design (observability only). */
const NO_HANDLER_BY_DESIGN: WorkflowEventType[] = [
  ...([
    'agent.started',
    'agent.completed',
    'pr.created',
    'pr.merged',
    'git.committed',
    'conflict.detected',
    'workspace.initialized',
    'workspace.ready',
    'ci.checks.completed',
  ] as WorkflowNodeEventType[]),
  ...([
    'github.pr.created',
    'github.pr.merged',
    'ci.checks.passed',
    'git.state.changed',
  ] as ExternalEventType[]),
];

/**
 * WorkflowEventBus - Central event bus for workflow events
 */
export class WorkflowEventBus {
  private handlers: Map<WorkflowEventType, Set<EventHandler>> = new Map();

  on(eventType: WorkflowEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  async emit(event: WorkflowEvent): Promise<void> {
    const handlers = this.handlers.get(event.type);
    const hasHandlers = handlers != null && handlers.size > 0;

    if (!hasHandlers) {
      if (!NO_HANDLER_BY_DESIGN.includes(event.type)) {
        console.warn(`[WorkflowEventBus] No handlers registered for event type: ${event.type}`);
      }
      return;
    }

    console.log(`[WorkflowEventBus] Emitting event ${event.type} to ${handlers!.size} handler(s)`);

    const promises = Array.from(handlers!).map((handler) => {
      try {
        return Promise.resolve(handler(event));
      } catch (error) {
        console.error(`Error in event handler for ${event.type}:`, error);
        return Promise.resolve();
      }
    });

    await Promise.all(promises);
    console.log(`[WorkflowEventBus] Completed emitting event ${event.type}`);
  }

  removeAllListeners(eventType?: WorkflowEventType): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
    }
  }

  listenerCount(eventType: WorkflowEventType): number {
    return this.handlers.get(eventType)?.size ?? 0;
  }
}

export const workflowEventBus = new WorkflowEventBus();
