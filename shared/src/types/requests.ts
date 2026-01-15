/**
 * Request DTOs (Data Transfer Objects) for API requests
 * These types define the structure of request payloads
 */

import { z } from 'zod';
import type {
  AgentKey,
  WorkItemType,
  WorkItemStatus,
} from './models.js';
import {
  AgentKeySchema,
  WorkItemTypeSchema,
  WorkItemStatusSchema,
  AgentParamsSchema,
} from './models.js';

// ============================================================================
// Project Request DTOs
// ============================================================================

/**
 * DTO for creating a new project
 */
export interface CreateProjectDTO {
  name: string;
  sourceRepoPath: string;
  sourceRepoUrl?: string;
  defaultBranch?: string;
  defaultAgent?: AgentKey;
  agentParams?: Record<string, unknown>;
}

/**
 * Zod schema for CreateProjectDTO validation
 */
export const CreateProjectDTOSchema = z.object({
  name: z.string().min(1),
  sourceRepoPath: z.string().min(1),
  sourceRepoUrl: z.string().url().optional().or(z.literal('')),
  defaultBranch: z.string().min(1).optional(),
  defaultAgent: AgentKeySchema.optional(),
  agentParams: AgentParamsSchema.optional(),
});

/**
 * DTO for updating an existing project
 */
export interface UpdateProjectDTO {
  name?: string;
  sourceRepoUrl?: string;
  defaultAgent?: AgentKey;
  agentParams?: Record<string, unknown>;
}

/**
 * Zod schema for UpdateProjectDTO validation
 */
export const UpdateProjectDTOSchema = z.object({
  name: z.string().min(1).optional(),
  sourceRepoUrl: z.string().url().optional().or(z.literal('')),
  defaultAgent: AgentKeySchema.optional(),
  agentParams: AgentParamsSchema.optional(),
});

// ============================================================================
// ChangeSet Request DTOs
// ============================================================================

/**
 * DTO for creating a new changeset
 */
export interface CreateChangesetDTO {
  projectId: string;
  title: string;
  body?: string;
  baseBranch: string;
}

/**
 * Zod schema for CreateChangesetDTO validation
 */
export const CreateChangesetDTOSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  body: z.string().optional().or(z.literal('')),
  baseBranch: z.string().min(1),
});

// ============================================================================
// AgentRun Request DTOs
// ============================================================================

/**
 * DTO for triggering an agent run
 */
export interface TriggerAgentRunDTO {
  agentKey: string;
  inputSummary?: string;
  prompt: string;
  config: {
    executablePath: string;
    baseArgs?: string[];
  };
}

/**
 * Zod schema for TriggerAgentRunDTO validation
 */
export const TriggerAgentRunDTOSchema = z.object({
  agentKey: z.string().min(1),
  inputSummary: z.string().optional().or(z.literal('')),
  prompt: z.string().min(1),
  config: z.object({
    executablePath: z.string().min(1),
    baseArgs: z.array(z.string()).optional(),
  }),
});

// ============================================================================
// Import Request DTOs
// ============================================================================

/**
 * DTO for creating a new import
 */
export interface CreateImportDTO {
  targetRepoId: string;
}

/**
 * Zod schema for CreateImportDTO validation
 */
export const CreateImportDTOSchema = z.object({
  targetRepoId: z.string().uuid(),
});

// ============================================================================
// Review Request DTOs
// ============================================================================

/**
 * DTO for creating a review thread
 */
export interface CreateThreadDTO {
  severity: 'info' | 'warning' | 'error';
  anchor: {
    filePath: string;
    lineNumber: number;
  };
}

/**
 * Zod schema for CreateThreadDTO validation
 */
export const CreateThreadDTOSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  anchor: z.object({
    filePath: z.string().min(1),
    lineNumber: z.number().int().min(1),
  }),
});

/**
 * DTO for addressing a review thread with an agent
 */
export interface AddressWithAgentDTO {
  agentKey: string;
  prompt: string;
  inputSummary?: string;
}

/**
 * Zod schema for AddressWithAgentDTO validation
 */
export const AddressWithAgentDTOSchema = z.object({
  agentKey: z.string().min(1),
  prompt: z.string().min(1),
  inputSummary: z.string().optional(),
});

/**
 * DTO for creating a review comment
 */
export interface CreateCommentDTO {
  body: string;
}

/**
 * Zod schema for CreateCommentDTO validation
 */
export const CreateCommentDTOSchema = z.object({
  body: z.string().min(1),
});

// ============================================================================
// TargetRepo Request DTOs
// ============================================================================

/**
 * DTO for creating a new target repository
 */
export interface CreateTargetRepoDTO {
  name: string;
  repoPath: string;
}

/**
 * Zod schema for CreateTargetRepoDTO validation
 */
export const CreateTargetRepoDTOSchema = z.object({
  name: z.string().min(1),
  repoPath: z.string().min(1),
});

// ============================================================================
// WorkItem Request DTOs
// ============================================================================

/**
 * DTO for creating a new work item
 */
export interface CreateWorkItemDTO {
  projectId: string;
  type: WorkItemType;
  title: string;
  body?: string;
}

/**
 * Zod schema for CreateWorkItemDTO validation
 */
export const CreateWorkItemDTOSchema = z.object({
  projectId: z.string().min(1),
  type: WorkItemTypeSchema,
  title: z.string().min(1),
  body: z.string().optional(),
});

/**
 * DTO for updating a work item
 */
export interface UpdateWorkItemDTO {
  title?: string;
  body?: string;
  status?: WorkItemStatus;
}

/**
 * Zod schema for UpdateWorkItemDTO validation
 */
export const UpdateWorkItemDTOSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  status: WorkItemStatusSchema.optional(),
});

// ============================================================================
// Worktree Request DTOs
// ============================================================================

/**
 * DTO for removing a worktree
 */
export interface RemoveWorktreeDTO {
  worktreePath: string;
}

/**
 * Zod schema for RemoveWorktreeDTO validation
 */
export const RemoveWorktreeDTOSchema = z.object({
  worktreePath: z.string().min(1),
});
