# GitVibe

<div align="center">

![GitVibe Overview](screenshots/overview.png)

**Orchestrate AI coding agents with confidence**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue.svg)](https://www.typescriptlang.org/)

</div>

---

## What is GitVibe?

GitVibe is a **local-first web application** that orchestrates multiple AI coding agents to work on code changes in isolated Git worktrees. It provides a PR-first workflow with review capabilities and deterministic patch-based imports.

**Perfect for teams and developers who want to:**
- Run AI agents safely in isolated environments
- Review code changes before merging
- Track all agent runs with full audit trails
- Import changes to multiple target repositories

---

## Quick Start

Get GitVibe running in under 5 minutes:

```bash
# 1. Clone and install
git clone <repository-url>
cd git-vibe
npm run install:all

# 2. Setup database
npm run db:migrate

# 3. Start development servers
npm run dev
```

That's it! 🎉

- **Backend API**: http://127.0.0.1:11031
- **Frontend UI**: http://localhost:11990

---

## Key Features

### 🚀 Core Capabilities

- **Project Management** - Register and manage source Git repositories
- **WorkItems** - Create persistent workspaces for code changes
- **Pull Requests** - First-class PR model with merge gates and conflict detection
- **Agent Integration** - Trigger OpenCode, ClaudeCode, or custom agents
- **Workspace Locking** - Ensures only one agent run per WorkItem at a time
- **Auto-Commit** - Backend automatically commits changes after each agent run
- **Diff Viewing** - View code changes with inline diff viewer
- **Review System** - Add review threads with severity levels (info/warning/error)
- **Patch Import** - Import changes to target repositories using patch files
- **Full Audit Trail** - Track all agent runs, commits, and imports

### 🎯 Advanced Features

- **Session-based Resume** - Continue conversations across multiple agent runs
- **Multiple Merge Strategies** - Support for merge, squash, and rebase
- **Real-time Log Streaming** - View agent logs in real-time with separate stdout/stderr
- **Review Addressing** - Trigger agent corrections based on review comments

---

## Tech Stack

<div align="center">

**Backend** | **Frontend** | **Database**
---|---|---
Node.js 20+ | React 18 | SQLite
Fastify | Vite | Drizzle ORM
TypeScript | TanStack Query | Git CLI
Pino | TanStack Router | Zod

</div>

---

## How It Works

### Core Principles

1. **Workspaces are owned by WorkItems** - Not by PRs
2. **PRs control review and merge** - Gatekeepers for code changes
3. **Agent runs are serialized** - Only one run per WorkItem at a time
4. **Auto-commit after runs** - Clean commit history and stable PR diffs
5. **Session ID required** - Enables resume functionality with conversation continuity

### Workflow Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Create    │───►│  Trigger    │───►│   Review    │
│  WorkItem   │    │  Agent Run  │    │     PR      │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Initialize  │    │  Auto-      │    │   Merge /   │
│  Workspace  │    │   Commit    │    │   Import    │
└─────────────┘    └─────────────┘    └─────────────┘
```

---

## Usage Guide

### 1. Register a Project

Navigate to **Projects** and add your source Git repository:

- **Name**: My Project
- **Source Repo Path**: `/path/to/repo`
- **Source Repo URL**: https://github.com/user/repo (optional)
- **Default Branch**: `main`
- **Default Agent**: Choose `opencode` or `claudecode`
- **Agent Executable Path**: Path to agent CLI (e.g., `/usr/local/bin/opencode`)
- **Max Concurrency**: Max concurrent agent runs (default: 3)

### 2. Create a WorkItem

Navigate to **WorkItems** and create a new work item:

- **Select Project**: Choose the project
- **Title**: Feature description
- **Body**: Detailed description (optional)
- **Type**: Task type (`issue` or `feature-request`)

This creates a WorkItem with a persistent workspace.

### 3. Open a Pull Request

In the WorkItem detail view, open a PR:

- **Base branch**: Branch to merge into (e.g., `main`)
- PR is automatically created with 1:1 relationship to the WorkItem

### 4. Trigger Agent Runs

In the WorkItem detail view, trigger agent runs:

- **Prompt**: Your task description
- **Session ID**: Auto-generated as `wi-<work_item_id>` for conversation continuity
- Workspace is automatically initialized if needed

**Key Features:**
- ✅ Only one agent run per WorkItem at a time
- ✅ Auto-commit after each successful run
- ✅ Session continuity across runs

### 5. Review & Merge

View the PR to review changes:

- **Overview**: PR details, status, and mergeability
- **Diff**: Code changes between base and head
- **Commits**: Commit history grouped by agent runs
- **Reviews**: Review threads and comments

**Add Review Comments:**
- Select file and line number
- Choose severity (info/warning/error)
- Trigger agent to address comments

**Merge PR:**
- Check mergeability (no conflicts, no running agents)
- Choose merge strategy (`merge`, `squash`, or `rebase`)
- Merge into base branch

### 6. Import to Target Repo (Optional)

Export PR changes and import to target repository:

1. Navigate to PR detail view
2. Click "Export Patch" to generate patch file
3. Select target repo and click Import

GitVibe will:
- Generate patch from PR diff
- Apply patch using `git apply --3way`
- Create commit with PR metadata
- Record import in history

---

## Configuration

### Environment Variables

Create a `.env` file in the `backend` directory:

```env
PORT=11031
HOST=127.0.0.1
DATABASE_URL=./data/db.sqlite
STORAGE_BASE_DIR=/tmp/git-vibe
LOG_LEVEL=info
```

### Storage Location

All data is stored in:
- **Linux/Mac**: `/tmp/git-vibe/`
- **Windows**: `%TEMP%\git-vibe\`

To use custom storage, set `STORAGE_BASE_DIR` in `.env`.

---

## Agent Adapters

GitVibe supports multiple AI coding agents:

### OpenCode
- **Key**: `opencode`
- **Executable**: `opencode` CLI
- **Features**: Full agent execution, model selection, session management

### ClaudeCode
- **Key**: `claudecode`
- **Executable**: `claude` CLI
- **Features**: Full agent execution with `--session-id` support

### Adding New Agents

Create a new adapter class extending `AgentAdapter` and implement:
- `validate()` - Check executable availability
- `run()` - Execute agent with prompt
- `correctWithReviewComments()` - Resume/correct with review feedback
- `getModels()` - List available models
- `cancel()` - Cancel running process
- `getStatus()` - Check run status

---

<details>
<summary><strong>📖 Advanced Documentation</strong></summary>

## Architecture

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

## Project Structure

```
git-vibe/
├── backend/               # Fastify API + SQLite + Git integration
│   ├── src/
│   │   ├── routes/      # API route handlers
│   │   ├── services/    # Business logic
│   │   ├── repositories/ # Database access layer
│   │   ├── mappers/     # Database to DTO mappers
│   │   ├── models/      # Drizzle schema
│   │   └── db/          # Database client and migrations
├── frontend/              # React + Vite application
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── routes/     # TanStack Router config
│   │   ├── hooks/      # React hooks
│   │   └── lib/        # API client and utilities
├── shared/                # Shared types and utilities
│   └── src/
│       └── types/      # Common types
└── package.json          # Root package.json with workspace scripts
```

## API Endpoints

### Projects
- `GET /api/projects` - List all projects
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

### WorkItems
- `GET /api/workitems` - List work items
- `POST /api/projects/:projectId/work-items` - Create a work item
- `GET /api/workitems/:id` - Get work item details
- `PATCH /api/workitems/:id` - Update work item
- `DELETE /api/workitems/:id` - Delete work item
- `POST /api/workitems/:id/start` - Start agent run
- `POST /api/workitems/:id/resume` - Resume task with same session_id
- `GET /api/workitems/:id/tasks` - List all runs for work item
- `POST /api/workitems/:id/tasks/:taskId/cancel` - Cancel running task
- `POST /api/workitems/:id/create-pr` - Create PR from work item

### Pull Requests
- `GET /api/pull-requests` - List PRs
- `GET /api/pull-requests/:id` - Get PR details
- `GET /api/pull-requests/:id/diff` - Get PR diff
- `GET /api/pull-requests/:id/commits` - Get PR commits
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
- `POST /api/pull-requests/:id/reviews/threads/:threadId/resolve` - Resolve thread
- `POST /api/pull-requests/:id/reviews/threads/:threadId/comments` - Add comment
- `POST /api/pull-requests/:id/reviews/threads/:threadId/address` - Address with agent

## Workspace Locking

GitVibe implements workspace locking at the WorkItem level:

- **Lock Fields**: `lock_owner_run_id` and `lock_expires_at` on WorkItem table
- **Acquisition**: Before starting an agent run, the system acquires a lock
- **TTL**: Locks have a time-to-live (default: 6 hours) for crash recovery
- **Release**: Lock is released after agent run finalization
- **Conflict**: If a lock is already held and not expired, new runs are rejected

## Development

### Running Tests

```bash
cd backend
npm test
```

### Database Migrations

```bash
cd backend
npm run db:generate  # Generate new migrations
npm run db:migrate    # Run migrations
npm run db:studio     # View database with Drizzle Studio
```

### Code Style

```bash
npm run lint    # ESLint
npm run format  # Prettier
```

</details>

---

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

### Port Already in Use

If you get "Port already in use" error:
1. Check if another instance is running
2. Or change the PORT in `backend/.env`
3. Default port is 11031

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Ensure all tests pass
6. Submit a pull request

---

## License

MIT

---

**For detailed architecture and design decisions, see [PLAN.md](docs/PLAN.md).**
