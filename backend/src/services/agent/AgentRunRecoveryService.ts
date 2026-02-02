/**
 * AgentRunRecoveryService
 * Recovers interrupted agent runs on service restart by checking if their PIDs are still running.
 * If a PID doesn't exist, the WorkItem is resumed by sending "Continue" message.
 */

import { agentRunsRepository } from '../../repositories/AgentRunsRepository.js';
import { workItemsRepository } from '../../repositories/WorkItemsRepository.js';
import { workflowEventBus } from '../workflow/WorkflowEventBus.js';
import { openCodeAgentAdapter } from './OpenCodeAgentAdapter.js';
import { claudeCodeAgentAdapter } from './ClaudeCodeAgentAdapter.js';

/**
 * Check if a process with the given PID is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // On Unix-like systems, sending signal 0 to a process checks if it exists
    // This doesn't kill the process, just checks if it's alive
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // If the error is ESRCH (no such process), the process doesn't exist
    // If it's EPERM (permission denied), the process exists but we can't signal it
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ESRCH') {
      return false;
    }
    // For EPERM or other errors, assume the process exists (safer default)
    return true;
  }
}

export class AgentRunRecoveryService {
  /**
   * Recover interrupted agent runs on service startup
   * For every unfinished WorkItem (status='running'), verify its PID exists.
   * If missing, treat the process as unexpectedly terminated and resume the WorkItem.
   */
  async recoverInterruptedRuns(): Promise<void> {
    console.log('[AgentRunRecoveryService] Starting recovery of interrupted agent runs...');

    try {
      // Find all agent runs with status 'running'
      const allWorkItems = await workItemsRepository.findAll();
      const unfinishedRuns: Array<{ workItemId: string; agentRunId: string; pid: number | null }> =
        [];

      for (const workItem of allWorkItems) {
        const agentRuns = await agentRunsRepository.findByWorkItemId(workItem.id);
        for (const run of agentRuns) {
          if (run.status === 'running') {
            unfinishedRuns.push({
              workItemId: workItem.id,
              agentRunId: run.id,
              pid: run.pid ?? null,
            });
          }
        }
      }

      console.log(
        `[AgentRunRecoveryService] Found ${unfinishedRuns.length} unfinished agent runs to check`
      );

      // Check each unfinished run
      for (const { workItemId, agentRunId, pid } of unfinishedRuns) {
        if (!pid) {
          console.log(
            `[AgentRunRecoveryService] Agent run ${agentRunId} has no PID, marking as failed`
          );
          await agentRunsRepository.update(agentRunId, {
            status: 'failed',
            finishedAt: new Date(),
            log: 'Process terminated unexpectedly (no PID recorded)',
          });
          // Release lock on WorkItem
          await workItemsRepository.releaseLock(workItemId, agentRunId);
          continue;
        }

        // Get the agent run to determine which adapter was used
        const agentRun = await agentRunsRepository.findById(agentRunId);
        if (!agentRun) {
          console.error(
            `[AgentRunRecoveryService] Agent run ${agentRunId} not found, skipping recovery`
          );
          continue;
        }

        // Check if PID exists in memory cache (adapter's processPids map)
        // Use the appropriate adapter based on agentKey
        let pidInCache = false;
        if (agentRun.agentKey === 'opencode') {
          pidInCache = openCodeAgentAdapter.hasPid(agentRunId);
        } else if (agentRun.agentKey === 'claudecode') {
          pidInCache = claudeCodeAgentAdapter.hasPid(agentRunId);
        }

        // If PID is not in cache, check if the process is still running
        if (!pidInCache) {
          const processExists = isProcessRunning(pid);
          if (!processExists) {
            console.log(
              `[AgentRunRecoveryService] Process ${pid} for agent run ${agentRunId} is not running, resuming WorkItem ${workItemId}`
            );

            // Mark the run as failed since the process is dead
            await agentRunsRepository.update(agentRunId, {
              status: 'failed',
              finishedAt: new Date(),
              log: `Process ${pid} terminated unexpectedly. Resuming WorkItem.`,
            });
            // Release lock on WorkItem before resuming
            await workItemsRepository.releaseLock(workItemId, agentRunId);

            // If the agent run has a sessionId, we can resume it
            if (agentRun.sessionId) {
              // Resume the WorkItem by emitting workitem.task.resume event with "Continue" message
              console.log(
                `[AgentRunRecoveryService] Resuming WorkItem ${workItemId} with sessionId ${agentRun.sessionId}`
              );
              await workflowEventBus.emit({
                eventId: crypto.randomUUID(),
                at: new Date().toISOString(),
                subject: { kind: 'workitem', id: workItemId },
                type: 'workitem.task.resume',
                workItemId,
                data: {
                  originalAgentRunId: agentRunId,
                  sessionId: agentRun.sessionId,
                  prompt: 'Continue',
                  title: (await workItemsRepository.findById(workItemId))?.title || '',
                  body: (await workItemsRepository.findById(workItemId))?.body || '',
                },
              });
            } else {
              console.log(
                `[AgentRunRecoveryService] Agent run ${agentRunId} has no sessionId, cannot resume`
              );
            }
          } else {
            // Process exists but not in cache - restore it to cache
            console.log(
              `[AgentRunRecoveryService] Process ${pid} exists but not in cache, restoring to cache for agent run ${agentRunId}`
            );
            // Restore PID to the appropriate adapter's cache
            // Note: We access the protected processPids map directly since we need to restore state
            if (agentRun.agentKey === 'opencode') {
              (openCodeAgentAdapter as any).processPids?.set(agentRunId, pid);
            } else if (agentRun.agentKey === 'claudecode') {
              (claudeCodeAgentAdapter as any).processPids?.set(agentRunId, pid);
            }
          }
        } else {
          console.log(
            `[AgentRunRecoveryService] Agent run ${agentRunId} PID ${pid} is in cache, process is running`
          );
        }
      }

      console.log('[AgentRunRecoveryService] Recovery completed');
    } catch (error) {
      console.error('[AgentRunRecoveryService] Error during recovery:', error);
      // Don't throw - recovery failure shouldn't prevent server startup
    }
  }
}

export const agentRunRecoveryService = new AgentRunRecoveryService();
