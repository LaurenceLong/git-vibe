/**
 * WorkItemDetail Component
 *
 * WorkItem detail view within project context
 * WorkItems are task definitions only - Changesets handle workspaces
 */

import { useState, useEffect, useCallback } from 'react';
import {
  useWorkItem,
  useCloseWorkItem,
  useDeleteWorkItem,
  useStartWorkItemTask,
} from '@/hooks/useWorkItem';
import { ControlledTabs, Tab, TabPanel } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Calendar, ListTodo, X, RefreshCw, Play, Terminal } from 'lucide-react';
import { TaskManagementTab } from './TaskManagementTab';
import { PRStatusTab } from './PRStatusTab';
import { LogDetailTab } from './LogDetailTab';
import { workItemsApi } from '@/lib/api';

export interface WorkItemDetailProps {
  workItemId: string;
}

/**
 * WorkItemDetail component
 *
 * @param workItemId - The ID of WorkItem to display
 */
export function WorkItemDetail({ workItemId }: WorkItemDetailProps) {
  const [tasks, setTasks] = useState<
    Array<{
      id: string;
      status: string;
      createdAt: string;
      startedAt: string | null;
      finishedAt: string | null;
    }>
  >([]);
  const [actionLoading, setActionLoading] = useState(false);
  const { data: workItem, isLoading, error } = useWorkItem(workItemId);
  const { closeWorkItem, isLoading: isClosing } = useCloseWorkItem(workItemId);
  const { deleteWorkItem, isLoading: isDeleting } = useDeleteWorkItem(workItemId);
  const { startTask, isLoading: isStarting } = useStartWorkItemTask(workItemId);

  // Fetch tasks to check status
  const fetchTasks = useCallback(async () => {
    try {
      const response = await workItemsApi.getTasks(workItemId);
      // Sort tasks by createdAt descending to get the latest first
      const sortedTasks = [...(response.data || [])].sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA; // Descending order (newest first)
      });
      setTasks(sortedTasks);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  }, [workItemId]);

  // Get the latest task (first in sorted array, or last if not sorted)
  const latestTask = tasks.length > 0 ? tasks[0] : null;

  // Initial fetch and refresh when workItem changes

  useEffect(() => {
    fetchTasks();
  }, [workItemId, fetchTasks]);

  const handleClose = async () => {
    if (window.confirm('Are you sure you want to close this WorkItem?')) {
      await closeWorkItem();
    }
  };

  const handleDelete = async () => {
    if (
      window.confirm('Are you sure you want to delete this WorkItem? This action cannot be undone.')
    ) {
      await deleteWorkItem();
    }
  };

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await startTask();
      // Refresh tasks after starting
      await fetchTasks();
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!latestTask) return;
    if (!window.confirm('Are you sure you want to cancel this task?')) return;

    setActionLoading(true);
    try {
      await workItemsApi.cancelTask(workItemId, latestTask.id);
      await fetchTasks();
    } catch (err) {
      console.error('Failed to cancel task:', err);
      alert('Failed to cancel task. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestart = async () => {
    if (!latestTask) return;
    // First confirmation
    if (!window.confirm('Are you sure you want to restart this task?')) return;
    // Second confirmation for safety
    if (!window.confirm('This will restart the task. Are you really sure?')) return;

    setActionLoading(true);
    try {
      await workItemsApi.restartTask(workItemId, latestTask.id);
      await fetchTasks();
    } catch (err) {
      console.error('Failed to restart task:', err);
      alert('Failed to restart task. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // Determine which action button to show based on task status
  const getActionButton = () => {
    if (workItem?.status === 'closed') {
      return null;
    }

    if (!latestTask) {
      // No task yet, show Start button
      return (
        <Button
          variant="primary"
          size="sm"
          onClick={handleStart}
          loading={isStarting || actionLoading}
        >
          <Play className="mr-1 h-3 w-3" />
          Start
        </Button>
      );
    }

    switch (latestTask.status) {
      case 'queued':
      case 'running':
        // Show Cancel button for running/queued tasks
        return (
          <Button variant="danger" size="sm" onClick={handleCancel} loading={actionLoading}>
            <X className="mr-1 h-3 w-3" />
            Cancel
          </Button>
        );
      case 'failed':
      case 'cancelled':
        // Show Restart button for failed/cancelled tasks
        return (
          <Button variant="primary" size="sm" onClick={handleRestart} loading={actionLoading}>
            <RefreshCw className="mr-1 h-3 w-3" />
            Restart
          </Button>
        );
      case 'succeeded':
        // Show Restart button for completed tasks
        return (
          <Button variant="primary" size="sm" onClick={handleRestart} loading={actionLoading}>
            <RefreshCw className="mr-1 h-3 w-3" />
            Restart
          </Button>
        );
      default:
        return null;
    }
  };

  // Get task status display
  const getTaskStatusDisplay = () => {
    if (!latestTask) {
      return <span className="text-sm text-gray-500">No tasks yet</span>;
    }

    const statusColors: Record<string, string> = {
      queued: 'bg-yellow-100 text-yellow-800',
      running: 'bg-blue-100 text-blue-800',
      succeeded: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };

    const colorClass = statusColors[latestTask.status] || 'bg-gray-100 text-gray-800';

    return (
      <div className="flex items-center space-x-2">
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${colorClass}`}>
          {latestTask.status}
        </span>
        {latestTask.startedAt && (
          <span className="text-xs text-gray-500">
            Started: {new Date(latestTask.startedAt).toLocaleString()}
          </span>
        )}
      </div>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <Skeleton className="mb-4 h-8 w-3/4" />
          <Skeleton className="mb-2 h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <Skeleton className="mb-4 h-6 w-1/4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <div className="flex items-start space-x-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
          <div>
            <h3 className="font-medium text-red-900">Error loading WorkItem</h3>
            <p className="mt-1 text-sm text-red-700">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  // WorkItem not found
  if (!workItem) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
        <div className="flex items-start space-x-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-gray-600" />
          <div>
            <h3 className="font-medium text-gray-900">WorkItem not found</h3>
            <p className="mt-1 text-sm text-gray-600">The requested WorkItem could not be found.</p>
          </div>
        </div>
      </div>
    );
  }

  // Get status type for badge
  const getStatusType = (status: string): 'success' | 'error' | 'info' | 'neutral' | 'warning' => {
    switch (status) {
      case 'open':
        return 'success';
      case 'closed':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6">
      {/* WorkItem Header */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center space-x-2">
              <StatusBadge status={getStatusType(workItem.status)}>{workItem.status}</StatusBadge>
              <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                {workItem.type}
              </span>
              {/* Task Status Display */}
              {getTaskStatusDisplay()}
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">{workItem.title}</h1>
          </div>
          <div className="flex items-center space-x-2">
            {/* Multi-action control */}
            {getActionButton()}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClose}
              loading={isClosing}
              disabled={workItem.status === 'closed'}
            >
              Close
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} loading={isDeleting}>
              Delete
            </Button>
          </div>
        </div>

        {/* WorkItem Body */}
        {workItem.body && (
          <div className="mb-4 whitespace-pre-wrap text-gray-700">{workItem.body}</div>
        )}

        {/* WorkItem Metadata */}
        <div className="grid grid-cols-1 gap-3 border-t border-gray-200 pt-4 sm:grid-cols-2">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4" />
            <span>
              <span className="font-medium">Created:</span>{' '}
              {new Date(workItem.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4" />
            <span>
              <span className="font-medium">Updated:</span>{' '}
              {new Date(workItem.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-lg border bg-white shadow-sm">
        <ControlledTabs defaultValue="tasks">
          <Tab value="tasks">
            <span className="flex items-center space-x-1">
              <ListTodo className="h-4 w-4" />
              <span>Tasks</span>
            </span>
          </Tab>
          <Tab value="logs">
            <span className="flex items-center space-x-1">
              <Terminal className="h-4 w-4" />
              <span>Logs</span>
            </span>
          </Tab>
          <Tab value="discussion">Discussion</Tab>
          <Tab value="agent-config">Agent Config</Tab>
          <Tab value="pr-status">PR Status</Tab>
          <TabPanel value="tasks">
            <div className="p-6">
              <TaskManagementTab workItemId={workItemId} />
            </div>
          </TabPanel>
          <TabPanel value="logs">
            <div className="p-6">
              {latestTask ? (
                <LogDetailTab workItemId={workItemId} agentRunId={latestTask.id} />
              ) : (
                <div className="py-12 text-center">
                  <Terminal className="mx-auto mb-3 h-12 w-12 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-900">No logs available</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Logs will appear here once a task is started
                  </p>
                </div>
              )}
            </div>
          </TabPanel>
          <TabPanel value="discussion">
            <div className="p-6">
              <div className="py-12 text-center">
                <p className="text-sm text-gray-600">Discussion tab - Coming soon</p>
              </div>
            </div>
          </TabPanel>
          <TabPanel value="agent-config">
            <div className="p-6">
              <div className="py-12 text-center">
                <p className="text-sm text-gray-600">Agent Config tab - Coming soon</p>
              </div>
            </div>
          </TabPanel>
          <TabPanel value="pr-status">
            <div className="p-6">
              <PRStatusTab workItemId={workItemId} />
            </div>
          </TabPanel>
        </ControlledTabs>
      </div>
    </div>
  );
}
