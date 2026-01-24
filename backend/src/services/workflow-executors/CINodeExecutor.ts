/**
 * CINodeExecutor - Handles CI check execution
 */

import type { WorkflowNode, StepStatus, WorkflowPolicy } from 'git-vibe-shared';
import { workflowEventBus } from '../WorkflowEventBus.js';
import { projectsRepository } from '../../repositories/ProjectsRepository.js';
import { BaseNodeExecutor, type NodeExecutionResult } from './BaseNodeExecutor.js';
import type { ExecutionContext } from '../WorkflowExecutionService.js';

export class CINodeExecutor extends BaseNodeExecutor {
  canHandle(node: WorkflowNode): boolean {
    return node.type === 'ci';
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
    const action = node.action || 'ci.run';

    if (action === 'ci.run') {
      return await this.executeCIChecks(node, ctx, workItem, project, outputs);
    } else if (action === 'ci.check') {
      return await this.checkCIStatus(node, ctx, workItem, project, outputs);
    } else {
      throw new Error(`Unknown CI action: ${action}`);
    }
  }

  private async executeCIChecks(
    node: WorkflowNode,
    ctx: ExecutionContext,
    workItem: any,
    project: any,
    outputs: Map<string, unknown>
  ): Promise<NodeExecutionResult> {
    const worktreePath = workItem.worktreePath!;

    // Get CI checks to run from node configuration or policy
    const checks = this.getCIChecks(node, ctx);

    const results: Record<string, { status: 'passed' | 'failed' | 'skipped'; output?: string }> =
      {};

    // Run each check
    for (const check of checks) {
      try {
        const result = await this.runCheck(check, worktreePath, node);
        results[check] = result;
      } catch (error) {
        results[check] = {
          status: 'failed',
          output: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // Determine overall status
    const allPassed = Object.values(results).every((r) => r.status === 'passed');
    const anyFailed = Object.values(results).some((r) => r.status === 'failed');

    const status: StepStatus = allPassed ? 'succeeded' : anyFailed ? 'failed' : 'succeeded';

    outputs.set('ci.checks', results);
    outputs.set('ci.allPassed', allPassed);
    outputs.set('ci.requiredChecksGreen', allPassed);

    // Emit CI workflow node event
    await workflowEventBus.emit({
      type: 'ci.checks.completed',
      workItemId: ctx.workItemId,
      workflowRunId: ctx.runId,
      nodeId: node.id,
      data: { results, allPassed },
    });

    // Also emit external event when checks pass (for sync/reconciliation)
    if (allPassed) {
      await workflowEventBus.emit({
        type: 'ci.checks.passed',
        workItemId: ctx.workItemId,
        data: { results },
      });
    }

    return {
      status,
      outputs,
      artifacts: ctx.artifacts,
    };
  }

  private async checkCIStatus(
    node: WorkflowNode,
    ctx: ExecutionContext,
    workItem: any,
    project: any,
    outputs: Map<string, unknown>
  ): Promise<NodeExecutionResult> {
    // Check external CI status (e.g., GitHub Actions, CircleCI)
    // For now, this is a placeholder that checks if required checks are green
    // In a real implementation, this would poll external CI systems

    const requiredChecks = this.getRequiredChecks(node, ctx);
    const allPassed = true; // Placeholder: would check external CI status

    outputs.set('ci.requiredChecksGreen', allPassed);
    outputs.set('ci.checks', {});

    return {
      status: allPassed ? 'succeeded' : 'failed',
      outputs,
      artifacts: ctx.artifacts,
    };
  }

  private getCIChecks(node: WorkflowNode, ctx: ExecutionContext): string[] {
    // Get checks from node.with or use defaults
    if (node.with?.checks) {
      return Array.isArray(node.with.checks) ? (node.with.checks as string[]) : [];
    }

    // Default checks: lint and unit-tests
    return ['lint', 'unit-tests'];
  }

  private getRequiredChecks(node: WorkflowNode, ctx: ExecutionContext): string[] {
    // Get required checks from node.with or use defaults
    if (node.with?.requiredChecks) {
      return Array.isArray(node.with.requiredChecks) ? (node.with.requiredChecks as string[]) : [];
    }

    return ['lint', 'unit-tests'];
  }

  private async runCheck(
    checkName: string,
    worktreePath: string,
    node: WorkflowNode
  ): Promise<{ status: 'passed' | 'failed' | 'skipped'; output?: string }> {
    const { execSync } = await import('node:child_process');

    // Map check names to commands
    const checkCommands: Record<string, string> = {
      lint: 'npm run lint',
      'unit-tests': 'npm test',
      build: 'npm run build',
    };

    const command = checkCommands[checkName] || checkName;

    try {
      const output = execSync(command, {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 300000, // 5 minute timeout
      });

      return {
        status: 'passed',
        output: output.toString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        status: 'failed',
        output: errorMessage,
      };
    }
  }
}
