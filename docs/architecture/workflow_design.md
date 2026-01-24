## Workflow Single Source of Truth Architecture

### Core Principle
**The workflow is the single source of truth. All WorkItem state transitions and lifecycle events flow through workflow execution.**

This document describes the event-driven workflow architecture where workflows orchestrate all WorkItem lifecycle events and state changes.

---

## Workflow Single Source of Truth Architecture

### Core Principle
**The workflow is the single source of truth. All WorkItem state transitions and lifecycle events flow through workflow execution.**

The workflow system is now event-driven, with workflows orchestrating all WorkItem lifecycle events and state changes. Services are stateless executors that perform actions but don't decide when - the workflow makes all orchestration decisions.

### Event-Driven Model

#### WorkItem Events (trigger workflow execution)
- `workitem.created` - Emitted when WorkItem is created
- `workitem.updated` - Emitted when WorkItem metadata changes  
- `workitem.status.changed` - Emitted when status changes
- `workitem.workspace.initialized` - Emitted when workspace is initialized
- `workitem.workspace.ready` - Emitted when workspace becomes ready
- `workitem.closed` - Emitted when WorkItem is closed

#### Workflow Node Events (emitted during execution)
- `agent.started` - When agent run begins
- `agent.completed` - When agent run finishes
- `pr.created` - When PR is created
- `pr.merged` - When PR is merged
- `git.committed` - When commit is made
- `conflict.detected` - When merge conflict occurs

#### External System Events (detected via sync rules)
- `github.pr.created` - External PR creation
- `github.pr.merged` - External PR merge
- `ci.checks.passed` - CI checks pass
- `git.state.changed` - Git state changes

### Architecture Components

1. **WorkflowEventBus** - Central event bus for workflow events
   - Location: `backend/src/services/WorkflowEventBus.ts`
   - Supports async event handlers
   - Event types: WorkItemEvent, WorkflowNodeEvent, ExternalEvent

2. **WorkItemEventService** - Wraps WorkItem operations with event emission
   - Location: `backend/src/services/WorkItemEventService.ts`
   - Ensures all WorkItem state changes emit events

3. **WorkflowExecutionService** - Orchestrates workflow execution
   - Location: `backend/src/services/WorkflowExecutionService.ts`
   - Handles events and triggers workflow execution
   - Manages state synchronization from workflow outputs to WorkItem

4. **Node Executors** - Stateless executors for different node types
   - Location: `backend/src/services/workflow-executors/`
   - `EventNodeExecutor` - Handles event nodes (no-ops)
   - `WorkspaceNodeExecutor` - Handles workspace initialization (git type, action: workspace.init)
   - `AgentNodeExecutor` - Handles agent execution
   - `GitNodeExecutor` - Handles git operations (commit, push, stage)
   - `PRNodeExecutor` - Handles PR operations (github type)
   - `CINodeExecutor` - Handles CI check execution

### State Management

All WorkItem state changes are initiated by workflow nodes:
- Workflow nodes emit events that trigger state transitions
- Services are stateless executors - they perform actions but don't decide when
- WorkflowExecutionService orchestrates all state changes based on node outputs
- WorkItem state is synced from workflow outputs via `syncWorkItemStateFromOutputs()`

### Flow Examples

#### WorkItem Creation Flow
```
POST /api/workitems
  → workItemEventService.createWorkItem()
  → Emit 'workitem.created' event
  → WorkflowExecutionService.handleWorkItemEvent()
  → Load project's default workflow
  → Create WorkflowRun
  → Execute workflow starting from 'workitem_created' event node
```

#### Workspace Initialization Flow
```
WorkflowExecutionService executes 'process_workitem' node
  → AgentNodeExecutor.execute()
  → Implicit workspace initialization via workspaceService.ensureWorkspace()
  → Returns WorkspaceState
  → WorkflowExecutionService.syncWorkItemStateFromOutputs()
  → workItemEventService.updateWorkItemState()
```

Note: Workspace initialization happens implicitly within the first agent node execution. The `workspace_init` node type exists but is typically handled by the agent node which ensures workspace is ready before execution.

#### Agent Execution Flow
```
WorkflowExecutionService executes 'agent' node
  → AgentNodeExecutor.execute()
  → agentService.startAgentRun() (stateless)
  → Wait for AgentRun completion
  → Emit 'agent.completed' event
  → WorkflowExecutionService updates WorkItem based on outputs
```

### Migration Notes

1. **Existing WorkItems**: Will need workflow runs created retroactively, or workflow execution starts on next state change

2. **Agent Runs**: Existing AgentRuns remain unchanged. New runs are created through workflow nodes.

3. **Workflow Definitions**: Existing workflows remain valid. Event nodes handle WorkItem lifecycle.

4. **API Compatibility**: 
   - POST /api/workitems still works, but triggers workflow
   - PATCH /api/workitems/:id triggers workflow for status changes
   - Other field updates (title, body) don't trigger workflow

5. **Breaking Changes**:
   - `agentService.executeTask()` signature changes (backward compatible wrapper exists)
   - Direct WorkItem state updates deprecated - use workItemEventService
   - Services must emit events instead of updating state directly

---

## Merged prompt (single, JSON-first, precise/concise)

Design a **competitive, GitHub Actions–style workflow system** for a **Work Item lifecycle**, managed in an **Actions tab** UI and executed by an orchestration engine (agent steps + CI steps + GitHub operations). Use **JSON as the canonical data storage / source of truth** (for React Flow–style builder + orchestrator). Optionally support for human editing, but execution must be driven from the canonical JSON model.

### 1) Product requirements (must satisfy)
- Workflow is **created/edited/managed in an Actions tab**.
- **Canonical definition is JSON** (round-trip safe, schema-validatable, UI-friendly).  
- There is a **mandatory default workflow backbone**:
  - Users **cannot delete or reorder** default nodes.
  - Users **can modify prompts/config** of default nodes.
  - Users **can only add nodes between default nodes** via **insertion slots** (enforced by schema + UI).
- **Session continuity** is supported: some agent steps must **reuse the same session**.
- **Sync/reconciliation** must preserve continuity when users do manual operations (manual commit, manual PR create/edit, manual conflict resolution, manual merge). The engine must detect external state changes and continue without breaking.
- Default workflow backbone is **created automatically** for new project or existing projects with empty workflow.

### 2) Default workflow backbone (fixed order; must implement exactly)
1. `workitem_created` (event)
2. Agent run: **process work item** and **record session** *(already implemented)*
3. Agent run: in the **same session**, produce a **high-quality git commit**
   - Replace current unacceptable behavior (`git add -A`) with **intentional staging** and a **good commit message flow**.
4. Create **PR**
5. Agent run: **review code** and ensure **lint checks pass**
6. Try to **merge**
   - If merge fails due to conflicts: Agent run **solve conflicts**, then **retry merge**
7. `merged` (event)

### 3) Agent input constraint (must design around)
- Agent steps currently receive only **Title + Description** from the work item.
- Description is **user-editable** and may be incomplete/messy.
- Prompts must be **robust and structured** while using **Title + Description** as primary context.

### 4) What to produce (deliverables)
Return **three sections**:

#### A) Canonical JSON format (schema-like + one full example)
Provide a **representative JSON format** that can store/render/execute the workflow:
- Node list (default backbone + user extensions)
- Explicit **immutability** for default nodes
- Explicit **insertion slots** between default nodes (enforced)
- Node types (minimum): `event`, `agent`, `git`, `github`, `ci`
- Support:
  - **session mode**: `new`/`reuse` and referencing prior sessions
  - **gates/conditions**
  - **retries/backoff**
  - **branching** for merge-conflict handling (conflict → resolve → retry merge)
  - **outputs/artifacts** (session recording, logs, summaries)
  - **policy hooks** (commit rules, merge rules)
  - **sync/reconcile rules** mapping external GitHub/git/CI state to step completion
Include:
- A **schema-like description** (fields + meaning) OR strongly self-describing JSON comments (if allowed by your format; otherwise embed `doc` fields).
- **One authoritative full JSON example** implementing the default workflow plus **empty extension slots**.

#### B) Actions tab UI model (brief but concrete)
Describe how the Actions tab represents:
- Fixed backbone nodes vs user-inserted nodes (slots)
- Editing prompts/config safely (diff/preview/versioning)
- Run history, step status, artifacts
- “Manual action detected” reconciliation behavior (what the user sees)

#### C) Execution semantics (brief but concrete)
Define how the orchestration engine:
- Evaluates next steps; handles `success`/`failure`/`blocked`
- Detects merge conflicts and triggers the conflict-resolution branch
- Preserves session continuity (reuse semantics)
- Performs reconciliation from GitHub events/CI checks/git state and maps to step completion

### 5) Output constraints
- Be **precise and concise** but complete.
- Prefer **one authoritative JSON example** over multiple variants.
- Avoid vague statements; specify **fields and behaviors**.

## 1) Workflow JSON design (format + one full example)

### 1.1 Canonical JSON shape (schema-like, concise)

```json
{
  "version": 1,
  "workflow": {
    "id": "string",
    "name": "string",
    "description": "string",

    "context": {
      "workitem": {
        "titleRef": "workitem.title",
        "descriptionRef": "workitem.description",
        "descriptionUserEditable": true,
        "normalization": {
          "trimWhitespace": true,
          "stripHtml": true,
          "maxChars": 6000
        }
      }
    },

    "prompts": {
      "templates": {
        "templateId": "string with {{vars}}"
      }
    },

    "backbone": [
      {
        "id": "string",
        "type": "event|agent|git|github|ci",
        "immutable": true,
        "display": { "name": "string", "description": "string?" },

        "event": "workitem.created|pr.merged?",

        "session": { "mode": "new|reuse", "from": "nodeId?", "export": true },
        "input": { "useWorkitemContext": true, "extra": {} },
        "prompt": "string (may reference templates)",

        "action": "string (for git/github/ci)",
        "with": {},

        "when": { "expr": "string?" },
        "retry": { "maxAttempts": 1, "backoffSeconds": 0 },
        "outputs": {
          "exports": ["string"],
          "artifacts": [{ "id": "string", "kind": "log|json|text|patch|session", "ref": "string" }]
        }
      }
    ],

    "slots": [
      {
        "id": "string",
        "after": "backboneNodeId",
        "before": "backboneNodeId",
        "allowInsert": true,
        "allowedNodeTypes": ["agent", "ci", "github", "git"]
      }
    ],

    "extensions": {
      "nodes": [
        {
          "id": "string",
          "slot": "slotId",
          "type": "agent|ci|github|git",
          "display": { "name": "string" },

          "session": { "mode": "new|reuse", "from": "nodeId?" },
          "input": { "useWorkitemContext": true, "extra": {} },
          "prompt": "string",

          "action": "string",
          "with": {},

          "when": { "expr": "string?" },
          "retry": { "maxAttempts": 1, "backoffSeconds": 0 },
          "outputs": { "artifacts": [] }
        }
      ]
    },

    "control": {
      "extraNodes": [],
      "transitions": [
        { "from": "nodeId", "on": "success|failure|conflict|blocked", "to": "nodeId" }
      ],
      "sync": {
        "mode": "reconcile",
        "sources": ["github.events", "ci.checks", "git.state"],
        "rules": [
          {
            "when": { "expr": "string boolean expression" },
            "satisfyStep": "nodeId",
            "setOutputs": {}
          }
        ]
      }
    },

    "policy": {
      "commit": {
        "requireIntentionalStaging": true,
        "allowGitAddAll": false,
        "requireCommitBody": true,
        "message": { "subjectMaxLen": 72 }
      },
      "ci": { "requiredChecks": ["lint", "unit-tests"] },
      "merge": { "requireGreenChecks": true, "method": "squash", "onConflict": "transition" }
    }
  }
}
```

**Enforcement rules (engine + validator)**
- `workflow.backbone[*].immutable === true` ⇒ cannot delete/reorder; only editable fields: `prompt`, `with`, `when`, `retry`, `display.description`, `policy`-scoped overrides (if allowed).
- `extensions.nodes[*].slot` must match an existing `slots[].id`; rendering order is `backbone` with each slot’s inserted nodes between `after` and `before`.
- `session.mode:"reuse"` requires `session.from` referencing a prior `agent` node that had `session.export:true` (or produced a session artifact).

---

### 1.2 Full example JSON (default backbone + empty slots + conflict branch + sync)

```json
{
  "version": 1,
  "workflow": {
    "id": "workitem-default",
    "name": "Work Item Lifecycle (Competitive)",
    "description": "GitHub-style Actions workflow for work items. Backbone is immutable; users can insert custom steps only between backbone nodes.",

    "context": {
      "workitem": {
        "titleRef": "workitem.title",
        "descriptionRef": "workitem.description",
        "descriptionUserEditable": true,
        "normalization": {
          "trimWhitespace": true,
          "stripHtml": true,
          "maxChars": 6000
        }
      }
    },

    "prompts": {
      "templates": {
        "workitem_context": "You are executing a Work Item.\n\nTitle:\n{{workitem.title}}\n\nDescription (user-editable; may be incomplete/messy):\n{{workitem.description}}\n",
        "process_contract": "Output format (strict):\n1) Understanding (3-7 bullets)\n2) Assumptions / Questions (only if blocking)\n3) Plan (ordered checklist, smallest safe steps)\n4) Changes (files to touch + why)\n5) Execution (do the work)\n6) Verification (commands + expected results)\n7) Summary (what changed + follow-ups)\n\nConstraints:\n- Prefer minimal, reviewable diffs.\n- If description conflicts with title, ask 1 clarification question; otherwise proceed.\n",
        "commit_contract": "Task: Create a high-quality commit.\n\nRequirements:\n- Show `git status --porcelain` and a concise diff summary.\n- Propose a staging plan by logical change (file/hunk). Avoid blanket `git add -A` unless changes are trivial and homogeneous.\n- Stage intentionally (interactive/hunks when helpful).\n- Commit message:\n  * Subject: <= 72 chars, imperative\n  * Body: why + key decisions + tests run\n- If the description is ambiguous in a way that affects what should be committed, stop and ask before committing.\n",
        "review_contract": "Task: Review the PR and ensure repo quality gates pass.\n\nRequirements:\n- Run required lint + unit tests per repo policy.\n- Fix issues and push follow-up commits if needed.\n- Summarize: what changed, what was verified, remaining risks.\n",
        "conflict_contract": "Merge failed due to conflicts.\n\nRequirements:\n- Fetch/update base branch.\n- Rebase/merge carefully and resolve conflicts with minimal diffs.\n- Re-run lint/tests.\n- Push resolution commits.\n- Summarize conflicts and resolutions.\n- Then hand back to merge.\n"
      }
    },

    "backbone": [
      {
        "id": "workitem_created",
        "type": "event",
        "immutable": true,
        "display": { "name": "Work item created" },
        "event": "workitem.created",
        "outputs": {
          "artifacts": [{ "id": "workitem_snapshot", "kind": "json", "ref": "context.workitem" }]
        }
      },
      {
        "id": "process_workitem",
        "type": "agent",
        "immutable": true,
        "display": { "name": "Agent: process work item" },
        "session": { "mode": "new", "export": true },
        "input": { "useWorkitemContext": true },
        "prompt": "{{templates.workitem_context}}\n{{templates.process_contract}}",
        "outputs": {
          "exports": ["session.id"],
          "artifacts": [
            { "id": "session_recording", "kind": "session", "ref": "agent.session" },
            { "id": "plan_summary", "kind": "text", "ref": "agent.summary" }
          ]
        }
      },
      {
        "id": "commit_changes",
        "type": "agent",
        "immutable": true,
        "display": { "name": "Agent: craft commit (same session)" },
        "session": { "mode": "reuse", "from": "process_workitem" },
        "input": { "useWorkitemContext": true },
        "prompt": "{{templates.workitem_context}}\n{{templates.commit_contract}}",
        "outputs": {
          "artifacts": [
            { "id": "commit_metadata", "kind": "json", "ref": "git.commit" },
            { "id": "staging_plan", "kind": "text", "ref": "agent.stagingPlan" }
          ]
        }
      },
      {
        "id": "create_pr",
        "type": "github",
        "immutable": true,
        "display": { "name": "Create PR" },
        "action": "pr.create",
        "with": {
          "base": "main",
          "head": "current_branch",
          "titleFrom": "workitem.title",
          "bodyFrom": "workitem.description",
          "draft": false
        },
        "retry": { "maxAttempts": 2, "backoffSeconds": 15 },
        "outputs": {
          "exports": ["github.pr.number", "github.pr.url"],
          "artifacts": [{ "id": "pr_ref", "kind": "json", "ref": "github.pr" }]
        }
      },
      {
        "id": "review_and_lint",
        "type": "agent",
        "immutable": true,
        "display": { "name": "Agent: review + lint" },
        "session": { "mode": "new", "export": false },
        "input": { "useWorkitemContext": true, "extra": { "prRef": "{{github.pr.number}}" } },
        "prompt": "{{templates.workitem_context}}\n{{templates.review_contract}}",
        "outputs": {
          "artifacts": [
            { "id": "review_summary", "kind": "text", "ref": "agent.summary" },
            { "id": "ci_results", "kind": "json", "ref": "ci.checks" }
          ]
        }
      },
      {
        "id": "merge_pr",
        "type": "github",
        "immutable": true,
        "display": { "name": "Merge PR" },
        "when": { "expr": "ci.requiredChecksGreen == true" },
        "action": "pr.merge",
        "with": {
          "method": "squash",
          "requireGreenChecks": true
        },
        "retry": { "maxAttempts": 2, "backoffSeconds": 30 }
      },
      {
        "id": "merged",
        "type": "event",
        "immutable": true,
        "display": { "name": "Merged" },
        "event": "pr.merged"
      }
    ],

    "slots": [
      { "id": "between_created_and_process", "after": "workitem_created", "before": "process_workitem", "allowInsert": true, "allowedNodeTypes": ["agent", "ci", "github", "git"] },
      { "id": "between_process_and_commit", "after": "process_workitem", "before": "commit_changes", "allowInsert": true, "allowedNodeTypes": ["agent", "ci"] },
      { "id": "between_commit_and_pr", "after": "commit_changes", "before": "create_pr", "allowInsert": true, "allowedNodeTypes": ["ci", "github", "git"] },
      { "id": "between_pr_and_review", "after": "create_pr", "before": "review_and_lint", "allowInsert": true, "allowedNodeTypes": ["agent", "ci"] },
      { "id": "between_review_and_merge", "after": "review_and_lint", "before": "merge_pr", "allowInsert": true, "allowedNodeTypes": ["ci", "github", "agent"] },
      { "id": "between_merge_and_merged", "after": "merge_pr", "before": "merged", "allowInsert": true, "allowedNodeTypes": ["github", "ci"] }
    ],

    "extensions": {
      "nodes": []
    },

    "control": {
      "extraNodes": [
        {
          "id": "resolve_conflicts",
          "type": "agent",
          "immutable": true,
          "display": { "name": "Agent: resolve merge conflicts" },
          "session": { "mode": "new" },
          "input": { "useWorkitemContext": true, "extra": { "prRef": "{{github.pr.number}}" } },
          "prompt": "{{templates.workitem_context}}\n{{templates.conflict_contract}}",
          "retry": { "maxAttempts": 2, "backoffSeconds": 30 },
          "outputs": {
            "artifacts": [{ "id": "conflict_resolution_summary", "kind": "text", "ref": "agent.summary" }]
          }
        }
      ],
      "transitions": [
        { "from": "merge_pr", "on": "conflict", "to": "resolve_conflicts" },
        { "from": "resolve_conflicts", "on": "success", "to": "merge_pr" }
      ],
      "sync": {
        "mode": "reconcile",
        "sources": ["github.events", "ci.checks", "git.state"],
        "rules": [
          {
            "when": { "expr": "github.pr.exists == true" },
            "satisfyStep": "create_pr",
            "setOutputs": { "github.pr.number": "{{github.pr.number}}", "github.pr.url": "{{github.pr.url}}" }
          },
          {
            "when": { "expr": "github.pr.merged == true" },
            "satisfyStep": "merge_pr"
          },
          {
            "when": { "expr": "github.pr.merged == true" },
            "satisfyStep": "merged"
          },
          {
            "when": { "expr": "ci.requiredChecksGreen == true" },
            "satisfyStep": "review_and_lint"
          }
        ]
      }
    },

    "policy": {
      "commit": {
        "requireIntentionalStaging": true,
        "allowGitAddAll": false,
        "requireCommitBody": true,
        "message": { "subjectMaxLen": 72 }
      },
      "ci": { "requiredChecks": ["lint", "unit-tests"] },
      "merge": { "requireGreenChecks": true, "method": "squash", "onConflict": "transition" }
    }
  }
}
```