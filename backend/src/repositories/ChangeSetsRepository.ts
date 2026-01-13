import { eq } from 'drizzle-orm';
import { changesets } from '../models/schema.js';
import type { ChangeSet } from '../types/models.js';
import { getDb } from '../db/client.js';

export class ChangeSetsRepository {
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
    title: string;
    body?: string;
    baseBranch: string;
    baseSha: string;
    branchName: string;
    worktreePath: string;
  }): Promise<ChangeSet> {
    const db = await this.getDbInstance();
    const [changeset] = await db
      .insert(changesets)
      .values({
        id: data.id,
        projectId: data.projectId,
        title: data.title,
        body: data.body || null,
        baseBranch: data.baseBranch,
        baseSha: data.baseSha,
        branchName: data.branchName,
        worktreePath: data.worktreePath,
      })
      .returning()
      .execute();

    return changeset as ChangeSet;
  }

  async findAll(projectId?: string): Promise<ChangeSet[]> {
    const db = await this.getDbInstance();
    let query = db.select().from(changesets);

    if (projectId) {
      query = query.where(eq(changesets.projectId, projectId)) as typeof query;
    }

    const result = await query.execute();
    return result as ChangeSet[];
  }

  async findById(id: string): Promise<ChangeSet | undefined> {
    const db = await this.getDbInstance();
    const [changeset] = await db
      .select()
      .from(changesets)
      .where(eq(changesets.id, id))
      .execute();

    return changeset as ChangeSet | undefined;
  }

  async update(
    id: string,
    data: {
      headSha?: string;
      status?: ChangeSet['status'];
    },
  ): Promise<ChangeSet | undefined> {
    const db = await this.getDbInstance();
    const [changeset] = await db
      .update(changesets)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(changesets.id, id))
      .returning()
      .execute();

    return changeset as ChangeSet | undefined;
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDbInstance();
    await db.delete(changesets).where(eq(changesets.id, id)).execute();
  }
}

export const changesetsRepository = new ChangeSetsRepository();
