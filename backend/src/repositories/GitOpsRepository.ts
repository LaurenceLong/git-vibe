import { eq } from 'drizzle-orm';
import { gitOps } from '../models/schema.js';
import type { GitOp } from '../types/models.js';
import { getDb } from '../db/client.js';

export class GitOpsRepository {
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
    operation: string;
    status?: GitOp['status'];
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    idempotencyKey?: string | null;
    nodeRunId?: string | null;
  }): Promise<GitOp> {
    const db = await this.getDbInstance();
    const [gitOp] = await db
      .insert(gitOps)
      .values({
        id: data.id,
        workItemId: data.workItemId,
        operation: data.operation,
        status: data.status || 'pending',
        input: JSON.stringify(data.input || {}),
        output: JSON.stringify(data.output || {}),
        idempotencyKey: data.idempotencyKey || null,
        nodeRunId: data.nodeRunId || null,
      })
      .returning()
      .execute();

    return this.mapToGitOp(gitOp);
  }

  async findById(id: string): Promise<GitOp | undefined> {
    const db = await this.getDbInstance();
    const [gitOp] = await db.select().from(gitOps).where(eq(gitOps.id, id)).execute();

    return gitOp ? this.mapToGitOp(gitOp) : undefined;
  }

  async findByWorkItemId(workItemId: string): Promise<GitOp[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(gitOps)
      .where(eq(gitOps.workItemId, workItemId))
      .execute();

    return result.map((g) => this.mapToGitOp(g));
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<GitOp | undefined> {
    const db = await this.getDbInstance();
    const [gitOp] = await db
      .select()
      .from(gitOps)
      .where(eq(gitOps.idempotencyKey, idempotencyKey))
      .execute();

    return gitOp ? this.mapToGitOp(gitOp) : undefined;
  }

  async update(
    id: string,
    data: Partial<{
      operation: string;
      status: GitOp['status'];
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    }>
  ): Promise<GitOp | undefined> {
    const db = await this.getDbInstance();
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.operation !== undefined) {
      updateData.operation = data.operation;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.input !== undefined) {
      updateData.input = JSON.stringify(data.input);
    }
    if (data.output !== undefined) {
      updateData.output = JSON.stringify(data.output);
    }

    const [gitOp] = await db
      .update(gitOps)
      .set(updateData)
      .where(eq(gitOps.id, id))
      .returning()
      .execute();

    return gitOp ? this.mapToGitOp(gitOp) : undefined;
  }

  async updateStatus(id: string, status: GitOp['status']): Promise<GitOp | undefined> {
    return this.update(id, { status });
  }

  private mapToGitOp(row: any): GitOp {
    return {
      id: row.id,
      workItemId: row.workItemId,
      operation: row.operation,
      status: row.status,
      input: typeof row.input === 'string' ? JSON.parse(row.input) : row.input || {},
      output: typeof row.output === 'string' ? JSON.parse(row.output) : row.output || {},
      idempotencyKey: row.idempotencyKey,
      nodeRunId: row.nodeRunId,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt * 1000),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt * 1000),
    };
  }
}

export const gitOpsRepository = new GitOpsRepository();
