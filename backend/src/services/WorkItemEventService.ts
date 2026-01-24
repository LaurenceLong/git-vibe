/**
 * WorkItemEventService - Wraps WorkItem operations with event emission
 * Ensures all WorkItem state changes emit events for workflow orchestration.
 * Canonical actions: createWorkItem, updateWorkItem, updateWorkItemState.
 */

import { workflowEventBus } from './WorkflowEventBus.js';
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
    const workItem = await workItemsRepository.create(data);

    console.log(`[WorkItemEventService] Emitting workitem.created event for ${workItem.id}`);
    const listenerCount = workflowEventBus.listenerCount('workitem.created');
    console.log(
      `[WorkItemEventService] Found ${listenerCount} listener(s) for workitem.created event`
    );

    void workflowEventBus
      .emit({
        type: 'workitem.created',
        workItemId: workItem.id,
        data: {
          projectId: workItem.projectId,
          type: workItem.type,
          title: workItem.title,
          body: workItem.body,
        },
      })
      .catch((error) => {
        console.error(
          `[WorkItemEventService] Error handling workitem.created event for ${workItem.id}:`,
          error
        );
      });

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

    if (data.title !== undefined || data.body !== undefined) {
      await workflowEventBus.emit({
        type: 'workitem.updated',
        workItemId: id,
        data: {
          title: updated.title,
          body: updated.body ?? '',
        },
      });
    }

    if (data.status !== undefined && data.status !== existing.status) {
      await workflowEventBus.emit({
        type: 'workitem.status.changed',
        workItemId: id,
        data: {
          oldStatus: existing.status,
          newStatus: data.status,
        },
      });
    }

    if (data.status === 'closed' && existing.status !== 'closed') {
      await workflowEventBus.emit({
        type: 'workitem.closed',
        workItemId: id,
        data: {},
      });
    }

    return updated;
  }

  /**
   * Update WorkItem state managed by workflow (workspace fields).
   * Emits workitem.workspace.ready when status becomes ready (consolidated; no workspace.initialized).
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

    if (
      data.workspaceStatus !== undefined &&
      data.workspaceStatus !== existing.workspaceStatus &&
      data.workspaceStatus === 'ready'
    ) {
      const worktreePath = updated.worktreePath ?? '';
      const headBranch = updated.headBranch ?? '';
      await workflowEventBus.emit({
        type: 'workitem.workspace.ready',
        workItemId: id,
        data: { worktreePath, headBranch },
      });
    }

    return updated;
  }
}

export const workItemEventService = new WorkItemEventService();
