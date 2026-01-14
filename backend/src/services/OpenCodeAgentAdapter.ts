import { spawn, execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG } from '../config/storage.js';
import { gitService } from './GitService.js';
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

export class OpenCodeAgentAdapter extends AgentAdapter {
  private activeProcesses = new Map<string, ReturnType<typeof spawn>>();
  private sessionCache = new Map<string, OpenCodeSession>();

  async validate(config: { executablePath: string }): Promise<boolean> {
    try {
      await fs.access(config.executablePath, fs.constants.X_OK);
      return true;
    } catch {
      throw new Error(`OpenCode executable not found or not executable: ${config.executablePath}`);
    }
  }

  async getModels(): Promise<AgentModel[]> {
    try {
      // Run opencode models command
      const output = execSync('opencode models', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Parse the output - models are listed in format "provider/model"
      const models = output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('Available models'));

      // Parse each model into AgentModel format
      return models.map((model) => {
        const parts = model.split('/');
        return {
          id: model,
          name: parts[1] || model,
          provider: parts[0],
        };
      });
    } catch (error) {
      console.error('Failed to fetch OpenCode models:', error);
      return [];
    }
  }

  async run(params: OpenCodeAgentRunParams): Promise<{ runId: string; sessionId?: string }> {
    const { worktreePath, agentRunId, prompt, config } = params;

    const runId = agentRunId;
    const headShaBefore = gitService.getWorktreeHead(worktreePath);

    const logPath = path.join(STORAGE_CONFIG.logsDir, `agent-run-${runId}.log`);
    await fs.mkdir(STORAGE_CONFIG.logsDir, { recursive: true });

    const logFile = await fs.open(logPath, 'w');

    // Build args for opencode run command
    const args = ['run'];

    // Add optional flags
    if (config.model) {
      args.push('--model', config.model);
    }
    if (config.agent) {
      args.push('--agent', config.agent);
    }
    if (config.baseArgs) {
      args.push(...config.baseArgs);
    }

    // Add the prompt
    args.push(prompt);

    const child = spawn(config.executablePath, args, {
      cwd: worktreePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PWD: worktreePath,
      },
      shell: true,
    });

    let logBuffer = '';

    const append = (chunk: Buffer) => {
      const output = chunk.toString('utf-8');
      logBuffer += output;
      void logFile.write(output);
    };

    child.stdout?.on('data', append);
    child.stderr?.on('data', append);

    child.on('close', async (code) => {
      const status = code === 0 ? 'succeeded' : 'failed';
      const headShaAfter = gitService.getWorktreeHead(worktreePath);

      await logFile.close();
      this.activeProcesses.delete(runId);

      // List sessions and save the latest one
      try {
        const sessions = await this.listSessions(worktreePath);
        if (sessions.length > 0) {
          const latestSession = sessions[0]; // Most recent session
          this.sessionCache.set(runId, latestSession);

          // Save session data to database
          await this.saveSessionToDatabase(runId, latestSession);
        }
      } catch (error) {
        console.error('Failed to list sessions:', error);
      }

      const { agentRunsRepository } = await import('../repositories/AgentRunsRepository.js');
      await agentRunsRepository.update(runId, {
        status,
        headShaBefore,
        headShaAfter,
        log: logBuffer,
        logPath,
        finishedAt: new Date(),
      });
    });

    this.activeProcesses.set(runId, child);
    return { runId };
  }

  async correctWithReviewComments(params: OpenCodeAgentCorrectionParams): Promise<{ runId: string }> {
    const { worktreePath, agentRunId, sessionId, reviewComments, config } = params;

    const runId = agentRunId;
    const headShaBefore = gitService.getWorktreeHead(worktreePath);

    const logPath = path.join(STORAGE_CONFIG.logsDir, `agent-run-${runId}.log`);
    await fs.mkdir(STORAGE_CONFIG.logsDir, { recursive: true });

    const logFile = await fs.open(logPath, 'w');

    // Build args for opencode run with session continuation
    const args = ['run', '--session', sessionId];

    if (config.baseArgs) {
      args.push(...config.baseArgs);
    }

    // Add the review comments as the prompt
    args.push(reviewComments);

    const child = spawn(config.executablePath, args, {
      cwd: worktreePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PWD: worktreePath,
      },
      shell: true,
    });

    let logBuffer = '';

    const append = (chunk: Buffer) => {
      const output = chunk.toString('utf-8');
      logBuffer += output;
      void logFile.write(output);
    };

    child.stdout?.on('data', append);
    child.stderr?.on('data', append);

    child.on('close', async (code) => {
      const status = code === 0 ? 'succeeded' : 'failed';
      const headShaAfter = gitService.getWorktreeHead(worktreePath);

      await logFile.close();
      this.activeProcesses.delete(runId);

      const { agentRunsRepository } = await import('../repositories/AgentRunsRepository.js');
      await agentRunsRepository.update(runId, {
        status,
        headShaBefore,
        headShaAfter,
        log: logBuffer,
        logPath,
        finishedAt: new Date(),
      });
    });

    this.activeProcesses.set(runId, child);
    return { runId };
  }

  async cancel(runId: string): Promise<void> {
    const child = this.activeProcesses.get(runId);
    if (child) {
      child.kill('SIGTERM');
      this.activeProcesses.delete(runId);
    }
  }

  async getStatus(
    runId: string
  ): Promise<{ status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' }> {
    if (this.activeProcesses.has(runId)) {
      return { status: 'running' };
    }

    const { agentRunsRepository } = await import('../repositories/AgentRunsRepository.js');
    const agentRun = await agentRunsRepository.findById(runId);

    if (!agentRun) {
      return { status: 'queued' };
    }

    return { status: agentRun.status };
  }

  async listSessions(worktreePath: string): Promise<OpenCodeSession[]> {
    try {
      // Run opencode session list with json format
      const output = execSync('opencode session list --format json', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Parse JSON output
      const sessions: OpenCodeSession[] = JSON.parse(output);

      // Sort by createdAt descending (most recent first)
      return sessions.sort((a, b) => {
        const aTime = a.updatedAt || a.createdAt || '';
        const bTime = b.updatedAt || b.createdAt || '';
        return bTime.localeCompare(aTime);
      });
    } catch (error) {
      // If command fails, return empty array
      console.error('Failed to list opencode sessions:', error);
      return [];
    }
  }

  private async saveSessionToDatabase(runId: string, session: OpenCodeSession): Promise<void> {
    const { agentRunsRepository } = await import('../repositories/AgentRunsRepository.js');

    // Store session data in inputJson as JSON string
    const sessionData = JSON.stringify({
      sessionId: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      status: session.status,
      model: session.model,
      agent: session.agent,
      project: session.project,
    });

    await agentRunsRepository.update(runId, {
      inputJson: sessionData,
    });
  }

  getSessionForRun(runId: string): OpenCodeSession | undefined {
    return this.sessionCache.get(runId);
  }
}

export const openCodeAgentAdapter = new OpenCodeAgentAdapter();
