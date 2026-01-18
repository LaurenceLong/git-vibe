# GitVibe

A local-first web application that orchestrates multiple AI coding agents to work on code changes in isolated Git worktrees, with PR-first workflow, review capabilities, and deterministic patch-based imports.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Storage](#storage)
- [Workspace Locking](#workspace-locking-mechanism)
- [Project Concurrency](#project-concurrency-limits)
- [Agent Adapters](#agent-adapters)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

### Core Features
- **Project Management**: Register and manage source Git repositories with relay repository support
- **Target Repos**: Configure destination repositories for importing patches
- **WorkItems**: Create work items that own persistent worktree workspaces for code changes
- **Pull Requests**: First-class PR model with merge gates, conflict detection, and review
- **Agent Integration**: Trigger multiple AI coding agents (OpenCode, ClaudeCode) to modify code in serialized runs
- **Workspace Locking**: Ensures only one agent run per WorkItem at a time
- **Auto-Commit**: Backend automatically commits changes after each agent run
- **Diff Viewing**: View code changes with inline diff viewer
- **Review System**: Add review threads and comments to PRs with severity levels
- **Patch Import**: Import changes to target repositories using patch files
- **Full Audit Trail**: Track all agent runs, commits, and imports

### Advanced Features
- **Session-based Resume**: Continue conversations across multiple agent runs using session IDs
- **Multiple Merge Strategies**: Support for merge, squash, and rebase strategies
- **Patch Export**: Export PR changes as patch files
- **Model Cache**: Cached list of available models for each agent
- **Review Addressing**: Trigger agent corrections based on review comments
- **Base Update**: Update PR base branch and optionally rebase head
- **Real-time Log Streaming**: View agent logs in real-time with separate stdout/stderr

## Architecture

GitVibe uses a **PR-centric and WorkItem-workspace-centric** model:

### Core Principles

1. **Workspaces are owned by WorkItems**, not by PRs
2. **PRs control review and merge** - they are the gatekeepers for code changes
3. **Agent runs are serialized** - only one run per WorkItem at a time
4. **Auto-commit after runs** - produces clean commit history and stable PR diffs
5. **sessionId is required** - enables resume functionality with conversation continuity

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GitVibe System                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   Frontend   │◄──►│   Backend    │◄──►│   Database   │ │
│  │   (React)    │    │  (Fastify)   │    │  (SQLite)    │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                     │                     │              │
│         │                     ▼                     │              │
│         │              ┌──────────────┐            │              │
│         │              │ Agent Service │            │              │
│         │              └──────────────┘            │              │
│         │                     │                     │              │
│         │                     ▼                     │              │
│         │              ┌──────────────┐            │              │
│         │              │ Agent        │            │              │
│         │              │ Adapters     │            │              │
│         │              │ (OpenCode,   │            │              │
│         │              │  ClaudeCode)  │            │              │
│         │              └──────────────┘            │              │
│         │                     │                     │              │
│         │                     ▼                     │              │
│         │              ┌──────────────┐            │              │
│         └─────────────►│   Git        │            │              │
│                        │   Service    │            │              │
│                        └──────────────┘            │              │
│                               │                  │              │
│                               ▼                  │              │
│                        ┌──────────────┐            │              │
│                        │ Relay Repo   │            │              │
│                        │ + Worktrees  │            │              │
│                        └──────────────┘            │              │
│                               │                  │              │
│                               ▼                  │              │
│                        ┌──────────────┐            │              │
│                        │ Source Repo   │            │              │
│                        └──────────────┘            │              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User** creates WorkItem in UI
2. **Backend** initializes workspace (git worktree + branch)
3. **User** triggers agent run with prompt
4. **Backend** spawns agent in worktree workspace
5. **Agent** edits files in worktree
6. **Backend** auto-commits changes after run
7. **PR** is created/updated with new diff
8. **User** reviews PR and optionally adds comments
9. **User** merges PR (or imports to target repo)

## Tech Stack

### Backend

- **Node.js 20+** + TypeScript
- **Fastify** web framework
- **SQLite** database with Drizzle ORM
- **Git CLI** integration via child_process
- **Agent adapter system** (OpenCode, ClaudeCode)
- **Zod** for runtime validation
- **Pino** for logging

### Frontend

- **React 18** + TypeScript
- **Vite** build tool
- **TanStack Query** for data fetching and caching
- **TanStack Router** for routing
- **Tailwind CSS** for styling
- **React Hook Form** for form management
- **Lucide React** for icons
- **React Syntax Highlighter** for code display

### Shared

- **TypeScript** types and Zod schemas
- Shared between backend and frontend packages

## Getting Started

### Prerequisites

- **Node.js >= 20**
- **npm >= 10**
- **Git** (must be available in PATH)
- **AI Agent CLI** (OpenCode or Claude Code) - see agent configuration below

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd git-vibe
```

2. Install dependencies for all packages:

```bash
npm run install:all
```

3. Run database migrations:

```bash
npm run db:migrate
```

### Development

Start both backend and frontend in development mode:

```bash
npm run dev
```

This will start:

- **Backend API server** at `http://127.0.0.1:11031`
- **Frontend UI** at `http://localhost:11990`

### Environment Variables

Create a `.env` file in the `backend` directory:

```env
PORT=11031
HOST=127.0.0.1
DATABASE_URL=./data/db.sqlite
STORAGE_BASE_DIR=/tmp/git-vibe
LOG_LEVEL=info
```

**Note**: Agent executable paths are configured per-project in the UI, not via environment variables. See "Agent Configuration" section below.

### Production Build

Build all packages:

```bash
npm run build
```

Or build individual packages:

```bash
npm run build:backend
npm run build:frontend
npm run build:shared
```

## Usage

### 1. Register a Project

Navigate to **Projects** and add a source Git repository:

- **Name**: My Project
- **Source Repo Path**: `/path/to/repo`
- **Source Repo URL**: https://github.com/user/repo (optional, for reference)
- **Default Branch**: `main` (or your default branch)
- **Default Agent**: Choose `opencode` or `claudecode`
- **Agent Executable Path**: Path to the agent CLI (e.g., `/usr/local/bin/opencode` or `/usr/local/bin/claude`)
- **Agent Parameters**: JSON configuration for model selection, arguments, etc.
- **Max Concurrency**: Maximum concurrent agent runs across all WorkItems in the project (default: 3)

### 2. Register a Target Repo

Navigate to **Target Repos** and add a destination repository:

- **Name**: My Target Repo
- **Repo Path**: `/path/to/target/repo`
- **Default Branch**: `main` (or target's default branch)

### 3. Create a WorkItem

Navigate to **WorkItems** and create a new work item:

- **Select Project**: Choose the project this work item belongs to
- **Title**: Feature description
- **Body**: Detailed description (optional)
- **Type**: Task type (`issue` or `feature-request`)

This creates a WorkItem that will own a persistent workspace.

### 4. Initialize Workspace

The workspace is automatically initialized on the first agent run, or you can explicitly initialize it:

- WorkItem creates a git worktree on a dedicated branch
- Branch name format: `wi/<work_item_id>`
- Worktree path: `<storage_base_dir>/worktrees/<work_item_id>/`

### 5. Open a Pull Request

Navigate to the WorkItem and open a PR:

- **Base branch**: The branch to merge into (e.g., `main`)
- The PR is automatically created with 1:1 relationship to the WorkItem
- PR tracks base SHA, head SHA, and merge status

### 6. Configure Agent (Per Project)

Each project can be configured with agent settings:

- **Default Agent**: Choose `opencode` or `claudecode`
- **Agent Executable Path**: Path to the agent CLI (e.g., `/usr/local/bin/opencode` or `/usr/local/bin/claude`)
- **Agent Parameters**: JSON configuration for model selection, arguments, etc.
- **Max Concurrency**: Maximum concurrent agent runs across all WorkItems in the project (default: 3)

### 7. Trigger Agent Runs

In the WorkItem detail view, trigger agent runs:

- **Agent runs** use the project's default agent configuration
- **Prompt**: Your task description
- **Session ID**: Auto-generated as `wi-<work_item_id>` for conversation continuity
- The system automatically initializes the workspace if needed

**Workspace Locking**: Only one agent run can be active per WorkItem at a time. If a run is in progress, new runs will be rejected with an error.

**Project Concurrency**: The project's `max_agent_concurrency` setting limits how many agent runs can execute simultaneously across all WorkItems in that project.

**Auto-Commit**: After each agent run completes successfully, the backend automatically stages and commits any changes made by the agent. This produces a clean commit history and stable PR diffs.

**Session Continuity**: Agent runs use WorkItem-scoped session IDs (`wi-<work_item_id>`) by default, enabling resume functionality where agents can continue previous conversations.

### 8. Review Pull Request

View the PR to review changes:

- **Overview**: PR details, status, and mergeability
- **Diff**: Code changes between base and head
- **Commits**: Commit history for the PR, grouped by agent runs
- **Files Changed**: List of files modified in the PR
- **Checks**: Agent run history and status
- **Reviews**: Review threads and comments

### 9. Add Review Comments

Create review threads on PRs:

- **Severity**: Choose `info`, `warning`, or `error`
- **Anchor**: Select file and line number
- **Comments**: Add multiple comments to a thread
- **Address with Agent**: Trigger agent to address review comments
- **Resolve/Unresolve**: Mark threads as resolved or open

### 10. Merge PR

When satisfied with changes, merge the PR:

- **Check mergeability**: No conflicts, no running agent runs
- **Choose merge strategy**: `merge`, `squash`, or `rebase`
- **Merge into base branch**: Execute merge operation

**Merge Gates**:
- PR must be in `open` status
- No agent runs can be running for the WorkItem
- Workspace lock must be free
- No merge conflicts

### 11. Update Base / Rebase

Update PR base to latest base branch:

- **Update Base**: Refresh base SHA to latest base branch
- **Rebase**: Optionally rebase head branch onto new base
- Useful when base branch has moved forward

### 12. Export Patch

Export PR changes as a patch file:

- Navigate to PR detail view
- Click "Export Patch"
- Patch is generated from `base_sha..head_sha`
- Save patch file for manual application

### 13. Import to Target Repo

Optionally import changes to your target repository:

- Navigate to PR detail view
- Select target repo
- Click Import

GitVibe will:

1. Generate a patch from PR diff
2. Apply patch to target repo using `git apply --3way`
3. Create a commit with PR metadata
4. Record import in history

### 14. Clean Up

When done, delete the WorkItem to:

- Remove the worktree
- Delete the PR
- Delete all associated records

## Project Structure

```
git-vibe/
├── backend/               # Fastify API + SQLite + Git integration
│   ├── src/
│   │   ├── routes/      # API route handlers
│   │   │   ├── projects.ts
│   │   │   ├── targetRepos.ts
│   │   │   ├── pullRequests.ts
│   │   │   ├── agentRuns.ts
│   │   │   ├── reviews.ts
│   │   │   └── workitems.ts
│   │   ├── services/    # Business logic
│   │   │   ├── AgentService.ts
│   │   │   ├── AgentAdapter.ts
│   │   │   ├── OpenCodeAgentAdapter.ts
│   │   │   ├── ClaudeCodeAgentAdapter.ts
│   │   │   ├── GitService.ts
│   │   │   ├── GitWorktreeService.ts
│   │   │   ├── GitCommitService.ts
│   │   │   ├── GitFileService.ts
│   │   │   ├── GitRelayService.ts
│   │   │   ├── PRService.ts
│   │   │   ├── WorkspaceService.ts
│   │   │   ├── PromptBuilder.ts
│   │   │   └── ModelsCache.ts
│   │   ├── repositories/ # Database access layer
│   │   │   ├── ProjectsRepository.ts
│   │   │   ├── TargetReposRepository.ts
│   │   │   ├── WorkItemsRepository.ts
│   │   │   ├── PullRequestsRepository.ts
│   │   │   ├── AgentRunsRepository.ts
│   │   │   ├── ReviewThreadsRepository.ts
│   │   │   └── ReviewCommentsRepository.ts
│   │   ├── mappers/       # Database to DTO mappers
│   │   │   ├── projects.ts
│   │   │   ├── targetRepos.ts
│   │   │   ├── workItems.ts
│   │   │   ├── pullRequests.ts
│   │   │   ├── agentRuns.ts
│   │   │   └── reviews.ts
│   │   ├── models/       # Drizzle schema
│   │   │   └── schema.ts
│   │   ├── middleware/   # Fastify middleware
│   │   │   └── setup.ts
│   │   ├── db/          # Database client and migrations
│   │   │   ├── client.ts
│   │   │   ├── migrate-cli.ts
│   │   │   └── migrations.ts
│   │   ├── config/       # Configuration
│   │   │   └── storage.ts
│   │   ├── types/        # TypeScript types
│   │   │   └── models.ts
│   │   ├── utils/        # Utilities
│   │   │   └── storage.ts
│   │   └── server.ts     # Server entry point
│   ├── drizzle/         # Database migrations
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.mjs
├── frontend/              # React + Vite application
│   ├── src/
│   │   ├── components/ # UI components
│   │   │   ├── ui/        # Base UI components
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Tabs.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   ├── Textarea.tsx
│   │   │   │   ├── Pagination.tsx
│   │   │   │   ├── LogPane.tsx
│   │   │   │   ├── StatusBadge.tsx
│   │   │   │   ├── EmptyState.tsx
│   │   │   │   └── Skeleton.tsx
│   │   │   ├── project/    # Project-related components
│   │   │   │   ├── ProjectHeader.tsx
│   │   │   │   ├── ProjectShell.tsx
│   │   │   │   ├── OverviewTab.tsx
│   │   │   │   ├── CodeTab.tsx
│   │   │   │   ├── PullRequestsTab.tsx
│   │   │   │   ├── WorkItemsTab.tsx
│   │   │   │   ├── SettingsTab.tsx
│   │   │   │   ├── ActionsTab.tsx
│   │   │   │   └── TabNavigation.tsx
│   │   │   ├── pr/         # PR-related components
│   │   │   │   ├── PRDetail.tsx
│   │   │   │   ├── OverviewTab.tsx
│   │   │   │   ├── DiffReviewTab.tsx
│   │   │   │   ├── CommitsTab.tsx
│   │   │   │   ├── FilesChangedTab.tsx
│   │   │   │   ├── ChecksTab.tsx
│   │   │   │   ├── ConversationTab.tsx
│   │   │   │   └── AgentRunsTab.tsx
│   │   │   ├── workitem/   # WorkItem-related components
│   │   │   │   ├── WorkItemDetail.tsx
│   │   │   │   ├── DiscussionTab.tsx
│   │   │   │   ├── LogDetailTab.tsx
│   │   │   │   ├── PRStatusTab.tsx
│   │   │   │   ├── TaskManagementTab.tsx
│   │   │   │   ├── AgentConfigTab.tsx
│   │   │   │   └── CreateWorkItemModal.tsx
│   │   │   ├── review/     # Review-related components
│   │   │   │   ├── ThreadComposer.tsx
│   │   │   │   ├── ThreadActions.tsx
│   │   │   │   ├── CommentComposer.tsx
│   │   │   │   └── ThreadStatusBadge.tsx
│   │   │   ├── diff/       # Diff viewer
│   │   │   │   └── DiffViewer.tsx
│   │   │   ├── agent/      # Agent-related components
│   │   │   │   └── AgentRunConfigForm.tsx
│   │   │   ├── worktree/  # Worktree status
│   │   │   │   ├── WorktreeStatus.tsx
│   │   │   │   └── WorktreeStatusBadge.tsx
│   │   │   └── shared/     # Shared components
│   │   │       ├── Layout.tsx
│   │   │       ├── ErrorBoundary.tsx
│   │   │       └── Toast.tsx
│   │   ├── routes/     # TanStack Router config
│   │   │   ├── __root.tsx
│   │   │   ├── index.tsx
│   │   │   ├── projects/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── $projectName.tsx
│   │   │   │   ├── $projectName.index.tsx
│   │   │   │   ├── $projectName.code.tsx
│   │   │   │   ├── $projectName.actions.tsx
│   │   │   │   ├── $projectName.pullrequests.tsx
│   │   │   │   ├── $projectName.workitems.tsx
│   │   │   │   └── $projectName.settings.tsx
│   │   │   └── target-repos/
│   │   │       ├── index.tsx
│   │   │       └── $id.tsx
│   │   ├── hooks/      # React hooks
│   │   │   ├── useAgentRunPolling.ts
│   │   │   ├── useBranchSelector.ts
│   │   │   ├── useDiffView.ts
│   │   │   ├── useKeyboardShortcuts.ts
│   │   │   ├── useModels.ts
│   │   │   ├── usePR.ts
│   │   │   ├── useReviewThreads.ts
│   │   │   ├── useStreamingLogs.ts
│   │   │   ├── useWorkItem.ts
│   │   │   ├── useWorkItemRefresh.ts
│   │   │   └── useWorktreeManagement.ts
│   │   ├── lib/        # API client and utilities
│   │   │   ├── api.ts
│   │   │   ├── datetime.ts
│   │   │   ├── utils.ts
│   │   │   └── validation.ts
│   │   ├── types/      # TypeScript types
│   │   │   └── index.ts
│   │   ├── index.css
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── postcss.config.js
├── shared/                # Shared types and utilities
│   ├── src/
│   │   ├── types/      # Common types
│   │   │   ├── models.ts
│   │   │   ├── requests.ts
│   │   │   ├── responses.ts
│   │   │   └── common.ts
│   │   ├── codec/       # Custom codecs
│   │   │   └── datetime.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── package.json          # Root package.json with workspace scripts
├── PLAN.md              # Architecture and design document
└── README.md            # This file
```

## API Endpoints

### Projects

- `GET /api/projects` - List all projects with pagination
- `POST /api/projects` - Create a project
- `GET /api/projects/:id` - Get project details
- `PATCH /api/projects/:id` - Update project settings
- `DELETE /api/projects/:id` - Delete a project
- `POST /api/projects/:id/sync` - Sync relay repo with source repo
- `GET /api/projects/:id/branches` - List branches
- `GET /api/projects/:id/files` - List repository files
- `GET /api/projects/:id/files/content` - Get file content
- `GET /api/models` - List available agent models
- `POST /api/models/refresh` - Refresh model cache
- `GET /api/branches` - List branches by repo path

### Target Repos

- `GET /api/target-repos` - List all target repos
- `POST /api/target-repos` - Create a target repo
- `GET /api/target-repos/:id` - Get target repo details

### WorkItems

- `GET /api/workitems` - List work items with optional project filter and pagination
- `POST /api/projects/:projectId/work-items` - Create a work item
- `GET /api/workitems/:id` - Get work item details
- `PATCH /api/workitems/:id` - Update work item
- `DELETE /api/workitems/:id` - Delete work item
- `POST /api/work-items/:id/init-workspace` - Initialize workspace (optional)
- `POST /api/workitems/:id/start` - Start agent run
- `POST /api/workitems/:id/resume` - Resume task with same session_id
- `GET /api/workitems/:id/tasks` - List all runs for work item
- `POST /api/workitems/:id/tasks/:taskId/cancel` - Cancel running task
- `POST /api/workitems/:id/tasks/:taskId/restart` - Restart task with same prompt
- `GET /api/workitems/:id/tasks/:taskId/status` - Get task status
- `GET /api/workitems/:id/prs` - Get PRs for work item
- `POST /api/workitems/:id/create-pr` - Create PR from work item

### Pull Requests

- `GET /api/pull-requests` - List PRs (with optional project filter and pagination)
- `GET /api/pull-requests/:id` - Get PR details
- `GET /api/pull-requests/:id/diff` - Get PR diff
- `GET /api/pull-requests/:id/commits` - Get PR commits
- `GET /api/pull-requests/:id/commits-with-tasks` - Get PR commits grouped by tasks
- `GET /api/pull-requests/:id/statistics` - Get PR statistics
- `POST /api/pull-requests/:id/merge` - Merge PR
- `POST /api/pull-requests/:id/close` - Close PR without merge
- `POST /api/pull-requests/:id/update-base` - Update base branch and optionally rebase
- `GET /api/pull-requests/:id/patch` - Export patch

### Agent Runs

- `GET /api/agent-runs/:id` - Get run status and logs
- `POST /api/agent-runs/:id/cancel` - Cancel running agent
- `GET /api/agent-runs/:id/stdout` - Get stdout log
- `GET /api/agent-runs/:id/stderr` - Get stderr log
- `GET /api/agent-runs/:id/logs` - Get both stdout and stderr logs

### Reviews

- `GET /api/pull-requests/:id/reviews/threads` - List review threads
- `POST /api/pull-requests/:id/reviews/threads` - Create thread
- `GET /api/pull-requests/:id/reviews/threads/:threadId` - Get thread details
- `POST /api/pull-requests/:id/reviews/threads/:threadId/resolve` - Resolve thread
- `POST /api/pull-requests/:id/reviews/threads/:threadId/unresolve` - Unresolve thread
- `POST /api/pull-requests/:id/reviews/threads/:threadId/comments` - Add comment
- `POST /api/pull-requests/:id/reviews/threads/:threadId/address` - Address with agent
- `POST /api/pull-requests/:id/reviews/threads/:threadId/resume` - Resume from thread

## Storage

All data is stored in the system temp directory:

- **Linux/Mac**: `/tmp/git-vibe/`
- **Windows**: `%TEMP%\git-vibe\`

Directory structure:

```
git-vibe/
├── data/
│   └── db.sqlite       # SQLite database
├── logs/               # Agent run logs
│   ├── agent-run-<id>.log
│   ├── agent-run-<id>-stdout.log
│   └── agent-run-<id>-stderr.log
└── worktrees/          # Git worktrees for WorkItems
    └── <work_item_id>/  # WorkItem workspace
```

### Custom Storage Location

To use a custom storage location, set the `STORAGE_BASE_DIR` environment variable in `backend/.env`:

```env
STORAGE_BASE_DIR=/custom/path/to/git-vibe-data
```

## Workspace Locking Mechanism

GitVibe implements workspace locking at the WorkItem level to ensure serialized agent runs:

- **Lock Fields**: `lock_owner_run_id` and `lock_expires_at` on WorkItem table
- **Acquisition**: Before starting an agent run, the system acquires a lock on the WorkItem
- **TTL**: Locks have a time-to-live (TTL, default: 6 hours) for crash recovery
- **Release**: Lock is released after agent run finalization (success/failure/cancel)
- **Conflict**: If a lock is already held and not expired, new runs are rejected with an error

This prevents concurrent agent runs from corrupting the workspace state.

## Project Concurrency Limits

In addition to WorkItem-level locking, projects have configurable concurrency limits:

- **Per-Project Limit**: `max_agent_concurrency` setting (default: 3)
- **Enforcement**: Limits concurrent agent runs across all WorkItems in a project
- **Purpose**: Prevents resource exhaustion when multiple WorkItems are active
- **Tracking**: Managed in-memory by `AgentService`

## Agent Adapters

GitVibe supports multiple AI coding agents through an adapter system:

### OpenCode Agent
- **Key**: `opencode`
- **Executable**: `opencode` CLI
- **Features**: Full agent execution, model selection, session management

### ClaudeCode Agent
- **Key**: `claudecode`
- **Executable**: `claude` CLI
- **Features**: Full agent execution with `--session-id` support for conversation continuity

### Adding New Agents

To add a new agent adapter:

1. Create a new adapter class extending `AgentAdapter`
2. Implement required methods:
   - `validate()`: Check executable availability
   - `run()`: Execute agent with prompt
   - `correctWithReviewComments()`: Resume/correct with review feedback
   - `getModels()`: List available models
   - `cancel()`: Cancel running process
   - `getStatus()`: Check run status
3. Register the adapter in `AgentService` constructor
4. Update `AgentType` union type in shared types

## Development

### Running Tests

Run tests for the backend:

```bash
cd backend
npm test
```

Run tests once:

```bash
cd backend
npm run test:run
```

### Code Style

The project uses:
- **ESLint** for linting
- **Prettier** for code formatting
- **TypeScript** strict mode

Run linting and formatting:

```bash
npm run lint
npm run format
```

Lint/format individual packages:

```bash
npm run lint:backend
npm run format:backend
# etc.
```

### Database Migrations

Generate new migrations:

```bash
cd backend
npm run db:generate
```

Run migrations:

```bash
npm run db:migrate
```

View database with Drizzle Studio:

```bash
cd backend
npm run db:studio
```

### API Development

When adding new API endpoints:

1. Add route handler in `backend/src/routes/`
2. Add repository methods in `backend/src/repositories/`
3. Add service methods in `backend/src/services/`
4. Add DTOs in `shared/src/types/`
5. Update frontend API client in `frontend/src/lib/api.ts`

### Frontend Development

When adding new UI components:

1. Create component in `frontend/src/components/`
2. Add hook in `frontend/src/hooks/` if needed
3. Add route in `frontend/src/routes/`
4. Update API client if needed

## Architecture Notes

### Session Management
- Agent runs use WorkItem-scoped session IDs by default: `wi-<work_item_id>`
- This enables conversation continuity across multiple runs
- Resume functionality creates new AgentRun records but reuses the same session_id

### Auto-Commit Behavior
- Only successful agent runs trigger auto-commit
- Failed runs leave workspace unchanged for debugging
- Commit messages follow format: `AgentRun <id>: <input_summary>`

### Review System
- Review threads can be created on PRs with file/line anchors
- Comments can be added to threads
- Threads can be resolved/unresolved
- Review comments can trigger agent corrections via `address` endpoint

### Import System
- Patch-based import strategy (currently only strategy)
- Generates patch from PR diff (`base_sha..head_sha`)
- Applies patch to target repository using `git apply --3way`
- Creates commit with PR metadata
- Tracks import history with status and logs

## Troubleshooting

### Agent Not Found

If you get "Executable not found" errors:

1. Verify that the agent executable is in your PATH
2. Or provide the full path in project settings
3. Check that the executable has execute permissions

### Workspace Lock Issues

If a WorkItem is stuck in locked state:

1. Check if an agent run is actually running
2. If not, the lock TTL will expire (default: 6 hours)
3. Or manually release the lock via the database

### Git Worktree Errors

If worktree operations fail:

1. Ensure that the relay repository path is correct
2. Check that the repository is a valid Git repo
3. Run `git worktree prune` to clean up stale worktrees

### Merge Conflicts

If merge fails due to conflicts:

1. Update the PR base to the latest base branch
2. Rebase the head branch onto the new base
3. Resolve conflicts manually in the worktree
4. Try merge again

### Database Issues

If you encounter database issues:

1. Delete the database file: `data/db.sqlite`
2. Run migrations again: `npm run db:migrate`
3. Note: This will delete all your data

### Port Already in Use

If you get "Port already in use" error:

1. Check if another instance is running
2. Or change the PORT in `backend/.env`
3. Default port is 11031

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Ensure all tests pass
6. Submit a pull request

## License

MIT

---

For detailed architecture and design decisions, see [PLAN.md](PLAN.md).
