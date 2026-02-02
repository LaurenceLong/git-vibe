import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { projectsApi } from '@/lib/api';
import { ActionsTab } from '@/components/project/ActionsTab';

type ActionsSelectionState = {
  workflowId: string | null;
  runId: string | null;
  viewMode: 'runs' | 'run-details' | 'config';
};

export const Route = createFileRoute('/projects/$projectName/actions')({
  component: ProjectActions,
  validateSearch: z.object({
    workflowId: z.string().optional(),
    runId: z.string().optional(),
    view: z.enum(['runs', 'run-details', 'config']).optional(),
  }),
});

/**
 * Project actions tab component
 * Tab navigation is now handled by Layout.tsx
 */
function ProjectActions() {
  const { projectName } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

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
    <ActionsTab
      project={project}
      initialWorkflowId={search.workflowId ?? null}
      initialRunId={search.runId ?? null}
      initialView={search.view ?? 'runs'}
      onSelectionChange={(next: ActionsSelectionState) =>
        navigate({
          search: (prev) => ({
            ...prev,
            workflowId: next.workflowId ?? undefined,
            runId: next.runId ?? undefined,
            view: next.viewMode,
          }),
          replace: false,
        })
      }
    />
  );
}
