import { Badge } from '@/components/ui/badge';

export type Status = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusBadgeProps {
  status: Status;
  children: React.ReactNode;
}

const statusVariantMap: Record<Status, 'success' | 'warning' | 'destructive' | 'info' | 'neutral'> =
  {
    success: 'success',
    warning: 'warning',
    error: 'destructive',
    info: 'info',
    neutral: 'neutral',
  };

export function StatusBadge({ status, children }: StatusBadgeProps) {
  return <Badge variant={statusVariantMap[status]}>{children}</Badge>;
}
