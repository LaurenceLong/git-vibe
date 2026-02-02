import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GitWorktreeService } from './GitWorktreeService.js';
import { GitCommitService } from './GitCommitService.js';
import { GitFileService, type RepoFile } from './GitFileService.js';
import { GitRelayService } from './GitRelayService.js';
import { STORAGE_CONFIG } from '../../config/storage.js';

/**
 * Main Git service that provides a unified interface to all Git operations
 * Internally delegates to specialized services for better organization
 */
export class GitService {
  private worktreeService: GitWorktreeService;
  private commitService: GitCommitService;
  private fileService: GitFileService;
  private relayService: GitRelayService;

  constructor() {
    // Initialize specialized services with shared execCommand method
    this.worktreeService = new GitWorktreeService(this.execCommand.bind(this));
    this.commitService = new GitCommitService(this.execCommand.bind(this));
    this.fileService = new GitFileService();
    this.relayService = new GitRelayService(
      this.execCommand.bind(this),
      this.getDefaultBranch.bind(this),
      STORAGE_CONFIG.mirrorsDir
    );
  }

  private execCommand(command: string, cwd: string): string {
    try {
      return execSync(command, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; status?: number };
      throw new Error(`Git command failed: ${command}\nStderr: ${err.stderr}`);
    }
  }

  // ============================================================================
  // Core Git Operations
  // ============================================================================

  async validateRepo(repoPath: string): Promise<boolean> {
    try {
      await fs.access(`${repoPath}/.git`);
      return true;
    } catch {
      throw new Error(`Not a valid Git repository: ${repoPath}`);
    }
  }

  getCurrentBranch(repoPath: string): string {
    return this.execCommand('git rev-parse --abbrev-ref HEAD', repoPath).trim();
  }

  listBranches(repoPath: string): string[] {
    try {
      const output = this.execCommand('git branch --format=%(refname:short)', repoPath).trim();
      if (!output) {
        return [];
      }
      // Get local branches and remove duplicates
      const branches = output
        .split('\n')
        .map((branch) => branch.trim())
        .filter((branch) => branch.length > 0);
      return [...new Set(branches)];
    } catch {
      return [];
    }
  }

  getDefaultBranch(repoPath: string): string {
    try {
      const output = this.execCommand('git symbolic-ref refs/remotes/origin/HEAD', repoPath).trim();
      // Remove the "refs/remotes/origin/" prefix using JavaScript instead of sed
      return output.replace('refs/remotes/origin/', '');
    } catch {
      return 'main';
    }
  }

  getRemoteUrl(repoPath: string, remote: string = 'origin'): string | null {
    try {
      const output = this.execCommand(`git remote get-url ${remote}`, repoPath).trim();
      return output || null;
    } catch {
      return null;
    }
  }

  getHeadSha(repoPath: string): string {
    return this.execCommand('git rev-parse HEAD', repoPath).trim();
  }

  getRefSha(repoPath: string, ref: string): string {
    return this.execCommand(`git rev-parse ${ref}`, repoPath).trim();
  }

  ensureCleanWorktree(repoPath: string): void {
    // empty output means clean
    const status = this.execCommand('git status --porcelain', repoPath).trim();
    if (status.length > 0) {
      throw new Error(`Repository has uncommitted changes: ${repoPath}`);
    }
  }

  // ============================================================================
  // Worktree Operations (delegated to GitWorktreeService)
  // ============================================================================

  createWorktree(repoPath: string, worktreePath: string, branch: string, baseRef: string): void {
    return this.worktreeService.createWorktree(repoPath, worktreePath, branch, baseRef);
  }

  createWorktreeFromExistingBranch(repoPath: string, worktreePath: string, branch: string): void {
    return this.worktreeService.createWorktreeFromExistingBranch(repoPath, worktreePath, branch);
  }

  removeWorktree(worktreePath: string, repoPath: string): void {
    return this.worktreeService.removeWorktree(worktreePath, repoPath);
  }

  pruneWorktrees(repoPath: string): void {
    return this.worktreeService.pruneWorktrees(repoPath);
  }

  listWorktrees(repoPath: string): Array<{ worktreePath: string; branch: string }> {
    return this.worktreeService.listWorktrees(repoPath);
  }

  findWorktreeForBranch(repoPath: string, branch: string): string | null {
    return this.worktreeService.findWorktreeForBranch(repoPath, branch);
  }

  recreateWorktree(
    repoPath: string,
    worktreePath: string,
    branchName: string,
    baseRef: string
  ): void {
    return this.worktreeService.recreateWorktree(repoPath, worktreePath, branchName, baseRef);
  }

  getWorktreeStatus(repoPath: string, worktreePath: string): 'present' | 'missing' {
    return this.worktreeService.getWorktreeStatus(repoPath, worktreePath);
  }

  getWorktreeHead(worktreePath: string): string {
    return this.getHeadSha(worktreePath);
  }

  // ============================================================================
  // Commit/Log/Diff Operations (delegated to GitCommitService)
  // ============================================================================

  getDiff(baseSha: string, headSha: string, repoPath: string): string {
    return this.commitService.getDiff(baseSha, headSha, repoPath);
  }

  generatePatch(baseSha: string, headSha: string, repoPath: string): string {
    return this.commitService.generatePatch(baseSha, headSha, repoPath);
  }

  getLogOneline(repoPath: string, range: string): string {
    return this.commitService.getLogOneline(repoPath, range);
  }

  getLogDetailed(
    repoPath: string,
    range: string
  ): Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
  }> {
    return this.commitService.getLogDetailed(repoPath, range);
  }

  getDiffStats(
    baseSha: string,
    headSha: string,
    repoPath: string
  ): {
    filesChanged: number;
    additions: number;
    deletions: number;
  } {
    return this.commitService.getDiffStats(baseSha, headSha, repoPath);
  }

  getFilesChanged(baseSha: string, headSha: string, repoPath: string): string[] {
    return this.commitService.getFilesChanged(baseSha, headSha, repoPath);
  }

  getFilesChangedForCommit(commitSha: string, repoPath: string): string[] {
    return this.commitService.getFilesChangedForCommit(commitSha, repoPath);
  }

  getCommitsWithFiles(
    repoPath: string,
    range: string
  ): Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
    filesChanged: string[];
  }> {
    return this.commitService.getCommitsWithFiles(repoPath, range);
  }

  getCommitsByShas(
    repoPath: string,
    commitShas: string[]
  ): Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
    filesChanged: string[];
  }> {
    return this.commitService.getCommitsByShas(repoPath, commitShas);
  }

  // ============================================================================
  // File Operations (delegated to GitFileService)
  // ============================================================================

  async listFiles(repoPath: string, relativePath: string = ''): Promise<RepoFile[]> {
    return this.fileService.listFiles(repoPath, relativePath);
  }

  async getFileContent(repoPath: string, filePath: string): Promise<string> {
    return this.fileService.getFileContent(repoPath, filePath);
  }

  // ============================================================================
  // Patch Operations
  // ============================================================================

  async applyPatch(repoPath: string, patchContent: string): Promise<void> {
    const patchPath = `${repoPath}/.gitvibe-temp.patch`;
    await fs.writeFile(patchPath, patchContent, 'utf-8');

    try {
      this.execCommand('git apply --3way --whitespace=nowarn .gitvibe-temp.patch', repoPath);
      this.execCommand('git add -A', repoPath);
      await fs.unlink(patchPath);
    } catch (error) {
      await fs.unlink(patchPath).catch(() => {});
      throw error;
    }
  }

  // ============================================================================
  // Commit Operations
  // ============================================================================

  commitChanges(repoPath: string, message: string): string {
    // Stage all changes including new/untracked files before committing
    // This ensures new files are always included in the commit
    this.stageAllChanges(repoPath);
    this.execCommand(`git commit -m "${message}"`, repoPath);
    return this.getHeadSha(repoPath);
  }

  stageAllChanges(repoPath: string): void {
    this.execCommand('git add -A', repoPath);
  }

  hasStagedChanges(repoPath: string): boolean {
    try {
      this.execCommand('git diff --cached --quiet', repoPath);
      // Exit code 0 means no changes
      return false;
    } catch {
      // Exit code 1 means there are changes
      return true;
    }
  }

  hasUnstagedChanges(repoPath: string): boolean {
    try {
      this.execCommand('git diff --quiet', repoPath);
      // Exit code 0 means no changes
      return false;
    } catch {
      // Exit code 1 means there are changes
      return true;
    }
  }

  hasAnyChanges(repoPath: string): boolean {
    // Check for any changes (staged or unstaged)
    return this.hasStagedChanges(repoPath) || this.hasUnstagedChanges(repoPath);
  }

  // ============================================================================
  // Branch Operations
  // ============================================================================

  deleteBranch(branchName: string, repoPath: string): void {
    this.execCommand(`git branch -D ${branchName}`, repoPath);
  }

  checkoutBranch(repoPath: string, branch: string): void {
    // Normalize paths for comparison (handle Windows path separators)
    const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '');
    const normalizedRepoPath = normalizePath(repoPath);

    // Check if branch is already checked out in a worktree
    const worktreePath = this.findWorktreeForBranch(repoPath, branch);
    if (worktreePath) {
      const normalizedWorktreePath = normalizePath(worktreePath);

      // If we're already in a worktree that has this branch, checkout normally
      if (normalizedWorktreePath === normalizedRepoPath) {
        this.execCommand(`git checkout ${branch}`, repoPath);
        return;
      }

      // Branch is in a different worktree than the one we're trying to checkout in
      // Verify it's on the correct branch
      const currentBranch = this.getCurrentBranch(worktreePath);
      const normalizedBranch = branch.replace(/^refs\/heads\//, '');
      if (currentBranch !== normalizedBranch) {
        // This shouldn't happen, but handle it
        throw new Error(
          `Branch ${branch} is checked out in worktree at ${worktreePath}, but that worktree is on ${currentBranch}`
        );
      }

      // Branch is already checked out in a different worktree
      // We can't checkout the same branch in multiple worktrees
      // The caller should use the worktree path instead
      throw new Error(
        `Cannot checkout branch ${branch} in ${repoPath}: branch is already checked out in worktree at ${worktreePath}. Use the worktree path instead.`
      );
    }

    // Branch is not in a worktree, checkout normally
    this.execCommand(`git checkout ${branch}`, repoPath);
  }

  // ============================================================================
  // Merge Operations
  // ============================================================================

  mergeBranch(repoPath: string, branch: string, message: string): void {
    this.execCommand(`git merge --no-ff ${branch} -m "${message}"`, repoPath);
  }

  mergeSquashBranch(repoPath: string, branch: string): void {
    this.execCommand(`git merge --squash ${branch}`, repoPath);
  }

  mergeFFOnly(repoPath: string, branch: string): void {
    this.execCommand(`git merge --ff-only ${branch}`, repoPath);
  }

  rebaseBranch(repoPath: string, branch: string): void {
    this.execCommand(`git rebase ${branch}`, repoPath);
  }

  abortMerge(repoPath: string): void {
    this.execCommand(`git merge --abort`, repoPath);
  }

  abortRebase(repoPath: string): void {
    this.execCommand(`git rebase --abort`, repoPath);
  }

  testMergeNoCommit(repoPath: string, branch: string): void {
    this.execCommand(`git merge --no-commit --no-ff ${branch}`, repoPath);
  }

  // ============================================================================
  // Relay Repository Operations (delegated to GitRelayService)
  // ============================================================================

  /**
   * Get the mirror repo path for a given source repo path
   * Multiple projects with the same source path share the same mirror repo
   * This duplicates the logic from GitMirrorService.getMirrorRepoPath to avoid circular dependencies
   */
  getMirrorRepoPath(sourceRepoPath: string): string {
    // Normalize the source path to handle different path formats
    const normalizedPath = path.resolve(sourceRepoPath).replace(/\\/g, '/');

    // Create a hash from the normalized path
    let hash = 0;
    for (let i = 0; i < normalizedPath.length; i++) {
      const char = normalizedPath.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Use absolute value and convert to hex for filename-safe string
    const hashStr = Math.abs(hash).toString(16).padStart(8, '0');

    // Create a safe directory name from the last part of the path
    const pathParts = normalizedPath.split('/').filter((p) => p.length > 0);
    const lastPart = pathParts[pathParts.length - 1] || 'repo';
    const safeName = lastPart.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Combine hash and safe name for uniqueness and readability
    return path.join(STORAGE_CONFIG.mirrorsDir, `${safeName}-${hashStr}.git`);
  }

  async createRelayRepo(
    sourceRepoPath: string,
    relayRepoPath: string,
    mirrorRepoPath: string,
    projectId: string,
    branch?: string
  ): Promise<void> {
    return this.relayService.createRelayRepo(
      sourceRepoPath,
      relayRepoPath,
      mirrorRepoPath,
      projectId,
      branch
    );
  }

  async syncRelayToSource(
    relayRepoPath: string,
    sourceRepoPath: string,
    mirrorRepoPath: string,
    projectId: string
  ): Promise<string | null> {
    return this.relayService.syncRelayToSource(
      relayRepoPath,
      sourceRepoPath,
      mirrorRepoPath,
      projectId
    );
  }
}

export const gitService = new GitService();
