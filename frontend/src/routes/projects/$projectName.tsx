import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { projectsApi } from '@/lib/api';
import { TabNavigation } from '@/components/project/TabNavigation';
import { OverviewTab } from '@/components/project/OverviewTab';
import { CodeTab } from '@/components/project/CodeTab';
import { WorkItemsTab } from '@/components/project/WorkItemsTab';
import { PullRequestsTab } from '@/components/project/PullRequestsTab';
import { ActionsTab } from '@/components/project/ActionsTab';
import { SettingsTab } from '@/components/project/SettingsTab';

export const Route = createFileRoute('/projects/$projectName')({
  component: ProjectDetail,
});

type TabType = 'overview' | 'code' | 'workitems' | 'pullrequests' | 'actions' | 'settings';

/**
 * Project detail page component
 * GitHub-style layout with header, tabs, and content
 */
function ProjectDetail() {
  const { projectName } = Route.useParams();
  const location = useLocation();

  const {
    data: project,
    isLoading: isLoadingProject,
    error: projectError,
  } = useQuery({
    queryKey: ['project', projectName],
    queryFn: () => projectsApi.getByName(projectName).then((res) => res.data),
  });

  const getActiveTab = (): TabType => {
    const pathname = location.pathname;
    if (pathname.includes('/code')) return 'code';
    if (pathname.includes('/workitems')) return 'workitems';
    if (pathname.includes('/pullrequests')) return 'pullrequests';
    if (pathname.includes('/actions')) return 'actions';
    if (pathname.includes('/settings')) return 'settings';
    return 'overview';
  };

  const activeTab = getActiveTab();

  const tabs = [
    { id: 'overview', label: 'Overview', path: `/projects/${projectName}` },
    { id: 'code', label: 'Code', path: `/projects/${projectName}/code` },
    { id: 'workitems', label: 'Work Items', path: `/projects/${projectName}/workitems` },
    { id: 'pullrequests', label: 'Pull Requests', path: `/projects/${projectName}/pullrequests` },
    { id: 'actions', label: 'Actions', path: `/projects/${projectName}/actions` },
    { id: 'settings', label: 'Settings', path: `/projects/${projectName}/settings` },
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
    <div className="min-h-screen bg-gray-50">
      {/* Main content area */}
      <div className="container mx-auto px-4 py-2">
        {/* Tab Navigation */}
        <TabNavigation tabs={tabs} activeTab={activeTab} />

        {/* Tab Content */}
        <div className="min-h-[400px] rounded-lg border bg-white p-6 shadow-sm">
          {activeTab === 'overview' && <OverviewTab project={project} />}
          {activeTab === 'code' && <CodeTab project={project} />}
          {activeTab === 'workitems' && <WorkItemsTab project={project} />}
          {activeTab === 'pullrequests' && <PullRequestsTab project={project} />}
          {activeTab === 'actions' && <ActionsTab project={project} />}
          {activeTab === 'settings' && <SettingsTab project={project} />}
        </div>
      </div>
    </div>
  );
}
