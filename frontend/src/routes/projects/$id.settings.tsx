import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { SettingsTab } from '@/components/project/SettingsTab';

export const Route = createFileRoute('/projects/$id/settings')({
  component: ProjectSettings,
});

/**
 * Project settings tab component
 */
function ProjectSettings() {
  const { id } = Route.useParams();

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id).then((res) => res.data),
  });

  if (!project) {
    return null;
  }

  return <SettingsTab project={project} />;
}
