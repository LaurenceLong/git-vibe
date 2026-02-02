````md
# Workflow Engine Full Spec (Node Owns Resource) — Node-Only Events + Callback Completion (No Resource→Bus)

This is the full version of the architecture where **each Node “owns” exactly one Resource call per trigger**, and therefore `ctx.outcome.resourceType == ...` checks are generally unnecessary in `onResult` conditions.

**Core rule:**  
**Only Nodes listen/emit events on the event bus. Resources never publish events.**  
Resources return results to the engine via a **completion callback / internal completion API**, and the Node then emits downstream events.

---

## 0) Allowed Resource Types (Hard Constraint)

Only these 7 resources exist:

**Domain (internal state transitions)**

- `WorkItem`
- `Task`
- `PullRequest`

**Ops (external execution / side effects)**

- `Worktree`
- `AgentRun`
- `GitOps`
- `CommandExec`

No other resource types are permitted.

---

## 1) Definitions

### 1.1 Event Bus

A message stream containing **only Node-emitted events**.

### 1.2 Node

A declarative reducer that:

1. **listens** to bus events
2. evaluates a `trigger.when`
3. calls **exactly one Resource** with an engine-provided `complete(outcome)` callback (or completion token)
4. waits for completion
5. runs `onResult` rules, patches state, and emits downstream events

### 1.3 Resource

A handler for one of the 7 types that:

- performs a Domain transition or Op execution
- persists in its own storage
- **never emits bus events**
- completes by invoking `complete(outcome)` (or calling `Engine.complete(token, outcome)`)

### 1.4 NodeRun

The single runtime record for node execution and correlation.

**There is no `ResourceCall` table.**  
Resource state belongs in the concrete resource tables.

---

## 2) Key Invariants (what “Node owns its resource” means)

A Node owns its Resource call if **all** are true:

1. **Single call per trigger:** one NodeRun can initiate **at most one** Resource call.
2. **Bound completion:** the completion callback (or completion token) is bound to that NodeRun.
3. **Engine gating:** the engine accepts completion **only** for the bound NodeRun and only once.
4. **No bus completion:** resource completion is not delivered by the event bus.

### 2.1 Consequence

Because a NodeRun can only complete from its own call, `onResult` does **not** need to check:

- `ctx.outcome.resourceType == 'AgentRun'`
- `ctx.outcome.resourceId == ...` (optional; sometimes useful for safety/diagnostics)

The engine enforces correctness centrally.

---

## 3) Event Model (Node-only)

### 3.1 Standard Event Envelope

```json
{
  "eventId": "uuid",
  "type": "task.completed",
  "at": "2026-01-29T12:00:00Z",

  "subject": { "kind": "workitem", "id": "wi_123" },

  "causedBy": {
    "workflowRunId": "wr_1",
    "nodeId": "complete_task_from_agentrun",
    "nodeRunId": "nr_9",
    "attempt": 1
  },

  "data": {}
}
```
````

### 3.2 Recommended Domain Event Types (examples)

WorkItem:

- `workitem.created`
- `workitem.updated`
- `workitem.workspace.ready`

Task:

- `task.created`
- `task.started`
- `task.completed`

PullRequest:

- `pull_request.created`
- `pull_request.updated`
- `pull_request.merged`

> Forbidden:
>
> - `resource.called`
> - `resource.result`  
>   Resources do not emit events.

---

## 4) Resource Outcome Model (Callback payload)

### 4.1 Standard Outcome Shape

```json
{
  "resourceType": "WorkItem | Worktree | Task | AgentRun | PullRequest | GitOps | CommandExec",
  "resourceId": "id",
  "status": "succeeded | failed | canceled",
  "summary": "string",
  "outputs": {}
}
```

### 4.2 Semantics (critical)

- **Domain resources**: `succeeded` means the state transition completed (e.g. “Task marked running”).
- **Op resources**: `succeeded` means the external operation fully completed successfully (not merely started).

Example: `AgentRun.call()` must deliver completion only when the run is finished.

---

## 5) NodeSpec (Full Shape)

A NodeSpec has:

- `listens[]` → which bus events can trigger evaluation
- `trigger` → optional `emit` (node-emitted) then **call exactly one resource**
- `onResult[]` → conditions over outcome + patches + node-emitted events

### 5.1 NodeSpec Schema (conceptual)

```json
{
  "id": "string",
  "display": { "name": "string" },

  "subject": { "kind": "workitem", "idRef": "ctx.event.subject.id" },

  "listens": [{ "on": "event.type", "when": "optional boolean expression" }],

  "trigger": {
    "when": "boolean expression",
    "call": {
      "resourceType": "WorkItem | Worktree | Task | AgentRun | PullRequest | GitOps | CommandExec",
      "idempotencyKey": "string expression",
      "input": {}
    },
    "emit": [{ "type": "event.type", "data": {} }]
  },

  "onResult": [
    {
      "when": "boolean expression over ctx.outcome",
      "patch": {
        "workitem": {},
        "task": {},
        "pullRequest": {},
        "worktree": {},
        "agentRun": {}
      },
      "emit": [{ "type": "event.type", "data": {} }]
    }
  ],

  "retry": { "maxAttempts": 1 }
}
```

### 5.2 Simplification rule enabled by “Node owns its resource”

`onResult.when` can be written without `resourceType` checks, because the engine guarantees the outcome belongs to this NodeRun.

---

## 6) Engine Runtime (Full)

### 6.1 Core loop (bus event → node triggers)

For each bus event:

1. Find nodes whose `listens.on` matches event type
2. For each node:
   - Build `ctx` (load subject resources if needed)
   - Evaluate `listens.when` (if present)
   - Evaluate `trigger.when`
3. If trigger matches:
   - Create NodeRun:
     - `status = running`
     - store `nodeId`, `workflowRunId`, `attempt`, `idempotencyKey`
   - Emit `trigger.emit` events (node-only)
   - Call ResourceDispatcher with:
     - `resourceType`, `input`, `idempotencyKey`, `causedBy = NodeRun`
     - `complete(outcome)` callback bound to this NodeRun
   - Set NodeRun status to `waiting_resource` (unless completion is immediate)

### 6.2 Completion path (resource → callback → node.onResult)

When the resource completes:

1. Resource invokes `complete(outcome)` (or calls `Engine.complete(token, outcome)`)
2. Engine validates:
   - token/nodeRunId is valid
   - completion not already processed (exactly-once per NodeRun attempt)
   - (recommended) `outcome.resourceType` equals NodeRun’s recorded `calledResourceType`
3. Engine evaluates node’s `onResult[]` in order:
   - for each rule: if `when` true → apply `patch` and emit `emit`
4. Engine marks NodeRun terminal:
   - node status can be derived from outcome + selected rule
   - or keep NodeRun as `succeeded` if `onResult` ran without error; store outcome status separately

> Best practice: NodeRun success is “engine processed outcome”, while business success is in Domain state (Task status etc.).

### 6.3 Exactly-once completion guarantee

Engine must enforce:

- Completion can be applied once per `(nodeRunId, attempt)`.
- Duplicate completions are ignored or rejected (idempotent completion).

---

## 7) ResourceDispatcher / Completion API (Full)

### 7.1 Dispatcher Interface (conceptual)

```ts
type ResourceType =
  | "WorkItem"
  | "Worktree"
  | "Task"
  | "AgentRun"
  | "PullRequest"
  | "GitOps"
  | "CommandExec";

type ResourceOutcome = {
  resourceType: ResourceType;
  resourceId: string;
  status: "succeeded" | "failed" | "canceled";
  summary?: string;
  outputs?: Record<string, unknown>;
};

type CompleteFn = (outcome: ResourceOutcome) => Promise<void>;

interface ResourceDispatcher {
  call(args: {
    resourceType: ResourceType;
    input: any;
    idempotencyKey: string;
    causedBy: {
      workflowRunId: string;
      nodeId: string;
      nodeRunId: string;
      attempt: number;
    };
    complete: CompleteFn;
  }): Promise<void>;
}
```

### 7.2 Distributed implementation note (recommended)

In a distributed system you usually don’t hold an in-memory function pointer across processes. Instead:

- Engine returns a `completionToken` tied to `nodeRunId`
- Resource later calls internal API:
  - `POST /internal/node-runs/{nodeRunId}/complete`
  - body = `outcome`

This is still “callback semantics” and still **not the event bus**.

---

## 8) Idempotency (Full)

### 8.1 NodeRun idempotency

Unique key recommendation:

- `(workflowRunId, nodeId, idempotencyKey)`

If conflict:

- If prior NodeRun is terminal → do nothing
- If prior NodeRun is in-flight → do nothing or join (implementation choice)

### 8.2 Resource idempotency

Each concrete resource enforces idempotency with its own `idempotencyKey` and unique constraint.

Examples:

- Task: unique `idempotencyKey`
- AgentRun: unique `idempotencyKey` (e.g. `task:{taskId}:attempt:{n}`)
- GitOps/CommandExec: unique semantic key per operation

---

## 9) Full Example Workflow (Task + AgentRun) with Simplified `onResult.when`

Below is a coherent example set, focusing on the “Node owns resource” simplification.

### 9.1 Node: Create Task

```json
{
  "id": "create_process_workitem_task",
  "display": { "name": "Create process_workitem Task" },
  "subject": { "kind": "workitem", "idRef": "ctx.event.subject.id" },
  "listens": [{ "on": "workitem.workspace.ready" }],
  "trigger": {
    "when": "true",
    "call": {
      "resourceType": "Task",
      "idempotencyKey": "workitem:{workitem.id}:task:process_workitem:create",
      "input": {
        "workItemId": "{workitem.id}",
        "taskType": "process_workitem",
        "status": "pending",
        "input": { "goal": "process the work item" }
      }
    },
    "emit": []
  },
  "onResult": [
    {
      "when": "ctx.outcome.status == 'succeeded'",
      "patch": {},
      "emit": [
        {
          "type": "task.created",
          "data": { "taskId": "{ctx.outcome.resourceId}" }
        }
      ]
    }
  ]
}
```

### 9.2 Node: Start Task (Domain transition)

```json
{
  "id": "start_task",
  "display": { "name": "Start Task (mark running)" },
  "subject": { "kind": "workitem", "idRef": "ctx.event.subject.id" },
  "listens": [{ "on": "task.created" }],
  "trigger": {
    "when": "task.status == 'pending'",
    "call": {
      "resourceType": "Task",
      "idempotencyKey": "task:{task.id}:start",
      "input": {
        "taskId": "{task.id}",
        "patch": { "status": "running", "startedAt": "{now}" }
      }
    },
    "emit": []
  },
  "onResult": [
    {
      "when": "ctx.outcome.status == 'succeeded'",
      "patch": {},
      "emit": [{ "type": "task.started", "data": { "taskId": "{task.id}" } }]
    }
  ]
}
```

### 9.3 Node: Run Agent (Op resource)

**Note the simplified `onResult.when`: no resourceType check.**

```json
{
  "id": "run_task_agent",
  "display": { "name": "Run Task via AgentRun" },
  "subject": { "kind": "workitem", "idRef": "ctx.event.subject.id" },
  "listens": [{ "on": "task.started" }],
  "trigger": {
    "when": "task.taskType == 'process_workitem' && task.status == 'running' && task.currentAgentRunId == null",
    "call": {
      "resourceType": "AgentRun",
      "idempotencyKey": "task:{task.id}:agentrun:attempt:{task.attempt}",
      "input": {
        "taskId": "{task.id}",
        "workItemId": "{workitem.id}",
        "template": "process_workitem",
        "inputs": { "workItem": "{workitem}" },
        "session": { "mode": "new" }
      }
    },
    "emit": []
  },
  "onResult": [
    {
      "when": "ctx.outcome.status == 'succeeded' || ctx.outcome.status == 'failed' || ctx.outcome.status == 'canceled'",
      "patch": {
        "task": { "currentAgentRunId": "{ctx.outcome.resourceId}" }
      },
      "emit": [
        {
          "type": "task.op.completed",
          "data": {
            "taskId": "{task.id}",
            "agentRunId": "{ctx.outcome.resourceId}",
            "status": "{ctx.outcome.status}"
          }
        }
      ]
    }
  ]
}
```

### 9.4 Node: Complete Task from AgentRun outcome (Domain transition)

```json
{
  "id": "complete_task_from_agentrun",
  "display": { "name": "Complete Task from AgentRun outcome" },
  "subject": { "kind": "workitem", "idRef": "ctx.event.subject.id" },
  "listens": [{ "on": "task.op.completed" }],
  "trigger": {
    "when": "true",
    "call": {
      "resourceType": "Task",
      "idempotencyKey": "task:{task.id}:complete:from:{ctx.event.data.agentRunId}",
      "input": {
        "taskId": "{task.id}",
        "completeFromAgentRunId": "{ctx.event.data.agentRunId}"
      }
    },
    "emit": []
  },
  "onResult": [
    {
      "when": "ctx.outcome.status == 'succeeded'",
      "patch": {},
      "emit": [{ "type": "task.completed", "data": { "taskId": "{task.id}" } }]
    }
  ]
}
```

---

## 10) Safety Checks (Centralized, not repeated in NodeSpecs)

Even if NodeSpecs omit resourceType checks, the engine should still enforce:

1. **Called type recorded:** when triggering, store `nodeRun.calledResourceType`
2. **Completion type matches (recommended):**
   - if `outcome.resourceType != nodeRun.calledResourceType` → reject (409) or mark nodeRun failed
3. **Exactly once completion:**
   - if already completed → ignore/reject idempotently
4. **Idempotency on resource side:**
   - duplicate calls produce same `resourceId` and do not create additional runs

This keeps NodeSpecs minimal while maintaining strong correctness guarantees.

---

## 11) Things to Delete / Forbid (to keep it clean)

- No `resource.result` bus events
- No `resource.called` bus events
- No `ResourceCall` model/table
- No node executors per type
- No mixing of “started” and “succeeded” for Ops

---

## 12) Final Mental Model

**Events connect Nodes. Resources never touch the bus.**  
A Node calls one Resource and receives its outcome via callback.  
Because a NodeRun owns its resource call, `onResult` conditions can be simplified to focus on `ctx.outcome.status` and outputs, not resource identity.

```

```
