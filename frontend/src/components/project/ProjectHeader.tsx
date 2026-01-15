/**
 * Project Header Component
 * NOTE: This component is deprecated. The header functionality has been moved to Layout.tsx
 * which now includes GitVibe logo, breadcrumb navigation, search bar, and tab navigation.
 * This file is kept for backward compatibility but is no longer used.
 */

import React from 'react';
import { Project } from '@/types';

export interface ProjectHeaderProps {
  project: Project;
}

/**
 * @deprecated This component is no longer used. Header functionality moved to Layout.tsx
 */
export function ProjectHeader({ project }: ProjectHeaderProps) {
  // This component is deprecated and should not be used
  return null;
}
