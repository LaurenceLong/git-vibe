/**
 * AgentNodeExecutor - Handles agent execution nodes
 */

import type { WorkflowNode } from 'git-vibe-shared';
import { agentService } from '../AgentService.js';
import { workflowEventBus } from '../WorkflowEventBus.js';
import { agentRunsRepository } from '../../repositories/AgentRunsRepository.js';
import { BaseNodeExecutor, type NodeExecutionResult } from './BaseNodeExecutor.js';
import type { ExecutionContext } from '../WorkflowExecutionService.js';

export class AgentNodeExecutor extends BaseNodeExecutor {
  canHandle(node: WorkflowNode): boolean {
    return node.type === 'agent';
  }

  async execute(node: WorkflowNode, ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const { workItemsRepository } = await import('../../repositories/WorkItemsRepository.js');
    const { workspaceService } = await import('../WorkspaceService.js');
    const { projectsRepository } = await import('../../repositories/ProjectsRepository.js');
    const { workItemEventService } = await import('../WorkItemEventService.js');

    let workItem = await workItemsRepository.findById(ctx.workItemId);
    if (!workItem) {
      throw new Error(`WorkItem ${ctx.workItemId} not found`);
    }

    const project = await projectsRepository.findById(workItem.projectId);
    if (!project) {
      throw new Error(`Project ${workItem.projectId} not found`);
    }

    // Implicit workspace initialization: ensure workspace is ready before agent execution
    if (!workItem.worktreePath || workItem.workspaceStatus !== 'ready') {
      console.log(
        `[AgentNodeExecutor] Workspace not ready for workItem ${ctx.workItemId}, initializing...`
      );
      const workspaceState = await workspaceService.ensureWorkspace(workItem, project);
      console.log(`[AgentNodeExecutor] Workspace initialized: ${workspaceState.worktreePath}`);
      // Update WorkItem state via event service (which emits events)
      await workItemEventService.updateWorkItemState(ctx.workItemId, workspaceState);
      // Refresh workItem to get updated state
      const refreshedWorkItem = await workItemsRepository.findById(ctx.workItemId);
      if (!refreshedWorkItem) {
        throw new Error(`WorkItem ${ctx.workItemId} not found after workspace initialization`);
      }
      workItem = refreshedWorkItem;
      // Update outputs with workspace state
      ctx.outputs.set('workspace.worktreePath', workspaceState.worktreePath);
      ctx.outputs.set('workspace.headBranch', workspaceState.headBranch);
      ctx.outputs.set('workspace.baseBranch', workspaceState.baseBranch);
      ctx.outputs.set('workspace.baseSha', workspaceState.baseSha);
      ctx.outputs.set('workspace.headSha', workspaceState.headSha);
      ctx.outputs.set('workspace.status', workspaceState.workspaceStatus);
    } else {
      console.log(`[AgentNodeExecutor] Workspace already ready for workItem ${ctx.workItemId}`);
    }

    // Build prompt from node configuration
    const prompt = await this.buildPrompt(node, workItem, ctx);

    // Parse agent params
    const agentParams = this.parseAgentParams(project);

    // Determine session ID
    let sessionId: string | undefined = ctx.sessionId;

    // For workitem.task.resume event, use sessionId from event data
    if (ctx.eventData?.sessionId && typeof ctx.eventData.sessionId === 'string') {
      sessionId = ctx.eventData.sessionId;
      console.log(`[AgentNodeExecutor] Using sessionId from event data: ${sessionId}`);
    } else if (node.session?.mode === 'reuse' && node.session.from) {
      // Get session ID from previous node
      sessionId = await this.getSessionIdFromNode(node.session.from, ctx);
    }
    // Do not create fake sessionId - adapter will handle session persistence
    // If no sessionId is provided, it will be set to null and adapter will persist actual session when available

    // Start agent run (stateless)
    if (!workItem.worktreePath) {
      throw new Error(`Worktree path not available for workItem ${ctx.workItemId}`);
    }
    const agentRun = await agentService.startAgentRun(
      ctx.workItemId,
      project,
      workItem.worktreePath,
      prompt,
      agentParams,
      { sessionId }
    );

    // Emit agent.started event
    await workflowEventBus.emit({
      type: 'agent.started',
      workItemId: ctx.workItemId,
      workflowRunId: ctx.runId,
      nodeId: node.id,
      data: { agentRunId: agentRun.id },
    });

    // Wait for agent run to complete
    const completedRun = await this.waitForAgentRunCompletion(agentRun.id);

    // Emit agent.completed event
    await workflowEventBus.emit({
      type: 'agent.completed',
      workItemId: ctx.workItemId,
      workflowRunId: ctx.runId,
      nodeId: node.id,
      data: {
        agentRunId: completedRun.id,
        status: completedRun.status,
        commitSha: completedRun.commitSha,
      },
    });

    // Store outputs
    const outputs = new Map(ctx.outputs);
    outputs.set('agent.runId', completedRun.id);
    outputs.set('agent.status', completedRun.status);
    // Store the prompt for next nodes to use as context
    outputs.set('agent.previousPrompt', prompt);
    if (completedRun.commitSha) {
      outputs.set('agent.commitSha', completedRun.commitSha);
    }
    if (completedRun.headShaAfter) {
      outputs.set('agent.headShaAfter', completedRun.headShaAfter);
    }

    // Export session ID if this node is configured to export sessions (standardize on session.id)
    if (completedRun.status === 'succeeded' && node.session?.export && completedRun.sessionId) {
      outputs.set('session.id', completedRun.sessionId);
      // Also set agent.session for backward compatibility
      outputs.set('agent.session', completedRun.sessionId);
    }

    return {
      status: completedRun.status === 'succeeded' ? 'succeeded' : 'failed',
      outputs,
      artifacts: ctx.artifacts,
    };
  }

  private async getPreviousNodeContext(ctx: ExecutionContext): Promise<string> {
    const { workflowsRepository } = await import('../../repositories/WorkflowsRepository.js');
    const steps = await workflowsRepository.findStepExecutionsByRunId(ctx.runId);

    // Find the most recent succeeded agent node step
    const agentSteps = steps
      .filter((s) => s.status === 'succeeded')
      .sort((a, b) => {
        const aTime = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
        const bTime = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
        return bTime - aTime;
      });

    // Get the workflow to find node types
    const workflowRecord = await workflowsRepository.findById(ctx.workflow.workflow.id);
    if (!workflowRecord) {
      return '';
    }

    const workflow: any =
      typeof workflowRecord.definition === 'string'
        ? JSON.parse(workflowRecord.definition)
        : workflowRecord.definition;

    // Find the most recent agent node
    for (const step of agentSteps) {
      const allNodes = [
        ...(workflow.workflow.backbone || []),
        ...(workflow.workflow.control?.extraNodes || []),
        ...(workflow.workflow.extensions?.nodes || []),
      ];
      const stepNode = allNodes.find((n: any) => n.id === step.nodeId);
      if (stepNode && stepNode.type === 'agent') {
        // Get the prompt content from step outputs
        const outputs = typeof step.outputs === 'string' ? JSON.parse(step.outputs) : step.outputs;
        return outputs['agent.prompt'] || '';
      }
    }

    return '';
  }

  private async buildPrompt(
    node: WorkflowNode,
    workItem: any,
    ctx: ExecutionContext
  ): Promise<string> {
    const useWorkitemContext = node.input?.useWorkitemContext ?? true;

    // Helper function to escape regex special characters
    const escapeRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Helper function to substitute variable in prompt
    const substitute = (pattern: string, replacement: string, target: string): string => {
      return target.replace(new RegExp(escapeRegex(pattern), 'g'), replacement);
    };

    // Get the templates from workflow
    const templates = ctx.workflow?.workflow?.prompts?.templates || {};

    // Get previous node context
    const previousContext = await this.getPreviousNodeContext(ctx);

    // If node has an explicit prompt, use it as the base (may contain template references)
    let prompt = node.prompt || '';

    // If node.prompt is empty, fall back to heuristic-based template selection (backward compatibility)
    if (!prompt) {
      // Determine if this is a commit node (check node id or action)
      const isCommitNode = node.id === 'commit_changes' || node.action === 'commit';

      // Determine which template to use
      let templateKey: string;
      if (isCommitNode) {
        templateKey = 'agent_prompt_commit';
      } else if (!previousContext) {
        templateKey = 'agent_prompt_initial';
      } else {
        templateKey = 'agent_prompt_subsequent';
      }

      // Get the template from workflow
      prompt = templates[templateKey] || '';

      // If template not found, fall back to default format
      if (!prompt) {
        if (isCommitNode) {
          prompt =
            '# Complete the task below:\n## Type: Commit Request\n## Title: Commit necessary changes for: {{workitem.title}}\n## Description: {{node.prompt}}\n## Context: {{agent.previousContext}}';
        } else if (!previousContext) {
          prompt =
            '# Complete the task below:\n## Type: {{workitem.type}}\n## Title: {{workitem.title}}\n## Description: {{workitem.description}}\n## Context: ';
        } else {
          prompt =
            '# Complete the task below:\n## Type: Task\n## Title: {{workitem.title}}\n## Description: {{node.prompt}}\n## Context: {{agent.previousContext}}';
        }
      }
    }

    // Prepare variable values for substitution
    const workItemType =
      workItem.type === 'issue'
        ? 'Issue'
        : workItem.type === 'feature-request'
          ? 'Feature Request'
          : 'Task';

    const workItemTitle = workItem.title || '';
    const workItemDescription = useWorkitemContext ? workItem.body?.trim() || '' : '';
    const nodePrompt = node.prompt || '';

    // Step 1: Resolve template references (e.g., {{templates.agent_prompt_initial}})
    for (const [key, value] of Object.entries(templates)) {
      prompt = substitute(`{{templates.${key}}}`, String(value), prompt);
    }

    // Step 2: Substitute workitem variables
    prompt = substitute('{{workitem.type}}', workItemType, prompt);
    prompt = substitute('{{workitem.title}}', workItemTitle, prompt);
    prompt = substitute('{{workitem.description}}', workItemDescription, prompt);

    // Step 3: Substitute node variables
    prompt = substitute('{{node.prompt}}', nodePrompt, prompt);

    // Step 4: Substitute agent context variables
    prompt = substitute('{{agent.previousContext}}', previousContext || '', prompt);

    // Step 5: Process node.input.extra variables
    const extraVars = new Map<string, string>();
    if (node.input?.extra) {
      for (const [key, value] of Object.entries(node.input.extra)) {
        extraVars.set(key, String(value));
      }
    }

    // Step 6: Replace context variables from outputs
    for (const [key, value] of ctx.outputs.entries()) {
      prompt = substitute(`{{${key}}}`, String(value), prompt);
    }

    // Step 7: Replace extra variables (after outputs so extra var values can reference output variables)
    for (const [key, value] of extraVars.entries()) {
      // Resolve output references in the extra var value
      let resolvedValue = value;
      for (const [outputKey, outputValue] of ctx.outputs.entries()) {
        resolvedValue = resolvedValue.replace(
          new RegExp(escapeRegex(`{{${outputKey}}}`), 'g'),
          String(outputValue)
        );
      }
      // Substitute the extra var key in the prompt
      prompt = substitute(`{{${key}}}`, resolvedValue, prompt);
    }

    // Step 8: Handle event-specific data
    // For workitem.task.start: add userMessage if provided
    if (ctx.eventData?.userMessage && typeof ctx.eventData.userMessage === 'string') {
      const userMessage = ctx.eventData.userMessage.trim();
      if (userMessage) {
        prompt += `\n\n## User Message\n\n${userMessage}`;
        console.log(`[AgentNodeExecutor] Added userMessage from event data to prompt`);
      }
    }

    // For workitem.task.resume: add resume instructions if provided
    if (ctx.eventData?.prompt && typeof ctx.eventData.prompt === 'string') {
      const resumePrompt = ctx.eventData.prompt.trim();
      if (resumePrompt) {
        prompt += `\n\n## Resume Instructions\n\n${resumePrompt}`;
        console.log(`[AgentNodeExecutor] Added resume instructions from event data to prompt`);
      }
    }

    return prompt;
  }

  private parseAgentParams(project: any): any {
    try {
      return project.agentParams ? JSON.parse(project.agentParams) : {};
    } catch {
      return {};
    }
  }

  private async getSessionIdFromNode(
    nodeId: string,
    ctx: ExecutionContext
  ): Promise<string | undefined> {
    const { workflowsRepository } = await import('../../repositories/WorkflowsRepository.js');
    const steps = await workflowsRepository.findStepExecutionsByRunId(ctx.runId);
    const step = steps.find((s) => s.nodeId === nodeId && s.status === 'succeeded');
    if (!step || !step.outputs) {
      return undefined;
    }
    const outputs = typeof step.outputs === 'string' ? JSON.parse(step.outputs) : step.outputs;
    // Standardize on session.id key (as per design spec)
    return outputs['session.id'] || outputs['agent.session'] || outputs['agent.runId'];
  }

  private async waitForAgentRunCompletion(agentRunId: string): Promise<any> {
    // Poll until agent run completes
    const maxWaitTime = 3600000; // 1 hour
    const pollInterval = 2000; // 2 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const agentRun = await agentRunsRepository.findById(agentRunId);
      if (!agentRun) {
        throw new Error(`Agent run ${agentRunId} not found`);
      }

      if (
        agentRun.status === 'succeeded' ||
        agentRun.status === 'failed' ||
        agentRun.status === 'cancelled'
      ) {
        return agentRun;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Agent run ${agentRunId} did not complete within timeout`);
  }
}
