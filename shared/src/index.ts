/**
 * GitVibe Shared Types Package
 *
 * This package provides shared TypeScript types and Zod validation schemas
 * for use across the backend and frontend applications.
 *
 * All date fields use ISO 8601 string format for API compatibility.
 */

// ============================================================================
// Codec Schemas
// ============================================================================

export { zIsoDateTimeString, zIsoDateTimeNullable } from './codec/datetime.js';

// ============================================================================
// Status Constants
// ============================================================================

export {
  PR_STATUS_OPEN,
  PR_STATUS_MERGED,
  PR_STATUS_CLOSED,
  WORKITEM_STATUS_OPEN,
  WORKITEM_STATUS_CLOSED,
  WORKSPACE_STATUS_NOT_INITIALIZED,
  WORKSPACE_STATUS_READY,
  WORKSPACE_STATUS_ERROR,
  AGENT_RUN_STATUS_QUEUED,
  AGENT_RUN_STATUS_RUNNING,
  AGENT_RUN_STATUS_SUCCEEDED,
  AGENT_RUN_STATUS_FAILED,
  AGENT_RUN_STATUS_CANCELED,
  RESOURCE_STATUS_SUCCEEDED,
  RESOURCE_STATUS_FAILED,
  RESOURCE_STATUS_CANCELED,
  WORKFLOW_RUN_STATUS_PENDING,
  WORKFLOW_RUN_STATUS_RUNNING,
  WORKFLOW_RUN_STATUS_SUCCEEDED,
  WORKFLOW_RUN_STATUS_FAILED,
  WORKFLOW_RUN_STATUS_BLOCKED,
  WORKFLOW_RUN_STATUS_SKIPPED,
  NODE_RUN_STATUS_PENDING,
  NODE_RUN_STATUS_RUNNING,
  NODE_RUN_STATUS_SUCCEEDED,
  NODE_RUN_STATUS_FAILED,
  NODE_RUN_STATUS_CANCELED,
  NODE_RUN_STATUS_BLOCKED,
} from './constants/status.js';

// ============================================================================
// Common Types
// ============================================================================

export type { ErrorResponse, SuccessResponse, PaginatedResponse } from './types/common.js';

export {
  ErrorResponseSchema,
  createSuccessResponseSchema,
  createPaginatedResponseSchema,
} from './types/common.js';

// ============================================================================
// Model Types
// ============================================================================

export type {
  WorkItem,
  WorkItemType,
  WorkItemStatus,
  WorkspaceStatus,
  Project,
  PullRequest,
  PullRequestStatus,
  MergeStrategy,
  ReviewThread,
  ReviewThreadStatus,
  ReviewThreadSeverity,
  ReviewComment,
  Task,
  Worktree,
  GitOp,
  AgentRun,
  AgentRunStatus,
  AgentKey,
  RepoFile,
  Commit,
  CommitWithTask,
  AgentModel,
  AgentParams,
  // Schema-first DTO types (inferred from Zod schemas)
  WorkItemDTO,
  ProjectDTO,
  PullRequestDTO,
  ReviewThreadDTO,
  ReviewCommentDTO,
  TaskDTO,
  WorktreeDTO,
  GitOpDTO,
  AgentRunDTO,
} from './types/models.js';

export {
  WorkItemTypeSchema,
  WorkItemStatusSchema,
  WorkspaceStatusSchema,
  PullRequestStatusSchema,
  MergeStrategySchema,
  AgentRunStatusSchema,
  ReviewThreadStatusSchema,
  ReviewThreadSeveritySchema,
  AgentKeySchema,
  WorkItemSchema,
  ProjectSchema,
  PullRequestSchema,
  ReviewThreadSchema,
  ReviewCommentSchema,
  TaskSchema,
  WorktreeSchema,
  GitOpSchema,
  AgentRunSchema,
  RepoFileSchema,
  CommitSchema,
  CommitWithTaskSchema,
  AgentModelSchema,
  AgentParamsSchema,
} from './types/models.js';

// ============================================================================
// Request DTOs
// ============================================================================

export type {
  CreateProjectDTO,
  UpdateProjectDTO,
  TriggerAgentRunDTO,
  CreateThreadDTO,
  AddressWithAgentDTO,
  CreateCommentDTO,
  CreateWorkItemDTO,
  UpdateWorkItemDTO,
  RemoveWorktreeDTO,
  CreateFileDTO,
  UpdateFileDTO,
  DeleteFileDTO,
  CommitChangesDTO,
  GetOrCreateManualWorkItemDTO,
  CreateWorkflowDTO,
  UpdateWorkflowDTO,
  ExecuteWorkflowDTO,
} from './types/requests.js';

export {
  CreateProjectDTOSchema,
  UpdateProjectDTOSchema,
  TriggerAgentRunDTOSchema,
  CreateThreadDTOSchema,
  AddressWithAgentDTOSchema,
  CreateCommentDTOSchema,
  CreateWorkItemDTOSchema,
  UpdateWorkItemDTOSchema,
  RemoveWorktreeDTOSchema,
  CreateFileDTOSchema,
  UpdateFileDTOSchema,
  DeleteFileDTOSchema,
  CommitChangesDTOSchema,
  GetOrCreateManualWorkItemDTOSchema,
  CreateWorkflowDTOSchema,
  UpdateWorkflowDTOSchema,
  ExecuteWorkflowDTOSchema,
} from './types/requests.js';

// ============================================================================
// Response DTOs
// ============================================================================

export type {
  ModelsResponse,
  FilesResponse,
  FileContentResponse,
  BranchesResponse,
  SyncResponse,
  DiffResponse,
  CancelAgentRunResponse,
  RemoveWorktreeResponse,
  DeleteProjectResponse,
  ResolveThreadResponse,
  UnresolveThreadResponse,
  ProjectStatsDTO,
  ProjectsListResponseDTO,
  SearchResponseDTO,
} from './types/responses.js';

export {
  ModelsResponseSchema,
  FilesResponseSchema,
  FileContentResponseSchema,
  BranchesResponseSchema,
  SyncResponseSchema,
  DiffResponseSchema,
  CancelAgentRunResponseSchema,
  RemoveWorktreeResponseSchema,
  DeleteProjectResponseSchema,
  ResolveThreadResponseSchema,
  UnresolveThreadResponseSchema,
  ProjectStatsSchema,
  ProjectsListResponseSchema,
  SearchResponseSchema,
  WorkflowResponseSchema,
  WorkflowListItemSchema,
  WorkflowRunResponseSchema,
} from './types/responses.js';

export type {
  ResourceKind,
  ResourceStatus,
  ResourceType,
  NodeRunStatus,
  WorkflowEvent,
  EventSubject,
  EventCausedBy,
  NodeSpec,
  NodeRun,
  Workflow,
  WorkflowDefinition,
  WorkflowBackbone,
  WorkflowExtensions,
  Slot,
  ExecutorRegistry,
  WorkflowPolicies,
  WorkflowRun,
  WorkflowDTO,
  WorkflowRunDTO,
  NodeRunDTO,
} from './types/workflow.js';

export {
  ResourceKindSchema,
  ResourceStatusSchema,
  ResourceTypeSchema,
  NodeRunStatusSchema,
  NodeSpecSchema,
  SlotSchema,
  ExecutorRegistrySchema,
  WorkflowPoliciesSchema,
  WorkflowBackboneSchema,
  WorkflowExtensionsSchema,
  WorkflowDefinitionSchema,
  WorkflowSchema,
  NodeRunSchema,
  WorkflowRunSchema,
} from './types/workflow.js';
