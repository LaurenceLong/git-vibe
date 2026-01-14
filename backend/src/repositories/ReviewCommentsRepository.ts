import { eq } from 'drizzle-orm';
import { reviewComments } from '../models/schema.js';
import type { ReviewComment } from '../types/models.js';
import { getDb } from '../db/client.js';

export class ReviewCommentsRepository {
  private db: Awaited<ReturnType<typeof getDb>> | null = null;

  private async getDbInstance() {
    if (!this.db) {
      this.db = await getDb();
    }
    return this.db;
  }

  async create(data: { id: string; threadId: string; body: string }): Promise<ReviewComment> {
    const db = await this.getDbInstance();
    const [comment] = await db
      .insert(reviewComments)
      .values({
        id: data.id,
        threadId: data.threadId,
        body: data.body,
      })
      .returning()
      .execute();

    return comment as ReviewComment;
  }

  async findByThreadId(threadId: string): Promise<ReviewComment[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(reviewComments)
      .where(eq(reviewComments.threadId, threadId))
      .execute();

    return result as ReviewComment[];
  }
}

export const reviewCommentsRepository = new ReviewCommentsRepository();
