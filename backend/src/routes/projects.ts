import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateProjectDTOSchema,
  UpdateProjectDTOSchema,
  CreateWorkItemDTOSchema,
  ModelsResponseSchema,
  FilesResponseSchema,
  FileContentResponseSchema,
  BranchesResponseSchema,
  SyncResponseSchema,
  DeleteProjectResponseSchema,
  AgentKeySchema,
  AgentParamsSchema,
} from 'git-vibe-shared';
import { projectsRepository } from '../repositories/ProjectsRepository.js';
import { changesetsRepository } from '../repositories/ChangeSetsRepository.js';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { gitService } from '../services/GitService.js';
import { openCodeAgentAdapter } from '../services/OpenCodeAgentAdapter.js';
import { STORAGE_CONFIG } from '../config/storage.js';
import { cleanupDirectory } from '../utils/storage.js';
import path from 'node:path';
import fs from 'node:fs/promises';

export async function projectsRoutes(server: FastifyInstance) {
  server.post('/api/projects', async (request, reply) => {
    try {
      const body = CreateProjectDTOSchema.parse(request.body);

      // Check if project name already exists
      const existingProject = await projectsRepository.findByName(body.name);
      if (existingProject) {
        return reply.status(400).send({
          error: true,
          message: 'Project name already exists',
        });
      }

      await gitService.validateRepo(body.sourceRepoPath);

      // Use provided defaultBranch or auto-detect from source repo
      const defaultBranch = body.defaultBranch || gitService.getDefaultBranch(body.sourceRepoPath);

      // Create relay repo path
      const relayRepoPath = path.join(STORAGE_CONFIG.projectsDir, body.name);

      // Create relay repo by copying .git directory and resetting
      await gitService.createRelayRepo(body.sourceRepoPath, relayRepoPath, defaultBranch);

      const project = await projectsRepository.create({
        id: uuidv4(),
        name: body.name,
        sourceRepoPath: body.sourceRepoPath,
        sourceRepoUrl: body.sourceRepoUrl || undefined,
        relayRepoPath,
        defaultBranch,
        defaultAgent: body.defaultAgent || 'opencode',
        agentParams: body.agentParams ? JSON.stringify(body.agentParams) : undefined,
      });

      return reply.status(201).send(project);
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

  server.get<{ Querystring: { page?: string; limit?: string } }>(
    '/api/projects',
    async (request) => {
      const page = parseInt(request.query.page || '1', 10);
      const limit = parseInt(request.query.limit || '10', 10);
      const offset = (page - 1) * limit;

      const allProjects = await projectsRepository.findAll();
      const total = allProjects.length;
      const projects = allProjects.slice(offset, offset + limit);

      return {
        data: projects,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  );

  server.get<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const project = await projectsRepository.findById(request.params.id);

    if (!project) {
      return reply.status(404).send({
        error: true,
        message: 'Project not found',
      });
    }

    return project;
  });

  server.get<{ Params: { name: string } }>('/api/projects/name/:name', async (request, reply) => {
    const project = await projectsRepository.findByName(request.params.name);

    if (!project) {
      return reply.status(404).send({
        error: true,
        message: 'Project not found',
      });
    }

    return project;
  });

  server.patch<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    try {
      const body = UpdateProjectDTOSchema.parse(request.body);
      const projectId = request.params.id;

      const existingProject = await projectsRepository.findById(projectId);
      if (!existingProject) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      const updatedProject = await projectsRepository.update(projectId, {
        name: body.name,
        sourceRepoUrl: body.sourceRepoUrl || undefined,
        defaultAgent: body.defaultAgent,
        agentParams: body.agentParams ? JSON.stringify(body.agentParams) : undefined,
      });

      return reply.status(200).send(updatedProject);
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

  server.get('/api/models', async (request, reply) => {
    try {
      const models = await openCodeAgentAdapter.getModels();
      return reply.status(200).send({
        data: models,
      });
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to fetch models',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.get<{ Querystring: { repoPath?: string } }>('/api/branches', async (request, reply) => {
    try {
      const { repoPath } = request.query;
      if (!repoPath) {
        return reply.status(400).send({
          error: true,
          message: 'repoPath query parameter is required',
        });
      }

      await gitService.validateRepo(repoPath);

      const branches = gitService.listBranches(repoPath);
      const defaultBranch = gitService.getDefaultBranch(repoPath);

      return reply.status(200).send({
        data: branches,
        defaultBranch,
      });
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to fetch branches',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.get<{ Params: { id: string } }>('/api/projects/:id/files', async (request, reply) => {
    try {
      const project = await projectsRepository.findById(request.params.id);

      if (!project) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      const files = await gitService.listFiles(project.relayRepoPath);

      return reply.status(200).send({
        data: files,
      });
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to list files',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.get<{ Params: { id: string } }>('/api/projects/:id/files/content', async (request, reply) => {
    try {
      const project = await projectsRepository.findById(request.params.id);

      if (!project) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      const filePath = (request.query as { path?: string }).path;
      if (!filePath) {
        return reply.status(400).send({
          error: true,
          message: 'File path is required',
        });
      }

      const content = await gitService.getFileContent(project.relayRepoPath, filePath);

      return reply.status(200).send({
        data: {
          path: filePath,
          content,
        },
      });
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to read file',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.post<{ Params: { id: string } }>('/api/projects/:id/sync', async (request, reply) => {
    try {
      const project = await projectsRepository.findById(request.params.id);

      if (!project) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      await gitService.syncRelayToSource(project.relayRepoPath, project.sourceRepoPath, project.name);

      // Update syncedAt for all merged changesets that haven't been synced yet
      const allChangesets = await changesetsRepository.findAll(project.id);
      for (const changeset of allChangesets) {
        if (changeset.prStatus === 'merged' && !changeset.syncedAt) {
          await changesetsRepository.update(changeset.id, { syncedAt: new Date() });
        }
      }

      return reply.status(200).send({
        success: true,
        message: 'Synced relay repo to source repo',
      });
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Sync failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.post<{ Params: { id: string } }>(
    '/api/projects/:id/workitems',
    async (request, reply) => {
      try {
        const body = CreateWorkItemDTOSchema.parse(request.body);
        const projectId = request.params.id;

        // Verify project exists
        const project = await projectsRepository.findById(projectId);
        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        // Create WorkItem in database
        const workItem = await workItemsRepository.create({
          id: uuidv4(),
          projectId,
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
    }
  );

  server.delete<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    try {
      const project = await projectsRepository.findById(request.params.id);

      if (!project) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      // Clean up the relay repo directory
      const relayRepoPath = project.relayRepoPath;
      try {
        await fs.access(relayRepoPath);
        await cleanupDirectory(relayRepoPath);
      } catch (error) {
        // Directory doesn't exist or can't be accessed, continue with deletion
        console.warn(`Could not clean up relay repo at ${relayRepoPath}:`, error);
      }

      // Clean up worktrees associated with this project
      const worktreesDir = path.join(STORAGE_CONFIG.worktreesDir, project.name);
      try {
        await fs.access(worktreesDir);
        await cleanupDirectory(worktreesDir);
      } catch (error) {
        // Directory doesn't exist or can't be accessed, continue with deletion
        console.warn(`Could not clean up worktrees at ${worktreesDir}:`, error);
      }

      // Delete the project from database (cascade will handle related records)
      await projectsRepository.delete(request.params.id);

      return reply.status(204).send();
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to delete project',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
