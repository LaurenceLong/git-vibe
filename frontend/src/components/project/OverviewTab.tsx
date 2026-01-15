/**
 * Overview Tab Component
 * Displays project statistics, recent activity, and metadata
 * WorkItems are task definitions, Changesets handle workspaces
 * Pending Sync shows merged PRs that haven't been synced to source repo yet
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { workItemsApi, projectsApi } from '@/lib/api';
import { Project } from '@/types';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import {
  Folder,
  GitPullRequest,
  CheckCircle,
  AlertCircle,
  Clock,
  FileCode,
  RefreshCw,
} from 'lucide-react';

export interface OverviewTabProps {
  project: Project;
}

export function OverviewTab({ project }: OverviewTabProps) {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: workItems, isLoading: isLoadingWorkItems } = useQuery({
    queryKey: ['workitems', project.id],
    queryFn: () => workItemsApi.list(project.id).then((res) => res.data.data),
  });

  // Note: PR listing API not yet implemented - using placeholder
  const { data: pullRequests } = useQuery({
    queryKey: ['pull-requests', project.id],
    queryFn: async () => {
      // Placeholder: Return empty array for now
      // TODO: Implement actual API call when backend is ready
      return [];
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => projectsApi.sync(project.id),
    onSuccess: () => {
      setIsSyncing(false);
      queryClient.invalidateQueries({ queryKey: ['pull-requests', project.id] });
    },
    onError: () => {
      setIsSyncing(false);
    },
  });

  const handleSync = async () => {
    if (
      window.confirm(
        'Sync all merged PRs to source repo? This will copy all changes from the relay repo to the source repo.'
      )
    ) {
      setIsSyncing(true);
      syncMutation.mutate();
    }
  };

  // Work Items Statistics
  const totalWorkItems = workItems?.length || 0;
  const openWorkItems =
    workItems?.filter((wi: { status: string }) => wi.status === 'open').length || 0;
  const closedWorkItems =
    workItems?.filter((wi: { status: string }) => wi.status === 'closed').length || 0;
  const issueCount = workItems?.filter((wi: { type: string }) => wi.type === 'issue').length || 0;
  const featureRequestCount =
    workItems?.filter((wi: { type: string }) => wi.type === 'feature-request').length || 0;

  // Pull Requests Statistics
  const totalPRs = pullRequests?.length || 0;
  const openPRs =
    pullRequests?.filter((pr: { status: string }) => pr.status === 'open').length || 0;
  const mergedPRs =
    pullRequests?.filter((pr: { status: string }) => pr.status === 'merged').length || 0;
  const closedPRs =
    pullRequests?.filter((pr: { status: string }) => pr.status === 'closed').length || 0;
  const draftPRs = 0;

  // Pending Sync Statistics (merged PRs that haven't been synced to source repo yet)
  // Note: This feature is not yet implemented in PR-centric model
  const pendingSyncTotal = 0;

  const recentWorkItems = workItems?.slice(0, 5) || [];
  const recentPRs = pullRequests?.slice(0, 5) || [];

  return (
    <div className="space-y-8">
      {/* Project Statistics - Enhanced */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Project Statistics</h2>

        {/* Work Items Stats */}
        <div className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
            <Folder className="h-4 w-4" />
            Work Items
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Link
              to="/projects/$projectName/workitems"
              params={{ projectName: project.name }}
              search={{ status: 'all', type: 'all', workItemId: null }}
              className="rounded-lg border bg-gray-50 p-3 transition-colors hover:bg-gray-100 hover:shadow-md"
            >
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-gray-500" />
                <div className="text-xl font-bold text-gray-900">{totalWorkItems}</div>
              </div>
              <div className="mt-1 text-xs text-gray-600">Total</div>
            </Link>
            <Link
              to="/projects/$projectName/workitems"
              params={{ projectName: project.name }}
              search={{ status: 'open', type: 'all', workItemId: null }}
              className={`rounded-lg border bg-blue-50 p-3 transition-colors hover:bg-blue-100 hover:shadow-md ${openWorkItems > 0 ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-blue-500" />
                <div className="text-xl font-bold text-blue-600">{openWorkItems}</div>
              </div>
              <div className="mt-1 text-xs text-gray-600">Open</div>
            </Link>
            <Link
              to="/projects/$projectName/workitems"
              params={{ projectName: project.name }}
              search={{ status: 'closed', type: 'all', workItemId: null }}
              className={`rounded-lg border bg-green-50 p-3 transition-colors hover:bg-green-100 hover:shadow-md ${closedWorkItems > 0 ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <div className="text-xl font-bold text-green-600">{closedWorkItems}</div>
              </div>
              <div className="mt-1 text-xs text-gray-600">Closed</div>
            </Link>
            <Link
              to="/projects/$projectName/workitems"
              params={{ projectName: project.name }}
              search={{ status: 'all', type: 'issue', workItemId: null }}
              className={`rounded-lg border bg-purple-50 p-3 transition-colors hover:bg-purple-100 hover:shadow-md ${issueCount > 0 ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="text-xl font-bold text-purple-600">{issueCount}</div>
              <div className="mt-1 text-xs text-gray-600">Issues</div>
            </Link>
            <Link
              to="/projects/$projectName/workitems"
              params={{ projectName: project.name }}
              search={{ status: 'all', type: 'feature-request', workItemId: null }}
              className={`rounded-lg border bg-orange-50 p-3 transition-colors hover:bg-orange-100 hover:shadow-md ${featureRequestCount > 0 ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="text-xl font-bold text-orange-600">{featureRequestCount}</div>
              <div className="mt-1 text-xs text-gray-600">Features</div>
            </Link>
          </div>
        </div>

        {/* Pull Requests Stats */}
        <div className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
            <GitPullRequest className="h-4 w-4" />
            Pull Requests
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Link
              to="/projects/$projectName/pullrequests"
              params={{ projectName: project.name }}
              search={{ status: 'all', prId: null }}
              className="rounded-lg border bg-gray-50 p-3 transition-colors hover:bg-gray-100 hover:shadow-md"
            >
              <div className="text-xl font-bold text-gray-900">{totalPRs}</div>
              <div className="mt-1 text-xs text-gray-600">Total</div>
            </Link>
            <Link
              to="/projects/$projectName/pullrequests"
              params={{ projectName: project.name }}
              search={{ status: 'open', prId: null }}
              className={`rounded-lg border bg-blue-50 p-3 transition-colors hover:bg-blue-100 hover:shadow-md ${openPRs > 0 ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="text-xl font-bold text-blue-600">{openPRs}</div>
              <div className="mt-1 text-xs text-gray-600">Open</div>
            </Link>
            <Link
              to="/projects/$projectName/pullrequests"
              params={{ projectName: project.name }}
              search={{ status: 'merged', prId: null }}
              className={`rounded-lg border bg-purple-50 p-3 transition-colors hover:bg-purple-100 hover:shadow-md ${mergedPRs > 0 ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="text-xl font-bold text-purple-600">{mergedPRs}</div>
              <div className="mt-1 text-xs text-gray-600">Merged</div>
            </Link>
            <Link
              to="/projects/$projectName/pullrequests"
              params={{ projectName: project.name }}
              search={{ status: 'closed', prId: null }}
              className={`rounded-lg border bg-green-50 p-3 transition-colors hover:bg-green-100 hover:shadow-md ${closedPRs > 0 ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="text-xl font-bold text-green-600">{closedPRs}</div>
              <div className="mt-1 text-xs text-gray-600">Closed</div>
            </Link>
            <div className="rounded-lg border bg-yellow-50 p-3">
              <div className="text-xl font-bold text-yellow-600">{draftPRs}</div>
              <div className="mt-1 text-xs text-gray-600">Draft</div>
            </div>
          </div>
        </div>

        {/* Pending Sync Stats */}
        <div>
          <h3 className="mb-3 flex items-center justify-between gap-2 text-sm font-medium text-gray-700">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending Sync
            </div>
            {pendingSyncTotal > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSync}
                loading={isSyncing}
                disabled={isSyncing}
              >
                <RefreshCw className="h-4 w-4" />
                Sync to Source
              </Button>
            )}
          </h3>
          <div className="max-w-xs rounded-lg border bg-amber-50 p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              <div className="text-2xl font-bold text-amber-600">{pendingSyncTotal}</div>
            </div>
            <div className="mt-1 text-xs text-gray-600">
              Merged PRs waiting to sync to source repo
            </div>
          </div>
        </div>
      </div>

      {/* Recent Work Items */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Work Items</h2>
        </div>
        {isLoadingWorkItems ? (
          <div className="py-8 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-600">Loading work items...</p>
          </div>
        ) : recentWorkItems.length > 0 ? (
          <div className="space-y-3">
            {recentWorkItems.map(
              (workItem: {
                id: string;
                title: string;
                type: string;
                status: string;
                createdAt: string;
              }) => (
                <Link
                  key={workItem.id}
                  to="/projects/$projectName/workitems"
                  params={{ projectName: project.name }}
                  search={{ status: 'all', type: 'all', workItemId: workItem.id }}
                  className="block rounded-md border p-4 transition-colors hover:border-blue-300 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 hover:text-blue-600">
                        {workItem.title}
                      </h3>
                      <div className="mt-2 flex items-center space-x-2">
                        <Badge variant={workItem.type === 'issue' ? 'info' : 'warning'}>
                          {workItem.type}
                        </Badge>
                        <Badge variant={workItem.status === 'open' ? 'success' : 'neutral'}>
                          {workItem.status}
                        </Badge>
                      </div>
                      <div className="mt-2 text-sm text-gray-600">
                        Created {new Date(workItem.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            )}
          </div>
        ) : (
          <EmptyState
            title="No work items yet"
            description="Create your first work item to get started"
          />
        )}
      </div>

      {/* Recent Pull Requests */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Pull Requests</h2>
        </div>
        {recentPRs.length > 0 ? (
          <div className="space-y-3">
            {recentPRs.map(
              (pr: {
                id: string;
                title: string;
                prStatus: string;
                branchName: string;
                baseBranch: string;
                createdAt: string;
              }) => (
                <Link
                  key={pr.id}
                  to="/projects/$projectName/pullrequests"
                  params={{ projectName: project.name }}
                  search={{ status: 'all', prId: pr.id }}
                  className="block rounded-md border p-4 transition-colors hover:border-blue-300 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 hover:text-blue-600">{pr.title}</h3>
                      <div className="mt-2 flex items-center space-x-2">
                        <Badge
                          variant={
                            pr.prStatus === 'open'
                              ? 'success'
                              : pr.prStatus === 'merged'
                                ? 'info'
                                : 'neutral'
                          }
                        >
                          {pr.prStatus}
                        </Badge>
                      </div>
                      <div className="mt-2 text-sm text-gray-600">
                        {pr.branchName} → {pr.baseBranch}
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        Created {new Date(pr.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            )}
          </div>
        ) : (
          <EmptyState
            title="No pull requests yet"
            description="Create a work item and then create a pull request from it"
          />
        )}
      </div>

      {/* Project Details */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Project Details</h2>
        <div className="rounded-lg border bg-gray-50 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <h3 className="font-medium text-gray-900">Repository Information</h3>
              <div>
                <span className="text-gray-600">Default Branch:</span>
                <div className="mt-1 font-mono text-sm text-gray-900">{project.defaultBranch}</div>
              </div>
              <div>
                <span className="text-gray-600">Source Path:</span>
                <div className="mt-1 font-mono text-sm text-gray-900">{project.sourceRepoPath}</div>
              </div>
              {project.sourceRepoUrl && (
                <div>
                  <span className="text-gray-600">Source URL:</span>
                  <div className="mt-1">
                    <a
                      href={project.sourceRepoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-blue-600 hover:underline"
                    >
                      {project.sourceRepoUrl}
                    </a>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-3 text-sm">
              <h3 className="font-medium text-gray-900">Timeline</h3>
              <div>
                <span className="text-gray-600">Created:</span>
                <div className="mt-1 text-gray-900">
                  {new Date(project.createdAt).toLocaleString()}
                </div>
              </div>
              <div>
                <span className="text-gray-600">Last Updated:</span>
                <div className="mt-1 text-gray-900">
                  {new Date(project.updatedAt).toLocaleString()}
                </div>
              </div>
              <div>
                <span className="text-gray-600">Project ID:</span>
                <div className="mt-1 font-mono text-xs text-gray-500">{project.id}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
