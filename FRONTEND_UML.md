## Full project-centric (GitHub-like) state machine — with your rules

Rules integrated:

1. **After a PR (ChangeSet) is created, agent runs push commits to the same PR head branch** (PR updates in place).
2. **WorkItems are task definitions only** - they do NOT create worktrees or branches. WorkItems can create PRs (Changesets) which have their own worktrees.
3. **PR code review comments are handled in the corresponding worktree** (review actions may trigger agent work in that PR's worktree/branch).

To avoid duplicating “Issue vs Feature Request” flows, I’ll model them as a single **WorkItem** type (kind = Issue | FeatureRequest) with identical automation behavior.

---

## 0) Mental model (what the state machine assumes)

- **Source Repo** = original local Git repo (contains `.git`) that is the source of code.
- **Project** = a GitVibe project that creates a **Relay Repo** by copying `.git` from the source repo to `baseTempDir/projects/${project_name}` and running `git reset --hard` to restore files. This relay repo serves as the workspace for all operations.
- A **WorkItem** (Issue/FeatureRequest) is a **task definition only** - it contains title, body, type, and status. It does NOT have worktrees, branches, or SHAs.
- A **PR (ChangeSet)** owns:
  - a **worktree + head branch** (created at PR creation time from the relay repo)
  - **agent runs** that commit to that branch in the relay repo
  - optionally links to a **WorkItem** for traceability
  - **syncedAt** timestamp when synced to source repo (null if not synced yet)
- A **PR** is always: `base = relay_repo.default_branch`, `head = changeset.branch_name`
- **PR review comments/threads** belong to the PR but are _actioned_ by agents in the same head branch/worktree.
- **Sync to Source**: user manually syncs changes from the relay repo back to the source repo when ready. The sync creates a branch called `relay-${project_name}` in the source repo, copies all files from the relay repo to the source repo (excluding `.git` directory), stages the changes, and creates a commit. After successful sync, the changeset's `syncedAt` field is updated.
- **Pending Sync**: merged PRs that have `prStatus='merged'` but `syncedAt=null` are considered "pending sync" - they are merged in the relay repo but haven't been synced to the source repo yet.

---

## 1) Top level app (only Create Project)

```mermaid
stateDiagram-v2
  [*] --> Home

  Home --> CreateProjectModal: click "Create Project"
  CreateProjectModal --> CreatingProject: submit
  CreatingProject --> ProjectShell: success (route /projects/:id)
  CreatingProject --> CreateProjectModal: failed (show error)
  CreateProjectModal --> Home: cancel

  ProjectShell --> Home: exit project
```

---

## 2) Create Project (copy `.git` from source repo → relay repo)

```mermaid
stateDiagram-v2
  [*] --> Draft

  Draft --> Validating: submit
  Validating --> Draft: invalid (missing name/source)
  Validating --> RelayRepoInit: valid

  state RelayRepoInit {
    [*] --> CreateRelayRepoDir
    CreateRelayRepoDir --> CopyGitDir: copy source/.git -> relay/.git
    CopyGitDir --> ResetHard: git reset --hard HEAD
    ResetHard --> CleanUntracked: git clean -fd
    CleanUntracked --> VerifyGit: verify HEAD/refs, ensure usable repo
    VerifyGit --> SetRelayBranch: checkout/init base branch (e.g., main)
    SetRelayBranch --> PersistProject: store project + relay paths
    PersistProject --> [*]
  }

  RelayRepoInit --> Draft: failed (fs/git error)
```

---

## 3) Project shell navigation (GitHub-like under Project)

```mermaid
stateDiagram-v2
  [*] --> ProjectShell

  state ProjectShell {
    [*] --> Overview

    Overview --> WorkItems: tab "Issues & Feature Requests"
    WorkItems --> PullRequests: tab "Pull Requests"
    PullRequests --> WorkItems: tab "Issues & Feature Requests"
    WorkItems --> Settings: tab Settings
    Settings --> Overview: tab Overview

    WorkItems --> WorkItemDetail: open item
    WorkItemDetail --> WorkItems: back

    PullRequests --> PRDetail: open PR
    PRDetail --> PullRequests: back
  }
```

---

## 4) WorkItem (Issue/Feature Request) lifecycle: create → discussion → PR

**Note:** WorkItems do NOT create worktrees. WorkItems are task definitions only. PRs (Changesets) own worktrees, branches, and handle agent runs.

### 4.1 WorkItem list + creation

```mermaid
stateDiagram-v2
  [*] --> ListLoading
  ListLoading --> ListReady: loaded
  ListLoading --> ListError: failed
  ListError --> ListLoading: retry

  ListReady --> CreateModal: click "New" (Issue or Feature Request)
  CreateModal --> ListReady: cancel

  CreateModal --> Validating: submit
  Validating --> CreateModal: invalid (missing title)
  Validating --> CreatingWorkItem: valid

  state CreatingWorkItem {
    [*] --> CreateWorkItemRecord
    CreateWorkItemRecord --> [*]
  }

  CreatingWorkItem --> CreateModal: failed (db error)
  CreatingWorkItem --> WorkItemDetail: success (route /work-items/:id)
```

**Key point:** WorkItems are **task definitions only** - they do NOT create worktrees or branches. WorkItems can create PRs (Changesets) which have their own worktrees.

---

### 4.2 WorkItem detail (discussion + PR creation)

**Note:** WorkItems do NOT have worktrees. Agent runs and code changes happen in PRs (Changesets) which are created from WorkItems.

```mermaid
stateDiagram-v2
  [*] --> Loading
  Loading --> Viewing: loaded
  Loading --> LoadError: failed
  LoadError --> Loading: retry

  state Viewing {
    [*] --> Discussion

    Discussion --> CommentComposer: add comment
    CommentComposer --> PostingComment: submit
    PostingComment --> Discussion: success
    PostingComment --> CommentComposer: failed

    %% PR creation (WorkItems do NOT have worktrees - PRs own worktrees)
    Discussion --> PRStatus: view PR panel
    PRStatus --> PreparingPR: click "Create PR" (if none)
    PreparingPR --> PRCreated: success (PR has its own worktree/branch)
    PreparingPR --> PRCreateFailed: failed
    PRCreateFailed --> PRStatus: show error

    PRCreated --> OpenPR: click "Open PR"
    OpenPR --> [*]
  }
```

**Note:** Agent runs happen in the PR (ChangeSet) detail view, not in the WorkItem detail view. WorkItems are for discussion and task tracking only.

---

## 5) PR (ChangeSet) lifecycle: created from WorkItem (or independently), updated by agents, review comments handled via same worktree

This is the "full" part where your rule (agents keep pushing to same head branch) and "review comments deal in corresponding worktree" are explicit.

**Note:** PRs (Changesets) can be created independently without a WorkItem, but when created from a WorkItem, they link back for traceability. PRs own their own worktrees, branches, and SHAs.

```mermaid
stateDiagram-v2
  [*] --> PRLoading
  PRLoading --> PRReady: loaded
  PRLoading --> PRError: failed
  PRError --> PRLoading: retry

  state PRReady {
    [*] --> OverviewTab

    OverviewTab --> ConversationTab: tab Conversation
    ConversationTab --> FilesChangedTab: tab Files Changed
    FilesChangedTab --> ChecksTab: tab Checks/Agents
    ChecksTab --> OverviewTab: tab Overview

    %% Conversation comments (non-code)
    ConversationTab --> PRCommentComposer: add comment
    PRCommentComposer --> PRPostingComment
    PRPostingComment --> ConversationTab: success
    PRPostingComment --> PRCommentComposer: failed

    %% Diff + code review threads
    FilesChangedTab --> DiffLoading: load diff (base..head)
    DiffLoading --> DiffLoaded
    DiffLoading --> DiffError
    DiffError --> DiffLoading: retry

    DiffLoaded --> SelectingLines: select line/range
    SelectingLines --> ReviewThreadComposer
    ReviewThreadComposer --> PostingReviewThread
    PostingReviewThread --> DiffLoaded: success
    PostingReviewThread --> ReviewThreadComposer: failed

    DiffLoaded --> ResolvingThread: resolve thread
    ResolvingThread --> DiffLoaded: success
    ResolvingThread --> DiffLoaded: failed

    %% Head updates (agents push commits to SAME head branch in relay repo)
    DiffLoaded --> HeadMoved: head branch advanced (new commits)
    HeadMoved --> RecomputeDiff: refresh diff against same base
    RecomputeDiff --> AnchorRecheck: recompute anchors
    AnchorRecheck --> DiffLoaded: some threads may become outdated

    %% "Review comment will deal in its corresponding worktree"
    %% i.e., from a review thread, you can trigger agents working in the PR's worktree
    DiffLoaded --> AddressingComment: click "Address with agents" on thread
    AddressingComment --> AgentQueued: agent run targeting PR head branch/worktree
    AgentQueued --> AgentRunning
    AgentRunning --> AgentSucceeded
    AgentRunning --> AgentFailed
    AgentRunning --> AgentCancelled

    AgentQueued --> AgentQueued: poll status/log
    AgentRunning --> AgentRunning: poll status/log
    AgentSucceeded --> HeadMoved: commits pushed -> PR updated

    %% Merge/Close
    OverviewTab --> MergeConfirm: click Merge
    MergeConfirm --> Merging
    Merging --> Merged: success (merged into relay repo base branch)
    Merging --> OverviewTab: failed

    OverviewTab --> CloseConfirm: click Close
    CloseConfirm --> Closing
    Closing --> Closed: success
    Closing --> OverviewTab: failed
  }
```

---

## 6) Worktree management (because everything depends on it)

Since you rely heavily on worktrees, you need explicit "worktree present/missing" gating. This applies to PRs (Changesets) only, since WorkItems no longer have worktrees.

```mermaid
stateDiagram-v2
  [*] --> WorktreePresent

  WorktreePresent --> Removing: user/admin cleanup OR disk pressure
  Removing --> WorktreeMissing: removed (path null)
  Removing --> WorktreePresent: failed

  WorktreeMissing --> Recreating: user clicks "Recreate worktree"
  Recreating --> WorktreePresent: success
  Recreating --> WorktreeMissing: failed

  %% Guards (conceptual)
  WorktreeMissing --> WorktreeMissing: agents/diff/apply disabled, show CTA
```

**Note:** Worktree management applies to PRs (Changesets) only, since WorkItems no longer have worktrees.

---

## 7) Cross-object coupling (the important invariants)

These are not "states" but they explain why the machine is structured this way:

- **WorkItems are task definitions only** - no worktree, branch, or SHA tracking
- **PRs (Changesets) own worktrees, branches, and SHAs**
- Agent runs always target **that PR's branch/worktree in relay repo**
- PR is updated when agent run succeeds (new commits pushed to relay repo)
- Review threads can become **outdated** when head moves
- Merging PR applies changes into the **relay repo base branch**
- **Pending Sync**: merged PRs (`prStatus='merged'`) with `syncedAt=null` are waiting to be synced to source repo
- User can manually sync changes from the **relay repo to source repo** (creates `relay-${project_name}` branch, copies files excluding `.git`, stages and commits changes, updates `syncedAt`)
