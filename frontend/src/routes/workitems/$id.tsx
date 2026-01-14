/**
 * WorkItem Detail Route
 *
 * Route for WorkItem detail page
 *
 * Features:
 * - Use WorkItemDetail component
 * - Load WorkItem data using TanStack Query
 * - Handle loading and error states
 * - Include breadcrumb navigation
 */

import React from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { workItemsApi } from '@/lib/api';
import { WorkItem } from '@/types';
import { WorkItemDetail } from '@/components/workitem/WorkItemDetail';
import { ChevronRight, Home } from 'lucide-react';

export const Route = createFileRoute('/workitems/$id')({
  component: WorkItemDetailRoute,
});

/**
 * WorkItemDetailRoute component
 *
 * Displays WorkItem detail with breadcrumb navigation
 */
function WorkItemDetailRoute() {
  const { id } = Route.useParams();

  const {
    data: workItem,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workitem', id],
    queryFn: () => workItemsApi.get(id).then((res) => res.data as WorkItem),
  });

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      {/* Breadcrumb Navigation */}
      <nav className="mb-6 flex items-center space-x-2 text-sm">
        <Link to="/" className="flex items-center text-gray-600 hover:text-gray-900">
          <Home className="h-4 w-4" />
          <span className="ml-1">Home</span>
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-400" />
        {workItem ? (
          <>
            <Link
              to={`/projects/${workItem.projectId}`}
              className="text-gray-600 hover:text-gray-900"
            >
              Project
            </Link>
            <ChevronRight className="h-4 w-4 text-gray-400" />
            <Link
              to={`/projects/${workItem.projectId}/workitems`}
              className="text-gray-600 hover:text-gray-900"
            >
              Work Items
            </Link>
            <ChevronRight className="h-4 w-4 text-gray-400" />
            <span className="font-medium text-gray-900">{workItem.title}</span>
          </>
        ) : (
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200"></div>
        )}
      </nav>

      {/* WorkItem Detail */}
      <WorkItemDetail workItemId={id} />
    </div>
  );
}
