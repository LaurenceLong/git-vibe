import { eq } from 'drizzle-orm';
import { AGENT_RUN_STATUS_QUEUED } from 'git-vibe-shared';
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
    sessionId: string | null;
    linkedAgentRunId?: string | null;
    taskId?: string | null;
    idempotencyKey?: string | null;
    nodeRunId?: string | null;
  }): Promise<AgentRun> {
    const db = await this.getDbInstance();
    const values: {
      id: string;
      workItemId: string;
      projectId: string;
      agentKey: string;
      inputJson: string;
      sessionId: string | null;
      status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
      inputSummary?: string;
      linkedAgentRunId?: string | null;
      taskId?: string | null;
      idempotencyKey?: string | null;
      nodeRunId?: string | null;
    } = {
      id: data.id,
      workItemId: data.workItemId,
      projectId: data.projectId,
      agentKey: data.agentKey,
      inputJson: data.inputJson,
      sessionId: data.sessionId,
      status: AGENT_RUN_STATUS_QUEUED,
    };

    if (data.inputSummary !== undefined) {
      values.inputSummary = data.inputSummary;
    }

    if (data.linkedAgentRunId !== undefined) {
      values.linkedAgentRunId = data.linkedAgentRunId;
    }

    if (data.taskId !== undefined) {
      values.taskId = data.taskId;
    }

    if (data.idempotencyKey !== undefined) {
      values.idempotencyKey = data.idempotencyKey;
    }

    if (data.nodeRunId !== undefined) {
      values.nodeRunId = data.nodeRunId;
    }

    const [agentRun] = await db.insert(agentRuns).values(values).returning().execute();

    return this.mapToAgentRun(agentRun);
  }

  async findById(id: string): Promise<AgentRun | undefined> {
    const db = await this.getDbInstance();
    const [agentRun] = await db.select().from(agentRuns).where(eq(agentRuns.id, id)).execute();

    return agentRun ? this.mapToAgentRun(agentRun) : undefined;
  }

  async findByWorkItemId(workItemId: string): Promise<AgentRun[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.workItemId, workItemId))
      .execute();

    return result.map((r) => this.mapToAgentRun(r));
  }

  private mapToAgentRun(row: any): AgentRun {
    return {
      id: row.id,
      projectId: row.projectId,
      workItemId: row.workItemId,
      taskId: row.taskId || null,
      agentKey: row.agentKey,
      status: row.status,
      inputSummary: row.inputSummary,
      inputJson: row.inputJson,
      sessionId: row.sessionId,
      linkedAgentRunId: row.linkedAgentRunId,
      log: row.log,
      logPath: row.logPath,
      stdoutPath: row.stdoutPath,
      stderrPath: row.stderrPath,
      headShaBefore: row.headShaBefore,
      headShaAfter: row.headShaAfter,
      commitSha: row.commitSha,
      pid: row.pid,
      idempotencyKey: row.idempotencyKey || null,
      nodeRunId: row.nodeRunId || null,
      startedAt:
        row.startedAt instanceof Date
          ? row.startedAt
          : row.startedAt
            ? new Date(row.startedAt * 1000)
            : null,
      finishedAt:
        row.finishedAt instanceof Date
          ? row.finishedAt
          : row.finishedAt
            ? new Date(row.finishedAt * 1000)
            : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt * 1000),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt * 1000),
    };
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

    return agentRun ? this.mapToAgentRun(agentRun) : undefined;
  }
}

export const agentRunsRepository = new AgentRunsRepository();
