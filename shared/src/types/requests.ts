/**
 * Request DTOs (Data Transfer Objects) for API requests
 * These types define the structure of request payloads
 */

import { z } from 'zod';
import type { AgentKey, WorkItemType, WorkItemStatus } from './models.js';
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

// ============================================================================
// Manual File Operations Request DTOs
// ============================================================================

/**
 * DTO for creating a new file
 */
export interface CreateFileDTO {
  path: string;
  content: string;
}

/**
 * Zod schema for CreateFileDTO validation
 */
export const CreateFileDTOSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

/**
 * DTO for updating an existing file
 */
export interface UpdateFileDTO {
  path: string;
  content: string;
}

/**
 * Zod schema for UpdateFileDTO validation
 */
export const UpdateFileDTOSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

/**
 * DTO for deleting a file
 */
export interface DeleteFileDTO {
  path: string;
}

/**
 * Zod schema for DeleteFileDTO validation
 */
export const DeleteFileDTOSchema = z.object({
  path: z.string().min(1),
});

/**
 * DTO for committing changes
 */
export interface CommitChangesDTO {
  message: string;
}

/**
 * Zod schema for CommitChangesDTO validation
 */
export const CommitChangesDTOSchema = z.object({
  message: z.string().min(1),
});

/**
 * DTO for getting or creating a manual WorkItem
 */
export interface GetOrCreateManualWorkItemDTO {
  title?: string;
}

/**
 * Zod schema for GetOrCreateManualWorkItemDTO validation
 */
export const GetOrCreateManualWorkItemDTOSchema = z.object({
  title: z.string().optional(),
});

export interface CreateWorkflowDTO {
  name: string;
  description: string;
  definition: any;
  isDefault?: boolean;
}

export const CreateWorkflowDTOSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  definition: z.any(),
  isDefault: z.boolean().optional(),
});

export interface UpdateWorkflowDTO {
  name?: string;
  description?: string;
  definition?: any;
  isDefault?: boolean;
}

export const UpdateWorkflowDTOSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  definition: z.any().optional(),
  isDefault: z.boolean().optional(),
});

export interface ExecuteWorkflowDTO {
  workItemId: string;
}

export const ExecuteWorkflowDTOSchema = z.object({
  workItemId: z.string().uuid(),
});
