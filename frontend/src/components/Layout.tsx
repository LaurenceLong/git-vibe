import { Link, useLocation } from '@tanstack/react-router';
import { SearchInput } from '@/components/SearchDropdown';

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  // Check if we're on a project detail page
  const projectPageMatch = location.pathname.match(/^\/projects\/([^/]+)(\/.*)?$/);
  const isProjectPage = !!projectPageMatch;
  const projectName = projectPageMatch ? projectPageMatch[1] : null;

  // Check if we're on the projects index page
  const isProjectsIndexPage =
    location.pathname === '/projects' || location.pathname === '/projects/';

  // Determine active tab from current path
  const getActiveTab = (): string => {
    const path = location.pathname;
    if (path.includes('/code')) return 'code';
    if (path.includes('/workitems')) return 'workitems';
    if (path.includes('/pullrequests')) return 'pullrequests';
    if (path.includes('/actions')) return 'actions';
    if (path.includes('/dashboard')) return 'dashboard';
    if (path.includes('/settings')) return 'settings';
    return 'overview';
  };

  const activeTab = isProjectPage ? getActiveTab() : null;

  const tabs = projectName
    ? [
        { id: 'overview', label: 'Overview', path: `/projects/${projectName}` },
        { id: 'code', label: 'Code', path: `/projects/${projectName}/code` },
        { id: 'workitems', label: 'Work Items', path: `/projects/${projectName}/workitems` },
        {
          id: 'pullrequests',
          label: 'Pull Requests',
          path: `/projects/${projectName}/pullrequests`,
        },
        { id: 'actions', label: 'Actions', path: `/projects/${projectName}/actions` },
        { id: 'dashboard', label: 'Dashboard', path: `/projects/${projectName}/dashboard` },
        { id: 'settings', label: 'Settings', path: `/projects/${projectName}/settings` },
      ]
    : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4">
          {/* Top header row */}
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <Link to="/projects" className="text-2xl font-bold text-primary">
                GitVibe
              </Link>
              {isProjectPage && projectName && (
                <div className="flex items-center space-x-2 text-sm">
                  <Link to="/projects" className="font-medium text-gray-900 hover:text-blue-600">
                    Projects
                  </Link>
                  <span className="text-gray-400">/</span>
                  <span className="font-medium text-gray-900">
                    {decodeURIComponent(projectName)}
                  </span>
                </div>
              )}
            </div>

            {/* Search bar */}
            {(isProjectPage || isProjectsIndexPage) && (
              <div className="ml-8 max-w-md flex-1">
                <SearchInput projectId={projectName ?? undefined} />
              </div>
            )}
          </div>

          {/* Tab navigation bar - directly under header */}
          {isProjectPage && projectName && (
            <nav className="-mb-px flex space-x-6" role="tablist">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <Link
                    key={tab.id}
                    to={tab.path}
                    className={`flex items-center border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                    role="tab"
                    aria-selected={isActive}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
