import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { PullRequestsTab } from '@/components/project/PullRequestsTab';

export const Route = createFileRoute('/projects/$id/pullrequests')({
  component: ProjectPullRequests,
});

/**
 * Project pull requests tab component
 */
function ProjectPullRequests() {
  const { id } = Route.useParams();

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id).then((res) => res.data),
  });

  if (!project) {
    return null;
  }

  return <PullRequestsTab project={project} />;
}
