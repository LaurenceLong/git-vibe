/**
 * Dashboard Tab Component
 * Displays Work Items and Pull Requests grouped by status columns
 * - Queued: Work Item with agent runs in queued status
 * - Running: Work Item with agent runs in running status
 * - Review: PR with status open
 * - Sync Pending: PR with status merged but no syncedCommitSha
 * - Done: PR with status closed OR merged with syncedCommitSha
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { workItemsApi, pullRequestsApi, agentRunsApi } from '@/lib/api';
import { Project, WorkItem, PullRequest, AgentRun } from '@/types';
import { safeParseIso } from '@/lib/datetime';

export interface DashboardTabProps {
  project: Project;
}

interface DashboardItem {
  id: string;
  title: string;
  type: 'workitem' | 'pr';
  createdAt: string;
  workItem?: WorkItem;
  pullRequest?: PullRequest;
}

export function DashboardTab({ project }: DashboardTabProps) {
  const navigate = useNavigate();

  // Fetch all work items for the project
  const { data: workItemsResponse, isLoading: isLoadingWorkItems } = useQuery({
    queryKey: ['workitems', project.id, 'all'],
    queryFn: () => workItemsApi.list(project.id, 1, 1000),
  });

  const workItems = workItemsResponse?.data?.data || [];

  // Fetch all pull requests for the project
  const { data: pullRequestsResponse, isLoading: isLoadingPRs } = useQuery({
    queryKey: ['pull-requests', project.id, 'all'],
    queryFn: () => pullRequestsApi.list(project.id, 1, 1000),
  });

  const pullRequests = pullRequestsResponse?.data?.data || [];

  // Fetch agent runs for all work items
  const { data: agentRunsMap } = useQuery({
    queryKey: ['workitems-agent-runs-dashboard', workItems.map((wi) => wi.id)],
    queryFn: async () => {
      const runsMap = new Map<string, AgentRun[]>();
      await Promise.all(
        workItems.map(async (workItem) => {
          try {
            const response = await agentRunsApi.listByWorkItem(workItem.id);
            runsMap.set(workItem.id, response.data);
          } catch (error) {
            console.error(`Failed to fetch agent runs for work item ${workItem.id}:`, error);
            runsMap.set(workItem.id, []);
          }
        })
      );
      return runsMap;
    },
    enabled: workItems.length > 0,
  });

  // Get the latest agent run status for a work item
  const getLatestAgentRunStatus = (workItemId: string): 'queued' | 'running' | null => {
    const runs = agentRunsMap?.get(workItemId) || [];
    if (runs.length === 0) return null;

    // Sort by createdAt descending and get the most recent run
    const sortedRuns = [...runs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const latestRun = sortedRuns[0];

    if (latestRun.status === 'queued') return 'queued';
    if (latestRun.status === 'running') return 'running';
    return null;
  };

  // Group items by status
  const groupedItems = useMemo(() => {
    const inQueue: DashboardItem[] = [];
    const inProgress: DashboardItem[] = [];
    const inReview: DashboardItem[] = [];
    const waitingSync: DashboardItem[] = [];
    const closed: DashboardItem[] = [];

    // Process work items
    workItems.forEach((workItem: WorkItem) => {
      // Only show open work items
      if (workItem.status !== 'open') return;

      const agentRunStatus = getLatestAgentRunStatus(workItem.id);

      const item: DashboardItem = {
        id: workItem.id,
        title: workItem.title,
        type: 'workitem',
        createdAt: workItem.createdAt,
        workItem,
      };

      if (agentRunStatus === 'queued') {
        inQueue.push(item);
      } else if (agentRunStatus === 'running') {
        inProgress.push(item);
      } else {
        // Work item is open but no active agent run - could be in progress too
        // For now, if there's no active run, we'll consider it potentially in progress
        // but the user's requirement specifies only "running" status, so we'll skip these
        // unless they have at least one agent run (which might have completed)
      }
    });

    // Process pull requests
    pullRequests.forEach((pr: PullRequest) => {
      const item: DashboardItem = {
        id: pr.id,
        title: pr.title,
        type: 'pr',
        createdAt: pr.createdAt,
        pullRequest: pr,
      };

      if (pr.status === 'open') {
        inReview.push(item);
      } else if (pr.status === 'merged') {
        if (pr.syncedCommitSha) {
          closed.push(item);
        } else {
          waitingSync.push(item);
        }
      } else if (pr.status === 'closed') {
        closed.push(item);
      }
    });

    return { inQueue, inProgress, inReview, waitingSync, closed };
  }, [workItems, pullRequests, agentRunsMap]);

  const handleItemClick = (item: DashboardItem) => {
    if (item.type === 'workitem') {
      navigate({
        to: '/projects/$projectName/workitems',
        params: { projectName: project.name },
        search: { status: 'all', type: 'all', workItemId: item.id },
      });
    } else {
      navigate({
        to: '/projects/$projectName/pullrequests',
        params: { projectName: project.name },
        search: { status: 'all', prId: item.id },
      });
    }
  };

  // Format date with time in HH:MM:SS format
  const formatDateWithTime = (dateStr: string): string => {
    const date = safeParseIso(dateStr);
    if (!date) return '—';

    const datePart = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
    }).format(date);

    const timePart = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);

    return `${datePart} ${timePart}`;
  };

  const renderItem = (item: DashboardItem) => (
    <div
      key={item.id}
      onClick={() => handleItemClick(item)}
      className="flex min-h-[80px] cursor-pointer flex-col rounded-lg border bg-white p-3 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex-1 space-y-1">
        <h4 className="line-clamp-3 text-xs font-medium text-gray-900">{item.title}</h4>
        <div className="mt-auto text-xs text-gray-500">{formatDateWithTime(item.createdAt)}</div>
      </div>
    </div>
  );

  const renderColumn = (title: string, items: DashboardItem[], color: string) => (
    <div className="flex flex-col">
      <div className={`mb-3 rounded-lg ${color} px-3 py-2`}>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-xs text-gray-600">{items.length} items</p>
      </div>
      <div className="min-h-[200px] space-y-2">
        {items.length > 0 ? (
          items.map(renderItem)
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm text-gray-500">No items</p>
          </div>
        )}
      </div>
    </div>
  );

  if (isLoadingWorkItems || isLoadingPRs) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Dashboard</h2>
        <p className="mt-1 text-sm text-gray-600">
          Overview of Work Items and Pull Requests by status
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        {renderColumn('Queued', groupedItems.inQueue, 'bg-yellow-50 border border-yellow-200')}
        {renderColumn('Running', groupedItems.inProgress, 'bg-blue-50 border border-blue-200')}
        {renderColumn('Review', groupedItems.inReview, 'bg-purple-50 border border-purple-200')}
        {renderColumn(
          'Sync Pending',
          groupedItems.waitingSync,
          'bg-orange-50 border border-orange-200'
        )}
        {renderColumn('Done', groupedItems.closed, 'bg-gray-50 border border-gray-200')}
      </div>
    </div>
  );
}
