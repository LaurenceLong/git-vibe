Below is a **full, expanded** state machine set (still aligned to `PLAN.md`)—no “v1/v2/optimized” labeling.

---

## 1) Application + Navigation (full)

```mermaid
stateDiagram-v2
  [*] --> Booting
  Booting --> Hydrating: load config/session
  Hydrating --> AppShell: ok
  Hydrating --> FatalError: failed (db/api unreachable)

  state AppShell {
    [*] --> Dashboard

    Dashboard --> ProjectList: nav Projects
    Dashboard --> TargetRepoList: nav Target Repos

    ProjectList --> ProjectDetail: select project
    ProjectDetail --> ProjectList: back

    TargetRepoList --> TargetRepoDetail: select target repo
    TargetRepoDetail --> TargetRepoList: back

    %% ProjectDetail contains ChangeSets list + create flow + settings
    state ProjectDetail {
      [*] --> ChangeSetList

      ChangeSetList --> ChangeSetCreate: click "New ChangeSet"
      ChangeSetCreate --> ChangeSetList: cancel
      ChangeSetCreate --> ChangeSetDetail: created

      ChangeSetList --> ChangeSetDetail: select changeset
      ChangeSetDetail --> ChangeSetList: back

      ChangeSetList --> ProjectSettings: settings tab
      ProjectSettings --> ChangeSetList: back
    }

    %% ChangeSetDetail has tabs
    state ChangeSetDetail {
      [*] --> OverviewTab
      OverviewTab --> DiffReviewTab: tab Diff/Review
      DiffReviewTab --> AgentRunsTab: tab Runs
      AgentRunsTab --> ImportsTab: tab Imports
      ImportsTab --> OverviewTab: tab Overview

      AgentRunsTab --> AgentRunDetail: select run
      AgentRunDetail --> AgentRunsTab: back

      ImportsTab --> ImportDetail: select import
      ImportDetail --> ImportsTab: back
    }
  }

  FatalError --> [*]
```

---

## 2) ChangeSet creation (Issue/Feature Request) — full UI + backend mapping

Key alignment points to `PLAN.md`:
- Requires `title`, `base_branch`; `body` optional (plan says title/body but also “body optional recommended” is fine).
- On submit: backend resolves `base_sha`, creates worktree, sets initial `head_sha = base_sha`, persists ChangeSet.

```mermaid
stateDiagram-v2
  [*] --> Idle

  Idle --> OpeningForm: Click "New ChangeSet"
  OpeningForm --> Drafting: form shown

  state Drafting {
    [*] --> FormReady

    %% Fields (UI microstates)
    FormReady --> EditingTitle: focus title
    EditingTitle --> FormReady: blur title

    FormReady --> EditingBody: focus body
    EditingBody --> FormReady: blur body

    FormReady --> OpeningBranchSelector: open base_branch dropdown
    OpeningBranchSelector --> LoadingBranches: fetch branches
    LoadingBranches --> BranchListLoaded: success
    LoadingBranches --> BranchListError: failed
    BranchListError --> LoadingBranches: retry
    BranchListLoaded --> SelectingBranch: user selecting
    SelectingBranch --> FormReady: branch selected

    %% Optional draft persistence
    FormReady --> SavingDraft: autosave/manual save
    SavingDraft --> FormReady: saved
    SavingDraft --> DraftSaveError: failed
    DraftSaveError --> SavingDraft: retry
    DraftSaveError --> FormReady: dismiss error

    %% Validation + submit
    FormReady --> Validating: submit
    Validating --> FormReady: invalid (missing title/base_branch)
    Validating --> Submitting: valid
  }

  state Submitting {
    [*] --> PostingChangeSet
    PostingChangeSet --> CreatingWorktree: API accepted (job started)
    CreatingWorktree --> Created: worktree created + base_sha + head_sha
    CreatingWorktree --> CreateFailed: git/api error
    CreateFailed --> Drafting: show error + allow retry/edit
  }

  Created --> NavigatingToDetail: route to /changesets/:id
  NavigatingToDetail --> [*]
```

---

## 3) ChangeSet lifecycle (full, including worktree availability + close/cleanup)

This models:
- durable ChangeSet status (`open/merged/closed`)
- worktree may be removed (worktree_path becomes null)
- head refresh
- “reopen” is optional (your earlier diagrams had it; `PLAN.md` doesn’t require it, but it’s safe to model if you implement)

```mermaid
stateDiagram-v2
  [*] --> LoadingChangeSet
  LoadingChangeSet --> Open: status=open
  LoadingChangeSet --> Closed: status=closed
  LoadingChangeSet --> Merged: status=merged
  LoadingChangeSet --> LoadError: fetch failed
  LoadError --> LoadingChangeSet: retry

  state Open {
    [*] --> WorkspaceAvailable

    %% Worktree capability
    WorkspaceAvailable --> WorkspaceRemoving: remove worktree requested
    WorkspaceRemoving --> WorkspaceMissing: removed (worktree_path=null)
    WorkspaceRemoving --> WorkspaceAvailable: remove failed

    %% Head refresh
    WorkspaceAvailable --> RefreshingHead: refresh head_sha requested
    RefreshingHead --> WorkspaceAvailable: refreshed (changed or unchanged)
    RefreshingHead --> WorkspaceAvailable: refresh failed (show toast)

    %% Close transitions
    WorkspaceAvailable --> ClosingAsClosed: close requested
    WorkspaceAvailable --> ClosingAsMerged: mark merged requested
    WorkspaceMissing --> ClosingAsClosed: close requested
    WorkspaceMissing --> ClosingAsMerged: mark merged requested

    ClosingAsClosed --> Closed: success
    ClosingAsMerged --> Merged: success
    ClosingAsClosed --> WorkspaceAvailable: failed
    ClosingAsMerged --> WorkspaceAvailable: failed
  }

  %% Optional reopen (only if you implement)
  Closed --> Reopening: reopen requested
  Reopening --> Open: success
  Reopening --> Closed: failed
```

---

## 4) Agent runs (full job model + UI polling/log streaming)

Aligns to `PLAN.md` statuses and fields: `queued/running/succeeded/failed/cancelled` and `head_sha_before/after`.

```mermaid
stateDiagram-v2
  [*] --> RunsTabIdle

  RunsTabIdle --> LoadingRuns: enter tab / load list
  LoadingRuns --> RunsLoaded: success
  LoadingRuns --> RunsError: failed
  RunsError --> LoadingRuns: retry

  RunsLoaded --> ConfiguringRun: click "Run Agent"
  ConfiguringRun --> ValidatingConfig: submit run config
  ValidatingConfig --> ConfiguringRun: invalid (adapter validate failed)
  ValidatingConfig --> CreatingRunRecord: valid

  CreatingRunRecord --> Queued: POST /changesets/:id/agent-runs => 202 + run_id
  CreatingRunRecord --> RunsLoaded: failed (API error)

  %% Job progression (backend-driven)
  Queued --> Running: runner started
  Running --> Succeeded: finished ok
  Running --> Failed: finished failed
  Running --> Cancelled: cancelled

  %% UI polling / log updates
  Queued --> Queued: poll GET /agent-runs/:id
  Running --> Running: poll GET /agent-runs/:id (append logs)

  %% Cancellation flow (optional per plan)
  Queued --> Cancelling: user clicks cancel
  Running --> Cancelling: user clicks cancel
  Cancelling --> Cancelled: cancel confirmed
  Cancelling --> Running: cancel rejected/too late

  %% Post-run effects
  Succeeded --> RefreshingChangeSetHead: update changeset head_sha (or invalidate query)
  RefreshingChangeSetHead --> RunsLoaded
  Failed --> RunsLoaded
  Cancelled --> RunsLoaded
```

---

## 5) Diff + Review threads (full, including “outdated” on head changes)

Aligns to `PLAN.md`:
- diff is `base_sha..head_sha`
- threads anchored to diff
- thread can become `outdated` when head changes and anchor no longer matches

```mermaid
stateDiagram-v2
  [*] --> DiffTabIdle

  DiffTabIdle --> LoadingDiff: enter tab / load diff
  LoadingDiff --> DiffLoaded: success
  LoadingDiff --> DiffError: failed
  DiffError --> LoadingDiff: retry

  state DiffLoaded {
    [*] --> ViewingDiff

    ViewingDiff --> SelectingAnchor: click line/range
    SelectingAnchor --> ThreadComposerOpen: anchor selected

    ThreadComposerOpen --> PostingThread: submit comment
    PostingThread --> ViewingDiff: created (thread=open)
    PostingThread --> ThreadComposerOpen: failed

    ViewingDiff --> LoadingThreads: load threads list
    LoadingThreads --> ViewingDiff: loaded
    LoadingThreads --> ViewingDiff: failed (show error)

    %% Thread state transitions
    ViewingDiff --> ResolvingThread: click resolve
    ResolvingThread --> ViewingDiff: resolved
    ResolvingThread --> ViewingDiff: failed

    %% Head change invalidation (triggered externally)
    ViewingDiff --> HeadChanged: changeset head_sha updated (poll/invalidate)
    HeadChanged --> RecomputingAnchors: re-check anchors against new diff
    RecomputingAnchors --> ViewingDiff: threads updated (some outdated)
  }
```

---

## 6) Import (patch) flow (full, including no-op + dirty target + conflict)

Aligns exactly to `PLAN.md` section 6:
- refresh source head
- generate patch
- if empty => succeeded, no commit
- check target clean
- apply 3-way, commit, record SHAs/logs

```mermaid
stateDiagram-v2
  [*] --> ImportsTabIdle

  ImportsTabIdle --> LoadingImports: enter tab / load history
  LoadingImports --> ImportsLoaded: success
  LoadingImports --> ImportsError: failed
  ImportsError --> LoadingImports: retry

  ImportsLoaded --> ConfiguringImport: click "Import (Patch)"
  ConfiguringImport --> ValidatingImport: select target_repo + confirm
  ValidatingImport --> ConfiguringImport: invalid (missing target_repo)
  ValidatingImport --> StartingImport: POST /changesets/:id/imports => 202 import_id

  StartingImport --> ImportRunning: job running

  %% UI polling
  ImportRunning --> ImportRunning: poll GET /imports/:id (status/log)

  %% Outcomes (backend-driven)
  ImportRunning --> ImportSucceeded: applied + committed (target_result_sha set)
  ImportRunning --> ImportSucceededNoop: empty patch ("nothing to import")
  ImportRunning --> ImportFailedDirtyTarget: target repo not clean (409)
  ImportRunning --> ImportFailedConflict: apply --3way conflict (409)
  ImportRunning --> ImportFailedOther: unexpected failure

  %% Retry path
  ImportFailedDirtyTarget --> ImportsLoaded: user fixes target + retries
  ImportFailedConflict --> ImportsLoaded: user resolves manually + retries (or abort)
  ImportFailedOther --> ImportsLoaded: retry

  ImportSucceeded --> ImportsLoaded
  ImportSucceededNoop --> ImportsLoaded
```
