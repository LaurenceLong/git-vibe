import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { agentRunsRepository } from '../repositories/AgentRunsRepository.js';
import { changesetsRepository } from '../repositories/ChangeSetsRepository.js';
import { openCodeAgentAdapter } from '../services/OpenCodeAgentAdapter.js';

export async function agentRunsRoutes(server: FastifyInstance) {
  const triggerAgentRunSchema = z.object({
    agentKey: z.string().min(1),
    inputSummary: z.string().optional().or(z.literal('')),
    prompt: z.string().min(1),
    config: z.object({
      executablePath: z.string().min(1),
      baseArgs: z.array(z.string()).optional(),
    }),
  });

  // PLAN: trigger agent run for a changeset
  server.post<{ Params: { id: string } }>('/api/changesets/:id/agent-runs', async (request, reply) => {
    try {
      const changeset = await changesetsRepository.findById(request.params.id);

      if (!changeset) {
        return reply.status(404).send({
          error: true,
          message: 'Changeset not found',
        });
      }

      const body = triggerAgentRunSchema.parse(request.body);

      await openCodeAgentAdapter.validate(body.config);

      const runId = uuidv4();

      const agentRun = await agentRunsRepository.create({
        id: runId,
        changesetId: request.params.id,
        agentKey: body.agentKey,
        inputSummary: body.inputSummary || undefined,
        inputJson: JSON.stringify({
          prompt: body.prompt,
          config: body.config,
        }),
      });

      // mark running + startedAt immediately
      await agentRunsRepository.update(runId, {
        status: 'running',
        startedAt: new Date(),
      });

      // async execution (best-effort)
      openCodeAgentAdapter
        .run({
          worktreePath: changeset.worktreePath,
          agentRunId: runId,
          prompt: body.prompt,
          config: body.config,
        })
        .catch(async (error) => {
          await agentRunsRepository.update(runId, {
            status: 'failed',
            log: `Failed to start agent process: ${error instanceof Error ? error.message : String(error)}`,
            finishedAt: new Date(),
          });
        });

      return reply.status(201).send(agentRun);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: true,
          message: 'Validation failed',
          details: error.errors,
        });
      }

      throw error;
    }
  });

  // NEW: list runs for a changeset (frontend needs this)
  server.get<{ Params: { id: string } }>('/api/changesets/:id/agent-runs', async (request, reply) => {
    const changeset = await changesetsRepository.findById(request.params.id);
    if (!changeset) {
      return reply.status(404).send({
        error: true,
        message: 'Changeset not found',
      });
    }

    return await agentRunsRepository.findByChangesetId(request.params.id);
  });

  server.get<{ Params: { id: string } }>('/api/agent-runs/:id', async (request, reply) => {
    const agentRun = await agentRunsRepository.findById(request.params.id);

    if (!agentRun) {
      return reply.status(404).send({
        error: true,
        message: 'Agent run not found',
        statusCode: 404,
      });
    }

    return agentRun;
  });

  server.post<{ Params: { id: string } }>('/api/agent-runs/:id/cancel', async (request, reply) => {
    const agentRun = await agentRunsRepository.findById(request.params.id);

    if (!agentRun) {
      return reply.status(404).send({
        error: true,
        message: 'Agent run not found',
      });
    }

    await openCodeAgentAdapter.cancel(request.params.id);

    const updated = await agentRunsRepository.update(request.params.id, {
      status: 'cancelled',
      finishedAt: new Date(),
    });

    return { message: 'Agent run cancelled', id: request.params.id, agentRun: updated };
  });
}