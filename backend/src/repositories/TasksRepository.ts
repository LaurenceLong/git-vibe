import { eq, and } from 'drizzle-orm';
import { tasks } from '../models/schema.js';
import type { Task } from '../types/models.js';
import { getDb } from '../db/client.js';

export class TasksRepository {
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
    taskType: string;
    status?: Task['status'];
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    currentAgentRunId?: string | null;
    idempotencyKey?: string | null;
    nodeRunId?: string | null;
  }): Promise<Task> {
    const db = await this.getDbInstance();
    const [task] = await db
      .insert(tasks)
      .values({
        id: data.id,
        workItemId: data.workItemId,
        taskType: data.taskType,
        status: data.status || 'pending',
        input: JSON.stringify(data.input || {}),
        output: JSON.stringify(data.output || {}),
        currentAgentRunId: data.currentAgentRunId || null,
        idempotencyKey: data.idempotencyKey || null,
        nodeRunId: data.nodeRunId || null,
      })
      .returning()
      .execute();

    return this.mapToTask(task);
  }

  async findById(id: string): Promise<Task | undefined> {
    const db = await this.getDbInstance();
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).execute();

    return task ? this.mapToTask(task) : undefined;
  }

  async findByWorkItemId(workItemId: string): Promise<Task[]> {
    const db = await this.getDbInstance();
    const result = await db.select().from(tasks).where(eq(tasks.workItemId, workItemId)).execute();

    return result.map((t) => this.mapToTask(t));
  }

  async findByTaskType(workItemId: string, taskType: string): Promise<Task | undefined> {
    const db = await this.getDbInstance();
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.workItemId, workItemId), eq(tasks.taskType, taskType)))
      .execute();

    return task ? this.mapToTask(task) : undefined;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Task | undefined> {
    const db = await this.getDbInstance();
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.idempotencyKey, idempotencyKey))
      .execute();

    return task ? this.mapToTask(task) : undefined;
  }

  async update(
    id: string,
    data: Partial<{
      status: Task['status'];
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      currentAgentRunId: string | null;
    }>
  ): Promise<Task | undefined> {
    const db = await this.getDbInstance();
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.input !== undefined) {
      updateData.input = JSON.stringify(data.input);
    }
    if (data.output !== undefined) {
      updateData.output = JSON.stringify(data.output);
    }
    if (data.currentAgentRunId !== undefined) {
      updateData.currentAgentRunId = data.currentAgentRunId;
    }

    const [task] = await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, id))
      .returning()
      .execute();

    return task ? this.mapToTask(task) : undefined;
  }

  async updateStatus(id: string, status: Task['status']): Promise<Task | undefined> {
    return this.update(id, { status });
  }

  private mapToTask(row: any): Task {
    return {
      id: row.id,
      workItemId: row.workItemId,
      taskType: row.taskType,
      status: row.status,
      input: typeof row.input === 'string' ? JSON.parse(row.input) : row.input || {},
      output: typeof row.output === 'string' ? JSON.parse(row.output) : row.output || {},
      currentAgentRunId: row.currentAgentRunId,
      idempotencyKey: row.idempotencyKey,
      nodeRunId: row.nodeRunId,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt * 1000),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt * 1000),
    };
  }
}

export const tasksRepository = new TasksRepository();
