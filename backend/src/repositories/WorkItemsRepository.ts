import { eq } from 'drizzle-orm';
import { workItems } from '../models/schema.js';
import type { WorkItem } from '../types/models.js';
import { getDb } from '../db/client.js';

export class WorkItemsRepository {
  private db: Awaited<ReturnType<typeof getDb>> | null = null;

  private async getDbInstance() {
    if (!this.db) {
      this.db = await getDb();
    }
    return this.db;
  }

  async create(data: {
    id: string;
    projectId: string;
    type: 'issue' | 'feature-request';
    title: string;
    body?: string;
    // Workspace fields
    workspaceStatus?: WorkItem['workspaceStatus'];
    worktreePath?: string;
    headBranch?: string;
    baseBranch?: string;
    baseSha?: string;
    headSha?: string;
  }): Promise<WorkItem> {
    const db = await this.getDbInstance();
    const [workItem] = await db
      .insert(workItems)
      .values({
        id: data.id,
        projectId: data.projectId,
        type: data.type,
        title: data.title,
        body: data.body || null,
        workspaceStatus: data.workspaceStatus || 'not_initialized',
        worktreePath: data.worktreePath || null,
        headBranch: data.headBranch || null,
        baseBranch: data.baseBranch || null,
        baseSha: data.baseSha || null,
        headSha: data.headSha || null,
      })
      .returning()
      .execute();

    return workItem as WorkItem;
  }

  async findAll(): Promise<WorkItem[]> {
    const db = await this.getDbInstance();
    const result = await db.select().from(workItems).execute();
    return result as WorkItem[];
  }

  async findByProjectId(projectId: string): Promise<WorkItem[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(workItems)
      .where(eq(workItems.projectId, projectId))
      .execute();
    return result as WorkItem[];
  }

  async findById(id: string): Promise<WorkItem | undefined> {
    const db = await this.getDbInstance();
    const [workItem] = await db.select().from(workItems).where(eq(workItems.id, id)).execute();

    return workItem as WorkItem | undefined;
  }

  async update(
    id: string,
    data: {
      title?: string;
      body?: string;
      status?: 'open' | 'closed';
      // Workspace fields
      workspaceStatus?: WorkItem['workspaceStatus'];
      worktreePath?: string;
      headBranch?: string;
      baseBranch?: string;
      baseSha?: string;
      headSha?: string;
    }
  ): Promise<WorkItem | undefined> {
    const db = await this.getDbInstance();
    const [workItem] = await db
      .update(workItems)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(workItems.id, id))
      .returning()
      .execute();

    return workItem as WorkItem | undefined;
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDbInstance();
    await db.delete(workItems).where(eq(workItems.id, id)).execute();
  }

  async acquireLock(
    workItemId: string,
    runId: string,
    ttl: number = 3600000 // Default TTL: 1 hour in milliseconds
  ): Promise<boolean> {
    const db = await this.getDbInstance();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl);

    // Check if already locked
    const [existing] = await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, workItemId))
      .execute();

    if (!existing) {
      return false;
    }

    // Check if lock is expired or not owned by another run
    const isExpired = existing.lockExpiresAt ? new Date(existing.lockExpiresAt) < now : true;
    const isOwned = existing.lockOwnerRunId === runId;

    if (existing.lockOwnerRunId && !isExpired && !isOwned) {
      // Locked by another run and not expired
      return false;
    }

    // Acquire lock
    await db
      .update(workItems)
      .set({
        lockOwnerRunId: runId,
        lockExpiresAt: expiresAt,
        updatedAt: now,
      })
      .where(eq(workItems.id, workItemId))
      .execute();

    return true;
  }

  async releaseLock(workItemId: string, runId: string): Promise<boolean> {
    const db = await this.getDbInstance();
    const now = new Date();

    // Check if owned by this run
    const [existing] = await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, workItemId))
      .execute();

    if (!existing || existing.lockOwnerRunId !== runId) {
      return false;
    }

    // Release lock
    await db
      .update(workItems)
      .set({
        lockOwnerRunId: null,
        lockExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(workItems.id, workItemId))
      .execute();

    return true;
  }

  async isLocked(workItemId: string): Promise<{
    locked: boolean;
    ownerRunId?: string;
    expiresAt?: Date;
  }> {
    const db = await this.getDbInstance();
    const [workItem] = await db
      .select()
      .from(workItems)
      .where(eq(workItems.id, workItemId))
      .execute();

    if (!workItem || !workItem.lockOwnerRunId) {
      return { locked: false };
    }

    // Check if lock is expired
    const now = new Date();
    const isExpired = workItem.lockExpiresAt ? new Date(workItem.lockExpiresAt) < now : false;

    if (isExpired) {
      // Lock is expired, clear it
      await db
        .update(workItems)
        .set({
          lockOwnerRunId: null,
          lockExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(workItems.id, workItemId))
        .execute();

      return { locked: false };
    }

    return {
      locked: true,
      ownerRunId: workItem.lockOwnerRunId,
      expiresAt: workItem.lockExpiresAt ? new Date(workItem.lockExpiresAt) : undefined,
    };
  }

  async getPullRequestByWorkItemId(workItemId: string): Promise<WorkItem | undefined> {
    // This method now just returns the WorkItem itself
    // The PR is accessed via pullRequestsRepository.findByWorkItemId()
    return this.findById(workItemId);
  }
}

export const workItemsRepository = new WorkItemsRepository();
