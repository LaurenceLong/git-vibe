/**
 * WorkflowEventBus - Central event bus for workflow events
 *
 * Updated to use uniform event envelope format per optimized design:
 * - eventId, type, at, subject, resourceVersion, causedBy, data
 */

import type { WorkflowEvent, EventSubject, EventCausedBy } from 'git-vibe-shared';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Event Type Definitions
// ============================================================================

export type WorkItemEventType =
  | 'workitem.created'
  | 'workitem.updated'
  | 'workitem.status.changed'
  | 'workitem.closed'
  | 'workitem.workspace.ready'
  | 'workitem.task.start'
  | 'workitem.task.resume'
  | 'workitem.restarted';

export type WorkflowNodeEventType =
  | 'node.started'
  | 'node.completed'
  | 'agent.started'
  | 'agent.completed'
  | 'pr.created'
  | 'pr.merged'
  | 'git.committed'
  | 'conflict.detected'
  | 'workspace.initialized'
  | 'workspace.ready'
  | 'ci.checks.completed'
  | 'command_run.completed'
  | 'command_run.started'
  | 'workflow.anchor.reached'
  | 'task.resumeRequested'
  | 'worktree.updated'
  | 'workitem.merged';

export type ExternalEventType =
  | 'github.pr.created'
  | 'github.pr.updated'
  | 'github.pr.merged'
  | 'ci.checks.updated'
  | 'git.state.changed';

export type DomainEventType =
  | 'task.created'
  | 'task.completed'
  | 'task.started'
  | 'task.resumeRequested'
  | 'pr_request.created'
  | 'pr_request.updated'
  | 'pr_request.started'
  | 'pr_request.mergeAttempted'
  | 'pr_request.merged';

export type WorkflowEventType =
  | WorkItemEventType
  | WorkflowNodeEventType
  | ExternalEventType
  | DomainEventType;

export type ResourceEventType = WorkflowEventType;

// ============================================================================
// Event Payload Types
// ============================================================================

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

// ============================================================================
// Event Handler Type
// ============================================================================

export type EventHandler = (event: WorkflowEvent) => Promise<void> | void;

// ============================================================================
// WorkflowEventBus
// ============================================================================

/**
 * WorkflowEventBus - Central event bus for workflow events
 * Uses uniform event envelope format per optimized design
 */
export class WorkflowEventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private anyHandlers: Set<EventHandler> = new Set();

  /**
   * Register an event handler
   */
  on(eventType: WorkflowEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Register a handler for ALL events (best practice for event-driven workflow engines).
   */
  onAny(handler: EventHandler): () => void {
    this.anyHandlers.add(handler);
    return () => {
      this.anyHandlers.delete(handler);
    };
  }

  /**
   * Emit an event using uniform event envelope format
   */
  async emit(event: WorkflowEvent): Promise<void> {
    const handlers = this.handlers.get(event.type);
    const typedCount = handlers?.size ?? 0;
    const anyCount = this.anyHandlers.size;
    const hasHandlers = typedCount + anyCount > 0;

    if (!hasHandlers) {
      console.warn(`[WorkflowEventBus] No handlers registered for event type: ${event.type}`);
      return;
    }

    console.log(
      `[WorkflowEventBus] Emitting event ${event.type} (${event.eventId}) to ${typedCount + anyCount} handler(s)`
    );

    const allHandlers = [
      ...(handlers ? Array.from(handlers) : []),
      ...Array.from(this.anyHandlers),
    ];

    const promises = allHandlers.map((handler) => {
      try {
        return Promise.resolve(handler(event));
      } catch (error) {
        console.error(`Error in event handler for ${event.type}:`, error);
        return Promise.resolve();
      }
    });

    await Promise.all(promises);
    console.log(`[WorkflowEventBus] Completed emitting event ${event.type} (${event.eventId})`);
  }

  /**
   * Create a uniform event envelope
   */
  createEvent(
    type: WorkflowEventType,
    subject: EventSubject,
    data: Record<string, unknown>,
    options?: {
      resourceVersion?: number;
      causedBy?: EventCausedBy;
    }
  ): WorkflowEvent {
    return {
      eventId: uuidv4(),
      type,
      at: new Date().toISOString(),
      subject,
      resourceVersion: options?.resourceVersion,
      causedBy: options?.causedBy,
      data,
    };
  }

  /**
   * Emit workitem events by type and workItemId
   */
  async emitWorkItemEvent(
    type: WorkItemEventType,
    workItemId: string,
    data: Record<string, unknown>,
    options?: {
      resourceVersion?: number;
      causedBy?: EventCausedBy;
    }
  ): Promise<void> {
    const event = this.createEvent(type, { kind: 'workitem', id: workItemId }, data, options);
    await this.emit(event);
  }

  /**
   * Remove all listeners for an event type (or all events)
   */
  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Get listener count for an event type
   */
  listenerCount(eventType: string): number {
    return this.handlers.get(eventType)?.size ?? 0;
  }
}

export const workflowEventBus = new WorkflowEventBus();
