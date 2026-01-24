/**
 * PRNodeExecutor - Handles PR operations (create, merge, etc.)
 */

import type { WorkflowNode, StepStatus } from 'git-vibe-shared';
import { prService } from '../PRService.js';
import { workflowEventBus } from '../WorkflowEventBus.js';
import { projectsRepository } from '../../repositories/ProjectsRepository.js';
import { BaseNodeExecutor, type NodeExecutionResult } from './BaseNodeExecutor.js';
import type { ExecutionContext } from '../WorkflowExecutionService.js';

export class PRNodeExecutor extends BaseNodeExecutor {
  canHandle(node: WorkflowNode): boolean {
    return node.type === 'github' && (node.action === 'pr.create' || node.action === 'pr.merge');
  }

  async execute(node: WorkflowNode, ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const { workItemsRepository } = await import('../../repositories/WorkItemsRepository.js');
    const workItem = await workItemsRepository.findById(ctx.workItemId);
    if (!workItem) {
      throw new Error(`WorkItem ${ctx.workItemId} not found`);
    }

    if (!workItem.worktreePath || !workItem.headBranch || !workItem.baseBranch) {
      throw new Error(`WorkItem ${ctx.workItemId} workspace not fully initialized`);
    }

    const project = await projectsRepository.findById(workItem.projectId);
    if (!project) {
      throw new Error(`Project ${workItem.projectId} not found`);
    }

    const outputs = new Map(ctx.outputs);

    if (node.action === 'pr.create') {
      // Create PR
      const pr = await prService.openPR(
        ctx.workItemId,
        project.id,
        workItem.title,
        workItem.body,
        workItem.headBranch,
        workItem.baseBranch
      );

      // Emit pr.created event
      await workflowEventBus.emit({
        type: 'pr.created',
        workItemId: ctx.workItemId,
        workflowRunId: ctx.runId,
        nodeId: node.id,
        data: { prId: pr.id, prNumber: pr.id },
      });

      // Construct PR URL from project sourceRepoUrl
      let prUrl = '';
      if (project.sourceRepoUrl) {
        // For GitHub URLs, construct pull request URL
        // Format: https://github.com/{owner}/{repo}/pull/{number}
        // Note: pr.id might be UUID, not GitHub PR number - this is a placeholder
        // In a real integration, we'd need to track the actual GitHub PR number
        const repoUrl = project.sourceRepoUrl.replace(/\.git$/, '');
        prUrl = `${repoUrl}/pull/${pr.id}`;
      } else {
        // Fallback: use PR id as URL placeholder
        prUrl = `pr://${pr.id}`;
      }

      outputs.set('github.pr.id', pr.id);
      outputs.set('github.pr.number', pr.id);
      outputs.set('github.pr.url', prUrl);

      return {
        status: 'succeeded',
        outputs,
        artifacts: ctx.artifacts,
      };
    } else if (node.action === 'pr.merge') {
      // Get PR for this WorkItem
      const { pullRequestsRepository } =
        await import('../../repositories/PullRequestsRepository.js');
      const pr = await pullRequestsRepository.findByWorkItemId(ctx.workItemId);
      if (!pr) {
        throw new Error(`PR not found for WorkItem ${ctx.workItemId}`);
      }

      // Check for merge conflicts before attempting merge
      const repoPath = project.relayRepoPath || project.sourceRepoPath;
      const mergeability = await prService.checkMergeability(pr, workItem, repoPath);

      if (!mergeability.canMerge) {
        // Check if failure is due to conflicts
        const hasConflicts = mergeability.reasons.some((r) => r.toLowerCase().includes('conflict'));

        if (hasConflicts) {
          // Emit conflict.detected event
          await workflowEventBus.emit({
            type: 'conflict.detected',
            workItemId: ctx.workItemId,
            workflowRunId: ctx.runId,
            nodeId: node.id,
            data: { prId: pr.id, reasons: mergeability.reasons },
          });

          outputs.set('merge.conflict', true);
          outputs.set('merge.reasons', mergeability.reasons);

          return {
            status: 'failed',
            outputs,
            artifacts: ctx.artifacts,
          };
        } else {
          // Other mergeability issues
          throw new Error(`Cannot merge PR: ${mergeability.reasons.join(', ')}`);
        }
      }

      // Merge PR
      const mergeStrategy = (node.with?.method as string) || 'merge';
      let mergedPR;
      try {
        mergedPR = await prService.mergePR(pr, workItem, project, mergeStrategy as any);
      } catch (error) {
        // Check if merge failed due to conflicts
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.toLowerCase().includes('conflict')) {
          // Emit conflict.detected event
          await workflowEventBus.emit({
            type: 'conflict.detected',
            workItemId: ctx.workItemId,
            workflowRunId: ctx.runId,
            nodeId: node.id,
            data: { prId: pr.id, error: errorMessage },
          });

          outputs.set('merge.conflict', true);
          outputs.set('merge.error', errorMessage);

          return {
            status: 'failed',
            outputs,
            artifacts: ctx.artifacts,
          };
        }
        throw error;
      }

      // Emit pr.merged event
      await workflowEventBus.emit({
        type: 'pr.merged',
        workItemId: ctx.workItemId,
        workflowRunId: ctx.runId,
        nodeId: node.id,
        data: { prId: mergedPR.id },
      });

      outputs.set('github.pr.merged', true);
      outputs.set('merge.conflict', false);

      return {
        status: 'succeeded',
        outputs,
        artifacts: ctx.artifacts,
      };
    }

    throw new Error(`Unknown PR action: ${node.action}`);
  }
}
