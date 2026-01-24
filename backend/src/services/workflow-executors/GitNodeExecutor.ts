/**
 * GitNodeExecutor - Handles git operations (commit, push, etc.)
 */

import type { WorkflowNode, StepStatus, WorkflowPolicy } from 'git-vibe-shared';
import { gitService } from '../GitService.js';
import { workflowEventBus } from '../WorkflowEventBus.js';
import { projectsRepository } from '../../repositories/ProjectsRepository.js';
import { BaseNodeExecutor, type NodeExecutionResult } from './BaseNodeExecutor.js';
import type { ExecutionContext } from '../WorkflowExecutionService.js';

export class GitNodeExecutor extends BaseNodeExecutor {
  canHandle(node: WorkflowNode): boolean {
    return node.type === 'git' && node.action !== 'workspace.init';
  }

  async execute(node: WorkflowNode, ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const { workItemsRepository } = await import('../../repositories/WorkItemsRepository.js');
    const workItem = await workItemsRepository.findById(ctx.workItemId);
    if (!workItem) {
      throw new Error(`WorkItem ${ctx.workItemId} not found`);
    }

    if (!workItem.worktreePath) {
      throw new Error(`WorkItem ${ctx.workItemId} workspace not initialized`);
    }

    const project = await projectsRepository.findById(workItem.projectId);
    if (!project) {
      throw new Error(`Project ${workItem.projectId} not found`);
    }

    const outputs = new Map(ctx.outputs);
    const action = node.action || 'git.commit';

    // Get workflow policy for validation
    const workflowPolicy = this.getWorkflowPolicy(ctx);

    if (action === 'git.commit') {
      return await this.executeCommit(node, ctx, workItem, project, outputs, workflowPolicy);
    } else if (action === 'git.push') {
      return await this.executePush(node, ctx, workItem, project, outputs);
    } else if (action === 'git.stage') {
      return await this.executeStage(node, ctx, workItem, outputs);
    } else {
      throw new Error(`Unknown git action: ${action}`);
    }
  }

  private async executeCommit(
    node: WorkflowNode,
    ctx: ExecutionContext,
    workItem: any,
    project: any,
    outputs: Map<string, unknown>,
    policy?: WorkflowPolicy
  ): Promise<NodeExecutionResult> {
    const worktreePath = workItem.worktreePath!;

    // Get commit message from node configuration
    const commitMessage = this.getCommitMessage(node, ctx, workItem);

    // Enforce commit policy if available
    if (policy?.commit) {
      this.validateCommitPolicy(commitMessage, worktreePath, policy.commit);
    }

    // Check if there are changes to commit
    if (!gitService.hasAnyChanges(worktreePath)) {
      // No changes, skip commit
      outputs.set('git.commit.skipped', true);
      outputs.set('git.commit.sha', workItem.headSha || '');
      return {
        status: 'succeeded',
        outputs,
        artifacts: ctx.artifacts,
      };
    }

    // Stage changes if needed (policy may require intentional staging)
    if (policy?.commit?.requireIntentionalStaging) {
      // For intentional staging, we expect the agent to have already staged files
      // Just verify there are staged changes
      if (!gitService.hasStagedChanges(worktreePath)) {
        throw new Error('Commit policy requires intentional staging, but no staged changes found');
      }
    } else {
      // Auto-stage all changes if policy allows
      if (gitService.hasUnstagedChanges(worktreePath)) {
        gitService.stageAllChanges(worktreePath);
      }
    }

    // Commit changes
    const commitSha = gitService.commitChanges(worktreePath, commitMessage);

    // Emit git.committed event
    await workflowEventBus.emit({
      type: 'git.committed',
      workItemId: ctx.workItemId,
      workflowRunId: ctx.runId,
      nodeId: node.id,
      data: { commitSha, message: commitMessage },
    });

    outputs.set('git.commit.sha', commitSha);
    outputs.set('git.commit.message', commitMessage);

    return {
      status: 'succeeded',
      outputs,
      artifacts: ctx.artifacts,
    };
  }

  private async executePush(
    node: WorkflowNode,
    ctx: ExecutionContext,
    workItem: any,
    project: any,
    outputs: Map<string, unknown>
  ): Promise<NodeExecutionResult> {
    const worktreePath = workItem.worktreePath!;
    const branch = workItem.headBranch || 'HEAD';

    // Push current branch using git push
    const { execSync } = await import('node:child_process');
    try {
      execSync(`git push origin ${branch}`, {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      // If push fails, check if it's because branch doesn't exist upstream
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('no upstream branch')) {
        // Set upstream and push
        execSync(`git push -u origin ${branch}`, {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } else {
        throw error;
      }
    }

    outputs.set('git.push.branch', branch);
    outputs.set('git.push.success', true);

    return {
      status: 'succeeded',
      outputs,
      artifacts: ctx.artifacts,
    };
  }

  private async executeStage(
    node: WorkflowNode,
    ctx: ExecutionContext,
    workItem: any,
    outputs: Map<string, unknown>
  ): Promise<NodeExecutionResult> {
    const worktreePath = workItem.worktreePath!;

    // Get staging configuration from node.with
    const files = node.with?.files as string[] | undefined;
    const pathspec = node.with?.pathspec as string | undefined;

    if (files && files.length > 0) {
      // Stage specific files using git add
      const { execSync } = await import('node:child_process');
      for (const file of files) {
        execSync(`git add "${file}"`, {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      }
    } else if (pathspec) {
      // Stage using pathspec
      const { execSync } = await import('node:child_process');
      execSync(`git add "${pathspec}"`, {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      // Stage all changes
      gitService.stageAllChanges(worktreePath);
    }

    outputs.set('git.stage.success', true);

    return {
      status: 'succeeded',
      outputs,
      artifacts: ctx.artifacts,
    };
  }

  private getCommitMessage(node: WorkflowNode, ctx: ExecutionContext, workItem: any): string {
    // Get message from node.with or construct from workitem
    if (node.with?.message) {
      return String(node.with.message);
    }

    // Use workitem title as default
    return workItem.title || 'Work item commit';
  }

  private validateCommitPolicy(
    message: string,
    worktreePath: string,
    policy: WorkflowPolicy['commit']
  ): void {
    // Validate commit message format
    const lines = message.split('\n');
    const subject = lines[0] || '';

    if (policy.requireCommitBody && lines.length < 2) {
      throw new Error('Commit policy requires commit body, but message has no body');
    }

    if (subject.length > policy.message.subjectMaxLen) {
      throw new Error(
        `Commit subject exceeds maximum length: ${subject.length} > ${policy.message.subjectMaxLen}`
      );
    }

    // Check for intentional staging (already validated in executeCommit)
    if (policy.requireIntentionalStaging && !policy.allowGitAddAll) {
      // This is enforced by checking staged changes before committing
    }
  }

  private getWorkflowPolicy(ctx: ExecutionContext): WorkflowPolicy | undefined {
    // Get policy from workflow context
    return ctx.workflow?.workflow?.policy;
  }
}
