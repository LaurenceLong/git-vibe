import type { FastifyInstance } from 'fastify';
import {
  WorkflowSchema,
  CreateWorkflowDTOSchema,
  UpdateWorkflowDTOSchema,
  ExecuteWorkflowDTOSchema,
  type Workflow,
} from 'git-vibe-shared';
import { workflowValidationService } from '../services/workflow/WorkflowValidationService.js';
import { workflowExecutionService } from '../services/workflow/WorkflowExecutionService.js';
import type { WorkflowRecord, NodeRunRecord } from '../repositories/WorkflowsRepository.js';
import {
  createDefaultWorkflow,
  getDefaultWorkflowVersion,
  getWorkflowVersion,
} from '../services/workflow/defaultWorkflow.js';
import { workflowsRepository } from '../repositories/WorkflowsRepository.js';
import { projectsRepository } from '../repositories/ProjectsRepository.js';

export const workflowRoutes = async (fastify: FastifyInstance): Promise<void> => {
  fastify.get<{ Querystring: { projectId?: string; page?: string; limit?: string } }>(
    '/api/workflows',
    async (request, reply) => {
      try {
        const { projectId, page: pageStr, limit: limitStr } = request.query;
        const page = parseInt(pageStr || '1', 10);
        const limit = parseInt(limitStr || '50', 10);

        if (!projectId) {
          return reply.code(400).send({
            error: true,
            message: 'projectId query parameter is required',
          });
        }

        const workflowsRepo = workflowsRepository;

        // Verify project exists
        const project = await projectsRepository.findById(projectId);
        if (!project) {
          return reply.code(404).send({
            error: true,
            message: `Project not found: ${projectId}`,
          });
        }

        let allWorkflows = await workflowsRepo.findByProjectId(projectId);

        // Ensure default workflow exists and has the correct version
        const expectedDefaultWorkflow = createDefaultWorkflow(projectId);
        const CURRENT_VERSION = getDefaultWorkflowVersion();
        const expectedWorkflowId = expectedDefaultWorkflow.workflow.id;

        let defaultWorkflowRecord = await workflowsRepo.findDefault(projectId);

        // Check if default workflow exists and has correct version
        if (!defaultWorkflowRecord) {
          // No default workflow exists for this project, create it
          defaultWorkflowRecord = await workflowsRepo.create({
            id: expectedWorkflowId,
            projectId,
            name: expectedDefaultWorkflow.workflow.name,
            definition: expectedDefaultWorkflow,
            isDefault: true,
            version: CURRENT_VERSION,
          });
        } else {
          // Default workflow exists, check version
          const dbVersion =
            defaultWorkflowRecord.version ||
            getWorkflowVersion(defaultWorkflowRecord.definition) ||
            1;

          if (dbVersion < CURRENT_VERSION) {
            // Version is outdated, update it
            const oldId = defaultWorkflowRecord.id;

            // If ID changed (due to version change), preserve old version and create new default
            if (oldId !== expectedWorkflowId) {
              // Mark old workflow as non-default (preserve for traceability)
              await workflowsRepo.update(oldId, {
                isDefault: false,
              });
              // Create new default workflow with new ID
              defaultWorkflowRecord = await workflowsRepo.create({
                id: expectedWorkflowId,
                projectId,
                name: expectedDefaultWorkflow.workflow.name,
                definition: expectedDefaultWorkflow,
                isDefault: true,
                version: CURRENT_VERSION,
              });
            } else {
              // Same ID, just update the definition (preserve old version in history if needed)
              defaultWorkflowRecord = await workflowsRepo.update(oldId, {
                name: expectedDefaultWorkflow.workflow.name,
                definition: expectedDefaultWorkflow,
                version: CURRENT_VERSION,
                isDefault: true,
              });

              // If update failed, create new workflow with new ID and preserve old one
              if (!defaultWorkflowRecord) {
                // Mark old as non-default
                await workflowsRepo.update(oldId, {
                  isDefault: false,
                });
                // Create new default
                defaultWorkflowRecord = await workflowsRepo.create({
                  id: expectedWorkflowId,
                  projectId,
                  name: expectedDefaultWorkflow.workflow.name,
                  definition: expectedDefaultWorkflow,
                  isDefault: true,
                  version: CURRENT_VERSION,
                });
              }
            }
          }
        }

        // Refresh workflows list after potential updates
        allWorkflows = await workflowsRepo.findByProjectId(projectId);

        const workflowsData = allWorkflows.map((w: WorkflowRecord) => ({
          id: w.id,
          name: w.name,
          description:
            (typeof w.definition === 'string'
              ? (JSON.parse(w.definition) as Workflow).workflow.description
              : (w.definition as Workflow).workflow.description) ?? '',
          definition: typeof w.definition === 'string' ? JSON.parse(w.definition) : w.definition,
          isDefault: w.isDefault,
          createdAt: w.createdAt.toISOString(),
          updatedAt: w.updatedAt.toISOString(),
        }));

        // Apply pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedWorkflows = workflowsData.slice(startIndex, endIndex);

        return reply.send({
          data: paginatedWorkflows,
          pagination: {
            page,
            limit,
            total: workflowsData.length,
            totalPages: Math.ceil(workflowsData.length / limit),
          },
        });
      } catch (error) {
        return reply.code(500).send({
          error: true,
          message: `Failed to list workflows: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  );

  fastify.get<{ Params: { id: string } }>('/api/workflows/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const workflowsRepo = workflowsRepository;

      const workflowRecord = await workflowsRepo.findById(id);

      if (!workflowRecord) {
        return reply.code(404).send({
          error: true,
          message: `Workflow not found: ${id}`,
        });
      }

      // Handle both string and object definitions
      const workflow: Workflow =
        typeof workflowRecord.definition === 'string'
          ? JSON.parse(workflowRecord.definition)
          : (workflowRecord.definition as Workflow);

      return reply.send({
        data: {
          id: workflowRecord.id,
          name: workflow.workflow.name,
          description: workflow.workflow.description,
          definition: workflow,
          isDefault: workflowRecord.isDefault,
          createdAt: workflowRecord.createdAt.toISOString(),
          updatedAt: workflowRecord.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      return reply.code(500).send({
        error: true,
        message: `Failed to get workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  });

  fastify.post<{ Querystring: { projectId?: string } }>(
    '/api/workflows',
    async (request, reply) => {
      try {
        const { projectId } = request.query;
        if (!projectId) {
          return reply.code(400).send({
            error: true,
            message: 'projectId query parameter is required',
          });
        }

        const body = CreateWorkflowDTOSchema.parse(request.body);

        // Use version from body.definition if provided, otherwise default to 1
        const workflowVersion = body.definition?.version ?? 1;

        const validated = WorkflowSchema.safeParse({
          version: workflowVersion,
          workflow: {
            ...body.definition,
            name: body.name,
            description: body.description,
          },
        });

        if (!validated.success) {
          return reply.code(400).send({
            error: true,
            message: 'Invalid workflow definition',
            details: validated.error.errors,
          });
        }

        const validation = workflowValidationService.validateWorkflow(validated.data);

        if (!validation.valid) {
          return reply.code(400).send({
            error: true,
            message: 'Workflow validation failed',
            details: validation.errors,
          });
        }

        const workflowsRepo = workflowsRepository;

        // Verify project exists
        const project = await projectsRepository.findById(projectId);
        if (!project) {
          return reply.code(404).send({
            error: true,
            message: `Project not found: ${projectId}`,
          });
        }

        // If setting as default, unset other defaults for this project
        if (body.isDefault) {
          const existingDefaults = await workflowsRepo.findByProjectId(projectId);
          for (const wf of existingDefaults) {
            if (wf.isDefault) {
              await workflowsRepo.update(wf.id, { isDefault: false });
            }
          }
        }

        const workflowRecord = await workflowsRepo.create({
          id: crypto.randomUUID(),
          projectId,
          name: body.name,
          definition: validated.data,
          isDefault: body.isDefault ?? false,
        });

        // Handle both string and object definitions
        const workflow: Workflow =
          typeof workflowRecord.definition === 'string'
            ? JSON.parse(workflowRecord.definition)
            : (workflowRecord.definition as Workflow);

        return reply.code(201).send({
          data: {
            id: workflowRecord.id,
            name: workflowRecord.name,
            description: workflow.workflow.description,
            definition: validated.data,
            isDefault: workflowRecord.isDefault,
            createdAt: workflowRecord.createdAt.toISOString(),
            updatedAt: workflowRecord.updatedAt.toISOString(),
          },
        });
      } catch (error) {
        return reply.code(500).send({
          error: true,
          message: `Failed to create workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  );

  fastify.patch<{ Params: { id: string } }>('/api/workflows/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const body = UpdateWorkflowDTOSchema.parse(request.body);

      if (!body.definition) {
        return reply.code(400).send({
          error: true,
          message: 'definition is required',
        });
      }

      const workflowsRepo = workflowsRepository;
      const existing = await workflowsRepo.findById(id);

      if (!existing) {
        return reply.code(404).send({
          error: true,
          message: `Workflow not found: ${id}`,
        });
      }

      // Use version from body.definition if provided, otherwise use existing version
      const existingWorkflow: Workflow =
        typeof existing.definition === 'string'
          ? JSON.parse(existing.definition)
          : (existing.definition as Workflow);
      const workflowVersion =
        body.definition?.version ?? existingWorkflow.version ?? existing.version ?? 1;

      const validated = WorkflowSchema.safeParse({
        version: workflowVersion,
        workflow: {
          ...body.definition,
          name: body.name ?? body.definition.name,
          description: body.description ?? body.definition.description,
        },
      });

      if (!validated.success) {
        return reply.code(400).send({
          error: true,
          message: 'Invalid workflow definition',
          details: validated.error.errors,
        });
      }

      const validation = workflowValidationService.validateWorkflow(validated.data);

      if (!validation.valid) {
        return reply.code(400).send({
          error: true,
          message: 'Workflow validation failed',
          details: validation.errors,
        });
      }

      // Validate backbone modifications for immutable nodes
      // existingWorkflow already parsed above
      const backboneValidation = workflowValidationService.validateBackboneModification(
        existingWorkflow,
        validated.data
      );

      if (!backboneValidation.allowed) {
        return reply.code(400).send({
          error: true,
          message: 'Backbone modification not allowed',
          details: backboneValidation.errors,
        });
      }

      // If setting as default, unset other defaults for this project
      if (body.isDefault) {
        const existingDefaults = await workflowsRepo.findByProjectId(existing.projectId);
        for (const wf of existingDefaults) {
          if (wf.isDefault && wf.id !== id) {
            await workflowsRepo.update(wf.id, { isDefault: false });
          }
        }
      }

      const updated = await workflowsRepo.update(id, {
        name: body.name,
        definition: validated.data,
        isDefault: body.isDefault,
      });

      if (!updated) {
        return reply.code(404).send({
          error: true,
          message: `Workflow not found: ${id}`,
        });
      }

      // Handle both string and object definitions
      const workflow: Workflow =
        typeof updated.definition === 'string'
          ? JSON.parse(updated.definition)
          : (updated.definition as Workflow);

      return reply.send({
        data: {
          id: updated.id,
          name: updated.name,
          description: workflow.workflow.description,
          definition: validated.data,
          isDefault: updated.isDefault,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      return reply.code(500).send({
        error: true,
        message: `Failed to update workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/api/workflows/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const workflowsRepo = workflowsRepository;
      const existing = await workflowsRepo.findById(id);

      if (!existing) {
        return reply.code(404).send({
          error: true,
          message: `Workflow not found: ${id}`,
        });
      }

      if (existing.isDefault) {
        return reply.code(400).send({
          error: true,
          message: 'Cannot delete default workflow',
        });
      }

      await workflowsRepo.delete(id);

      return reply.code(204).send();
    } catch (error) {
      return reply.code(500).send({
        error: true,
        message: `Failed to delete workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  });

  fastify.post<{ Params: { workflowId: string } }>(
    '/api/workflows/:workflowId/execute',
    async (request, reply) => {
      try {
        const { workflowId } = request.params;
        const { workItemId } = ExecuteWorkflowDTOSchema.parse(request.body);

        const workflowsRepo = workflowsRepository;
        const workflowRecord = await workflowsRepo.findById(workflowId);

        if (!workflowRecord) {
          return reply.code(404).send({
            error: true,
            message: `Workflow not found: ${workflowId}`,
          });
        }

        const workflowRun = await workflowExecutionService.execute(workflowId, workItemId);

        return reply.send({
          data: {
            id: workflowRun.id,
            workflowId: workflowRun.workflowId,
            workItemId: workflowRun.workItemId,
            status: workflowRun.status,
            currentStepId: workflowRun.currentStepId,
            startedAt: workflowRun.startedAt,
            finishedAt: workflowRun.finishedAt,
            createdAt: workflowRun.createdAt,
          },
        });
      } catch (error) {
        return reply.code(500).send({
          error: true,
          message: `Failed to execute workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  );

  fastify.get<{ Params: { workflowId: string }; Querystring: { workItemId?: string } }>(
    '/api/workflows/:workflowId/runs',
    async (request, reply) => {
      try {
        const { workflowId } = request.params;
        const { workItemId } = request.query;

        const workflowsRepo = workflowsRepository;
        const workflowRecord = await workflowsRepo.findById(workflowId);

        if (!workflowRecord) {
          return reply.code(404).send({
            error: true,
            message: `Workflow not found: ${workflowId}`,
          });
        }

        const runs = await workflowsRepo.findAllRuns(workItemId, workflowId);

        const runsData = runs.map((r) => ({
          id: r.id,
          workflowId: r.workflowId,
          workItemId: r.workItemId,
          status: r.status,
          currentStepId: r.currentStepId,
          startedAt: r.startedAt?.toISOString() ?? null,
          finishedAt: r.finishedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        }));

        return reply.send({
          data: runsData,
        });
      } catch (error) {
        return reply.code(500).send({
          error: true,
          message: `Failed to list workflow runs: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  );

  fastify.get<{ Params: { runId: string } }>(
    '/api/workflow-runs/:runId',
    async (request, reply) => {
      try {
        const { runId } = request.params;
        const workflowsRepo = workflowsRepository;

        const runRecord = await workflowsRepo.findRunById(runId);

        if (!runRecord) {
          return reply.code(404).send({
            error: true,
            message: `Run not found: ${runId}`,
          });
        }

        const steps = await workflowsRepo.findNodeRunsByWorkflowRunId(runId);

        const stepsData = steps.map((s: NodeRunRecord) => ({
          id: s.id,
          runId: s.runId,
          nodeId: s.nodeId,
          status: s.status,
          startedAt: s.startedAt?.toISOString() ?? null,
          finishedAt: s.finishedAt?.toISOString() ?? null,
          error: s.error ?? null,
          output: typeof s.output === 'string' ? JSON.parse(s.output) : s.output,
        }));

        return reply.send({
          data: stepsData,
        });
      } catch (error) {
        return reply.code(500).send({
          error: true,
          message: `Failed to get run details: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  );

  // Alias for frontend compatibility
  fastify.get<{ Params: { runId: string } }>(
    '/api/workflow-runs/:runId/steps',
    async (request, reply) => {
      try {
        const { runId } = request.params;
        const workflowsRepo = workflowsRepository;

        const steps = await workflowsRepo.findNodeRunsByWorkflowRunId(runId);

        const stepsData = steps.map((s: NodeRunRecord) => ({
          id: s.id,
          runId: s.runId,
          nodeId: s.nodeId,
          status: s.status,
          startedAt: s.startedAt?.toISOString() ?? null,
          finishedAt: s.finishedAt?.toISOString() ?? null,
          error: s.error ?? null,
          output: typeof s.output === 'string' ? JSON.parse(s.output) : s.output,
        }));

        return reply.send({
          data: stepsData,
        });
      } catch (error) {
        return reply.code(500).send({
          error: true,
          message: `Failed to get run steps: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  );
};
