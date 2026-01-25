/**
 * WorkflowValidationService - Validates workflow definitions
 *
 * Updated for optimized workflow design:
 * - Removes validation for completeWhen, locks, type fields
 * - Adds validation for trigger.call.resourceType (7 allowed types only)
 * - Adds validation for trigger.call.input
 * - Adds validation for onResult[].patch
 */

import type { Workflow } from 'git-vibe-shared';
import { WorkflowSchema } from 'git-vibe-shared';

export interface ValidationError {
  path: string;
  message: string;
}

export class WorkflowValidationService {
  // 7 allowed resource types in optimized design
  private readonly ALLOWED_RESOURCE_TYPES = [
    'WorkItem',
    'Worktree',
    'Task',
    'AgentRun',
    'PullRequest',
    'GitOps',
    'CommandExec',
  ] as const;

  validateWorkflow(workflow: unknown): { valid: boolean; errors: ValidationError[] } {
    const result = WorkflowSchema.safeParse(workflow);

    if (!result.success) {
      return {
        valid: false,
        errors: result.error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        })),
      };
    }

    const businessLogicErrors = this.validateBusinessLogic(result.data);

    if (businessLogicErrors.length > 0) {
      return {
        valid: false,
        errors: businessLogicErrors,
      };
    }

    return {
      valid: true,
      errors: [],
    };
  }

  private validateBusinessLogic(workflow: Workflow): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate backbone nodes
    const backbone = workflow.workflow.backbone.nodes;
    backbone.forEach((node) => {
      // Validate NodeSpec structure
      if (!node.id) {
        errors.push({
          path: `workflow.backbone.nodes[${node.id}]`,
          message: 'Backbone node must have id',
        });
      }

      if (!node.subject) {
        errors.push({
          path: `workflow.backbone.nodes[${node.id}].subject`,
          message: 'Node must have subject field',
        });
      }

      if (!node.listens || node.listens.length === 0) {
        errors.push({
          path: `workflow.backbone.nodes[${node.id}].listens`,
          message: 'Node must have at least one listen rule',
        });
      }

      if (!node.trigger) {
        errors.push({
          path: `workflow.backbone.nodes[${node.id}].trigger`,
          message: 'Node must have trigger field',
        });
      }

      // Validate trigger.call.resourceType (must be one of 7 allowed types)
      if (
        node.trigger?.call?.resourceType &&
        !this.ALLOWED_RESOURCE_TYPES.includes(node.trigger.call.resourceType)
      ) {
        errors.push({
          path: `workflow.backbone.nodes[${node.id}].trigger.call.resourceType`,
          message: `Invalid resource type "${node.trigger.call.resourceType}". Must be one of: ${this.ALLOWED_RESOURCE_TYPES.join(', ')}`,
        });
      }

      // Validate trigger.call.input (must be present)
      if (node.trigger?.call && !node.trigger.call.input) {
        errors.push({
          path: `workflow.backbone.nodes[${node.id}].trigger.call.input`,
          message: 'Node trigger.call must have input field',
        });
      }

      if (!node.onResult || node.onResult.length === 0) {
        errors.push({
          path: `workflow.backbone.nodes[${node.id}].onResult`,
          message: 'Node must have at least one onResult rule',
        });
      }

      // Validate onResult[].patch (must be valid per resource type)
      if (node.onResult) {
        node.onResult.forEach((onResult, index) => {
          if (!onResult.patch) {
            errors.push({
              path: `workflow.backbone.nodes[${node.id}].onResult[${index}].patch`,
              message: `onResult rule at index ${index} must have patch field`,
            });
          }

          // Validate patch structure (must have resource kind keys)
          if (onResult.patch) {
            const validResourceKinds = ['workitem', 'task', 'pr_request', 'worktree', 'agent_run'];
            for (const resourceKind of Object.keys(onResult.patch)) {
              if (!validResourceKinds.includes(resourceKind)) {
                errors.push({
                  path: `workflow.backbone.nodes[${node.id}].onResult[${index}].patch.${resourceKind}`,
                  message: `Invalid resource kind "${resourceKind}" in patch. Must be one of: ${validResourceKinds.join(', ')}`,
                });
              }
            }
          }
        });
      }
    });

    // Validate extensions nodes
    const extensions = workflow.workflow.extensions.nodes;

    extensions.forEach((node) => {
      if (!node.id) {
        errors.push({
          path: `workflow.extensions.nodes[${node.id}]`,
          message: 'Extension node must have id',
        });
      }

      if (!node.subject) {
        errors.push({
          path: `workflow.extensions.nodes[${node.id}].subject`,
          message: 'Extension node must have subject field',
        });
      }

      if (!node.listens || node.listens.length === 0) {
        errors.push({
          path: `workflow.extensions.nodes[${node.id}].listens`,
          message: 'Extension node must have at least one listen rule',
        });
      }

      if (!node.trigger) {
        errors.push({
          path: `workflow.extensions.nodes[${node.id}].trigger`,
          message: 'Extension node must have trigger field',
        });
      }

      // Validate trigger.call.resourceType (must be one of 7 allowed types)
      if (
        node.trigger?.call?.resourceType &&
        !this.ALLOWED_RESOURCE_TYPES.includes(node.trigger.call.resourceType)
      ) {
        errors.push({
          path: `workflow.extensions.nodes[${node.id}].trigger.call.resourceType`,
          message: `Invalid resource type "${node.trigger.call.resourceType}". Must be one of: ${this.ALLOWED_RESOURCE_TYPES.join(', ')}`,
        });
      }

      // Validate trigger.call.input (must be present)
      if (node.trigger?.call && !node.trigger.call.input) {
        errors.push({
          path: `workflow.extensions.nodes[${node.id}].trigger.call.input`,
          message: 'Extension node trigger.call must have input field',
        });
      }

      if (!node.onResult || node.onResult.length === 0) {
        errors.push({
          path: `workflow.extensions.nodes[${node.id}].onResult`,
          message: 'Extension node must have at least one onResult rule',
        });
      }

      // Validate onResult[].patch (must be valid per resource type)
      if (node.onResult) {
        node.onResult.forEach((onResult, index) => {
          if (!onResult.patch) {
            errors.push({
              path: `workflow.extensions.nodes[${node.id}].onResult[${index}].patch`,
              message: `onResult rule at index ${index} must have patch field`,
            });
          }

          // Validate patch structure (must have resource kind keys)
          if (onResult.patch) {
            const validResourceKinds = ['workitem', 'task', 'pr_request', 'worktree', 'agent_run'];
            for (const resourceKind of Object.keys(onResult.patch)) {
              if (!validResourceKinds.includes(resourceKind)) {
                errors.push({
                  path: `workflow.extensions.nodes[${node.id}].onResult[${index}].patch.${resourceKind}`,
                  message: `Invalid resource kind "${resourceKind}" in patch. Must be one of: ${validResourceKinds.join(', ')}`,
                });
              }
            }
          }
        });
      }
    });

    return errors;
  }

  /**
   * Validate backbone modifications
   * Ensures immutable nodes in backbone are not modified
   */
  validateBackboneModification(
    existingWorkflow: Workflow,
    newWorkflow: Workflow
  ): { allowed: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    const existingBackbone = existingWorkflow.workflow.backbone;
    const newBackbone = newWorkflow.workflow.backbone;

    // Check if backbone nodes count matches
    if (existingBackbone.nodes.length !== newBackbone.nodes.length) {
      errors.push({
        path: 'workflow.backbone.nodes',
        message: 'Cannot change the number of backbone nodes',
      });
    }

    // Check each backbone node
    for (const newNode of newBackbone.nodes) {
      const existingNode = existingBackbone.nodes.find((n) => n.id === newNode.id);
      if (!existingNode) {
        errors.push({
          path: `workflow.backbone.nodes[${newNode.id}]`,
          message: `Cannot add new backbone node ${newNode.id}`,
        });
        continue;
      }

      // Check if trigger is changed (backbone nodes should not have their triggers changed)
      // Compare trigger structure to detect changes
      if (JSON.stringify(existingNode.trigger) !== JSON.stringify(newNode.trigger)) {
        errors.push({
          path: `workflow.backbone.nodes[${newNode.id}].trigger`,
          message: 'Cannot change trigger of backbone node',
        });
      }
    }

    return {
      allowed: errors.length === 0,
      errors,
    };
  }
}

export const workflowValidationService = new WorkflowValidationService();
