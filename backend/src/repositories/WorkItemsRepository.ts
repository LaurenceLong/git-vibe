import { eq } from 'drizzle-orm';
import { workItems, changesets } from '../models/schema.js';
import type { WorkItem, ChangeSet } from '../types/models.js';
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
    branchName: string;
    baseSha: string;
    worktreePath?: string;
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
        branchName: data.branchName,
        baseSha: data.baseSha,
        worktreePath: data.worktreePath || null,
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
      headSha?: string;
      worktreePath?: string;
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

  async getChangeSetsByWorkItemId(workItemId: string): Promise<ChangeSet[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(changesets)
      .where(eq(changesets.workItemId, workItemId))
      .execute();
    return result as ChangeSet[];
  }
}

export const workItemsRepository = new WorkItemsRepository();
