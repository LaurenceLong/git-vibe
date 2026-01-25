/**
 * Global Dashboard - displays all work items and PRs across all projects
 * Same level as Projects in the app navigation
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { workItemsApi, pullRequestsApi, agentRunsApi, projectsApi } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Project, WorkItem, PullRequest, AgentRun } from '@/types';
import { safeParseIso } from '@/lib/datetime';
import { createFileRoute } from '@tanstack/react-router';
import { Pagination } from '@/components/ui/Pagination';

const PAGE_SIZE = 20;

export const Route = createFileRoute('/dashboard')({
  component: GlobalDashboard,
});

interface DashboardItem {
  id: string;
  title: string;
  type: 'workitem' | 'pr';
  createdAt: string;
  projectId: string;
  projectName: string;
  workItem?: WorkItem;
  pullRequest?: PullRequest;
}

function GlobalDashboard() {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch all projects for name lookup
  const { data: projectsResponse } = useQuery({
    queryKey: ['projects', 1, 500],
    queryFn: () => projectsApi.list(1, 500),
  });
  const projects = projectsResponse?.data?.data || [];
  const projectIdToName = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach((p: Project) => m.set(p.id, p.name));
    return m;
  }, [projects]);

  // Fetch all work items (no project filter) - standard key ['workitems', filters]
  const { data: workItemsResponse, isLoading: isLoadingWorkItems } = useQuery({
    queryKey: queryKeys.workitems({}),
    queryFn: () => workItemsApi.list(undefined, 1, 1000),
    refetchInterval: 10_000, // statuses can change externally
  });
  const workItems = workItemsResponse?.data?.data || [];

  // Fetch all pull requests (no project filter)
  const { data: pullRequestsResponse, isLoading: isLoadingPRs } = useQuery({
    queryKey: ['pull-requests', 'all'],
    queryFn: () => pullRequestsApi.list(undefined, 1, 1000),
  });
  const pullRequests = pullRequestsResponse?.data?.data || [];

  // Fetch agent runs for all work items
  const { data: agentRunsMap } = useQuery({
    queryKey: ['workitems-agent-runs-global-dashboard', workItems.map((wi) => wi.id)],
    queryFn: async () => {
      const runsMap = new Map<string, AgentRun[]>();
      await Promise.all(
        workItems.map(async (workItem) => {
          try {
            const response = await agentRunsApi.listByWorkItem(workItem.id);
            runsMap.set(workItem.id, response.data);
          } catch {
            runsMap.set(workItem.id, []);
          }
        })
      );
      return runsMap;
    },
    enabled: workItems.length > 0,
  });

  const getLatestAgentRunStatus = (workItemId: string): 'queued' | 'running' | 'idle' => {
    const runs = agentRunsMap?.get(workItemId) || [];
    if (runs.length === 0) return 'idle';
    const sortedRuns = [...runs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const latestRun = sortedRuns[0];
    if (latestRun.status === 'queued') return 'queued';
    if (latestRun.status === 'running') return 'running';
    return 'idle';
  };

  type ItemDisplayStatus =
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'closed'
    | 'open'
    | 'sync-pending'
    | 'merged'
    | 'no-run';

  const getItemDisplayStatus = (item: DashboardItem): ItemDisplayStatus => {
    if (item.type === 'workitem' && item.workItem) {
      if (item.workItem.status === 'closed') return 'closed';
      const runs = agentRunsMap?.get(item.id) || [];
      if (runs.length === 0) return 'no-run';
      const sorted = [...runs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const status = sorted[0].status;
      if (
        status === 'queued' ||
        status === 'running' ||
        status === 'succeeded' ||
        status === 'failed' ||
        status === 'cancelled'
      )
        return status;
      return 'no-run';
    }
    if (item.type === 'pr' && item.pullRequest) {
      const pr = item.pullRequest;
      if (pr.status === 'open') return 'open';
      if (pr.status === 'merged') return pr.syncedCommitSha ? 'merged' : 'sync-pending';
      return 'closed';
    }
    return 'no-run';
  };

  const statusStyle: Record<
    ItemDisplayStatus,
    { label: string; borderColor: string; labelColor: string }
  > = {
    queued: {
      label: 'Queued',
      borderColor: 'border-l-amber-500 hover:border-l-amber-600',
      labelColor: 'text-amber-700',
    },
    running: {
      label: 'Running',
      borderColor: 'border-l-blue-400 hover:border-l-blue-600',
      labelColor: 'text-blue-700',
    },
    succeeded: {
      label: 'Succeeded',
      borderColor: 'border-l-emerald-500 hover:border-l-emerald-600',
      labelColor: 'text-emerald-700',
    },
    failed: {
      label: 'Failed',
      borderColor: 'border-l-red-500 hover:border-l-red-600',
      labelColor: 'text-red-700',
    },
    cancelled: {
      label: 'Cancelled',
      borderColor: 'border-l-gray-500 hover:border-l-gray-600',
      labelColor: 'text-gray-600',
    },
    closed: {
      label: 'Closed',
      borderColor: 'border-l-gray-500 hover:border-l-gray-600',
      labelColor: 'text-gray-600',
    },
    open: {
      label: 'Open',
      borderColor: 'border-l-purple-500 hover:border-l-purple-600',
      labelColor: 'text-purple-700',
    },
    'sync-pending': {
      label: 'Sync Pending',
      borderColor: 'border-l-orange-500 hover:border-l-orange-600',
      labelColor: 'text-orange-700',
    },
    merged: {
      label: 'Merged',
      borderColor: 'border-l-emerald-500 hover:border-l-emerald-600',
      labelColor: 'text-emerald-700',
    },
    'no-run': {
      label: 'No run',
      borderColor: 'border-l-slate-400 hover:border-l-slate-500',
      labelColor: 'text-slate-600',
    },
  };

  const groupedItems = useMemo(() => {
    const inQueue: DashboardItem[] = [];
    const inProgress: DashboardItem[] = [];
    const inReview: DashboardItem[] = [];
    const waitingSync: DashboardItem[] = [];
    const closed: DashboardItem[] = [];

    workItems.forEach((workItem: WorkItem) => {
      const projectName = projectIdToName.get(workItem.projectId) ?? 'Unknown';
      const item: DashboardItem = {
        id: workItem.id,
        title: workItem.title,
        type: 'workitem',
        createdAt: workItem.createdAt,
        projectId: workItem.projectId,
        projectName,
        workItem,
      };

      if (workItem.status === 'closed') {
        closed.push(item);
        return;
      }

      const agentRunStatus = getLatestAgentRunStatus(workItem.id);
      if (agentRunStatus === 'running') {
        inProgress.push(item);
      } else {
        inQueue.push(item);
      }
    });

    pullRequests.forEach((pr: PullRequest) => {
      const projectName = projectIdToName.get(pr.projectId) ?? 'Unknown';
      const item: DashboardItem = {
        id: pr.id,
        title: pr.title,
        type: 'pr',
        createdAt: pr.createdAt,
        projectId: pr.projectId,
        projectName,
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
  }, [workItems, pullRequests, agentRunsMap, projectIdToName]);

  // Combined list sorted by createdAt desc for pagination (20 per page)
  const { combinedList, totalItems, paginatedColumnItems } = useMemo(() => {
    const all = [
      ...groupedItems.inQueue,
      ...groupedItems.inProgress,
      ...groupedItems.inReview,
      ...groupedItems.waitingSync,
      ...groupedItems.closed,
    ];
    const sorted = [...all].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const total = sorted.length;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = sorted.slice(start, start + PAGE_SIZE);
    const pageIds = new Set(pageItems.map((i) => i.id));
    return {
      combinedList: sorted,
      totalItems: total,
      paginatedColumnItems: [
        groupedItems.inQueue.filter((i) => pageIds.has(i.id)),
        groupedItems.inProgress.filter((i) => pageIds.has(i.id)),
        groupedItems.inReview.filter((i) => pageIds.has(i.id)),
        groupedItems.waitingSync.filter((i) => pageIds.has(i.id)),
        groupedItems.closed.filter((i) => pageIds.has(i.id)),
      ],
    };
  }, [groupedItems, currentPage]);

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const handleItemClick = (item: DashboardItem) => {
    const projectName = item.projectName;
    if (item.type === 'workitem') {
      navigate({
        to: '/projects/$projectName/workitems',
        params: { projectName },
        search: { status: 'all', type: 'all', workItemId: item.id },
      });
    } else {
      navigate({
        to: '/projects/$projectName/pullrequests',
        params: { projectName },
        search: { status: 'all', prId: item.id },
      });
    }
  };

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

  const renderItem = (item: DashboardItem) => {
    const displayStatus = getItemDisplayStatus(item);
    const style = statusStyle[displayStatus];
    return (
      <div
        key={`${item.type}-${item.id}`}
        onClick={() => handleItemClick(item)}
        className={`flex min-h-[80px] cursor-pointer flex-col rounded-lg border border-l-4 border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md ${style.borderColor}`}
      >
        <div className="flex-1 space-y-1">
          <p className="text-xs font-medium text-gray-500">{item.projectName}</p>
          <h4 className="line-clamp-3 text-xs font-medium text-gray-900">{item.title}</h4>
          <div className="mt-auto flex items-end justify-between gap-2 text-xs text-gray-500">
            <span>{formatDateWithTime(item.createdAt)}</span>
            <span className={`shrink-0 font-medium ${style.labelColor}`}>{style.label}</span>
          </div>
        </div>
      </div>
    );
  };

  const columns: { title: string; headerBg: string }[] = [
    { title: 'Not Running', headerBg: 'bg-amber-50 border border-amber-200' },
    { title: 'Running', headerBg: 'bg-blue-50 border border-blue-200' },
    { title: 'Review', headerBg: 'bg-purple-50 border border-purple-200' },
    { title: 'Sync Pending', headerBg: 'bg-orange-50 border border-orange-200' },
    { title: 'Done', headerBg: 'bg-gray-50 border border-gray-200' },
  ];

  const columnItems = paginatedColumnItems;
  const columnTotals = [
    groupedItems.inQueue.length,
    groupedItems.inProgress.length,
    groupedItems.inReview.length,
    groupedItems.waitingSync.length,
    groupedItems.closed.length,
  ];

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
          All work items and pull requests across projects
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        {columns.map((config, i) => (
          <div key={config.title} className="flex flex-col">
            <div className={`mb-3 rounded-lg ${config.headerBg} px-3 py-2`}>
              <h3 className="text-sm font-semibold text-gray-900">{config.title}</h3>
              <p className="mt-1 text-xs text-gray-600">
                {columnTotals[i]} total
                {columnTotals[i] !== columnItems[i].length
                  ? ` · ${columnItems[i].length} on this page`
                  : ''}
              </p>
            </div>
            <div className="min-h-[200px] space-y-2">
              {columnItems[i].length > 0 ? (
                columnItems[i].map((item) => renderItem(item))
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
                  <p className="text-sm text-gray-500">No items</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {totalItems > PAGE_SIZE && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={totalItems}
            itemsPerPage={PAGE_SIZE}
          />
        </div>
      )}
    </div>
  );
}
