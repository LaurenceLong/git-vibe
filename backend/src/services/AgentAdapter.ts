/**
 * Abstract base class for Code Agent Adapters
 * All code agent implementations should extend this class
 */

import { spawn, execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gitService } from './GitService.js';

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

export type AgentStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type AgentConfig = {
  executablePath: string;
  baseArgs?: string[];
  model?: string;
  agent?: string;
  [key: string]: unknown;
};

export type ProcessOutput = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export type SessionData = Record<string, unknown>;

export abstract class AgentAdapter<TSessionData extends SessionData = SessionData> {
  protected activeProcesses = new Map<string, ReturnType<typeof spawn>>();
  protected sessionCache = new Map<string, TSessionData>();

  /**
   * Get the logs directory path for storing agent run logs
   */
  protected getLogsDir(): string {
    const { STORAGE_CONFIG } = require('../config/storage.js');
    return STORAGE_CONFIG.logsDir;
  }

  /**
   * Get the log file path for a specific agent run
   */
  protected getLogFilePath(runId: string): string {
    return path.join(this.getLogsDir(), `agent-run-${runId}.log`);
  }

  /**
   * Ensure the logs directory exists
   */
  protected async ensureLogsDir(): Promise<void> {
    await fs.mkdir(this.getLogsDir(), { recursive: true });
  }

  /**
   * Validate that the agent executable is available
   */
  abstract validate(_config: { executablePath: string }): Promise<boolean>;

  /**
   * Run the agent with the given parameters
   */
  abstract run(_params: AgentRunParams): Promise<{ runId: string; sessionId?: string }>;

  /**
   * Correct using review comments
   */
  abstract correctWithReviewComments(_params: AgentCorrectionParams): Promise<{ runId: string }>;

  /**
   * Get available models for this agent
   */
  abstract getModels(): Promise<AgentModel[]>;

  /**
   * Cancel a running agent run
   */
  async cancel(runId: string): Promise<void> {
    const child = this.activeProcesses.get(runId);
    if (child) {
      child.kill('SIGTERM');
      this.activeProcesses.delete(runId);
    }
  }

  /**
   * Get the status of an agent run
   */
  async getStatus(runId: string): Promise<{ status: AgentStatus }> {
    if (this.activeProcesses.has(runId)) {
      return { status: 'running' };
    }

    const { agentRunsRepository } = await import('../repositories/AgentRunsRepository.js');
    const agentRun = await agentRunsRepository.findById(runId);

    if (!agentRun) {
      return { status: 'queued' };
    }

    return { status: agentRun.status as AgentStatus };
  }

  /**
   * Spawn a child process and capture its output
   */
  protected spawnProcess(
    executablePath: string,
    args: string[],
    options: {
      cwd: string;
      env?: NodeJS.ProcessEnv;
      shell?: boolean;
    }
  ): ReturnType<typeof spawn> {
    return spawn(executablePath, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PWD: options.cwd,
        ...options.env,
      },
      shell: true,
    });
  }

  /**
   * Create a log file and return its handle
   */
  protected async createLogFile(runId: string): Promise<ReturnType<typeof fs.open>> {
    await this.ensureLogsDir();
    const logPath = this.getLogFilePath(runId);
    return await fs.open(logPath, 'w');
  }

  /**
   * Create an output buffer and append function for logging
   */
  protected createOutputHandler(logFile: Awaited<ReturnType<typeof fs.open>>): {
    logBuffer: string;
    append: (_chunk: Buffer) => void;
  } {
    let logBuffer = '';

    const append = (chunk: Buffer) => {
      const output = chunk.toString('utf-8');
      logBuffer += output;
      void logFile.write(output);
    };

    return { logBuffer, append };
  }

  /**
   * Handle process completion and update database
   */
  protected async handleProcessClose(
    runId: string,
    worktreePath: string,
    exitCode: number | null,
    logBuffer: string,
    logFile: Awaited<ReturnType<typeof fs.open>>,
    onBeforeUpdate?: () => Promise<void>
  ): Promise<void> {
    const status = exitCode === 0 ? 'succeeded' : 'failed';
    const headShaBefore = gitService.getWorktreeHead(worktreePath);
    const headShaAfter = gitService.getWorktreeHead(worktreePath);

    await logFile.close();
    this.activeProcesses.delete(runId);

    if (onBeforeUpdate) {
      await onBeforeUpdate();
    }

    const { agentRunsRepository } = await import('../repositories/AgentRunsRepository.js');
    const logPath = this.getLogFilePath(runId);

    await agentRunsRepository.update(runId, {
      status,
      headShaBefore,
      headShaAfter,
      log: logBuffer,
      logPath,
      finishedAt: new Date(),
    });
  }

  /**
   * Execute a command synchronously and return output
   */
  protected execCommand(
    command: string,
    options: {
      cwd?: string;
      encoding?: BufferEncoding;
    } = {}
  ): ProcessOutput {
    let stdout = '';
    let stderr = '';
    let exitCode: number | null = null;

    try {
      stdout = execSync(command, {
        ...options,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: options.encoding || 'utf-8',
      }) as string;
      exitCode = 0;
    } catch (error: unknown) {
      const err = error as { stderr?: string; message?: string; status?: number };
      stderr = err.stderr || err.message || 'Unknown error';
      exitCode = err.status || 1;
    }

    return { stdout, stderr, exitCode };
  }

  /**
   * Cache session data for a run
   */
  protected cacheSession(runId: string, session: TSessionData): void {
    this.sessionCache.set(runId, session);
  }

  /**
   * Get cached session data for a run
   */
  protected getCachedSession(runId: string): TSessionData | undefined {
    return this.sessionCache.get(runId);
  }

  /**
   * Save session data to database
   */
  protected async saveSessionToDatabase(runId: string, session: TSessionData): Promise<void> {
    const { agentRunsRepository } = await import('../repositories/AgentRunsRepository.js');

    const sessionData = JSON.stringify(session);

    await agentRunsRepository.update(runId, {
      inputJson: sessionData,
    });
  }

  /**
   * Parse models from command output
   */
  protected parseModelsFromOutput(output: string, separator: string = '/'): AgentModel[] {
    const lines = output
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) => line.length > 0 && !line.startsWith('Available') && !line.startsWith('Models')
      );

    return lines.map((model) => {
      const parts = model.split(separator);
      return {
        id: model,
        name: parts[1] || model,
        provider: parts[0],
      };
    });
  }

  /**
   * Build command arguments with optional flags
   */
  protected buildCommandArgs(
    baseCommand: string,
    flags: Record<string, string | boolean | undefined>,
    positionalArgs: string[] = []
  ): string[] {
    const args = [baseCommand];

    for (const [key, value] of Object.entries(flags)) {
      if (value !== undefined && value !== false) {
        const flag = key.length === 1 ? `-${key}` : `--${key}`;
        args.push(flag);
        if (typeof value === 'string') {
          args.push(value);
        }
      }
    }

    args.push(...positionalArgs);
    return args;
  }
}
