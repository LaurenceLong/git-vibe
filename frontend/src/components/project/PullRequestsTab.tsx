/**
 * Pull Requests Tab Component
 * Lists and filters Pull Requests (ChangeSets with work_item_id)
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { changesetsApi } from '@/lib/api';
import { Project, ChangeSet, PRStatus } from '@/types';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';

export interface PullRequestsTabProps {
  project: Project;
}

export function PullRequestsTab({ project }: PullRequestsTabProps) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<PRStatus | 'all'>('all');

  const { data: changesets, isLoading } = useQuery({
    queryKey: ['changesets', project.id],
    queryFn: () => changesetsApi.list(project.id).then((res) => res.data),
  });

  // Filter changesets that have a PR status (i.e., are Pull Requests)
  const pullRequests = changesets?.filter((cs: ChangeSet) => cs.prStatus !== null) || [];

  const filteredPRs = pullRequests.filter((pr: ChangeSet) => {
    if (statusFilter !== 'all' && pr.prStatus !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header with filter and create button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PRStatus | 'all')}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="merged">Merged</option>
          <option value="closed">Closed</option>
        </select>

        {/* Create PR Button - links to WorkItems tab */}
        <Button variant="primary" onClick={() => navigate({ to: `/projects/${project.id}` })}>
          Create Pull Request
        </Button>
      </div>

      {/* Pull Requests List */}
      {isLoading ? (
        <div className="py-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading pull requests...</p>
        </div>
      ) : filteredPRs.length > 0 ? (
        <div className="space-y-3">
          {filteredPRs.map((pr: ChangeSet) => (
            <Link
              key={pr.id}
              to="/changesets/$id"
              params={{ id: pr.id }}
              className="block rounded-lg border p-4 transition-colors hover:bg-gray-50"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium text-gray-900">{pr.title}</h3>
                  <div className="mt-2 flex items-center gap-2">
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
          title="No pull requests found"
          description={
            statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Create a work item and then create a pull request from it'
          }
          action={
            statusFilter === 'all' ? (
              <Button variant="primary" onClick={() => navigate({ to: `/projects/${project.id}` })}>
                Create Pull Request
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
