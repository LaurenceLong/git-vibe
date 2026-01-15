import {
  AgentAdapter,
  type AgentModel,
  type AgentRunParams,
  type AgentCorrectionParams,
} from './AgentAdapter.js';

interface OpenCodeSession {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  model?: string;
  agent?: string;
  project?: string;
  [key: string]: unknown;
}

interface OpenCodeAgentRunParams extends AgentRunParams {
  config: {
    executablePath: string;
    baseArgs?: string[];
    model?: string;
    agent?: string;
  };
}

interface OpenCodeAgentCorrectionParams extends AgentCorrectionParams {
  config: {
    executablePath: string;
    baseArgs?: string[];
  };
}

export class OpenCodeAgentAdapter extends AgentAdapter<OpenCodeSession> {
  async validate(config: { executablePath: string }): Promise<boolean> {
    try {
      const { promises: fs } = await import('node:fs');
      await fs.access(config.executablePath, fs.constants.X_OK);
      return true;
    } catch {
      throw new Error(`OpenCode executable not found or not executable: ${config.executablePath}`);
    }
  }

  async getModels(): Promise<AgentModel[]> {
    try {
      const { stdout } = this.execCommand('opencode models');
      return this.parseModelsFromOutput(stdout);
    } catch (error) {
      console.error('Failed to fetch OpenCode models:', error);
      return [];
    }
  }

  async run(params: OpenCodeAgentRunParams): Promise<{ runId: string; sessionId?: string }> {
    const { worktreePath, agentRunId, prompt, config } = params;

    const runId = agentRunId;
    const logFile = await this.createLogFile(runId);
    const { logBuffer, append } = this.createOutputHandler(logFile);

    // Build args for opencode run command
    const args = this.buildCommandArgs('run', {
      model: config.model,
      agent: config.agent,
    });

    if (config.baseArgs) {
      args.push(...config.baseArgs);
    }

    // Add the prompt
    args.push(prompt);

    const child = this.spawnProcess(config.executablePath, args, { cwd: worktreePath });

    child.stdout?.on('data', append);
    child.stderr?.on('data', append);

    child.on('close', async (code) => {
      await this.handleProcessClose(runId, worktreePath, code, logBuffer, logFile, async () => {
        // List sessions and save the latest one
        try {
          const sessions = await this.listSessions(worktreePath);
          if (sessions.length > 0) {
            const latestSession = sessions[0]; // Most recent session
            this.cacheSession(runId, latestSession);
            await this.saveSessionToDatabase(runId, latestSession);
          }
        } catch (error) {
          console.error('Failed to list sessions:', error);
        }
      });
    });

    this.activeProcesses.set(runId, child);
    return { runId };
  }

  async correctWithReviewComments(
    params: OpenCodeAgentCorrectionParams
  ): Promise<{ runId: string }> {
    const { worktreePath, agentRunId, sessionId, reviewComments, config } = params;

    const runId = agentRunId;
    const logFile = await this.createLogFile(runId);
    const { logBuffer, append } = this.createOutputHandler(logFile);

    // Build args for opencode run with session continuation
    const args = this.buildCommandArgs('run', {
      session: sessionId,
    });

    if (config.baseArgs) {
      args.push(...config.baseArgs);
    }

    // Add the review comments as the prompt
    args.push(reviewComments);

    const child = this.spawnProcess(config.executablePath, args, { cwd: worktreePath });

    child.stdout?.on('data', append);
    child.stderr?.on('data', append);

    child.on('close', async (code) => {
      await this.handleProcessClose(runId, worktreePath, code, logBuffer, logFile);
    });

    this.activeProcesses.set(runId, child);
    return { runId };
  }

  async listSessions(worktreePath: string): Promise<OpenCodeSession[]> {
    try {
      const { stdout } = this.execCommand('opencode session list --format json', {
        cwd: worktreePath,
      });

      const sessions: OpenCodeSession[] = JSON.parse(stdout);

      // Sort by createdAt descending (most recent first)
      return sessions.sort((a, b) => {
        const aTime = a.updatedAt || a.createdAt || '';
        const bTime = b.updatedAt || b.createdAt || '';
        return bTime.localeCompare(aTime);
      });
    } catch (error) {
      console.error('Failed to list opencode sessions:', error);
      return [];
    }
  }

  getSessionForRun(runId: string): OpenCodeSession | undefined {
    return this.getCachedSession(runId);
  }
}

export const openCodeAgentAdapter = new OpenCodeAgentAdapter();
