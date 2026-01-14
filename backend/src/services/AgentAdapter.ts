/**
 * Abstract base class for Code Agent Adapters
 * All code agent implementations should extend this class
 */

export type AgentModel = {
  id: string;
  name: string;
  provider?: string;
};

export type AgentRunParams = {
  worktreePath: string;
  agentRunId: string;
  prompt: string;
  config: {
    executablePath: string;
    baseArgs?: string[];
  };
};

export type AgentCorrectionParams = {
  worktreePath: string;
  agentRunId: string;
  sessionId: string;
  reviewComments: string;
  config: {
    executablePath: string;
    baseArgs?: string[];
  };
};

export abstract class AgentAdapter {
  /**
   * Validate that the agent executable is available
   */
  abstract validate(config: { executablePath: string }): Promise<boolean>;

  /**
   * Run the agent with the given parameters
   */
  abstract run(params: AgentRunParams): Promise<{ runId: string; sessionId?: string }>;

  /**
   * Correct using review comments
   */
  abstract correctWithReviewComments(params: AgentCorrectionParams): Promise<{ runId: string }>;

  /**
   * Get available models for this agent
   */
  abstract getModels(): Promise<AgentModel[]>;

  /**
   * Cancel a running agent run
   */
  abstract cancel(runId: string): Promise<void>;

  /**
   * Get the status of an agent run
   */
  abstract getStatus(
    runId: string
  ): Promise<{ status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' }>;
}
