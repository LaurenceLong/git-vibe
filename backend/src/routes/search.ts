import type { FastifyInstance } from 'fastify';
import { inArray, or, sql } from 'drizzle-orm';
import { SearchResponseSchema } from 'git-vibe-shared';
import { toDTO as projectToDTO } from '../mappers/projects.js';
import { toDTO as workItemToDTO } from '../mappers/workItems.js';
import { toDTO as pullRequestToDTO } from '../mappers/pullRequests.js';
import { projects, workItems, pullRequests } from '../models/schema.js';
import { getDb } from '../db/client.js';
import type { Project, WorkItem } from '../types/models.js';

export async function searchRoutes(server: FastifyInstance) {
  // GET /api/search - Search across projects, work items, and pull requests
  server.get<{ Querystring: { q?: string; limit?: string } }>('/api/search', async (request) => {
    const query = request.query.q?.trim() || '';
    const limit = parseInt(request.query.limit || '20', 10);

    if (!query) {
      return SearchResponseSchema.parse({
        projects: [],
        workItems: [],
        pullRequests: [],
        projectNames: {},
      });
    }

    const db = await getDb();
    const searchPattern = `%${query}%`;

    // Search projects by name (case-insensitive)
    const matchingProjects = await db
      .select()
      .from(projects)
      .where(sql`LOWER(${projects.name}) LIKE LOWER(${searchPattern})`)
      .limit(limit)
      .execute();

    // Search work items by title or body (case-insensitive)
    const matchingWorkItems = await db
      .select()
      .from(workItems)
      .where(
        or(
          sql`LOWER(${workItems.title}) LIKE LOWER(${searchPattern})`,
          sql`LOWER(${workItems.body}) LIKE LOWER(${searchPattern})`
        )!
      )
      .limit(limit)
      .execute();

    // Search pull requests by title or description (case-insensitive)
    const matchingPullRequests = await db
      .select()
      .from(pullRequests)
      .where(
        or(
          sql`LOWER(${pullRequests.title}) LIKE LOWER(${searchPattern})`,
          sql`LOWER(${pullRequests.description}) LIKE LOWER(${searchPattern})`
        )!
      )
      .limit(limit)
      .execute();

    // Build projectNames map for work items and PRs (projectId -> name)
    const projectIds = new Set<string>();
    for (const wi of matchingWorkItems) projectIds.add(wi.projectId);
    for (const pr of matchingPullRequests) projectIds.add(pr.projectId);
    const projectNames: Record<string, string> = {};
    if (projectIds.size > 0) {
      const projectRows = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(inArray(projects.id, [...projectIds]))
        .execute();
      for (const p of projectRows) projectNames[p.id] = p.name;
    }

    const payload = {
      projects: matchingProjects.map((p) => projectToDTO(p as Project)),
      workItems: matchingWorkItems.map((wi) => workItemToDTO(wi as WorkItem)),
      pullRequests: matchingPullRequests.map(pullRequestToDTO),
      projectNames,
    };
    return SearchResponseSchema.parse(payload);
  });
}
