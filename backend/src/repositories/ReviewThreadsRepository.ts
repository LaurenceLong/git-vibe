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
    changesetId: string;
    severity: ReviewThread['severity'];
    anchor: string;
  }): Promise<ReviewThread> {
    const db = await this.getDbInstance();
    const [thread] = await db
      .insert(reviewThreads)
      .values({
        id: data.id,
        changesetId: data.changesetId,
        severity: data.severity,
        anchor: data.anchor,
        status: 'open',
      })
      .returning()
      .execute();

    return thread as ReviewThread;
  }

  async findByChangesetId(changesetId: string): Promise<ReviewThread[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(reviewThreads)
      .where(eq(reviewThreads.changesetId, changesetId))
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

  async update(id: string, data: { status: ReviewThread['status'] }): Promise<ReviewThread | undefined> {
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
}

export const reviewThreadsRepository = new ReviewThreadsRepository();
