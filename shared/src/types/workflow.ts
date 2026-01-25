import { z } from 'zod';

// ============================================================================
// Resource Types (Optimized Design - 7 allowed types only)
// ============================================================================

export type ResourceKind = 'workitem' | 'task' | 'pr_request' | 'worktree';

export type ResourceStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'blocked';

export const ResourceKindSchema = z.enum(['workitem', 'task', 'pr_request', 'worktree']);

export const ResourceStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'canceled',
  'blocked',
]);

// ============================================================================
// Resource Type Enum (Optimized Design)
// ============================================================================

export type ResourceType =
  | 'WorkItem'
  | 'Worktree'
  | 'Task'
  | 'AgentRun'
  | 'PullRequest'
  | 'GitOps'
  | 'CommandExec';

export const ResourceTypeSchema = z.enum([
  'WorkItem',
  'Worktree',
  'Task',
  'AgentRun',
  'PullRequest',
  'GitOps',
  'CommandExec',
]);

// ============================================================================
// Event Envelope (Uniform Format)
// ============================================================================

export interface EventSubject {
  kind: ResourceKind;
  id: string;
}

export interface EventCausedBy {
  workflowRunId?: string;
  nodeId?: string;
  nodeRunId?: string;
  attempt?: number;
}

export interface WorkflowEvent {
  eventId: string;
  type: string;
  at: string; // ISO 8601 timestamp
  subject: EventSubject;
  resourceVersion?: number;
  causedBy?: EventCausedBy;
  workItemId?: string; // WorkItem ID for events related to work items
  data: Record<string, unknown>;
}

// ============================================================================
// NodeSpec Types (Optimized Design)
// ============================================================================

// Removed WorkflowNodeType - nodes are uniform in optimized design

export type NodeRunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'blocked';

export const NodeRunStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'canceled',
  'blocked',
]);

export interface NodeDisplay {
  name: string;
  description?: string;
}

export interface NodeSubject {
  kind: ResourceKind;
  idRef: string; // Expression resolving to an id
}

export interface ListenRule {
  on: string; // Event type pattern
  when?: string; // Optional boolean expression
}

export interface NodeEmit {
  type: string;
  data: Record<string, unknown>;
}

export interface ResourceCallSpec {
  resourceType: ResourceType; // One of 7 allowed resource types
  idempotencyKey?: string; // Optional idempotency key
  input: Record<string, unknown>;
}

export interface NodeTrigger {
  when: string; // Boolean expression
  call: ResourceCallSpec;
  emit?: NodeEmit[];
}

export interface ResourcePatch {
  [resourceKind: string]: Record<string, unknown>;
}

export interface OnResultRule {
  when: string; // Boolean expression (evaluates against resource result event)
  patch?: ResourcePatch; // Patches to apply (explicit per resource type)
  emit?: NodeEmit[];
}

export interface NodeSpec {
  id: string;
  display?: NodeDisplay;
  subject: NodeSubject;
  listens: ListenRule[];
  trigger: NodeTrigger;
  onResult: OnResultRule[];
  retry?: {
    maxAttempts: number;
    backoffSeconds: number;
  };
}

// ============================================================================
// NodeRun (Execution Instance - Only Runtime Object)
// ============================================================================

export interface NodeRun {
  runId: string;
  workflowRunId: string;
  nodeId: string;
  resourceType: ResourceType;
  subjectKind: ResourceKind;
  subjectId: string;
  subjectVersionAtStart: number;
  status: NodeRunStatus;
  attempt: number;
  idempotencyKey?: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

// ============================================================================
// Workflow Structure (Optimized Design)
// ============================================================================

export interface Slot {
  id: string;
  after: string;
  before: string;
  allowInsert: boolean;
  allowedNodeTypes: ResourceType[];
}

export interface ExecutorRegistry {
  [executorName: string]: Record<string, never>;
}

export interface WorkflowPolicies {
  locks?: {
    defaultLockScope?: 'workitem' | 'task' | 'pr_request';
  };
  git?: {
    allowGitAddAll?: boolean;
  };
  merge?: {
    requireGreenChecks?: boolean;
    method?: 'merge' | 'squash' | 'rebase';
  };
  command?: {
    allowedShells?: string[];
    denyPatterns?: string[];
  };
}

export interface WorkflowBackbone {
  nodes: NodeSpec[];
  slots: Slot[];
}

export interface WorkflowExtensions {
  nodes: NodeSpec[];
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  backbone: WorkflowBackbone;
  extensions: WorkflowExtensions;
  executors: {
    registry: ExecutorRegistry;
  };
  policies: WorkflowPolicies;
}

export interface Workflow {
  version: number;
  workflow: WorkflowDefinition;
}

// ============================================================================
// WorkflowRun (Execution Tracking)
// ============================================================================

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workItemId: string;
  status: NodeRunStatus;
  currentStepId: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

// ============================================================================
// Zod Schemas (for validation)
// ============================================================================

export const NodeDisplaySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const NodeSubjectSchema = z.object({
  kind: ResourceKindSchema,
  idRef: z.string(),
});

export const ListenRuleSchema = z.object({
  on: z.string(),
  when: z.string().optional(),
});

export const NodeEmitSchema = z.object({
  type: z.string(),
  data: z.record(z.unknown()),
});

export const ResourceCallSpecSchema = z.object({
  resourceType: ResourceTypeSchema,
  idempotencyKey: z.string().optional(),
  input: z.record(z.unknown()),
});

export const NodeTriggerSchema = z.object({
  when: z.string(),
  call: ResourceCallSpecSchema,
  emit: z.array(NodeEmitSchema).optional(),
});

export const OnResultRuleSchema = z.object({
  when: z.string(),
  patch: z.record(z.record(z.unknown())).optional(),
  emit: z.array(NodeEmitSchema).optional(),
});

export const NodeSpecSchema: z.ZodType<NodeSpec> = z.object({
  id: z.string(),
  display: NodeDisplaySchema.optional(),
  subject: NodeSubjectSchema,
  listens: z.array(ListenRuleSchema),
  trigger: NodeTriggerSchema,
  onResult: z.array(OnResultRuleSchema),
  retry: z
    .object({
      maxAttempts: z.number().int().positive(),
      backoffSeconds: z.number().nonnegative(),
    })
    .optional(),
});

export const SlotSchema = z.object({
  id: z.string(),
  after: z.string(),
  before: z.string(),
  allowInsert: z.boolean(),
  allowedNodeTypes: z.array(ResourceTypeSchema),
});

export const ExecutorRegistrySchema = z.record(z.record(z.never()));

export const WorkflowPoliciesSchema = z.object({
  locks: z
    .object({
      defaultLockScope: z.enum(['workitem', 'task', 'pr_request']).optional(),
    })
    .optional(),
  git: z
    .object({
      allowGitAddAll: z.boolean().optional(),
    })
    .optional(),
  merge: z
    .object({
      requireGreenChecks: z.boolean().optional(),
      method: z.enum(['merge', 'squash', 'rebase']).optional(),
    })
    .optional(),
  command: z
    .object({
      allowedShells: z.array(z.string()).optional(),
      denyPatterns: z.array(z.string()).optional(),
    })
    .optional(),
});

export const WorkflowBackboneSchema = z.object({
  nodes: z.array(NodeSpecSchema),
  slots: z.array(SlotSchema),
});

export const WorkflowExtensionsSchema = z.object({
  nodes: z.array(NodeSpecSchema),
});

export const WorkflowDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  backbone: WorkflowBackboneSchema,
  extensions: WorkflowExtensionsSchema,
  executors: z.object({
    registry: ExecutorRegistrySchema,
  }),
  policies: WorkflowPoliciesSchema,
});

export const WorkflowSchema = z.object({
  version: z.number().int().positive(),
  workflow: WorkflowDefinitionSchema,
});

export const NodeRunSchema = z.object({
  runId: z.string(),
  workflowRunId: z.string(),
  nodeId: z.string(),
  resourceType: ResourceTypeSchema,
  subjectKind: ResourceKindSchema,
  subjectId: z.string(),
  subjectVersionAtStart: z.number(),
  status: NodeRunStatusSchema,
  attempt: z.number(),
  idempotencyKey: z.string().optional(),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});

export const WorkflowRunSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  workItemId: z.string(),
  status: NodeRunStatusSchema,
  currentStepId: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type WorkflowDTO = z.infer<typeof WorkflowSchema>;
export type WorkflowRunDTO = z.infer<typeof WorkflowRunSchema>;
export type NodeRunDTO = z.infer<typeof NodeRunSchema>;
