# GitVibe

A local-first web application that orchestrates multiple AI coding agents to work on code changes in isolated Git worktrees, with PR-first workflow, review capabilities, and deterministic patch-based imports.

## Features

- **Project Management**: Register and manage source Git repositories
- **Target Repos**: Configure destination repositories for imports
- **WorkItems**: Create work items that own persistent worktree workspaces for code changes
- **Pull Requests**: First-class PR model with merge gates, conflict detection, and review
- **Agent Integration**: Trigger OpenCode CLI agents to modify code in serialized runs
- **Workspace Locking**: Ensures only one agent run per WorkItem at a time
- **Auto-Commit**: Backend automatically commits changes after each agent run
- **Diff Viewing**: View code changes with inline diff
- **Review System**: Add review threads and comments to PRs
- **Patch Import**: Import changes to target repositories using patch files
- **Full Audit Trail**: Track all agent runs and imports

## Architecture

GitVibe uses a **PR-centric and WorkItem-workspace-centric** model:

- **One WorkItem = one workspace**: Each WorkItem owns a persistent git worktree and branch
- **1:1 PR to WorkItem**: Each WorkItem has exactly one Pull Request (enforced by unique constraint)
- **PR-first UX**: Users work through Pull Request views with diffs, commits, checks, and merge controls
- **Serialized agent runs**: Workspace locking prevents concurrent agent runs on the same WorkItem
- **Backend auto-commit**: Agents edit files freely, backend commits changes after each run

### Core Principles

1. **Workspaces are owned by WorkItems**, not by PRs
2. **PRs control review and merge** - they are the gatekeepers for code changes
3. **Agent runs are serialized** - only one run per WorkItem at a time
4. **Auto-commit after runs** - produces clean commit history and stable PR diffs
5. **sessionId is required** - enables resume functionality with conversation continuity

## Tech Stack

### Backend

- Node.js + TypeScript
- Fastify web framework
- SQLite database with Drizzle ORM
- Git CLI integration

### Frontend

- React 18 + TypeScript
- Vite build tool
- TanStack Query for data fetching
- TanStack Router for routing
- Tailwind CSS for styling

## Getting Started

### Prerequisites

- Node.js >= 20
- npm >= 10
- Git
- OpenCode CLI (for agent functionality)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd git-vibe
```

2. Install dependencies:

```bash
npm run install:all
```

3. Run database migrations:

```bash
npm run db:migrate
```

### Development

Start both backend and frontend:

```bash
npm run dev
```

This will start:

- Backend API server at `http://127.0.0.1:3001`
- Frontend UI at `http://localhost:3000`

### Environment Variables

Create a `.env` file in the `backend` directory:

```env
PORT=3001
HOST=127.0.0.1
DATABASE_URL=./data/db.sqlite
STORAGE_BASE_DIR=/tmp/git-vibe
LOG_LEVEL=info
OPENCODE_EXECUTABLE=/path/to/opencode
```

## Usage

### 1. Register a Project

Navigate to **Projects** and add a source Git repository:

- Name: My Project
- Source Repo Path: `/path/to/repo`
- Source Repo URL: https://github.com/user/repo (optional)

### 2. Register a Target Repo

Navigate to **Target Repos** and add a destination repository:

- Name: My Target Repo
- Repo Path: `/path/to/target/repo`

### 3. Create a WorkItem

Navigate to **WorkItems** and create a new work item:

- Select a project
- Title: Feature description
- Body: Detailed description (optional)
- Type: Task type (e.g., feature, bugfix)

This creates a WorkItem that will own a persistent workspace.

### 4. Initialize Workspace

The workspace is automatically initialized on the first agent run, or you can explicitly initialize it:

- WorkItem creates a git worktree on a dedicated branch
- Branch name format: `wi/<work_item_id>`
- Worktree path: `<data_dir>/worktrees/<project_id>/<work_item_id>/`

### 5. Open a Pull Request

Navigate to the WorkItem and open a PR:

- Base branch: The branch to merge into (e.g., `main`)
- The PR is automatically created with 1:1 relationship to the WorkItem
- PR tracks base SHA, head SHA, and merge status

### 6. Trigger Agent Runs

In the WorkItem detail view, trigger agent runs:

- Agent Key: `opencode`
- Prompt: Your task description
- Config: OpenCode executable path and arguments

**Workspace Locking**: Only one agent run can be active per WorkItem at a time. If a run is in progress, new runs will be rejected with a 409 Conflict error.

**Auto-Commit**: After each agent run completes successfully, the backend automatically stages and commits any changes made by the agent. This produces a clean commit history and stable PR diffs.

### 7. Review Pull Request

View the PR to review changes:

- **Overview**: PR details, status, and mergeability
- **Diff**: Code changes between base and head
- **Commits**: Commit history for the PR
- **Checks**: Agent run history and status
- **Reviews**: Review threads and comments

### 8. Merge PR

When satisfied with changes, merge the PR:

- Check mergeability (no conflicts, no running agent runs)
- Choose merge strategy: merge, squash, or rebase
- Merge into base branch

**Merge Gates**:
- PR must be in `open` status
- No agent runs can be running for the WorkItem
- Workspace lock must be free
- No merge conflicts

### 9. Import to Target Repo

Optionally import changes to your target repository:

- Select target repo
- Click Import

GitVibe will:

1. Generate a patch from PR diff
2. Apply patch to target repo
3. Create a commit with PR metadata
4. Record import in history

### 10. Clean Up

When done, delete the WorkItem to:

- Remove the worktree
- Delete the PR
- Delete all associated records

## Project Structure

```
git-vibe/
├── backend/           # Fastify API + SQLite + Git integration
│   ├── src/
│   │   ├── routes/      # API route handlers
│   │   ├── services/    # GitService, PRService, WorkspaceService, AgentAdapter
│   │   ├── repositories/ # Database access layer
│   │   ├── models/      # Drizzle schema
│   │   ├── middleware/   # Fastify middleware
│   │   ├── types/       # TypeScript types
│   │   └── utils/       # Utilities
│   ├── drizzle/         # Migrations
│   └── package.json
├── frontend/          # React + Vite application
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── routes/     # TanStack Router config
│   │   ├── lib/        # API client
│   │   └── main.tsx
│   └── package.json
└── shared/            # Shared types and utilities
    └── package.json
```

## API Endpoints

### Projects

- `GET /api/projects` - List all projects
- `POST /api/projects` - Create a project
- `GET /api/projects/:id` - Get project details

### Target Repos

- `GET /api/target-repos` - List all target repos
- `POST /api/target-repos` - Create a target repo
- `GET /api/target-repos/:id` - Get target repo details

### WorkItems

- `GET /api/work-items` - List work items
- `POST /api/projects/:projectId/work-items` - Create a work item
- `GET /api/work-items/:id` - Get work item details
- `POST /api/work-items/:id/init-workspace` - Initialize workspace (optional)
- `POST /api/work-items/:id/agent-runs` - Start agent run
- `POST /api/work-items/:id/resume` - Resume task with same session_id

### Pull Requests

- `GET /api/pull-requests/:id` - Get PR details
- `GET /api/pull-requests/:id/diff` - Get PR diff
- `GET /api/pull-requests/:id/commits` - Get PR commits
- `POST /api/pull-requests/:id/merge` - Merge PR
- `POST /api/pull-requests/:id/close` - Close PR without merge
- `GET /api/pull-requests/:id/patch` - Export patch (optional)

### Agent Runs

- `GET /api/agent-runs/:id` - Get run status and logs
- `POST /api/agent-runs/:id/cancel` - Cancel running agent (optional)
- `GET /api/work-items/:id/agent-runs` - List runs for work item

### Imports

- `POST /api/pull-requests/:id/imports` - Start patch import
- `GET /api/imports/:id` - Get import status
- `GET /api/pull-requests/:id/imports` - List imports for PR

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

- Linux/Mac: `/tmp/git-vibe/`
- Windows: `%TEMP%\git-vibe\`

Directory structure:

```
git-vibe/
├── data/
│   └── db.sqlite       # SQLite database
├── logs/               # Agent run logs
├── patches/            # Patch files (if cached)
└── worktrees/          # Git worktrees for WorkItems
    └── <project_id>/
        └── <work_item_id>/  # WorkItem workspace
```

## Workspace Locking Mechanism

GitVibe implements workspace locking at the WorkItem level to ensure serialized agent runs:

- **Lock Fields**: `lock_owner_run_id` and `lock_expires_at` on WorkItem table
- **Acquisition**: Before starting an agent run, the system acquires a lock on the WorkItem
- **TTL**: Locks have a time-to-live (TTL) for crash recovery
- **Heartbeat**: Lock TTL is renewed periodically while the agent is running
- **Release**: Lock is released in a finally block on success/failure/cancel
- **Conflict**: If a lock is already held and not expired, new runs are rejected with 409 Conflict

This prevents concurrent agent runs from corrupting the workspace state.

## License

MIT
