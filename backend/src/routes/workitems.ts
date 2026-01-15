import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { CreateWorkItemDTOSchema, UpdateWorkItemDTOSchema } from 'git-vibe-shared';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { projectsRepository } from '../repositories/ProjectsRepository.js';
import { gitService } from '../services/GitService.js';
import { changesetsRepository } from '../repositories/ChangeSetsRepository.js';

export async function workitemsRoutes(server: FastifyInstance) {
  // POST /api/workitems - Create new WorkItem (task definition only)
  server.post('/api/workitems', async (request, reply) => {
    try {
      const body = CreateWorkItemDTOSchema.parse(request.body);

      // Verify project exists
      const project = await projectsRepository.findById(body.projectId);
      if (!project) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      // Create WorkItem in database (no worktree - Changesets handle workspaces)
      const workItem = await workItemsRepository.create({
        id: uuidv4(),
        projectId: body.projectId,
        type: body.type,
        title: body.title,
        body: body.body,
      });

      return reply.status(201).send(workItem);
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

  // GET /api/workitems - List all WorkItems (with optional project_id filter and pagination)
  server.get<{ Querystring: { projectId?: string; page?: string; limit?: string } }>(
    '/api/workitems',
    async (request) => {
      const { projectId, page: pageStr, limit: limitStr } = request.query;
      const page = parseInt(pageStr || '1', 10);
      const limit = parseInt(limitStr || '10', 10);
      const offset = (page - 1) * limit;

      let allWorkItems;
      if (projectId) {
        allWorkItems = await workItemsRepository.findByProjectId(projectId);
      } else {
        allWorkItems = await workItemsRepository.findAll();
      }

      const total = allWorkItems.length;
      const workItems = allWorkItems.slice(offset, offset + limit);

      return {
        data: workItems,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  );

  // GET /api/workitems/:id - Get WorkItem by ID
  server.get<{ Params: { id: string } }>('/api/workitems/:id', async (request, reply) => {
    const workItem = await workItemsRepository.findById(request.params.id);

    if (!workItem) {
      return reply.status(404).send({
        error: true,
        message: 'WorkItem not found',
      });
    }

    return workItem;
  });

  // PATCH /api/workitems/:id - Update WorkItem
  server.patch<{ Params: { id: string } }>('/api/workitems/:id', async (request, reply) => {
    try {
      const body = UpdateWorkItemDTOSchema.parse(request.body);

      const workItem = await workItemsRepository.findById(request.params.id);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      const updated = await workItemsRepository.update(request.params.id, body);

      return reply.status(200).send(updated);
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

  // DELETE /api/workitems/:id - Delete WorkItem
  server.delete<{ Params: { id: string } }>('/api/workitems/:id', async (request, reply) => {
    const workItem = await workItemsRepository.findById(request.params.id);
    if (!workItem) {
      return reply.status(404).send({
        error: true,
        message: 'WorkItem not found',
      });
    }

    // Delete from database (worktrees are managed by Changesets)
    await workItemsRepository.delete(request.params.id);

    return reply.status(204).send();
  });

  // POST /api/workitems/:id/create-pr - Create PR (ChangeSet) from WorkItem
  server.post<{ Params: { id: string } }>(
    '/api/workitems/:id/create-pr',
    async (request, reply) => {
      const workItem = await workItemsRepository.findById(request.params.id);
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

      // Validate repo
      await gitService.validateRepo(project.sourceRepoPath);

      // Get base branch SHA from relay repo
      const baseBranch = project.defaultBranch;
      const baseSha = gitService.getRefSha(
        project.relayRepoPath || project.sourceRepoPath,
        baseBranch
      );

      // Generate branch name and worktree path
      const branchName = `pr/${uuidv4()}`;
      const worktreePath = `${project.relayRepoPath || project.sourceRepoPath}-worktrees/${branchName}`;

      // Create worktree and branch from relay repo
      gitService.createWorktree(
        project.relayRepoPath || project.sourceRepoPath,
        worktreePath,
        branchName,
        baseSha
      );

      // Get initial head SHA (same as baseSha initially)
      const headSha = gitService.getWorktreeHead(worktreePath);

      // Create ChangeSet (PR) with workspace
      const changeset = await changesetsRepository.create({
        id: uuidv4(),
        projectId: workItem.projectId,
        workItemId: workItem.id,
        title: workItem.title,
        body: workItem.body || undefined,
        status: 'active',
        prStatus: 'open',
        baseBranch,
        baseSha,
        branchName,
        headSha,
        worktreePath,
      });

      return reply.status(201).send(changeset);
    }
  );

  // GET /api/workitems/:id/prs - Get PRs for WorkItem
  server.get<{ Params: { id: string } }>('/api/workitems/:id/prs', async (request, reply) => {
    const workItem = await workItemsRepository.findById(request.params.id);
    if (!workItem) {
      return reply.status(404).send({
        error: true,
        message: 'WorkItem not found',
      });
    }

    const prs = await workItemsRepository.getChangeSetsByWorkItemId(request.params.id);
    return prs;
  });
}
