/**
 * Tests for mappers - validates that domain models are correctly converted to DTOs
 * that match the shared schemas.
 *
 * These tests ensure that:
 * 1. Date fields are properly converted to canonical ISO 8601 strings
 * 2. All required fields are present
 * 3. The output matches the shared schema validation
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { toDTO as projectToDTO, toDomain as projectToDomain } from './projects.js';
import { toDTO as workItemToDTO, toDomain as workItemToDomain } from './workItems.js';
import { toDTO as agentRunToDTO, toDomain as agentRunToDomain } from './agentRuns.js';
import { toDTO as pullRequestToDTO, toDomain as pullRequestToDomain } from './pullRequests.js';
import { reviewThreadToDTO, reviewThreadToDomain } from './reviews.js';
import type { Project as ProjectDomain } from '../types/models.js';
import {
  ProjectSchema,
  WorkItemSchema,
  AgentRunSchema,
  PullRequestSchema,
  ReviewThreadSchema,
} from 'git-vibe-shared';

describe('Project mapper', () => {
  it('converts domain model to DTO matching shared schema', () => {
    const domain: ProjectDomain = {
      id: uuidv4(),
      name: 'test-project',
      sourceRepoPath: '/path/to/source',
      sourceRepoUrl: 'https://github.com/test/repo',
      mirrorRepoPath: '/path/to/mirror.git',
      relayRepoPath: '/path/to/relay',
      defaultBranch: 'main',
      defaultAgent: 'opencode',
      agentParams: JSON.stringify({ model: 'gpt-4' }),
      maxAgentConcurrency: 3,
      createdAt: new Date('2024-01-15T10:30:00.000Z'),
      updatedAt: new Date('2024-01-15T10:30:00.000Z'),
    };

    const dto = projectToDTO(domain);

    // Validate against shared schema
    const result = ProjectSchema.safeParse(dto);
    expect(result.success).toBe(true);

    // Verify date fields are in canonical ISO format
    expect(dto.createdAt).toBe('2024-01-15T10:30:00.000Z');
    expect(dto.updatedAt).toBe('2024-01-15T10:30:00.000Z');
  });

  it('converts DTO to domain model', () => {
    const dto = {
      id: uuidv4(),
      name: 'test-project',
      sourceRepoPath: '/path/to/source',
      sourceRepoUrl: 'https://github.com/test/repo',
      mirrorRepoPath: '/path/to/mirror.git',
      relayRepoPath: '/path/to/relay',
      defaultBranch: 'main',
      defaultAgent: 'opencode' as const,
      agentParams: JSON.stringify({ model: 'gpt-4' }),
      maxAgentConcurrency: 3,
      createdAt: '2024-01-15T10:30:00.000Z',
      updatedAt: '2024-01-15T10:30:00.000Z',
    };

    const domain = projectToDomain(dto);

    expect(domain.createdAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
    expect(domain.updatedAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
  });

  it('handles null sourceRepoUrl', () => {
    const domain: ProjectDomain = {
      id: uuidv4(),
      name: 'test-project',
      sourceRepoPath: '/path/to/source',
      sourceRepoUrl: null,
      relayRepoPath: '/path/to/relay',
      defaultBranch: 'main',
      defaultAgent: 'opencode',
      agentParams: null,
      maxAgentConcurrency: 3,
      createdAt: new Date('2024-01-15T10:30:00.000Z'),
      updatedAt: new Date('2024-01-15T10:30:00.000Z'),
    };

    const dto = projectToDTO(domain);
    const result = ProjectSchema.safeParse(dto);
    expect(result.success).toBe(true);
    expect(dto.sourceRepoUrl).toBeNull();
  });

  it('handles null agentParams', () => {
    const domain: ProjectDomain = {
      id: uuidv4(),
      name: 'test-project',
      sourceRepoPath: '/path/to/source',
      sourceRepoUrl: null,
      relayRepoPath: '/path/to/relay',
      defaultBranch: 'main',
      defaultAgent: 'opencode',
      agentParams: null,
      maxAgentConcurrency: 3,
      createdAt: new Date('2024-01-15T10:30:00.000Z'),
      updatedAt: new Date('2024-01-15T10:30:00.000Z'),
    };

    const dto = projectToDTO(domain);
    const result = ProjectSchema.safeParse(dto);
    expect(result.success).toBe(true);
    expect(dto.agentParams).toBeNull();
  });
});

describe('WorkItem mapper', () => {
  it('converts domain model to DTO matching shared schema', () => {
    const domain = {
      id: uuidv4(),
      projectId: uuidv4(),
      type: 'issue' as const,
      title: 'Test issue',
      body: 'Test description',
      status: 'open' as const,
      workspaceStatus: 'not_initialized' as const,
      worktreePath: null,
      headBranch: null,
      baseBranch: null,
      baseSha: null,
      headSha: null,
      lockOwnerRunId: null,
      lockExpiresAt: new Date('2024-01-15T10:30:00.000Z'),
      createdAt: new Date('2024-01-15T10:30:00.000Z'),
      updatedAt: new Date('2024-01-15T10:30:00.000Z'),
    };

    const dto = workItemToDTO(domain);

    // Validate against shared schema
    const result = WorkItemSchema.safeParse(dto);
    expect(result.success).toBe(true);

    // Verify date fields are in canonical ISO format
    expect(dto.createdAt).toBe('2024-01-15T10:30:00.000Z');
    expect(dto.updatedAt).toBe('2024-01-15T10:30:00.000Z');
    expect(dto.lockExpiresAt).toBe('2024-01-15T10:30:00.000Z');
  });

  it('handles null lockExpiresAt', () => {
    const domain = {
      id: uuidv4(),
      projectId: uuidv4(),
      type: 'issue' as const,
      title: 'Test issue',
      body: 'Test description',
      status: 'open' as const,
      workspaceStatus: 'not_initialized' as const,
      worktreePath: null,
      headBranch: null,
      baseBranch: null,
      baseSha: null,
      headSha: null,
      lockOwnerRunId: null,
      lockExpiresAt: null,
      createdAt: new Date('2024-01-15T10:30:00.000Z'),
      updatedAt: new Date('2024-01-15T10:30:00.000Z'),
    };

    const dto = workItemToDTO(domain);
    const result = WorkItemSchema.safeParse(dto);
    expect(result.success).toBe(true);
    expect(dto.lockExpiresAt).toBeNull();
  });

  it('converts DTO to domain model', () => {
    const dto = {
      id: uuidv4(),
      projectId: uuidv4(),
      type: 'issue' as const,
      title: 'Test issue',
      body: 'Test description',
      status: 'open' as const,
      workspaceStatus: 'not_initialized' as const,
      worktreePath: null,
      headBranch: null,
      baseBranch: null,
      baseSha: null,
      headSha: null,
      lockOwnerRunId: null,
      lockExpiresAt: '2024-01-15T10:30:00.000Z',
      createdAt: '2024-01-15T10:30:00.000Z',
      updatedAt: '2024-01-15T10:30:00.000Z',
    };

    const domain = workItemToDomain(dto);
    expect(domain.lockExpiresAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
    expect(domain.createdAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
    expect(domain.updatedAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
  });
});

describe('AgentRun mapper', () => {
  it('converts domain model to DTO matching shared schema', () => {
    const domain = {
      id: uuidv4(),
      projectId: uuidv4(),
      workItemId: uuidv4(),
      agentKey: 'opencode' as const,
      status: 'succeeded' as const,
      inputSummary: 'Test summary',
      inputJson: JSON.stringify({ prompt: 'test' }),
      sessionId: 'session-123',
      linkedAgentRunId: uuidv4(),
      log: 'Test log',
      logPath: '/path/to/log',
      stdoutPath: '/path/to/stdout',
      stderrPath: '/path/to/stderr',
      headShaBefore: 'abc123',
      headShaAfter: 'def456',
      commitSha: 'ghi789',
      pid: 12345,
      startedAt: new Date('2024-01-15T10:30:00.000Z'),
      finishedAt: new Date('2024-01-15T11:00:00.000Z'),
      createdAt: new Date('2024-01-15T10:30:00.000Z'),
      updatedAt: new Date('2024-01-15T11:00:00.000Z'),
    };

    const dto = agentRunToDTO(domain);

    // Validate against shared schema
    const result = AgentRunSchema.safeParse(dto);
    expect(result.success).toBe(true);

    // Verify date fields are in canonical ISO format
    expect(dto.createdAt).toBe('2024-01-15T10:30:00.000Z');
    expect(dto.updatedAt).toBe('2024-01-15T11:00:00.000Z');
    expect(dto.startedAt).toBe('2024-01-15T10:30:00.000Z');
    expect(dto.finishedAt).toBe('2024-01-15T11:00:00.000Z');
    // Verify pid is included
    expect(dto.pid).toBe(12345);
  });

  it('handles null optional date fields', () => {
    const domain = {
      id: uuidv4(),
      projectId: uuidv4(),
      workItemId: uuidv4(),
      agentKey: 'opencode' as const,
      status: 'queued' as const,
      inputSummary: null,
      inputJson: JSON.stringify({ prompt: 'test' }),
      sessionId: 'session-123',
      linkedAgentRunId: null,
      log: null,
      logPath: null,
      stdoutPath: null,
      stderrPath: null,
      headShaBefore: null,
      headShaAfter: null,
      commitSha: null,
      pid: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date('2024-01-15T10:30:00.000Z'),
      updatedAt: new Date('2024-01-15T10:30:00.000Z'),
    };

    const dto = agentRunToDTO(domain);
    const result = AgentRunSchema.safeParse(dto);
    expect(result.success).toBe(true);
    expect(dto.startedAt).toBeNull();
    expect(dto.finishedAt).toBeNull();
    expect(dto.pid).toBeNull();
  });

  it('converts DTO to domain model', () => {
    const dto = {
      id: uuidv4(),
      projectId: uuidv4(),
      workItemId: uuidv4(),
      agentKey: 'opencode' as const,
      status: 'succeeded' as const,
      inputSummary: 'Test summary',
      inputJson: JSON.stringify({ prompt: 'test' }),
      sessionId: 'session-123',
      linkedAgentRunId: uuidv4(),
      log: 'Test log',
      logPath: '/path/to/log',
      stdoutPath: '/path/to/stdout',
      stderrPath: '/path/to/stderr',
      headShaBefore: 'abc123',
      headShaAfter: 'def456',
      commitSha: 'ghi789',
      pid: 12345,
      startedAt: '2024-01-15T10:30:00.000Z',
      finishedAt: '2024-01-15T11:00:00.000Z',
      createdAt: '2024-01-15T10:30:00.000Z',
      updatedAt: '2024-01-15T11:00:00.000Z',
    };

    const domain = agentRunToDomain(dto);
    expect(domain.startedAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
    expect(domain.finishedAt).toEqual(new Date('2024-01-15T11:00:00.000Z'));
    expect(domain.createdAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
    expect(domain.updatedAt).toEqual(new Date('2024-01-15T11:00:00.000Z'));
    expect(domain.pid).toBe(12345);
  });
});

describe('PullRequest mapper', () => {
  it('converts domain model to DTO matching shared schema', () => {
    const domain = {
      id: uuidv4(),
      projectId: uuidv4(),
      workItemId: uuidv4(),
      title: 'Test PR',
      description: 'Test description',
      status: 'open' as const,
      sourceBranch: 'feature-branch',
      targetBranch: 'main',
      mergeStrategy: 'merge' as const,
      createdAt: new Date('2024-01-15T10:30:00.000Z'),
      updatedAt: new Date('2024-01-15T10:30:00.000Z'),
      mergedAt: new Date('2024-01-15T11:00:00.000Z'),
      mergedBy: 'user@example.com',
      mergeCommitSha: 'abc123',
      syncedCommitSha: null,
    };

    const dto = pullRequestToDTO(domain);

    // Validate against shared schema
    const result = PullRequestSchema.safeParse(dto);
    expect(result.success).toBe(true);

    // Verify date fields are in canonical ISO format
    expect(dto.createdAt).toBe('2024-01-15T10:30:00.000Z');
    expect(dto.updatedAt).toBe('2024-01-15T10:30:00.000Z');
    expect(dto.mergedAt).toBe('2024-01-15T11:00:00.000Z');
  });

  it('handles null mergedAt', () => {
    const domain = {
      id: uuidv4(),
      projectId: uuidv4(),
      workItemId: uuidv4(),
      title: 'Test PR',
      description: 'Test description',
      status: 'open' as const,
      sourceBranch: 'feature-branch',
      targetBranch: 'main',
      mergeStrategy: 'merge' as const,
      createdAt: new Date('2024-01-15T10:30:00.000Z'),
      updatedAt: new Date('2024-01-15T10:30:00.000Z'),
      mergedAt: null,
      mergedBy: null,
      mergeCommitSha: null,
      syncedCommitSha: null,
    };

    const dto = pullRequestToDTO(domain);
    const result = PullRequestSchema.safeParse(dto);
    expect(result.success).toBe(true);
    expect(dto.mergedAt).toBeNull();
  });

  it('converts DTO to domain model', () => {
    const dto = {
      id: uuidv4(),
      projectId: uuidv4(),
      workItemId: uuidv4(),
      title: 'Test PR',
      description: 'Test description',
      status: 'open' as const,
      sourceBranch: 'feature-branch',
      targetBranch: 'main',
      mergeStrategy: 'merge' as const,
      createdAt: '2024-01-15T10:30:00.000Z',
      updatedAt: '2024-01-15T10:30:00.000Z',
      mergedAt: '2024-01-15T11:00:00.000Z',
      mergedBy: 'user@example.com',
      mergeCommitSha: 'abc123',
      syncedCommitSha: null,
    };

    const domain = pullRequestToDomain(dto);
    expect(domain.mergedAt).toEqual(new Date('2024-01-15T11:00:00.000Z'));
    expect(domain.createdAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
    expect(domain.updatedAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
  });
});

describe('ReviewThread mapper', () => {
  it('converts domain model to DTO matching shared schema', () => {
    const domain = {
      id: uuidv4(),
      pullRequestId: uuidv4(),
      status: 'open' as const,
      severity: 'error' as const,
      anchor: JSON.stringify({ file: 'test.ts', line: 10 }),
      createdAt: new Date('2024-01-15T10:30:00.000Z'),
      updatedAt: new Date('2024-01-15T10:30:00.000Z'),
    };

    const dto = reviewThreadToDTO(domain);

    // Validate against shared schema
    const result = ReviewThreadSchema.safeParse(dto);
    expect(result.success).toBe(true);

    // Verify date fields are in canonical ISO format
    expect(dto.createdAt).toBe('2024-01-15T10:30:00.000Z');
    expect(dto.updatedAt).toBe('2024-01-15T10:30:00.000Z');
  });

  it('converts DTO to domain model', () => {
    const dto = {
      id: uuidv4(),
      pullRequestId: uuidv4(),
      status: 'open' as const,
      severity: 'error' as const,
      anchor: JSON.stringify({ file: 'test.ts', line: 10 }),
      createdAt: '2024-01-15T10:30:00.000Z',
      updatedAt: '2024-01-15T10:30:00.000Z',
    };

    const domain = reviewThreadToDomain(dto);
    expect(domain.createdAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
    expect(domain.updatedAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
  });
});
