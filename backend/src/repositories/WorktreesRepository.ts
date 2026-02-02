import { eq } from 'drizzle-orm';
import { worktrees } from '../models/schema.js';
import type { Worktree } from '../types/models.js';
import { getDb } from '../db/client.js';

export class WorktreesRepository {
  private db: Awaited<ReturnType<typeof getDb>> | null = null;

  private async getDbInstance() {
    if (!this.db) {
      this.db = await getDb();
    }
    return this.db;
  }

  async create(data: {
    id: string;
    workItemId: string;
    path: string;
    branch: string;
    repoSha?: string | null;
    status?: Worktree['status'];
    idempotencyKey?: string | null;
    nodeRunId?: string | null;
  }): Promise<Worktree> {
    const db = await this.getDbInstance();
    const [worktree] = await db
      .insert(worktrees)
      .values({
        id: data.id,
        workItemId: data.workItemId,
        path: data.path,
        branch: data.branch,
        repoSha: data.repoSha || null,
        status: data.status || 'pending',
        idempotencyKey: data.idempotencyKey || null,
        nodeRunId: data.nodeRunId || null,
      })
      .returning()
      .execute();

    return this.mapToWorktree(worktree);
  }

  async findById(id: string): Promise<Worktree | undefined> {
    const db = await this.getDbInstance();
    const [worktree] = await db.select().from(worktrees).where(eq(worktrees.id, id)).execute();

    return worktree ? this.mapToWorktree(worktree) : undefined;
  }

  async findByWorkItemId(workItemId: string): Promise<Worktree | undefined> {
    const db = await this.getDbInstance();
    const [worktree] = await db
      .select()
      .from(worktrees)
      .where(eq(worktrees.workItemId, workItemId))
      .execute();

    return worktree ? this.mapToWorktree(worktree) : undefined;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Worktree | undefined> {
    const db = await this.getDbInstance();
    const [worktree] = await db
      .select()
      .from(worktrees)
      .where(eq(worktrees.idempotencyKey, idempotencyKey))
      .execute();

    return worktree ? this.mapToWorktree(worktree) : undefined;
  }

  async update(
    id: string,
    data: Partial<{
      path: string;
      branch: string;
      repoSha: string | null;
      status: Worktree['status'];
    }>
  ): Promise<Worktree | undefined> {
    const db = await this.getDbInstance();
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.path !== undefined) {
      updateData.path = data.path;
    }
    if (data.branch !== undefined) {
      updateData.branch = data.branch;
    }
    if (data.repoSha !== undefined) {
      updateData.repoSha = data.repoSha;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    const [worktree] = await db
      .update(worktrees)
      .set(updateData)
      .where(eq(worktrees.id, id))
      .returning()
      .execute();

    return worktree ? this.mapToWorktree(worktree) : undefined;
  }

  async updateStatus(id: string, status: Worktree['status']): Promise<Worktree | undefined> {
    return this.update(id, { status });
  }

  private mapToWorktree(row: any): Worktree {
    return {
      id: row.id,
      workItemId: row.workItemId,
      path: row.path,
      branch: row.branch,
      repoSha: row.repoSha,
      status: row.status,
      idempotencyKey: row.idempotencyKey,
      nodeRunId: row.nodeRunId,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt * 1000),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt * 1000),
    };
  }
}

export const worktreesRepository = new WorktreesRepository();
