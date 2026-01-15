import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TriggerAgentRunDTOSchema, CancelAgentRunResponseSchema } from 'git-vibe-shared';
import { agentRunsRepository } from '../repositories/AgentRunsRepository.js';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { projectsRepository } from '../repositories/ProjectsRepository.js';
import { agentService } from '../services/AgentService.js';

export async function agentRunsRoutes(server: FastifyInstance) {
  // POST /api/work-items/:id/agent-runs - Start agent run for a WorkItem
  server.post<{ Params: { id: string } }>(
    '/api/work-items/:id/agent-runs',
    async (request, reply) => {
      try {
        const workItem = await workItemsRepository.findById(request.params.id);

        if (!workItem) {
          return reply.status(404).send({
            error: true,
            message: 'WorkItem not found',
          });
        }

        const project = await projectsRepository.findById(workItem.projectId);
        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        const body = TriggerAgentRunDTOSchema.parse(request.body);

        // Build prompt
        const prompt = body.prompt;

        // Use AgentService to start the agent run
        // This will handle workspace initialization, locking, and agent execution
        const result = await agentService.executeTask(
          project.id,
          workItem.id,
          prompt,
          undefined // No work item body needed for manual agent run
        );

        return reply.status(201).send(result.agentRun);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: true,
            message: 'Validation failed',
            details: error.errors,
          });
        }

        return reply.status(500).send({
          error: true,
          message: 'Failed to start agent run',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // GET /api/work-items/:id/agent-runs - List agent runs for a WorkItem
  server.get<{ Params: { id: string } }>(
    '/api/work-items/:id/agent-runs',
    async (request, reply) => {
      const workItem = await workItemsRepository.findById(request.params.id);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      return await agentRunsRepository.findByWorkItemId(request.params.id);
    }
  );

  // GET /api/agent-runs/:id - Get agent run by ID
  server.get<{ Params: { id: string } }>('/api/agent-runs/:id', async (request, reply) => {
    const agentRun = await agentRunsRepository.findById(request.params.id);

    if (!agentRun) {
      return reply.status(404).send({
        error: true,
        message: 'Agent run not found',
      });
    }

    return agentRun;
  });

  // POST /api/agent-runs/:id/cancel - Cancel agent run
  server.post<{ Params: { id: string } }>('/api/agent-runs/:id/cancel', async (request, reply) => {
    const agentRun = await agentRunsRepository.findById(request.params.id);

    if (!agentRun) {
      return reply.status(404).send({
        error: true,
        message: 'Agent run not found',
      });
    }

    // Delegate to AgentService
    await agentService.cancelTask(request.params.id);

    const updated = await agentRunsRepository.findById(request.params.id);

    const response = CancelAgentRunResponseSchema.parse({
      message: 'Agent run cancelled',
      id: request.params.id,
      agentRun: updated ?? agentRun,
    });
    return reply.status(200).send(response);
  });
}
