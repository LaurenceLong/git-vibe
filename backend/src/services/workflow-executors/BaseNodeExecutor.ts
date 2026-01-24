/**
 * Base interface and class for workflow node executors
 */

import type { WorkflowNode, StepStatus } from 'git-vibe-shared';
import type { ExecutionContext } from '../WorkflowExecutionService.js';

export interface NodeExecutionResult {
  status: StepStatus;
  outputs: Map<string, unknown>;
  artifacts: unknown[];
}

/**
 * Base interface for node executors
 */
export interface NodeExecutor {
  /**
   * Execute a workflow node
   */
  execute(node: WorkflowNode, ctx: ExecutionContext): Promise<NodeExecutionResult>;

  /**
   * Check if this executor can handle the given node type
   */
  canHandle(node: WorkflowNode): boolean;
}

/**
 * Base class for node executors
 * Provides default implementation that can be extended
 */
export abstract class BaseNodeExecutor implements NodeExecutor {
  /**
   * Execute a workflow node (must be implemented by subclasses)
   */
  abstract execute(node: WorkflowNode, ctx: ExecutionContext): Promise<NodeExecutionResult>;

  /**
   * Check if this executor can handle the given node type (must be implemented by subclasses)
   */
  abstract canHandle(node: WorkflowNode): boolean;
}
