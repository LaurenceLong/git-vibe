/**
 * useStreamingLogs Hook
 *
 * Provides real-time streaming logs for an agent run via SSE (Server-Sent Events)
 * with intelligent fallback to fetch API for completed runs.
 *
 * Features:
 * - SSE streaming for real-time updates
 * - Smart fallback to fetch API only when needed
 * - Prevents unnecessary API calls
 * - Proper cleanup on unmount
 *
 * @example
 * ```tsx
 * function LogComponent({ agentRunId }: { agentRunId: string }) {
 *   const { stdout, stderr, isLoading, isStreaming, sseConnected } = useStreamingLogs(agentRunId);
 *
 *   return (
 *     <div>
 *       <pre>{stdout}</pre>
 *       <pre>{stderr}</pre>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useRef } from 'react';
import { agentRunsApi } from '@/lib/api';

export interface UseStreamingLogsResult {
  stdout: string;
  stderr: string;
  isLoading: boolean;
  isStreaming: boolean;
  sseConnected: boolean;
}

/**
 * Hook to stream logs for an agent run
 *
 * @param agentRunId - The ID of the agent run to stream logs for
 * @param enabled - Whether streaming should be enabled (default: true)
 * @param taskStatus - Optional task status to determine if task is actually running
 * @returns Streaming logs state
 */
export function useStreamingLogs(
  agentRunId: string,
  enabled: boolean = true,
  taskStatus?: string
): UseStreamingLogsResult {
  const [stdout, setStdout] = useState<string>('');
  const [stderr, setStderr] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasReceivedLogsRef = useRef({ stdout: false, stderr: false });

  // Set up SSE streaming for real-time updates (for running tasks)
  // This should be set up first to catch logs as soon as they're available
  // Only set up SSE when enabled is true
  useEffect(() => {
    if (!enabled || !agentRunId) {
      return;
    }

    // Create SSE connection
    const eventSource = new EventSource(`/api/agent-runs/${agentRunId}/logs/stream`);
    eventSourceRef.current = eventSource;

    // Handle stdout events
    eventSource.addEventListener('stdout', (event) => {
      try {
        const data = JSON.parse(event.data) as string;
        if (data) {
          setStdout((prev) => prev + data);
          hasReceivedLogsRef.current.stdout = true;
        }
        setIsStreaming(true);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to parse stdout event:', err);
      }
    });

    // Handle stderr events
    eventSource.addEventListener('stderr', (event) => {
      try {
        const data = JSON.parse(event.data) as string;
        if (data) {
          setStderr((prev) => prev + data);
          hasReceivedLogsRef.current.stderr = true;
        }
        setIsStreaming(true);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to parse stderr event:', err);
      }
    });

    // Handle errors
    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      // Only close if connection is actually closed
      if (eventSource.readyState === EventSource.CLOSED) {
        eventSource.close();
        setIsStreaming(false);
        setSseConnected(false);
      }
    };

    // Handle open event - connection established
    eventSource.onopen = () => {
      setSseConnected(true);
      setIsStreaming(true);
      // Don't set isLoading to false immediately - wait for first data or timeout
      // This allows us to show loading state while waiting for initial logs
    };

    // Cleanup on unmount
    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
      setSseConnected(false);
      hasReceivedLogsRef.current = { stdout: false, stderr: false };
    };
  }, [agentRunId, enabled]);

  // Fetch logs - always fetch (for completed runs or if SSE doesn't work)
  // When enabled is false, fetch immediately without waiting for SSE
  // When enabled is true, wait a bit to see if SSE sends initial logs first
  useEffect(() => {
    if (!agentRunId) {
      return;
    }

    const fetchLogs = async () => {
      // If streaming is enabled, wait a bit to see if SSE sends initial logs first
      if (enabled) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // If SSE is connected and we've received logs, skip the fetch
        if (
          sseConnected &&
          (hasReceivedLogsRef.current.stdout || hasReceivedLogsRef.current.stderr)
        ) {
          setIsLoading(false);
          return;
        }
      }

      try {
        const logs = await agentRunsApi.getLogs(agentRunId);
        // Only update if we haven't received logs via SSE
        if (!hasReceivedLogsRef.current.stdout && logs.stdout) {
          setStdout(logs.stdout);
          hasReceivedLogsRef.current.stdout = true;
        }
        if (!hasReceivedLogsRef.current.stderr && logs.stderr) {
          setStderr(logs.stderr);
          hasReceivedLogsRef.current.stderr = true;
        }
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to fetch logs:', err);
        // If SSE is connected, don't treat this as an error
        if (!sseConnected) {
          setIsLoading(false);
        }
      }
    };

    fetchLogs();
  }, [agentRunId, enabled, sseConnected]);

  // Determine if we should show streaming based on task status
  // Only show streaming if task is actually running or queued
  const isActuallyStreaming =
    isStreaming &&
    sseConnected &&
    (taskStatus === 'running' || taskStatus === 'queued' || !taskStatus);

  return {
    stdout,
    stderr,
    isLoading,
    isStreaming: isActuallyStreaming,
    sseConnected,
  };
}
