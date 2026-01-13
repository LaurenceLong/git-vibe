import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG } from '../config/storage.js';
import { gitService } from './GitService.js';

interface AgentRunParams {
  worktreePath: string;
  agentRunId: string;
  prompt: string;
  config: {
    executablePath: string;
    baseArgs?: string[];
  };
}

export class OpenCodeAgentAdapter {
  private activeProcesses = new Map<string, ReturnType<typeof spawn>>();

  async validate(config: { executablePath: string }): Promise<boolean> {
    try {
      await fs.access(config.executablePath, fs.constants.X_OK);
      return true;
    } catch {
      throw new Error(`OpenCode executable not found or not executable: ${config.executablePath}`);
    }
  }

  async run(params: AgentRunParams): Promise<string> {
    const { worktreePath, agentRunId, prompt, config } = params;

    const runId = agentRunId;
    const headShaBefore = gitService.getWorktreeHead(worktreePath);

    const logPath = path.join(STORAGE_CONFIG.logsDir, `agent-run-${runId}.log`);
    await fs.mkdir(STORAGE_CONFIG.logsDir, { recursive: true });

    const logFile = await fs.open(logPath, 'w');

    const args = [...(config.baseArgs || []), prompt];

    const child = spawn(config.executablePath, args, {
      cwd: worktreePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PWD: worktreePath,
      },
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
    return runId;
  }

  async cancel(runId: string): Promise<void> {
    const child = this.activeProcesses.get(runId);
    if (child) {
      child.kill('SIGTERM');
      this.activeProcesses.delete(runId);
    }
  }

  async getStatus(runId: string): Promise<{ status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' }> {
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
}

export const openCodeAgentAdapter = new OpenCodeAgentAdapter();