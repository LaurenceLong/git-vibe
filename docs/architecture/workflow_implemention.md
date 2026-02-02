# Workflow Design - Implementation Details

This document describes the **actual implementation** of the optimized workflow design. See `optimized_workflow_design.md` for the design principles and assumptions.

---

## Implementation Overview

The workflow engine is implemented as an event-driven system where:

1. **WorkItem creation** emits a single `workitem.created` event
2. **Nodes listen** to events and execute sequentially
3. **Resources execute** and call completion callback (NOT event bus)
4. **Nodes react** to resource completion via callback and emit new events for next nodes

**Core Rule**: Only Nodes listen/emit events on the event bus. Resources never publish events. Resources return results via a completion callback/internal completion API, and the Node then emits downstream events.

---

## Architecture Components

### 1. WorkflowExecutionService

**Location**: `backend/src/services/workflow/WorkflowExecutionService.ts`

**Responsibilities**:

- Event loop: listens to all workflow events
- Node evaluation: finds nodes that listen to events
- Node execution: triggers nodes and handles resource completions via callback
- Context building: loads resources for expression evaluation

**Key Methods**:

- `handleEvent(event)`: Main event handler - finds listening nodes and triggers them
- `completeNodeRun(nodeRunId, outcome)`: Handles resource completion via callback - evaluates onResult rules
- `processNode(nodeSpec, runId, context)`: Processes a single node - evaluates trigger.when and calls resource
- `buildEvaluationContext()`: Builds context with workitem, tasks, PRs, etc. for expression evaluation

**Event Flow**:

```
Event arrives → handleEvent()
  ↓
Find nodes where listens.on matches event.type
  ↓
For each node: evaluate listens[].when (if present)
  ↓
Evaluate trigger.when
  ↓
If true: create NodeRun → emit trigger.emit events → call ResourceDispatcher with completion callback
  ↓
Resource executes (sync: returns outcome; async e.g. AgentRun: stores callback, returns)
  ↓
When resource finishes: complete(outcome) is invoked (sync: by dispatcher; async: by AgentService.finalizeAgentRun)
  ↓
completeNodeRun() → validates completion → evaluates onResult[*].when → apply patches → emit onResult[*].emit events
```

### 2. ResourceDispatcher

**Location**: `backend/src/services/ResourceDispatcher.ts`

**Responsibilities**:

- Single entry point for all resource calls
- Enforces idempotency at NodeRun and Resource levels
- Routes to appropriate resource handler
- Provides completion callback to resources (NOT event bus)

**Key Methods**:

- `call(resourceType, input, causedBy, idempotencyKey, complete)`: Main dispatch method with completion callback
- **Removed**: `emitResult()` method - resources no longer emit events

**Resource Handlers**:

- `WorkItemResourceHandler`: Handles `ensureTasks` and `ensurePRRequest` logic
- `WorktreeResourceHandler`: Creates/updates Worktree records and initializes worktrees
- `TaskResourceHandler`: Creates/updates Task records (Domain resource) and handles state transitions
- `AgentRunResourceHandler`: Creates AgentRun records (Op resource) linked to Tasks
- `PullRequestResourceHandler`: Creates/updates PRs
- `GitOpsResourceHandler`: Creates GitOps records and performs git operations
- `CommandExecResourceHandler`: Creates CommandExec records and executes commands

### 3. Event Bus and Outbox

**Location**:

- `backend/src/services/workflow/WorkflowEventBus.ts`
- `backend/src/services/EventOutbox.ts`

**Responsibilities**:

- `WorkflowEventBus`: Creates event envelopes, manages event listeners
- `EventOutbox`: Ensures reliable event delivery (persists events before processing)

**Event Types** (Node-emitted only):

- WorkItem: `workitem.created`, `workitem.updated`, `workitem.workspace.ready`, `workitem.merged`
- Task: `task.created`, `task.started`, `task.op.completed`, `task.completed`, `task.resumeRequested`
- PullRequest: `pr_request.created`, `pr_request.updated`, `pr_request.started`, `pr_request.mergeAttempted`, `pr_request.merged`
- Workflow: `node.started`, `node.completed`, `workflow.anchor.reached`, `worktree.updated`
- External: `github.pr.updated`, `ci.checks.updated`

**Removed**: `resource.result` event type - resources complete via callback, not event bus

---

## Callback-Based Completion Flow

### Overview

The workflow engine uses a callback-based completion mechanism instead of event bus for resource completion. This ensures that only Nodes emit events, maintaining a clean separation of concerns.

### Completion Callback Signature

```typescript
type CompleteFn = (outcome: ResourceOutcome) => Promise<void>;

interface ResourceOutcome {
  resourceType: ResourceType;
  resourceId: string;
  status: "succeeded" | "failed" | "canceled";
  summary?: string;
  outputs?: Record<string, unknown>;
}
```

### Flow Diagram

```
Node triggers
  ↓
WorkflowExecutionService.processNode()
  ↓
Create NodeRun (status: running)
  ↓
Emit trigger.emit events (if any)
  ↓
ResourceDispatcher.call(resourceType, input, causedBy, idempotencyKey, completeCallback)
  ↓
Store resourceType in NodeRun for safety validation
  ↓
DomainDispatcher/OpsDispatcher.execute() (context includes complete callback)
  ↓
Resource handler executes (sync resources: returns result; AgentRun: stores context.complete, returns)
  ↓
Completion: sync → ResourceDispatcher calls complete(outcome); AgentRun → AgentService.finalizeAgentRun() calls stored callback
  ↓
WorkflowExecutionService.completeNodeRun(nodeRunId, outcome)
  ↓
Validate:
  - NodeRun exists
  - Not already completed (exactly-once)
  - resourceType matches stored type
  ↓
Evaluate onResult rules
  ↓
Apply patches
  ↓
Emit onResult.emit events
  ↓
Update NodeRun status to terminal
```

### Exactly-Once Completion Guarantee

The engine enforces exactly-once completion using a bounded in-memory Set:

```typescript
private completedNodeRunAttempts: Set<string> = new Set();
```

- Completion key: `${nodeRunId}:${attempt}`
- Duplicate completions are ignored with a log message
- This prevents double-processing of resource outcomes

### Safety Checks

1. **Resource Type Validation**: When triggering, the engine stores `nodeRun.calledResourceType` in the NodeRuns table. On completion, it validates `outcome.resourceType == nodeRun.calledResourceType` and rejects mismatches.

2. **NodeRun Existence**: The completion callback validates that the NodeRun exists before processing.

3. **Completion Deduplication**: The `completedNodeRunAttempts` Set tracks completed `(nodeRunId, attempt)` pairs to prevent duplicate processing.

### AgentRun: Async Completion via Callback (No Events)

AgentRun is an Op resource that completes asynchronously. It still follows the rule **resources never emit events**:

1. **On start**: `ResourceDispatcher.call(AgentRun, ...)` passes `complete` in context. `AgentRunResourceHandler.execute()` starts the run via `agentService.startAgentRun()` and stores the callback with `storeAgentRunCompletionCallback(agentRun.id, context.complete)`. ResourceDispatcher does **not** call `complete()` for AgentRun.
2. **On finish**: When the agent process ends, the adapter calls `AgentService.finalizeAgentRun(agentRunId)`. That method updates the AgentRun record, then calls `getAndRemoveAgentRunCompletionCallback(agentRunId)` (from `OpsDispatcher`) and invokes the callback with a `ResourceOutcome`. That triggers `WorkflowExecutionService.completeNodeRun(nodeRunId, outcome)`, which runs onResult and emits node events (e.g. `task.op.completed`).

No `resource.result` or `agent.completed` events are emitted; completion is entirely callback-based.

---

## Default Workflow Implementation

**Location**: `backend/src/services/workflow/defaultWorkflow.ts` - `createDefaultWorkflow()`

### Workflow Steps (Sequential Execution)

1. **ev_workitem_created** (Anchor node)
   - Listens: `workitem.created`
   - Emits: `workflow.anchor.reached` (via trigger.emit)

2. **worktree_init** (Initialize worktree)
   - Listens: `workitem.created`, `workitem.updated`
   - Triggers: when `workspaceStatus != 'ready'`
   - Calls: `Worktree` resource
   - On success: patches `workspaceStatus = 'ready'`, emits `workitem.workspace.ready`

3. **create_process_workitem_task** (Create first task)
   - Listens: `workitem.workspace.ready`
   - Triggers: when `workspaceStatus == 'ready'`
   - Calls: `Task` resource with `taskType: 'process_workitem'`, `status: 'pending'`, `autoStart: true`
   - On result: emits `task.created` (taskId from ctx.outcome.resourceId)

4. **start_process_workitem_task** (Start task - mark running)
   - Listens: `task.created` (when `taskType == 'process_workitem'`)
   - Triggers: when `task.status == 'pending'`
   - Calls: `Task` resource to update status to `running`
   - On success: emits `task.started` event

5. **task_process_workitem** (Run Agent for task)
   - Listens: `task.started` (when `taskType == 'process_workitem'`)
   - Triggers: when `task.status == 'running' && task.currentAgentRunId == null`
   - Calls: `AgentRun` resource (completion callback stored; when agent finishes, `AgentService.finalizeAgentRun` invokes it)
   - On result (succeeded/failed/canceled): patches task `currentAgentRunId`, emits `task.op.completed` with `status`

6. **complete_process_workitem_task** (Complete task from AgentRun outcome)
   - Listens: `task.op.completed` (when `taskType == 'process_workitem'`)
   - Triggers: always
   - Calls: `Task` resource with `completeFromAgentRunId`
   - On success: emits `task.completed` with `result: 'succeeded'` or `'failed'`

7. **create_craft_commit_task** (Create second task)
   - Listens: `task.completed` (when `task.taskType == 'process_workitem' && task.result == 'succeeded'`)
   - Triggers: always (when condition matches)
   - Calls: `Task` resource with `taskType: 'craft_commit'`, `status: 'pending'`, `autoStart: true`
   - On result: emits `task.created` for craft_commit

8. **start_craft_commit_task** (Start task - mark running)
   - Listens: `task.created` (when `taskType == 'craft_commit'`)
   - Triggers: when `task.status == 'pending' && workitem.lockOwnerRunId == null`
   - Calls: `Task` resource to update status to `running`
   - On success: emits `task.started` event

9. **task_craft_commit** (Run Agent for task)
   - Listens: `task.started` (when `taskType == 'craft_commit'`)
   - Triggers: when `task.status == 'running' && task.currentAgentRunId == null`
   - Calls: `AgentRun` resource (callback stored; completion via `finalizeAgentRun`)
   - On result: patches task `currentAgentRunId`, emits `task.op.completed` with `status`

10. **complete_craft_commit_task** (Complete task from AgentRun outcome)
    - Listens: `task.op.completed` (when `taskType == 'craft_commit'`)
    - Triggers: always
    - Calls: `Task` resource with `completeFromAgentRunId`
    - On success: emits `task.completed` and `pr_request.created`

11. **pr_request_create** (Create PR)
    - Listens: `pr_request.created`
    - Triggers: always
    - Calls: `PullRequest` resource (checks for diffs, creates PR if changes exist)
    - On success: patches PR status, emits `pr_request.updated`

12. **pr_request_flow** (Update PR status)
    - Listens: `pr_request.updated`, `github.pr.updated`, `ci.checks.updated`
    - Triggers: when PR status allows
    - Calls: `PullRequest` resource to sync status

13. **cmd_lint_and_tests** (Run checks)
    - Listens: `pr_request.updated` (when `status == 'open'`), `worktree.updated`
    - Triggers: always (when condition matches)
    - Calls: `CommandExec` resource (runs lint + tests)
    - On success/failure: emits `ci.checks.updated` with `requiredChecksGreen` flag

14. **pr_merge** (Merge PR)
    - Listens: `pr_request.mergeAttempted`
    - Triggers: when `pr_request.status == 'ready_to_merge' && ci.requiredChecksGreen == true`
    - Calls: `PullRequest` resource with `operation: 'merge'`
    - On success: patches PR status to `merged`, emits `pr_request.merged`

15. **worktree_cleanup** (Cleanup worktree)
    - Listens: `pr_request.merged`
    - Triggers: when `pr_request.status == 'merged'`
    - Calls: `Worktree` resource with `removeWorktree: true`
    - On success: patches workitem `workspaceStatus = 'not_initialized'`, emits `workitem.merged`

16. **ev_merged** (Anchor node)
    - Listens: `workitem.merged`
    - Emits: `workflow.anchor.reached` (via trigger.emit)

---

## Key Implementation Details

### Task Creation and Execution Flow

**Problem**: Tasks should be created sequentially, not all at once. Tasks (Domain) must be separated from AgentRuns (Op).

**Solution**:

- `create_process_workitem_task` creates only `process_workitem` Task (Domain resource)
- `start_process_workitem_task` marks Task as `running` (Domain state transition)
- `task_process_workitem` creates AgentRun (Op resource) linked to Task via `taskId`
- When AgentRun completes (via callback from `AgentService.finalizeAgentRun`), `complete_process_workitem_task` runs and updates Task status from the AgentRun outcome
- `create_craft_commit_task` listens to `task.completed` and creates `craft_commit` Task
- This ensures sequential execution: Task created → Task started → AgentRun created → AgentRun completes → Task completed → Next Task created

**Code Flow**:

```
create_process_workitem_task listens → calls Task resource → TaskResourceHandler creates Task → onResult emits task.created
  ↓
start_process_workitem_task listens → updates Task (status: 'running') → emits task.started
  ↓
task_process_workitem listens → creates AgentRun, stores completion callback → returns (no complete yet)
  ↓
Agent finishes → AgentService.finalizeAgentRun(agentRunId) → invokes stored callback with outcome
  ↓
completeNodeRun → task_process_workitem.onResult → patches currentAgentRunId → emits task.op.completed
  ↓
complete_process_workitem_task listens → calls Task resource completeFromAgentRunId → emits task.completed
  ↓
create_craft_commit_task listens → creates craft_commit Task → emits task.created
  ↓
start_craft_commit_task listens → updates Task (status: 'running') → emits task.started
  ↓
task_craft_commit listens → creates AgentRun, stores callback → returns; on completion same callback flow
  ↓
complete_craft_commit_task listens → updates Task from AgentRun outcome → emits task.completed
```

### Event Emission Timing

**trigger.emit**:

- Emitted **immediately** when node triggers (before resource execution)
- Used for anchor/marker events
- Example: `ev_workitem_created` emits `workflow.anchor.reached` immediately

**onResult.emit**:

- Emitted **after** resource completes (when onResult condition matches)
- Used for workflow progression
- Example: `task_process_workitem` emits `task.op.completed` after AgentRun completes (via callback); `complete_process_workitem_task` emits `task.completed`

### Context Building for task.completed Events

**Problem**: When `task.completed` event is emitted, the context needs task data for condition evaluation.

**Solution**: `buildEvaluationContext()` checks:

1. If `event.subject.kind === 'task'`: load Task from TasksRepository
2. If `event.type === 'task.completed'`: load Task from event.data.taskId or find by taskType
3. Load associated AgentRun if `task.currentAgentRunId` is set

**Code**:

```typescript
if (event.subject.kind === "task") {
  // Load Task from TasksRepository
  const task = await tasksRepository.findById(event.subject.id);
  // Load AgentRun if currentAgentRunId is set
  if (task?.currentAgentRunId) {
    const agentRun = await agentRunsRepository.findById(task.currentAgentRunId);
  }
} else if (event.type === "task.completed" && event.data) {
  // Find Task by taskId or taskType from event.data
  const task =
    (await tasksRepository.findById(event.data.taskId)) ||
    (await tasksRepository.findByTaskType(workItemId, event.data.taskType));
  // Load AgentRun if available
}
```

### PR Creation with Diff Check

**Problem**: PR should not be created if there are no changes.

**Solution**: `PRService.openPR()` checks for diffs before creating PR:

```typescript
const diff = gitService.getDiff(baseSha, headSha, repoPath);
if (!diff || diff.trim().length === 0) {
  return null; // No changes, skip PR creation
}
```

### Concurrency Control

**Implementation**: `AgentService` tracks running tasks per project:

```typescript
private runningTasksPerProject = new Map<string, Set<string>>();
```

- Before starting AgentRun: check if project has reached `maxAgentConcurrency`
- If limit reached: task remains queued until slot available
- When AgentRun completes: remove from tracking set

**Note**: Concurrency is enforced at the AgentRun level, not at the Node level. Multiple nodes can trigger simultaneously if they don't depend on each other.

---

## Expression Evaluation

**Location**: `WorkflowExecutionService.evaluateExpression()`

**Features**:

- Variable resolution: `workitem.status`, `task.taskType`, `pr_request.status`
- Boolean expressions: `==`, `!=`, `&&`, `||`, `in`
- Context path resolution: recursively collects all nested paths
- Handles undefined variables gracefully (returns false)

**Example Expressions**:

- `workitem.status == 'open' && workitem.workspaceStatus == 'ready'`
- `task.taskType == 'process_workitem' && task.result == 'succeeded'`
- `pr_request.status in ['new','open','ready_to_merge']`

---

## Error Handling

- **Node execution errors**: Logged, node marked as failed, workflow continues
- **Resource execution errors**: Call `complete(outcome)` with `status: 'failed'`
- **Expression evaluation errors**: Return `false` (condition not met)
- **Missing resources**: Node skips execution, logs warning

---

## Database Schema

**NodeRuns Table**:

- Tracks node execution: `(workflowRunId, nodeId, attempt, idempotencyKey)`
- Status: `pending`, `running`, `succeeded`, `failed`, `canceled`, `blocked`
- Stores `resourceType`: The type of resource called (for safety validation)
- Stores `idempotencyKey`: For idempotency enforcement
- Links to workflowRun, nodeId, subject

**WorkflowRuns Table**:

- Tracks workflow execution per WorkItem
- Status: `pending`, `running`, `succeeded`, `failed`, `blocked`, `skipped`
- Links to WorkItem and Workflow

**Domain Resource Tables**:

- **Tasks Table**: Domain resource for orchestration
  - Fields: `id`, `work_item_id`, `task_type`, `status` (pending/running/succeeded/failed/canceled/blocked), `input`, `output`, `current_agent_run_id`, `idempotency_key`, `node_run_id`
  - Links to AgentRun via `current_agent_run_id`
  - Unique constraint on `idempotency_key` (where not null)
- **WorkItems Table**: Domain resource
  - Fields: includes `idempotency_key` for idempotency enforcement
- **PullRequests Table**: Domain resource
  - Fields: includes `idempotency_key` for idempotency enforcement

**Op Resource Tables**:

- **Worktrees Table**: Op resource for git worktree operations
  - Fields: `id`, `work_item_id`, `path`, `branch`, `repo_sha`, `status` (pending/running/succeeded/failed/canceled), `idempotency_key`, `node_run_id`
  - Unique constraint on `idempotency_key` (where not null)

- **AgentRuns Table**: Op resource for agent execution
  - Fields: includes `task_id` (FK to Tasks), `idempotency_key`
  - Links to Task via `task_id` foreign key
  - Unique constraint on `idempotency_key` (where not null)

- **GitOps Table**: Op resource for git operations
  - Fields: `id`, `work_item_id`, `operation`, `status` (pending/running/succeeded/failed/canceled), `input`, `output`, `idempotency_key`, `node_run_id`
  - Unique constraint on `idempotency_key` (where not null)

- **CommandExecs Table**: Op resource for command execution
  - Fields: includes `idempotency_key` for idempotency enforcement
  - Unique constraint on `idempotency_key` (where not null)

**Key Relationships**:

- Task (Domain) → AgentRun (Op): `agent_runs.task_id` → `tasks.id`
- Task → AgentRun: `tasks.current_agent_run_id` → `agent_runs.id`
- All resources link to NodeRun via `node_run_id` for correlation
- All resources have `idempotency_key` for idempotency enforcement

**No ResourceCall Table**: Resource state belongs in the concrete resource tables. There is no separate `ResourceCall` table.

---

## Testing Considerations

- **Event-driven**: Test by emitting events and verifying node execution
- **Idempotency**: Test that duplicate events don't create duplicate resources
- **Sequential execution**: Test that tasks execute in correct order
- **Concurrency**: Test that multiple AgentRuns respect `maxAgentConcurrency`
- **Error handling**: Test that failures don't break the workflow
- **Callback completion**: Test that resources call completion callback correctly
- **Exactly-once**: Test that duplicate completions are ignored

---

## Things to Delete / Forbid

- No `resource.result` bus events
- No `resource.called` bus events
- No `ResourceCall` model/table
- No node executors per type
- No mixing of "started" and "succeeded" for Ops
- Resources must NOT emit events directly to the event bus
- Resources must complete via callback (or internal completion API)

---

## Future Improvements

1. **Event replay**: Ability to replay events for debugging
2. **Workflow visualization**: Show node execution graph based on events
3. **Performance**: Optimize context building for large workflows
4. **Monitoring**: Track node execution times and resource usage
5. **Retry logic**: More sophisticated retry strategies per node
6. **Persistent completion tracking**: Move `completedNodeRunAttempts` to database for durability
