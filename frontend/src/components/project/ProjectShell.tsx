/**
 * Project Shell Component
 * Main container for project-level navigation with 4 tabs
 */

import { Outlet, Link, useLocation } from '@tanstack/react-router';
import { Project } from '@/types';
import { TabNavigation } from './TabNavigation';

export interface ProjectShellProps {
  project: Project;
  children?: React.ReactNode;
}

export function ProjectShell({ project, children }: ProjectShellProps) {
  const location = useLocation();

  // Determine active tab from current path
  const getActiveTab = (): string => {
    const path = location.pathname;
    if (path.includes('/workitems')) return 'workitems';
    if (path.includes('/pullrequests')) return 'pullrequests';
    if (path.includes('/settings')) return 'settings';
    return 'overview';
  };

  const activeTab = getActiveTab();

  const tabs = [
    { id: 'overview', label: 'Overview', path: `/projects/${project.id}` },
    { id: 'workitems', label: 'Work Items', path: `/projects/${project.id}/workitems` },
    { id: 'pullrequests', label: 'Pull Requests', path: `/projects/${project.id}/pullrequests` },
    { id: 'settings', label: 'Settings', path: `/projects/${project.id}/settings` },
  ];

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
        {children || <Outlet />}
      </div>
    </div>
  );
}
