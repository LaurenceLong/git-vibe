/**
 * Abstract base class for Code Agent Adapters
 * All code agent implementations should extend this class
 */

import { spawn, execSync, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  AGENT_RUN_STATUS_RUNNING,
  AGENT_RUN_STATUS_QUEUED,
  AGENT_RUN_STATUS_SUCCEEDED,
  AGENT_RUN_STATUS_FAILED,
} from 'git-vibe-shared';
import { gitService } from '../git/GitService.js';
import { STORAGE_CONFIG } from '../../config/storage.js';
import { agentRunsRepository } from '../../repositories/AgentRunsRepository.js';
import { workItemsRepository } from '../../repositories/WorkItemsRepository.js';

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
  /** When set, the adapter should continue in this session (e.g. opencode run --session <id>) */
  sessionId?: string | null;
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
  protected processPids = new Map<string, number>(); // Track PID for each runId
  protected sessionCache = new Map<string, TSessionData>();

  /**
   * Get the logs directory path for storing agent run logs
   */
  protected async getLogsDir(): Promise<string> {
    return STORAGE_CONFIG.logsDir;
  }

  /**
   * Get the log file path for a specific agent run
   */
  protected async getLogFilePath(runId: string): Promise<string> {
    const logsDir = await this.getLogsDir();
    return path.join(logsDir, `agent-run-${runId}.log`);
  }

  /**
   * Get the stdout log file path for a specific agent run
   */
  protected async getStdoutPath(runId: string): Promise<string> {
    const logsDir = await this.getLogsDir();
    return path.join(logsDir, `agent-run-${runId}-stdout.log`);
  }

  /**
   * Get the stderr log file path for a specific agent run
   */
  protected async getStderrPath(runId: string): Promise<string> {
    const logsDir = await this.getLogsDir();
    return path.join(logsDir, `agent-run-${runId}-stderr.log`);
  }

  /**
   * Ensure the logs directory exists
   */
  protected async ensureLogsDir(): Promise<void> {
    const logsDir = await this.getLogsDir();
    try {
      await fs.mkdir(logsDir, { recursive: true });
    } catch (error) {
      console.error(`[AgentAdapter] Failed to create logs directory at ${logsDir}:`, error);
      throw error;
    }
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
      return { status: AGENT_RUN_STATUS_RUNNING };
    }

    const agentRun = await agentRunsRepository.findById(runId);

    if (!agentRun) {
      return { status: AGENT_RUN_STATUS_QUEUED };
    }

    return { status: agentRun.status as AgentStatus };
  }

  /**
   * Resolve executable path from PATH environment variable
   * Returns the full path if found, or the original path if already absolute or not found
   */
  protected resolveExecutablePath(executablePath: string): string {
    // If it's already an absolute path or contains path separators, return as-is
    if (path.isAbsolute(executablePath) || executablePath.includes(path.sep)) {
      return executablePath;
    }

    // Resolve from PATH environment variable
    const pathEnv = process.env.PATH || '';
    const pathExt = process.platform === 'win32' ? process.env.PATHEXT || '.EXE;.CMD;.BAT' : '';

    // Split PATH by platform-specific separator
    const pathDirs = pathEnv.split(process.platform === 'win32' ? ';' : ':');

    // On Windows, also check with extensions
    const extensions = process.platform === 'win32' ? pathExt.split(';') : [''];

    for (const dir of pathDirs) {
      for (const ext of extensions) {
        const fullPath = path.join(dir, executablePath + ext);
        // The spawn will fail if not executable anyway
        // In a real implementation, we might want to make this async or use sync version
        return fullPath;
      }
    }

    // If not found in PATH, return original (spawn will fail with proper error)
    return executablePath;
  }

  /**
   * Spawn a child process and capture its output
   * Uses shell: false by default for better security and argument handling
   * Resolves executable path from PATH if needed
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
    try {
      // Resolve executable path from PATH if it's not already absolute
      // This allows us to use shell: false while still supporting PATH resolution
      let resolvedPath = executablePath;
      if (!path.isAbsolute(executablePath) && !executablePath.includes(path.sep)) {
        // Try to resolve from PATH using which/where command
        try {
          const whichCmd = process.platform === 'win32' ? 'where' : 'which';
          const result = execSync(`${whichCmd} ${executablePath}`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          resolvedPath = result.trim().split('\n')[0].trim();
        } catch {
          // If which/where fails, try manual PATH resolution or fall back to original
          resolvedPath = this.resolveExecutablePath(executablePath);
        }
      }

      // Use shell: false by default for:
      // 1. Better security (no shell injection)
      // 2. Proper handling of special characters and newlines
      // 3. More predictable cross-platform behavior
      // 4. Better performance (no shell overhead)
      // Only use shell if explicitly requested
      const useShell = options.shell === true;

      const child = spawn(resolvedPath, args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PWD: options.cwd,
          ...options.env,
        },
        shell: useShell,
      });

      // Log process errors
      child.on('error', (error) => {
        console.error(`[AgentAdapter] Process error for ${resolvedPath}:`, error);
        // If error is ENOENT and we tried to resolve, log helpful message
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          console.error(
            `[AgentAdapter] Executable not found: ${executablePath} (resolved: ${resolvedPath})`
          );
        }
      });

      return child;
    } catch (error) {
      console.error(`[AgentAdapter] Failed to spawn process ${executablePath}:`, error);
      throw error;
    }
  }

  /**
   * Create a log file and return its handle
   */
  protected async createLogFile(runId: string): Promise<ReturnType<typeof fs.open>> {
    await this.ensureLogsDir();
    const logPath = await this.getLogFilePath(runId);
    try {
      return await fs.open(logPath, 'w');
    } catch (error) {
      console.error(`[AgentAdapter] Failed to create log file at ${logPath}:`, error);
      throw error;
    }
  }

  /**
   * Create stdout and stderr log files and return their handles
   */
  protected async createStdoutStderrFiles(runId: string): Promise<{
    stdoutFile: Awaited<ReturnType<typeof fs.open>>;
    stderrFile: Awaited<ReturnType<typeof fs.open>>;
  }> {
    await this.ensureLogsDir();
    const stdoutPath = await this.getStdoutPath(runId);
    const stderrPath = await this.getStderrPath(runId);
    try {
      const stdoutFile = await fs.open(stdoutPath, 'w');
      const stderrFile = await fs.open(stderrPath, 'w');
      return { stdoutFile, stderrFile };
    } catch (error) {
      console.error(`[AgentAdapter] Failed to create log files:`, error);
      throw error;
    }
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
   * Create separate stdout and stderr output handlers
   */
  protected createStdoutStderrHandlers(
    stdoutFile: Awaited<ReturnType<typeof fs.open>>,
    stderrFile: Awaited<ReturnType<typeof fs.open>>
  ): {
    stdoutBuffer: string;
    stderrBuffer: string;
    appendStdout: (_chunk: Buffer) => void;
    appendStderr: (_chunk: Buffer) => void;
  } {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    const lastStdoutFlushTime = { value: Date.now() };
    const lastStderrFlushTime = { value: Date.now() };
    const FLUSH_INTERVAL = 100; // Flush every 100ms

    const flushIfNeeded = async (
      file: Awaited<ReturnType<typeof fs.open>>,
      lastFlushTimeRef: { value: number }
    ) => {
      const now = Date.now();
      if (now - lastFlushTimeRef.value >= FLUSH_INTERVAL) {
        try {
          await file.sync(); // Flush the file to disk
          lastFlushTimeRef.value = now;
        } catch (error) {
          // Ignore flush errors, but log them
          console.error('[AgentAdapter] Failed to flush log file:', error);
        }
      }
    };

    const appendStdout = (chunk: Buffer) => {
      const output = chunk.toString('utf-8');
      stdoutBuffer += output;
      // Write and flush if needed
      stdoutFile.write(output).catch((error) => {
        console.error('[AgentAdapter] Failed to write stdout:', error);
      });
      void flushIfNeeded(stdoutFile, lastStdoutFlushTime);
    };

    const appendStderr = (chunk: Buffer) => {
      const output = chunk.toString('utf-8');
      stderrBuffer += output;
      // Write and flush if needed
      stderrFile.write(output).catch((error) => {
        console.error('[AgentAdapter] Failed to write stderr:', error);
      });
      void flushIfNeeded(stderrFile, lastStderrFlushTime);
    };

    return { stdoutBuffer, stderrBuffer, appendStdout, appendStderr };
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
    const status = exitCode === 0 ? AGENT_RUN_STATUS_SUCCEEDED : AGENT_RUN_STATUS_FAILED;
    const headShaBefore = gitService.getWorktreeHead(worktreePath);
    const headShaAfter = gitService.getWorktreeHead(worktreePath);

    await logFile.close();
    this.activeProcesses.delete(runId);
    this.processPids.delete(runId);

    if (onBeforeUpdate) {
      await onBeforeUpdate();
    }

    const logPath = await this.getLogFilePath(runId);

    await agentRunsRepository.update(runId, {
      status,
      headShaBefore,
      headShaAfter,
      log: logBuffer,
      logPath,
      finishedAt: new Date(),
    });

    // Release lock and finalize agent run
    try {
      // Use dynamic import to avoid circular dependency
      const { agentService } = await import('./AgentService.js');
      await agentService.finalizeAgentRun(runId);
    } catch (error) {
      console.error(`[AgentAdapter] Failed to finalize agent run ${runId}:`, error);
      // Even if finalization fails, try to release the lock
      try {
        const agentRun = await agentRunsRepository.findById(runId);
        if (agentRun) {
          await workItemsRepository.releaseLock(agentRun.workItemId, runId);
        }
      } catch (lockError) {
        console.error(`[AgentAdapter] Failed to release lock for run ${runId}:`, lockError);
      }
    }
  }

  /**
   * Handle process completion with separate stdout/stderr and update database
   */
  protected async handleProcessCloseWithStdoutStderr(
    runId: string,
    worktreePath: string,
    exitCode: number | null,
    stdoutBuffer: string,
    stderrBuffer: string,
    stdoutFile: Awaited<ReturnType<typeof fs.open>>,
    stderrFile: Awaited<ReturnType<typeof fs.open>>,
    onBeforeUpdate?: () => Promise<void>
  ): Promise<void> {
    const status = exitCode === 0 ? AGENT_RUN_STATUS_SUCCEEDED : AGENT_RUN_STATUS_FAILED;
    const headShaBefore = gitService.getWorktreeHead(worktreePath);
    const headShaAfter = gitService.getWorktreeHead(worktreePath);

    await stdoutFile.close();
    await stderrFile.close();
    this.activeProcesses.delete(runId);
    this.processPids.delete(runId);

    if (onBeforeUpdate) {
      await onBeforeUpdate();
    }

    const logPath = await this.getLogFilePath(runId);
    const stdoutPath = await this.getStdoutPath(runId);
    const stderrPath = await this.getStderrPath(runId);

    // Combine stdout and stderr for the log field
    const combinedLog = `STDOUT:\n${stdoutBuffer}\n\nSTDERR:\n${stderrBuffer}`;

    await agentRunsRepository.update(runId, {
      status,
      headShaBefore,
      headShaAfter,
      log: combinedLog,
      logPath,
      stdoutPath,
      stderrPath,
      finishedAt: new Date(),
    });

    // Release lock and finalize agent run
    try {
      // Use dynamic import to avoid circular dependency
      const { agentService } = await import('./AgentService.js');
      await agentService.finalizeAgentRun(runId);
    } catch (error) {
      console.error(`[AgentAdapter] Failed to finalize agent run ${runId}:`, error);
      // Even if finalization fails, try to release the lock
      try {
        const agentRun = await agentRunsRepository.findById(runId);
        if (agentRun) {
          await workItemsRepository.releaseLock(agentRun.workItemId, runId);
        }
      } catch (lockError) {
        console.error(`[AgentAdapter] Failed to release lock for run ${runId}:`, lockError);
      }
    }
  }

  /**
   * Read the contents of a log file
   */
  protected async readLogFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      console.error(`[AgentAdapter] Failed to read log file at ${filePath}:`, error);
      return '';
    }
  }

  /**
   * Read the last N lines of a log file
   */
  protected async readLogFileTail(filePath: string, lines: number = 10): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const allLines = content.split('\n');
      const tailLines = allLines.slice(-lines);
      return tailLines.join('\n');
    } catch (error) {
      console.error(`[AgentAdapter] Failed to read log file tail at ${filePath}:`, error);
      return '';
    }
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
   * Execute a command asynchronously and return output
   * This version doesn't block the event loop
   */
  protected async execCommandAsync(
    command: string,
    options: {
      cwd?: string;
      encoding?: BufferEncoding;
    } = {}
  ): Promise<ProcessOutput> {
    const execPromise = promisify(exec);
    let stdout = '';
    let stderr = '';
    let exitCode: number | null = null;

    try {
      const result = await execPromise(command, {
        ...options,
        encoding: options.encoding || 'utf-8',
      });
      stdout = result.stdout || '';
      stderr = result.stderr || '';
      exitCode = 0;
    } catch (error: unknown) {
      // When exec fails, the error contains stdout, stderr, and code
      const err = error as { stdout?: string; stderr?: string; message?: string; code?: number };
      stdout = err.stdout || '';
      stderr = err.stderr || err.message || 'Unknown error';
      exitCode = err.code ?? 1;
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
   * Check if a PID is tracked in the cache
   */
  hasPid(runId: string): boolean {
    return this.processPids.has(runId);
  }

  /**
   * Get the PID for a run
   */
  getPid(runId: string): number | undefined {
    return this.processPids.get(runId);
  }

  /**
   * Save session data to database
   */
  protected async saveSessionToDatabase(runId: string, session: TSessionData): Promise<void> {
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
