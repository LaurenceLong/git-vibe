import { eq, and, desc } from 'drizzle-orm';
import { workflows, workflowRuns, nodeRuns } from '../models/schema.js';
import type { Workflow } from '../types/models.js';
import { getDb } from '../db/client.js';

export interface WorkflowRecord {
  id: string;
  projectId: string;
  name: string;
  definition: string;
  isDefault: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowRunRecord {
  id: string;
  workflowId: string;
  workItemId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'skipped';
  currentStepId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface NodeRunRecord {
  id: string;
  runId: string;
  workflowRunId: string;
  nodeId: string;
  resourceType: string;
  subjectKind: string;
  subjectId: string;
  subjectVersionAtStart: number;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'blocked';
  attempt: number;
  idempotencyKey: string | null;
  input: string;
  output: string;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export class WorkflowsRepository {
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
    name: string;
    definition: Workflow;
    isDefault?: boolean;
    version?: number;
  }): Promise<WorkflowRecord> {
    const db = await this.getDbInstance();
    const result = await db
      .insert(workflows)
      .values({
        id: data.id,
        projectId: data.projectId,
        name: data.name,
        definition: JSON.stringify(data.definition),
        isDefault: data.isDefault ?? false,
        version: data.version ?? data.definition.version ?? 1,
      })
      .returning()
      .execute();

    const [workflow] = Array.isArray(result) ? result : [result];

    return workflow as WorkflowRecord;
  }

  async findAll(projectId?: string): Promise<WorkflowRecord[]> {
    const db = await this.getDbInstance();
    let query = db.select().from(workflows);
    if (projectId) {
      query = query.where(eq(workflows.projectId, projectId)) as typeof query;
    }
    query = query.orderBy(desc(workflows.createdAt)) as typeof query;
    const result = await query.execute();
    return result as WorkflowRecord[];
  }

  async findById(id: string): Promise<WorkflowRecord | undefined> {
    const db = await this.getDbInstance();
    const result = await db.select().from(workflows).where(eq(workflows.id, id)).execute();

    return result[0] as WorkflowRecord | undefined;
  }

  async findDefault(projectId: string): Promise<WorkflowRecord | undefined> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.projectId, projectId), eq(workflows.isDefault, true)))
      .execute();

    return result[0] as WorkflowRecord | undefined;
  }

  async findByProjectId(projectId: string): Promise<WorkflowRecord[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, projectId))
      .orderBy(desc(workflows.createdAt))
      .execute();
    return result as WorkflowRecord[];
  }

  async findByName(name: string, projectId: string): Promise<WorkflowRecord | undefined> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.projectId, projectId), eq(workflows.name, name)))
      .execute();

    return result[0] as WorkflowRecord | undefined;
  }

  async update(
    id: string,
    data: {
      name?: string;
      definition?: Workflow;
      isDefault?: boolean;
      version?: number;
    }
  ): Promise<WorkflowRecord | undefined> {
    const db = await this.getDbInstance();
    const result = await db
      .update(workflows)
      .set({
        name: data.name,
        definition: data.definition ? JSON.stringify(data.definition) : undefined,
        isDefault: data.isDefault,
        version: data.version,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, id))
      .returning()
      .execute();

    const [workflow] = Array.isArray(result) ? result : [result];

    return workflow as WorkflowRecord | undefined;
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDbInstance();
    await db.delete(workflows).where(eq(workflows.id, id)).execute();
  }

  async createRun(data: {
    id: string;
    workflowId: string;
    workItemId: string;
  }): Promise<WorkflowRunRecord> {
    const db = await this.getDbInstance();
    const result = await db
      .insert(workflowRuns)
      .values({
        id: data.id,
        workflowId: data.workflowId,
        workItemId: data.workItemId,
        status: 'pending',
      })
      .returning()
      .execute();

    const [run] = Array.isArray(result) ? result : [result];

    return run as WorkflowRunRecord;
  }

  async findAllRuns(workItemId?: string, workflowId?: string): Promise<WorkflowRunRecord[]> {
    const db = await this.getDbInstance();
    let query = db.select().from(workflowRuns);

    const conditions = [];
    if (workItemId) {
      conditions.push(eq(workflowRuns.workItemId, workItemId));
    }
    if (workflowId) {
      conditions.push(eq(workflowRuns.workflowId, workflowId));
    }

    if (conditions.length > 0) {
      const condition = conditions.length === 1 ? conditions[0]! : and(...conditions);
      query = query.where(condition) as typeof query;
    }

    return (await query.execute()) as WorkflowRunRecord[];
  }

  async findRunById(id: string): Promise<WorkflowRunRecord | undefined> {
    const db = await this.getDbInstance();
    const result = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).execute();

    return result[0] as WorkflowRunRecord | undefined;
  }

  async updateRun(
    id: string,
    data: {
      status?: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'skipped';
      currentStepId?: string | null;
      startedAt?: Date | null;
      finishedAt?: Date | null;
    }
  ): Promise<WorkflowRunRecord | undefined> {
    const db = await this.getDbInstance();
    const result = await db
      .update(workflowRuns)
      .set({
        ...data,
      })
      .where(eq(workflowRuns.id, id))
      .returning()
      .execute();

    const [run] = Array.isArray(result) ? result : [result];

    return run as WorkflowRunRecord | undefined;
  }

  async deleteRun(id: string): Promise<void> {
    const db = await this.getDbInstance();
    await db.delete(workflowRuns).where(eq(workflowRuns.id, id)).execute();
  }

  async createNodeRun(data: {
    id: string;
    runId: string;
    workflowRunId: string;
    nodeId: string;
    resourceType: string;
    subjectKind: string;
    subjectId: string;
    subjectVersionAtStart: number;
    input: Record<string, unknown>;
  }): Promise<NodeRunRecord> {
    const db = await this.getDbInstance();
    await db.insert(nodeRuns).values({
      id: data.id,
      runId: data.runId,
      workflowRunId: data.workflowRunId,
      nodeId: data.nodeId,
      resourceType: data.resourceType,
      subjectKind: data.subjectKind,
      subjectId: data.subjectId,
      subjectVersionAtStart: data.subjectVersionAtStart,
      status: 'pending',
      input: JSON.stringify(data.input),
      output: '{}',
    });

    // Fetch created record
    const result = await db.select().from(nodeRuns).where(eq(nodeRuns.id, data.id)).execute();

    return result[0] as NodeRunRecord;
  }

  async findNodeRunsByWorkflowRunId(workflowRunId: string): Promise<NodeRunRecord[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(nodeRuns)
      .where(eq(nodeRuns.workflowRunId, workflowRunId))
      .execute();
    return result as NodeRunRecord[];
  }

  async findNodeRunById(id: string): Promise<NodeRunRecord | undefined> {
    const db = await this.getDbInstance();
    const result = await db.select().from(nodeRuns).where(eq(nodeRuns.id, id)).execute();

    return result[0] as NodeRunRecord | undefined;
  }

  async updateNodeRun(
    id: string,
    data: {
      status?: 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'blocked';
      startedAt?: Date | null;
      finishedAt?: Date | null;
      error?: string | null;
      output?: Record<string, unknown>;
    }
  ): Promise<NodeRunRecord | undefined> {
    const db = await this.getDbInstance();
    await db
      .update(nodeRuns)
      .set({
        status: data.status,
        startedAt: data.startedAt,
        finishedAt: data.finishedAt,
        error: data.error,
        output: data.output ? JSON.stringify(data.output) : undefined,
      })
      .where(eq(nodeRuns.id, id))
      .execute();

    // Fetch updated record
    const result = await db.select().from(nodeRuns).where(eq(nodeRuns.id, id)).execute();

    return result[0] as NodeRunRecord | undefined;
  }

  async deleteNodeRun(id: string): Promise<void> {
    const db = await this.getDbInstance();
    await db.delete(nodeRuns).where(eq(nodeRuns.id, id)).execute();
  }
}

export const workflowsRepository = new WorkflowsRepository();
