import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { importsRepository } from '../repositories/ImportsRepository.js';
import { changesetsRepository } from '../repositories/ChangeSetsRepository.js';
import { targetReposRepository } from '../repositories/TargetReposRepository.js';
import { gitService } from '../services/GitService.js';

export async function importsRoutes(server: FastifyInstance) {
  const createImportSchema = z.object({
    targetRepoId: z.string().uuid(),
  });

  server.post<{ Params: { id: string } }>('/api/changesets/:id/imports', async (request, reply) => {
    try {
      const changeset = await changesetsRepository.findById(request.params.id);

      if (!changeset) {
        return reply.status(404).send({
          error: true,
          message: 'Changeset not found',
        });
      }

      // PLAN: refresh head sha before import
      const sourceHeadSha = gitService.getWorktreeHead(changeset.worktreePath);

      if (!sourceHeadSha) {
        return reply.status(400).send({
          error: true,
          message: 'Cannot import - changeset has no head SHA',
        });
      }

      const body = createImportSchema.parse(request.body);

      const targetRepo = await targetReposRepository.findById(body.targetRepoId);
      if (!targetRepo) {
        return reply.status(404).send({
          error: true,
          message: 'Target repo not found',
        });
      }

      // PLAN: target repo must be clean
      try {
        gitService.ensureCleanWorktree(targetRepo.repoPath);
      } catch (e) {
        return reply.status(409).send({
          error: true,
          message: 'Target repo is not clean',
          details: e instanceof Error ? e.message : String(e),
        });
      }

      const targetBaseSha = gitService.getHeadSha(targetRepo.repoPath);

      const importId = uuidv4();
      const importRecord = await importsRepository.create({
        id: importId,
        changesetId: changeset.id,
        targetRepoId: body.targetRepoId,
        sourceBaseSha: changeset.baseSha,
        sourceHeadSha,
      });

      await importsRepository.update(importId, {
        status: 'running',
        startedAt: new Date(),
        targetBaseSha,
      });

      try {
        const patch = gitService.generatePatch(changeset.baseSha, sourceHeadSha, changeset.worktreePath);

        if (!patch.trim()) {
          const updated = await importsRepository.update(importId, {
            status: 'succeeded',
            targetBaseSha,
            log: 'nothing to import',
            finishedAt: new Date(),
          });

          return reply.status(201).send({
            message: 'Import skipped - no changes',
            import: updated ?? importRecord,
          });
        }

        await gitService.applyPatch(targetRepo.repoPath, patch);

        const commitMessage = `GitVibe import: ${changeset.title} (${changeset.id})`;
        const targetResultSha = gitService.commitChanges(targetRepo.repoPath, commitMessage);

        const updated = await importsRepository.update(importId, {
          status: 'succeeded',
          targetBaseSha,
          targetResultSha,
          log: `Patch applied successfully. Commit: ${targetResultSha}`,
          finishedAt: new Date(),
        });

        await changesetsRepository.update(changeset.id, {
          status: 'completed',
          headSha: sourceHeadSha,
        });

        return reply.status(201).send({
          message: 'Import successful',
          import: updated ?? importRecord,
        });
      } catch (error) {
        const updated = await importsRepository.update(importId, {
          status: 'failed',
          targetBaseSha,
          log: `Failed to apply patch: ${error instanceof Error ? error.message : String(error)}`,
          finishedAt: new Date(),
        });

        return reply.status(500).send({
          error: true,
          message: 'Import failed',
          details: error instanceof Error ? error.message : String(error),
          import: updated ?? importRecord,
        });
      }
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

  server.get<{ Params: { id: string } }>('/api/imports/:id', async (request, reply) => {
    const importRecord = await importsRepository.findById(request.params.id);

    if (!importRecord) {
      return reply.status(404).send({
        error: true,
        message: 'Import not found',
        statusCode: 404,
      });
    }

    return importRecord;
  });

  server.get<{ Params: { id: string } }>('/api/changesets/:id/imports', async (request) => {
    return await importsRepository.findByChangesetId(request.params.id);
  });
}