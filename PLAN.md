# GitVibe — Plan (Multi‑Agent _Trigger_ Integration + Patch Import) with Tech Stack

GitVibe is a local-first web app that **triggers multiple coding agents** to work inside an isolated **ChangeSet worktree**, captures their outputs and code changes, supports review, and then **imports the final changes into our target repository using patch**.

---

## 1) Purpose

GitVibe exists to:

- **Integrate multiple agents** (different models/tools/vendors) under one consistent workflow.
- Provide a **controlled execution environment** (worktree + policies) so agents can safely edit code.
- Keep **auditable records** of what ran, what changed, and why.
- Deliver changes into **our repo** deterministically via **patch import** (no shared history required).

---

## 2) Core Concepts (Plain Language)

- **Project (Source Repo)**: a local Git repo (contains `.git`) where ChangeSet worktrees are created.
- **Target Repo**: our local Git repo where imported changes become commits.
- **ChangeSet**: one unit of work (issue/title/body) + one worktree folder + base commit (`base_sha`) + current head (`head_sha`).
- **Agent Run**: a recorded execution of an agent against a ChangeSet workspace, including logs and the before/after commit SHAs.
- **Review Thread**: an inline comment anchored to a diff location.
- **Import (Patch)**: generate diff from `base_sha..head_sha` and apply it in target repo, then commit.

---

## 3) Tech Stack Choice (Modern + Upgrade-Friendly)

### Frontend (Web UI)

- **React + Vite + TypeScript**
- **Shadcn Components**
- **Tailwind CSS**
- **TanStack Query** (async state, polling long-running jobs)
- **TanStack Router** (routing + data loading)
- **Zod** (runtime validation for API responses/requests)
- (Optional) **React Hook Form** (forms)

### Local Backend Service (API + Jobs)

- **Node.js (TypeScript) + Fastify**
- **SQLite** (local DB)
- **Drizzle ORM + migrations** (schema versioning and upgrades)

### Git Integration

- **Git CLI** invoked from backend (not from browser)
  - Worktrees, diff generation, patch apply, commit are done with real git.
  - Encapsulate all commands in a single `GitService`.

### Agent Execution (Trigger Mode)

- **Adapter-based execution layer** in backend: `AgentAdapter`
- Default executor: **local process runner** (spawned by Node)
- Optional hardened executor (future): **container-based sandbox** (e.g., Docker) if required

### Packaging (Optional, depending on product shape)

- If desktop app is required later: **Tauri** (preferred) or Electron
- If browser + localhost is fine: run backend as a local service and open UI in the browser

---

## 4) High-Level Architecture

**UI (React)** → calls → **Local API (Fastify)** → runs:

- DB operations (SQLite)
- Git operations (Git CLI)
- Agent runs (spawn/adapter)
- Import jobs (patch apply + commit)

Key boundary: **frontend never touches Git or filesystem directly**. All privileged actions happen in the backend.

---

## 5) End-to-End Workflow

1. **Register Project**
   - User points GitVibe to a local source repo path.

2. **Register Target Repo**
   - User points GitVibe to our local target repo path.

3. **Create ChangeSet**
   - GitVibe creates a worktree from `base_branch` and records `base_sha`.
   - ChangeSet becomes the “workspace” that agents will modify.

4. **Trigger Agent Runs**
   - User selects an agent + inputs (task prompt/config).
   - GitVibe triggers the run, captures logs, and records:
     - `head_sha_before` and `head_sha_after`
     - status and runtime metadata

5. **Review**
   - Reviewers view diff (`base_sha → head_sha`) and add inline threads.
   - Threads can be resolved or marked outdated.

6. **Iterate**
   - Trigger more agent runs to address review feedback.

7. **Import (Patch)**
   - GitVibe generates patch from the ChangeSet and applies it to target repo, commits, and records result.

---

## 6) Patch Import (Deterministic Delivery)

### Preconditions

- Source worktree exists and is clean enough to diff (committed or not—see policy below).
- Target repo working tree must be **clean**.
- Target repo is on a chosen branch (default: target default branch).

### Procedure (v1)

1. Refresh ChangeSet `head_sha` from worktree: `git rev-parse HEAD`
2. Generate patch: `git diff --no-color <base_sha>..<head_sha>`
3. In target repo:
   - `git rev-parse HEAD` → `target_base_sha`
   - `git apply --3way --whitespace=nowarn`
   - `git add -A`
   - `git commit -m "GitVibe import: <title> (<changeset_id>)"`
   - `git rev-parse HEAD` → `target_result_sha`
4. Record an `imports` row with status + logs

### No-op policy

If the patch is empty: record **succeeded** with log “nothing to import”, do not create a commit.

---

## 7) Agent Triggering (Execution Model)

### Agent Adapter Interface (backend)

Each agent integration implements:

- `validate(config)`: validate configuration and permissions
- `run({worktreePath, changesetId, input, envPolicy}) -> runId`
- `getStatus(runId) -> status`
- `cancel(runId)` (optional)
- Standard outputs:
  - logs (streamed and stored)
  - `head_sha_before`, `head_sha_after`
  - structured summary (optional)

### Execution Isolation & Security Constraints (required)

Minimum constraints for v1:

- Run agents under a **restricted OS user** (no admin privileges)
- **Allowlist** filesystem access:
  - write access only inside `worktree_path`
  - read-only access to configured toolchains if needed
- **Network policy** (choose one):
  - allow network only to configured endpoints (agent APIs, package registries), or
  - disable network by default and allow per-agent override
- **Time limits and cancellation** per run
- **Resource limits** where possible (CPU/memory via OS/container later)
- **Secret management**:
  - secrets stored in backend config, injected at runtime, never written to DB logs by default

> If stronger isolation is needed later, swap process runner → container runner without changing UI or DB schema.

---

## 8) Data Model (Minimal + Multi‑Agent Trigger)

Database: SQLite. IDs: UUID. JSON stored as TEXT.

### Tables

#### `projects` (source repos)

- `id`, `name`
- `source_repo_path` (unique)
- `source_repo_url` (optional)
- `default_branch`
- timestamps

#### `target_repos` (our repos)

- `id`, `name`
- `repo_path` (unique)
- `default_branch`
- timestamps

#### `changesets`

- `id`, `project_id`
- `title`, `body`
- `status`
- `base_branch`, `base_sha`
- `branch_name`, `head_sha`
- `worktree_path`
- timestamps

#### `review_threads`

- `id`, `changeset_id`
- `status`, `severity`
- `anchor` (JSON)
- timestamps

#### `review_comments`

- `id`, `thread_id`
- `body`, `created_at`

#### `agent_runs` (triggered runs)

- `id`, `changeset_id`
- `agent_key` (e.g., `claude-code`, `openai-codex`, `local-script`)
- `status` (`queued/running/succeeded/failed/cancelled`)
- `input_summary` (short)
- `input_json` (full config, JSON TEXT)
- `log` (text, truncated) + optionally `log_path` (file path)
- `head_sha_before`, `head_sha_after`
- `started_at`, `finished_at`
- timestamps

#### `imports` (patch import records)

- `id`, `changeset_id`, `target_repo_id`
- `strategy` = `patch`
- `status`
- `source_base_sha`, `source_head_sha`
- `target_base_sha`, `target_result_sha`
- `log`
- timestamps

---

## 9) API Surface (Minimal)

- Projects: create/list/get
- Target repos: create/list/get
- ChangeSets: create/list/get, refresh head sha
- Diff: get diff for changeset (`base_sha..head_sha`)
- Review: create thread/comment, resolve, list
- Agent runs:
  - `POST /changesets/:id/agent-runs` (trigger)
  - `GET /agent-runs/:id` (status + logs)
  - `POST /agent-runs/:id/cancel`
- Imports:
  - `POST /changesets/:id/imports` (start)
  - `GET /imports/:id` (status + logs)
  - list imports by changeset

---

## 10) UI Pages (Minimal)

- Projects
- Target repos
- ChangeSets (create/view)
- ChangeSet Diff + Review Threads
- Agent Runs (trigger + live status/logs)
- Imports (run + history)

---

## 11) Acceptance Criteria

- Can trigger an agent run for a ChangeSet and capture:
  - status, logs, `head_sha_before/after`
- Diff view updates as agents change code.
- Review threads persist; threads become `outdated` if anchor no longer matches.
- Patch import creates a commit in target repo matching the ChangeSet diff.
- All runs and imports are auditable from the UI.

## Sequence Diagram

```
sequenceDiagram
    autonumber
    actor User
    participant UI as Web UI (React)
    participant API as Local API (Fastify)
    participant DB as SQLite (Drizzle)
    participant Git as GitService (Git CLI)
    participant Src as Source Repo (Project/.git + Worktrees)
    participant Agent as AgentAdapter/Runner
    participant Tgt as Target Repo
    participant Review as Review (Human/Agent)

    %% ============ 0. Setup: Register Project & Target Repo ============
    rect rgb(245,245,245)
        note over User,DB: 0) Register Project (Source Repo) & Target Repo
        User->>UI: Click "Create Project"<br/>(input: name, source_repo_path or source_repo_url)
        UI->>API: POST /projects {name, source_repo_path|url}
        API->>Git: Validate path is a git repo<br/>(git rev-parse --git-dir)
        Git-->>API: OK / error
        API->>Git: Get default branch<br/>(git symbolic-ref refs/remotes/origin/HEAD)
        Git-->>API: default_branch
        API->>DB: INSERT projects(name, source_repo_path, source_repo_url, default_branch)
        DB-->>API: project_id
        API-->>UI: 201 {project}

        User->>UI: Register Target Repo<br/>(input: name, repo_path)
        UI->>API: POST /target-repos {name, repo_path}
        API->>Git: Validate target repo + get default branch
        Git-->>API: OK (default_branch)
        API->>DB: INSERT target_repos(name, repo_path, default_branch)
        DB-->>API: target_repo_id
        API-->>UI: 201 {target_repo}
    end

    %% ============ 1. Open Project (Load Overview) ============
    rect rgb(245,245,245)
        note over User,DB: 1) Open Project
        User->>UI: Open Project detail page
        UI->>API: GET /projects/:id
        API->>DB: SELECT project + changesets summary
        DB-->>API: project + changesets[]
        API-->>UI: 200 {project, changesets}
    end

    %% ============ 2. Create ChangeSet (Issue/Feature Request) ============
    rect rgb(235,248,255)
        note over User,DB: 2) Create ChangeSet (title, body, base_branch)
        User->>UI: Fill Issue/Feature Request form<br/>(title, body, base_branch)
        UI->>API: POST /projects/:id/changesets {title, body, base_branch}
        API->>Git: Get base_sha<br/>(git rev-parse <base_branch>)
        Git-->>API: base_sha
        API->>Git: Create worktree with new branch<br/>(git worktree add -b <branch_name> <worktree_path> <base_branch>)
        Git->>Src: Create worktree directory
        Src-->>Git: worktree created
        Git-->>API: worktree_path
        API->>Git: Get worktree head_sha<br/>(git -C <worktree_path> rev-parse HEAD)
        Git-->>API: head_sha (= base_sha initially)
        API->>DB: INSERT changesets(project_id, title, body,<br/>base_branch, base_sha, branch_name, head_sha,<br/>worktree_path, status="open")
        DB-->>API: changeset_id
        API-->>UI: 201 {changeset}
    end

    %% ============ 3. Trigger Agent Run -> Generate Code Changes ============
    rect rgb(255,250,230)
        note over User,Agent: 3) Trigger Agent Run, produce changes, record Agent Run
        User->>UI: Select agent_key + configure input + click "Run"
        UI->>API: POST /changesets/:id/agent-runs {agent_key, input_json}

        API->>Agent: AgentAdapter.validate(config)
        Agent-->>API: validation result

        alt Validation failed
            API-->>UI: 400 {error: validation failed}
        else Validation passed
            API->>DB: INSERT agent_runs(changeset_id, agent_key,<br/>status="queued", input_json, input_summary)
            DB-->>API: run_id
            API-->>UI: 202 {run_id, status="queued"}

            API->>Git: Get head_sha_before<br/>(git -C <worktree_path> rev-parse HEAD)
            Git-->>API: head_sha_before
            API->>DB: UPDATE agent_runs SET head_sha_before,<br/>status="running", started_at=now()
            DB-->>API: ok

            API->>Agent: AgentAdapter.run({worktreePath, changesetId,<br/>input, envPolicy})

            loop Agent execution (with streaming logs)
                Agent->>Src: Read/write files in worktree_path<br/>(restricted to worktree only)
                Agent-->>API: Stream log/progress events
                API->>DB: Append to agent_runs.log

                alt UI polling for status
                    UI->>API: GET /agent-runs/:run_id
                    API->>DB: SELECT status, log, timestamps
                    DB-->>API: current state
                    API-->>UI: 200 {status, log, timestamps}
                end
            end

            Agent-->>API: Run finished (succeeded/failed/cancelled)
            API->>Git: Get head_sha_after<br/>(git -C <worktree_path> rev-parse HEAD)
            Git-->>API: head_sha_after
            API->>DB: UPDATE agent_runs SET status,<br/>finished_at, head_sha_after, log
            DB-->>API: ok

            API->>DB: UPDATE changesets SET head_sha=head_sha_after
            DB-->>API: ok
            API-->>UI: 200 {run result, updated changeset}
        end
    end

    %% ============ 4. View Diff & Review (Human/Agent) ============
    rect rgb(240,255,240)
        note over User,Review: 4) Review: create threads/comments on base_sha..head_sha diff
        User->>UI: Open Diff + Review page
        UI->>API: GET /changesets/:id/diff
        API->>DB: SELECT changeset(base_sha, head_sha, worktree_path)
        DB-->>API: changeset refs
        API->>Git: Generate diff<br/>(git -C <worktree_path> diff --no-color <base_sha>..<head_sha>)
        Git-->>API: diff_text
        API-->>UI: 200 {diff_text}

        alt Human Review
            User->>UI: Create thread on diff<br/>(anchor, body, severity)
            UI->>API: POST /changesets/:id/review-threads<br/>{anchor, severity, body}
            API->>DB: INSERT review_threads(changeset_id,<br/>anchor, severity, status="open")<br/>INSERT review_comments(thread_id, body)
            DB-->>API: thread_id
            API-->>UI: 201 {thread}
        else Agent Review (optional)
            UI->>API: POST /changesets/:id/agent-runs<br/>{agent_key:"reviewer", input_json:{diff, policy}}
            note over API,Agent: Reuse Agent Run flow<br/>Agent outputs review suggestions
        end

        opt Iterate based on Review feedback
            note over User,Agent: Trigger more agent runs until ready for import
        end

        alt Resolve thread
            User->>UI: Mark thread as resolved
            UI->>API: POST /review-threads/:id/resolve
            API->>DB: UPDATE review_threads SET status="resolved"
            DB-->>API: ok
            API-->>UI: 200
        else Thread becomes outdated (anchor no longer matches)
            note over API,DB: When head_sha changes, check if anchor still valid
            API->>DB: UPDATE review_threads SET status="outdated"<br/>WHERE anchor no longer matches current diff
        end
    end

    %% ============ 5. Import (Patch to Target Repo) ============
    rect rgb(255,240,245)
        note over User,Tgt: 5) Import: generate patch from ChangeSet, apply to Target Repo
        User->>UI: Select Target Repo + click "Import (Patch)"
        UI->>API: POST /changesets/:id/imports<br/>{target_repo_id, strategy:"patch"}
        API->>DB: INSERT imports(changeset_id, target_repo_id,<br/>strategy="patch", status="running")
        DB-->>API: import_id
        API-->>UI: 202 {import_id, status="running"}

        API->>DB: SELECT changeset(worktree_path, base_sha, head_sha)
        DB-->>API: changeset refs
        API->>DB: SELECT target_repo(repo_path, default_branch)
        DB-->>API: target_repo refs

        %% 5.1 Refresh source head_sha
        API->>Git: Refresh head_sha from worktree<br/>(git -C <worktree_path> rev-parse HEAD)
        Git-->>API: source_head_sha
        API->>DB: UPDATE changesets SET head_sha=source_head_sha
        DB-->>API: ok

        %% 5.2 Generate patch
        API->>Git: Generate patch<br/>(git -C <worktree_path> diff --no-color <base_sha>..<source_head_sha>)
        Git-->>API: patch_text

        alt Patch is empty (No-op)
            API->>DB: UPDATE imports SET status="succeeded",<br/>log="nothing to import",<br/>source_base_sha, source_head_sha
            DB-->>API: ok
            API-->>UI: 200 {import: succeeded, no-op}
        else Patch is not empty
            %% 5.3 Verify target repo is clean
            API->>Git: Check target is clean<br/>(git -C <target_path> status --porcelain)
            Git-->>API: clean / dirty

            alt Target is dirty
                API->>DB: UPDATE imports SET status="failed",<br/>log="target repo not clean"
                DB-->>API: ok
                API-->>UI: 409 {error: target not clean}
            else Target is clean
                API->>Git: Get target_base_sha<br/>(git -C <target_path> rev-parse HEAD)
                Git-->>API: target_base_sha

                %% 5.4 Apply patch + commit
                API->>Git: Apply patch (3-way)<br/>(git -C <target_path> apply --3way --whitespace=nowarn)
                Git-->>API: apply result

                alt Apply conflict
                    API->>DB: UPDATE imports SET status="failed",<br/>log="patch apply conflict",<br/>source_base_sha, source_head_sha, target_base_sha
                    DB-->>API: ok
                    API-->>UI: 409 {error: conflict, logs}
                else Apply succeeded
                    API->>Git: Stage all changes<br/>(git -C <target_path> add -A)
                    Git-->>API: ok
                    API->>Git: Commit changes<br/>(git -C <target_path> commit -m<br/>"GitVibe import: <title> (<changeset_id>)")
                    Git-->>API: ok
                    API->>Git: Get target_result_sha<br/>(git -C <target_path> rev-parse HEAD)
                    Git-->>API: target_result_sha

                    API->>DB: UPDATE imports SET status="succeeded",<br/>source_base_sha, source_head_sha,<br/>target_base_sha, target_result_sha,<br/>log="import ok"
                    DB-->>API: ok
                    API-->>UI: 200 {import_id, status, target_result_sha}
                end
            end
        end
    end

    %% ============ 6. Cleanup & Close ChangeSet ============
    rect rgb(245,245,245)
        note over User,DB: 6) Cleanup: close ChangeSet, optionally remove worktree
        User->>UI: Mark ChangeSet as merged/closed
        UI->>API: POST /changesets/:id/close {status:"merged"}
        API->>DB: UPDATE changesets SET status="merged"
        DB-->>API: ok
        API-->>UI: 200

        opt Remove worktree (optional cleanup)
            User->>UI: Click "Remove worktree"
            UI->>API: POST /changesets/:id/remove-worktree
            API->>Git: Remove worktree<br/>(git worktree remove <worktree_path>)
            Git->>Src: Remove worktree directory
            Src-->>Git: removed
            Git-->>API: ok
            API->>DB: UPDATE changesets SET worktree_path=NULL
            DB-->>API: ok
            API-->>UI: 200
        end
    end
```
