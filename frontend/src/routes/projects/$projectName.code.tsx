import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { TabNavigation } from '@/components/project/TabNavigation';
import { CodeTab } from '@/components/project/CodeTab';

export const Route = createFileRoute('/projects/$projectName/code')({
  component: ProjectCode,
});

/**
 * Project code tab component
 * GitHub-style layout with header and tabs
 */
function ProjectCode() {
  const { projectName } = Route.useParams();

  const { data: project } = useQuery({
    queryKey: ['project', projectName],
    queryFn: () => projectsApi.getByName(projectName).then((res) => res.data),
  });

  if (!project) {
    return null;
  }

  const tabs = [
    { id: 'overview', label: 'Overview', path: `/projects/${projectName}` },
    { id: 'code', label: 'Code', path: `/projects/${projectName}/code` },
    { id: 'workitems', label: 'Work Items', path: `/projects/${projectName}/workitems` },
    { id: 'pullrequests', label: 'Pull Requests', path: `/projects/${projectName}/pullrequests` },
    { id: 'actions', label: 'Actions', path: `/projects/${projectName}/actions` },
    { id: 'settings', label: 'Settings', path: `/projects/${projectName}/settings` },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main content area */}
      <div className="container mx-auto px-4 py-2">
        {/* Tab Navigation */}
        <TabNavigation tabs={tabs} activeTab="code" />

        {/* Tab Content */}
        <div className="min-h-[400px] rounded-lg border bg-white p-6 shadow-sm">
          <CodeTab project={project} />
        </div>
      </div>
    </div>
  );
}
