import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { changesetsRepository } from '../repositories/ChangeSetsRepository.js';
import { projectsRepository } from '../repositories/ProjectsRepository.js';
import { gitService } from '../services/GitService.js';
import { STORAGE_CONFIG } from '../config/storage.js';
import path from 'node:path';

export async function changesetsRoutes(server: FastifyInstance) {
  const createChangesetSchema = z.object({
    projectId: z.string().uuid(),
    title: z.string().min(1),
    body: z.string().optional().or(z.literal('')),
    baseBranch: z.string().min(1),
  });

  server.post('/api/changesets', async (request, reply) => {
    try {
      const body = createChangesetSchema.parse(request.body);

      const project = await projectsRepository.findById(body.projectId);
      if (!project) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      // PLAN: base_sha should come from base_branch (not current HEAD)
      const baseRef = body.baseBranch;
      const baseSha = gitService.getRefSha(project.sourceRepoPath, baseRef);

      const branchName = `gitvibe-${body.projectId}-${Date.now()}`;
      const worktreePath = path.join(STORAGE_CONFIG.worktreesDir, uuidv4());

      // PLAN: create worktree from base_branch
      gitService.createWorktree(project.sourceRepoPath, worktreePath, branchName, baseRef);

      const changeset = await changesetsRepository.create({
        id: uuidv4(),
        projectId: body.projectId,
        title: body.title,
        body: body.body || undefined,
        baseBranch: body.baseBranch,
        baseSha,
        branchName,
        worktreePath,
      });

      return reply.status(201).send(changeset);
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

  server.get('/api/changesets', async (request) => {
    const projectId = (request.query as { projectId?: string }).projectId;
    return await changesetsRepository.findAll(projectId);
  });

  server.get<{ Params: { id: string } }>('/api/changesets/:id', async (request) => {
    const changeset = await changesetsRepository.findById(request.params.id);

    if (!changeset) {
      return {
        error: true,
        message: 'Changeset not found',
        statusCode: 404,
      };
    }

    return changeset;
  });

  server.post<{ Params: { id: string } }>('/api/changesets/:id/refresh', async (request) => {
    const changeset = await changesetsRepository.findById(request.params.id);

    if (!changeset) {
      return {
        error: true,
        message: 'Changeset not found',
        statusCode: 404,
      };
    }

    const headSha = gitService.getWorktreeHead(changeset.worktreePath);
    const updated = await changesetsRepository.update(changeset.id, { headSha });

    return { ...(updated ?? changeset), headSha };
  });

  server.delete<{ Params: { id: string } }>('/api/changesets/:id', async (request, reply) => {
    const changeset = await changesetsRepository.findById(request.params.id);

    if (!changeset) {
      return reply.status(404).send({
        error: true,
        message: 'Changeset not found',
      });
    }

    try {
      const project = await projectsRepository.findById(changeset.projectId);
      if (project) {
        gitService.removeWorktree(changeset.worktreePath, project.sourceRepoPath);
      }

      await changesetsRepository.delete(changeset.id);
      return reply.status(204).send();
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to delete changeset',
      });
    }
  });

  server.post<{ Params: { id: string } }>('/api/changesets/:id/close', async (request, reply) => {
    const changeset = await changesetsRepository.findById(request.params.id);

    if (!changeset) {
      return reply.status(404).send({
        error: true,
        message: 'Changeset not found',
      });
    }

    const updated = await changesetsRepository.update(changeset.id, { status: 'cancelled' });

    return reply.status(200).send(updated);
  });

  server.post<{ Params: { id: string } }>(
    '/api/changesets/:id/remove-worktree',
    async (request, reply) => {
      const changeset = await changesetsRepository.findById(request.params.id);

      if (!changeset) {
        return reply.status(404).send({
          error: true,
          message: 'Changeset not found',
        });
      }

      try {
        const project = await projectsRepository.findById(changeset.projectId);
        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        gitService.removeWorktree(changeset.worktreePath, project.sourceRepoPath);

        return reply.status(200).send({
          success: true,
          message: 'Worktree removed successfully',
        });
      } catch (error) {
        return reply.status(500).send({
          error: true,
          message: 'Failed to remove worktree',
        });
      }
    }
  );
}
