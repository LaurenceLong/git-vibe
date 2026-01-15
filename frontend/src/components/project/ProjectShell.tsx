/**
 * Project Shell Component
 * NOTE: This component is deprecated.
 * The project layout with tab navigation has been moved to Layout.tsx
 * for a GitHub-style UI where tabs appear directly under the header.
 * This file is kept for backward compatibility but is no longer used.
 */

import { Outlet, Link, useLocation } from '@tanstack/react-router';
import { Project } from '@/types';

export interface ProjectShellProps {
  project: Project;
  children?: React.ReactNode;
}

/**
 * @deprecated Project shell functionality moved to Layout.tsx
 */
export function ProjectShell({ project, children }: ProjectShellProps) {
  // This component is deprecated and should not be used
  return <div className="space-y-6">{children || <Outlet />}</div>;
}
