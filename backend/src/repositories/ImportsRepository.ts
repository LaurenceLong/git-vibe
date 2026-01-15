import { eq } from 'drizzle-orm';
import { imports } from '../models/schema.js';
import type { Import } from '../types/models.js';
import { getDb } from '../db/client.js';

/**
 * Maps extended ImportStatus values to the basic values supported by the database schema.
 * The database only supports: 'pending', 'running', 'succeeded', 'failed'
 * The shared type includes additional values for more granular status tracking.
 */
function mapImportStatusForDb(
  status:
    | 'pending'
    | 'running'
    | 'succeeded'
    | 'succeeded_noop'
    | 'failed'
    | 'failed_dirty'
    | 'failed_conflict'
    | 'failed_other'
    | undefined
): 'pending' | 'running' | 'succeeded' | 'failed' | undefined {
  if (!status) return undefined;

  // Map succeeded variants to 'succeeded'
  if (status === 'succeeded' || status === 'succeeded_noop') {
    return 'succeeded';
  }

  // Map all failed variants to 'failed'
  if (
    status === 'failed' ||
    status === 'failed_dirty' ||
    status === 'failed_conflict' ||
    status === 'failed_other'
  ) {
    return 'failed';
  }

  // Return pending and running as-is
  return status;
}

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
    pullRequestId: string;
    targetRepoId: string;
    sourceBaseSha: string;
    sourceHeadSha: string;
  }): Promise<Import> {
    const db = await this.getDbInstance();
    const [importRecord] = await db
      .insert(imports)
      .values({
        id: data.id,
        pullRequestId: data.pullRequestId,
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

  async findByPullRequestId(pullRequestId: string): Promise<Import[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(imports)
      .where(eq(imports.pullRequestId, pullRequestId))
      .execute();

    return result as Import[];
  }

  async update(
    id: string,
    data: Partial<Omit<Import, 'id' | 'pullRequestId' | 'targetRepoId' | 'strategy' | 'createdAt'>>
  ): Promise<Import | undefined> {
    const db = await this.getDbInstance();
    const [importRecord] = await db
      .update(imports)
      .set({
        ...data,
        status: mapImportStatusForDb(data.status),
        updatedAt: new Date(),
      })
      .where(eq(imports.id, id))
      .returning()
      .execute();

    return importRecord as Import | undefined;
  }
}

export const importsRepository = new ImportsRepository();
