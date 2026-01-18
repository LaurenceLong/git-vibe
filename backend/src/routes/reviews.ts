import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateThreadDTOSchema,
  AddressWithAgentDTOSchema,
  CreateCommentDTOSchema,
  ResolveThreadResponseSchema,
  UnresolveThreadResponseSchema,
} from 'git-vibe-shared';
import { reviewThreadsRepository } from '../repositories/ReviewThreadsRepository.js';
import { reviewCommentsRepository } from '../repositories/ReviewCommentsRepository.js';
import { agentRunsRepository } from '../repositories/AgentRunsRepository.js';
import { pullRequestsRepository } from '../repositories/PullRequestsRepository.js';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { agentService } from '../services/AgentService.js';
import { reviewThreadToDTO, reviewCommentToDTO } from '../mappers/reviews.js';
import { toDTO as agentRunToDTO } from '../mappers/agentRuns.js';

export async function reviewRoutes(server: FastifyInstance) {
  // POST /api/pull-requests/:id/reviews/threads - Create review thread
  server.post<{ Params: { id: string } }>(
    '/api/pull-requests/:id/reviews/threads',
    async (request, reply) => {
      try {
        const body = CreateThreadDTOSchema.parse(request.body);

        const pr = await pullRequestsRepository.findById(request.params.id);
        if (!pr) {
          return reply.status(404).send({
            error: true,
            message: 'Pull request not found',
          });
        }

        const thread = await reviewThreadsRepository.create({
          id: uuidv4(),
          pullRequestId: request.params.id,
          severity: body.severity,
          anchor: JSON.stringify(body.anchor),
          status: 'open',
        });

        return reply.status(201).send(reviewThreadToDTO(thread));
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

  // GET /api/pull-requests/:id/reviews/threads - List review threads
  server.get<{ Params: { id: string } }>(
    '/api/pull-requests/:id/reviews/threads',
    async (request) => {
      const threads = await reviewThreadsRepository.findByPullRequestId(request.params.id);
      return threads.map(reviewThreadToDTO);
    }
  );

  // GET /api/pull-requests/:id/reviews/threads/:threadId - Get review thread
  server.get<{ Params: { id: string; threadId: string } }>(
    '/api/pull-requests/:id/reviews/threads/:threadId',
    async (request, reply) => {
      const thread = await reviewThreadsRepository.findById(request.params.threadId);

      if (!thread || thread.pullRequestId !== request.params.id) {
        return reply.status(404).send({
          error: true,
          message: 'Thread not found',
          statusCode: 404,
        });
      }

      return reviewThreadToDTO(thread);
    }
  );

  // POST /api/pull-requests/:id/reviews/threads/:threadId/resolve - Resolve thread
  server.post<{ Params: { id: string; threadId: string } }>(
    '/api/pull-requests/:id/reviews/threads/:threadId/resolve',
    async (request, reply) => {
      const thread = await reviewThreadsRepository.findById(request.params.threadId);

      if (!thread || thread.pullRequestId !== request.params.id) {
        return reply.status(404).send({
          error: true,
          message: 'Thread not found',
          statusCode: 404,
        });
      }

      const updated = await reviewThreadsRepository.resolveThread(request.params.threadId);

      const response = ResolveThreadResponseSchema.parse(reviewThreadToDTO(updated ?? thread));
      return reply.status(200).send(response);
    }
  );

  // POST /api/pull-requests/:id/reviews/threads/:threadId/unresolve - Unresolve thread
  server.post<{ Params: { id: string; threadId: string } }>(
    '/api/pull-requests/:id/reviews/threads/:threadId/unresolve',
    async (request, reply) => {
      const thread = await reviewThreadsRepository.findById(request.params.threadId);

      if (!thread || thread.pullRequestId !== request.params.id) {
        return reply.status(404).send({
          error: true,
          message: 'Thread not found',
          statusCode: 404,
        });
      }

      const updated = await reviewThreadsRepository.unresolveThread(request.params.threadId);

      const response = UnresolveThreadResponseSchema.parse(reviewThreadToDTO(updated ?? thread));
      return reply.status(200).send(response);
    }
  );

  // POST /api/pull-requests/:id/reviews/threads/:threadId/address - Address with agent
  server.post<{ Params: { id: string; threadId: string } }>(
    '/api/pull-requests/:id/reviews/threads/:threadId/address',
    async (request, reply) => {
      try {
        const body = AddressWithAgentDTOSchema.parse(request.body);

        const thread = await reviewThreadsRepository.findById(request.params.threadId);

        if (!thread || thread.pullRequestId !== request.params.id) {
          return reply.status(404).send({
            error: true,
            message: 'Thread not found',
            statusCode: 404,
          });
        }

        // Get the PR to find the associated WorkItem
        const pr = await pullRequestsRepository.findById(request.params.id);
        if (!pr) {
          return reply.status(404).send({
            error: true,
            message: 'Pull request not found',
            statusCode: 404,
          });
        }

        // Get the WorkItem
        const workItem = await workItemsRepository.findById(pr.workItemId);
        if (!workItem) {
          return reply.status(404).send({
            error: true,
            message: 'WorkItem not found',
            statusCode: 404,
          });
        }

        // Create agent run for the WorkItem to address the review thread
        const agentRun = await agentService.correctWithReviewComments(pr.id, body.prompt);

        return reply.status(201).send(agentRunToDTO(agentRun));
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

  // POST /api/pull-requests/:id/reviews/threads/:threadId/comments - Add comment
  server.post<{ Params: { id: string; threadId: string } }>(
    '/api/pull-requests/:id/reviews/threads/:threadId/comments',
    async (request, reply) => {
      try {
        const body = CreateCommentDTOSchema.parse(request.body);

        const thread = await reviewThreadsRepository.findById(request.params.threadId);

        if (!thread || thread.pullRequestId !== request.params.id) {
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

        return reply.status(201).send(reviewCommentToDTO(comment));
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

  // POST /api/pull-requests/:id/reviews/threads/:threadId/resume - Resume task from review thread
  server.post<{ Params: { id: string; threadId: string }; Body: { prompt: string } }>(
    '/api/pull-requests/:id/reviews/threads/:threadId/resume',
    async (request, reply) => {
      try {
        const { prompt } = request.body;
        if (!prompt) {
          return reply.status(400).send({
            error: true,
            message: 'Prompt is required',
          });
        }

        const thread = await reviewThreadsRepository.findById(request.params.threadId);
        if (!thread || thread.pullRequestId !== request.params.id) {
          return reply.status(404).send({
            error: true,
            message: 'Thread not found',
          });
        }

        // Get the PR to find the associated WorkItem
        const pr = await pullRequestsRepository.findById(request.params.id);
        if (!pr) {
          return reply.status(404).send({
            error: true,
            message: 'Pull request not found',
          });
        }

        // Get the WorkItem
        const workItem = await workItemsRepository.findById(pr.workItemId);
        if (!workItem) {
          return reply.status(404).send({
            error: true,
            message: 'WorkItem not found',
          });
        }

        // Find the most recent agent run for this WorkItem that has a sessionId
        const allAgentRuns = await agentRunsRepository.findByWorkItemId(workItem.id);
        const latestRunWithSession = allAgentRuns
          .filter((run) => run.sessionId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

        if (!latestRunWithSession) {
          return reply.status(400).send({
            error: true,
            message: 'No previous task with session found. Cannot resume.',
          });
        }

        // Resume the task using the same session
        const newAgentRun = await agentService.resumeTask(latestRunWithSession.id, prompt);

        return reply.status(201).send(agentRunToDTO(newAgentRun));
      } catch (error) {
        return reply.status(400).send({
          error: true,
          message: error instanceof Error ? error.message : 'Failed to resume task',
        });
      }
    }
  );
}
