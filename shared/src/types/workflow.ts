import { z } from 'zod';

export type WorkflowNodeType = 'event' | 'agent' | 'git' | 'github' | 'ci';
export type SessionMode = 'new' | 'reuse';
export type TransitionTrigger = 'success' | 'failure' | 'conflict' | 'blocked';
export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'skipped';

export const WorkflowNodeTypeSchema = z.enum(['event', 'agent', 'git', 'github', 'ci']);
export const SessionModeSchema = z.enum(['new', 'reuse']);
export const TransitionTriggerSchema = z.enum(['success', 'failure', 'conflict', 'blocked']);

export const NodeDisplaySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const NodeSessionSchema = z.object({
  mode: SessionModeSchema,
  from: z.string().optional(),
  export: z.boolean().optional(),
});

export const NodeInputSchema = z.object({
  useWorkitemContext: z.boolean(),
  extra: z.record(z.unknown()).optional(),
});

export const ArtifactSchema = z.object({
  id: z.string(),
  kind: z.enum(['log', 'json', 'text', 'patch', 'session']),
  ref: z.string(),
});

export const NodeOutputsSchema = z.object({
  exports: z.array(z.string()).optional(),
  artifacts: z.array(ArtifactSchema).optional(),
});

export const RetryConfigSchema = z.object({
  maxAttempts: z.number().int().positive(),
  backoffSeconds: z.number().nonnegative(),
});

export const GateConditionSchema = z.object({
  expr: z.string().optional(),
});

const WorkflowNodeBaseSchema = z.object({
  id: z.string(),
  type: WorkflowNodeTypeSchema,
  immutable: z.boolean().optional(),
  display: NodeDisplaySchema.optional(),
  event: z.string().optional(),
  session: NodeSessionSchema.optional(),
  input: NodeInputSchema.optional(),
  prompt: z.string().optional(),
  action: z.string().optional(),
  with: z.record(z.unknown()).optional(),
  when: GateConditionSchema.optional(),
  retry: RetryConfigSchema.optional(),
  outputs: NodeOutputsSchema.optional(),
});

export const WorkflowNodeSchema = WorkflowNodeBaseSchema;

export const SlotSchema = z.object({
  id: z.string(),
  after: z.string(),
  before: z.string(),
  allowInsert: z.boolean(),
  allowedNodeTypes: z.array(WorkflowNodeTypeSchema),
});

const ExtensionNodeSchema = z
  .object({
    slot: z.string(),
  })
  .and(WorkflowNodeBaseSchema);

export const ExtensionsSchema = z.object({
  nodes: z.array(ExtensionNodeSchema),
});

export const TransitionSchema = z.object({
  from: z.string(),
  on: TransitionTriggerSchema,
  to: z.string(),
});

export const SyncRuleSchema = z.object({
  when: GateConditionSchema,
  satisfyStep: z.string(),
  setOutputs: z.record(z.unknown()).optional(),
});

export const SyncConfigSchema = z.object({
  mode: z.literal('reconcile'),
  sources: z.array(z.string()),
  rules: z.array(SyncRuleSchema),
});

export const ControlSchema = z.object({
  extraNodes: z.array(WorkflowNodeSchema).optional(),
  transitions: z.array(TransitionSchema).optional(),
  sync: SyncConfigSchema.optional(),
});

export const CommitPolicySchema = z.object({
  requireIntentionalStaging: z.boolean(),
  allowGitAddAll: z.boolean(),
  requireCommitBody: z.boolean(),
  message: z.object({
    subjectMaxLen: z.number().int().positive(),
  }),
});

export const CIPolicySchema = z.object({
  requiredChecks: z.array(z.string()),
});

export const MergePolicySchema = z.object({
  requireGreenChecks: z.boolean(),
  method: z.enum(['merge', 'squash', 'rebase']),
  onConflict: z.literal('transition'),
});

export const WorkflowPolicySchema = z.object({
  commit: CommitPolicySchema,
  ci: CIPolicySchema,
  merge: MergePolicySchema,
});

export const WorkitemNormalizationSchema = z.object({
  trimWhitespace: z.boolean(),
  stripHtml: z.boolean(),
  maxChars: z.number().int().positive(),
});

export const WorkitemContextSchema = z.object({
  titleRef: z.string(),
  descriptionRef: z.string(),
  descriptionUserEditable: z.boolean(),
  normalization: WorkitemNormalizationSchema,
});

export const WorkflowContextSchema = z.object({
  workitem: WorkitemContextSchema,
});

export const PromptTemplatesSchema = z.record(z.string());

export const PromptsConfigSchema = z.object({
  templates: PromptTemplatesSchema,
});

const WorkflowBaseSchema = z.object({
  version: z.number().int().positive(),
  workflow: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    context: WorkflowContextSchema,
    prompts: PromptsConfigSchema,
    backbone: z.array(WorkflowNodeSchema),
    slots: z.array(SlotSchema),
    extensions: ExtensionsSchema,
    control: ControlSchema,
    policy: WorkflowPolicySchema,
  }),
});

export const WorkflowSchema = WorkflowBaseSchema;

export const StepStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'blocked',
  'skipped',
]);

export const WorkflowRunSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  workItemId: z.string(),
  status: StepStatusSchema,
  currentStepId: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const StepExecutionSchema = z.object({
  id: z.string(),
  runId: z.string(),
  nodeId: z.string(),
  status: StepStatusSchema,
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  outputs: z.record(z.unknown()),
  artifacts: z.array(ArtifactSchema),
});

export type WorkflowDTO = z.infer<typeof WorkflowSchema>;
export type WorkflowRunDTO = z.infer<typeof WorkflowRunSchema>;
export type StepExecutionDTO = z.infer<typeof StepExecutionSchema>;

export interface NodeDisplay {
  name: string;
  description?: string;
}

export interface NodeSession {
  mode: SessionMode;
  from?: string;
  export?: boolean;
}

export interface NodeInput {
  useWorkitemContext: boolean;
  extra?: Record<string, unknown>;
}

export interface Artifact {
  id: string;
  kind: 'log' | 'json' | 'text' | 'patch' | 'session';
  ref: string;
}

export interface NodeOutputs {
  exports?: string[];
  artifacts?: Artifact[];
}

export interface RetryConfig {
  maxAttempts: number;
  backoffSeconds: number;
}

export interface GateCondition {
  expr?: string;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  immutable?: boolean;
  display?: NodeDisplay;
  event?: string;
  session?: NodeSession;
  input?: NodeInput;
  prompt?: string;
  action?: string;
  with?: Record<string, unknown>;
  when?: GateCondition;
  retry?: RetryConfig;
  outputs?: NodeOutputs;
}

export interface Slot {
  id: string;
  after: string;
  before: string;
  allowInsert: boolean;
  allowedNodeTypes: WorkflowNodeType[];
}

export interface ExtensionNode extends WorkflowNode {
  slot: string;
}

export interface Extensions {
  nodes: ExtensionNode[];
}

export interface Transition {
  from: string;
  on: TransitionTrigger;
  to: string;
}

export interface SyncRule {
  when: GateCondition;
  satisfyStep: string;
  setOutputs?: Record<string, unknown>;
}

export interface SyncConfig {
  mode: 'reconcile';
  sources: string[];
  rules: SyncRule[];
}

export interface Control {
  extraNodes?: WorkflowNode[];
  transitions?: Transition[];
  sync?: SyncConfig;
}

export interface CommitPolicy {
  requireIntentionalStaging: boolean;
  allowGitAddAll: boolean;
  requireCommitBody: boolean;
  message: {
    subjectMaxLen: number;
  };
}

export interface CIPolicy {
  requiredChecks: string[];
}

export interface MergePolicy {
  requireGreenChecks: boolean;
  method: 'merge' | 'squash' | 'rebase';
  onConflict: 'transition';
}

export interface WorkflowPolicy {
  commit: CommitPolicy;
  ci: CIPolicy;
  merge: MergePolicy;
}

export interface WorkitemNormalization {
  trimWhitespace: boolean;
  stripHtml: boolean;
  maxChars: number;
}

export interface WorkitemContext {
  titleRef: string;
  descriptionRef: string;
  descriptionUserEditable: boolean;
  normalization: WorkitemNormalization;
}

export interface WorkflowContext {
  workitem: WorkitemContext;
}

export interface PromptTemplates {
  [templateId: string]: string;
}

export interface PromptsConfig {
  templates: PromptTemplates;
}

export interface Workflow {
  version: number;
  workflow: {
    id: string;
    name: string;
    description: string;
    context: WorkflowContext;
    prompts: PromptsConfig;
    backbone: WorkflowNode[];
    slots: Slot[];
    extensions: Extensions;
    control: Control;
    policy: WorkflowPolicy;
  };
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workItemId: string;
  status: StepStatus;
  currentStepId: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

export interface StepExecution {
  id: string;
  runId: string;
  nodeId: string;
  status: StepStatus;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  outputs: Record<string, unknown>;
  artifacts: Artifact[];
}
