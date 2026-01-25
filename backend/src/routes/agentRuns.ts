import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TriggerAgentRunDTOSchema, CancelAgentRunResponseSchema } from 'git-vibe-shared';
import { agentRunsRepository } from '../repositories/AgentRunsRepository.js';
import { workItemsRepository } from '../repositories/WorkItemsRepository.js';
import { projectsRepository } from '../repositories/ProjectsRepository.js';
import { agentService } from '../services/agent/AgentService.js';
import { promises as fs } from 'node:fs';
import { watch } from 'node:fs';
import path from 'node:path';
import { toDTO as agentRunToDTO } from '../mappers/agentRuns.js';
import { STORAGE_CONFIG } from '../config/storage.js';

export async function agentRunsRoutes(server: FastifyInstance) {
  // POST /api/work-items/:id/agent-runs - Start agent run for a WorkItem
  server.post<{ Params: { id: string } }>(
    '/api/work-items/:id/agent-runs',
    async (request, reply) => {
      try {
        const workItem = await workItemsRepository.findById(request.params.id);

        if (!workItem) {
          return reply.status(404).send({
            error: true,
            message: 'WorkItem not found',
          });
        }

        const project = await projectsRepository.findById(workItem.projectId);
        if (!project) {
          return reply.status(404).send({
            error: true,
            message: 'Project not found',
          });
        }

        const body = TriggerAgentRunDTOSchema.parse(request.body);

        // Build prompt
        const prompt = body.prompt;

        // Use AgentService to start the agent run
        // This will handle workspace initialization, locking, and agent execution
        // Pass the prompt as userMessage so it uses "User: {prompt}" format
        const result = await agentService.executeTask(
          project.id,
          workItem.id,
          workItem.title,
          workItem.body || undefined,
          prompt // Pass prompt as userMessage
        );

        return reply.status(201).send(agentRunToDTO(result.agentRun));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: true,
            message: 'Validation failed',
            details: error.errors,
          });
        }

        return reply.status(500).send({
          error: true,
          message: 'Failed to start agent run',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // GET /api/work-items/:id/agent-runs - List agent runs for a WorkItem
  server.get<{ Params: { id: string } }>(
    '/api/work-items/:id/agent-runs',
    async (request, reply) => {
      const workItem = await workItemsRepository.findById(request.params.id);
      if (!workItem) {
        return reply.status(404).send({
          error: true,
          message: 'WorkItem not found',
        });
      }

      const agentRuns = await agentRunsRepository.findByWorkItemId(request.params.id);
      return agentRuns.map(agentRunToDTO);
    }
  );

  // GET /api/agent-runs/:id - Get agent run by ID
  server.get<{ Params: { id: string } }>('/api/agent-runs/:id', async (request, reply) => {
    const agentRun = await agentRunsRepository.findById(request.params.id);

    if (!agentRun) {
      return reply.status(404).send({
        error: true,
        message: 'Agent run not found',
      });
    }

    return agentRunToDTO(agentRun);
  });

  // POST /api/agent-runs/:id/cancel - Cancel agent run
  server.post<{ Params: { id: string } }>('/api/agent-runs/:id/cancel', async (request, reply) => {
    const agentRun = await agentRunsRepository.findById(request.params.id);

    if (!agentRun) {
      return reply.status(404).send({
        error: true,
        message: 'Agent run not found',
      });
    }

    // Delegate to AgentService
    await agentService.cancelTask(request.params.id);

    const updated = await agentRunsRepository.findById(request.params.id);

    const response = CancelAgentRunResponseSchema.parse({
      message: 'Agent run cancelled',
      id: request.params.id,
      agentRun: agentRunToDTO(updated ?? agentRun),
    });
    return reply.status(200).send(response);
  });

  // GET /api/agent-runs/:id/stdout - Get stdout log for an agent run
  server.get<{ Params: { id: string } }>('/api/agent-runs/:id/stdout', async (request, reply) => {
    const agentRun = await agentRunsRepository.findById(request.params.id);

    if (!agentRun) {
      return reply.status(404).send({
        error: true,
        message: 'Agent run not found',
      });
    }

    if (!agentRun.stdoutPath) {
      return reply.status(404).send({
        error: true,
        message: 'Stdout log not found for this agent run',
      });
    }

    try {
      const content = await fs.readFile(agentRun.stdoutPath, 'utf-8');
      return reply.type('text/plain').send(content);
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to read stdout log',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /api/agent-runs/:id/stderr - Get stderr log for an agent run
  server.get<{ Params: { id: string } }>('/api/agent-runs/:id/stderr', async (request, reply) => {
    const agentRun = await agentRunsRepository.findById(request.params.id);

    if (!agentRun) {
      return reply.status(404).send({
        error: true,
        message: 'Agent run not found',
      });
    }

    if (!agentRun.stderrPath) {
      return reply.status(404).send({
        error: true,
        message: 'Stderr log not found for this agent run',
      });
    }

    try {
      const content = await fs.readFile(agentRun.stderrPath, 'utf-8');
      return reply.type('text/plain').send(content);
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to read stderr log',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /api/agent-runs/:id/logs - Get both stdout and stderr logs for an agent run
  server.get<{ Params: { id: string } }>('/api/agent-runs/:id/logs', async (request, reply) => {
    const agentRun = await agentRunsRepository.findById(request.params.id);

    if (!agentRun) {
      return reply.status(404).send({
        error: true,
        message: 'Agent run not found',
      });
    }

    const result: { stdout?: string; stderr?: string; error?: string } = {};

    try {
      if (agentRun.stdoutPath) {
        result.stdout = await fs.readFile(agentRun.stdoutPath, 'utf-8');
      }
      if (agentRun.stderrPath) {
        result.stderr = await fs.readFile(agentRun.stderrPath, 'utf-8');
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  });

  // GET /api/agent-runs/:id/logs/stream - SSE stream for stdout and stderr logs
  server.get<{ Params: { id: string } }>(
    '/api/agent-runs/:id/logs/stream',
    async (request, reply) => {
      const agentRun = await agentRunsRepository.findById(request.params.id);

      if (!agentRun) {
        return reply.status(404).send({
          error: true,
          message: 'Agent run not found',
        });
      }

      // Set SSE headers
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      let stdoutWatcher: ReturnType<typeof watch> | null = null;
      let stderrWatcher: ReturnType<typeof watch> | null = null;
      let stdoutPosition = 0;
      let stderrPosition = 0;

      const sendSSE = (event: string, data: string) => {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const readAndSendLogs = async (
        logPath: string | null,
        stream: 'stdout' | 'stderr',
        position: number
      ): Promise<number> => {
        if (!logPath) return position;

        try {
          const stats = await fs.stat(logPath);
          if (stats.size > position) {
            const fileHandle = await fs.open(logPath, 'r');
            const buffer = Buffer.alloc(stats.size - position);
            await fileHandle.read(buffer, 0, stats.size - position, position);
            await fileHandle.close();

            const newContent = buffer.toString('utf-8');
            sendSSE(stream, newContent);
            return stats.size;
          }
        } catch (error) {
          // File might not exist yet or be locked
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.error(`Error reading ${stream} log:`, error);
          }
        }

        return position;
      };

      // Send initial logs if they exist
      try {
        if (agentRun.stdoutPath) {
          const initialStdout = await fs.readFile(agentRun.stdoutPath, 'utf-8');
          if (initialStdout) {
            sendSSE('stdout', initialStdout);
            stdoutPosition = initialStdout.length;
          }
        }
        if (agentRun.stderrPath) {
          const initialStderr = await fs.readFile(agentRun.stderrPath, 'utf-8');
          if (initialStderr) {
            sendSSE('stderr', initialStderr);
            stderrPosition = initialStderr.length;
          }
        }
      } catch {
        // Files might not exist yet
      }

      // Watch for changes in log files
      if (agentRun.stdoutPath) {
        try {
          stdoutWatcher = watch(agentRun.stdoutPath, async (eventType) => {
            if (eventType === 'change') {
              stdoutPosition = await readAndSendLogs(agentRun.stdoutPath, 'stdout', stdoutPosition);
            }
          });
        } catch {
          // File might not exist yet, will be created later
        }
      }

      if (agentRun.stderrPath) {
        try {
          stderrWatcher = watch(agentRun.stderrPath, async (eventType) => {
            if (eventType === 'change') {
              stderrPosition = await readAndSendLogs(agentRun.stderrPath, 'stderr', stderrPosition);
            }
          });
        } catch {
          // File might not exist yet, will be created later
        }
      }

      // Get log file paths - use database paths or derive from run ID
      const getStdoutPath = async (): Promise<string | null> => {
        if (agentRun.stdoutPath) {
          return agentRun.stdoutPath;
        }
        // If path not in database yet, try to derive it
        try {
          const logsDir = STORAGE_CONFIG.logsDir;
          const derivedPath = path.join(logsDir, `agent-run-${request.params.id}-stdout.log`);
          const stats = await fs.stat(derivedPath);
          if (stats.isFile()) {
            return derivedPath;
          }
        } catch {
          // File doesn't exist yet
        }
        return null;
      };

      const getStderrPath = async (): Promise<string | null> => {
        if (agentRun.stderrPath) {
          return agentRun.stderrPath;
        }
        // If path not in database yet, try to derive it
        try {
          const logsDir = STORAGE_CONFIG.logsDir;
          const derivedPath = path.join(logsDir, `agent-run-${request.params.id}-stderr.log`);
          const stats = await fs.stat(derivedPath);
          if (stats.isFile()) {
            return derivedPath;
          }
        } catch {
          // File doesn't exist yet
        }
        return null;
      };

      // Poll for new content every 100ms for faster real-time streaming
      // This is more frequent than the 100ms flush interval, ensuring we catch updates quickly
      const pollInterval = setInterval(async () => {
        const stdoutPath = await getStdoutPath();
        if (stdoutPath) {
          stdoutPosition = await readAndSendLogs(stdoutPath, 'stdout', stdoutPosition);
        }
        const stderrPath = await getStderrPath();
        if (stderrPath) {
          stderrPosition = await readAndSendLogs(stderrPath, 'stderr', stderrPosition);
        }
      }, 100);

      // Keep connection alive
      const keepAliveInterval = setInterval(() => {
        try {
          reply.raw.write(': keepalive\n\n');
        } catch {
          // Connection might be closed
        }
      }, 30000);

      // Cleanup on client disconnect
      const cleanup = () => {
        clearInterval(pollInterval);
        clearInterval(keepAliveInterval);
        if (stdoutWatcher) {
          stdoutWatcher.close();
        }
        if (stderrWatcher) {
          stderrWatcher.close();
        }
        try {
          reply.raw.end();
        } catch {
          // Connection might already be closed
        }
      };

      request.raw.on('close', cleanup);
      request.raw.on('error', cleanup);
    }
  );
}
