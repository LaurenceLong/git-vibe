/**
 * Overview Tab Component
 * Displays project statistics, recent activity, and metadata
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { workItemsApi, changesetsApi } from '@/lib/api';
import { Project } from '@/types';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

export interface OverviewTabProps {
  project: Project;
}

export function OverviewTab({ project }: OverviewTabProps) {
  const { data: workItems, isLoading: isLoadingWorkItems } = useQuery({
    queryKey: ['workitems', project.id],
    queryFn: () => workItemsApi.list(project.id).then((res) => res.data),
  });

  const { data: changesets, isLoading: isLoadingChangesets } = useQuery({
    queryKey: ['changesets', project.id],
    queryFn: () => changesetsApi.list(project.id).then((res) => res.data),
  });

  const totalWorkItems = workItems?.length || 0;
  const openWorkItems = workItems?.filter((wi: any) => wi.status === 'open').length || 0;
  const openPRs = changesets?.filter((cs: any) => cs.prStatus === 'open').length || 0;
  const mergedPRs = changesets?.filter((cs: any) => cs.prStatus === 'merged').length || 0;

  const recentWorkItems = workItems?.slice(0, 5) || [];
  const recentPRs = changesets?.filter((cs: any) => cs.prStatus).slice(0, 5) || [];

  return (
    <div className="space-y-8">
      {/* Statistics */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Project Statistics</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="text-2xl font-bold text-gray-900">{totalWorkItems}</div>
            <div className="mt-1 text-sm text-gray-600">Total Work Items</div>
          </div>
          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="text-2xl font-bold text-blue-600">{openWorkItems}</div>
            <div className="mt-1 text-sm text-gray-600">Open Work Items</div>
          </div>
          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="text-2xl font-bold text-green-600">{openPRs}</div>
            <div className="mt-1 text-sm text-gray-600">Open Pull Requests</div>
          </div>
          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="text-2xl font-bold text-purple-600">{mergedPRs}</div>
            <div className="mt-1 text-sm text-gray-600">Merged Pull Requests</div>
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
            {recentWorkItems.map((workItem: any) => (
              <Link
                key={workItem.id}
                to={`/workitems/${workItem.id}`}
                className="block rounded-md border p-4 transition-colors hover:bg-gray-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{workItem.title}</h3>
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
            ))}
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
        {isLoadingChangesets ? (
          <div className="py-8 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-600">Loading pull requests...</p>
          </div>
        ) : recentPRs.length > 0 ? (
          <div className="space-y-3">
            {recentPRs.map((pr: any) => (
              <Link
                key={pr.id}
                to={`/changesets/${pr.id}`}
                className="block rounded-md border p-4 transition-colors hover:bg-gray-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{pr.title}</h3>
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
            ))}
          </div>
        ) : (
          <EmptyState
            title="No pull requests yet"
            description="Create a work item and then create a pull request from it"
          />
        )}
      </div>

      {/* Project Metadata */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Project Metadata</h2>
        <div className="rounded-lg border bg-gray-50 p-4">
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium text-gray-700">Default Branch:</span>{' '}
              <span className="text-gray-900">{project.defaultBranch}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Source Path:</span>{' '}
              <span className="text-gray-900">{project.sourceRepoPath}</span>
            </div>
            {project.sourceRepoUrl && (
              <div>
                <span className="font-medium text-gray-700">Source URL:</span>{' '}
                <a
                  href={project.sourceRepoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {project.sourceRepoUrl}
                </a>
              </div>
            )}
            <div>
              <span className="font-medium text-gray-700">Created:</span>{' '}
              <span className="text-gray-900">{new Date(project.createdAt).toLocaleString()}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Last Updated:</span>{' '}
              <span className="text-gray-900">{new Date(project.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
