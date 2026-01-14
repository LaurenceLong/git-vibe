import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { targetReposRepository } from '../repositories/TargetReposRepository.js';
import { gitService } from '../services/GitService.js';

export async function targetReposRoutes(server: FastifyInstance) {
  const createTargetRepoSchema = z.object({
    name: z.string().min(1),
    repoPath: z.string().min(1),
  });

  server.post('/api/target-repos', async (request, reply) => {
    try {
      const body = createTargetRepoSchema.parse(request.body);

      await gitService.validateRepo(body.repoPath);

      const defaultBranch = gitService.getDefaultBranch(body.repoPath);

      const targetRepo = await targetReposRepository.create({
        id: uuidv4(),
        name: body.name,
        repoPath: body.repoPath,
        defaultBranch,
      });

      return reply.status(201).send(targetRepo);
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

  server.get('/api/target-repos', async () => {
    return await targetReposRepository.findAll();
  });

  server.get<{ Params: { id: string } }>('/api/target-repos/:id', async (request) => {
    const targetRepo = await targetReposRepository.findById(request.params.id);

    if (!targetRepo) {
      return {
        error: true,
        message: 'Target repo not found',
        statusCode: 404,
      };
    }

    return targetRepo;
  });
}
