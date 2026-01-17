```markdown
# GitVibe — PLAN.md (Refactored, PR-centric, WorkItem Workspace)

> **Status**: Implementation complete for MVP scope. This document describes the architecture and design principles.  
> **Audience**: engineers maintaining or extending GitVibe.  
> Goal: a GitHub-like agent coding management system where **each WorkItem owns a single persistent workspace** (git worktree + branch), **agent runs are serialized**, **backend auto-commits after each run**, and **merge is controlled via a first-class Pull Request model**.  
> Terminology note: we **do not** use “ChangeSet”. Patch export (optional) is a PR feature.

---

## 0) Core Principles

1. **One WorkItem = one workspace**
   - A workspace is a git worktree checked out on a dedicated branch.
   - The workspace persists across multiple agent runs.

2. **PR-first UX**
   - Users work through a Pull Request view: diffs, commits, checks (agent runs), approvals, and merge controls.
   - A WorkItem typically has exactly one PR (1:1 by default).

3. **No concurrent agent runs per WorkItem**
   - Enforced with a lock at the WorkItem level.
   - Merge operations also coordinate with this lock.

4. **Backend auto-commits after each agent run**
   - Agents may edit files freely. At run end, backend stages + commits changes (if any).
   - This produces a clean commit history and stable PR diffs.

5. **sessionId is required**
   - Every AgentRun has a `session_id` determined **before** launching the agent.
   - For Claude Code (and similar), we pass `--session-id=<session_id>` at launch.
   - Resume is implemented by re-launching with the same session_id (agent-specific semantics).

6. **Single source of truth for “running state”**
   - Running state is driven by `agent_runs.status`.
   - WorkItem/PR statuses represent lifecycle, not execution.

---

## 1) Domain Model (Concepts)

### 1.1 WorkItem
Represents a unit of work and owns a persistent workspace.

**Key responsibilities**
- Own the workspace (worktree path + head branch)
- Provide a stable target for agent runs
- Provide metadata for PR creation and review

### 1.2 Pull Request (PR)
A first-class entity controlling review and merge.

**Key responsibilities**
- Define base and head (branch and/or SHA)
- Render diff and commits
- Track approvals and merge gates
- Execute merge into base branch under controlled rules

### 1.3 AgentRun
An immutable-ish execution record per run attempt.

**Key responsibilities**
- Track status, logs, timestamps
- Record head SHA before and after
- Persist `session_id` (required)
- Associate to a WorkItem (and indirectly to its PR)

---

## 2) High-level User Workflow

1. Create WorkItem
2. Initialize workspace (explicit or implicit)
3. Open PR (often auto-created)
4. Trigger AgentRun(s) until satisfied
5. Review PR diff/commits, optionally approve
6. Merge PR (squash/merge/rebase)
7. Close WorkItem / PR lifecycle completed

---

## 3) Git Model & Repository Layout

### 3.1 Repositories
GitVibe uses a **relay repository** (local or server-side) as the execution environment:
- Holds a clone of the “project repo” (or a managed repo)
- Creates worktrees for WorkItems
- Runs agents in worktrees
- Performs merges in the relay repo

> If you later integrate with GitHub-hosted PRs, you can map this PR model to GitHub via API.
> This PLAN assumes GitVibe controls the repo locally (relay) for simplicity and reliability.

### 3.2 Branch Strategy
- Base branch: typically `main` (configurable per project via `default_branch`)
- WorkItem head branch: `wi/<work_item_id>` (deterministic, same WorkItem always gets same branch)
- Worktree directory: `<storage_base_dir>/worktrees/<work_item_id>/` (simplified from original plan)

### 3.3 Base SHA Strategy
PR diff correctness depends on base selection.

Recommended:
- On PR creation, store a **frozen `base_sha`** from `base_branch`.
- Allow explicit “Update base” action later if desired.

---

## 4) Persistence Model (Tables)

> Names are suggestions; adjust to your stack.  
> Use UUIDs if preferred; examples use integer IDs for readability.

### 4.1 projects
- `id` (UUID)
- `name` (unique)
- `source_repo_path` (path to source repository)
- `source_repo_url` (optional, for reference)
- `relay_repo_path` (path to relay repo clone)
- `default_branch` (e.g., `main`)
- `default_agent` (e.g., `opencode`, `claudecode`)
- `agent_params` (JSON string for agent configuration)
- `max_agent_concurrency` (default: 3)
- timestamps

### 4.2 work_items
- `id` (UUID)
- `project_id` (foreign key)
- `type` (`issue` | `feature-request`)
- `title`
- `body` (optional description)
- `status` (`open` | `closed`)
- **workspace fields**
  - `workspace_status` (`not_initialized` | `ready` | `error`)
  - `worktree_path` (unique)
  - `head_branch` (unique within project, format: `wi/<work_item_id>`)
  - `base_branch` (from project default)
  - `base_sha` (set when workspace initialized)
  - `head_sha` (cached; update after runs and on demand)
- **locking fields** (to serialize runs/merge)
  - `lock_owner_run_id` (nullable)
  - `lock_expires_at` (nullable; for crash recovery)
- timestamps

Constraints:
- unique `(project_id, head_branch)` (enforced via index)
- unique `worktree_path` (enforced via index)

### 4.3 pull_requests
- `id` (UUID)
- `project_id` (foreign key)
- `work_item_id` (unique, enforcing 1:1 by default)
- `title` (from work item)
- `description` (from work item body)
- `status` (`open` | `merged` | `closed`)
- `source_branch` (from work item head_branch)
- `target_branch` (from work item base_branch)
- `merge_strategy` (`merge` | `squash` | `rebase`, default: `merge`)
- `merged_at` (nullable)
- `merged_by` (nullable, currently 'system')
- `merge_commit_sha` (nullable)
- timestamps

Constraints:
- unique `work_item_id` (enforced)

Note: Base SHA and head SHA are tracked in the WorkItem, not duplicated in PR table.

### 4.4 agent_runs
- `id` (UUID)
- `project_id` (foreign key)
- `work_item_id` (foreign key)
- `agent_key` (e.g., `opencode`, `claudecode`)
- `session_id` (required; WorkItem-scoped by default: `wi-<work_item_id>`)
- `status` (`queued` | `running` | `succeeded` | `failed` | `cancelled`)
- `input_summary` (truncated prompt for display)
- `input_json` (full prompt and config as JSON)
- `linked_agent_run_id` (nullable, for resume/correction chains)
- `log` (text, for small logs)
- `log_path` (file path for large logs)
- `stdout_path` (file path for stdout)
- `stderr_path` (file path for stderr)
- `head_sha_before` (SHA before run)
- `head_sha_after` (SHA after auto-commit; may equal before if no changes)
- `commit_sha` (the auto-commit SHA if created; nullable if no changes)
- `started_at` (nullable)
- `finished_at` (nullable)
- timestamps

Indexes:
- `(work_item_id)` (for listing runs per work item)
- `(session_id)` (for session-based queries)
- `(status)` (for filtering by status)

### 4.5 review_threads (implemented)
- `id` (UUID)
- `pull_request_id` (foreign key)
- `status` (`open` | `resolved` | `outdated`)
- `severity` (`info` | `warning` | `error`)
- `anchor` (file path and line reference)
- timestamps

### 4.6 review_comments (implemented)
- `id` (UUID)
- `thread_id` (foreign key)
- `body` (comment text)
- timestamps

### 4.7 target_repos (implemented)
- `id` (UUID)
- `name`
- `repo_path` (unique, path to target repository)
- `default_branch`
- timestamps

### 4.8 imports (implemented)
- `id` (UUID)
- `pull_request_id` (foreign key)
- `target_repo_id` (foreign key)
- `strategy` (`patch` - currently only patch strategy)
- `status` (`pending` | `running` | `succeeded` | `failed`)
- `source_base_sha` (from PR base)
- `source_head_sha` (from PR head)
- `target_base_sha` (target repo SHA before import)
- `target_result_sha` (target repo SHA after import)
- `log` (import log text)
- `started_at` (nullable)
- `finished_at` (nullable)
- timestamps

### 4.9 approvals (optional MVP+)
- `id`
- `pull_request_id`
- `user_id`
- `state` (`approved` | `rejected`)
- timestamps

---

## 5) API Surface (Minimal)

### 5.1 WorkItems
- `POST /projects/:projectId/work-items`
  - creates WorkItem (no workspace yet)
- `POST /work-items/:id/init-workspace` (optional; can be implicit)
  - creates branch + worktree + sets workspace fields
- `GET /work-items/:id`
  - returns WorkItem + latest PR summary + latest run summary

### 5.2 Pull Requests
- `POST /work-items/:id/open-pr`
  - creates PR for WorkItem (often auto-run on work item creation)
- `GET /pull-requests/:id`
  - PR details + computed mergeability + latest runs
- `GET /pull-requests/:id/diff`
  - returns diff between `base_sha..head_sha`
- `GET /pull-requests/:id/commits`
  - returns commits reachable in head not in base (implementation-specific)
- `POST /pull-requests/:id/update-base` (optional)
  - refreshes base_sha to latest base_branch and optionally rebases head

### 5.3 Agent Runs
- `POST /work-items/:id/agent-runs`
  - starts a run (will init workspace if needed)
  - request includes:
    - `agent_key`
    - optional `session_id` override (otherwise deterministic default)
    - optional prompt/instructions
- `GET /agent-runs/:id`
  - status, logs pointer, shas, commit_sha
- `POST /agent-runs/:id/cancel` (optional; agent-dependent)
- `POST /work-items/:id/resume`
  - convenience wrapper that starts a new run using last known `session_id` (or work item session policy)

### 5.4 Merge
- `POST /pull-requests/:id/merge`
  - checks merge gates and performs merge into base_branch
- `POST /pull-requests/:id/close`
  - closes PR without merge

### 5.5 Optional: Patch Export (No ChangeSet)
- `GET /pull-requests/:id/patch`
  - returns `git diff base_sha..head_sha` (or format-patch if preferred)

---

## 6) Workspace Initialization (Deterministic & Idempotent)

### 6.1 When to init
Recommended default:
- Initialize workspace automatically on the first AgentRun request
- Still provide explicit init endpoint for admin/troubleshooting

### 6.2 Initialization steps (relay repo)
Given `project.repo_path` and `work_item`:

1. Ensure relay repo is present and clean enough for operations.
2. Fetch/refresh base branch if needed.
3. Resolve base SHA:
   - `base_sha = git rev-parse <base_branch>`
4. Create head branch name:
   - `head_branch = "wi/<workItemId>"`
5. Create worktree:
   - `git worktree add -b <head_branch> <worktree_path> <base_branch>`
6. Persist:
   - `worktree_path, head_branch, base_branch, base_sha, head_sha=base_sha`
   - `workspace_status=ready`

Idempotency:
- If worktree exists and is valid, return success and refresh `head_sha`.

---

## 7) AgentRun Execution Model (Serialized per WorkItem)

### 7.1 Locking
Before starting a run:
- Acquire WorkItem lock:
  - if `lock_owner_run_id` is set and not expired → reject (409 Conflict)
  - else set `lock_owner_run_id = runId` and `lock_expires_at = now + TTL`
- Refresh TTL heartbeat periodically while running
- Release lock in `finally` on success/failure/cancel

Also enforce:
- Only one `agent_runs.status in (queued, running)` per work item.

### 7.2 session_id policy
session_id must be known before spawning the agent.

Recommended default policy options (pick one and document it):
- **WorkItem-scoped session** (best for “continuous conversation”):
  - `session_id = "wi-" + work_item_id`
- **Run-scoped session** (best for strict audit isolation):
  - `session_id = "run-" + agent_run_id`

This PLAN assumes **WorkItem-scoped** unless caller overrides.

### 7.3 Run steps (Implementation)
1. Check project concurrency limit (enforced per project, not just per WorkItem)
2. Ensure workspace initialized (`worktree_path` exists via `ensureWorkspace`)
3. Acquire WorkItem lock (with TTL for crash recovery)
4. Determine `head_sha_before = git rev-parse HEAD` in worktree
5. Create AgentRun row with `status=running`, `session_id`, `head_sha_before`
6. Spawn agent asynchronously with:
   - CWD = worktree_path
   - Agent-specific arguments (e.g., `--session-id` for ClaudeCode)
   - Logs streamed to files (`log_path`, `stdout_path`, `stderr_path`)
7. Agent adapter handles process lifecycle and updates status
8. On agent completion (via adapter callback):
   - Call `finalizeAgentRun()`:
     - Stage changes: `git add -A`
     - Check if staged changes exist
     - If changes: commit with message `AgentRun <id>: <input_summary>`
     - Capture `commit_sha` and `head_sha_after`
   - Update AgentRun: status, finished_at, head_sha_after, commit_sha
   - Update WorkItem cached `head_sha`
   - Release lock and untrack from project concurrency
9. Error handling: On failure, still attempt finalization but mark status as `failed`

### 7.4 Failure behavior
If agent fails:
- Still attempt to capture logs
- Still attempt to stage/commit? Recommended:
  - **Do NOT auto-commit on failure** by default to avoid committing partial changes.
  - Provide an admin setting `commit_on_failure` if you want.
- Leave workspace as-is for debugging/resume.

---

## 8) PR Diff, Commits, and Review

### 8.1 Diff computation
PR diff is computed from frozen base SHA to current head SHA:
- `git diff --no-color <base_sha>..<head_sha>`

### 8.2 Commits list
Option A (simple):
- `git log --oneline <base_sha>..<head_sha>`

Option B (more GitHub-like):
- compute merge-base and list commits reachable from head not from base.

### 8.3 Review gates (MVP)
Define a mergeability function that returns:
- `mergeable: true/false`
- `reasons: []` (strings)

Minimal checks:
- PR.status == open
- No AgentRun running for WorkItem
- Workspace lock is free
- Head is not behind base in a conflicting way (optional)
- No conflicts when merging head into base (recommended)

---

## 9) Merge Implementation (PR is the control plane)

### 9.1 Coordination with AgentRun
Merging must coordinate with WorkItem lock:
- Acquire the same WorkItem lock for merge
- Reject merge if a run is currently running

### 9.2 Merge strategies
Given PR `base_branch`, `head_branch` in relay repo.

#### Strategy: merge commit
- `git checkout <base_branch>`
- `git merge --no-ff <head_branch> -m "Merge PR #<id>: <title>"`
- record `merge_commit_sha`

#### Strategy: squash
- `git checkout <base_branch>`
- `git merge --squash <head_branch>`
- `git commit -m "Squash PR #<id>: <title>"`
- record `merge_commit_sha`

#### Strategy: rebase
- `git checkout <head_branch>`
- `git rebase <base_branch>`
- `git checkout <base_branch>`
- `git merge --ff-only <head_branch>`
- record resulting base HEAD as merge sha

### 9.3 Conflict handling
Before merge, test mergeability:
- `git checkout <base_branch>`
- `git merge --no-commit --no-ff <head_branch>` (dry-ish)
- If conflicts:
  - abort `git merge --abort`
  - return mergeable=false with reason `conflicts`
- If no conflicts:
  - abort (if just testing) and proceed with chosen strategy

### 9.4 Post-merge updates
- Set PR status to `merged`
- Set WorkItem status optionally to `closed`
- Update cached SHAs
- Optionally clean up workspace:
  - keep worktree for audit, or
  - prune worktree after merge (configurable)

---

## 10) Mermaid Diagrams (Agent Workflow & PR Lifecycle)

### 10.1 Overall System Flow
```mermaid
flowchart TB
  U[User] --> UI[GitVibe UI]
  UI --> API[GitVibe API]
  API --> DB[(Database)]
  API --> GIT[Relay Git Repo]
  API --> AG[Agent Runner]
  AG -->|reads/writes| WT[Worktree (WorkItem Workspace)]
  WT --> GIT
  API --> UI
```

### 10.2 WorkItem Workspace Initialization
```mermaid
sequenceDiagram
  autonumber
  participant UI as UI
  participant API as API
  participant DB as DB
  participant G as Git (relay repo)

  UI->>API: POST /work-items/:id/init-workspace (optional)
  API->>DB: Load WorkItem + Project config
  API->>G: git rev-parse base_branch -> base_sha
  API->>G: git worktree add -b head_branch worktree_path base_branch
  API->>G: git -C worktree rev-parse HEAD -> head_sha
  API->>DB: Update WorkItem(worktree_path, head_branch, base_sha, head_sha, status=ready)
  API-->>UI: 200 OK (workspace ready)
```

### 10.3 AgentRun (Serialized) — Detailed
```mermaid
sequenceDiagram
  autonumber
  participant UI as UI
  participant API as API
  participant DB as DB
  participant G as Git
  participant R as Agent Runner
  participant WT as Worktree

  UI->>API: POST /work-items/:id/agent-runs {agent_key, prompt, session_id?}
  API->>DB: Load WorkItem
  alt workspace not initialized
    API->>API: initWorkspace(workItem)
  end

  API->>DB: Acquire WorkItem lock (lock_owner_run_id=runId, TTL)
  alt lock busy
    API-->>UI: 409 Conflict (run already in progress)
  end

  API->>G: git -C WT rev-parse HEAD -> head_before
  API->>DB: Create AgentRun(status=running, session_id, head_sha_before=head_before)

  API->>R: spawn agent (cwd=WT, --session-id session_id)
  R->>WT: agent edits files
  R-->>API: stream logs (log_path)

  R-->>API: process exit (code)
  API->>G: git -C WT add -A
  API->>G: git -C WT diff --cached --quiet?
  alt changes present
    API->>G: git -C WT commit -m "AgentRun #id: <summary>" -> commit_sha
  else no changes
    API->>API: commit_sha = null
  end
  API->>G: git -C WT rev-parse HEAD -> head_after

  alt agent exit success
    API->>DB: Update AgentRun(status=succeeded, head_after, commit_sha, finished_at)
  else agent exit failure
    API->>DB: Update AgentRun(status=failed, head_after, commit_sha?, finished_at, error)
  end

  API->>DB: Update WorkItem.head_sha = head_after
  API->>DB: Update PR.head_sha = head_after (if PR exists)
  API->>DB: Release WorkItem lock
  API-->>UI: 200 OK {agent_run_id}
```

### 10.4 Resume Semantics (sessionId-driven)
```mermaid
stateDiagram-v2
  [*] --> NoRunYet
  NoRunYet --> Running: startRun(session_id = policy or provided)
  Running --> Succeeded: agent exits OK + finalize
  Running --> Failed: agent exits nonzero + finalize
  Running --> Canceled: cancel request honored
  Succeeded --> Running: resume (new run, same session_id)
  Failed --> Running: resume (new run, same session_id)
  Canceled --> Running: resume (new run, same session_id)
```

> Note: “resume” creates a **new AgentRun** record but reuses the same session_id.  
> This keeps execution history immutable and audit-friendly while enabling conversation continuity.

### 10.5 PR Lifecycle & Merge Gate
```mermaid
stateDiagram-v2
  [*] --> Open
  Open --> Open: new AgentRun updates head_sha
  Open --> Open: approvals added/removed
  Open --> Closed: close without merge
  Open --> Merged: merge (if mergeable)
  Closed --> [*]
  Merged --> [*]
```

```mermaid
flowchart LR
  A[Merge button pressed] --> B{PR status == open?}
  B -- no --> X[Reject]
  B -- yes --> C{Any AgentRun running?}
  C -- yes --> X
  C -- no --> D{Conflicts when merging head into base?}
  D -- yes --> X
  D -- no --> E{Approvals satisfied? (optional)}
  E -- no --> X
  E -- yes --> F[Perform merge strategy]
  F --> G[Mark PR merged, write merge_commit_sha]
```

---

## 11) Implementation Notes (Pragmatic)

### 11.1 Deterministic commit messages
For auto-commits, use a consistent format:
- `AgentRun <id>: <input_summary>`
Where `input_summary` is the first 200 characters of the prompt. Full prompt and config stored in `input_json`.

### 11.2 Large logs
Prefer `log_path` on disk with rotation; store a small tail in DB if needed.

### 11.3 Lock TTL and crash recovery
- Use a TTL on the WorkItem lock (default: 1 hour)
- Lock is released in `finally` block after agent completion
- If TTL expires, new runs can acquire lock (previous run may be marked as failed if detected)
- Current implementation: Lock released immediately after finalization, no heartbeat renewal (simplified)

### 11.4 Security
- Run agents in a sandbox where possible
- Validate prompts/instructions storage (PII/secret handling)
- Restrict file system scope to worktree

---

## 12) Implementation Status

### ✅ MVP Scope (Complete)

**Core Features**
- ✅ WorkItem CRUD
- ✅ Workspace init (implicit on first agent run)
- ✅ PR open + PR view (diff + commits)
- ✅ AgentRun start + logs + status
- ✅ Backend auto-commit (after successful runs)
- ✅ WorkItem lock (no concurrent run per WorkItem)
- ✅ Merge (all three strategies: merge, squash, rebase) with conflict detection
- ✅ Project-level concurrency limits (configurable per project)
- ✅ Multiple agent adapters (OpenCode, ClaudeCode)
- ✅ Session-based resume functionality
- ✅ Review threads and comments
- ✅ Patch import to target repositories
- ✅ Agent run cancellation
- ✅ Update base / rebase PR functionality

**Additional Features Implemented**
- ✅ Models cache for agent adapters
- ✅ Review comment addressing (agent correction)
- ✅ Import job tracking and history
- ✅ Worktree cleanup on WorkItem deletion
- ✅ Comprehensive error handling and logging

### 🔄 Nice-to-have (Future Enhancements)
- Approvals / required reviewers
- Patch export endpoint (GET /pull-requests/:id/patch)
- GitHub integration (sync PR / statuses)
- Distributed runners across machines (job queue + remote workspace)
- Multiple workspaces per WorkItem (non-goal for MVP)

---

## 13) Non-goals (for initial release)
- Multiple workspaces per WorkItem
- Concurrent agents on the same WorkItem (enforced by lock)
- Fully GitHub-compatible review comment threading (basic threading implemented)
- Distributed runners across machines (add later with job queue + remote workspace)
- User authentication/authorization (single-user local-first design)
- Webhooks or external integrations (can be added later)

## 14) Current Implementation Details

### 14.1 Agent Adapters
Two agent adapters are implemented:
- **OpenCodeAgentAdapter**: For OpenCode CLI agent
- **ClaudeCodeAgentAdapter**: For Claude Code agent

Both extend `AgentAdapter` base class and implement:
- `validate()`: Check executable availability
- `run()`: Execute agent with prompt
- `correctWithReviewComments()`: Resume/correct with review feedback
- `getModels()`: List available models
- `cancel()`: Cancel running process
- `getStatus()`: Check run status

### 14.2 Project Concurrency
Projects have a `max_agent_concurrency` setting (default: 3) that limits concurrent agent runs across all WorkItems in a project. This is tracked in-memory by `AgentService`.

### 14.3 Storage Configuration
Storage paths are configurable via environment variables:
- `STORAGE_BASE_DIR`: Base directory for all GitVibe data
- Defaults to system temp directory (`/tmp/git-vibe` on Unix, `%TEMP%\git-vibe` on Windows)

### 14.4 Database Migrations
Two migration systems supported:
1. **Drizzle Kit migrations** (recommended): Uses `drizzle-kit generate` and `drizzle-orm/migrator`
2. **Raw SQL migrations**: Fallback for `.sql` files in `drizzle/` directory

Migration system auto-detects which to use based on presence of `drizzle/meta/_journal.json`.

---