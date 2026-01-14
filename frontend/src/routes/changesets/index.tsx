import React from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { FileCode } from 'lucide-react';
import { changesetsApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/Toast';

export const Route = createFileRoute('/changesets/')({
  component: ChangesetsIndex,
});

/**
 * Changesets index page component
 * Displays list of changesets with filtering and navigation
 */
function ChangesetsIndex() {
  const { success, error: showError } = useToast();
  const [searchParams, setSearchParams] = React.useState(new URLSearchParams());
  const projectId = searchParams.get('projectId');

  const {
    data: changesets,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['changesets', projectId],
    queryFn: () => changesetsApi.list(projectId || undefined).then((res) => res.data.data),
  });

  // Handle errors
  React.useEffect(() => {
    if (error) {
      showError(
        `Failed to load changesets: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }, [error, showError]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Changesets</h2>
        <Link to="/changesets/new">
          <Button>Create Changeset</Button>
        </Link>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Filter by project ID..."
          value={projectId || ''}
          onChange={(e) => {
            const params = new URLSearchParams(searchParams);
            if (e.target.value) {
              params.set('projectId', e.target.value);
            } else {
              params.delete('projectId');
            }
            setSearchParams(params);
          }}
          className="block w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Changesets List */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-white p-4">
              <Skeleton className="mb-2 h-6 w-3/4" />
              <Skeleton className="mb-2 h-4 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : changesets && changesets.length === 0 ? (
        <EmptyState
          icon={FileCode}
          title="No changesets found"
          description="Create your first changeset to get started"
          action={
            <Link to="/changesets/new">
              <Button>Create Changeset</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4">
          {changesets?.map((changeset) => (
            <Link
              key={changeset.id}
              to={`/changesets/${changeset.id}`}
              className="rounded-lg border bg-white p-4 transition-colors hover:bg-gray-50"
            >
              <h3 className="text-lg font-semibold text-gray-900">{changeset.title}</h3>
              <div className="mt-2 text-sm text-gray-600">
                <div className="flex gap-4">
                  <span>
                    <span className="font-medium">Status:</span>{' '}
                    <StatusBadge
                      status={
                        changeset.status === 'active'
                          ? 'info'
                          : changeset.status === 'completed'
                            ? 'success'
                            : changeset.status === 'cancelled'
                              ? 'error'
                              : 'neutral'
                      }
                    >
                      {changeset.status}
                    </StatusBadge>
                  </span>
                  <span>
                    <span className="font-medium">Branch:</span> {changeset.branchName}
                  </span>
                </div>
                {changeset.body && <p className="mt-2 line-clamp-2">{changeset.body}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
