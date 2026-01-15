import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';

export const Route = createFileRoute('/projects/$projectName')({
  component: ProjectDetail,
});

/**
 * Project detail page component - Parent route for all project tabs
 * Tab navigation is handled by Layout.tsx
 * Child routes are rendered via <Outlet />
 */
function ProjectDetail() {
  const { projectName } = Route.useParams();

  const {
    data: project,
    isLoading: isLoadingProject,
    error: projectError,
  } = useQuery({
    queryKey: ['project', projectName],
    queryFn: () => projectsApi.getByName(projectName).then((res) => res.data),
  });

  if (isLoadingProject) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (projectError) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center text-red-600">
          <p className="font-medium">Error loading project</p>
          <p className="mt-1 text-sm">
            {projectError instanceof Error ? projectError.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center text-gray-600">
          <p>Project not found</p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
