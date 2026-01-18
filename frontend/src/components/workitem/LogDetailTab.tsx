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

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Terminal } from 'lucide-react';
import { useStreamingLogs } from '@/hooks/useStreamingLogs';
import { LogPane } from '@/components/ui/LogPane';
import { agentRunsApi } from '@/lib/api';

export interface LogDetailTabProps {
  workItemId: string;
  agentRunId: string;
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

  // Fetch agent run to get its status
  const { data: agentRun } = useQuery({
    queryKey: ['agent-run', agentRunId],
    queryFn: async () => {
      const response = await agentRunsApi.get(agentRunId);
      return response.data;
    },
  });

  // Use the reusable streaming logs hook
  const { stdout, stderr, isLoading, isStreaming, sseConnected } = useStreamingLogs(
    agentRunId,
    true,
    agentRun?.status
  );

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
