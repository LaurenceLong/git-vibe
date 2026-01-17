/**
 * Pull Requests Tab Component
 * Lists and filters Pull Requests
 * Items are clickable and navigate to detail view
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { pullRequestsApi } from '@/lib/api';
import { Project, PullRequest, PullRequestStatus } from '@/types';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/Pagination';
import { PRDetail } from '@/components/pr/PRDetail';
import { ArrowLeft } from 'lucide-react';

export interface PullRequestsTabProps {
  project: Project;
  initialStatus?: PullRequestStatus | 'all';
  initialPrId?: string | null;
}

export function PullRequestsTab({
  project,
  initialStatus = 'all',
  initialPrId = null,
}: PullRequestsTabProps) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<PullRequestStatus | 'all'>(initialStatus);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPRId, setSelectedPRId] = useState<string | null>(initialPrId);
  const itemsPerPage = 10;

  // Sync selectedPRId with initialPrId when URL changes
  useEffect(() => {
    setSelectedPRId(initialPrId);
  }, [initialPrId]);

  const { data: response, isLoading } = useQuery({
    queryKey: ['pull-requests', project.id, currentPage, itemsPerPage],
    queryFn: () =>
      pullRequestsApi.list(project.id, currentPage, itemsPerPage).then((res) => res.data),
  });

  const pullRequests = response?.data || [];
  const pagination = response?.pagination;

  const filteredPRs = pullRequests.filter((pr: PullRequest) => {
    if (statusFilter !== 'all' && pr.status !== statusFilter) return false;
    return true;
  });

  const handlePRClick = (prId: string) => {
    setSelectedPRId(prId);
    // Update URL to include prId
    navigate({
      to: '/projects/$projectName/pullrequests',
      params: { projectName: project.name },
      search: { status: statusFilter, prId },
    });
  };

  const handleBackToList = () => {
    setSelectedPRId(null);
    // Update URL to remove prId
    navigate({
      to: '/projects/$projectName/pullrequests',
      params: { projectName: project.name },
      search: { status: statusFilter, prId: null },
    });
  };

  // If a PR is selected, show the detail view
  if (selectedPRId) {
    return (
      <div className="space-y-4">
        <button
          onClick={handleBackToList}
          className="flex items-center space-x-2 text-sm text-blue-600 transition-colors hover:text-blue-800"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Pull Requests</span>
        </button>
        <PRDetail prId={selectedPRId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PullRequestStatus | 'all')}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="merged">Merged</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Pull Requests List */}
      {isLoading ? (
        <div className="py-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading pull requests...</p>
        </div>
      ) : filteredPRs.length > 0 ? (
        <div className="space-y-3">
          {filteredPRs.map((pr: PullRequest) => (
            <div
              key={pr.id}
              onClick={() => handlePRClick(pr.id)}
              className="block cursor-pointer rounded-lg border p-4 transition-colors hover:border-blue-300 hover:bg-gray-50"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium text-gray-900 hover:text-blue-600">
                    {pr.title}
                  </h3>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge
                      variant={
                        pr.status === 'open'
                          ? 'success'
                          : pr.status === 'merged'
                            ? 'info'
                            : 'neutral'
                      }
                    >
                      {pr.status}
                    </Badge>
                  </div>
                  <div className="mt-2 text-sm text-gray-600">
                    {pr.sourceBranch} → {pr.targetBranch}
                  </div>
                  <div className="mt-1 text-sm text-gray-600">
                    Created {new Date(pr.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="ml-4 text-gray-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No pull requests found"
          description={
            statusFilter !== 'all' ? 'Try adjusting your filters' : 'No pull requests available'
          }
        />
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={setCurrentPage}
            totalItems={pagination.total}
            itemsPerPage={pagination.limit}
          />
        </div>
      )}
    </div>
  );
}
