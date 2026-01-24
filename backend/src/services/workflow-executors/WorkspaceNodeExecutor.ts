/**
 * WorkspaceNodeExecutor - Handles workspace initialization nodes
 */

import type { WorkflowNode, StepStatus } from 'git-vibe-shared';
import { workspaceService } from '../WorkspaceService.js';
import { workItemEventService } from '../WorkItemEventService.js';
import { projectsRepository } from '../../repositories/ProjectsRepository.js';
import { BaseNodeExecutor, type NodeExecutionResult } from './BaseNodeExecutor.js';
import type { ExecutionContext } from '../WorkflowExecutionService.js';

export class WorkspaceNodeExecutor extends BaseNodeExecutor {
  canHandle(node: WorkflowNode): boolean {
    return node.type === 'git' && node.action === 'workspace.init';
  }

  async execute(node: WorkflowNode, ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const { workItemsRepository } = await import('../../repositories/WorkItemsRepository.js');
    const workItem = await workItemsRepository.findById(ctx.workItemId);
    if (!workItem) {
      throw new Error(`WorkItem ${ctx.workItemId} not found`);
    }

    const project = await projectsRepository.findById(workItem.projectId);
    if (!project) {
      throw new Error(`Project ${workItem.projectId} not found`);
    }

    // Initialize workspace (stateless)
    const workspaceState = await workspaceService.initWorkspace(ctx.workItemId, project);

    // Update WorkItem state via event service
    await workItemEventService.updateWorkItemState(ctx.workItemId, workspaceState);

    // Store workspace state in outputs
    const outputs = new Map(ctx.outputs);
    outputs.set('workspace.worktreePath', workspaceState.worktreePath);
    outputs.set('workspace.headBranch', workspaceState.headBranch);
    outputs.set('workspace.baseBranch', workspaceState.baseBranch);
    outputs.set('workspace.baseSha', workspaceState.baseSha);
    outputs.set('workspace.headSha', workspaceState.headSha);
    outputs.set('workspace.status', workspaceState.workspaceStatus);

    return {
      status: 'succeeded',
      outputs,
      artifacts: ctx.artifacts,
    };
  }
}
