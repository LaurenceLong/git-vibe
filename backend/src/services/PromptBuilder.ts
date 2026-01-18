/**
 * PromptBuilder
 *
 * Centralized class for building agent prompts with consistent markdown formatting.
 * Handles different prompt types: task execution, conversation messages, and resume tasks.
 */

export interface PromptParts {
  task?: string;
  description?: string;
  userMessage?: string;
  resumeWith?: string;
}

/**
 * PromptBuilder class for constructing agent prompts
 */
export class PromptBuilder {
  /**
   * Build a prompt for task execution from work item
   */
  static buildTaskPrompt(taskTitle: string, description?: string): string {
    if (!description || !description.trim()) {
      return `## Task\n\n${taskTitle}`;
    }
    return `## Task\n\n${taskTitle}\n\n## Description\n\n${description.trim()}`;
  }

  /**
   * Build a prompt for conversation messages (user ↔ agent)
   */
  static buildConversationPrompt(userMessage: string): string {
    return `## User Message\n\n${userMessage.trim()}`;
  }

  /**
   * Build a prompt for resuming a task
   */
  static buildResumePrompt(
    originalPrompt: string,
    resumeInstructions: string,
    workItemTitle: string
  ): string {
    const parts = this.parsePrompt(originalPrompt, workItemTitle);

    let prompt = '';
    if (parts.task) {
      prompt += `## Task\n\n${parts.task}`;
    }
    if (parts.description) {
      prompt += prompt ? '\n\n## Description\n\n' : '';
      prompt += parts.description;
    }
    if (parts.userMessage) {
      prompt += prompt ? '\n\n## User Message\n\n' : '';
      prompt += parts.userMessage;
    }

    // Always add resume instructions
    prompt += prompt ? '\n\n## Resume Instructions\n\n' : '## Resume Instructions\n\n';
    prompt += resumeInstructions.trim();

    return prompt;
  }

  /**
   * Parse an existing prompt to extract its parts (markdown format only)
   */
  private static parsePrompt(originalPrompt: string, fallbackTitle: string): PromptParts {
    const parts: PromptParts = {};

    if (!originalPrompt || !originalPrompt.trim()) {
      parts.task = fallbackTitle;
      return parts;
    }

    // Parse markdown format: ## Task\n\n...\n\n## Description\n\n...\n\n## User Message\n\n...\n\n## Resume Instructions\n\n...
    const markdownTaskMatch = originalPrompt.match(/^##\s+Task\s*\n\n(.+?)(?:\n\n##\s+Description\s*\n\n(.+?))?(?:\n\n##\s+User\s+Message\s*\n\n(.+?))?(?:\n\n##\s+Resume\s+Instructions\s*\n\n(.+?))?$/s);
    if (markdownTaskMatch) {
      parts.task = markdownTaskMatch[1]?.trim();
      parts.description = markdownTaskMatch[2]?.trim();
      parts.userMessage = markdownTaskMatch[3]?.trim();
      return parts;
    }

    // Try to parse markdown "## User Message" format
    const userMessageMatch = originalPrompt.match(/^##\s+User\s+Message\s*\n\n(.+)$/s);
    if (userMessageMatch) {
      parts.task = fallbackTitle;
      parts.userMessage = userMessageMatch[1]?.trim();
      return parts;
    }

    // Fallback: treat entire prompt as description
    parts.task = fallbackTitle;
    parts.description = originalPrompt.trim();
    return parts;
  }

  /**
   * Extract task title from a prompt
   */
  static extractTaskTitle(prompt: string, fallbackTitle: string): string {
    const parts = this.parsePrompt(prompt, fallbackTitle);
    return parts.task || fallbackTitle;
  }

  /**
   * Extract description from a prompt
   */
  static extractDescription(prompt: string): string | undefined {
    const parts = this.parsePrompt(prompt, '');
    return parts.description || parts.userMessage;
  }
}
