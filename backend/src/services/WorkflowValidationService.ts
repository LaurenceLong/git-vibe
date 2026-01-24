import type { Workflow, WorkflowNodeType } from 'git-vibe-shared';
import { WorkflowSchema } from 'git-vibe-shared';

export interface ValidationError {
  path: string;
  message: string;
}

export class WorkflowValidationService {
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

    errors.push(...this.validateBackbone(workflow));
    errors.push(...this.validateSlots(workflow));
    errors.push(...this.validateExtensions(workflow));
    errors.push(...this.validateExtensionsInSlots(workflow));

    return errors;
  }

  private validateBackbone(workflow: Workflow): ValidationError[] {
    const errors: ValidationError[] = [];
    const backbone = workflow.workflow.backbone;

    backbone.forEach((node) => {
      if (!node.id || !node.type) {
        errors.push({
          path: `workflow.backbone[${node.id}]`,
          message: 'Backbone node must have id and type',
        });
      }

      if (node.immutable && node.type === 'event') {
        if (!node.event) {
          errors.push({
            path: `workflow.backbone[${node.id}].event`,
            message: 'Event nodes must specify the event type',
          });
        }
      }

      if (node.immutable && node.session?.mode === 'reuse') {
        if (!node.session.from) {
          errors.push({
            path: `workflow.backbone[${node.id}].session.from`,
            message: 'Session reuse requires specifying the source node ID',
          });
        }

        const sourceNode = backbone.find((n) => n.id === node.session.from);
        if (!sourceNode?.session?.export) {
          errors.push({
            path: `workflow.backbone[${node.id}].session.from`,
            message: 'Session reuse source must export session (session.export: true)',
          });
        }
      }
    });

    return errors;
  }

  private validateSlots(workflow: Workflow): ValidationError[] {
    const errors: ValidationError[] = [];
    const slots = workflow.workflow.slots;
    const backbone = workflow.workflow.backbone;

    const backboneNodeIds = new Set(backbone.map((n) => n.id));

    slots.forEach((slot) => {
      if (!slot.id || !slot.after || !slot.before) {
        errors.push({
          path: `workflow.slots[${slot.id}]`,
          message: 'Slot must have id, after, and before properties',
        });
        return;
      }

      if (!backboneNodeIds.has(slot.after)) {
        errors.push({
          path: `workflow.slots[${slot.id}].after`,
          message: `Slot references non-existent backbone node: ${slot.after}`,
        });
      }

      if (!backboneNodeIds.has(slot.before)) {
        errors.push({
          path: `workflow.slots[${slot.id}].before`,
          message: `Slot references non-existent backbone node: ${slot.before}`,
        });
      }

      const backboneIndexAfter = backbone.findIndex((n) => n.id === slot.after);
      const backboneIndexBefore = backbone.findIndex((n) => n.id === slot.before);

      if (backboneIndexAfter >= backboneIndexBefore) {
        errors.push({
          path: `workflow.slots[${slot.id}]`,
          message: 'Slot "after" node must come before "before" node in backbone',
        });
      }

      if (backboneIndexBefore - backboneIndexAfter !== 1) {
        errors.push({
          path: `workflow.slots[${slot.id}]`,
          message: 'Slots can only be created between consecutive backbone nodes',
        });
      }
    });

    return errors;
  }

  private validateExtensions(workflow: Workflow): ValidationError[] {
    const errors: ValidationError[] = [];
    const extensions = workflow.workflow.extensions.nodes;
    const slots = workflow.workflow.slots;
    const slotIds = new Set(slots.map((s) => s.id));
    const backbone = workflow.workflow.backbone;
    const backboneNodeIds = new Set(backbone.map((n) => n.id));

    extensions.forEach((node) => {
      if (!node.id || !node.type) {
        errors.push({
          path: `workflow.extensions.nodes[${node.id}]`,
          message: 'Extension node must have id and type',
        });
      }

      if (!node.slot) {
        errors.push({
          path: `workflow.extensions.nodes[${node.id}].slot`,
          message: 'Extension node must specify which slot it belongs to',
        });
        return;
      }

      if (!slotIds.has(node.slot)) {
        errors.push({
          path: `workflow.extensions.nodes[${node.id}].slot`,
          message: `Extension references non-existent slot: ${node.slot}`,
        });
      }

      if (node.session?.mode === 'reuse' && node.session.from) {
        if (
          backboneNodeIds.has(node.session.from) ||
          extensions.some((e) => e.id === node.session.from)
        ) {
          const sourceNode =
            backbone.find((n) => n.id === node.session.from) ||
            extensions.find((e) => e.id === node.session.from);
          if (!sourceNode?.session?.export) {
            errors.push({
              path: `workflow.extensions.nodes[${node.id}].session.from`,
              message: 'Session reuse source must export session (session.export: true)',
            });
          }
        } else {
          errors.push({
            path: `workflow.extensions.nodes[${node.id}].session.from`,
            message: `Session reuse references non-existent node: ${node.session.from}`,
          });
        }
      }
    });

    return errors;
  }

  private validateExtensionsInSlots(workflow: Workflow): ValidationError[] {
    const errors: ValidationError[] = [];
    const extensions = workflow.workflow.extensions.nodes;
    const slots = workflow.workflow.slots;

    const slotTypesMap = new Map<string, WorkflowNodeType[]>();
    slots.forEach((slot) => {
      slotTypesMap.set(slot.id, slot.allowedNodeTypes);
    });

    extensions.forEach((node) => {
      const allowedTypes = slotTypesMap.get(node.slot);
      if (allowedTypes && !allowedTypes.includes(node.type)) {
        errors.push({
          path: `workflow.extensions.nodes[${node.id}].type`,
          message: `Node type '${node.type}' is not allowed in slot '${node.slot}'. Allowed types: ${allowedTypes.join(', ')}`,
        });
      }
    });

    return errors;
  }

  validateBackboneModification(
    originalWorkflow: Workflow,
    modifiedWorkflow: Workflow
  ): { allowed: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    const originalBackbone = originalWorkflow.workflow.backbone;
    const modifiedBackbone = modifiedWorkflow.workflow.backbone;

    if (originalBackbone.length !== modifiedBackbone.length) {
      errors.push({
        path: 'workflow.backbone',
        message: 'Cannot add or remove backbone nodes (only prompts/config can be modified)',
      });
      return { allowed: false, errors };
    }

    for (let i = 0; i < originalBackbone.length; i++) {
      const originalNode = originalBackbone[i];
      const modifiedNode = modifiedBackbone[i];

      if (originalNode.id !== modifiedNode.id) {
        errors.push({
          path: 'workflow.backbone',
          message: 'Cannot reorder backbone nodes (only prompts/config can be modified)',
        });
        return { allowed: false, errors };
      }

      if (originalNode.immutable && originalNode.type !== modifiedNode.type) {
        errors.push({
          path: `workflow.backbone[${modifiedNode.id}].type`,
          message: 'Cannot change node type for immutable backbone nodes',
        });
      }

      if (
        originalNode.immutable &&
        (modifiedNode.immutable === false || modifiedNode.immutable === undefined)
      ) {
        errors.push({
          path: `workflow.backbone[${modifiedNode.id}].immutable`,
          message: 'Cannot make immutable backbone nodes mutable',
        });
      }
    }

    return { allowed: errors.length === 0, errors };
  }

  validateSlotInsertion(workflow: Workflow, _nodeId: string, slotId: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const slot = workflow.workflow.slots.find((s) => s.id === slotId);

    if (!slot) {
      errors.push({
        path: 'workflow.extensions',
        message: `Slot '${slotId}' not found`,
      });
      return errors;
    }

    if (!slot.allowInsert) {
      errors.push({
        path: `workflow.slots[${slotId}]`,
        message: 'This slot does not allow insertions',
      });
    }

    return errors;
  }
}

export const workflowValidationService = new WorkflowValidationService();
