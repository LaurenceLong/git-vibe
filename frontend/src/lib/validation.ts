/**
 * Zod validation schemas for form inputs and API requests
 */

import { z } from 'zod';
import {
  TriggerAgentRunDTOSchema,
  UpdateWorkItemDTOSchema,
  CreateThreadDTOSchema,
  CreateCommentDTOSchema,
} from 'git-vibe-shared';

// ============================================================================
// Re-export shared schemas
// ============================================================================

export {
  TriggerAgentRunDTOSchema,
  UpdateWorkItemDTOSchema,
  CreateThreadDTOSchema,
  CreateCommentDTOSchema,
} from 'git-vibe-shared';

// ============================================================================
// Frontend-specific validation schemas with custom error messages
// ============================================================================

/**
 * Schema for creating a new pull request (with custom error messages)
 */
export const CreatePullRequestSchema = z.object({
  workItemId: z.string().min(1, 'Work Item ID is required'),
  title: z.string().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  description: z.string().max(5000, 'Description must be less than 5000 characters').optional(),
  sourceBranch: z.string().min(1, 'Source branch is required'),
  targetBranch: z.string().min(1, 'Target branch is required'),
  mergeStrategy: z
    .enum(['merge', 'squash', 'rebase'], {
      required_error: 'Merge strategy is required',
    })
    .default('merge'),
});

export type CreatePullRequestInput = z.infer<typeof CreatePullRequestSchema>;

/**
 * Schema for creating a new project (with custom error messages)
 */
export const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  sourceRepoPath: z.string().min(1, 'Repository path is required'),
  defaultBranch: z.string().min(1, 'Default branch is required').optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

/**
 * Schema for creating a new agent run (with custom error messages)
 */
export const CreateAgentRunSchema = TriggerAgentRunDTOSchema;

export type CreateAgentRunInput = z.infer<typeof CreateAgentRunSchema>;

/**
 * Schema for creating a new review thread (with custom error messages)
 * Uses the new structure with severity and anchor fields
 */
export const CreateThreadSchema = CreateThreadDTOSchema;

export type CreateThreadInput = z.infer<typeof CreateThreadSchema>;

/**
 * Schema for adding a comment to a review thread (with custom error messages)
 */
export const AddCommentSchema = CreateCommentDTOSchema;

export type AddCommentInput = z.infer<typeof AddCommentSchema>;

/**
 * Schema for creating a new WorkItem (with custom error messages)
 */
export const CreateWorkItemSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  type: z.enum(['issue', 'feature-request'], {
    required_error: 'Type is required',
  }),
  title: z.string().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  body: z.string().max(5000, 'Description must be less than 5000 characters').optional(),
});

export type CreateWorkItemInput = z.infer<typeof CreateWorkItemSchema>;

/**
 * Schema for updating a WorkItem (with custom error messages)
 */
export const UpdateWorkItemSchema = UpdateWorkItemDTOSchema;

export type UpdateWorkItemInput = z.infer<typeof UpdateWorkItemSchema>;
