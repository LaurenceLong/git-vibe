/**
 * WorktreeStatusBadge Component
 *
 * Simple badge component showing worktree status
 * Uses appropriate colors for different statuses
 */

import React from 'react';
import { StatusBadge } from '@/components/ui/status-badge';
import { WorktreeStatus } from '@/types';

export interface WorktreeStatusBadgeProps {
  /** The worktree status to display */
  status: WorktreeStatus;
  /** Optional className for styling */
  className?: string;
}

/**
 * Get status type for badge based on worktree status
 */
function getStatusType(status: WorktreeStatus): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  switch (status) {
    case 'present':
      return 'success';
    case 'missing':
      return 'error';
    case 'recreating':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * Get status label for display
 */
function getStatusLabel(status: WorktreeStatus): string {
  switch (status) {
    case 'present':
      return 'Worktree Present';
    case 'missing':
      return 'Worktree Missing';
    case 'recreating':
      return 'Recreating...';
    default:
      return 'Unknown';
  }
}

/**
 * Get status description for tooltip
 */
function getStatusDescription(status: WorktreeStatus): string {
  switch (status) {
    case 'present':
      return 'Worktree is available and ready for use';
    case 'missing':
      return 'Worktree has been removed or is not available';
    case 'recreating':
      return 'Worktree is currently being recreated';
    default:
      return 'Unknown worktree status';
  }
}

/**
 * WorktreeStatusBadge component
 * Displays a badge showing the current worktree status
 *
 * @param status - The worktree status to display
 * @param className - Optional className for additional styling
 */
export function WorktreeStatusBadge({ status, className = '' }: WorktreeStatusBadgeProps) {
  const statusType = getStatusType(status);
  const statusLabel = getStatusLabel(status);
  const statusDescription = getStatusDescription(status);

  return (
    <div className={`inline-flex items-center ${className}`} title={statusDescription}>
      <StatusBadge status={statusType}>{statusLabel}</StatusBadge>
    </div>
  );
}
