import {
  AgentAdapter,
  type AgentModel,
  type AgentRunParams,
  type AgentCorrectionParams,
} from './AgentAdapter.js';

interface ClaudeCodeSession {
  id: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  model?: string;
  agent?: string;
  [key: string]: unknown;
}

interface ClaudeCodeAgentRunParams extends AgentRunParams {
  config: {
    executablePath: string;
    baseArgs?: string[];
    model?: string;
    agent?: string;
  };
}

interface ClaudeCodeAgentCorrectionParams extends AgentCorrectionParams {
  config: {
    executablePath: string;
    baseArgs?: string[];
  };
}

export class ClaudeCodeAgentAdapter extends AgentAdapter<ClaudeCodeSession> {
  async validate(config: { executablePath: string }): Promise<boolean> {
    try {
      const { promises: fs } = await import('node:fs');
      await fs.access(config.executablePath, fs.constants.X_OK);
      return true;
    } catch {
      throw new Error(
        `Claude Code executable not found or not executable: ${config.executablePath}`
      );
    }
  }

  async getModels(): Promise<AgentModel[]> {
    // Claude Code doesn't have a direct models list command
    // Models are specified via --model flag with aliases or full names
    // Common models: claude-sonnet-4-5-20250929, claude-opus-4-5-20250929, claude-haiku-4-5-20250929
    return [
      {
        id: 'claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        provider: 'anthropic',
      },
      {
        id: 'claude-opus-4-5-20250929',
        name: 'Claude Opus 4.5',
        provider: 'anthropic',
      },
      {
        id: 'claude-haiku-4-5-20250929',
        name: 'Claude Haiku 4.5',
        provider: 'anthropic',
      },
      {
        id: 'sonnet',
        name: 'Sonnet (latest)',
        provider: 'anthropic',
      },
      {
        id: 'opus',
        name: 'Opus (latest)',
        provider: 'anthropic',
      },
      {
        id: 'haiku',
        name: 'Haiku (latest)',
        provider: 'anthropic',
      },
    ];
  }

  async run(params: ClaudeCodeAgentRunParams): Promise<{ runId: string; sessionId?: string }> {
    const { worktreePath, agentRunId, prompt, config } = params;

    const runId = agentRunId;
    const logFile = await this.createLogFile(runId);
    const { logBuffer, append } = this.createOutputHandler(logFile);

    // Build args for claude -p command (print mode)
    const args = this.buildCommandArgs('-p', {
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
        // Claude Code doesn't have session listing in print mode
        // Session tracking is done via --session-id flag
      });
    });

    this.activeProcesses.set(runId, child);
    return { runId };
  }

  async correctWithReviewComments(
    params: ClaudeCodeAgentCorrectionParams
  ): Promise<{ runId: string }> {
    const { worktreePath, agentRunId, sessionId, reviewComments, config } = params;

    const runId = agentRunId;
    const logFile = await this.createLogFile(runId);
    const { logBuffer, append } = this.createOutputHandler(logFile);

    // Build args for claude -c -p command (continue with print mode)
    const args = this.buildCommandArgs('-c', {
      'session-id': sessionId,
    });

    args.push('-p');

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

  /**
   * Get available sessions for Claude Code
   * Note: Claude Code doesn't have a built-in session list command
   * Sessions are managed via the CLI's internal state
   */
  async listSessions(_worktreePath: string): Promise<ClaudeCodeSession[]> {
    try {
      // Claude Code stores sessions in ~/.claude/sessions
      // We can list them by reading the directory
      const { homedir } = await import('node:os');
      const { promises: fs } = await import('node:fs');
      const path = await import('node:path');

      const sessionsDir = path.join(homedir(), '.claude', 'sessions');
      const entries = await fs.readdir(sessionsDir, { withFileTypes: true });

      const sessions: ClaudeCodeSession[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionPath = path.join(sessionsDir, entry.name);
          const sessionFile = path.join(sessionPath, 'session.json');

          try {
            const content = await fs.readFile(sessionFile, 'utf-8');
            const sessionData = JSON.parse(content);

            sessions.push({
              id: entry.name,
              name: sessionData.name || sessionData.title || entry.name,
              createdAt: sessionData.createdAt,
              updatedAt: sessionData.updatedAt,
              status: sessionData.status,
              model: sessionData.model,
              agent: sessionData.agent,
            });
          } catch {
            // Skip sessions that can't be read
            continue;
          }
        }
      }

      // Sort by updatedAt descending (most recent first)
      return sessions.sort((a, b) => {
        const aTime = a.updatedAt || a.createdAt || '';
        const bTime = b.updatedAt || b.createdAt || '';
        return bTime.localeCompare(aTime);
      });
    } catch (error) {
      console.error('Failed to list Claude Code sessions:', error);
      return [];
    }
  }

  /**
   * Get session data for a specific run
   */
  getSessionForRun(runId: string): ClaudeCodeSession | undefined {
    return this.getCachedSession(runId);
  }
}

export const claudeCodeAgentAdapter = new ClaudeCodeAgentAdapter();
