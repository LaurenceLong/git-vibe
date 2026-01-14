import { eq } from 'drizzle-orm';
import { imports } from '../models/schema.js';
import type { Import } from '../types/models.js';
import { getDb } from '../db/client.js';

export class ImportsRepository {
  private db: Awaited<ReturnType<typeof getDb>> | null = null;

  private async getDbInstance() {
    if (!this.db) {
      this.db = await getDb();
    }
    return this.db;
  }

  async create(data: {
    id: string;
    changesetId: string;
    targetRepoId: string;
    sourceBaseSha: string;
    sourceHeadSha: string;
  }): Promise<Import> {
    const db = await this.getDbInstance();
    const [importRecord] = await db
      .insert(imports)
      .values({
        id: data.id,
        changesetId: data.changesetId,
        targetRepoId: data.targetRepoId,
        strategy: 'patch',
        sourceBaseSha: data.sourceBaseSha,
        sourceHeadSha: data.sourceHeadSha,
        status: 'pending',
      })
      .returning()
      .execute();

    return importRecord as Import;
  }

  async findById(id: string): Promise<Import | undefined> {
    const db = await this.getDbInstance();
    const [importRecord] = await db.select().from(imports).where(eq(imports.id, id)).execute();

    return importRecord as Import | undefined;
  }

  async findByChangesetId(changesetId: string): Promise<Import[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(imports)
      .where(eq(imports.changesetId, changesetId))
      .execute();

    return result as Import[];
  }

  async update(
    id: string,
    data: Partial<Omit<Import, 'id' | 'changesetId' | 'targetRepoId' | 'strategy' | 'createdAt'>>
  ): Promise<Import | undefined> {
    const db = await this.getDbInstance();
    const [importRecord] = await db
      .update(imports)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(imports.id, id))
      .returning()
      .execute();

    return importRecord as Import | undefined;
  }
}

export const importsRepository = new ImportsRepository();
