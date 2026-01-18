import type { FastifyInstance } from 'fastify';
import { DiffResponseSchema } from 'git-vibe-shared';
import { pullRequestsRepository } from '../repositories/PullRequestsRepository.js';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { projectsRepository } from '../repositories/ProjectsRepository.js';
import { prService } from '../services/PRService.js';
import { gitService } from '../services/GitService.js';
import { toDTO as pullRequestToDTO } from '../mappers/pullRequests.js';

export async function pullRequestsRoutes(server: FastifyInstance) {
  // GET /api/pull-requests - List PRs (with optional project filter and pagination)
  server.get<{ Querystring: { projectId?: string; page?: string; limit?: string } }>(
    '/api/pull-requests',
    async (request) => {
      const { projectId, page: pageStr, limit: limitStr } = request.query;
      const page = parseInt(pageStr || '1', 10);
      const limit = parseInt(limitStr || '10', 10);

      let prs: Awaited<ReturnType<typeof pullRequestsRepository.findByProjectId>>;

      if (projectId) {
        prs = await pullRequestsRepository.findByProjectId(projectId);
      } else {
        // If no projectId, return all PRs (you might want to add a findAll method to repository)
        // For now, we'll return an empty array if no projectId is provided
        prs = [];
      }

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedPRs = prs.slice(startIndex, endIndex);

      return {
        data: paginatedPRs.map(pullRequestToDTO),
        pagination: {
          page,
          limit,
          total: prs.length,
          totalPages: Math.ceil(prs.length / limit),
        },
      };
    }
  );

  // GET /api/pull-requests/:id - Get PR details
  server.get<{ Params: { id: string } }>('/api/pull-requests/:id', async (request, reply) => {
    const pr = await pullRequestsRepository.findById(request.params.id);

    if (!pr) {
      return reply.status(404).send({
        error: true,
        message: 'Pull request not found',
      });
    }

    return pullRequestToDTO(pr);
  });

  // GET /api/pull-requests/:id/diff - Get PR diff
  server.get<{ Params: { id: string } }>('/api/pull-requests/:id/diff', async (request, reply) => {
    const pr = await pullRequestsRepository.findById(request.params.id);

    if (!pr) {
      return reply.status(404).send({
        error: true,
        message: 'Pull request not found',
      });
    }

    const workItem = await workItemsRepository.findById(pr.workItemId);
    if (!workItem) {
      return reply.status(404).send({
        error: true,
        message: 'WorkItem not found',
      });
    }

    if (!workItem.baseSha || !workItem.headSha) {
      const response = DiffResponseSchema.parse({
        diff: '',
        baseSha: workItem.baseSha || '',
        headSha: workItem.headSha || '',
      });
      return response;
    }

    try {
      const project = await projectsRepository.findById(pr.projectId);
      if (!project) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      const diff = await prService.getDiff(pr, workItem, project);
      const response = DiffResponseSchema.parse({
        diff,
        baseSha: workItem.baseSha,
        headSha: workItem.headSha,
      });
      return response;
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to generate diff',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /api/pull-requests/:id/commits - Get PR commits
  server.get<{ Params: { id: string } }>(
    '/api/pull-requests/:id/commits',
    async (request, reply) => {
      const pr = await pullRequestsRepository.findById(request.params.id);

      if (!pr) {
        return reply.status(404).send({
          error: true,
          message: 'Pull request not found',
        });
      }

      const workItem = await workItemsRepository.findById(pr.workItemId);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      try {
        const project = await projectsRepository.findById(pr.projectId);
        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        const commits = await prService.getCommits(pr, workItem, project);
        return commits;
      } catch (error) {
        return reply.status(500).send({
          error: true,
          message: 'Failed to get commits',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // GET /api/pull-requests/:id/commits-with-tasks - Get PR commits grouped by tasks
  server.get<{ Params: { id: string } }>(
    '/api/pull-requests/:id/commits-with-tasks',
    async (request, reply) => {
      const pr = await pullRequestsRepository.findById(request.params.id);

      if (!pr) {
        return reply.status(404).send({
          error: true,
          message: 'Pull request not found',
        });
      }

      const workItem = await workItemsRepository.findById(pr.workItemId);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      try {
        const project = await projectsRepository.findById(pr.projectId);
        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        console.log(`Getting commits for PR ${pr.id}, WorkItem ${workItem.id}`, {
          worktreePath: workItem.worktreePath,
          headBranch: workItem.headBranch,
          baseSha: workItem.baseSha,
          headSha: workItem.headSha,
        });

        const commitsWithTasks = await prService.getCommitsWithTasks(pr, workItem, project);

        console.log(`Returning ${commitsWithTasks.length} commit groups for PR ${pr.id}`);

        return commitsWithTasks;
      } catch (error) {
        console.error(`Error getting commits for PR ${pr.id}:`, error);
        return reply.status(500).send({
          error: true,
          message: 'Failed to get commits with tasks',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // GET /api/pull-requests/:id/statistics - Get PR statistics
  server.get<{ Params: { id: string } }>(
    '/api/pull-requests/:id/statistics',
    async (request, reply) => {
      const pr = await pullRequestsRepository.findById(request.params.id);

      if (!pr) {
        return reply.status(404).send({
          error: true,
          message: 'Pull request not found',
        });
      }

      const workItem = await workItemsRepository.findById(pr.workItemId);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      try {
        const project = await projectsRepository.findById(pr.projectId);
        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        const statistics = await prService.getStatistics(pr, workItem, project);
        return statistics;
      } catch (error) {
        return reply.status(500).send({
          error: true,
          message: 'Failed to get PR statistics',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // POST /api/pull-requests/:id/merge - Merge PR
  server.post<{ Params: { id: string }; Body: { strategy?: 'merge' | 'squash' | 'rebase' } }>(
    '/api/pull-requests/:id/merge',
    async (request, reply) => {
      const pr = await pullRequestsRepository.findById(request.params.id);

      if (!pr) {
        return reply.status(404).send({
          error: true,
          message: 'Pull request not found',
        });
      }

      const workItem = await workItemsRepository.findById(pr.workItemId);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      const project = await projectsRepository.findById(pr.projectId);
      if (!project) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      try {
        const { strategy = 'merge' } = request.body;
        const mergedPR = await prService.mergePR(pr, workItem, project, strategy);
        return reply.status(200).send(pullRequestToDTO(mergedPR));
      } catch (error) {
        return reply.status(400).send({
          error: true,
          message: 'Failed to merge PR',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // POST /api/pull-requests/:id/close - Close PR
  server.post<{ Params: { id: string } }>(
    '/api/pull-requests/:id/close',
    async (request, reply) => {
      const pr = await pullRequestsRepository.findById(request.params.id);

      if (!pr) {
        return reply.status(404).send({
          error: true,
          message: 'Pull request not found',
        });
      }

      try {
        const closedPR = await prService.closePR(pr);
        return reply.status(200).send(pullRequestToDTO(closedPR));
      } catch (error) {
        return reply.status(500).send({
          error: true,
          message: 'Failed to close PR',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // POST /api/pull-requests/:id/update-base - Update PR base (optional)
  server.post<{ Params: { id: string }; Body: { rebase?: boolean } }>(
    '/api/pull-requests/:id/update-base',
    async (request, reply) => {
      const pr = await pullRequestsRepository.findById(request.params.id);

      if (!pr) {
        return reply.status(404).send({
          error: true,
          message: 'Pull request not found',
        });
      }

      const workItem = await workItemsRepository.findById(pr.workItemId);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      const project = await projectsRepository.findById(pr.projectId);
      if (!project) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      try {
        const { rebase = false } = request.body;
        const result = await prService.updateBase(pr, workItem, project, rebase);
        return reply.status(200).send(pullRequestToDTO(result.pr));
      } catch (error) {
        return reply.status(500).send({
          error: true,
          message: 'Failed to update PR base',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // GET /api/pull-requests/:id/patch - Export patch (optional)
  server.get<{ Params: { id: string } }>('/api/pull-requests/:id/patch', async (request, reply) => {
    const pr = await pullRequestsRepository.findById(request.params.id);

    if (!pr) {
      return reply.status(404).send({
        error: true,
        message: 'Pull request not found',
      });
    }

    const workItem = await workItemsRepository.findById(pr.workItemId);
    if (!workItem) {
      return reply.status(404).send({
        error: true,
        message: 'WorkItem not found',
      });
    }

    if (!workItem.baseSha || !workItem.headSha) {
      return reply.status(400).send({
        error: true,
        message: 'WorkItem has missing SHAs',
      });
    }

    try {
      const project = await projectsRepository.findById(pr.projectId);
      if (!project) {
        return reply.status(404).send({
          error: true,
          message: 'Project not found',
        });
      }

      const repoPath = project.relayRepoPath || project.sourceRepoPath;
      const patch = gitService.generatePatch(workItem.baseSha, workItem.headSha, repoPath);

      // Return as plain text
      reply.type('text/plain');
      return reply.status(200).send(patch);
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to generate patch',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
