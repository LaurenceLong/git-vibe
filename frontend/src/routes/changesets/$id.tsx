import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { changesetsApi, diffsApi, agentRunsApi, importsApi } from '@/lib/api';

export const Route = createFileRoute('/changesets/$id')({
  component: ChangesetDetail,
});

function ChangesetDetail() {
  const { id } = Route.useParams();

  const { data: changeset, isLoading } = useQuery({
    queryKey: ['changeset', id],
    queryFn: () => changesetsApi.get(id).then((res) => res.data),
  });

  const { data: diff } = useQuery({
    queryKey: ['diff', id, changeset?.headSha],
    queryFn: () => diffsApi.get(id).then((res) => res.data),
    enabled: !!changeset && !!changeset.headSha,
  });

  const { data: agentRuns } = useQuery({
    queryKey: ['agent-runs', id],
    queryFn: () => agentRunsApi.listByChangeset(id).then((res) => res.data),
    enabled: !!changeset,
    refetchInterval: 1500,
  });

  const { data: imports } = useQuery({
    queryKey: ['imports', id],
    queryFn: () => importsApi.list(id).then((res) => res.data),
    enabled: !!changeset,
  });

  if (isLoading || !changeset) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/changesets" className="text-sm text-primary hover:underline">
          ← Back to Changesets
        </Link>
      </div>

      <div className="p-6 border rounded-lg bg-card">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">{changeset.title}</h1>
        </div>
        {changeset.body && <p className="text-muted-foreground mt-2">{changeset.body}</p>}
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Status:</span> {changeset.status}
          </div>
          <div>
            <span className="font-medium">Base Branch:</span> {changeset.baseBranch}
          </div>
          <div>
            <span className="font-medium">Base SHA:</span> {changeset.baseSha.slice(0, 8)}
          </div>
          <div>
            <span className="font-medium">Current SHA:</span>{' '}
            {changeset.headSha ? changeset.headSha.slice(0, 8) : 'N/A'}
          </div>
        </div>
      </div>

      {diff?.diff && (
        <div className="p-6 border rounded-lg bg-card">
          <h2 className="text-xl font-semibold mb-4">Diff</h2>
          <pre className="overflow-x-auto text-sm bg-muted p-4 rounded-md">
            <code>{diff.diff}</code>
          </pre>
        </div>
      )}

      {agentRuns && agentRuns.length > 0 && (
        <div className="p-6 border rounded-lg bg-card">
          <h2 className="text-xl font-semibold mb-4">Agent Runs</h2>
          <div className="space-y-3">
            {agentRuns.map((run: any) => (
              <div key={run.id} className="p-3 border rounded-md">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-semibold">{run.agentKey}</div>
                    <div className="text-sm text-muted-foreground">
                      {run.startedAt ? new Date(run.startedAt).toLocaleString() : 'Not started'}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      run.status === 'succeeded'
                        ? 'bg-green-100 text-green-800'
                        : run.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : run.status === 'running'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {run.status}
                  </span>
                </div>
                {run.inputSummary && <div className="text-sm mb-2">{run.inputSummary}</div>}
                {run.log && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-primary hover:underline">View Logs</summary>
                    <pre className="mt-2 overflow-x-auto bg-muted p-3 rounded-md text-xs">
                      <code>{run.log}</code>
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {imports && imports.length > 0 && (
        <div className="p-6 border rounded-lg bg-card">
          <h2 className="text-xl font-semibold mb-4">Import History</h2>
          <div className="space-y-3">
            {imports.map((importRecord: any) => (
              <div key={importRecord.id} className="p-3 border rounded-md">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm">
                    <span
                      className={`px-2 py-1 rounded text-xs mr-2 ${
                        importRecord.status === 'succeeded'
                          ? 'bg-green-100 text-green-800'
                          : importRecord.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {importRecord.status}
                    </span>
                    {importRecord.finishedAt
                      ? new Date(importRecord.finishedAt).toLocaleString()
                      : 'In progress'}
                  </div>
                </div>
                {importRecord.targetResultSha && (
                  <div className="text-sm">
                    <span className="font-medium">Commit:</span> {importRecord.targetResultSha.slice(0, 8)}
                  </div>
                )}
                {importRecord.log && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-primary hover:underline">View Logs</summary>
                    <pre className="mt-2 overflow-x-auto bg-muted p-3 rounded-md text-xs">
                      <code>{importRecord.log}</code>
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}