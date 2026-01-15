import { eq } from 'drizzle-orm';
import { pullRequests } from '../models/schema.js';
import type { PullRequest } from '../types/models.js';
import { getDb } from '../db/client.js';

export class PullRequestsRepository {
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
    workItemId: string;
    title: string;
    description?: string;
    status?: PullRequest['status'];
    sourceBranch: string;
    targetBranch: string;
    mergeStrategy?: PullRequest['mergeStrategy'];
  }): Promise<PullRequest> {
    const db = await this.getDbInstance();
    const [pr] = await db
      .insert(pullRequests)
      .values({
        id: data.id,
        projectId: data.projectId,
        workItemId: data.workItemId,
        title: data.title,
        description: data.description || null,
        status: data.status || 'open',
        sourceBranch: data.sourceBranch,
        targetBranch: data.targetBranch,
        mergeStrategy: data.mergeStrategy || 'merge',
      })
      .returning()
      .execute();

    return pr as PullRequest;
  }

  async findById(id: string): Promise<PullRequest | undefined> {
    const db = await this.getDbInstance();
    const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.id, id)).execute();

    return pr as PullRequest | undefined;
  }

  async findByWorkItemId(workItemId: string): Promise<PullRequest | undefined> {
    const db = await this.getDbInstance();
    const [pr] = await db
      .select()
      .from(pullRequests)
      .where(eq(pullRequests.workItemId, workItemId))
      .execute();

    return pr as PullRequest | undefined;
  }

  async findByProjectId(projectId: string): Promise<PullRequest[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(pullRequests)
      .where(eq(pullRequests.projectId, projectId))
      .execute();

    return result as PullRequest[];
  }

  async update(
    id: string,
    data: {
      title?: string;
      description?: string;
      status?: PullRequest['status'];
      sourceBranch?: string;
      targetBranch?: string;
      mergeStrategy?: PullRequest['mergeStrategy'];
      mergedAt?: Date;
      mergedBy?: string;
      mergeCommitSha?: string;
    }
  ): Promise<PullRequest | undefined> {
    const db = await this.getDbInstance();
    const [pr] = await db
      .update(pullRequests)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(pullRequests.id, id))
      .returning()
      .execute();

    return pr as PullRequest | undefined;
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDbInstance();
    await db.delete(pullRequests).where(eq(pullRequests.id, id)).execute();
  }

  async getMergeability(id: string): Promise<{
    canMerge: boolean;
    reason?: string;
  }> {
    const db = await this.getDbInstance();
    const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.id, id)).execute();

    if (!pr) {
      return { canMerge: false, reason: 'Pull request not found' };
    }

    // Check if PR is already merged or closed
    if (pr.status === 'merged') {
      return { canMerge: false, reason: 'Pull request is already merged' };
    }

    if (pr.status === 'closed') {
      return { canMerge: false, reason: 'Pull request is closed' };
    }

    // PR is open and can be merged
    // Additional checks (conflicts, CI status, etc.) can be added here
    return { canMerge: true };
  }
}

export const pullRequestsRepository = new PullRequestsRepository();
