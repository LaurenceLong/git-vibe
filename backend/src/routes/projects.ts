import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { projectsRepository } from '../repositories/ProjectsRepository.js';
import { gitService } from '../services/GitService.js';

export async function projectsRoutes(server: FastifyInstance) {
  const createProjectSchema = z.object({
    name: z.string().min(1),
    sourceRepoPath: z.string().min(1),
    sourceRepoUrl: z.string().url().optional().or(z.literal('')),
  });

  server.post('/api/projects', async (request, reply) => {
    try {
      const body = createProjectSchema.parse(request.body);

      // Check if project name already exists
      const existingProject = await projectsRepository.findByName(body.name);
      if (existingProject) {
        return reply.status(400).send({
          error: true,
          message: 'Project name already exists',
        });
      }

      await gitService.validateRepo(body.sourceRepoPath);

      const defaultBranch = gitService.getDefaultBranch(body.sourceRepoPath);

      const project = await projectsRepository.create({
        id: uuidv4(),
        name: body.name,
        sourceRepoPath: body.sourceRepoPath,
        sourceRepoUrl: body.sourceRepoUrl || undefined,
        defaultBranch,
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

  server.get<{ Params: { id: string } }>('/api/projects/:id', async (request) => {
    const project = await projectsRepository.findById(request.params.id);

    if (!project) {
      return {
        error: true,
        message: 'Project not found',
        statusCode: 404,
      };
    }

    return project;
  });

  server.get<{ Params: { name: string } }>('/api/projects/name/:name', async (request) => {
    const project = await projectsRepository.findByName(request.params.name);

    if (!project) {
      return {
        error: true,
        message: 'Project not found',
        statusCode: 404,
      };
    }

    return project;
  });
}
