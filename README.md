# GitVibe

A local-first web application that orchestrates multiple AI coding agents to work on code changes in isolated Git worktrees, with review capabilities and deterministic patch-based imports.

## Features

- **Project Management**: Register and manage source Git repositories
- **Target Repos**: Configure destination repositories for imports
- **ChangeSets**: Create isolated worktree workspaces for code changes
- **Agent Integration**: Trigger OpenCode CLI agents to modify code
- **Diff Viewing**: View code changes with inline diff
- **Review System**: Add review threads and comments to changes
- **Patch Import**: Import changes to target repositories using patch files
- **Full Audit Trail**: Track all agent runs and imports

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

### 3. Create a ChangeSet

Navigate to **Changesets** and create a new changeset:
- Select a project
- Title: Feature description
- Body: Detailed description (optional)
- Base Branch: Branch to create worktree from

This creates an isolated Git worktree for agent work.

### 4. Trigger an Agent Run

In the Changeset detail view, trigger an agent:
- Agent Key: `opencode`
- Prompt: Your task description
- Config: OpenCode executable path and arguments

The agent will run in the changeset workspace and make code changes.

### 5. Review Changes

View the diff of changes made by agents. Add review threads with comments if needed.

### 6. Import to Target Repo

When satisfied with changes, import to your target repository:
- Select target repo
- Click Import

GitVibe will:
1. Generate a patch from changeset diff
2. Apply patch to target repo
3. Create a commit with changeset metadata
4. Record import in history

### 7. Clean Up

When done, delete the changeset to:
- Remove the worktree
- Delete all associated records

## Project Structure

```
git-vibe/
├── backend/           # Fastify API + SQLite + Git integration
│   ├── src/
│   │   ├── routes/      # API route handlers
│   │   ├── services/    # GitService, AgentAdapter
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
│   │   ├── pages/      # Route pages
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

### Changesets
- `GET /api/changesets` - List changesets
- `POST /api/changesets` - Create a changeset
- `GET /api/changesets/:id` - Get changeset details
- `POST /api/changesets/:id/refresh` - Refresh head SHA from worktree
- `DELETE /api/changesets/:id` - Delete changeset and worktree

### Diff
- `GET /api/diffs/changesets/:id` - Get diff for changeset

### Agent Runs
- `POST /api/changesets/:id/agent-runs` - Trigger agent run
- `GET /api/agent-runs/:id` - Get run status and logs
- `POST /api/agent-runs/:id/cancel` - Cancel running agent

### Imports
- `POST /api/changesets/:id/imports` - Start patch import
- `GET /api/imports/:id` - Get import status
- `GET /api/changesets/:id/imports` - List imports for changeset

### Reviews
- `GET /api/changesets/:id/reviews/threads` - List review threads
- `POST /api/changesets/:id/reviews/threads` - Create thread
- `GET /api/changesets/:id/reviews/threads/:threadId` - Get thread details
- `POST /api/changesets/:id/reviews/threads/:threadId/resolve` - Resolve thread
- `POST /api/changesets/:id/reviews/threads/:threadId/comments` - Add comment

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
└── worktrees/          # Git worktrees for changesets
```

## License

MIT
