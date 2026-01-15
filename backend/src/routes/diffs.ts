import type { FastifyInstance } from 'fastify';
import { DiffResponseSchema } from 'git-vibe-shared';
import { changesetsRepository } from '../repositories/ChangeSetsRepository.js';
import { gitService } from '../services/GitService.js';

export async function diffsRoutes(server: FastifyInstance) {
  server.get<{ Params: { id: string } }>('/api/changesets/:id/diff', async (request, reply) => {
    const changeset = await changesetsRepository.findById(request.params.id);

    if (!changeset) {
      return reply.status(404).send({
        error: true,
        message: 'Changeset not found',
      });
    }

    if (!changeset.headSha) {
      const response = DiffResponseSchema.parse({
        diff: '',
        baseSha: changeset.baseSha,
        headSha: changeset.headSha || '',
      });
      return response;
    }

    try {
      const diff = gitService.getDiff(changeset.baseSha, changeset.headSha, changeset.worktreePath);
      const response = DiffResponseSchema.parse({
        diff,
        baseSha: changeset.baseSha,
        headSha: changeset.headSha,
      });
      return response;
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to generate diff',
      });
    }
  });
}
