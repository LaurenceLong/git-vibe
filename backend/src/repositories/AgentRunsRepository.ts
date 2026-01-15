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
    workItemId: string;
    projectId: string;
    agentKey: string;
    inputSummary?: string;
    inputJson: string;
    sessionId: string;
    linkedAgentRunId?: string | null;
  }): Promise<AgentRun> {
    const db = await this.getDbInstance();
    const values: {
      id: string;
      workItemId: string;
      projectId: string;
      agentKey: string;
      inputJson: string;
      sessionId: string;
      status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
      inputSummary?: string;
      linkedAgentRunId?: string | null;
    } = {
      id: data.id,
      workItemId: data.workItemId,
      projectId: data.projectId,
      agentKey: data.agentKey,
      inputJson: data.inputJson,
      sessionId: data.sessionId,
      status: 'queued',
    };

    if (data.inputSummary !== undefined) {
      values.inputSummary = data.inputSummary;
    }

    if (data.linkedAgentRunId !== undefined) {
      values.linkedAgentRunId = data.linkedAgentRunId;
    }

    const [agentRun] = await db.insert(agentRuns).values(values).returning().execute();

    return agentRun as AgentRun;
  }

  async findById(id: string): Promise<AgentRun | undefined> {
    const db = await this.getDbInstance();
    const [agentRun] = await db.select().from(agentRuns).where(eq(agentRuns.id, id)).execute();

    return agentRun as AgentRun | undefined;
  }

  async findByWorkItemId(workItemId: string): Promise<AgentRun[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.workItemId, workItemId))
      .execute();

    return result as AgentRun[];
  }

  async update(
    id: string,
    data: Partial<Omit<AgentRun, 'id' | 'workItemId' | 'createdAt'>>
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
