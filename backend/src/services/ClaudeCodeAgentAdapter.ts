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
      // Try to execute a simple command to verify the executable is available
      // This works with both full paths and command names in PATH
      this.execCommand(`${config.executablePath} --version`, { encoding: 'utf-8' });
      return true;
    } catch (error) {
      throw new Error(
        `Claude Code executable not found or not executable: ${config.executablePath}. Error: ${error instanceof Error ? error.message : String(error)}`
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

    // Get sessionId from the agent run record
    const { agentRunsRepository } = await import('../repositories/AgentRunsRepository.js');
    const agentRun = await agentRunsRepository.findById(runId);
    let sessionId = agentRun?.sessionId;

    // Claude Code requires a valid UUID for --session-id
    // If sessionId is not a valid UUID (e.g., starts with "wi-"), generate a new UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!sessionId || !uuidRegex.test(sessionId)) {
      const { v4: uuidv4 } = await import('uuid');
      sessionId = uuidv4();
      // Update the database with the generated UUID session ID
      await agentRunsRepository.update(runId, {
        sessionId,
      });
      console.log(`[ClaudeCodeAgent] Generated and saved session ID: ${sessionId}`);
    }

    // Build args for claude -p command (print mode) with --session-id
    const args = this.buildCommandArgs('-p', {
      model: config.model,
      agent: config.agent,
      'session-id': sessionId,
    });

    if (config.baseArgs) {
      args.push(...config.baseArgs);
    }

    // Add the prompt
    args.push(prompt);

    const child = this.spawnProcess(config.executablePath, args, { cwd: worktreePath });

    // Store PID in memory cache and persist to database
    if (child.pid) {
      this.processPids.set(runId, child.pid);
      await agentRunsRepository.update(runId, {
        pid: child.pid,
      });
      console.log(`[ClaudeCodeAgent] Stored PID ${child.pid} for run ${runId}`);
    }

    child.stdout?.on('data', append);
    child.stderr?.on('data', append);

    child.on('close', async (code) => {
      await this.handleProcessClose(runId, worktreePath, code, logBuffer, logFile, async () => {
        // Session ID is already set and saved to database
        console.log(`[ClaudeCodeAgent] Session ID recorded: ${sessionId}`);
      });
    });

    this.activeProcesses.set(runId, child);
    return { runId, sessionId };
  }

  async correctWithReviewComments(
    params: ClaudeCodeAgentCorrectionParams
  ): Promise<{ runId: string }> {
    const { worktreePath, agentRunId, sessionId, reviewComments, config } = params;

    const runId = agentRunId;
    const logFile = await this.createLogFile(runId);
    const { logBuffer, append } = this.createOutputHandler(logFile);

    // Claude Code uses -r (resume) to resume a specific session by ID
    // According to docs: claude -r "<session>" "query" resumes session by ID or name
    // For print mode: claude -r "<session-id>" -p "query"
    // Build args for claude -r with session ID and -p (print mode)
    const args: string[] = ['-r', sessionId, '-p'];

    if (config.baseArgs) {
      args.push(...config.baseArgs);
    }

    // Add the review comments as the prompt
    args.push(reviewComments);

    const child = this.spawnProcess(config.executablePath, args, { cwd: worktreePath });

    // Store PID in memory cache and persist to database
    if (child.pid) {
      this.processPids.set(runId, child.pid);
      await agentRunsRepository.update(runId, {
        pid: child.pid,
      });
      console.log(`[ClaudeCodeAgent] Stored PID ${child.pid} for correction run ${runId}`);
    }

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
