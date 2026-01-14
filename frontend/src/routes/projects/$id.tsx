import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { TabNavigation } from '@/components/project/TabNavigation';
import { OverviewTab } from '@/components/project/OverviewTab';
import { WorkItemsTab } from '@/components/project/WorkItemsTab';
import { PullRequestsTab } from '@/components/project/PullRequestsTab';
import { SettingsTab } from '@/components/project/SettingsTab';

export const Route = createFileRoute('/projects/$id')({
  component: ProjectDetail,
});

type TabType = 'overview' | 'workitems' | 'pullrequests' | 'settings';

/**
 * Project detail page component
 * Uses tab-based navigation with inline tab rendering
 */
function ProjectDetail() {
  const { id } = Route.useParams();
  const location = window.location.pathname;

  const {
    data: project,
    isLoading: isLoadingProject,
    error: projectError,
  } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id).then((res) => res.data),
  });

  const getActiveTab = (): TabType => {
    if (location.includes('/workitems')) return 'workitems';
    if (location.includes('/pullrequests')) return 'pullrequests';
    if (location.includes('/settings')) return 'settings';
    return 'overview';
  };

  const activeTab = getActiveTab();

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'workitems', label: 'Work Items' },
    { id: 'pullrequests', label: 'Pull Requests' },
    { id: 'settings', label: 'Settings' },
  ];

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

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm">
        <Link to="/projects" className="text-blue-600 hover:underline">
          Projects
        </Link>
        <span className="text-gray-400">/</span>
        <span className="font-medium text-gray-900">{project.name}</span>
      </div>

      {/* Project Header */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
        {project.sourceRepoUrl && (
          <div className="mt-2 text-sm text-gray-600">
            <span className="font-medium">Source:</span>{' '}
            <a
              href={project.sourceRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {project.sourceRepoUrl}
            </a>
          </div>
        )}
        <div className="mt-2 text-sm text-gray-600">
          <span className="font-medium">Default Branch:</span> {project.defaultBranch}
        </div>
        <div className="mt-2 text-sm text-gray-600">
          <span className="font-medium">Created:</span>{' '}
          {new Date(project.createdAt).toLocaleDateString()}
        </div>
      </div>

      {/* Tab Navigation */}
      <TabNavigation tabs={tabs} activeTab={activeTab} />

      {/* Tab Content */}
      <div className="min-h-[400px] rounded-lg border bg-white p-6 shadow-sm">
        {activeTab === 'overview' && <OverviewTab project={project} />}
        {activeTab === 'workitems' && <WorkItemsTab project={project} />}
        {activeTab === 'pullrequests' && <PullRequestsTab project={project} />}
        {activeTab === 'settings' && <SettingsTab project={project} />}
      </div>
    </div>
  );
}
