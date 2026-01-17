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
    console.log(`[OpenCodeAgent] Validating executable: ${config.executablePath}`);
    try {
      // Try to execute a simple command to verify the executable is available
      // This works with both full paths and command names in PATH
      const result = this.execCommand(`${config.executablePath} --version`, { encoding: 'utf-8' });
      console.log(`[OpenCodeAgent] Validation successful. Version: ${result.stdout.trim()}`);
      return true;
    } catch (error) {
      console.error(
        `[OpenCodeAgent] Validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new Error(
        `OpenCode executable not found or not executable: ${config.executablePath}. Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getModels(): Promise<AgentModel[]> {
    console.log('[OpenCodeAgent] Fetching available models...');
    try {
      const { stdout } = this.execCommand('opencode models');
      const models = this.parseModelsFromOutput(stdout);
      console.log(`[OpenCodeAgent] Found ${models.length} available models`);
      return models;
    } catch (error) {
      console.error('[OpenCodeAgent] Failed to fetch models:', error);
      return [];
    }
  }

  async run(params: OpenCodeAgentRunParams): Promise<{ runId: string; sessionId?: string }> {
    const { worktreePath, agentRunId, prompt, config } = params;

    const runId = agentRunId;
    console.log(`[OpenCodeAgent] Starting run ${runId}`);
    console.log(`[OpenCodeAgent] Worktree: ${worktreePath}`);
    console.log(`[OpenCodeAgent] Model: ${config.model || 'default'}`);
    console.log(`[OpenCodeAgent] Agent: ${config.agent || 'default'}`);
    console.log(`[OpenCodeAgent] Prompt length: ${prompt.length} characters`);

    try {
      const { stdoutFile, stderrFile } = await this.createStdoutStderrFiles(runId);
      const stdoutPath = await this.getStdoutPath(runId);
      const stderrPath = await this.getStderrPath(runId);
      console.log(`[OpenCodeAgent] Log files created: stdout=${stdoutPath}, stderr=${stderrPath}`);
      
      // Update database with log file paths immediately so SSE streaming can work
      const { agentRunsRepository } = await import('../repositories/AgentRunsRepository.js');
      await agentRunsRepository.update(runId, {
        stdoutPath,
        stderrPath,
      });
      console.log(`[OpenCodeAgent] Log file paths saved to database for real-time streaming`);
      
      const { stdoutBuffer, stderrBuffer, appendStdout, appendStderr } =
        this.createStdoutStderrHandlers(stdoutFile, stderrFile);

      // Build args for opencode run command
      const args = this.buildCommandArgs('run', {
        model: config.model,
        agent: config.agent,
      });

      if (config.baseArgs) {
        args.push(...config.baseArgs);
      }

      // Add the prompt - opencode run accepts [message..] as positional args
      // When the prompt contains newlines, we need to pass it as a single argument
      // Node.js spawn will handle proper escaping when using an array of args
      args.push(prompt);

      // Log the command (note: args.join doesn't show proper quoting, but spawn handles it correctly)
      const commandPreview = args
        .map((arg) => {
          // Escape for log display - wrap in quotes if contains spaces or newlines
          if (arg.includes(' ') || arg.includes('\n')) {
            return `"${arg.replace(/"/g, '\\"')}"`;
          }
          return arg;
        })
        .join(' ');
      console.log(
        `[OpenCodeAgent] Spawning process with command: ${config.executablePath} ${commandPreview}`
      );
      const child = this.spawnProcess(config.executablePath, args, { cwd: worktreePath });
      console.log(`[OpenCodeAgent] Process spawned with PID: ${child.pid}`);

      let outputCount = 0;
      child.stdout?.on('data', (chunk) => {
        outputCount++;
        const output = chunk.toString('utf-8');
        appendStdout(chunk);
        console.log(`[OpenCodeAgent:${runId}] [stdout] ${output.trim()}`);
      });
      child.stderr?.on('data', (chunk) => {
        outputCount++;
        const output = chunk.toString('utf-8');
        appendStderr(chunk);
        console.log(`[OpenCodeAgent:${runId}] [stderr] ${output.trim()}`);
      });

      child.on('error', (error) => {
        console.error(`[OpenCodeAgent] Run ${runId} process error:`, error);
      });

      child.on('close', async (code) => {
        console.log(`[OpenCodeAgent] Run ${runId} process closed with exit code: ${code}`);
        console.log(`[OpenCodeAgent] Total output chunks received: ${outputCount}`);

        await this.handleProcessCloseWithStdoutStderr(
          runId,
          worktreePath,
          code,
          stdoutBuffer,
          stderrBuffer,
          stdoutFile,
          stderrFile,
          async () => {
            // List sessions and save the latest one
            console.log(`[OpenCodeAgent] Listing sessions for run ${runId}...`);
            try {
              const sessions = await this.listSessions(worktreePath);
              console.log(`[OpenCodeAgent] Found ${sessions.length} sessions`);
              if (sessions.length > 0) {
                const latestSession = sessions[0]; // Most recent session
                console.log(`[OpenCodeAgent] Latest session ID: ${latestSession.id}`);
                this.cacheSession(runId, latestSession);
                await this.saveSessionToDatabase(runId, latestSession);
                // Update the sessionId field in the database with the actual opencode session ID
                const { agentRunsRepository } = await import('../repositories/AgentRunsRepository.js');
                await agentRunsRepository.update(runId, {
                  sessionId: latestSession.id,
                });
                console.log(`[OpenCodeAgent] Session ID updated in database: ${latestSession.id}`);
              }
            } catch (error) {
              console.error('[OpenCodeAgent] Failed to list sessions:', error);
            }
          }
        );

        console.log(
          `[OpenCodeAgent] Run ${runId} completed with status: ${code === 0 ? 'succeeded' : 'failed'}`
        );
      });

      this.activeProcesses.set(runId, child);
      console.log(`[OpenCodeAgent] Run ${runId} registered as active process`);
      return { runId };
    } catch (error) {
      console.error(`[OpenCodeAgent] Run ${runId} failed to start:`, error);
      throw error;
    }
  }

  async correctWithReviewComments(
    params: OpenCodeAgentCorrectionParams
  ): Promise<{ runId: string }> {
    const { worktreePath, agentRunId, sessionId, reviewComments, config } = params;

    const runId = agentRunId;
    console.log(`[OpenCodeAgent] Starting correction run ${runId}`);
    console.log(`[OpenCodeAgent] Worktree: ${worktreePath}`);
    console.log(`[OpenCodeAgent] Session ID: ${sessionId}`);
    console.log(`[OpenCodeAgent] Review comments length: ${reviewComments.length} characters`);

    try {
      const { stdoutFile, stderrFile } = await this.createStdoutStderrFiles(runId);
      const stdoutPath = await this.getStdoutPath(runId);
      const stderrPath = await this.getStderrPath(runId);
      console.log(`[OpenCodeAgent] Log files created: stdout=${stdoutPath}, stderr=${stderrPath}`);
      
      // Update database with log file paths immediately so SSE streaming can work
      const { agentRunsRepository } = await import('../repositories/AgentRunsRepository.js');
      await agentRunsRepository.update(runId, {
        stdoutPath,
        stderrPath,
      });
      console.log(`[OpenCodeAgent] Log file paths saved to database for real-time streaming`);
      
      const { stdoutBuffer, stderrBuffer, appendStdout, appendStderr } =
        this.createStdoutStderrHandlers(stdoutFile, stderrFile);

      // Build args for opencode run with session continuation
      const args = this.buildCommandArgs('run', {
        session: sessionId,
      });

      if (config.baseArgs) {
        args.push(...config.baseArgs);
      }

      // Add the review comments as the prompt
      args.push(reviewComments);

      console.log(
        `[OpenCodeAgent] Spawning correction process with command: ${config.executablePath} ${args.join(' ')}`
      );
      const child = this.spawnProcess(config.executablePath, args, { cwd: worktreePath });
      console.log(`[OpenCodeAgent] Correction process spawned with PID: ${child.pid}`);

      let outputCount = 0;
      child.stdout?.on('data', (chunk) => {
        outputCount++;
        const output = chunk.toString('utf-8');
        appendStdout(chunk);
        console.log(`[OpenCodeAgent:${runId}] [stdout] ${output.trim()}`);
      });
      child.stderr?.on('data', (chunk) => {
        outputCount++;
        const output = chunk.toString('utf-8');
        appendStderr(chunk);
        console.log(`[OpenCodeAgent:${runId}] [stderr] ${output.trim()}`);
      });

      child.on('error', (error) => {
        console.error(`[OpenCodeAgent] Correction run ${runId} process error:`, error);
      });

      child.on('close', async (code) => {
        console.log(
          `[OpenCodeAgent] Correction run ${runId} process closed with exit code: ${code}`
        );
        console.log(`[OpenCodeAgent] Total output chunks received: ${outputCount}`);

        await this.handleProcessCloseWithStdoutStderr(
          runId,
          worktreePath,
          code,
          stdoutBuffer,
          stderrBuffer,
          stdoutFile,
          stderrFile
        );

        console.log(
          `[OpenCodeAgent] Correction run ${runId} completed with status: ${code === 0 ? 'succeeded' : 'failed'}`
        );
      });

      this.activeProcesses.set(runId, child);
      console.log(`[OpenCodeAgent] Correction run ${runId} registered as active process`);
      return { runId };
    } catch (error) {
      console.error(`[OpenCodeAgent] Correction run ${runId} failed to start:`, error);
      throw error;
    }
  }

  async listSessions(worktreePath: string): Promise<OpenCodeSession[]> {
    console.log(`[OpenCodeAgent] Listing sessions for worktree: ${worktreePath}`);
    try {
      const { stdout } = this.execCommand('opencode session list --format json', {
        cwd: worktreePath,
      });

      const sessions: OpenCodeSession[] = JSON.parse(stdout);
      console.log(`[OpenCodeAgent] Found ${sessions.length} sessions`);

      // Sort by createdAt descending (most recent first)
      const sortedSessions = sessions.sort((a, b) => {
        const aTime = a.updatedAt || a.createdAt || '';
        const bTime = b.updatedAt || b.createdAt || '';
        return bTime.localeCompare(aTime);
      });

      if (sortedSessions.length > 0) {
        console.log(
          `[OpenCodeAgent] Most recent session: ${sortedSessions[0].id} (status: ${sortedSessions[0].status})`
        );
      }

      return sortedSessions;
    } catch (error) {
      console.error('[OpenCodeAgent] Failed to list sessions:', error);
      return [];
    }
  }

  getSessionForRun(runId: string): OpenCodeSession | undefined {
    const session = this.getCachedSession(runId);
    if (session) {
      console.log(`[OpenCodeAgent] Retrieved session for run ${runId}: ${session.id}`);
    } else {
      console.log(`[OpenCodeAgent] No cached session found for run ${runId}`);
    }
    return session;
  }
}

export const openCodeAgentAdapter = new OpenCodeAgentAdapter();
