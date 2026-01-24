import type { FastifyInstance } from 'fastify';
import {
  WorkflowSchema,
  CreateWorkflowDTOSchema,
  UpdateWorkflowDTOSchema,
  ExecuteWorkflowDTOSchema,
} from 'git-vibe-shared';
import { workflowValidationService } from '../services/WorkflowValidationService.js';
import { workflowExecutionService } from '../services/WorkflowExecutionService.js';
import type { WorkflowRecord } from '../repositories/WorkflowsRepository.js';
import type { Workflow } from 'git-vibe-shared';

/**
 * Creates a default workflow when none exists in the database
 * This implements the exact default workflow backbone from WORKFLOW_DESIGN.md
 */
export function createDefaultWorkflow(projectId?: string): Workflow {
  const workflowId = projectId ? `workitem-default-${projectId}` : 'workitem-default';
  return {
    version: 1,
    workflow: {
      id: workflowId,
      name: 'Work Item Lifecycle (Competitive)',
      description:
        'Workflow for work items. The backbone is immutable; custom steps can only be inserted between backbone nodes.',
      context: {
        workitem: {
          titleRef: 'workitem.title',
          descriptionRef: 'workitem.description',
          descriptionUserEditable: true,
          normalization: {
            trimWhitespace: true,
            stripHtml: true,
            maxChars: 6000,
          },
        },
      },
      prompts: {
        templates: {
          // Shared fragment for workitem information
          workitem_info_prompt:
            '## Title: {{workitem.title}}\n## Description: {{workitem.description}}',
          // Shared fragment for context from previous agent runs
          agent_context_prompt: '## Context: {{agent.previousContext}}',
        },
      },
      backbone: [
        {
          id: 'workitem_created',
          type: 'event',
          immutable: true,
          display: { name: 'Work item created' },
          event: 'workitem.created',
          outputs: {
            artifacts: [{ id: 'workitem_snapshot', kind: 'json', ref: 'context.workitem' }],
          },
        },
        {
          id: 'process_workitem',
          type: 'agent',
          immutable: true,
          display: { name: 'Agent: process work item' },
          session: { mode: 'new', export: true },
          input: { useWorkitemContext: true },
          prompt:
            '# Complete the task below:\n## Type: {{workitem.type}}\n{{templates.workitem_info_prompt}}',
          outputs: {
            exports: ['session.id'],
            artifacts: [
              { id: 'session_recording', kind: 'session', ref: 'agent.session' },
              { id: 'plan_summary', kind: 'text', ref: 'agent.summary' },
            ],
          },
        },
        {
          id: 'commit_changes',
          type: 'agent',
          immutable: true,
          display: { name: 'Agent: craft commit (same session)' },
          session: { mode: 'reuse', from: 'process_workitem' },
          input: { useWorkitemContext: true },
          prompt:
            '# Complete the task below:\n## Type: Commit Request\n## Title: Commit necessary changes for: {{workitem.title}}\n{{templates.workitem_info_prompt}}\n{{templates.agent_context_prompt}}',
          outputs: {
            artifacts: [
              { id: 'commit_metadata', kind: 'json', ref: 'git.commit' },
              { id: 'staging_plan', kind: 'text', ref: 'agent.stagingPlan' },
            ],
          },
        },
        {
          id: 'create_pr',
          type: 'github',
          immutable: true,
          display: { name: 'Create PR' },
          action: 'pr.create',
          with: {
            base: 'main',
            head: 'current_branch',
            titleFrom: 'workitem.title',
            bodyFrom: 'workitem.description',
            draft: false,
          },
          retry: { maxAttempts: 2, backoffSeconds: 15 },
          outputs: {
            exports: ['github.pr.number', 'github.pr.url'],
            artifacts: [{ id: 'pr_ref', kind: 'json', ref: 'github.pr' }],
          },
        },
        {
          id: 'review_and_lint',
          type: 'agent',
          immutable: true,
          display: { name: 'Agent: review + lint' },
          session: { mode: 'new', export: false },
          input: { useWorkitemContext: true, extra: { prRef: '{{github.pr.number}}' } },
          prompt:
            '# Complete the task below:\n## Type: Review and Lint\n## PR: {{prRef}}\n{{templates.workitem_info_prompt}}\n{{templates.agent_context_prompt}}',
          outputs: {
            artifacts: [
              { id: 'review_summary', kind: 'text', ref: 'agent.summary' },
              { id: 'ci_results', kind: 'json', ref: 'ci.checks' },
            ],
          },
        },
        {
          id: 'merge_pr',
          type: 'github',
          immutable: true,
          display: { name: 'Merge PR' },
          when: { expr: 'ci.requiredChecksGreen == true' },
          action: 'pr.merge',
          with: {
            method: 'squash',
            requireGreenChecks: true,
          },
          retry: { maxAttempts: 2, backoffSeconds: 30 },
        },
        {
          id: 'merged',
          type: 'event',
          immutable: true,
          display: { name: 'Merged' },
          event: 'pr.merged',
        },
      ],
      slots: [
        {
          id: 'between_created_and_process',
          after: 'workitem_created',
          before: 'process_workitem',
          allowInsert: true,
          allowedNodeTypes: ['event', 'agent', 'ci', 'github', 'git'],
        },
        {
          id: 'between_process_and_commit',
          after: 'process_workitem',
          before: 'commit_changes',
          allowInsert: true,
          allowedNodeTypes: ['agent', 'ci'],
        },
        {
          id: 'between_commit_and_pr',
          after: 'commit_changes',
          before: 'create_pr',
          allowInsert: true,
          allowedNodeTypes: ['ci', 'github', 'git'],
        },
        {
          id: 'between_pr_and_review',
          after: 'create_pr',
          before: 'review_and_lint',
          allowInsert: true,
          allowedNodeTypes: ['agent', 'ci'],
        },
        {
          id: 'between_review_and_merge',
          after: 'review_and_lint',
          before: 'merge_pr',
          allowInsert: true,
          allowedNodeTypes: ['ci', 'github', 'agent'],
        },
        {
          id: 'between_merge_and_merged',
          after: 'merge_pr',
          before: 'merged',
          allowInsert: true,
          allowedNodeTypes: ['github', 'ci'],
        },
      ],
      extensions: {
        nodes: [
          {
            id: 'workitem_restarted',
            type: 'event',
            slot: 'between_created_and_process',
            display: { name: 'Work item restarted' },
            event: 'workitem.restarted',
          },
        ],
      },
      control: {
        extraNodes: [
          {
            id: 'resolve_conflicts',
            type: 'agent',
            immutable: true,
            display: { name: 'Agent: resolve merge conflicts' },
            session: { mode: 'new' },
            input: { useWorkitemContext: true, extra: { prRef: '{{github.pr.number}}' } },
            prompt:
              '# Complete the task below:\n## Type: Resolve Merge Conflicts\n## PR: {{prRef}}\n{{templates.workitem_info_prompt}}\n{{templates.agent_context_prompt}}',
            retry: { maxAttempts: 2, backoffSeconds: 30 },
            outputs: {
              artifacts: [
                { id: 'conflict_resolution_summary', kind: 'text', ref: 'agent.summary' },
              ],
            },
          },
        ],
        transitions: [
          { from: 'merge_pr', on: 'conflict', to: 'resolve_conflicts' },
          { from: 'resolve_conflicts', on: 'success', to: 'merge_pr' },
        ],
        sync: {
          mode: 'reconcile',
          sources: ['github.events', 'ci.checks', 'git.state'],
          rules: [
            {
              when: { expr: 'github.pr.exists == true' },
              satisfyStep: 'create_pr',
              setOutputs: {
                'github.pr.number': '{{github.pr.number}}',
                'github.pr.url': '{{github.pr.url}}',
              },
            },
            {
              when: { expr: 'github.pr.merged == true' },
              satisfyStep: 'merge_pr',
            },
            {
              when: { expr: 'github.pr.merged == true' },
              satisfyStep: 'merged',
            },
            {
              when: { expr: 'ci.requiredChecksGreen == true' },
              satisfyStep: 'review_and_lint',
            },
          ],
        },
      },
      policy: {
        commit: {
          requireIntentionalStaging: true,
          allowGitAddAll: false,
          requireCommitBody: true,
          message: { subjectMaxLen: 72 },
        },
        ci: { requiredChecks: ['lint', 'unit-tests'] },
        merge: { requireGreenChecks: true, method: 'squash', onConflict: 'transition' },
      },
    },
  };
}

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

        const workflowsRepo = await import('../repositories/WorkflowsRepository.js').then(
          (m) => m.workflowsRepository
        );
        const { projectsRepository } = await import('../repositories/ProjectsRepository.js');

        // Verify project exists
        const project = await projectsRepository.findById(projectId);
        if (!project) {
          return reply.code(404).send({
            error: true,
            message: `Project not found: ${projectId}`,
          });
        }

        let allWorkflows = await workflowsRepo.findByProjectId(projectId);

        // Ensure default workflow exists and has the correct structure for this project
        const expectedDefaultWorkflow = createDefaultWorkflow(projectId);
        const expectedBackboneLength = expectedDefaultWorkflow.workflow.backbone.length;
        const expectedWorkflowId = expectedDefaultWorkflow.workflow.id;

        let defaultWorkflowRecord = await workflowsRepo.findDefault(projectId);

        // Check if default workflow exists and has correct structure
        if (!defaultWorkflowRecord) {
          // No default workflow exists for this project, create it
          defaultWorkflowRecord = await workflowsRepo.create({
            id: expectedWorkflowId,
            projectId,
            name: expectedDefaultWorkflow.workflow.name,
            definition: expectedDefaultWorkflow,
            isDefault: true,
          });
        } else {
          // Default workflow exists, check if it needs updating
          const existingWorkflow: Workflow =
            typeof defaultWorkflowRecord.definition === 'string'
              ? JSON.parse(defaultWorkflowRecord.definition)
              : defaultWorkflowRecord.definition;

          const existingBackboneLength = existingWorkflow.workflow.backbone?.length || 0;

          // If backbone doesn't match expected structure, update it
          if (existingBackboneLength !== expectedBackboneLength) {
            // Update the existing default workflow with correct structure
            const oldId = defaultWorkflowRecord.id;
            defaultWorkflowRecord = await workflowsRepo.update(oldId, {
              name: expectedDefaultWorkflow.workflow.name,
              definition: expectedDefaultWorkflow,
              isDefault: true,
            });

            // If update failed or returned undefined, delete old and create new
            if (!defaultWorkflowRecord) {
              await workflowsRepo.delete(oldId);
              defaultWorkflowRecord = await workflowsRepo.create({
                id: expectedWorkflowId,
                projectId,
                name: expectedDefaultWorkflow.workflow.name,
                definition: expectedDefaultWorkflow,
                isDefault: true,
              });
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
      const workflowsRepo = await import('../repositories/WorkflowsRepository.js').then(
        (m) => m.workflowsRepository
      );

      const workflowRecord = await workflowsRepo.findById(id);

      if (!workflowRecord) {
        return reply.code(404).send({
          error: true,
          message: `Workflow not found: ${id}`,
        });
      }

      const workflow: Workflow = JSON.parse(workflowRecord.definition);

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

        const validated = WorkflowSchema.safeParse({
          version: 1,
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

        const workflowsRepo = await import('../repositories/WorkflowsRepository.js').then(
          (m) => m.workflowsRepository
        );
        const { projectsRepository } = await import('../repositories/ProjectsRepository.js');

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

        const workflow: Workflow = JSON.parse(workflowRecord.definition);

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

      const workflowsRepo = await import('../repositories/WorkflowsRepository.js').then(
        (m) => m.workflowsRepository
      );
      const existing = await workflowsRepo.findById(id);

      if (!existing) {
        return reply.code(404).send({
          error: true,
          message: `Workflow not found: ${id}`,
        });
      }

      const validated = WorkflowSchema.safeParse({
        version: 1,
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
      const existingWorkflow: Workflow =
        typeof existing.definition === 'string'
          ? JSON.parse(existing.definition)
          : existing.definition;
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

      const workflow: Workflow = JSON.parse(updated.definition);

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
      const workflowsRepo = await import('../repositories/WorkflowsRepository.js').then(
        (m) => m.workflowsRepository
      );
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

        const workflowsRepo = await import('../repositories/WorkflowsRepository.js').then(
          (m) => m.workflowsRepository
        );
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

        const workflowsRepo = await import('../repositories/WorkflowsRepository.js').then(
          (m) => m.workflowsRepository
        );
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
        const workflowsRepo = await import('../repositories/WorkflowsRepository.js').then(
          (m) => m.workflowsRepository
        );

        const runRecord = await workflowsRepo.findRunById(runId);

        if (!runRecord) {
          return reply.code(404).send({
            error: true,
            message: `Run not found: ${runId}`,
          });
        }

        const steps = await workflowsRepo.findStepExecutionsByRunId(runId);

        const stepsData = steps.map((s) => ({
          id: s.id,
          runId: s.runId,
          nodeId: s.nodeId,
          status: s.status,
          startedAt: s.startedAt?.toISOString() ?? null,
          finishedAt: s.finishedAt?.toISOString() ?? null,
          errorMessage: s.errorMessage ?? null,
          outputs: typeof s.outputs === 'string' ? JSON.parse(s.outputs) : s.outputs,
          artifacts: typeof s.artifacts === 'string' ? JSON.parse(s.artifacts) : s.artifacts,
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
        const workflowsRepo = await import('../repositories/WorkflowsRepository.js').then(
          (m) => m.workflowsRepository
        );

        const steps = await workflowsRepo.findStepExecutionsByRunId(runId);

        const stepsData = steps.map((s) => ({
          id: s.id,
          runId: s.runId,
          nodeId: s.nodeId,
          status: s.status,
          startedAt: s.startedAt?.toISOString() ?? null,
          finishedAt: s.finishedAt?.toISOString() ?? null,
          errorMessage: s.errorMessage ?? null,
          outputs: typeof s.outputs === 'string' ? JSON.parse(s.outputs) : s.outputs,
          artifacts: typeof s.artifacts === 'string' ? JSON.parse(s.artifacts) : s.artifacts,
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
