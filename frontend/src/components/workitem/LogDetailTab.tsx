/**
 * LogDetailTab Component
 *
 * Displays stdout and stderr logs for an agent run in two separate panes
 *
 * Features:
 * - Side-by-side panes for stdout and stderr
 * - Copy button for each log pane
 * - Loading and error states
 * - Real-time streaming via SSE (Server-Sent Events)
 * - Responsive layout (stacked on smaller screens)
 */

import { useState, useEffect, useRef } from 'react';
import { Copy, Terminal } from 'lucide-react';
import { agentRunsApi } from '@/lib/api';

export interface LogDetailTabProps {
  workItemId: string;
  agentRunId: string;
}

interface LogPaneProps {
  title: string;
  content: string;
  accentColor: string;
  onCopy: () => void;
  showCopyFeedback: boolean;
  isStreaming?: boolean;
  isLoading?: boolean;
}

/**
 * LogPane component - displays a single log pane with header and content
 */
function LogPane({
  title,
  content,
  accentColor,
  onCopy,
  showCopyFeedback,
  isStreaming = false,
  isLoading = false,
}: LogPaneProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [content]);

  return (
    <div className="flex h-full flex-col rounded-lg border bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center space-x-2">
          <Terminal className={`h-4 w-4 ${accentColor}`} />
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        <button
          onClick={onCopy}
          className="flex items-center space-x-1 rounded-md px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          disabled={!content}
          title={content ? 'Copy to clipboard' : 'Nothing to copy'}
        >
          <Copy className="h-4 w-4" />
          <span>{showCopyFeedback ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-gray-900">
        {content ? (
          <pre className="whitespace-pre-wrap p-4 font-mono text-sm text-gray-100">{content}</pre>
        ) : (
          <div className="flex h-full items-center justify-center">
            {isLoading || isStreaming ? (
              <div className="flex flex-col items-center space-y-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-100" />
                <p className="text-sm text-gray-400">
                  {isStreaming ? 'Waiting for logs...' : 'Loading logs...'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No logs available</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * LogDetailTab component
 *
 * @param workItemId - The ID of the WorkItem
 * @param agentRunId - The ID of the agent run to display logs for
 */
export function LogDetailTab({ workItemId: _workItemId, agentRunId }: LogDetailTabProps) {
  const [showStdoutCopyFeedback, setShowStdoutCopyFeedback] = useState(false);
  const [showStderrCopyFeedback, setShowStderrCopyFeedback] = useState(false);
  const [stdout, setStdout] = useState<string>('');
  const [stderr, setStderr] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasReceivedLogsRef = useRef({ stdout: false, stderr: false });

  // Set up SSE streaming for real-time updates (for running tasks)
  // This should be set up first to catch logs as soon as they're available
  useEffect(() => {
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
  }, [agentRunId]);

  // Fetch initial logs as a fallback (for completed runs or if SSE doesn't work)
  // This runs after SSE is set up, so SSE will take precedence
  useEffect(() => {
    // Only fetch if SSE hasn't connected yet or if we haven't received any logs
    // Give SSE a chance to send initial logs first
    const fetchInitialLogs = async () => {
      // Wait a bit to see if SSE sends initial logs
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // If SSE is connected and we've received logs, skip the fetch
      if (
        sseConnected &&
        (hasReceivedLogsRef.current.stdout || hasReceivedLogsRef.current.stderr)
      ) {
        setIsLoading(false);
        return;
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
        console.error('Failed to fetch initial logs:', err);
        // If SSE is connected, don't treat this as an error
        if (!sseConnected) {
          setIsLoading(false);
        }
      }
    };

    fetchInitialLogs();
  }, [agentRunId, sseConnected]);

  // Handle copy to clipboard for stdout
  const handleCopyStdout = async () => {
    if (stdout) {
      try {
        await navigator.clipboard.writeText(stdout);
        setShowStdoutCopyFeedback(true);
        setTimeout(() => setShowStdoutCopyFeedback(false), 2000);
      } catch (err) {
        console.error('Failed to copy stdout:', err);
      }
    }
  };

  // Handle copy to clipboard for stderr
  const handleCopyStderr = async () => {
    if (stderr) {
      try {
        await navigator.clipboard.writeText(stderr);
        setShowStderrCopyFeedback(true);
        setTimeout(() => setShowStderrCopyFeedback(false), 2000);
      } catch (err) {
        console.error('Failed to copy stderr:', err);
      }
    }
  };

  // Display logs in two panes (always show, even if empty)
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h2 className="text-lg font-semibold text-gray-900">Agent Run Logs</h2>
          {isLoading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          )}
          {isStreaming && !isLoading && (
            <span className="flex items-center space-x-1 text-xs text-green-600">
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-600" />
              <span>Streaming</span>
            </span>
          )}
        </div>
      </div>

      {/* Log Panes - Always visible */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Stdout Pane */}
        <div className="h-[600px]">
          <LogPane
            title="Stdout"
            content={stdout}
            accentColor="text-green-400"
            onCopy={handleCopyStdout}
            showCopyFeedback={showStdoutCopyFeedback}
            isStreaming={isStreaming && sseConnected}
            isLoading={isLoading && !sseConnected}
          />
        </div>

        {/* Stderr Pane */}
        <div className="h-[600px]">
          <LogPane
            title="Stderr"
            content={stderr}
            accentColor="text-red-400"
            onCopy={handleCopyStderr}
            showCopyFeedback={showStderrCopyFeedback}
            isStreaming={isStreaming && sseConnected}
            isLoading={isLoading && !sseConnected}
          />
        </div>
      </div>
    </div>
  );
}
