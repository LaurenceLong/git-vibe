/**
 * WorkItemEventService - Wraps WorkItem operations with event emission
 * Ensures all WorkItem state changes emit events for workflow orchestration.
 * Updated to use uniform event envelope format and outbox pattern per optimized design.
 */

import { WORKITEM_STATUS_CLOSED } from 'git-vibe-shared';
import { workflowEventBus } from './workflow/WorkflowEventBus.js';
import { eventOutboxService } from './EventOutbox.js';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import type { WorkItem } from '../types/models.js';

export class WorkItemEventService {
  /**
   * Create a WorkItem and emit workitem.created (canonical action: create work item)
   */
  async createWorkItem(data: {
    id: string;
    projectId: string;
    type: 'issue' | 'feature-request';
    title: string;
    body?: string;
  }): Promise<WorkItem> {
    // Create workitem
    const workItem = await workItemsRepository.create(data);

    // Add event to outbox (should be in same transaction in production)
    // For now, add after creation (outbox will ensure delivery)
    const event = workflowEventBus.createEvent(
      'workitem.created',
      { kind: 'workitem', id: workItem.id },
      {
        projectId: workItem.projectId,
        type: workItem.type,
        title: workItem.title,
        body: workItem.body,
      },
      {
        resourceVersion: 1,
      }
    );

    await eventOutboxService.addEvent(event);

    return workItem;
  }

  /**
   * Update WorkItem metadata/status and emit workitem.updated, workitem.status.changed, workitem.closed
   * (canonical action: update work item)
   */
  async updateWorkItem(
    id: string,
    data: {
      title?: string;
      body?: string;
      status?: 'open' | 'closed';
    }
  ): Promise<WorkItem | undefined> {
    const existing = await workItemsRepository.findById(id);
    if (!existing) {
      return undefined;
    }

    const updated = await workItemsRepository.update(id, data);
    if (!updated) {
      return undefined;
    }

    const resourceVersion = (existing as any).version || 1;

    // Add events to outbox (should be in same transaction in production)
    if (data.title !== undefined || data.body !== undefined) {
      const event = workflowEventBus.createEvent(
        'workitem.updated',
        { kind: 'workitem', id },
        {
          title: updated.title,
          body: updated.body ?? '',
        },
        {
          resourceVersion: resourceVersion + 1,
        }
      );
      await eventOutboxService.addEvent(event);
    }

    if (data.status !== undefined && data.status !== existing.status) {
      const event = workflowEventBus.createEvent(
        'workitem.status.changed',
        { kind: 'workitem', id },
        {
          oldStatus: existing.status,
          newStatus: data.status,
        },
        {
          resourceVersion: resourceVersion + 1,
        }
      );
      await eventOutboxService.addEvent(event);
    }

    if (data.status === WORKITEM_STATUS_CLOSED && existing.status !== WORKITEM_STATUS_CLOSED) {
      const event = workflowEventBus.createEvent(
        'workitem.closed',
        { kind: 'workitem', id },
        {},
        {
          resourceVersion: resourceVersion + 1,
        }
      );
      await eventOutboxService.addEvent(event);
    }

    return updated;
  }

  /**
   * Update WorkItem state managed by workflow (workspace fields).
   * Emits workitem.workspace.ready when status becomes ready.
   * Canonical action: update work item state (workspace).
   */
  async updateWorkItemState(
    id: string,
    data: {
      workspaceStatus?: WorkItem['workspaceStatus'];
      worktreePath?: string;
      headBranch?: string;
      baseBranch?: string;
      baseSha?: string;
      headSha?: string;
    }
  ): Promise<WorkItem | undefined> {
    const existing = await workItemsRepository.findById(id);
    if (!existing) {
      return undefined;
    }

    const updated = await workItemsRepository.update(id, data);
    if (!updated) {
      return undefined;
    }

    const resourceVersion = (existing as any).version || 1;

    // Add event to outbox (should be in same transaction in production)
    if (
      data.workspaceStatus !== undefined &&
      data.workspaceStatus !== existing.workspaceStatus &&
      data.workspaceStatus === 'ready'
    ) {
      const worktreePath = updated.worktreePath ?? '';
      const headBranch = updated.headBranch ?? '';
      const event = workflowEventBus.createEvent(
        'workitem.workspace.ready',
        { kind: 'workitem', id },
        { worktreePath, headBranch },
        {
          resourceVersion: resourceVersion + 1,
        }
      );
      await eventOutboxService.addEvent(event);
    }

    return updated;
  }
}

export const workItemEventService = new WorkItemEventService();
