import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { WorkItemsTab } from '@/components/project/WorkItemsTab';

export const Route = createFileRoute('/projects/$id/workitems')({
  component: ProjectWorkItems,
});

/**
 * Project work items tab component
 */
function ProjectWorkItems() {
  const { id } = Route.useParams();

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id).then((res) => res.data),
  });

  if (!project) {
    return null;
  }

  return <WorkItemsTab project={project} />;
}
