import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { CreateWorkItemDTOSchema, UpdateWorkItemDTOSchema } from 'git-vibe-shared';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { pullRequestsRepository } from '../repositories/PullRequestsRepository.js';
import { projectsRepository } from '../repositories/ProjectsRepository.js';
import { agentService } from '../services/AgentService.js';
import { workspaceService } from '../services/WorkspaceService.js';
import { prService } from '../services/PRService.js';

export async function workitemsRoutes(server: FastifyInstance) {
  // POST /api/workitems - Create new WorkItem and automatically start agent
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

      // Create WorkItem in database
      const workItem = await workItemsRepository.create({
        id: uuidv4(),
        projectId: body.projectId,
        type: body.type,
        title: body.title,
        body: body.body,
      });

      // Automatically execute task: initialize workspace and start agent
      // This runs asynchronously and doesn't block the response
      agentService
        .executeTask(workItem.projectId, workItem.id, workItem.title, workItem.body || undefined)
        .then(() => {
          console.log(`Task started successfully for work item ${workItem.id}`);
        })
        .catch((error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Failed to execute task for work item ${workItem.id}:`, errorMessage);
          console.error('Full error details:', error);
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

  // POST /api/projects/:projectId/work-items - Create WorkItem for a project
  server.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/work-items',
    async (request, reply) => {
      try {
        const body = CreateWorkItemDTOSchema.parse(request.body);
        const projectId = request.params.projectId;

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

        // Automatically execute task: initialize workspace and start agent
        // This runs asynchronously and doesn't block the response
        agentService
          .executeTask(workItem.projectId, workItem.id, workItem.title, workItem.body || undefined)
          .then(() => {
            console.log(`Task started successfully for work item ${workItem.id}`);
          })
          .catch((error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Failed to execute task for work item ${workItem.id}:`, errorMessage);
            console.error('Full error details:', error);
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

  // POST /api/work-items/:id/init-workspace - Initialize workspace for WorkItem
  server.post<{ Params: { id: string } }>(
    '/api/work-items/:id/init-workspace',
    async (request, reply) => {
      const workItem = await workItemsRepository.findById(request.params.id);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      const project = await projectsRepository.findById(workItem.projectId);
      if (!project) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      try {
        const updatedWorkItem = await workspaceService.initWorkspace(workItem, project);
        return reply.status(200).send(updatedWorkItem);
      } catch (error) {
        return reply.status(500).send({
          error: true,
          message: 'Failed to initialize workspace',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // POST /api/work-items/:id/resume - Resume task for WorkItem
  server.post<{ Params: { id: string }; Body: { prompt: string } }>(
    '/api/work-items/:id/resume',
    async (request, reply) => {
      const workItem = await workItemsRepository.findById(request.params.id);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      try {
        const { prompt } = request.body;
        if (!prompt) {
          return reply.status(400).send({
            error: true,
            message: 'Prompt is required',
          });
        }

        // Find the most recent agent run for this WorkItem that has a sessionId
        const allAgentRuns = await agentService.getWorkItemTasks(request.params.id);
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
        const agentRun = await agentService.resumeTask(latestRunWithSession.id, prompt);
        return reply.status(201).send(agentRun);
      } catch (error) {
        return reply.status(400).send({
          error: true,
          message: error instanceof Error ? error.message : 'Failed to resume task',
        });
      }
    }
  );

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

      // If WorkItem is being closed, clean up its worktree
      if (body.status === 'closed') {
        const project = await projectsRepository.findById(workItem.projectId);
        if (project) {
          workspaceService.removeWorktree(workItem, project).catch((error) => {
            console.error(`Failed to clean up worktree for WorkItem ${request.params.id}:`, error);
          });
        }
      }

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

    // Clean up worktree before deleting WorkItem
    const project = await projectsRepository.findById(workItem.projectId);
    if (project) {
      try {
        await workspaceService.deleteWorkspace(workItem, project);
      } catch (error) {
        // Log error but continue with deletion
        // Worktree cleanup failure shouldn't prevent WorkItem deletion
        console.error(`Failed to clean up workspace for WorkItem ${request.params.id}:`, error);
      }
    }

    // Delete from database
    await workItemsRepository.delete(request.params.id);

    return reply.status(204).send();
  });

  // POST /api/workitems/:id/create-pr - Create PR from WorkItem
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

      try {
        // Ensure workspace is initialized
        const updatedWorkItem = await workspaceService.ensureWorkspace(workItem, project);

        // Create PR using PRService
        const pr = await prService.openPR(updatedWorkItem, project);

        return reply.status(201).send(pr);
      } catch (error) {
        return reply.status(400).send({
          error: true,
          message: error instanceof Error ? error.message : 'Failed to create PR',
        });
      }
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

    const pr = await pullRequestsRepository.findByWorkItemId(request.params.id);
    return pr ? [pr] : [];
  });

  // GET /api/workitems/:id/tasks - Get all agent tasks for a WorkItem
  server.get<{ Params: { id: string } }>('/api/workitems/:id/tasks', async (request, reply) => {
    const workItem = await workItemsRepository.findById(request.params.id);
    if (!workItem) {
      return reply.status(404).send({
        error: true,
        message: 'WorkItem not found',
      });
    }

    const tasks = await agentService.getWorkItemTasks(request.params.id);
    return tasks;
  });

  // POST /api/workitems/:id/tasks/:taskId/cancel - Cancel a running task
  server.post<{ Params: { id: string; taskId: string } }>(
    '/api/workitems/:id/tasks/:taskId/cancel',
    async (request, reply) => {
      const workItem = await workItemsRepository.findById(request.params.id);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      try {
        await agentService.cancelTask(request.params.taskId);
        return reply.status(200).send({
          message: 'Task cancelled successfully',
          taskId: request.params.taskId,
        });
      } catch (error) {
        return reply.status(404).send({
          error: true,
          message: error instanceof Error ? error.message : 'Failed to cancel task',
        });
      }
    }
  );

  // POST /api/workitems/:id/tasks/:taskId/restart - Restart a task
  server.post<{ Params: { id: string; taskId: string } }>(
    '/api/workitems/:id/tasks/:taskId/restart',
    async (request, reply) => {
      const workItem = await workItemsRepository.findById(request.params.id);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      try {
        const agentRun = await agentService.restartTask(request.params.taskId);
        return reply.status(201).send(agentRun);
      } catch (error) {
        return reply.status(404).send({
          error: true,
          message: error instanceof Error ? error.message : 'Failed to restart task',
        });
      }
    }
  );

  // GET /api/workitems/:id/tasks/:taskId/status - Get task status
  server.get<{ Params: { id: string; taskId: string } }>(
    '/api/workitems/:id/tasks/:taskId/status',
    async (request, reply) => {
      const workItem = await workItemsRepository.findById(request.params.id);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      try {
        const status = await agentService.getTaskStatus(request.params.taskId);
        return status;
      } catch (error) {
        return reply.status(404).send({
          error: true,
          message: error instanceof Error ? error.message : 'Failed to get task status',
        });
      }
    }
  );

  // POST /api/workitems/:id/tasks/:taskId/resume - Resume a task with the same session_id
  server.post<{ Params: { id: string; taskId: string }; Body: { prompt: string } }>(
    '/api/workitems/:id/tasks/:taskId/resume',
    async (request, reply) => {
      const workItem = await workItemsRepository.findById(request.params.id);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      try {
        const { prompt } = request.body;
        if (!prompt) {
          return reply.status(400).send({
            error: true,
            message: 'Prompt is required',
          });
        }

        const agentRun = await agentService.resumeTask(request.params.taskId, prompt);
        return reply.status(201).send(agentRun);
      } catch (error) {
        return reply.status(400).send({
          error: true,
          message: error instanceof Error ? error.message : 'Failed to resume task',
        });
      }
    }
  );

  // POST /api/workitems/:id/start - Start agent task for a WorkItem
  server.post<{ Params: { id: string } }>('/api/workitems/:id/start', async (request, reply) => {
    const workItem = await workItemsRepository.findById(request.params.id);
    if (!workItem) {
      return reply.status(404).send({
        error: true,
        message: 'WorkItem not found',
      });
    }

    // Check if WorkItem is already closed
    if (workItem.status === 'closed') {
      return reply.status(400).send({
        error: true,
        message: 'Cannot start task for a closed WorkItem',
      });
    }

    // Check if there's already a running task for this WorkItem
    const existingTasks = await agentService.getWorkItemTasks(request.params.id);
    const runningTask = existingTasks.find((task) => task.status === 'running');
    if (runningTask) {
      return reply.status(400).send({
        error: true,
        message: 'A task is already running for this WorkItem',
      });
    }

    try {
      // Execute task: initialize workspace and start agent
      const result = await agentService.executeTask(
        workItem.projectId,
        workItem.id,
        workItem.title,
        workItem.body || undefined
      );

      return reply.status(201).send(result);
    } catch (error) {
      return reply.status(400).send({
        error: true,
        message: error instanceof Error ? error.message : 'Failed to start task',
      });
    }
  });

  // POST /api/workitems/:id/refresh - Refresh WorkItem head_sha
  server.post<{ Params: { id: string } }>('/api/workitems/:id/refresh', async (request, reply) => {
    const workItem = await workItemsRepository.findById(request.params.id);
    if (!workItem) {
      return reply.status(404).send({
        error: true,
        message: 'WorkItem not found',
      });
    }

    const project = await projectsRepository.findById(workItem.projectId);
    if (!project) {
      return reply.status(404).send({
        error: true,
        message: 'Project not found',
      });
    }

    try {
      // Refresh head_sha using workspace service
      const updatedWorkItem = await workspaceService.refreshHeadSha(workItem);
      return reply.status(200).send(updatedWorkItem);
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to refresh WorkItem head',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
