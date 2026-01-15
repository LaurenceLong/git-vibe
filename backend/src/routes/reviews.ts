import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateThreadDTOSchema,
  AddressWithAgentDTOSchema,
  CreateCommentDTOSchema,
} from 'git-vibe-shared';
import { reviewThreadsRepository } from '../repositories/ReviewThreadsRepository.js';
import { reviewCommentsRepository } from '../repositories/ReviewCommentsRepository.js';
import { agentRunsRepository } from '../repositories/AgentRunsRepository.js';
import { changesetsRepository } from '../repositories/ChangeSetsRepository.js';

export async function reviewRoutes(server: FastifyInstance) {
  server.post<{ Params: { id: string } }>(
    '/api/changesets/:id/reviews/threads',
    async (request, reply) => {
      try {
        const body = CreateThreadDTOSchema.parse(request.body);

        const thread = await reviewThreadsRepository.create({
          id: uuidv4(),
          changesetId: request.params.id,
          severity: body.severity,
          anchor: JSON.stringify(body.anchor),
          status: 'open',
        });

        return reply.status(201).send(thread);
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
    }
  );

  server.get<{ Params: { id: string } }>('/api/changesets/:id/reviews/threads', async (request) => {
    return await reviewThreadsRepository.findByChangesetId(request.params.id);
  });

  server.get<{ Params: { id: string; threadId: string } }>(
    '/api/changesets/:id/reviews/threads/:threadId',
    async (request, reply) => {
      const thread = await reviewThreadsRepository.findById(request.params.threadId);

      if (!thread || thread.changesetId !== request.params.id) {
        return reply.status(404).send({
          error: true,
          message: 'Thread not found',
          statusCode: 404,
        });
      }

      return thread;
    }
  );

  server.post<{ Params: { id: string; threadId: string } }>(
    '/api/changesets/:id/reviews/threads/:threadId/resolve',
    async (request, reply) => {
      const thread = await reviewThreadsRepository.findById(request.params.threadId);

      if (!thread || thread.changesetId !== request.params.id) {
        return reply.status(404).send({
          error: true,
          message: 'Thread not found',
          statusCode: 404,
        });
      }

      const updated = await reviewThreadsRepository.resolveThread(request.params.threadId);

      return updated;
    }
  );

  server.post<{ Params: { id: string; threadId: string } }>(
    '/api/changesets/:id/reviews/threads/:threadId/unresolve',
    async (request, reply) => {
      const thread = await reviewThreadsRepository.findById(request.params.threadId);

      if (!thread || thread.changesetId !== request.params.id) {
        return reply.status(404).send({
          error: true,
          message: 'Thread not found',
          statusCode: 404,
        });
      }

      const updated = await reviewThreadsRepository.unresolveThread(request.params.threadId);

      return updated;
    }
  );

  server.post<{ Params: { id: string; threadId: string } }>(
    '/api/changesets/:id/reviews/threads/:threadId/address',
    async (request, reply) => {
      try {
        const body = AddressWithAgentDTOSchema.parse(request.body);

        const thread = await reviewThreadsRepository.findById(request.params.threadId);

        if (!thread || thread.changesetId !== request.params.id) {
          return reply.status(404).send({
            error: true,
            message: 'Thread not found',
            statusCode: 404,
          });
        }

        // Get the changeset to verify it exists and has a worktree
        const changeset = await changesetsRepository.findById(request.params.id);
        if (!changeset) {
          return reply.status(404).send({
            error: true,
            message: 'Changeset not found',
            statusCode: 404,
          });
        }

        // Create agent run for the changeset
        const agentRun = await agentRunsRepository.create({
          id: uuidv4(),
          changesetId: request.params.id,
          agentKey: body.agentKey,
          inputSummary: body.inputSummary,
          inputJson: JSON.stringify({
            prompt: body.prompt,
            threadId: request.params.threadId,
            threadAnchor: thread.anchor,
          }),
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
    }
  );

  server.post<{ Params: { id: string; threadId: string } }>(
    '/api/changesets/:id/reviews/threads/:threadId/comments',
    async (request, reply) => {
      try {
        const body = CreateCommentDTOSchema.parse(request.body);

        const thread = await reviewThreadsRepository.findById(request.params.threadId);

        if (!thread || thread.changesetId !== request.params.id) {
          return reply.status(404).send({
            error: true,
            message: 'Thread not found',
            statusCode: 404,
          });
        }

        const comment = await reviewCommentsRepository.create({
          id: uuidv4(),
          threadId: request.params.threadId,
          body: body.body,
        });

        return reply.status(201).send(comment);
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
    }
  );
}
