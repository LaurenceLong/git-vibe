import type { Workflow, NodeSpec } from 'git-vibe-shared';
import {
  PR_STATUS_OPEN,
  PR_STATUS_MERGED,
  WORKITEM_STATUS_OPEN,
  WORKSPACE_STATUS_READY,
  RESOURCE_STATUS_SUCCEEDED,
  RESOURCE_STATUS_FAILED,
} from 'git-vibe-shared';

/**
 * Gets the current default workflow version
 * Update this when making breaking changes to the default workflow
 */
export function getDefaultWorkflowVersion(): number {
  return 17; // Incremented to force workflow update - fixes sequential task execution and prevents multiple task conflicts
}

/**
 * Extracts version from a workflow definition
 */
export function getWorkflowVersion(workflow: Workflow | string): number {
  if (typeof workflow === 'string') {
    try {
      const parsed = JSON.parse(workflow);
      return parsed.version ?? 1;
    } catch {
      return 1;
    }
  }
  return workflow.version ?? 1;
}

/**
 * Creates a default workflow when none exists in the database
 * Implements the optimized workflow design with NodeSpec format (listen/start/completeWhen/reconcile)
 */
export function createDefaultWorkflow(projectId?: string): Workflow {
  const workflowVersion = getDefaultWorkflowVersion();
  const workflowId = projectId
    ? `workitem-default-v${workflowVersion}-${projectId}`
    : `workitem-default-v${workflowVersion}`;

  // Event node: workitem created - marker/anchor node
  // This node listens to workitem.created and emits workflow.anchor.reached immediately
  // It doesn't need to wait for resource completion, so trigger.emit is used
  const evWorkitemCreated: NodeSpec = {
    id: 'ev_workitem_created',
    display: { name: 'WorkItem created (anchor)' },
    subject: { kind: 'workitem', idRef: 'ctx.event.subject.id' },
    listens: [{ on: 'workitem.created' }],
    trigger: {
      when: 'true',
      call: {
        resourceType: 'WorkItem',
        idempotencyKey: 'workitem:{ctx.event.subject.id}:anchor:created',
        input: {},
      }, // No-op call required by design, with idempotencyKey to prevent duplicate execution
      emit: [{ type: 'workflow.anchor.reached', data: { anchor: 'workitem_created' } }],
    },
    onResult: [
      {
        // Always match after resource completes (even though it's a no-op)
        when: 'true',
        patch: {},
        emit: [], // No additional events needed - trigger.emit already fired
      },
    ],
  };

  // Worktree initialization node
  const worktreeInit: NodeSpec = {
    id: 'worktree_init',
    display: { name: 'Initialize Worktree' },
    subject: { kind: 'workitem', idRef: 'ctx.event.subject.id' },
    listens: [{ on: 'workitem.created' }, { on: 'workitem.updated' }],
    trigger: {
      when: `workitem.status == '${WORKITEM_STATUS_OPEN}' && workitem.workspaceStatus != '${WORKSPACE_STATUS_READY}'`,
      call: {
        resourceType: 'Worktree',
        idempotencyKey: 'workitem:{workitem.id}:worktree:init',
        input: {
          ensureWorktree: true,
        },
      },
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}'`,
        patch: { workitem: { workspaceStatus: WORKSPACE_STATUS_READY } },
        emit: [{ type: 'workitem.workspace.ready', data: {} }],
      },
    ],
    retry: { maxAttempts: 3, backoffSeconds: 5 },
  };

  // Node: Create first task (process_workitem) when workspace is ready
  const createProcessWorkitemTask: NodeSpec = {
    id: 'create_process_workitem_task',
    display: { name: 'Create process_workitem Task' },
    subject: { kind: 'workitem', idRef: 'ctx.event.subject.id' },
    listens: [{ on: 'workitem.workspace.ready' }],
    trigger: {
      when: `workitem.status == '${WORKITEM_STATUS_OPEN}' && workitem.workspaceStatus == '${WORKSPACE_STATUS_READY}'`,
      call: {
        resourceType: 'Task',
        idempotencyKey: 'workitem:{workitem.id}:task:process_workitem:create',
        input: {
          taskType: 'process_workitem',
          status: 'pending',
          autoStart: true,
        },
      },
      emit: [],
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}' && ctx.outcome.outputs.autoStart == true`,
        patch: {},
        emit: [
          {
            type: 'task.created',
            data: {
              taskId: '{ctx.outcome.resourceId}',
              taskType: 'process_workitem',
              autoStart: true,
            },
          },
        ],
      },
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}' && ctx.outcome.outputs.autoStart != true`,
        patch: {},
        emit: [
          {
            type: 'task.created',
            data: {
              taskId: '{ctx.outcome.resourceId}',
              taskType: 'process_workitem',
              autoStart: false,
            },
          },
        ],
      },
    ],
    retry: { maxAttempts: 1, backoffSeconds: 0 },
  };

  // Node: Start task (mark running)
  const startProcessWorkitemTask: NodeSpec = {
    id: 'start_process_workitem_task',
    display: { name: 'Start Task (mark running)' },
    subject: { kind: 'task', idRef: 'ctx.event.subject.id' },
    listens: [
      { on: 'task.created', when: "task.taskType == 'process_workitem' && task.autoStart == true" },
      { on: 'task.resumeRequested', when: "task.taskType == 'process_workitem'" },
    ],
    trigger: {
      when: `task.status == 'pending' && task.cancelRequested != true`,
      call: {
        resourceType: 'Task',
        idempotencyKey: 'task:{task.id}:start',
        input: {
          taskId: '{task.id}',
          patch: { status: 'running' },
        },
      },
      emit: [],
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}'`,
        patch: {},
        emit: [
          { type: 'task.started', data: { taskId: '{task.id}', taskType: 'process_workitem' } },
        ],
      },
    ],
  };

  // Task: process workitem (agent)
  // This node listens to task.started event and creates a agent run
  const taskProcessWorkitem: NodeSpec = {
    id: 'task_process_workitem',
    display: { name: 'Task: Process WorkItem (Agent)' },
    // Best practice: task.* events should use the task itself as the subject.
    // Keep idRef a simple path (engine does not parse "||" expressions).
    subject: { kind: 'task', idRef: 'ctx.event.subject.id' },
    listens: [{ on: 'task.started', when: "task.taskType == 'process_workitem'" }],
    trigger: {
      when: `task.status == 'running' && task.currentAgentRunId == null`,
      call: {
        resourceType: 'AgentRun',
        idempotencyKey: 'task:{task.id}:agentrun:attempt:1',
        input: {
          taskId: '{task.id}',
          session: { mode: 'new', export: true },
          template:
            '## Type\n{{workitem.type}}\n\n## Title\n{{workitem.title}}\n\n## Description\n{{workitem.body}}',
        },
      },
      emit: [],
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}' || ctx.outcome.status == '${RESOURCE_STATUS_FAILED}' || ctx.outcome.status == 'canceled'`,
        patch: { task: { currentAgentRunId: '{ctx.outcome.resourceId}' } },
        emit: [
          {
            type: 'task.op.completed',
            data: {
              taskId: '{task.id}',
              agentRunId: '{ctx.outcome.resourceId}',
              status: '{ctx.outcome.status}',
              sessionId: '{ctx.outcome.outputs.sessionId}',
            },
          },
        ],
      },
    ],
    retry: { maxAttempts: 2, backoffSeconds: 30 },
  };

  // Node: Complete task from AgentRun outcome (Domain transition)
  const completeProcessWorkitemTask: NodeSpec = {
    id: 'complete_process_workitem_task',
    display: { name: 'Complete Task from AgentRun outcome' },
    subject: { kind: 'task', idRef: 'ctx.event.data.taskId' },
    listens: [{ on: 'task.op.completed', when: "task.taskType == 'process_workitem'" }],
    trigger: {
      when: 'true',
      call: {
        resourceType: 'Task',
        idempotencyKey: 'task:{task.id}:complete:from:{ctx.event.data.agentRunId}',
        input: {
          taskId: '{task.id}',
          completeFromAgentRunId: '{ctx.event.data.agentRunId}',
        },
      },
      emit: [],
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}'`,
        patch: {},
        emit: [
          {
            type: 'task.completed',
            data: {
              taskId: '{task.id}',
              taskType: 'process_workitem',
              result: '{task.status}',
              sessionId: '{ctx.event.data.sessionId}',
            },
          },
        ],
      },
    ],
  };

  // Node: Create craft_commit task when process_workitem completes successfully
  const createCraftCommitTask: NodeSpec = {
    id: 'create_craft_commit_task',
    display: { name: 'Create Craft Commit Task' },
    subject: { kind: 'workitem', idRef: 'workitem.id' },
    listens: [
      {
        on: 'task.completed',
        when: "task.taskType == 'process_workitem' && task.result == 'succeeded'",
      },
    ],
    trigger: {
      when: 'true',
      call: {
        resourceType: 'Task',
        idempotencyKey: 'workitem:{workitem.id}:task:craft_commit:create',
        input: {
          taskType: 'craft_commit',
          status: 'pending',
          autoStart: true,
        },
      },
      emit: [],
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}' && ctx.outcome.outputs.autoStart == true`,
        patch: {},
        emit: [
          {
            type: 'task.created',
            data: {
              taskId: '{ctx.outcome.resourceId}',
              taskType: 'craft_commit',
              autoStart: true,
              sessionId: '{ctx.event.data.sessionId}',
            },
          },
        ],
      },
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}' && ctx.outcome.outputs.autoStart != true`,
        patch: {},
        emit: [
          {
            type: 'task.created',
            data: {
              taskId: '{ctx.outcome.resourceId}',
              taskType: 'craft_commit',
              autoStart: false,
              sessionId: '{ctx.event.data.sessionId}',
            },
          },
        ],
      },
    ],
    retry: { maxAttempts: 1, backoffSeconds: 0 },
  };

  // Node: Start craft_commit task (mark running)
  const startCraftCommitTask: NodeSpec = {
    id: 'start_craft_commit_task',
    display: { name: 'Start Craft Commit Task (mark running)' },
    subject: { kind: 'task', idRef: 'ctx.event.subject.id' },
    listens: [
      { on: 'task.created', when: "task.taskType == 'craft_commit' && task.autoStart == true" },
      { on: 'task.resumeRequested', when: "task.taskType == 'craft_commit'" },
    ],
    trigger: {
      when: `task.status == 'pending' && task.cancelRequested != true && workitem.lockOwnerRunId == null`,
      call: {
        resourceType: 'Task',
        idempotencyKey: 'task:{task.id}:start',
        input: {
          taskId: '{task.id}',
          patch: { status: 'running' },
        },
      },
      emit: [],
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}'`,
        patch: {},
        emit: [
          {
            type: 'task.started',
            data: {
              taskId: '{task.id}',
              taskType: 'craft_commit',
              sessionId: '{ctx.event.data.sessionId}',
            },
          },
        ],
      },
    ],
  };

  // Task: craft commit (agent, same session)
  // This node creates agent run for craft_commit task
  const taskCraftCommit: NodeSpec = {
    id: 'task_craft_commit',
    display: { name: 'Task: Craft Commit (same session)' },
    // Best practice: task.* events should use the task itself as the subject.
    // Keep idRef a simple path (engine does not parse "||" expressions).
    subject: { kind: 'task', idRef: 'ctx.event.subject.id' },
    listens: [{ on: 'task.started', when: "task.taskType == 'craft_commit'" }],
    trigger: {
      when: `task.status == 'running' && task.currentAgentRunId == null`,
      call: {
        resourceType: 'AgentRun',
        idempotencyKey: 'task:{task.id}:agentrun:attempt:1',
        input: {
          taskId: '{task.id}',
          sessionId: '{ctx.event.data.sessionId}',
          template:
            'Craft a single git commit that summarizes the changes in this session. Write a clear, conventional commit message, stage the changes, and commit. Do not create new files or change code — only stage and commit existing changes.',
          policies: { allowGitAddAll: false },
        },
      },
      emit: [],
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}' || ctx.outcome.status == '${RESOURCE_STATUS_FAILED}' || ctx.outcome.status == 'canceled'`,
        patch: { task: { currentAgentRunId: '{ctx.outcome.resourceId}' } },
        emit: [
          {
            type: 'task.op.completed',
            data: {
              taskId: '{task.id}',
              agentRunId: '{ctx.outcome.resourceId}',
              status: '{ctx.outcome.status}',
            },
          },
        ],
      },
    ],
    retry: { maxAttempts: 2, backoffSeconds: 30 },
  };

  // Node: Complete craft_commit task from AgentRun outcome
  const completeCraftCommitTask: NodeSpec = {
    id: 'complete_craft_commit_task',
    display: { name: 'Complete Craft Commit Task from AgentRun result' },
    subject: { kind: 'task', idRef: 'ctx.event.data.taskId' },
    listens: [{ on: 'task.op.completed', when: "task.taskType == 'craft_commit'" }],
    trigger: {
      when: 'true',
      call: {
        resourceType: 'Task',
        idempotencyKey: 'task:{task.id}:complete:from:{ctx.event.data.agentRunId}',
        input: {
          taskId: '{task.id}',
          completeFromAgentRunId: '{ctx.event.data.agentRunId}',
        },
      },
      emit: [],
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}'`,
        patch: {},
        emit: [
          {
            type: 'task.completed',
            data: {
              taskId: '{task.id}',
              taskType: 'craft_commit',
              result: '{task.status}',
            },
          },
          { type: 'pr_request.created', data: {} },
        ],
      },
    ],
  };

  // PR Request creation node - creates PR when pr_request.created event is emitted
  const prRequestCreate: NodeSpec = {
    id: 'pr_request_create',
    display: { name: 'PR Request: Create' },
    subject: { kind: 'workitem', idRef: 'workitem.id' },
    listens: [{ on: 'pr_request.created' }],
    trigger: {
      when: 'true',
      call: {
        resourceType: 'PullRequest',
        input: {
          titleFrom: 'workitem.title',
          bodyFrom: 'workitem.description',
        },
      },
      emit: [{ type: 'pr_request.started', data: {} }],
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}'`,
        patch: {
          pr_request: {
            status: PR_STATUS_OPEN,
            prNumber: 'ctx.outcome.outputs.prNumber',
            prUrl: 'ctx.outcome.outputs.url',
          },
        },
        emit: [{ type: 'pr_request.updated', data: { status: PR_STATUS_OPEN } }],
      },
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_FAILED}'`,
        patch: {},
        emit: [],
      },
    ],
    retry: { maxAttempts: 1, backoffSeconds: 0 },
  };

  // PR Request flow
  const prRequestFlow: NodeSpec = {
    id: 'pr_request_flow',
    display: { name: 'PR Request: Update/Merge' },
    subject: { kind: 'pr_request', idRef: 'pr_request.id' },
    listens: [
      { on: 'pr_request.updated', when: `pr_request.status == '${PR_STATUS_OPEN}'` },
      { on: 'github.pr.updated' },
      { on: 'ci.checks.updated' },
    ],
    trigger: {
      when: `pr_request.status == '${PR_STATUS_OPEN}'`,
      call: {
        resourceType: 'PullRequest',
        idempotencyKey: 'pr_request:{pr_request.id}:sync',
        input: {
          sync: true,
        },
      },
      emit: [],
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}'`,
        patch: {
          pr_request: {
            status: PR_STATUS_OPEN,
            prNumber: 'ctx.outcome.outputs.prNumber',
            prUrl: 'ctx.outcome.outputs.url',
          },
        },
        emit: [{ type: 'pr_request.updated', data: { status: PR_STATUS_OPEN } }],
      },
      {
        when: `ci.requiredChecksGreen == true && pr_request.status == '${PR_STATUS_OPEN}'`,
        patch: { pr_request: { status: 'ready_to_merge' } },
        emit: [{ type: 'pr_request.updated', data: { status: 'ready_to_merge' } }],
      },
      {
        when: "pr_request.status == 'ready_to_merge'",
        patch: {},
        emit: [{ type: 'pr_request.mergeAttempted', data: {} }],
      },
    ],
    retry: { maxAttempts: 3, backoffSeconds: 20 },
  };

  // Command: lint and tests
  const cmdLintAndTests: NodeSpec = {
    id: 'cmd_lint_and_tests',
    display: { name: 'Run lint/tests (cross-platform)' },
    subject: { kind: 'worktree', idRef: 'worktree.id' },
    listens: [
      { on: 'pr_request.updated', when: `pr_request.status == '${PR_STATUS_OPEN}'` },
      { on: 'worktree.updated' },
    ],
    trigger: {
      when: 'true',
      call: {
        resourceType: 'CommandExec',
        idempotencyKey: 'workitem:{workitem.id}:headSha:{workitem.headSha}:lint_and_tests',
        input: {
          runsOn: ['linux', 'macos', 'windows'],
          workingDirectoryRef: 'worktree.path',
          env: { CI: 'true' },
          steps: [
            { name: 'Install', shell: 'bash', run: 'npm ci' },
            { name: 'Lint', shell: 'bash', run: 'npm run lint' },
            { name: 'Test', shell: 'bash', run: 'npm test' },
          ],
          windows: {
            shell: 'pwsh',
            overrideSteps: [
              { name: 'Install', run: 'npm ci' },
              { name: 'Lint', run: 'npm run lint' },
              { name: 'Test', run: 'npm test' },
            ],
          },
        },
      },
      emit: [{ type: 'command_run.started', data: {} }],
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}'`,
        patch: { worktree: { lastChecks: 'passed' } },
        emit: [{ type: 'ci.checks.updated', data: { requiredChecksGreen: true } }],
      },
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_FAILED}'`,
        patch: { worktree: { lastChecks: 'failed' } },
        emit: [{ type: 'ci.checks.updated', data: { requiredChecksGreen: false } }],
      },
    ],
    retry: { maxAttempts: 1, backoffSeconds: 0 },
  };

  // PR Merge node - merges PR when checks are green and PR is ready_to_merge
  const prMerge: NodeSpec = {
    id: 'pr_merge',
    display: { name: 'PR: Merge' },
    subject: { kind: 'pr_request', idRef: 'pr_request.id' },
    listens: [{ on: 'pr_request.mergeAttempted' }],
    trigger: {
      when: `pr_request.status == 'ready_to_merge' && ci.requiredChecksGreen == true`,
      call: {
        resourceType: 'PullRequest',
        input: {
          operation: 'merge',
          strategy: 'squash', // Use squash per workflow policy
        },
      },
      emit: [],
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}'`,
        patch: {
          pr_request: {
            status: PR_STATUS_MERGED,
            mergeCommitSha: 'ctx.outcome.outputs.mergeCommitSha',
          },
        },
        emit: [{ type: 'pr_request.merged', data: {} }],
      },
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_FAILED}'`,
        patch: {},
        emit: [],
      },
    ],
    retry: { maxAttempts: 1, backoffSeconds: 0 },
  };

  // Worktree cleanup node - cleans up worktree and branch after PR merge
  const worktreeCleanup: NodeSpec = {
    id: 'worktree_cleanup',
    display: { name: 'Cleanup Worktree' },
    subject: { kind: 'workitem', idRef: 'workitem.id' },
    listens: [{ on: 'pr_request.merged' }],
    trigger: {
      when: `pr_request.status == '${PR_STATUS_MERGED}'`,
      call: {
        resourceType: 'Worktree',
        input: {
          removeWorktree: true,
        },
      },
      emit: [],
    },
    onResult: [
      {
        when: `ctx.outcome.status == '${RESOURCE_STATUS_SUCCEEDED}'`,
        patch: {
          workitem: {
            workspaceStatus: 'not_initialized',
            worktreePath: null,
          },
        },
        emit: [{ type: 'workitem.merged', data: {} }],
      },
    ],
    retry: { maxAttempts: 1, backoffSeconds: 0 },
  };

  // Event node: merged (marker/anchor node)
  // This node marks the end of the workflow and emits an anchor event
  // It calls WorkItem resource with empty input (no-op) just to satisfy the node spec requirement
  const evMerged: NodeSpec = {
    id: 'ev_merged',
    display: { name: 'Merged (anchor)' },
    subject: { kind: 'workitem', idRef: 'workitem.id' },
    listens: [{ on: 'workitem.merged' }],
    trigger: {
      when: 'true',
      call: {
        resourceType: 'WorkItem',
        idempotencyKey: 'workitem:{workitem.id}:anchor:merged',
        input: {},
      }, // No-op call, just to satisfy spec, with idempotencyKey to prevent duplicate execution
      emit: [{ type: 'workflow.anchor.reached', data: { anchor: 'merged' } }],
    },
    onResult: [
      {
        // Always match after resource completes (WorkItem with empty input always succeeds)
        when: 'true',
        patch: {},
        emit: [], // No additional events needed, anchor already emitted in trigger
      },
    ],
  };

  return {
    version: workflowVersion,
    workflow: {
      id: workflowId,
      name: 'Default WorkItem Lifecycle',
      description:
        'Immutable backbone with insertion slots. Orchestrates WorkItem -> Tasks -> PR Request, with cross-platform command execution.',
      backbone: {
        nodes: [
          evWorkitemCreated,
          worktreeInit,
          createProcessWorkitemTask,
          startProcessWorkitemTask,
          taskProcessWorkitem,
          completeProcessWorkitemTask,
          createCraftCommitTask,
          startCraftCommitTask,
          taskCraftCommit,
          completeCraftCommitTask,
          prRequestCreate,
          prRequestFlow,
          cmdLintAndTests,
          prMerge,
          worktreeCleanup,
          evMerged,
        ],
        slots: [
          {
            id: 'slot_between_created_and_worktree',
            after: 'ev_workitem_created',
            before: 'worktree_init',
            allowInsert: true,
            allowedNodeTypes: ['CommandExec', 'AgentRun', 'GitOps', 'PullRequest'],
          },
          {
            id: 'slot_between_worktree_and_create_task',
            after: 'worktree_init',
            before: 'create_process_workitem_task',
            allowInsert: true,
            allowedNodeTypes: ['CommandExec', 'AgentRun', 'GitOps', 'PullRequest'],
          },
          {
            id: 'slot_between_commit_and_pr',
            after: 'task_craft_commit',
            before: 'pr_request_flow',
            allowInsert: true,
            allowedNodeTypes: ['CommandExec', 'GitOps'],
          },
          {
            id: 'slot_between_pr_and_merge_anchor',
            after: 'pr_request_flow',
            before: 'ev_merged',
            allowInsert: true,
            allowedNodeTypes: ['CommandExec', 'AgentRun', 'PullRequest'],
          },
        ],
      },
      extensions: {
        nodes: [],
      },
      executors: {
        registry: {},
      },
      policies: {
        locks: { defaultLockScope: 'workitem' },
        git: { allowGitAddAll: false },
        merge: { requireGreenChecks: true, method: 'squash' },
        command: {
          allowedShells: ['bash', 'sh', 'pwsh', 'cmd'],
          denyPatterns: ['rm -rf /', 'format C:'],
        },
      },
    },
  };
}
