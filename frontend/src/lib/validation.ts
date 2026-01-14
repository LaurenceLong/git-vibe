/**
 * Zod validation schemas for form inputs and API requests
 */

import { z } from 'zod';

/**
 * Schema for creating a new changeset
 */
export const CreateChangeSetSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  title: z.string().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  body: z.string().max(5000, 'Description must be less than 5000 characters').optional(),
  baseBranch: z.string().min(1, 'Base branch is required'),
});

export type CreateChangeSetInput = z.infer<typeof CreateChangeSetSchema>;

/**
 * Schema for creating a new project
 */
export const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  sourceRepoPath: z.string().min(1, 'Repository path is required'),
  sourceRepoUrl: z.string().url('Invalid URL format').optional().or(z.literal('')),
  defaultBranch: z.string().min(1, 'Default branch is required').default('main'),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

/**
 * Schema for creating a new target repository
 */
export const CreateTargetRepoSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  repoPath: z.string().min(1, 'Repository path is required'),
  defaultBranch: z.string().min(1, 'Default branch is required').default('main'),
});

export type CreateTargetRepoInput = z.infer<typeof CreateTargetRepoSchema>;

/**
 * Schema for creating a new agent run
 */
export const CreateAgentRunSchema = z.object({
  agentKey: z.string().min(1, 'Agent key is required'),
  inputSummary: z
    .string()
    .max(200, 'Summary must be less than 200 characters')
    .optional()
    .or(z.literal('')),
  prompt: z.string().min(1, 'Prompt is required'),
  config: z.object({
    executablePath: z.string().min(1, 'Executable path is required'),
    baseArgs: z.array(z.string()).optional(),
  }),
});

export type CreateAgentRunInput = z.infer<typeof CreateAgentRunSchema>;

/**
 * Schema for creating a new import
 */
export const CreateImportSchema = z.object({
  targetRepoId: z.string().min(1, 'Target repository is required'),
});

export type CreateImportInput = z.infer<typeof CreateImportSchema>;

/**
 * Schema for creating a new review thread
 */
export const CreateThreadSchema = z.object({
  file: z.string().min(1, 'File path is required'),
  line: z.number().int().min(1, 'Line number must be positive'),
  comment: z.string().min(1, 'Comment is required'),
});

export type CreateThreadInput = z.infer<typeof CreateThreadSchema>;

/**
 * Schema for adding a comment to a review thread
 */
export const AddCommentSchema = z.object({
  comment: z.string().min(1, 'Comment is required'),
});

export type AddCommentInput = z.infer<typeof AddCommentSchema>;

/**
 * Schema for creating a new WorkItem
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
 * Schema for updating a WorkItem
 */
export const UpdateWorkItemSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .optional(),
  body: z.string().max(5000, 'Description must be less than 5000 characters').optional(),
  status: z.enum(['open', 'closed']).optional(),
});

export type UpdateWorkItemInput = z.infer<typeof UpdateWorkItemSchema>;
