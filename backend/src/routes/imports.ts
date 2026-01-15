import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { CreateImportDTOSchema, ImportResponseSchema } from 'git-vibe-shared';
import { importsRepository } from '../repositories/ImportsRepository.js';
import { pullRequestsRepository } from '../repositories/PullRequestsRepository.js';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { projectsRepository } from '../repositories/ProjectsRepository.js';
import { targetReposRepository } from '../repositories/TargetReposRepository.js';
import { gitService } from '../services/GitService.js';

export async function importsRoutes(server: FastifyInstance) {
  // POST /api/pull-requests/:id/imports - Create import
  server.post<{ Params: { id: string } }>(
    '/api/pull-requests/:id/imports',
    async (request, reply) => {
      try {
        const pr = await pullRequestsRepository.findById(request.params.id);

        if (!pr) {
          return reply.status(404).send({
            error: true,
            message: 'Pull request not found',
          });
        }

        // Get WorkItem for this PR
        const workItem = await workItemsRepository.findById(pr.workItemId);
        if (!workItem) {
          return reply.status(404).send({
            error: true,
            message: 'WorkItem not found',
          });
        }

        // Get project
        const project = await projectsRepository.findById(workItem.projectId);
        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        // Refresh head sha before import
        const sourceHeadSha = gitService.getWorktreeHead(workItem.worktreePath || '');

        if (!sourceHeadSha) {
          return reply.status(400).send({
            error: true,
            message: 'Cannot import - WorkItem has no head SHA',
          });
        }

        const body = CreateImportDTOSchema.parse(request.body);

        const targetRepo = await targetReposRepository.findById(body.targetRepoId);
        if (!targetRepo) {
          return reply.status(404).send({
            error: true,
            message: 'Target repo not found',
          });
        }

        // Target repo must be clean
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
          pullRequestId: pr.id,
          targetRepoId: body.targetRepoId,
          sourceBaseSha: workItem.baseSha || '',
          sourceHeadSha,
        });

        await importsRepository.update(importId, {
          status: 'running',
          startedAt: new Date(),
          targetBaseSha,
        });

        try {
          const patch = gitService.generatePatch(
            workItem.baseSha || '',
            sourceHeadSha,
            workItem.worktreePath || ''
          );

          if (!patch.trim()) {
            const updated = await importsRepository.update(importId, {
              status: 'succeeded',
              targetBaseSha,
              log: 'nothing to import',
              finishedAt: new Date(),
            });

            const response = ImportResponseSchema.parse({
              message: 'Import skipped - no changes',
              import: updated ?? importRecord,
            });
            return reply.status(201).send(response);
          }

          await gitService.applyPatch(targetRepo.repoPath, patch);

          const commitMessage = `GitVibe import: ${pr.title} (${pr.id})`;
          const targetResultSha = gitService.commitChanges(targetRepo.repoPath, commitMessage);

          const updated = await importsRepository.update(importId, {
            status: 'succeeded',
            targetBaseSha,
            targetResultSha,
            log: `Patch applied successfully. Commit: ${targetResultSha}`,
            finishedAt: new Date(),
          });

          // Update PR status to completed
          await pullRequestsRepository.update(pr.id, {
            status: 'merged',
          });

          const response = ImportResponseSchema.parse({
            message: 'Import successful',
            import: updated ?? importRecord,
          });
          return reply.status(201).send(response);
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
    }
  );

  // GET /api/imports/:id - Get import by ID
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

  // GET /api/pull-requests/:id/imports - List imports for PR
  server.get<{ Params: { id: string } }>('/api/pull-requests/:id/imports', async (request) => {
    return await importsRepository.findByPullRequestId(request.params.id);
  });
}
