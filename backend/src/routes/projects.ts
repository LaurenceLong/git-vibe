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
  CreateFileDTOSchema,
  UpdateFileDTOSchema,
  CommitChangesDTOSchema,
  GetOrCreateManualWorkItemDTOSchema,
  ProjectsListResponseSchema,
  ProjectStatsSchema,
  WORKITEM_STATUS_OPEN,
  PR_STATUS_OPEN,
  PR_STATUS_MERGED,
} from 'git-vibe-shared';
import { projectsRepository } from '../repositories/ProjectsRepository.js';
import { settingsRepository } from '../repositories/SettingsRepository.js';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { pullRequestsRepository } from '../repositories/PullRequestsRepository.js';
import { gitService } from '../services/git/GitService.js';
import { modelsCache } from '../services/ModelsCache.js';
import { workspaceService } from '../services/WorkspaceService.js';
import { prService } from '../services/PRService.js';
import { STORAGE_CONFIG } from '../config/storage.js';
import { cleanupDirectory } from '../utils/storage.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { toDTO as projectToDTO } from '../mappers/projects.js';
import { toDTO as workItemToDTO } from '../mappers/workItems.js';
import { toDTO as pullRequestToDTO } from '../mappers/pullRequests.js';

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

      // Use provided defaultBranch or auto-detect current active branch from source repo
      const defaultBranch = body.defaultBranch || gitService.getCurrentBranch(body.sourceRepoPath);

      // Auto-detect sourceRepoUrl from git remote if not provided
      const sourceRepoUrl =
        body.sourceRepoUrl || gitService.getRemoteUrl(body.sourceRepoPath) || undefined;

      // Determine mirror repo path (shared by projects with same source path)
      const mirrorRepoPath = gitService.getMirrorRepoPath(body.sourceRepoPath);

      // Create relay repo path
      const relayRepoPath = path.join(STORAGE_CONFIG.projectsDir, body.name);

      // Create relay repo using mirror repo architecture
      const projectId = uuidv4();
      await gitService.createRelayRepo(
        body.sourceRepoPath,
        relayRepoPath,
        mirrorRepoPath,
        projectId,
        defaultBranch
      );

      // Use global default settings when project does not specify defaultAgent/agentParams
      let defaultAgent = body.defaultAgent;
      let agentParams = body.agentParams;
      if (defaultAgent === undefined || agentParams === undefined) {
        const globalSettings = await settingsRepository.getGlobalSettings();
        if (defaultAgent === undefined)
          defaultAgent = globalSettings.defaultAgent as 'opencode' | 'claudecode';
        if (agentParams === undefined) {
          try {
            agentParams = JSON.parse(globalSettings.defaultAgentParams || '{}') as Record<
              string,
              unknown
            >;
          } catch {
            agentParams = {};
          }
        }
      }

      const project = await projectsRepository.create({
        id: projectId,
        name: body.name,
        sourceRepoPath: body.sourceRepoPath,
        sourceRepoUrl,
        mirrorRepoPath,
        relayRepoPath,
        defaultBranch,
        defaultAgent: defaultAgent || 'opencode',
        agentParams:
          agentParams && Object.keys(agentParams).length > 0
            ? JSON.stringify(agentParams)
            : undefined,
      });

      return reply.status(201).send(projectToDTO(project));
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

  server.get<{ Querystring: { page?: string; limit?: string; includeStats?: string } }>(
    '/api/projects',
    async (request) => {
      const page = parseInt(request.query.page || '1', 10);
      const limit = parseInt(request.query.limit || '10', 10);
      const includeStats = request.query.includeStats === 'true';
      const offset = (page - 1) * limit;

      const allProjects = await projectsRepository.findAll();
      const total = allProjects.length;
      const projects = allProjects.slice(offset, offset + limit);

      let statistics: Record<string, z.infer<typeof ProjectStatsSchema>> | undefined;

      if (includeStats && projects.length > 0) {
        const projectIds = projects.map((p) => p.id);
        const allWorkItems = await workItemsRepository.findAll();
        const allPullRequests = await pullRequestsRepository.findAll();
        const relevantWorkItems = allWorkItems.filter((wi) => projectIds.includes(wi.projectId));
        const relevantPullRequests = allPullRequests.filter((pr) =>
          projectIds.includes(pr.projectId)
        );

        const statsMap: Record<string, z.infer<typeof ProjectStatsSchema>> = {};
        for (const projectId of projectIds) {
          const projectWorkItems = relevantWorkItems.filter((wi) => wi.projectId === projectId);
          const projectPullRequests = relevantPullRequests.filter(
            (pr) => pr.projectId === projectId
          );
          statsMap[projectId] = ProjectStatsSchema.parse({
            workItems: projectWorkItems.length,
            openWorkItems: projectWorkItems.filter((wi) => wi.status === WORKITEM_STATUS_OPEN)
              .length,
            pullRequests: projectPullRequests.length,
            openPullRequests: projectPullRequests.filter((pr) => pr.status === PR_STATUS_OPEN)
              .length,
          });
        }
        statistics = statsMap;
      }

      const payload = {
        data: projects.map(projectToDTO),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        ...(statistics != null && { statistics }),
      };
      return ProjectsListResponseSchema.parse(payload);
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

    return projectToDTO(project);
  });

  server.get<{ Params: { name: string } }>('/api/projects/name/:name', async (request, reply) => {
    const project = await projectsRepository.findByName(request.params.name);

    if (!project) {
      return reply.status(404).send({
        error: true,
        message: 'Project not found',
      });
    }

    return projectToDTO(project);
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

      if (!updatedProject) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      return reply.status(200).send(projectToDTO(updatedProject));
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

  server.get<{ Querystring: { agent?: string } }>('/api/models', async (request, reply) => {
    try {
      const { agent = 'opencode' } = request.query;

      // Validate agent parameter
      if (agent !== 'opencode' && agent !== 'claudecode') {
        return reply.status(400).send({
          error: true,
          message: 'Invalid agent parameter. Must be "opencode" or "claudecode"',
        });
      }

      // Initialize cache for the agent if not already initialized
      await modelsCache.initialize(agent as 'opencode' | 'claudecode');

      // Get models from cache
      const models = modelsCache.getModels(agent as 'opencode' | 'claudecode');
      const response = ModelsResponseSchema.parse({ data: models });
      return reply.status(200).send(response);
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to fetch models',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.post<{ Querystring: { agent?: string } }>(
    '/api/models/refresh',
    async (request, reply) => {
      try {
        const { agent = 'opencode' } = request.query;

        // Validate agent parameter
        if (agent !== 'opencode' && agent !== 'claudecode') {
          return reply.status(400).send({
            error: true,
            message: 'Invalid agent parameter. Must be "opencode" or "claudecode"',
          });
        }

        // Force refresh the models cache for the specific agent
        await modelsCache.refresh(agent as 'opencode' | 'claudecode');
        const models = modelsCache.getModels(agent as 'opencode' | 'claudecode');
        const response = ModelsResponseSchema.parse({ data: models });
        return reply.status(200).send(response);
      } catch (error) {
        return reply.status(500).send({
          error: true,
          message: 'Failed to refresh models',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

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
      const currentBranch = gitService.getCurrentBranch(repoPath);

      const response = BranchesResponseSchema.parse({
        data: branches,
        defaultBranch: currentBranch,
        currentBranch,
      });
      return reply.status(200).send(response);
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

      const response = FilesResponseSchema.parse({ data: files });
      return reply.status(200).send(response);
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to list files',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.get<{ Params: { id: string } }>(
    '/api/projects/:id/files/content',
    async (request, reply) => {
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

        const response = FileContentResponseSchema.parse({
          data: {
            path: filePath,
            content,
          },
        });
        return reply.status(200).send(response);
      } catch (error) {
        return reply.status(500).send({
          error: true,
          message: 'Failed to read file',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  server.post<{ Params: { id: string } }>('/api/projects/:id/sync', async (request, reply) => {
    try {
      const project = await projectsRepository.findById(request.params.id);

      if (!project) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      const syncCommitSha = await gitService.syncRelayToSource(
        project.relayRepoPath,
        project.sourceRepoPath,
        project.mirrorRepoPath,
        project.id
      );

      // Get the commit SHA to use for marking PRs as synced
      // If a new commit was created, use that SHA; otherwise use current HEAD of relay branch
      // (if no changes, it means everything is already synced)
      // Use default branch for commit SHA (relay has been merged into default)
      const commitShaToUse =
        syncCommitSha || gitService.getRefSha(project.sourceRepoPath, project.defaultBranch);

      // Mark all merged PRs as synced
      const mergedPRs = await pullRequestsRepository.findByProjectId(project.id);
      const unsyncedMergedPRs = mergedPRs.filter(
        (pr) => pr.status === PR_STATUS_MERGED && !pr.syncedCommitSha
      );

      // Update all unsynced merged PRs with the sync commit SHA
      if (unsyncedMergedPRs.length > 0) {
        for (const pr of unsyncedMergedPRs) {
          await pullRequestsRepository.update(pr.id, {
            syncedCommitSha: commitShaToUse,
          });
        }
        request.log.info(
          `Marked ${unsyncedMergedPRs.length} PR(s) as synced with commit ${commitShaToUse}`
        );
      }

      const response = SyncResponseSchema.parse({
        success: true,
        message: 'Synced relay repo to source repo',
      });
      return reply.status(200).send(response);
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Sync failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.post<{ Params: { id: string } }>('/api/projects/:id/workitems', async (request, reply) => {
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

      return reply.status(201).send(workItemToDTO(workItem));
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

  // ============================================================================
  // Manual File Operations with WorkItem
  // ============================================================================

  /**
   * Get or create a manual WorkItem for the current user session
   * All manual file operations should use the same WorkItem
   * Ensures idempotency - returns existing WorkItem if found
   */
  server.post<{ Params: { id: string } }>(
    '/api/projects/:id/work-items/manual',
    async (request, reply) => {
      try {
        const body = GetOrCreateManualWorkItemDTOSchema.parse(request.body);
        const project = await projectsRepository.findById(request.params.id);

        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        // Look for existing open manual WorkItem for this project
        // Use a more specific identifier to avoid conflicts
        const existingWorkItems = await workItemsRepository.findByProjectId(project.id);
        const existingManualWorkItem = existingWorkItems.find(
          (wi) =>
            wi.status === WORKITEM_STATUS_OPEN &&
            (wi.title === 'Manual edit session' ||
              wi.title.startsWith('Manual edit session') ||
              (body.title && wi.title === body.title))
        );

        if (existingManualWorkItem) {
          // Ensure workspace is initialized for existing WorkItem
          await workspaceService.ensureWorkspace(existingManualWorkItem, project);
          // Fetch updated WorkItem from repository
          const updatedWorkItem = await workItemsRepository.findById(existingManualWorkItem.id);
          if (!updatedWorkItem) {
            return reply.status(404).send({
              error: true,
              message: 'WorkItem not found',
            });
          }
          return reply.status(200).send(workItemToDTO(updatedWorkItem));
        }

        // Create new manual WorkItem
        const workItem = await workItemsRepository.create({
          id: uuidv4(),
          projectId: project.id,
          type: 'feature-request',
          title: body.title || 'Manual edit session',
          body: 'Manual file editing session',
        });

        // Initialize workspace for the WorkItem
        await workspaceService.initWorkspace(workItem.id, project);
        // Fetch updated WorkItem from repository
        const updatedWorkItem = await workItemsRepository.findById(workItem.id);
        if (!updatedWorkItem) {
          return reply.status(404).send({
            error: true,
            message: 'WorkItem not found',
          });
        }

        return reply.status(201).send(workItemToDTO(updatedWorkItem));
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

  /**
   * Get files from WorkItem's worktree
   */
  server.get<{ Params: { id: string; workItemId: string } }>(
    '/api/projects/:id/work-items/:workItemId/files',
    async (request, reply) => {
      try {
        const project = await projectsRepository.findById(request.params.id);

        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        const workItem = await workItemsRepository.findById(request.params.workItemId);

        if (!workItem) {
          return reply.status(404).send({
            error: true,
            message: 'WorkItem not found',
          });
        }

        // Ensure workspace is initialized
        const updatedWorkItem = await workspaceService.ensureWorkspace(workItem, project);

        if (!updatedWorkItem.worktreePath) {
          return reply.status(400).send({
            error: true,
            message: 'WorkItem workspace is not initialized',
          });
        }

        const files = await gitService.listFiles(updatedWorkItem.worktreePath);

        const response = FilesResponseSchema.parse({ data: files });
        return reply.status(200).send(response);
      } catch (error) {
        return reply.status(500).send({
          error: true,
          message: 'Failed to list files',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Get file content from WorkItem's worktree
   */
  server.get<{ Params: { id: string; workItemId: string }; Querystring: { path: string } }>(
    '/api/projects/:id/work-items/:workItemId/files/content',
    async (request, reply) => {
      try {
        const { path: filePath } = request.query;
        const project = await projectsRepository.findById(request.params.id);

        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        const workItem = await workItemsRepository.findById(request.params.workItemId);

        if (!workItem) {
          return reply.status(404).send({
            error: true,
            message: 'WorkItem not found',
          });
        }

        if (!filePath) {
          return reply.status(400).send({
            error: true,
            message: 'File path is required',
          });
        }

        // Ensure workspace is initialized
        const updatedWorkItem = await workspaceService.ensureWorkspace(workItem, project);

        if (!updatedWorkItem.worktreePath) {
          return reply.status(400).send({
            error: true,
            message: 'WorkItem workspace is not initialized',
          });
        }

        // Check if file is binary or empty
        const fullPath = path.join(updatedWorkItem.worktreePath, filePath);
        const stats = await fs.stat(fullPath);
        const isBinary = await (async () => {
          try {
            const content = await fs.readFile(fullPath, { encoding: 'utf-8' });
            // Check for null bytes or other control characters (binary-ish)
            for (let i = 0; i < content.length; i++) {
              const code = content.charCodeAt(i);
              if (code === 0) return true; // NUL
              if (code < 9) return true; // C0 controls below tab
              if (code > 13 && code < 32) return true; // C0 controls excluding \t,\n,\r
            }
            return false;
          } catch {
            return true;
          }
        })();

        if (isBinary) {
          return reply.status(200).send({
            data: {
              path: filePath,
              content: null,
              isBinary: true,
              size: stats.size,
            },
          });
        }

        const content = await gitService.getFileContent(updatedWorkItem.worktreePath, filePath);

        const response = FileContentResponseSchema.parse({
          data: {
            path: filePath,
            content,
            isBinary: false,
            size: stats.size,
          },
        });
        return reply.status(200).send(response);
      } catch (error) {
        return reply.status(500).send({
          error: true,
          message: 'Failed to read file',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Create a new file in the WorkItem's worktree
   * Auto-commits with a sensible commit message
   */
  server.post<{ Params: { id: string; workItemId: string } }>(
    '/api/projects/:id/work-items/:workItemId/files',
    async (request, reply) => {
      try {
        const body = CreateFileDTOSchema.parse(request.body);
        const project = await projectsRepository.findById(request.params.id);

        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        const workItem = await workItemsRepository.findById(request.params.workItemId);

        if (!workItem) {
          return reply.status(404).send({
            error: true,
            message: 'WorkItem not found',
          });
        }

        // Ensure workspace is initialized
        const updatedWorkItem = await workspaceService.ensureWorkspace(workItem, project);

        if (!updatedWorkItem.worktreePath) {
          return reply.status(400).send({
            error: true,
            message: 'WorkItem workspace is not initialized',
          });
        }

        // Validate path (prevent directory traversal)
        if (body.path.includes('..') || path.isAbsolute(body.path)) {
          return reply.status(400).send({
            error: true,
            message: 'Invalid file path',
          });
        }

        // Create the file in the worktree
        const filePath = path.join(updatedWorkItem.worktreePath, body.path);
        const dirPath = path.dirname(filePath);

        // Create directory if it doesn't exist
        await fs.mkdir(dirPath, { recursive: true });
        await fs.writeFile(filePath, body.content, 'utf-8');

        // Auto-commit with sensible message
        const commitMessage = `Add ${body.path}`;
        const commitSha = gitService.commitChanges(updatedWorkItem.worktreePath, commitMessage);

        // Update WorkItem with new head SHA
        await workItemsRepository.update(updatedWorkItem.id, {
          headSha: commitSha,
        });

        return reply.status(201).send({
          success: true,
          message: 'File created successfully',
          path: body.path,
          commitSha,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: true,
            message: 'Validation failed',
            details: error.errors,
          });
        }

        return reply.status(500).send({
          error: true,
          message: 'Failed to create file',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Update an existing file in the WorkItem's worktree
   * Auto-commits with a sensible commit message
   */
  server.put<{ Params: { id: string; workItemId: string } }>(
    '/api/projects/:id/work-items/:workItemId/files',
    async (request, reply) => {
      try {
        const body = UpdateFileDTOSchema.parse(request.body);
        const project = await projectsRepository.findById(request.params.id);

        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        const workItem = await workItemsRepository.findById(request.params.workItemId);

        if (!workItem) {
          return reply.status(404).send({
            error: true,
            message: 'WorkItem not found',
          });
        }

        // Ensure workspace is initialized
        const updatedWorkItem = await workspaceService.ensureWorkspace(workItem, project);

        if (!updatedWorkItem.worktreePath) {
          return reply.status(400).send({
            error: true,
            message: 'WorkItem workspace is not initialized',
          });
        }

        // Validate path
        if (body.path.includes('..') || path.isAbsolute(body.path)) {
          return reply.status(400).send({
            error: true,
            message: 'Invalid file path',
          });
        }

        // Check if file exists
        const filePath = path.join(updatedWorkItem.worktreePath, body.path);
        try {
          await fs.access(filePath);
        } catch {
          return reply.status(404).send({
            error: true,
            message: 'File not found',
          });
        }

        // Update the file in the worktree
        await fs.writeFile(filePath, body.content, 'utf-8');

        // Auto-commit with sensible message
        const commitMessage = `Update ${body.path}`;
        const commitSha = gitService.commitChanges(updatedWorkItem.worktreePath, commitMessage);

        // Update WorkItem with new head SHA
        await workItemsRepository.update(updatedWorkItem.id, {
          headSha: commitSha,
        });

        return reply.status(200).send({
          success: true,
          message: 'File updated successfully',
          path: body.path,
          commitSha,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: true,
            message: 'Validation failed',
            details: error.errors,
          });
        }

        return reply.status(500).send({
          error: true,
          message: 'Failed to update file',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Delete a file in the WorkItem's worktree
   * Auto-commits with a sensible commit message
   */
  server.delete<{ Params: { id: string; workItemId: string }; Querystring: { path: string } }>(
    '/api/projects/:id/work-items/:workItemId/files',
    async (request, reply) => {
      try {
        const { path: filePath } = request.query;
        const project = await projectsRepository.findById(request.params.id);

        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        const workItem = await workItemsRepository.findById(request.params.workItemId);

        if (!workItem) {
          return reply.status(404).send({
            error: true,
            message: 'WorkItem not found',
          });
        }

        if (!filePath) {
          return reply.status(400).send({
            error: true,
            message: 'File path is required',
          });
        }

        // Validate path
        if (filePath.includes('..') || path.isAbsolute(filePath)) {
          return reply.status(400).send({
            error: true,
            message: 'Invalid file path',
          });
        }

        // Ensure workspace is initialized
        const updatedWorkItem = await workspaceService.ensureWorkspace(workItem, project);

        if (!updatedWorkItem.worktreePath) {
          return reply.status(400).send({
            error: true,
            message: 'WorkItem workspace is not initialized',
          });
        }

        // Check if file exists
        const fullPath = path.join(updatedWorkItem.worktreePath, filePath);
        try {
          await fs.access(fullPath);
        } catch {
          return reply.status(404).send({
            error: true,
            message: 'File not found',
          });
        }

        // Delete the file in the worktree
        await fs.unlink(fullPath);

        // Auto-commit with sensible message
        const commitMessage = `Delete ${filePath}`;
        const commitSha = gitService.commitChanges(updatedWorkItem.worktreePath, commitMessage);

        // Update WorkItem with new head SHA
        await workItemsRepository.update(updatedWorkItem.id, {
          headSha: commitSha,
        });

        return reply.status(200).send({
          success: true,
          message: 'File deleted successfully',
          path: filePath,
          commitSha,
        });
      } catch (error) {
        return reply.status(500).send({
          error: true,
          message: 'Failed to delete file',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Commit changes in the WorkItem's worktree
   */
  server.post<{ Params: { id: string; workItemId: string } }>(
    '/api/projects/:id/work-items/:workItemId/commit',
    async (request, reply) => {
      try {
        const body = CommitChangesDTOSchema.parse(request.body);
        const project = await projectsRepository.findById(request.params.id);

        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        const workItem = await workItemsRepository.findById(request.params.workItemId);

        if (!workItem) {
          return reply.status(404).send({
            error: true,
            message: 'WorkItem not found',
          });
        }

        // Ensure workspace is initialized
        const updatedWorkItem = await workspaceService.ensureWorkspace(workItem, project);

        if (!updatedWorkItem.worktreePath) {
          return reply.status(400).send({
            error: true,
            message: 'WorkItem workspace is not initialized',
          });
        }

        // Check if there are any changes to commit
        if (!gitService.hasAnyChanges(updatedWorkItem.worktreePath)) {
          return reply.status(400).send({
            error: true,
            message: 'No changes to commit',
          });
        }

        // Commit the changes
        const commitSha = gitService.commitChanges(updatedWorkItem.worktreePath, body.message);

        // Update WorkItem with new head SHA
        const finalWorkItem = await workItemsRepository.update(workItem.id, {
          headSha: commitSha,
        });

        return reply.status(200).send({
          success: true,
          message: 'Changes committed successfully',
          commitSha,
          workItem: finalWorkItem ? workItemToDTO(finalWorkItem) : workItemToDTO(workItem),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: true,
            message: 'Validation failed',
            details: error.errors,
          });
        }

        return reply.status(500).send({
          error: true,
          message: 'Failed to commit changes',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Create a Pull Request from the WorkItem
   * Ensures idempotency and commits any uncommitted changes before creating PR
   */
  server.post<{ Params: { id: string; workItemId: string } }>(
    '/api/projects/:id/work-items/:workItemId/create-pr',
    async (request, reply) => {
      try {
        const project = await projectsRepository.findById(request.params.id);

        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        const workItem = await workItemsRepository.findById(request.params.workItemId);

        if (!workItem) {
          return reply.status(404).send({
            error: true,
            message: 'WorkItem not found',
          });
        }

        // Ensure workspace is initialized
        const updatedWorkItem = await workspaceService.ensureWorkspace(workItem, project);

        if (!updatedWorkItem.worktreePath) {
          return reply.status(400).send({
            error: true,
            message: 'WorkItem workspace is not initialized',
          });
        }

        // Check if PR already exists (idempotency)
        const existingPR = await pullRequestsRepository.findByWorkItemId(workItem.id);
        if (existingPR) {
          return reply.status(200).send(pullRequestToDTO(existingPR));
        }

        // Commit any uncommitted changes before creating PR
        if (gitService.hasAnyChanges(updatedWorkItem.worktreePath)) {
          const commitMessage = 'Finish manual editing session';
          const commitSha = gitService.commitChanges(updatedWorkItem.worktreePath, commitMessage);
          await workItemsRepository.update(workItem.id, {
            headSha: commitSha,
          });
          // Refresh workItem to get updated headSha
          const refreshedWorkItem = await workItemsRepository.findById(workItem.id);
          if (refreshedWorkItem) {
            // Create PR using PRService
            const pr = await prService.openPR(
              refreshedWorkItem.id,
              project.id,
              refreshedWorkItem.title,
              refreshedWorkItem.body,
              refreshedWorkItem.headBranch || project.defaultBranch,
              project.defaultBranch
            );
            if (!pr) {
              return reply.status(400).send({
                error: true,
                message: 'No changes detected, cannot create PR',
              });
            }
            return reply.status(201).send(pullRequestToDTO(pr));
          }
        }
      } catch (error) {
        return reply.status(400).send({
          error: true,
          message: 'Failed to create PR',
          details: error instanceof Error ? error.message : String(error),
        });
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

      const response = DeleteProjectResponseSchema.parse({
        success: true,
        message: 'Project deleted successfully',
      });
      return reply.status(200).send(response);
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to delete project',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
