import { eq } from 'drizzle-orm';
import { agentRuns } from '../models/schema.js';
import type { AgentRun } from '../types/models.js';
import { getDb } from '../db/client.js';

export class AgentRunsRepository {
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
    agentKey: string;
    inputSummary?: string;
    inputJson: string;
  }): Promise<AgentRun> {
    const db = await this.getDbInstance();
    const [agentRun] = await db
      .insert(agentRuns)
      .values({
        id: data.id,
        changesetId: data.changesetId,
        agentKey: data.agentKey,
        inputSummary: data.inputSummary || null,
        inputJson: data.inputJson,
        status: 'queued',
      })
      .returning()
      .execute();

    return agentRun as AgentRun;
  }

  async findById(id: string): Promise<AgentRun | undefined> {
    const db = await this.getDbInstance();
    const [agentRun] = await db.select().from(agentRuns).where(eq(agentRuns.id, id)).execute();

    return agentRun as AgentRun | undefined;
  }

  async findByChangesetId(changesetId: string): Promise<AgentRun[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.changesetId, changesetId))
      .execute();

    return result as AgentRun[];
  }

  async update(
    id: string,
    data: Partial<Omit<AgentRun, 'id' | 'changesetId' | 'createdAt'>>
  ): Promise<AgentRun | undefined> {
    const db = await this.getDbInstance();
    const [agentRun] = await db
      .update(agentRuns)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, id))
      .returning()
      .execute();

    return agentRun as AgentRun | undefined;
  }
}

export const agentRunsRepository = new AgentRunsRepository();
