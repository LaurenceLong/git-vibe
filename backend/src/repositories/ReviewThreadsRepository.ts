import { eq } from 'drizzle-orm';
import { reviewThreads } from '../models/schema.js';
import type { ReviewThread } from '../types/models.js';
import { getDb } from '../db/client.js';

export class ReviewThreadsRepository {
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
    severity: ReviewThread['severity'];
    anchor: string;
    status?: ReviewThread['status'];
  }): Promise<ReviewThread> {
    const db = await this.getDbInstance();
    const [thread] = await db
      .insert(reviewThreads)
      .values({
        id: data.id,
        pullRequestId: data.pullRequestId,
        severity: data.severity,
        anchor: data.anchor,
        status: data.status || 'open',
      })
      .returning()
      .execute();

    return thread as ReviewThread;
  }

  async findByPullRequestId(pullRequestId: string): Promise<ReviewThread[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(reviewThreads)
      .where(eq(reviewThreads.pullRequestId, pullRequestId))
      .execute();

    return result as ReviewThread[];
  }

  async findById(id: string): Promise<ReviewThread | undefined> {
    const db = await this.getDbInstance();
    const [thread] = await db
      .select()
      .from(reviewThreads)
      .where(eq(reviewThreads.id, id))
      .execute();

    return thread as ReviewThread | undefined;
  }

  async update(
    id: string,
    data: { status: ReviewThread['status'] }
  ): Promise<ReviewThread | undefined> {
    const db = await this.getDbInstance();
    const [thread] = await db
      .update(reviewThreads)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(reviewThreads.id, id))
      .returning()
      .execute();

    return thread as ReviewThread | undefined;
  }

  async resolveThread(id: string): Promise<ReviewThread | undefined> {
    return this.update(id, { status: 'resolved' });
  }

  async unresolveThread(id: string): Promise<ReviewThread | undefined> {
    return this.update(id, { status: 'open' });
  }
}

export const reviewThreadsRepository = new ReviewThreadsRepository();
