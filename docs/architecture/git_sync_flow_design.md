# Git Sync Data Flow - Detailed Architecture

## Repository Hierarchy

```
┌─────────────────┐
│  Source Repo    │  (User's original repository)
│  (single)       │  - Authoritative source
│                 │  - Can be shared by multiple projects
└────────┬────────┘
         │
         │ Git push/pull (via remotes)
         │
┌────────▼────────┐
│  Mirror Repo    │  (Bare repository)
│  (shared)       │  - Intermediate layer
│  *.git          │  - No working directory
│                 │  - SHARED by projects with same source path
│                 │  - Path stored in database (mirror_repo_path)
└────────┬────────┘
         │
         │ Git push/pull (via remotes)
         │
┌────────▼────────┐
│  Relay Repo     │  (Working repository)
│  (per project)  │  - GitVibe's working copy
│                 │  - One per project
└────────┬────────┘
         │
         │ Git worktrees
         │
┌────────▼────────┐
│  Worktrees      │  (Multiple)
│  (multi)        │  - One per WorkItem
└─────────────────┘
```

**Key Architecture Points:**

- **Mirror repos are shared**: Multiple projects pointing to the same `sourceRepoPath` share a single mirror repo
- **Mirror path in database**: Each project stores its `mirror_repo_path` in the database
- **Mirror path calculation**: Based on normalized source path hash, not project name
- **Format**: `<safe-name>-<hash>.git` (e.g., `myrepo-a1b2c3d4.git`)
- **Namespaced refs**: All refs in mirror use `refs/heads/gv/<projectId>/...` to prevent collisions
- **Deterministic operations**: Uses explicit `fetch` + `merge`/`reset` (no `git pull`)
- **Integration branch**: Uses `relay` branch (not `relay-${projectName}`) for consistency
- **Project ID based**: Uses stable `projectId` (UUID) instead of `projectName` for refs

## Code Transfer Mechanisms

### 1. **Initial Setup: Source → Mirror → Relay**

When a project is first created:

```
Step 1: Create/Ensure Mirror Repo (Bare)
────────────────────────────────────────
Source Repo → Mirror Repo
  Method: git clone --bare <source> <mirror>
  OR: git init --bare + git fetch source --all --tags

  What's transferred:
  - All Git objects (commits, trees, blobs)
  - All branches (refs/heads/*)
  - All tags (refs/tags/*)
  - Complete Git history

  Location: ~/git-vibe/mirrors/<safe-name>-<hash>.git
  - Calculated from normalized source path
  - Hash ensures uniqueness for same source path
  - Safe name derived from last path component

  Type: Bare repository (no working directory)
  Shared: Multiple projects with same source path share this mirror

  Example:
  Source: /home/user/my-project
  Mirror: ~/git-vibe/mirrors/my-project-a1b2c3d4.git

  If another project uses /home/user/my-project:
  - It will use the SAME mirror repo
  - mirror_repo_path stored in each project's database record
```

```
Step 2: Create Relay Repo from Mirror
──────────────────────────────────────
Mirror Repo → Relay Repo
  Method:
    1. git init <relay-path>
    2. git remote add mirror <mirror-path>
    3. git fetch mirror refs/heads/gv/<projectId>/tracking/<A>:refs/remotes/mirror/gv/<projectId>/tracking/<A>
    4. git checkout -B <A> refs/remotes/mirror/gv/<projectId>/tracking/<A>
    5. git checkout -B relay <A>
    6. git push mirror relay:refs/heads/gv/<projectId>/relay

  What's transferred:
  - Git objects fetched from mirror using namespaced refs
  - Working directory files restored via reset --hard
  - Local branches: <A> (default) and `relay` (integration)
  - Mirror stores: gv/<projectId>/tracking/<A> and gv/<projectId>/relay

  Location: ~/git-vibe/projects/<project-name>
  Type: Working repository (has .git + working directory)

  Key Points:
  - Uses projectId (not projectName) for ref namespacing
  - Creates both default branch and relay integration branch
  - All mirror refs are namespaced to prevent collisions
```

### 2. **Creating Worktrees: Relay → Worktree**

When a WorkItem needs a workspace:

```
Relay Repo → Worktree
  Method: git worktree add -b <branch> <worktree-path> <base-ref>

  What's transferred:
  - Branch reference created
  - Working directory files (checked out from Git objects)
  - Shared .git directory (worktrees share relay repo's .git)

  Location: ~/git-vibe/worktrees/<workitem-id>
  Type: Worktree (shared .git, separate working directory)
```

### 3. **Sync Flow: Relay → Source (via Mirror) - Optimized**

When syncing changes back to source repo (using namespaced refs and explicit operations):

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 0: Merge work item into relay integration branch       │
├─────────────────────────────────────────────────────────────┤
│ Relay Repo: Merge work branch into relay                     │
│   Method:                                                    │
│     1. git checkout relay                                    │
│     2. git merge --no-ff wi/<workitemId> -m "Merge wi/..."  │
│     3. git push mirror relay:refs/heads/gv/<projectId>/relay  │
│                                                              │
│   What's transferred:                                        │
│   - Work branch merged into relay integration branch         │
│   - Relay branch pushed to mirror using namespaced ref       │
│                                                              │
│   Example:                                                   │
│   $ cd <relay-repo>                                          │
│   $ git checkout relay                                       │
│   $ git merge --no-ff wi/abc123                              │
│   $ git push mirror relay:refs/heads/gv/proj-123/relay        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Refresh mirror tracking/<A> from source              │
├─────────────────────────────────────────────────────────────┤
│ Source Repo → Mirror Repo                                    │
│   Method:                                                    │
│     1. git fetch origin --prune --tags (if origin exists)    │
│     2. git checkout <A>                                      │
│     3. git reset --hard origin/<A> (agent-owned)            │
│     4. git push mirror <A>:refs/heads/gv/<projectId>/tracking/<A> │
│                                                              │
│   What's transferred:                                        │
│   - Source default branch updated from origin                │
│   - Pushed to mirror using namespaced tracking ref           │
│   - Mirror now has current cache of source <A>               │
│                                                              │
│   Example:                                                   │
│   $ cd <source-repo>                                         │
│   $ git fetch origin                                         │
│   $ git checkout main                                        │
│   $ git reset --hard origin/main                              │
│   $ git push mirror main:refs/heads/gv/proj-123/tracking/main │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Rebase/merge latest A into relay & resolve conflicts│
├─────────────────────────────────────────────────────────────┤
│ Mirror Repo → Relay Repo                                     │
│   Method:                                                    │
│     1. git fetch mirror refs/heads/gv/<projectId>/tracking/<A>:refs/remotes/mirror/gv/<projectId>/tracking/<A> │
│     2. git checkout <A>                                      │
│     3. git reset --hard refs/remotes/mirror/gv/<projectId>/tracking/<A> │
│     4. git checkout relay                                    │
│     5. git merge --no-ff <A> -m "Merge <A> into relay"       │
│     6. (Resolve conflicts if any)                           │
│     7. git push mirror relay:refs/heads/gv/<projectId>/relay │
│                                                              │
│   What's transferred:                                        │
│   - Latest tracking A fetched from mirror (explicit fetch)   │
│   - Local A updated to match mirror tracking                 │
│   - A merged into relay integration branch                   │
│   - Updated relay pushed to mirror                           │
│                                                              │
│   Example:                                                   │
│   $ cd <relay-repo>                                          │
│   $ git fetch mirror refs/heads/gv/proj-123/tracking/main:refs/remotes/mirror/gv/proj-123/tracking/main │
│   $ git checkout main                                        │
│   $ git reset --hard refs/remotes/mirror/gv/proj-123/tracking/main │
│   $ git checkout relay                                       │
│   $ git merge --no-ff main                                   │
│   $ git push mirror relay:refs/heads/gv/proj-123/relay       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Apply relay integration to source A                 │
├─────────────────────────────────────────────────────────────┤
│ Mirror Repo → Source Repo                                    │
│   Method:                                                    │
│     1. git fetch mirror refs/heads/gv/<projectId>/relay:refs/remotes/mirror/gv/<projectId>/relay │
│     2. git checkout <A>                                      │
│     3. (preflight checks: clean working tree)                │
│     4. git merge --no-ff refs/remotes/mirror/gv/<projectId>/relay -m "Merge relay into <A>" │
│                                                              │
│   What's transferred:                                        │
│   - Relay integration branch fetched from mirror (explicit) │
│   - Merged into source default branch                        │
│   - Working directory updated via merge (NOT reset --hard)  │
│                                                              │
│   Example:                                                   │
│   $ cd <source-repo>                                         │
│   $ git fetch mirror refs/heads/gv/proj-123/relay:refs/remotes/mirror/gv/proj-123/relay │
│   $ git checkout main                                        │
│   $ git merge --no-ff refs/remotes/mirror/gv/proj-123/relay │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Phase 4: Push updated source A to mirror & origin            │
├─────────────────────────────────────────────────────────────┤
│ Source Repo → Mirror Repo & Origin                           │
│   Method:                                                    │
│     1. git push origin <A> (if origin exists)                 │
│     2. git push mirror <A>:refs/heads/gv/<projectId>/tracking/<A> │
│                                                              │
│   What's transferred:                                        │
│   - Updated default branch pushed to origin                  │
│   - Updated default branch pushed to mirror tracking ref     │
│   - Mirror now matches source                                │
│                                                              │
│   Example:                                                   │
│   $ cd <source-repo>                                         │
│   $ git push origin main                                     │
│   $ git push mirror main:refs/heads/gv/proj-123/tracking/main │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Phase 5: Sync relay default branch to mirror tracking        │
├─────────────────────────────────────────────────────────────┤
│ Mirror Repo → Relay Repo                                     │
│   Method:                                                    │
│     1. git fetch mirror refs/heads/gv/<projectId>/tracking/<A>:refs/remotes/mirror/gv/<projectId>/tracking/<A> │
│     2. git checkout <A>                                      │
│     3. git reset --hard refs/remotes/mirror/gv/<projectId>/tracking/<A> │
│                                                              │
│   What's transferred:                                        │
│   - Updated tracking A fetched from mirror (explicit)        │
│   - Local A reset to match mirror tracking                   │
│   - Relay stays consistent with source                       │
│                                                              │
│   Note: reset --hard is acceptable here because relay        │
│   repo is controlled by GitVibe, not user's working copy     │
│                                                              │
│   Example:                                                   │
│   $ cd <relay-repo>                                          │
│   $ git fetch mirror refs/heads/gv/proj-123/tracking/main:refs/remotes/mirror/gv/proj-123/tracking/main │
│   $ git checkout main                                        │
│   $ git reset --hard refs/remotes/mirror/gv/proj-123/tracking/main │
└─────────────────────────────────────────────────────────────┘
```

## Data Transfer Methods Comparison

### Old Architecture (File-Based Copy)

```typescript
// OLD: Direct file copying
const relayFiles = await fs.readdir(relayRepoPath);
for (const file of relayFiles) {
  if (file !== ".git") {
    await fs.cp(srcPath, destPath, { recursive: true, force: true });
  }
}
// Then: git add -A && git commit
```

**Problems:**

- ❌ Loses Git history
- ❌ No incremental updates
- ❌ Slow for large repos
- ❌ No conflict resolution
- ❌ Can't track what changed

### New Architecture (Git-Native)

```typescript
// NEW: Git push/pull operations
// Relay → Mirror
git push mirror <branch>

// Mirror → Source
git fetch mirror
git merge mirror/<branch>

// Source → Mirror
git push mirror <branch>

// Mirror → Relay
git fetch mirror
git reset --hard mirror/<branch>
```

**Benefits:**

- ✅ Preserves complete Git history
- ✅ Incremental updates (only changed objects)
- ✅ Fast (Git's delta compression)
- ✅ Built-in conflict resolution
- ✅ Full audit trail

## What Gets Transferred

### Git Objects (Transferred via push/pull)

1. **Commits** (`git object type: commit`)
   - Commit message
   - Author/date information
   - Parent commit references
   - Tree reference

2. **Trees** (`git object type: tree`)
   - Directory structure
   - File names and permissions
   - Blob references

3. **Blobs** (`git object type: blob`)
   - File contents
   - Compressed and deduplicated

4. **References** (refs/heads/_, refs/tags/_)
   - Branch pointers
   - Tag pointers

### Working Directory Files (Restored from Git Objects)

When you do `git checkout` or `git reset --hard`:

- Git reads tree objects
- Git reads blob objects
- Files are reconstructed in working directory
- File permissions are restored

## Example: Complete Sync Flow

Let's trace a change from worktree to source repo:

```
1. Developer makes change in Worktree
   Location: ~/git-vibe/worktrees/wi-123
   File: src/app.ts
   Change: Added new function

   $ cd ~/git-vibe/worktrees/wi-123
   $ echo "function newFunc() {}" >> src/app.ts
   $ git add src/app.ts
   $ git commit -m "Add new function"

2. Change is in Worktree's branch (wi/wi-123)
   - Commit object created
   - Tree object updated
   - Blob object for app.ts updated
   - Branch ref updated: refs/heads/wi/wi-123

3. Worktree branch merges to Relay's default branch
   (This happens when PR is merged)
   $ cd ~/git-vibe/projects/myproject
   $ git checkout main
   $ git merge wi/wi-123
   - Merge commit created
   - Default branch ref updated

4. Relay → Mirror (Phase 1)
   $ git push mirror main
   - Pushes commit objects to mirror
   - Updates mirror's refs/heads/main
   - Mirror now has: commit → tree → blob (new function)

5. Mirror → Source relay-xxx branch (Phase 2)
   $ cd <source-repo>
   $ git fetch mirror
   - Fetches commit objects from mirror
   - Updates remote refs: refs/remotes/mirror/main
   $ git checkout relay-myproject
   $ git merge mirror/main
   - Merges commits into relay-xxx branch
   - Working directory updated (app.ts now has new function)
   - Creates merge commit

6. relay-xxx → default branch (Phase 3)
   $ git checkout main
   $ git merge relay-myproject
   - Merges relay-xxx into main
   - Working directory updated
   - Merge commit created

7. Source → Mirror (Phase 4)
   $ git push mirror main
   - Pushes all commits to mirror
   - Updates mirror's refs/heads/main
   - Mirror now matches source

8. Mirror → Relay (Phase 5)
   $ cd ~/git-vibe/projects/myproject
   $ git fetch mirror
   - Fetches updated commits
   $ git checkout main
   $ git reset --hard mirror/main
   - Working directory updated to match mirror
   - app.ts now has new function in relay repo
```

## Key Points

1. **No File Copying**: All transfers use Git's native push/pull
2. **History Preserved**: Every commit, tree, and blob is transferred
3. **Incremental**: Only new/changed objects are transferred
4. **Atomic**: Git operations are atomic (all-or-nothing)
5. **Mirror is Bare**: No working directory, just Git objects
6. **No reset --hard on Source**: Source repo uses merge, preserving working directory
7. **reset --hard on Relay**: Acceptable because relay is system-controlled
8. **Shared Mirror Repos**: Projects with same `sourceRepoPath` share mirror repo
9. **Mirror Path in DB**: `mirror_repo_path` stored in `projects` table
10. **Path-Based Hashing**: Mirror path calculated from source path, not project name
11. **Namespaced Refs**: All mirror refs use `gv/<projectId>/...` to prevent collisions
12. **Deterministic Operations**: Uses explicit `fetch` + `merge`/`reset` (no `git pull`)
13. **Integration Branch**: Uses `relay` branch (not `relay-${projectName}`) for consistency
14. **Project ID Based**: Uses stable `projectId` (UUID) instead of `projectName` for refs
15. **Namespaced Refs**: All mirror refs use `gv/<projectId>/...` to prevent collisions
16. **Deterministic Operations**: Uses explicit `fetch` + `merge`/`reset` (no `git pull`)
17. **Integration Branch**: Uses `relay` branch (not `relay-${projectName}`) for consistency
18. **Project ID Based**: Uses `projectId` (not `projectName`) for ref naming to prevent rename issues

## Remote Configuration

Each repo maintains remotes to communicate:

**Source Repo:**

```
remote "origin"     → User's original remote (GitHub, etc.) [optional]
remote "mirror"     → file://<mirror-path>
                      (mirror path from project.mirror_repo_path)
```

**Mirror Repo:**

```
remote "source"     → file://<source-path> (for initial clone) [optional]
(no working directory, so no remotes needed for push)
Note: Multiple projects may reference the same mirror repo
All refs are namespaced: refs/heads/gv/<projectId>/...
```

**Relay Repo:**

```
remote "mirror"     → file://<mirror-path>
                      (mirror path from project.mirror_repo_path)
(origin removed to prevent accidental pushes)
```

**Important**: The `mirror_repo_path` is:

- Calculated when project is created: `gitService.getMirrorRepoPath(sourceRepoPath)`
- Stored in database: `projects.mirror_repo_path`
- Used for all sync operations
- Shared across projects with identical `sourceRepoPath`

## Ref Namespacing (MANDATORY)

Because mirror repos are shared, all refs written to mirror MUST be namespaced:

**Mirror Refs:**

- `refs/heads/gv/<projectId>/tracking/<A>`: Tracking copy of source default branch
- `refs/heads/gv/<projectId>/relay`: Project integration branch
- `refs/heads/gv/<projectId>/wi/<workitemId>`: Optional work-in-progress branches

**Relay Local Branches:**

- `<A>`: Local default branch (reset to mirror tracking when syncing)
- `relay`: Local integration branch (maps to mirror `gv/<projectId>/relay`)
- `wi/<workitemId>`: Local work branches (often via worktrees)

**Key Points:**

- Uses `projectId` (not `projectName`) for ref namespacing to prevent rename breakage
- Uses `relay` branch (not `relay-${projectName}`) for consistency
- All mirror operations use explicit ref paths for determinism

## File System Locations

```
baseTempDir/
├── mirrors/
│   └── <safe-name>-<hash>.git/     # Bare mirror repo (SHARED)
│       ├── objects/                 # Git objects (commits, trees, blobs)
│       ├── refs/
│       │   ├── heads/               # Branch refs
│       │   └── tags/                # Tag refs
│       └── config                   # Git config
│       Note: Multiple projects may point to the same mirror
│
├── projects/
│   └── <project-name>/              # Relay repo (one per project)
│       ├── .git/                    # Git metadata
│       │   ├── objects/             # Git objects
│       │   ├── refs/                # Refs
│       │   └── worktrees/           # Worktree metadata
│       └── [working files]          # Checked out files
│
└── worktrees/
    └── <workitem-id>/               # Worktree
        └── [working files]          # Checked out files
        (shares .git with relay repo)
```

**Mirror Repo Naming:**

- Format: `<safe-name>-<hash>.git`
- `safe-name`: Last component of source path, sanitized (e.g., `my-project`)
- `hash`: 8-character hex hash of normalized source path (e.g., `a1b2c3d4`)
- Example: `/home/user/my-project` → `my-project-a1b2c3d4.git`
- Same source path = same hash = same mirror repo

**Database Storage:**

- `projects.mirror_repo_path`: Full path to mirror repo (e.g., `/tmp/git-vibe/mirrors/my-project-a1b2c3d4.git`)
- Calculated once during project creation
- Used for all sync operations
- Enables sharing: Multiple projects can have the same `mirror_repo_path`

## Summary

**Code Transfer = Git Object Transfer**

- Commits, trees, and blobs are pushed/pulled between repos
- Working directory files are reconstructed from Git objects
- Mirror repo acts as a Git object store (bare repository)
- All transfers preserve complete history
- No file system copying, only Git operations

**Mirror Repo Sharing Architecture**

- **One mirror per source path**: Projects with identical `sourceRepoPath` share a mirror repo
- **Path-based identification**: Mirror path calculated from normalized source path + hash
- **Database persistence**: `mirror_repo_path` stored in `projects` table for each project
- **Efficient storage**: Reduces duplicate mirror repos when multiple projects use same source
- **Consistent sync**: All projects sharing a mirror stay in sync automatically
- **Namespaced refs prevent collisions**: Each project uses `gv/<projectId>/...` refs in shared mirror

**Example Scenario:**

```
Project A:
  - id: proj-123
  - sourceRepoPath: /home/user/my-repo
  - mirrorRepoPath: mirrors/my-repo-a1b2c3d4.git
  - Mirror refs: refs/heads/gv/proj-123/tracking/main
                 refs/heads/gv/proj-123/relay

Project B:
  - id: proj-456
  - sourceRepoPath: /home/user/my-repo (SAME as A)
  - mirrorRepoPath: mirrors/my-repo-a1b2c3d4.git (SHARED with A)
  - Mirror refs: refs/heads/gv/proj-456/tracking/main
                 refs/heads/gv/proj-456/relay

Project C:
  - id: proj-789
  - sourceRepoPath: /home/user/other-repo
  - mirrorRepoPath: mirrors/other-repo-e5f6g7h8.git (DIFFERENT)
  - Mirror refs: refs/heads/gv/proj-789/tracking/main
                 refs/heads/gv/proj-789/relay

Result:
- Projects A & B share the same mirror repo but use different namespaced refs
- No collisions because refs are namespaced by projectId
- Each project maintains its own tracking and relay branches in the shared mirror
```
