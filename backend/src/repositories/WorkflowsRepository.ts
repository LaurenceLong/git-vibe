import { eq, and } from 'drizzle-orm';
import { workflows, workflowRuns, stepExecutions } from '../models/schema.js';
import type { Workflow } from '../types/models.js';
import { getDb } from '../db/client.js';

export interface WorkflowRecord {
  id: string;
  projectId: string;
  name: string;
  definition: string;
  isDefault: boolean;
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

export interface StepExecutionRecord {
  id: string;
  runId: string;
  nodeId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'skipped';
  startedAt: Date | null;
  finishedAt: Date | null;
  errorMessage: string | null;
  outputs: string;
  artifacts: string;
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
  }): Promise<WorkflowRecord> {
    const db = await this.getDbInstance();
    const [workflow] = await db
      .insert(workflows)
      .values({
        id: data.id,
        projectId: data.projectId,
        name: data.name,
        definition: JSON.stringify(data.definition),
        isDefault: data.isDefault ?? false,
      })
      .returning()
      .execute();

    return workflow as WorkflowRecord;
  }

  async findAll(projectId?: string): Promise<WorkflowRecord[]> {
    const db = await this.getDbInstance();
    let query = db.select().from(workflows);
    if (projectId) {
      query = query.where(eq(workflows.projectId, projectId)) as typeof query;
    }
    const result = await query.execute();
    return result as WorkflowRecord[];
  }

  async findById(id: string): Promise<WorkflowRecord | undefined> {
    const db = await this.getDbInstance();
    const [workflow] = await db.select().from(workflows).where(eq(workflows.id, id)).execute();

    return workflow as WorkflowRecord | undefined;
  }

  async findDefault(projectId: string): Promise<WorkflowRecord | undefined> {
    const db = await this.getDbInstance();
    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.projectId, projectId), eq(workflows.isDefault, true)))
      .execute();

    return workflow as WorkflowRecord | undefined;
  }

  async findByProjectId(projectId: string): Promise<WorkflowRecord[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, projectId))
      .execute();
    return result as WorkflowRecord[];
  }

  async findByName(name: string, projectId: string): Promise<WorkflowRecord | undefined> {
    const db = await this.getDbInstance();
    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.projectId, projectId), eq(workflows.name, name)))
      .execute();

    return workflow as WorkflowRecord | undefined;
  }

  async update(
    id: string,
    data: {
      name?: string;
      definition?: Workflow;
      isDefault?: boolean;
    }
  ): Promise<WorkflowRecord | undefined> {
    const db = await this.getDbInstance();
    const [workflow] = await db
      .update(workflows)
      .set({
        name: data.name,
        definition: data.definition ? JSON.stringify(data.definition) : undefined,
        isDefault: data.isDefault,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, id))
      .returning()
      .execute();

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
    const [run] = await db
      .insert(workflowRuns)
      .values({
        id: data.id,
        workflowId: data.workflowId,
        workItemId: data.workItemId,
        status: 'pending',
      })
      .returning()
      .execute();

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
    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).execute();

    return run as WorkflowRunRecord | undefined;
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
    const [run] = await db
      .update(workflowRuns)
      .set({
        ...data,
      })
      .where(eq(workflowRuns.id, id))
      .returning()
      .execute();

    return run as WorkflowRunRecord | undefined;
  }

  async deleteRun(id: string): Promise<void> {
    const db = await this.getDbInstance();
    await db.delete(workflowRuns).where(eq(workflowRuns.id, id)).execute();
  }

  async createStepExecution(data: {
    id: string;
    runId: string;
    nodeId: string;
    outputs: Record<string, unknown>;
    artifacts: unknown[];
  }): Promise<StepExecutionRecord> {
    const db = await this.getDbInstance();
    const [stepExecution] = await db
      .insert(stepExecutions)
      .values({
        id: data.id,
        runId: data.runId,
        nodeId: data.nodeId,
        status: 'pending',
        outputs: JSON.stringify(data.outputs),
        artifacts: JSON.stringify(data.artifacts),
      })
      .returning()
      .execute();

    return stepExecution as StepExecutionRecord;
  }

  async findStepExecutionsByRunId(runId: string): Promise<StepExecutionRecord[]> {
    const db = await this.getDbInstance();
    const result = await db
      .select()
      .from(stepExecutions)
      .where(eq(stepExecutions.runId, runId))
      .execute();
    return result as StepExecutionRecord[];
  }

  async findStepExecutionById(id: string): Promise<StepExecutionRecord | undefined> {
    const db = await this.getDbInstance();
    const [stepExecution] = await db
      .select()
      .from(stepExecutions)
      .where(eq(stepExecutions.id, id))
      .execute();

    return stepExecution as StepExecutionRecord | undefined;
  }

  async updateStepExecution(
    id: string,
    data: {
      status?: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'skipped';
      startedAt?: Date | null;
      finishedAt?: Date | null;
      errorMessage?: string | null;
      outputs?: Record<string, unknown>;
      artifacts?: unknown[];
    }
  ): Promise<StepExecutionRecord | undefined> {
    const db = await this.getDbInstance();
    const [stepExecution] = await db
      .update(stepExecutions)
      .set({
        status: data.status,
        startedAt: data.startedAt,
        finishedAt: data.finishedAt,
        errorMessage: data.errorMessage,
        outputs: data.outputs ? JSON.stringify(data.outputs) : undefined,
        artifacts: data.artifacts ? JSON.stringify(data.artifacts) : undefined,
      })
      .where(eq(stepExecutions.id, id))
      .returning()
      .execute();

    return stepExecution as StepExecutionRecord | undefined;
  }

  async deleteStepExecution(id: string): Promise<void> {
    const db = await this.getDbInstance();
    await db.delete(stepExecutions).where(eq(stepExecutions.id, id)).execute();
  }
}

export const workflowsRepository = new WorkflowsRepository();
