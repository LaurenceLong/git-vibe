import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { targetReposApi } from '@/lib/api';

interface ImportRecord {
  id: string;
  status: string;
  finishedAt?: string;
  targetResultSha?: string;
}

export const Route = createFileRoute('/target-repos/$id')({
  component: TargetRepoDetail,
});

/**
 * Target repository detail page component
 * Displays target repository information and import history
 */
function TargetRepoDetail() {
  const { id } = Route.useParams();

  const {
    data: targetRepo,
    isLoading: isLoadingRepo,
    error: repoError,
  } = useQuery({
    queryKey: ['target-repo', id],
    queryFn: () => targetReposApi.get(id).then((res) => res.data),
  });

  // Note: We would need to add an API endpoint to get imports by target repo
  // For now, we'll display a placeholder for imports
  const { data: imports, isLoading: isLoadingImports } = useQuery({
    queryKey: ['target-repo-imports', id],
    queryFn: async () => {
      // This would need to be implemented in the backend
      // For now, return empty array
      return [];
    },
    enabled: !!targetRepo,
  });

  if (isLoadingRepo) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading target repository...</p>
        </div>
      </div>
    );
  }

  if (repoError) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center text-red-600">
          <p className="font-medium">Error loading target repository</p>
          <p className="mt-1 text-sm">
            {repoError instanceof Error ? repoError.message : 'Unknown error'}
          </p>
          <Link to="/target-repos" className="mt-4 inline-block text-blue-600 hover:underline">
            Back to Target Repos
          </Link>
        </div>
      </div>
    );
  }

  if (!targetRepo) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center text-gray-600">
          <p>Target repository not found</p>
          <Link to="/target-repos" className="mt-4 inline-block text-blue-600 hover:underline">
            Back to Target Repos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/target-repos" className="text-sm text-blue-600 hover:underline">
          ← Back to Target Repos
        </Link>
      </div>

      {/* Target Repo Info */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">{targetRepo.name}</h1>
        <div className="mt-4 space-y-2 text-sm text-gray-600">
          <div>
            <span className="font-medium">Repository Path:</span> {targetRepo.repoPath}
          </div>
          <div>
            <span className="font-medium">Default Branch:</span> {targetRepo.defaultBranch}
          </div>
          <div>
            <span className="font-medium">Created:</span>{' '}
            {new Date(targetRepo.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Import History */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Import History</h2>
        {isLoadingImports ? (
          <div className="py-4 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-600">Loading imports...</p>
          </div>
        ) : imports && imports.length > 0 ? (
          <div className="space-y-3">
            {imports.map((importRecord: ImportRecord) => (
              <div key={importRecord.id} className="rounded-md border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          importRecord.status === 'succeeded'
                            ? 'bg-green-100 text-green-800'
                            : importRecord.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {importRecord.status}
                      </span>
                      <span className="text-sm text-gray-600">
                        {importRecord.finishedAt
                          ? new Date(importRecord.finishedAt).toLocaleString()
                          : 'In progress'}
                      </span>
                    </div>
                    {importRecord.targetResultSha && (
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Commit:</span>{' '}
                        {importRecord.targetResultSha.slice(0, 8)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-600">
            <p>No imports found for this target repository</p>
          </div>
        )}
      </div>
    </div>
  );
}
