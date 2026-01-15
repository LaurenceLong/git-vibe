import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { PullRequestsTab } from '@/components/project/PullRequestsTab';
import { PRStatus } from '@/types';

export const Route = createFileRoute('/projects/$projectName/pullrequests')({
  component: ProjectPullRequests,
  validateSearch: (search: Record<string, unknown>) => ({
    status: (search.status as PRStatus | 'all') || 'all',
    prId: (search.prId as string) || null,
  }),
});

/**
 * Project pull requests tab component
 * Tab navigation is now handled by Layout.tsx
 */
function ProjectPullRequests() {
  const { projectName } = Route.useParams();
  const search = Route.useSearch();

  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['project', projectName],
    queryFn: () => projectsApi.getByName(projectName).then((res) => res.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center text-gray-600">
          <p>Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[400px] rounded-lg border bg-white p-6 shadow-sm">
      <PullRequestsTab project={project} initialStatus={search.status} initialPrId={search.prId} />
    </div>
  );
}
