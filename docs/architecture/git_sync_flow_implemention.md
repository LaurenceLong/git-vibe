# Git Sync Flow - Implementation Details

This document describes the **actual implementation** of the Git sync data flow. See `git_sync_flow_design.md` for the architecture and design.

---

## Implementation Overview

The codebase implements the design as follows:

1. **Mirror path**: Calculated from normalized source path (`<safe-name>-<hash>.git`), stored in `projects.mirror_repo_path`.
2. **Namespaced refs**: All mirror refs use `refs/heads/gv/<projectId>/...` (projectId = UUID).
3. **Integration branch**: Single branch name `relay` (not `relay-${projectName}`).
4. **Deterministic ops**: Explicit `fetch` + `merge`/`reset`; no `git pull`.
5. **Sync flow**: Six phases (Phase 0–5) implemented in `GitRelayService.syncRelayToSource`.

---

## Components

### 1. GitService

**Location**: `backend/src/services/git/GitService.ts`

**Responsibilities**:

- Public API for mirror/relay operations
- `getMirrorRepoPath(sourceRepoPath)`: Returns path for mirror repo (duplicates logic from `GitMirrorService.getMirrorRepoPath` to avoid circular deps)
- `createRelayRepo(...)`: Delegates to `GitRelayService.createRelayRepo`
- `syncRelayToSource(...)`: Delegates to `GitRelayService.syncRelayToSource`

**Mirror path calculation** (in `getMirrorRepoPath`):

- Normalize path: `path.resolve(sourceRepoPath).replace(/\\/g, '/')`
- Hash: 32-bit integer hash of normalized path, then `Math.abs(hash).toString(16).padStart(8, '0')`
- Safe name: last path component, sanitized (`[^a-zA-Z0-9._-]` → `_`)
- Result: `path.join(STORAGE_CONFIG.mirrorsDir, \`${safeName}-${hashStr}.git\`)`

### 2. GitMirrorService

**Location**: `backend/src/services/git/GitMirrorService.ts`

**Responsibilities**:

- Mirror repo path: `getMirrorRepoPath(mirrorsDir, sourceRepoPath)` (same formula as above)
- Ensure mirror: `ensureMirrorRepo(mirrorsDir, sourceRepoPath)` — creates bare repo via `git clone --bare` or `git init --bare` + `git fetch source --all --tags`
- Push source → mirror: `pushSourceToMirror(sourceRepoPath, mirrorRepoPath, branch, projectId)` — ensures mirror remote in source, then `git push mirror <branch>:refs/heads/gv/<projectId>/tracking/<branch>`
- Push relay → mirror: `pushRelayToMirror(relayRepoPath, mirrorRepoPath, branch, projectId)` — `git push mirror <branch>:refs/heads/gv/<projectId>/relay`
- Fetch mirror → relay: `fetchMirrorRefToRelay(mirrorRepoPath, relayRepoPath, branch, projectId, refType)` — explicit `git fetch mirror <namespacedRef>:<remoteRef>`, then `git checkout` / `git checkout -B`, then `git reset --hard <remoteRef>` and `git clean -fd`

**Remote URL for mirror**:

- Windows: raw path (e.g. `C:/path/to/mirror.git`)
- Non-Windows: `file://<path>`

### 3. GitRelayService

**Location**: `backend/src/services/git/GitRelayService.ts`

**Responsibilities**:

- Create relay repo (initial setup)
- Full sync: relay → source (Phases 0–5)

#### createRelayRepo(sourceRepoPath, relayRepoPath, mirrorRepoPath, projectId, branch?)

1. `ensureMirrorRepo(mirrorsDir, sourceRepoPath)` — mirror may be shared
2. `pushSourceToMirror(sourceRepoPath, mirrorRepoPath, defaultBranch, projectId)` — seed mirror with `gv/<projectId>/tracking/<A>`
3. `mkdir(relayRepoPath)`, `git init`
4. Add remote `mirror` (file URL)
5. `git fetch mirror refs/heads/gv/<projectId>/tracking/<A>:refs/remotes/mirror/gv/<projectId>/tracking/<A>`
6. `git checkout -B <A> refs/remotes/mirror/gv/<projectId>/tracking/<A>`
7. `git checkout -B relay <A>`
8. `pushRelayToMirror(relayRepoPath, mirrorRepoPath, 'relay', projectId)` — push `refs/heads/gv/<projectId>/relay`
9. Remove `origin` remote from relay if present

#### syncRelayToSource(relayRepoPath, sourceRepoPath, mirrorRepoPath, projectId)

- **Phase 0**: In relay: `git checkout relay`, then `pushRelayToMirror(..., 'relay', projectId)`. (Work branch merge into relay is done by workflow/PR merge before sync.)
- **Phase 1**: In source: `git fetch origin --prune --tags` (try/catch), `git checkout <A>`, `git reset --hard origin/<A>`; then `pushSourceToMirror(sourceRepoPath, mirrorRepoPath, defaultBranch, projectId)`.
- **Phase 2**: In relay: ensure mirror remote; `git fetch mirror refs/heads/gv/<projectId>/tracking/<A>:refs/remotes/mirror/gv/<projectId>/tracking/<A>`; `git checkout <A>`, `git reset --hard <remoteTrackingRef>`; `git checkout relay`, `git merge --no-ff <A> -m "Merge <A> into relay"` (on conflict: `git add -A`, `git commit -m "Resolve merge conflicts"`); `pushRelayToMirror(...)`.
- **Phase 3**: Preflight: in source, `git status --porcelain`; if non-empty, throw with message asking user to commit or stash. Then in source: ensure mirror remote; `git fetch mirror refs/heads/gv/<projectId>/relay:refs/remotes/mirror/gv/<projectId>/relay`; `git checkout <A>`; `git merge --no-ff refs/remotes/mirror/gv/<projectId>/relay -m "Merge relay into <A>"` (on conflict throw).
- **Phase 4**: In source: `git push origin <A>` (try/catch); `pushSourceToMirror(sourceRepoPath, mirrorRepoPath, defaultBranch, projectId)`.
- **Phase 5**: `fetchMirrorRefToRelay(mirrorRepoPath, relayRepoPath, defaultBranch, projectId, 'tracking')` — fetch tracking ref and reset relay’s local <A> to match.

Return value: `git rev-parse HEAD` in source repo (commit SHA of default branch after sync).

### 4. Project Creation (Routes)

**Location**: `backend/src/routes/projects.ts`

On project create:

- `mirrorRepoPath = gitService.getMirrorRepoPath(body.sourceRepoPath)`
- `relayRepoPath = path.join(STORAGE_CONFIG.projectsDir, body.name)`
- `projectId = uuidv4()`
- `gitService.createRelayRepo(body.sourceRepoPath, relayRepoPath, mirrorRepoPath, projectId, defaultBranch)`
- Project record stores `mirrorRepoPath`, `relayRepoPath`, `defaultBranch`, etc.

### 5. Sync API

**Location**: `backend/src/routes/projects.ts`

- `POST /api/projects/:id/sync` loads project, then calls `gitService.syncRelayToSource(project.relayRepoPath, project.sourceRepoPath, project.mirrorRepoPath, project.id)`.
- On success, merged PRs for the project are updated with `syncedCommitSha` (from sync result or `getRefSha(sourceRepoPath, defaultBranch)`).

### 6. WorkspaceService (Relay as Integration Target)

**Location**: `backend/src/services/WorkspaceService.ts`

- When initializing workspace: `baseBranch = project.relayRepoPath ? 'relay' : project.defaultBranch`.
- So when a relay repo exists, worktrees are created from branch `relay` and PR target is `relay` (WorkItem’s baseBranch is set to `relay` by workspace state). PR merge therefore merges `wi/<workItemId>` into `relay`, matching the design’s Phase 0 precondition.

### 7. PR Merge (Phase 0 Precondition)

**Location**: `backend/src/services/PRService.ts`, workflow `pr_merge` node in `defaultWorkflow.ts`

- PR is created with `targetBranch: baseBranch` (from WorkItem; when relay exists, baseBranch = `relay`).
- `mergePR` uses `repoPath = project.relayRepoPath || project.sourceRepoPath`, checks out `pr.targetBranch`, and merges `pr.sourceBranch` (e.g. `wi/<workItemId>`) into it.
- So after PR merge, relay’s `relay` branch contains the work. Sync (Phase 0) then pushes this relay branch to the mirror.

---

## Storage and Config

**Location**: `backend/src/config/storage.ts`

- `STORAGE_CONFIG.mirrorsDir`: `path.join(baseTempDir, 'mirrors')`
- `STORAGE_CONFIG.projectsDir`: `path.join(baseTempDir, 'projects')`
- `STORAGE_CONFIG.worktreesDir`: `path.join(baseTempDir, 'worktrees')`

**Database**: `backend/src/models/schema.ts`

- `projects.mirror_repo_path` (required)
- `projects.relay_repo_path` (required)
- `projects.default_branch` (required)

---

## Ref and Branch Summary

| Context | Ref/Branch                                                                                 |
| ------- | ------------------------------------------------------------------------------------------ |
| Mirror  | `refs/heads/gv/<projectId>/tracking/<A>`, `refs/heads/gv/<projectId>/relay`                |
| Relay   | Local: `<A>`, `relay`, `wi/<workItemId>`; remote: `refs/remotes/mirror/gv/<projectId>/...` |
| Source  | Local: `<A>`; remotes: `origin`, `mirror` (refs/remotes/mirror/gv/...)                     |

- `<A>` = project’s default branch (e.g. `main`).
- No `relay-${projectName}`; only `relay`.
- All mirror refs are namespaced by `projectId` (UUID).

---

## Design Compliance Checklist

- [x] Mirror path from normalized source path hash; format `<safe-name>-<hash>.git`
- [x] `mirror_repo_path` stored in DB; shared by projects with same source path
- [x] Namespaced refs: `gv/<projectId>/tracking/<A>`, `gv/<projectId>/relay`
- [x] Integration branch name: `relay`
- [x] projectId (UUID) for refs, not projectName
- [x] Explicit fetch + merge/reset (no pull)
- [x] Phase 0: Push relay to mirror (work merge into relay done before sync)
- [x] Phase 1: Source refresh from origin, then push to mirror tracking
- [x] Phase 2: Mirror → relay (fetch tracking A, reset A, merge A into relay, push relay)
- [x] Phase 3: Source preflight (clean working tree), fetch relay, merge relay into A (no reset --hard on source)
- [x] Phase 4: Push source A to origin and mirror
- [x] Phase 5: Fetch mirror tracking A into relay and reset relay’s A
- [x] Worktrees branch from `relay` when relay repo exists; PR target = relay

---

## File Map

| Design concept             | Implementation file(s)                                        |
| -------------------------- | ------------------------------------------------------------- |
| Mirror path, ensure mirror | `GitMirrorService.ts`, `GitService.getMirrorRepoPath`         |
| Push source → mirror       | `GitMirrorService.pushSourceToMirror`                         |
| Push relay → mirror        | `GitMirrorService.pushRelayToMirror`                          |
| Fetch mirror → relay       | `GitMirrorService.fetchMirrorRefToRelay`                      |
| Create relay repo          | `GitRelayService.createRelayRepo`                             |
| Sync relay → source        | `GitRelayService.syncRelayToSource`                           |
| Project create + mirror    | `routes/projects.ts` (POST create), `GitService`              |
| Sync API                   | `routes/projects.ts` (POST `:id/sync`)                        |
| Base branch = relay        | `WorkspaceService.initWorkspace`                              |
| PR merge into relay        | `PRService.mergePR`, workflow `pr_merge`, WorkItem baseBranch |
