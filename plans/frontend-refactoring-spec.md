# Frontend Refactoring Technical Specification

## Executive Summary

This document provides a comprehensive technical specification for refactoring the GitVibe frontend to align with the GitHub-like project-centric architecture defined in [`FRONTEND_UML.md`](../FRONTEND_UML.md). The refactoring introduces a new **WorkItem** entity (Issues & Feature Requests), restructures the Project Shell with tab-based navigation, and enhances PR (ChangeSet) functionality with conversation, merge/close actions, and worktree management.

---

## Table of Contents

1. [Type System Updates](#1-type-system-updates)
2. [Component Architecture](#2-component-architecture)
3. [Route Structure](#3-route-structure)
4. [State Management](#4-state-management)
5. [API Integration](#5-api-integration)
6. [Migration Strategy](#6-migration-strategy)
7. [Implementation Phases](#7-implementation-phases)

---

## 1. Type System Updates

### 1.1 New Types to Add

#### WorkItem Type

```typescript
/**
 * WorkItem represents an Issue or Feature Request
 * Created from a project, owns a worktree + branch, and optionally creates a PR
 */
export interface WorkItem {
  id: string;
  projectId: string;
  kind: "issue" | "feature-request";
  title: string;
  body: string | null;
  status: "open" | "in-progress" | "closed";

  // Git references
  baseBranch: string;
  baseSha: string;
  branchName: string;
  headSha: string | null;

  // Worktree management
  worktreePath: string | null; // null if worktree was removed
  worktreeStatus: "present" | "missing" | "recreating";

  // Optional PR linkage
  prId: string | null; // Reference to ChangeSet if PR was created

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

/**
 * WorkItem comment for discussion
 */
export interface WorkItemComment {
  id: string;
  workItemId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Enhanced ChangeSet (PR) Type

```typescript
/**
 * ChangeSet represents a Pull Request
 * Enhanced with PR-specific states and merge/close actions
 */
export interface ChangeSet {
  id: string;
  projectId: string;
  workItemId: string | null; // Optional: created from WorkItem

  // PR metadata
  title: string;
  body: string | null;
  status: "open" | "merged" | "closed";

  // Git references
  baseBranch: string; // Always project.workspace_base_branch
  baseSha: string;
  branchName: string; // PR head branch (same as WorkItem.branch if linked)
  headSha: string | null;

  // Worktree management
  worktreePath: string | null;
  worktreeStatus: "present" | "missing" | "recreating";

  // Merge metadata
  mergedAt: Date | null;
  mergedBy: string | null;
  mergedSha: string | null;

  // Close metadata
  closedAt: Date | null;
  closedBy: string | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * PR conversation comment (non-code review)
 */
export interface PRComment {
  id: string;
  changesetId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Worktree Status Type

```typescript
/**
 * Worktree state for UI gating
 */
export type WorktreeStatus = "present" | "missing" | "recreating";

/**
 * Worktree management action result
 */
export interface WorktreeActionResult {
  success: boolean;
  status: WorktreeStatus;
  path: string | null;
  error?: string;
}
```

### 1.2 Type Modifications

#### Updated Project Type

```typescript
/**
 * Project represents a source project with workspace
 */
export interface Project {
  id: string;
  name: string;
  sourceRepoPath: string;
  sourceRepoUrl: string | null;
  defaultBranch: string;

  // Workspace metadata
  workspacePath: string; // Path to workspace repo (copy of source)
  workspaceBaseBranch: string; // Base branch for all PRs

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

#### Updated AgentRun Type

```typescript
/**
 * AgentRun represents an AI agent execution
 * Can run on WorkItem or ChangeSet (same underlying branch)
 */
export interface AgentRun {
  id: string;

  // Target (either WorkItem or ChangeSet, not both)
  workItemId: string | null;
  changesetId: string | null;

  agentKey: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";

  inputSummary: string | null;
  inputJson: string;
  log: string | null;
  logPath: string | null;

  headShaBefore: string | null;
  headShaAfter: string | null;

  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### 1.3 Type Union for Review Threads

```typescript
/**
 * ReviewThread can belong to WorkItem or ChangeSet
 */
export interface ReviewThread {
  id: string;

  // Target (either WorkItem or ChangeSet)
  workItemId: string | null;
  changesetId: string | null;

  status: "open" | "resolved" | "outdated";
  severity: "info" | "warning" | "error";
  anchor: string; // JSON string with file, line, context

  // Agent addressing
  canAddressWithAgent: boolean;

  createdAt: Date;
  updatedAt: Date;
}
```

---

## 2. Component Architecture

### 2.1 Component Hierarchy Overview

```
App
└── Layout
    ├── ProjectShell (NEW)
    │   ├── ProjectHeader
    │   ├── ProjectTabs (NEW)
    │   │   ├── OverviewTab
    │   │   ├── WorkItemsTab (NEW)
    │   │   ├── PullRequestsTab (NEW)
    │   │   └── SettingsTab (NEW)
    │   └── TabContent
    ├── WorkItemDetail (NEW)
    │   ├── WorkItemHeader
    │   ├── WorkItemTabs (NEW)
    │   │   ├── DiscussionTab (NEW)
    │   │   ├── AgentRunsTab (ENHANCED)
    │   │   └── PRStatusPanel (NEW)
    │   └── WorktreeStatusBanner (NEW)
    ├── PRDetail (ENHANCED)
    │   ├── PRHeader (ENHANCED)
    │   ├── PRTabs (NEW)
    │   │   ├── OverviewTab (ENHANCED)
    │   │   ├── ConversationTab (NEW)
    │   │   ├── FilesChangedTab (RENAME: DiffReviewTab)
    │   │   └── ChecksTab (NEW)
    │   ├── MergeCloseActions (NEW)
    │   └── WorktreeStatusBanner (NEW)
    └── Existing routes (index, target-repos, etc.)
```

### 2.2 New Components

#### ProjectShell Component

**Location:** `frontend/src/components/projects/ProjectShell.tsx`

**Purpose:** Main container for project-level navigation with 4 tabs

**Props:**

```typescript
interface ProjectShellProps {
  projectId: string;
  children: React.ReactNode;
}

interface ProjectShellContext {
  project: Project;
  activeTab: "overview" | "workitems" | "pullrequests" | "settings";
  setActiveTab: (tab: string) => void;
}
```

**Responsibilities:**

- Render project header with name and metadata
- Manage tab state (Overview, WorkItems, Pull Requests, Settings)
- Provide context for child components
- Handle navigation between tabs

**Implementation Notes:**

- Use React Context for sharing project data
- Integrate with TanStack Router for URL-based tab state
- Show loading/error states for project data

#### WorkItemsTab Component

**Location:** `frontend/src/components/projects/WorkItemsTab.tsx`

**Purpose:** List and filter WorkItems (Issues & Feature Requests)

**Props:**

```typescript
interface WorkItemsTabProps {
  projectId: string;
}

interface WorkItemFilters {
  kind?: "issue" | "feature-request" | "all";
  status?: "open" | "in-progress" | "closed" | "all";
  search?: string;
}
```

**Responsibilities:**

- Display list of WorkItems with filters
- Show WorkItem status badges
- Provide "New WorkItem" button
- Link to WorkItem detail pages
- Show worktree status indicators

**UI Elements:**

- Filter dropdowns (kind, status)
- Search input
- WorkItem cards with title, status, worktree indicator
- Pagination or infinite scroll

#### PullRequestsTab Component

**Location:** `frontend/src/components/projects/PullRequestsTab.tsx`

**Purpose:** List and filter Pull Requests (ChangeSets)

**Props:**

```typescript
interface PullRequestsTabProps {
  projectId: string;
}

interface PRFilters {
  status?: "open" | "merged" | "closed" | "all";
  search?: string;
}
```

**Responsibilities:**

- Display list of PRs with filters
- Show PR status badges (open/merged/closed)
- Provide "New PR" button (or link to WorkItem creation)
- Link to PR detail pages
- Show worktree status indicators

**UI Elements:**

- Filter dropdowns (status)
- Search input
- PR cards with title, status, worktree indicator
- Merge/close action buttons (for open PRs)

#### WorkItemDetail Component

**Location:** `frontend/src/routes/workitems/$id.tsx`

**Purpose:** Main page for viewing and managing a WorkItem

**Responsibilities:**

- Display WorkItem metadata (title, body, status)
- Show worktree status with recreate action
- Render tab-based interface (Discussion, Agent Runs, PR Status)
- Handle WorkItem close action

**Tabs:**

1. **DiscussionTab**: Comments and conversation
2. **AgentRunsTab**: Agent runs targeting the WorkItem branch
3. **PRStatusPanel**: Show linked PR or create PR button

#### WorkItemDiscussionTab Component

**Location:** `frontend/src/components/workitems/DiscussionTab.tsx`

**Purpose:** Display and manage WorkItem comments

**Props:**

```typescript
interface DiscussionTabProps {
  workItemId: string;
}
```

**Responsibilities:**

- Display chronological list of comments
- Provide comment composer
- Show timestamps and author info
- Allow comment editing/deletion (if needed)

#### WorkItemPRStatusPanel Component

**Location:** `frontend/src/components/workitems/PRStatusPanel.tsx`

**Purpose:** Show PR linkage status and actions

**Props:**

```typescript
interface PRStatusPanelProps {
  workItemId: string;
  linkedPR: ChangeSet | null;
}
```

**Responsibilities:**

- Display PR status (none, open, merged, closed)
- Provide "Create PR" button if no PR exists
- Link to PR detail if PR exists
- Show PR metadata (head SHA, base branch)

#### PRDetail Component (Enhanced)

**Location:** `frontend/src/routes/pullrequests/$id.tsx` (NEW ROUTE)

**Purpose:** Main page for viewing and managing a Pull Request

**Responsibilities:**

- Display PR metadata (title, body, status)
- Show worktree status with recreate action
- Render tab-based interface (Overview, Conversation, Files Changed, Checks)
- Handle merge/close actions

**Tabs:**

1. **OverviewTab**: PR summary, status, merge/close actions
2. **ConversationTab**: PR comments and conversation
3. **FilesChangedTab**: Diff view with review threads (existing DiffReviewTab)
4. **ChecksTab**: Agent runs and CI-like status

#### PRConversationTab Component

**Location:** `frontend/src/components/pullrequests/ConversationTab.tsx`

**Purpose:** Display and manage PR conversation comments

**Props:**

```typescript
interface PRConversationTabProps {
  changesetId: string;
}
```

**Responsibilities:**

- Display chronological list of PR comments
- Provide comment composer
- Show timestamps and author info
- Allow comment editing/deletion (if needed)

#### PRChecksTab Component

**Location:** `frontend/src/components/pullrequests/ChecksTab.tsx`

**Purpose:** Display agent runs and CI-like status

**Props:**

```typescript
interface ChecksTabProps {
  changesetId: string;
}
```

**Responsibilities:**

- Display list of agent runs with status
- Show agent run logs
- Provide trigger agent run action
- Show CI-like pass/fail indicators

#### WorktreeStatusBanner Component

**Location:** `frontend/src/components/worktree/WorktreeStatusBanner.tsx`

**Purpose:** Display worktree status and provide actions

**Props:**

```typescript
interface WorktreeStatusBannerProps {
  status: WorktreeStatus;
  path: string | null;
  onRecreate?: () => void;
  onRemove?: () => void;
}
```

**Responsibilities:**

- Display worktree status (present/missing/recreating)
- Provide "Recreate worktree" button if missing
- Provide "Remove worktree" button if present
- Show worktree path if present
- Show error message if recreation failed

**UI States:**

- **Present**: Green banner, show path, "Remove" button
- **Missing**: Yellow banner, "Recreate" button
- **Recreating**: Blue banner with spinner, no action buttons

#### MergeCloseActions Component

**Location:** `frontend/src/components/pullrequests/MergeCloseActions.tsx`

**Purpose:** Provide merge and close actions for PRs

**Props:**

```typescript
interface MergeCloseActionsProps {
  changesetId: string;
  status: "open" | "merged" | "closed";
  worktreeStatus: WorktreeStatus;
  onMerge?: () => void;
  onClose?: () => void;
}
```

**Responsibilities:**

- Display "Merge" button for open PRs
- Display "Close" button for open PRs
- Show merge/close confirmation modals
- Disable actions if worktree is missing
- Show merged/closed status badges

**UI States:**

- **Open PR with present worktree**: Show "Merge" and "Close" buttons
- **Open PR with missing worktree**: Show disabled buttons with tooltip
- **Merged PR**: Show "Merged" badge with SHA
- **Closed PR**: Show "Closed" badge

#### AddressWithAgentButton Component

**Location:** `frontend/src/components/review/AddressWithAgentButton.tsx`

**Purpose:** Trigger agent run to address review thread

**Props:**

```typescript
interface AddressWithAgentButtonProps {
  threadId: string;
  workItemId?: string;
  changesetId?: string;
  worktreeStatus: WorktreeStatus;
}
```

**Responsibilities:**

- Display "Address with agents" button on review threads
- Open agent configuration modal
- Trigger agent run targeting the worktree/branch
- Show loading state while agent runs

### 2.3 Enhanced Components

#### OverviewTab (for PRs)

**Location:** `frontend/src/components/pullrequests/OverviewTab.tsx` (NEW)

**Purpose:** Display PR overview with merge/close actions

**Enhancements:**

- Add PR status badge (open/merged/closed)
- Add merge/close action buttons
- Show merge metadata (merged by, merged at, merged SHA)
- Show close metadata (closed by, closed at)
- Display worktree status banner
- Show linked WorkItem if exists

#### DiffReviewTab → FilesChangedTab

**Location:** `frontend/src/components/pullrequests/FilesChangedTab.tsx` (RENAMED)

**Purpose:** Display diff with review threads

**Enhancements:**

- Add "Address with agents" button to review threads
- Show thread status (open/resolved/outdated)
- Provide resolve/unresolve actions
- Show outdated thread indicators

#### AgentRunsTab

**Location:** `frontend/src/components/changesets/AgentRunsTab.tsx` (REUSED)

**Enhancements:**

- Support both WorkItem and ChangeSet targets
- Show target type (WorkItem vs ChangeSet)
- Display agent runs for both entity types

---

## 3. Route Structure

### 3.1 Current Routes

```
/                           → Home (project list)
/projects                   → Projects list
/projects/:id               → Project detail (changesets only)
/changesets                 → Changesets list
/changesets/:id             → Changeset detail
/changesets/new             → Create changeset
/target-repos               → Target repos list
/target-repos/:id           → Target repo detail
```

### 3.2 New Routes

```
/projects/:id               → Project shell with tabs (ENHANCED)
  /overview                 → Overview tab (default)
  /workitems                → WorkItems tab (NEW)
  /pullrequests             → Pull Requests tab (NEW)
  /settings                 → Settings tab (NEW)

/workitems                  → WorkItems list (NEW)
/workitems/:id              → WorkItem detail (NEW)
  /discussion               → Discussion tab (default)
  /agent-runs               → Agent runs tab
  /pr-status                → PR status panel

/pullrequests               → Pull Requests list (NEW)
/pullrequests/:id           → Pull Request detail (NEW)
  /overview                 → Overview tab (default)
  /conversation             → Conversation tab (NEW)
  /files-changed            → Files changed tab (renamed from diff)
  /checks                   → Checks tab (NEW)
```

### 3.3 Route File Structure

```
frontend/src/routes/
├── __root.tsx
├── index.tsx
├── projects/
│   ├── index.tsx
│   ├── $id.tsx (ENHANCED: Project shell)
│   │   ├── overview.tsx (NEW)
│   │   ├── workitems.tsx (NEW)
│   │   ├── pullrequests.tsx (NEW)
│   │   └── settings.tsx (NEW)
├── workitems/ (NEW)
│   ├── index.tsx
│   ├── $id.tsx
│   │   ├── discussion.tsx
│   │   ├── agent-runs.tsx
│   │   └── pr-status.tsx
├── pullrequests/ (NEW)
│   ├── index.tsx
│   └── $id.tsx
│       ├── overview.tsx
│       ├── conversation.tsx
│       ├── files-changed.tsx
│       └── checks.tsx
├── changesets/ (DEPRECATED: migrate to pullrequests)
│   ├── index.tsx
│   ├── $id.tsx
│   └── new.tsx
└── target-repos/
    ├── index.tsx
    └── $id.tsx
```

### 3.4 Route Implementation Details

#### Project Shell Route (`/projects/$id`)

```typescript
// frontend/src/routes/projects/$id.tsx
export const Route = createFileRoute('/projects/$id')({
  component: ProjectShell,
  loader: async ({ params }) => {
    const project = await projectsApi.get(params.id).then(res => res.data);
    return { project };
  },
});

function ProjectShell() {
  const { project } = Route.useLoaderData();
  const navigate = useNavigate();
  const { tab = 'overview' } = Route.useSearch();

  return (
    <div>
      <ProjectHeader project={project} />
      <ProjectTabs activeTab={tab} onTabChange={(t) => navigate({ search: { tab: t } })}>
        <Tab value="overview">Overview</Tab>
        <Tab value="workitems">WorkItems</Tab>
        <Tab value="pullrequests">Pull Requests</Tab>
        <Tab value="settings">Settings</Tab>
      </ProjectTabs>
      <Outlet />
    </div>
  );
}
```

#### WorkItem Detail Route (`/workitems/$id`)

```typescript
// frontend/src/routes/workitems/$id.tsx
export const Route = createFileRoute('/workitems/$id')({
  component: WorkItemDetail,
  loader: async ({ params }) => {
    const workItem = await workItemsApi.get(params.id).then(res => res.data);
    const linkedPR = workItem.prId
      ? await changesetsApi.get(workItem.prId).then(res => res.data)
      : null;
    return { workItem, linkedPR };
  },
});

function WorkItemDetail() {
  const { workItem, linkedPR } = Route.useLoaderData();
  const { tab = 'discussion' } = Route.useSearch();

  return (
    <div>
      <WorkItemHeader workItem={workItem} />
      <WorktreeStatusBanner
        status={workItem.worktreeStatus}
        path={workItem.worktreePath}
        onRecreate={() => workItemsApi.recreateWorktree(workItem.id)}
      />
      <WorkItemTabs activeTab={tab}>
        <Tab value="discussion">Discussion</Tab>
        <Tab value="agent-runs">Agent Runs</Tab>
        <Tab value="pr-status">PR Status</Tab>
      </WorkItemTabs>
      <Outlet />
    </div>
  );
}
```

#### Pull Request Detail Route (`/pullrequests/$id`)

```typescript
// frontend/src/routes/pullrequests/$id.tsx
export const Route = createFileRoute('/pullrequests/$id')({
  component: PRDetail,
  loader: async ({ params }) => {
    const pr = await changesetsApi.get(params.id).then(res => res.data);
    const linkedWorkItem = pr.workItemId
      ? await workItemsApi.get(pr.workItemId).then(res => res.data)
      : null;
    return { pr, linkedWorkItem };
  },
});

function PRDetail() {
  const { pr, linkedWorkItem } = Route.useLoaderData();
  const { tab = 'overview' } = Route.useSearch();

  return (
    <div>
      <PRHeader pr={pr} linkedWorkItem={linkedWorkItem} />
      <WorktreeStatusBanner
        status={pr.worktreeStatus}
        path={pr.worktreePath}
        onRecreate={() => changesetsApi.recreateWorktree(pr.id)}
      />
      <PRTabs activeTab={tab}>
        <Tab value="overview">Overview</Tab>
        <Tab value="conversation">Conversation</Tab>
        <Tab value="files-changed">Files Changed</Tab>
        <Tab value="checks">Checks</Tab>
      </PRTabs>
      <Outlet />
    </div>
  );
}
```

### 3.5 Data Loading Patterns

#### TanStack Router Loaders

Use route loaders for initial data fetching:

```typescript
// Project shell loader
loader: async ({ params }) => {
  const [project, workItems, changesets] = await Promise.all([
    projectsApi.get(params.id).then((res) => res.data),
    workItemsApi.list(params.id).then((res) => res.data),
    changesetsApi.list(params.id).then((res) => res.data),
  ]);
  return { project, workItems, changesets };
};
```

#### TanStack Query for Reactive Data

Use TanStack Query for data that needs reactivity:

```typescript
// Polling agent runs
const { data: agentRuns } = useQuery({
  queryKey: ["agent-runs", workItemId],
  queryFn: () =>
    agentRunsApi.listByWorkItem(workItemId).then((res) => res.data),
  refetchInterval: (data) => {
    const hasActiveRuns = data?.some(
      (run) => run.status === "queued" || run.status === "running",
    );
    return hasActiveRuns ? 1500 : false;
  },
});

// Refreshing worktree status
const { data: worktreeStatus } = useQuery({
  queryKey: ["worktree-status", workItemId],
  queryFn: () =>
    workItemsApi.getWorktreeStatus(workItemId).then((res) => res.data),
  refetchInterval: 5000, // Poll every 5 seconds
});
```

---

## 4. State Management

### 4.1 TanStack Query Cache Keys

#### Project-Level Queries

```typescript
// Project data
["project", projectId]["projects"][ // List
  // WorkItems
  ("workitems", projectId)
][("workitem", workItemId)][("workitem-comments", workItemId)][ // List // Detail // Comments
  // Pull Requests (ChangeSets)
  ("pullrequests", projectId)
][("pullrequest", prId)][("pullrequest-comments", prId)][ // List // Detail // Comments
  // Diffs
  ("diff", prId, headSha)
][ // Diff content
  // Agent Runs
  ("agent-runs", workItemId)
][("agent-runs", prId)][("agent-run", runId)][ // For WorkItem // For PR // Detail
  // Worktree Status
  ("worktree-status", workItemId)
][("worktree-status", prId)];
```

### 4.2 Query Invalidation Strategy

#### Automatic Invalidation

```typescript
// Invalidate WorkItem list when creating a new WorkItem
const createWorkItem = useMutation({
  mutationFn: workItemsApi.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["workitems", projectId] });
  },
});

// Invalidate PR list when creating a new PR
const createPR = useMutation({
  mutationFn: changesetsApi.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["pullrequests", projectId] });
  },
});

// Invalidate agent runs when triggering a new run
const triggerAgentRun = useMutation({
  mutationFn: agentRunsApi.trigger,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["agent-runs", workItemId] });
  },
});

// Invalidate diff when head SHA changes
const refreshHead = useMutation({
  mutationFn: changesetsApi.refresh,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["pullrequest", prId] });
    queryClient.invalidateQueries({ queryKey: ["diff", prId] });
  },
});
```

#### Manual Invalidation

```typescript
// Invalidate worktree status after recreation
const recreateWorktree = useMutation({
  mutationFn: workItemsApi.recreateWorktree,
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: ["worktree-status", workItemId],
    });
  },
});
```

### 4.3 Optimistic Updates

#### Adding Comments

```typescript
const addComment = useMutation({
  mutationFn: ({ workItemId, body }) =>
    workItemsApi.addComment(workItemId, { body }),
  onMutate: async ({ workItemId, body }) => {
    await queryClient.cancelQueries({
      queryKey: ["workitem-comments", workItemId],
    });
    const previousComments = queryClient.getQueryData([
      "workitem-comments",
      workItemId,
    ]);

    queryClient.setQueryData(["workitem-comments", workItemId], (old) => [
      ...(old || []),
      { id: "temp", body, createdAt: new Date() },
    ]);

    return { previousComments };
  },
  onError: (err, variables, context) => {
    queryClient.setQueryData(
      ["workitem-comments", variables.workItemId],
      context.previousComments,
    );
  },
  onSettled: (data, error, variables) => {
    queryClient.invalidateQueries({
      queryKey: ["workitem-comments", variables.workItemId],
    });
  },
});
```

### 4.4 Global State with Context

#### ProjectShell Context

```typescript
// frontend/src/contexts/ProjectShellContext.tsx
interface ProjectShellContextValue {
  project: Project;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const ProjectShellProvider = ({ children, project }) => {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <ProjectShellContext.Provider value={{ project, activeTab, setActiveTab }}>
      {children}
    </ProjectShellContext.Provider>
  );
};

export const useProjectShell = () => {
  const context = useContext(ProjectShellContext);
  if (!context) throw new Error('useProjectShell must be used within ProjectShellProvider');
  return context;
};
```

---

## 5. API Integration

### 5.1 New API Endpoints Required

#### WorkItem Endpoints

```typescript
// frontend/src/lib/api.ts (additions)
export const workItemsApi = {
  // List WorkItems for a project
  list: (
    projectId: string,
    filters?: {
      kind?: "issue" | "feature-request" | "all";
      status?: "open" | "in-progress" | "closed" | "all";
      search?: string;
    },
  ) => api.get(`/projects/${projectId}/workitems`, { params: filters }),

  // Get WorkItem detail
  get: (id: string) => api.get(`/workitems/${id}`),

  // Create WorkItem
  create: (
    projectId: string,
    data: {
      kind: "issue" | "feature-request";
      title: string;
      body?: string;
      baseBranch?: string;
    },
  ) => api.post(`/projects/${projectId}/workitems`, data),

  // Update WorkItem
  update: (
    id: string,
    data: {
      title?: string;
      body?: string;
      status?: "open" | "in-progress" | "closed";
    },
  ) => api.patch(`/workitems/${id}`, data),

  // Close WorkItem
  close: (id: string) => api.post(`/workitems/${id}/close`),

  // Get WorkItem comments
  getComments: (id: string) => api.get(`/workitems/${id}/comments`),

  // Add comment to WorkItem
  addComment: (id: string, data: { body: string }) =>
    api.post(`/workitems/${id}/comments`, data),

  // Get worktree status
  getWorktreeStatus: (id: string) =>
    api.get(`/workitems/${id}/worktree-status`),

  // Recreate worktree
  recreateWorktree: (id: string) =>
    api.post(`/workitems/${id}/recreate-worktree`),

  // Remove worktree
  removeWorktree: (id: string) => api.post(`/workitems/${id}/remove-worktree`),

  // Create PR from WorkItem
  createPR: (
    id: string,
    data: {
      title?: string;
      body?: string;
    },
  ) => api.post(`/workitems/${id}/create-pr`),

  // Get linked PR
  getLinkedPR: (id: string) => api.get(`/workitems/${id}/pr`),
};
```

#### Pull Request (ChangeSet) Endpoints (Enhanced)

```typescript
// frontend/src/lib/api.ts (additions to changesetsApi)
export const changesetsApi = {
  // ... existing methods ...

  // List PRs for a project (rename from list)
  listByProject: (
    projectId: string,
    filters?: {
      status?: "open" | "merged" | "closed" | "all";
      search?: string;
    },
  ) => api.get(`/projects/${projectId}/pullrequests`, { params: filters }),

  // Merge PR
  merge: (id: string) => api.post(`/pullrequests/${id}/merge`),

  // Close PR
  close: (id: string) => api.post(`/pullrequests/${id}/close`),

  // Get PR comments
  getComments: (id: string) => api.get(`/pullrequests/${id}/comments`),

  // Add comment to PR
  addComment: (id: string, data: { body: string }) =>
    api.post(`/pullrequests/${id}/comments`, data),

  // Get worktree status
  getWorktreeStatus: (id: string) =>
    api.get(`/pullrequests/${id}/worktree-status`),

  // Recreate worktree
  recreateWorktree: (id: string) =>
    api.post(`/pullrequests/${id}/recreate-worktree`),

  // Remove worktree
  removeWorktree: (id: string) =>
    api.post(`/pullrequests/${id}/remove-worktree`),
};
```

#### Agent Run Endpoints (Enhanced)

```typescript
// frontend/src/lib/api.ts (additions to agentRunsApi)
export const agentRunsApi = {
  // ... existing methods ...

  // List agent runs for WorkItem
  listByWorkItem: (workItemId: string) =>
    api.get(`/workitems/${workItemId}/agent-runs`),

  // Trigger agent run for WorkItem
  triggerForWorkItem: (
    workItemId: string,
    data: {
      agentKey: string;
      inputSummary?: string;
      prompt: string;
      config: { executablePath: string; baseArgs?: string[] };
    },
  ) => api.post(`/workitems/${workItemId}/agent-runs`, data),

  // Trigger agent run for review thread
  triggerForThread: (
    threadId: string,
    data: {
      agentKey: string;
      inputSummary?: string;
      prompt: string;
      config: { executablePath: string; baseArgs?: string[] };
    },
  ) => api.post(`/review-threads/${threadId}/address-with-agent`, data),
};
```

#### Review Thread Endpoints (Enhanced)

```typescript
// frontend/src/lib/api.ts (additions to reviewsApi)
export const reviewsApi = {
  // ... existing methods ...

  // Address review thread with agent
  addressWithAgent: (
    threadId: string,
    data: {
      agentKey: string;
      prompt: string;
      config: { executablePath: string; baseArgs?: string[] };
    },
  ) => api.post(`/review-threads/${threadId}/address-with-agent`, data),
};
```

### 5.2 Backend API Changes Required

#### New Routes

**WorkItem Routes** (`backend/src/routes/workitems.ts`):

- `GET /projects/:projectId/workitems` - List WorkItems
- `POST /projects/:projectId/workitems` - Create WorkItem
- `GET /workitems/:id` - Get WorkItem detail
- `PATCH /workitems/:id` - Update WorkItem
- `POST /workitems/:id/close` - Close WorkItem
- `GET /workitems/:id/comments` - Get comments
- `POST /workitems/:id/comments` - Add comment
- `GET /workitems/:id/worktree-status` - Get worktree status
- `POST /workitems/:id/recreate-worktree` - Recreate worktree
- `POST /workitems/:id/remove-worktree` - Remove worktree
- `POST /workitems/:id/create-pr` - Create PR from WorkItem
- `GET /workitems/:id/pr` - Get linked PR

**Pull Request Routes** (`backend/src/routes/pullrequests.ts`):

- `GET /projects/:projectId/pullrequests` - List PRs
- `GET /pullrequests/:id` - Get PR detail
- `POST /pullrequests/:id/merge` - Merge PR
- `POST /pullrequests/:id/close` - Close PR
- `GET /pullrequests/:id/comments` - Get comments
- `POST /pullrequests/:id/comments` - Add comment
- `GET /pullrequests/:id/worktree-status` - Get worktree status
- `POST /pullrequests/:id/recreate-worktree` - Recreate worktree
- `POST /pullrequests/:id/remove-worktree` - Remove worktree

#### Database Schema Changes

**New Tables** (`backend/src/models/schema.ts`):

```typescript
export const workItems = sqliteTable("work_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["issue", "feature-request"] }).notNull(),
  title: text("title").notNull(),
  body: text("body"),
  status: text("status", { enum: ["open", "in-progress", "closed"] })
    .notNull()
    .default("open"),
  baseBranch: text("base_branch").notNull(),
  baseSha: text("base_sha").notNull(),
  branchName: text("branch_name").notNull(),
  headSha: text("head_sha"),
  worktreePath: text("worktree_path"),
  worktreeStatus: text("worktree_status", {
    enum: ["present", "missing", "recreating"],
  })
    .notNull()
    .default("present"),
  prId: text("pr_id").references(() => changesets.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  closedAt: integer("closed_at", { mode: "timestamp" }),
});

export const workItemComments = sqliteTable("work_item_comments", {
  id: text("id").primaryKey(),
  workItemId: text("work_item_id")
    .notNull()
    .references(() => workItems.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const prComments = sqliteTable("pr_comments", {
  id: text("id").primaryKey(),
  changesetId: text("changeset_id")
    .notNull()
    .references(() => changesets.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
```

**Modified Tables**:

```typescript
// Add to changesets table
export const changesets = sqliteTable("changesets", {
  // ... existing fields ...
  workItemId: text("work_item_id").references(() => workItems.id, {
    onDelete: "set null",
  }),
  worktreeStatus: text("worktree_status", {
    enum: ["present", "missing", "recreating"],
  })
    .notNull()
    .default("present"),
  mergedAt: integer("merged_at", { mode: "timestamp" }),
  mergedBy: text("merged_by"),
  mergedSha: text("merged_sha"),
  closedAt: integer("closed_at", { mode: "timestamp" }),
  closedBy: text("closed_by"),
});

// Add to review_threads table
export const reviewThreads = sqliteTable("review_threads", {
  // ... existing fields ...
  workItemId: text("work_item_id").references(() => workItems.id, {
    onDelete: "cascade",
  }),
  canAddressWithAgent: integer("can_address_with_agent", { mode: "boolean" })
    .notNull()
    .default(true),
});

// Add to agent_runs table
export const agentRuns = sqliteTable("agent_runs", {
  // ... existing fields ...
  workItemId: text("work_item_id").references(() => workItems.id, {
    onDelete: "cascade",
  }),
});
```

---

## 6. Migration Strategy

### 6.1 Data Migration Plan

#### Phase 1: Database Schema Migration

1. **Add new tables** (non-breaking):
   - `work_items`
   - `work_item_comments`
   - `pr_comments`

2. **Add new columns** to existing tables (nullable, non-breaking):
   - `changesets.worktree_status` (default: 'present')
   - `changesets.work_item_id` (nullable)
   - `changesets.merged_at`, `changesets.merged_by`, `changesets.merged_sha` (nullable)
   - `changesets.closed_at`, `changesets.closed_by` (nullable)
   - `review_threads.work_item_id` (nullable)
   - `review_threads.can_address_with_agent` (default: true)
   - `agent_runs.work_item_id` (nullable)

3. **Create migration script**:

   ```sql
   -- Migration: add_workitem_support
   CREATE TABLE work_items (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     kind TEXT NOT NULL CHECK(kind IN ('issue', 'feature-request')),
     title TEXT NOT NULL,
     body TEXT,
     status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in-progress', 'closed')),
     base_branch TEXT NOT NULL,
     base_sha TEXT NOT NULL,
     branch_name TEXT NOT NULL,
     head_sha TEXT,
     worktree_path TEXT,
     worktree_status TEXT NOT NULL DEFAULT 'present' CHECK(worktree_status IN ('present', 'missing', 'recreating')),
     pr_id TEXT REFERENCES changesets(id) ON DELETE SET NULL,
     created_at INTEGER NOT NULL DEFAULT (unixepoch()),
     updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
     closed_at INTEGER
   );

   CREATE TABLE work_item_comments (
     id TEXT PRIMARY KEY,
     work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
     body TEXT NOT NULL,
     created_at INTEGER NOT NULL DEFAULT (unixepoch()),
     updated_at INTEGER NOT NULL DEFAULT (unixepoch())
   );

   CREATE TABLE pr_comments (
     id TEXT PRIMARY KEY,
     changeset_id TEXT NOT NULL REFERENCES changesets(id) ON DELETE CASCADE,
     body TEXT NOT NULL,
     created_at INTEGER NOT NULL DEFAULT (unixepoch()),
     updated_at INTEGER NOT NULL DEFAULT (unixepoch())
   );

   ALTER TABLE changesets ADD COLUMN work_item_id TEXT REFERENCES work_items(id) ON DELETE SET NULL;
   ALTER TABLE changesets ADD COLUMN worktree_status TEXT NOT NULL DEFAULT 'present' CHECK(worktree_status IN ('present', 'missing', 'recreating'));
   ALTER TABLE changesets ADD COLUMN merged_at INTEGER;
   ALTER TABLE changesets ADD COLUMN merged_by TEXT;
   ALTER TABLE changesets ADD COLUMN merged_sha TEXT;
   ALTER TABLE changesets ADD COLUMN closed_at INTEGER;
   ALTER TABLE changesets ADD COLUMN closed_by TEXT;

   ALTER TABLE review_threads ADD COLUMN work_item_id TEXT REFERENCES work_items(id) ON DELETE CASCADE;
   ALTER TABLE review_threads ADD COLUMN can_address_with_agent INTEGER NOT NULL DEFAULT 1;

   ALTER TABLE agent_runs ADD COLUMN work_item_id TEXT REFERENCES work_items(id) ON DELETE CASCADE;
   ```

#### Phase 2: Existing Data Migration

**Option A: Keep existing ChangeSets as PRs**

- Treat all existing ChangeSets as PRs (no WorkItem parent)
- Set `changesets.worktree_status` based on worktree presence
- Set `changesets.status` mapping:
  - 'draft' → 'open'
  - 'active' → 'open'
  - 'completed' → 'merged'
  - 'cancelled' → 'closed'

**Option B: Create WorkItems for existing ChangeSets**

- Create WorkItem for each existing ChangeSet
- Link WorkItem to ChangeSet via `work_item_id`
- Copy metadata from ChangeSet to WorkItem

**Recommendation**: Use Option A for simplicity, as existing ChangeSets are already PR-like entities.

#### Phase 3: Frontend Migration

1. **Keep existing routes** (`/changesets/*`) working
2. **Add new routes** (`/workitems/*`, `/pullrequests/*`)
3. **Gradually migrate users** to new routes
4. **Deprecate old routes** after transition period

### 6.2 Breaking Changes

#### None (if using Option A)

- Existing API endpoints continue to work
- Existing routes continue to work
- New features are additive

#### Potential Breaking Changes (if using Option B)

- ChangeSet creation flow changes (must create WorkItem first)
- Existing ChangeSets need WorkItem parent
- Frontend routes change from `/changesets/*` to `/pullrequests/*`

### 6.3 Backward Compatibility

#### API Versioning

- Keep existing API endpoints at `/api/v1/`
- Add new endpoints at `/api/v2/`
- Gradually migrate to v2 endpoints

#### Route Aliases

- Keep `/changesets/*` routes as aliases to `/pullrequests/*`
- Redirect old routes to new routes with 301 status

```typescript
// frontend/src/routes/changesets/$id.tsx (redirect to PR)
export const Route = createFileRoute("/changesets/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: `/pullrequests/${params.id}` });
  },
});
```

### 6.4 Rollback Plan

1. **Database rollback**:
   - Drop new tables
   - Drop new columns
   - Restore from backup if needed

2. **Frontend rollback**:
   - Revert to previous route structure
   - Remove new components
   - Keep old components working

3. **API rollback**:
   - Disable new endpoints
   - Keep old endpoints active

---

## 7. Implementation Phases

### 7.1 Phase 1: Foundation (Backend)

**Duration**: 2-3 days

**Goals**:

- Set up database schema for WorkItems
- Create backend API endpoints for WorkItems
- Implement worktree management APIs

**Tasks**:

1. Create database migration script
2. Add `work_items` table to schema
3. Add `work_item_comments` table to schema
4. Add `pr_comments` table to schema
5. Add new columns to existing tables
6. Create `WorkItemsRepository.ts`
7. Create `WorkItemCommentsRepository.ts`
8. Create `PRCommentsRepository.ts`
9. Update `ChangeSetsRepository.ts` with new fields
10. Create `backend/src/routes/workitems.ts`
11. Create `backend/src/routes/pullrequests.ts`
12. Update `backend/src/routes/reviews.ts` for thread addressing
13. Update `backend/src/routes/agentRuns.ts` for WorkItem support
14. Implement worktree status checking logic
15. Implement worktree recreation logic
16. Implement worktree removal logic
17. Implement PR merge logic
18. Implement PR close logic

**Acceptance Criteria**:

- All new API endpoints are functional
- Database schema is updated
- Worktree management APIs work correctly
- PR merge/close actions work correctly

### 7.2 Phase 2: Foundation (Frontend Types & API)

**Duration**: 1-2 days

**Goals**:

- Add new TypeScript types
- Update API client with new endpoints
- Set up TanStack Query hooks

**Tasks**:

1. Add `WorkItem` type to [`frontend/src/types/index.ts`](../frontend/src/types/index.ts)
2. Add `WorkItemComment` type
3. Add `PRComment` type
4. Add `WorktreeStatus` type
5. Add `WorktreeActionResult` type
6. Update `ChangeSet` type with new fields
7. Update `Project` type with workspace fields
8. Update `AgentRun` type with workItemId field
9. Update `ReviewThread` type with workItemId field
10. Add `workItemsApi` to [`frontend/src/lib/api.ts`](../frontend/src/lib/api.ts)
11. Add PR-specific methods to `changesetsApi`
12. Add WorkItem-specific methods to `agentRunsApi`
13. Add thread addressing method to `reviewsApi`
14. Create `useWorkItems` hook
15. Create `useWorkItem` hook
16. Create `useWorkItemComments` hook
17. Create `usePRComments` hook
18. Create `useWorktreeStatus` hook
19. Create `useMergePR` hook
20. Create `useClosePR` hook

**Acceptance Criteria**:

- All new types are defined
- API client has all new endpoints
- Hooks are set up for data fetching
- TypeScript compilation succeeds

### 7.3 Phase 3: Project Shell & Navigation

**Duration**: 2-3 days

**Goals**:

- Create ProjectShell component
- Implement tab-based navigation
- Add WorkItems and Pull Requests tabs

**Tasks**:

1. Create `ProjectShell` component
2. Create `ProjectHeader` component
3. Create `ProjectTabs` component
4. Create `ProjectShellContext`
5. Create `WorkItemsTab` component
6. Create `PullRequestsTab` component
7. Create `SettingsTab` component
8. Update [`frontend/src/routes/projects/$id.tsx`](../frontend/src/routes/projects/$id.tsx) to use ProjectShell
9. Add tab routes (`/projects/$id/overview`, etc.)
10. Implement tab state management
11. Add filters to WorkItemsTab
12. Add filters to PullRequestsTab
13. Implement search functionality
14. Add pagination or infinite scroll
15. Add worktree status indicators to lists

**Acceptance Criteria**:

- Project shell renders correctly
- Tab navigation works
- WorkItems and Pull Requests tabs display data
- Filters and search work
- Worktree status indicators show correctly

### 7.4 Phase 4: WorkItem Detail & Management

**Duration**: 3-4 days

**Goals**:

- Create WorkItem detail page
- Implement WorkItem tabs
- Add worktree management UI

**Tasks**:

1. Create `WorkItemDetail` component
2. Create `WorkItemHeader` component
3. Create `WorkItemTabs` component
4. Create `DiscussionTab` component
5. Create `WorkItemPRStatusPanel` component
6. Create `WorktreeStatusBanner` component
7. Create [`frontend/src/routes/workitems/$id.tsx`](../frontend/src/routes/workitems/$id.tsx)
8. Create [`frontend/src/routes/workitems/index.tsx`](../frontend/src/routes/workitems/index.tsx)
9. Add tab routes for WorkItem detail
10. Implement comment composer
11. Implement worktree recreate action
12. Implement worktree remove action
13. Add WorkItem close action
14. Implement PR creation from WorkItem
15. Add "New WorkItem" button
16. Create WorkItem creation modal/form
17. Implement WorkItem kind selection (Issue vs Feature Request)
18. Add WorkItem status management

**Acceptance Criteria**:

- WorkItem detail page renders correctly
- Discussion tab shows comments
- PR status panel shows linked PR
- Worktree status banner works
- Worktree recreate/remove actions work
- WorkItem creation works
- PR creation from WorkItem works

### 7.5 Phase 5: Pull Request Detail & Management

**Duration**: 3-4 days

**Goals**:

- Create PR detail page
- Implement PR tabs
- Add merge/close actions

**Tasks**:

1. Create `PRDetail` component
2. Create `PRHeader` component (enhanced)
3. Create `PRTabs` component
4. Create `PRConversationTab` component
5. Create `PRChecksTab` component
6. Rename `DiffReviewTab` to `FilesChangedTab`
7. Enhance `OverviewTab` for PRs
8. Create `MergeCloseActions` component
9. Create [`frontend/src/routes/pullrequests/$id.tsx`](../frontend/src/routes/pullrequests/$id.tsx)
10. Create [`frontend/src/routes/pullrequests/index.tsx`](../frontend/src/routes/pullrequests/index.tsx)
11. Add tab routes for PR detail
12. Implement PR merge action
13. Implement PR close action
14. Add merge confirmation modal
15. Add close confirmation modal
16. Show merge metadata (merged by, merged at, merged SHA)
17. Show close metadata (closed by, closed at)
18. Add "New PR" button (or link to WorkItem creation)
19. Implement PR creation modal/form
20. Add PR status management

**Acceptance Criteria**:

- PR detail page renders correctly
- All tabs display correctly
- Merge action works
- Close action works
- Merge/close confirmation modals work
- Merge/close metadata displays correctly
- PR creation works

### 7.6 Phase 6: Review Thread Enhancement

**Duration**: 2-3 days

**Goals**:

- Add "Address with agents" button to review threads
- Implement thread addressing logic

**Tasks**:

1. Create `AddressWithAgentButton` component
2. Update `DiffViewer` to show "Address with agents" button
3. Update `ThreadComposer` to show "Address with agents" button
4. Implement agent configuration modal for thread addressing
5. Add backend API for thread addressing
6. Implement thread addressing mutation
7. Add loading state while agent runs
8. Show agent run status on thread
9. Update thread status after agent run
10. Add thread resolve/unresolve actions
11. Show outdated thread indicators
12. Implement thread status refresh on head SHA change

**Acceptance Criteria**:

- "Address with agents" button appears on threads
- Agent configuration modal works
- Agent run triggers successfully
- Thread status updates after agent run
- Thread resolve/unresolve works
- Outdated thread indicators show correctly

### 7.7 Phase 7: Worktree Management UI

**Duration**: 2-3 days

**Goals**:

- Enhance worktree status display
- Add worktree management actions
- Implement worktree status polling

**Tasks**:

1. Enhance `WorktreeStatusBanner` component
2. Add worktree status polling logic
3. Implement worktree status refresh on interval
4. Add worktree status refresh on head SHA change
5. Show worktree path when present
6. Add worktree remove confirmation modal
7. Add worktree recreation confirmation modal
8. Show error messages for failed operations
9. Add worktree status indicators to lists
10. Implement worktree status cache invalidation
11. Add worktree status to TanStack Query
12. Implement optimistic updates for worktree status

**Acceptance Criteria**:

- Worktree status displays correctly in all contexts
- Worktree recreate action works
- Worktree remove action works
- Worktree status polls correctly
- Error messages show correctly
- Worktree status indicators show in lists

### 7.8 Phase 8: Testing & Polish

**Duration**: 3-4 days

**Goals**:

- Test all new features
- Fix bugs
- Polish UI/UX
- Update documentation

**Tasks**:

1. Test WorkItem creation flow
2. Test WorkItem detail page
3. Test WorkItem comments
4. Test WorkItem close action
5. Test PR creation flow
6. Test PR detail page
7. Test PR comments
8. Test PR merge action
9. Test PR close action
10. Test worktree recreation
11. Test worktree removal
12. Test "Address with agents" feature
13. Test review thread addressing
14. Test filters and search
15. Test tab navigation
16. Fix any bugs found
17. Polish UI/UX
18. Update README.md
19. Update API documentation
20. Create migration guide

**Acceptance Criteria**:

- All features work as expected
- No critical bugs
- UI/UX is polished
- Documentation is updated

### 7.9 Phase 9: Migration & Rollout

**Duration**: 2-3 days

**Goals**:

- Migrate existing data
- Deploy to production
- Monitor for issues

**Tasks**:

1. Run database migration
2. Migrate existing ChangeSet data
3. Deploy backend changes
4. Deploy frontend changes
5. Monitor for errors
6. Fix any issues found
7. Gather user feedback
8. Make adjustments based on feedback

**Acceptance Criteria**:

- Database migration succeeds
- Existing data is preserved
- No critical errors in production
- Users can use new features

---

## 8. Testing Strategy

### 8.1 Unit Tests

#### Components

- Test component rendering
- Test user interactions
- Test state management
- Test error handling

#### Hooks

- Test data fetching
- Test caching
- Test invalidation
- Test optimistic updates

### 8.2 Integration Tests

#### API Integration

- Test API calls
- Test error handling
- Test data transformation

#### Route Integration

- Test navigation
- Test data loading
- Test route parameters

### 8.3 End-to-End Tests

#### WorkItem Flow

1. Create WorkItem
2. Add comments
3. Run agents
4. Create PR
5. Merge PR

#### PR Flow

1. Create PR
2. Add comments
3. Review changes
4. Address review threads with agents
5. Merge PR

#### Worktree Management

1. Remove worktree
2. Recreate worktree
3. Verify worktree status

---

## 9. Success Criteria

### 9.1 Functional Requirements

- [ ] WorkItem entity is fully functional
- [ ] WorkItem can be created with worktree and branch
- [ ] WorkItem can optionally create PR
- [ ] Project shell has 4 tabs (Overview, WorkItems, Pull Requests, Settings)
- [ ] PR detail has 4 tabs (Overview, Conversation, Files Changed, Checks)
- [ ] PR can be merged
- [ ] PR can be closed
- [ ] Worktree status is displayed correctly
- [ ] Worktree can be recreated
- [ ] Worktree can be removed
- [ ] Review threads can be addressed with agents
- [ ] All existing features continue to work

### 9.2 Non-Functional Requirements

- [ ] Performance is acceptable (page load < 2s)
- [ ] TypeScript compilation succeeds
- [ ] No console errors
- [ ] Responsive design works on mobile
- [ ] Accessibility standards are met
- [ ] Code follows project conventions
- [ ] Documentation is complete

---

## 10. Risks & Mitigations

### 10.1 Technical Risks

**Risk**: Database migration fails
**Mitigation**: Create backup before migration, test migration on staging

**Risk**: Worktree management is complex
**Mitigation**: Thorough testing, clear error messages, rollback plan

**Risk**: Performance degradation
**Mitigation**: Optimize queries, use caching, monitor performance

### 10.2 User Experience Risks

**Risk**: Users confused by new UI
**Mitigation**: Clear documentation, onboarding, gradual rollout

**Risk**: Breaking changes disrupt workflows
**Mitigation**: Maintain backward compatibility, clear communication

---

## 11. Future Enhancements

### 11.1 Potential Features

- WorkItem templates
- PR templates
- Automated CI/CD integration
- WorkItem labels and milestones
- PR reviewers and approvals
- WorkItem and PR dashboards
- Advanced filtering and search
- Bulk actions
- Export/import functionality

### 11.2 Technical Improvements

- Real-time updates with WebSockets
- Offline support with service workers
- PWA capabilities
- Performance monitoring
- Error tracking
- Analytics

---

## 12. Appendix

### 12.1 Glossary

- **WorkItem**: Issue or Feature Request entity that owns a worktree and branch
- **PR (Pull Request)**: ChangeSet that represents a pull request
- **Worktree**: Git worktree linked to a specific branch
- **Agent Run**: Execution of an AI agent on a WorkItem or PR
- **Review Thread**: Inline comment on a diff
- **Address with agents**: Trigger an agent run to address a review thread

### 12.2 References

- [`FRONTEND_UML.md`](../FRONTEND_UML.md) - Full project-centric state machine
- [`PLAN.md`](../PLAN.md) - Overall project plan
- [`frontend/src/types/index.ts`](../frontend/src/types/index.ts) - Current type definitions
- [`backend/src/models/schema.ts`](../backend/src/models/schema.ts) - Current database schema
- [`frontend/src/lib/api.ts`](../frontend/src/lib/api.ts) - Current API client

---

## 13. Conclusion

This specification provides a comprehensive blueprint for refactoring the GitVibe frontend to align with the GitHub-like project-centric architecture. The refactoring introduces the WorkItem entity, restructures the Project Shell with tab-based navigation, and enhances PR functionality with conversation, merge/close actions, and worktree management.

The implementation is broken down into 9 phases, each with clear goals, tasks, and acceptance criteria. The migration strategy ensures backward compatibility and minimal disruption to existing users.

Following this specification will result in a more intuitive and powerful frontend that aligns with the vision outlined in [`FRONTEND_UML.md`](../FRONTEND_UML.md) and [`PLAN.md`](../PLAN.md).
