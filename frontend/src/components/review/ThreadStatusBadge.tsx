import { StatusBadge } from '@/components/ui/status-badge';

/**
 * Props for the ThreadStatusBadge component
 */
export interface ThreadStatusBadgeProps {
  /** The status of the thread */
  status: 'open' | 'resolved' | 'outdated';
  /** Optional custom className */
  className?: string;
}

/**
 * ThreadStatusBadge component
 * Displays the status of a review thread with appropriate styling
 *
 * Features:
 * - Color-coded status badges
 * - Tooltip with status description
 * - Reuses existing StatusBadge component
 */
export function ThreadStatusBadge({ status, className }: ThreadStatusBadgeProps) {
  const getStatusType = (): 'success' | 'info' | 'neutral' | 'warning' | 'error' => {
    switch (status) {
      case 'open':
        return 'success';
      case 'resolved':
        return 'info';
      case 'outdated':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  const getStatusDescription = (): string => {
    switch (status) {
      case 'open':
        return 'This thread is open and needs attention';
      case 'resolved':
        return 'This thread has been resolved';
      case 'outdated':
        return 'This thread is outdated due to code changes';
      default:
        return 'Unknown status';
    }
  };

  return (
    <div className={className} title={getStatusDescription()}>
      <StatusBadge status={getStatusType()}>{status}</StatusBadge>
    </div>
  );
}
