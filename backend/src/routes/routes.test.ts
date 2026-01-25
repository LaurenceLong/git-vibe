/**
 * Integration tests for backend routes
 *
 * These tests validate that route responses match the shared schemas.
 * They test:
 * 1. Single object responses (e.g., GET /projects/:id)
 * 2. List responses (e.g., GET /projects)
 * 3. Responses with nullable date fields
 * 4. Edge cases (empty lists, null dates)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../middleware/setup.js';
import { runMigrations } from '../db/migrations.js';
import { projectsRepository } from '../repositories/ProjectsRepository.js';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { pullRequestsRepository } from '../repositories/PullRequestsRepository.js';
import { agentRunsRepository } from '../repositories/AgentRunsRepository.js';
import { v4 as uuidv4 } from 'uuid';
import { ProjectSchema, WorkItemSchema, PullRequestSchema, AgentRunSchema } from 'git-vibe-shared';

// Helper to create a test server
async function createTestServer() {
  const server = await createServer();
  await server.register((await import('./projects.js')).projectsRoutes);
  await server.register((await import('./workitems.js')).workitemsRoutes);
  await server.register((await import('./pullRequests.js')).pullRequestsRoutes);
  await server.register((await import('./agentRuns.js')).agentRunsRoutes);
  return server;
}

describe('Backend Routes - Response Schema Validation', () => {
  let server: any;

  beforeAll(async () => {
    // Initialize database
    await runMigrations();
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('Projects routes', () => {
    it('GET /api/projects returns list matching schema', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/projects',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      // Validate structure
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('pagination');

      // Validate each project in list
      if (body.data.length > 0) {
        body.data.forEach((project: any) => {
          const result = ProjectSchema.safeParse(project);
          expect(result.success).toBe(true);
        });
      }
    });

    it('GET /api/projects/:id returns single project matching schema', async () => {
      // Create a test project
      const project = await projectsRepository.create({
        id: uuidv4(),
        name: `test-route-project-${Date.now()}`,
        sourceRepoPath: '/tmp/test/source',
        mirrorRepoPath: '/tmp/test/mirror.git',
        relayRepoPath: '/tmp/test/relay',
        defaultBranch: 'main',
      });

      const response = await server.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      // Validate against shared schema
      const result = ProjectSchema.safeParse(body);
      expect(result.success).toBe(true);

      // Verify date fields are in canonical ISO format
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('GET /api/projects/:id returns 404 for non-existent project', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/projects/${uuidv4()}`,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('error', true);
      expect(body).toHaveProperty('message', 'Project not found');
    });
  });

  describe('WorkItems routes', () => {
    let testProjectId: string;
    let testWorkItemId: string;

    beforeAll(async () => {
      // Create a test project for work items
      const project = await projectsRepository.create({
        id: uuidv4(),
        name: `test-workitem-project-${Date.now()}`,
        sourceRepoPath: '/tmp/test/source',
        mirrorRepoPath: '/tmp/test/mirror.git',
        relayRepoPath: '/tmp/test/relay',
        defaultBranch: 'main',
      });
      testProjectId = project.id;
    });

    it('GET /api/workitems returns list matching schema', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workitems',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      // Validate structure
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('pagination');

      // Validate each work item in list
      if (body.data.length > 0) {
        body.data.forEach((workItem: any) => {
          const result = WorkItemSchema.safeParse(workItem);
          expect(result.success).toBe(true);
        });
      }
    });

    it('GET /api/workitems/:id returns single work item matching schema', async () => {
      // Create a test work item
      const workItem = await workItemsRepository.create({
        id: uuidv4(),
        projectId: testProjectId,
        type: 'issue',
        title: 'Test issue for route validation',
        body: 'Test description',
      });
      testWorkItemId = workItem.id;

      const response = await server.inject({
        method: 'GET',
        url: `/api/workitems/${workItem.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      // Validate against shared schema
      const result = WorkItemSchema.safeParse(body);
      expect(result.success).toBe(true);

      // Verify date fields are in canonical ISO format
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('handles null lockExpiresAt correctly', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/workitems/${testWorkItemId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      // lockExpiresAt should be null for a new work item
      expect(body.lockExpiresAt).toBeNull();

      const result = WorkItemSchema.safeParse(body);
      expect(result.success).toBe(true);
    });
  });

  describe('PullRequests routes', () => {
    let testProjectId: string;
    let testWorkItemId: string;
    let testPRId: string;

    beforeAll(async () => {
      // Create test data
      const project = await projectsRepository.create({
        id: uuidv4(),
        name: `test-pr-project-${Date.now()}`,
        sourceRepoPath: '/tmp/test/source',
        mirrorRepoPath: '/tmp/test/mirror.git',
        relayRepoPath: '/tmp/test/relay',
        defaultBranch: 'main',
      });
      testProjectId = project.id;

      const workItem = await workItemsRepository.create({
        id: uuidv4(),
        projectId: testProjectId,
        type: 'issue',
        title: 'Test issue for PR',
        body: 'Test description',
      });
      testWorkItemId = workItem.id;

      const pr = await pullRequestsRepository.create({
        id: uuidv4(),
        projectId: testProjectId,
        workItemId: testWorkItemId,
        title: 'Test PR',
        description: 'Test PR description',
        sourceBranch: 'feature/test',
        targetBranch: 'main',
      });
      testPRId = pr.id;
    });

    it('GET /api/pull-requests with projectId returns list matching schema', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/pull-requests?projectId=${testProjectId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      // Validate structure
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('pagination');

      // Validate each PR in list
      if (body.data.length > 0) {
        body.data.forEach((pr: any) => {
          const result = PullRequestSchema.safeParse(pr);
          expect(result.success).toBe(true);
        });
      }
    });

    it('GET /api/pull-requests/:id returns single PR matching schema', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/pull-requests/${testPRId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      // Validate against shared schema
      const result = PullRequestSchema.safeParse(body);
      expect(result.success).toBe(true);

      // Verify date fields are in canonical ISO format
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('handles null mergedAt correctly', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/pull-requests/${testPRId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      // mergedAt should be null for an open PR
      expect(body.mergedAt).toBeNull();

      const result = PullRequestSchema.safeParse(body);
      expect(result.success).toBe(true);
    });
  });

  describe('AgentRuns routes', () => {
    let testProjectId: string;
    let testWorkItemId: string;
    let testAgentRunId: string;

    beforeAll(async () => {
      // Create test data
      const project = await projectsRepository.create({
        id: uuidv4(),
        name: `test-agentrun-project-${Date.now()}`,
        sourceRepoPath: '/tmp/test/source',
        mirrorRepoPath: '/tmp/test/mirror.git',
        relayRepoPath: '/tmp/test/relay',
        defaultBranch: 'main',
      });
      testProjectId = project.id;

      const workItem = await workItemsRepository.create({
        id: uuidv4(),
        projectId: testProjectId,
        type: 'issue',
        title: 'Test issue for agent run',
        body: 'Test description',
      });
      testWorkItemId = workItem.id;

      // Create an agent run
      const agentRun = await agentRunsRepository.create({
        id: uuidv4(),
        workItemId: testWorkItemId,
        projectId: testProjectId,
        agentKey: 'opencode',
        inputJson: JSON.stringify({ prompt: 'test' }),
        sessionId: 'session-123',
      });
      testAgentRunId = agentRun.id;

      // Update agent run to have date fields
      await agentRunsRepository.update(agentRun.id, {
        status: 'succeeded',
        inputSummary: 'Test summary',
        startedAt: new Date('2024-01-15T10:30:00.000Z'),
        finishedAt: new Date('2024-01-15T11:00:00.000Z'),
        headShaBefore: 'abc123',
        headShaAfter: 'def456',
        commitSha: 'ghi789',
        log: 'Test log',
        logPath: '/path/to/log',
        stdoutPath: '/path/to/stdout',
        stderrPath: '/path/to/stderr',
      });
    });

    it('GET /api/work-items/:id/agent-runs returns list matching schema', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/work-items/${testWorkItemId}/agent-runs`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      // Validate each agent run in list
      if (Array.isArray(body) && body.length > 0) {
        body.forEach((run: any) => {
          const result = AgentRunSchema.safeParse(run);
          expect(result.success).toBe(true);
        });
      }
    });

    it('GET /api/agent-runs/:id returns single agent run matching schema', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/agent-runs/${testAgentRunId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      // Validate against shared schema
      const result = AgentRunSchema.safeParse(body);
      expect(result.success).toBe(true);

      // Verify date fields are in canonical ISO format
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(body.startedAt).toBe('2024-01-15T10:30:00.000Z');
      expect(body.finishedAt).toBe('2024-01-15T11:00:00.000Z');
    });

    it('handles null optional date fields correctly', async () => {
      // Create an agent run with null date fields
      const queuedRun = await agentRunsRepository.create({
        id: uuidv4(),
        workItemId: testWorkItemId,
        projectId: testProjectId,
        agentKey: 'opencode',
        inputJson: JSON.stringify({ prompt: 'test' }),
        sessionId: 'session-456',
      });

      const response = await server.inject({
        method: 'GET',
        url: `/api/agent-runs/${queuedRun.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      // Date fields should be null for queued runs
      expect(body.startedAt).toBeNull();
      expect(body.finishedAt).toBeNull();

      const result = AgentRunSchema.safeParse(body);
      expect(result.success).toBe(true);
    });
  });
});
