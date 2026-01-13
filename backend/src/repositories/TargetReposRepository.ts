import { eq } from 'drizzle-orm';
import { targetRepos } from '../models/schema.js';
import type { TargetRepo } from '../types/models.js';
import { getDb } from '../db/client.js';

export class TargetReposRepository {
  private db: Awaited<ReturnType<typeof getDb>> | null = null;

  private async getDbInstance() {
    if (!this.db) {
      this.db = await getDb();
    }
    return this.db;
  }

  async create(data: {
    id: string;
    name: string;
    repoPath: string;
    defaultBranch: string;
  }): Promise<TargetRepo> {
    const db = await this.getDbInstance();
    const [targetRepo] = await db
      .insert(targetRepos)
      .values({
        id: data.id,
        name: data.name,
        repoPath: data.repoPath,
        defaultBranch: data.defaultBranch,
      })
      .returning()
      .execute();

    return targetRepo as TargetRepo;
  }

  async findAll(): Promise<TargetRepo[]> {
    const db = await this.getDbInstance();
    const result = await db.select().from(targetRepos).execute();
    return result as TargetRepo[];
  }

  async findById(id: string): Promise<TargetRepo | undefined> {
    const db = await this.getDbInstance();
    const [targetRepo] = await db
      .select()
      .from(targetRepos)
      .where(eq(targetRepos.id, id))
      .execute();

    return targetRepo as TargetRepo | undefined;
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDbInstance();
    await db.delete(targetRepos).where(eq(targetRepos.id, id)).execute();
  }
}

export const targetReposRepository = new TargetReposRepository();
