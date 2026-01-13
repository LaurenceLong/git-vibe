import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { changesetsApi } from '@/lib/api';
import { useState } from 'react';

export const Route = createFileRoute('/changesets/')({
  component: ChangesetsIndex,
});

function ChangesetsIndex() {
  const [searchParams, setSearchParams] = useState(new URLSearchParams());
  const projectId = searchParams.get('projectId');

  const { data: changesets, isLoading } = useQuery({
    queryKey: ['changesets', projectId],
    queryFn: () => changesetsApi.list(projectId || undefined).then((res) => res.data),
  });

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold">Changesets</h2>
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
          className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary w-64"
        />
        <Link
          to="/changesets/new"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Create Changeset
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="grid gap-4">
          {changesets?.map((changeset) => (
            <Link
              key={changeset.id}
              to={`/changesets/${changeset.id}`}
              className="p-4 border rounded-lg bg-card hover:bg-accent transition-colors"
            >
              <h3 className="text-lg font-semibold">{changeset.title}</h3>
              <div className="mt-2 text-sm text-muted-foreground">
                <div className="flex gap-4">
                  <span>
                    <span className="font-medium">Status:</span> {changeset.status}
                  </span>
                  <span>
                    <span className="font-medium">Branch:</span> {changeset.branchName}
                  </span>
                </div>
                {changeset.body && (
                  <p className="mt-2 line-clamp-2">{changeset.body}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
