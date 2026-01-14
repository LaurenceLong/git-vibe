## Full project-centric (GitHub-like) state machine — with your rules

Rules integrated:

1. **After a PR is created, agent runs push commits to the same PR head branch** (PR updates in place).
2. **Issues also create worktrees and PRs** (not just Feature Requests).
3. **PR code review comments are handled in the corresponding worktree** (review actions may trigger agent work in that PR’s worktree/branch).

To avoid duplicating “Issue vs Feature Request” flows, I’ll model them as a single **WorkItem** type (kind = Issue | FeatureRequest) with identical automation behavior.

---

## 0) Mental model (what the state machine assumes)

- **Project** = workspace repo (created by copying `.git` from a source repo into a temp/workspace directory).
- A **WorkItem** (Issue/FeatureRequest) owns:
  - a **worktree + head branch** (created at WorkItem creation time)
  - **agent runs** that commit to that branch
  - optionally a **PR** (ChangeSet) whose head is that same branch
- A **PR** is always: `base = project.workspace_base_branch`, `head = workitem.branch`
- **PR review comments/threads** belong to the PR but are _actioned_ by agents in the same head branch/worktree.

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

## 2) Create Project (copy `.git` from source repo → workspace repo)

```mermaid
stateDiagram-v2
  [*] --> Draft

  Draft --> Validating: submit
  Validating --> Draft: invalid (missing name/source)
  Validating --> WorkspaceInit: valid

  state WorkspaceInit {
    [*] --> CreateWorkspaceDir
    CreateWorkspaceDir --> CopyGitDir: copy source/.git -> workspace/.git
    CopyGitDir --> VerifyGit: verify HEAD/refs, ensure usable repo
    VerifyGit --> SetWorkspaceBranch: checkout/init base branch (e.g., main)
    SetWorkspaceBranch --> PersistProject: store project + workspace paths
    PersistProject --> [*]
  }

  WorkspaceInit --> Draft: failed (fs/git error)
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

## 4) WorkItem (Issue/Feature Request) lifecycle: create → worktree → agents → PR

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
    CreateWorkItemRecord --> CreateWorktreeFromWorkspace
    CreateWorktreeFromWorkspace --> CreateHeadBranch
    CreateHeadBranch --> CheckoutBranchInWorktree
    CheckoutBranchInWorktree --> CaptureBaseSha
    CaptureBaseSha --> CaptureHeadSha
    CaptureHeadSha --> [*]
  }

  CreatingWorkItem --> CreateModal: failed (git/worktree error)
  CreatingWorkItem --> WorkItemDetail: success (route /work-items/:id)
```

**Key point:** Worktree is created **at WorkItem creation**, per your rule that issues also create worktrees/PRs.

---

### 4.2 WorkItem detail (discussion + agents + PR creation)

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

    %% Agent run on the WorkItem branch/worktree
    Discussion --> AgentConfig: click "Run Agents"
    AgentConfig --> AgentQueued: submit
    AgentQueued --> AgentRunning
    AgentRunning --> AgentSucceeded
    AgentRunning --> AgentFailed
    AgentRunning --> AgentCancelled

    AgentQueued --> AgentQueued: poll status/log
    AgentRunning --> AgentRunning: poll status/log

    AgentSucceeded --> HeadAdvanced: commits pushed to same WorkItem branch
    HeadAdvanced --> Discussion

    %% PR creation or linking
    Discussion --> PRStatus: view PR panel
    PRStatus --> PreparingPR: click "Create PR" (if none)
    PreparingPR --> PRCreated: success (PR points to same branch)
    PreparingPR --> PRCreateFailed: failed
    PRCreateFailed --> PRStatus: show error

    PRCreated --> OpenPR: click "Open PR"
    OpenPR --> [*]
  }
```

---

## 5) PR (ChangeSet) lifecycle: created from WorkItem branch, updated by agents, review comments handled via same worktree

This is the “full” part where your rule (agents keep pushing to same head branch) and “review comments deal in corresponding worktree” are explicit.

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

    %% Head updates (agents push commits to SAME head branch)
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
    Merging --> Merged: success (merged into workspace base branch)
    Merging --> OverviewTab: failed

    OverviewTab --> CloseConfirm: click Close
    CloseConfirm --> Closing
    Closing --> Closed: success
    Closing --> OverviewTab: failed
  }
```

---

## 6) Worktree management (because everything depends on it)

Since you rely heavily on worktrees, you need explicit “worktree present/missing” gating. This applies to WorkItems and PRs (same underlying worktree/branch).

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

---

## 7) Cross-object coupling (the important invariants)

These are not “states” but they explain why the machine is structured this way:

- **WorkItem.branch == PR.head_branch** (if PR exists)
- Agent runs always target **that branch/worktree**
- PR is updated when agent run succeeds (new commits pushed)
- Review threads can become **outdated** when head moves
- Merging PR applies changes into the **workspace repo base branch**
