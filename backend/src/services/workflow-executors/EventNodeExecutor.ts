/**
 * EventNodeExecutor - Handles event nodes (no-ops that mark events)
 */

import type { WorkflowNode, StepStatus } from 'git-vibe-shared';
import { workflowEventBus } from '../WorkflowEventBus.js';
import { BaseNodeExecutor, type NodeExecutionResult } from './BaseNodeExecutor.js';
import type { ExecutionContext } from '../WorkflowExecutionService.js';

export class EventNodeExecutor extends BaseNodeExecutor {
  canHandle(node: WorkflowNode): boolean {
    return node.type === 'event';
  }

  async execute(node: WorkflowNode, ctx: ExecutionContext): Promise<NodeExecutionResult> {
    // Event nodes are typically no-ops that just mark the event as occurred
    // They may have outputs defined in the node configuration
    const outputs = new Map(ctx.outputs);

    // If node has outputs.setWorkItemState, prepare it for state sync
    if (node.outputs) {
      // Store any outputs defined in the node
      // These will be processed by state sync logic
    }

    return {
      status: 'succeeded',
      outputs,
      artifacts: ctx.artifacts,
    };
  }
}
