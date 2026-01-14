import React, { useState, useEffect } from 'react';
import { Import } from '@/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { targetReposApi } from '@/lib/api';
import { useImportJob } from '@/hooks/useImportJob';
import { ImportConfigForm } from '@/components/import/ImportConfigForm';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Download } from 'lucide-react';

/**
 * Props for the ImportsTab component
 */
export interface ImportsTabProps {
  /** The changeset ID */
  changesetId: string;
  /** List of imports for the changeset */
  imports: Import[];
}

/**
 * ImportsTab component
 * Displays import history for a changeset
 *
 * Features:
 * - List all imports with status color coding
 * - Auto-update running imports using useImportJob
 * - Display import logs in scrollable container
 * - Start new imports via modal
 * - Show completed import details (target repo, result SHA, status)
 */
export function ImportsTab({ changesetId, imports }: ImportsTabProps) {
  const queryClient = useQueryClient();
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [expandedImports, setExpandedImports] = useState<Set<string>>(new Set());
  const [activeImportJobId, setActiveImportJobId] = useState<string | undefined>(undefined);

  // Fetch target repositories for import form
  const { data: targetRepos = [], isLoading: isLoadingTargetRepos } = useQuery({
    queryKey: ['target-repos'],
    queryFn: () => targetReposApi.list().then((res) => res.data),
  });

  // Use the import job hook for polling
  const { importJob, isPolling, startImport, stopPolling } = useImportJob(
    activeImportJobId,
    changesetId
  );

  // Track which imports are currently being polled
  const [pollingImports, setPollingImports] = useState<Set<string>>(new Set());

  // Add running imports to polling
  useEffect(() => {
    const running = new Set(
      imports
        .filter((imp) => imp.status === 'pending' || imp.status === 'running')
        .map((imp) => imp.id)
    );
    setPollingImports(running);
  }, [imports]);

  // Update pollingImports based on active import job
  useEffect(() => {
    if (isPolling && activeImportJobId) {
      setPollingImports((prev) => new Set([...prev, activeImportJobId]));
    }
  }, [isPolling, activeImportJobId]);

  // Refresh imports list when active import job completes
  useEffect(() => {
    if (
      importJob &&
      (importJob.status === 'succeeded' ||
        importJob.status === 'failed' ||
        importJob.status === 'succeeded_noop')
    ) {
      queryClient.invalidateQueries({ queryKey: ['imports', changesetId] });
      setActiveImportJobId(undefined);
    }
  }, [importJob, changesetId, queryClient]);

  // Handle config modal
  const handleOpenConfigModal = () => {
    setIsConfigModalOpen(true);
  };

  const handleCloseConfigModal = () => {
    setIsConfigModalOpen(false);
  };

  const handleStartImport = async (data: { targetRepoId: string }) => {
    try {
      await startImport(data.targetRepoId);
      handleCloseConfigModal();
    } catch (error) {
      console.error('Failed to start import:', error);
    }
  };

  // Toggle import expansion
  const toggleImportExpansion = (importId: string) => {
    setExpandedImports((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(importId)) {
        newSet.delete(importId);
      } else {
        newSet.add(importId);
      }
      return newSet;
    });
  };

  // Get status type for badge
  const getStatusType = (status: string): 'success' | 'error' | 'info' | 'neutral' | 'warning' => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'running':
        return 'info';
      case 'succeeded':
        return 'success';
      case 'succeeded_noop':
        return 'neutral';
      case 'failed_dirty':
      case 'failed_conflict':
      case 'failed_other':
      case 'failed':
        return 'error';
      default:
        return 'neutral';
    }
  };

  // Get status display text
  const getStatusText = (status: string): string => {
    switch (status) {
      case 'succeeded_noop':
        return 'Succeeded (No Changes)';
      case 'failed_dirty':
        return 'Failed (Dirty)';
      case 'failed_conflict':
        return 'Failed (Conflict)';
      case 'failed_other':
        return 'Failed (Other)';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  // Calculate import duration
  const getDuration = (imp: Import): string => {
    if (!imp.startedAt) return 'N/A';
    const end = imp.finishedAt ? new Date(imp.finishedAt) : new Date();
    const start = new Date(imp.startedAt);
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    if (duration < 60) return `${duration}s`;
    return `${Math.floor(duration / 60)}m ${duration % 60}s`;
  };

  // Get target repo name
  const getTargetRepoName = (targetRepoId: string): string => {
    const repo = targetRepos.find((r) => r.id === targetRepoId);
    return repo?.name || targetRepoId;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Imports</h2>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenConfigModal}
            disabled={isLoadingTargetRepos}
          >
            Start Import
          </Button>
        </div>

        {/* Imports List */}
        {imports.length > 0 ? (
          <div className="space-y-3">
            {imports.map((imp) => {
              const isExpanded = expandedImports.has(imp.id);
              const isRunning = imp.status === 'pending' || imp.status === 'running';
              const isPollingThis = pollingImports.has(imp.id);

              return (
                <div key={imp.id} className="rounded-md border p-4">
                  {/* Import Header */}
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center space-x-2">
                        <StatusBadge status={getStatusType(imp.status)}>
                          {getStatusText(imp.status)}
                          {isPollingThis && (
                            <span className="ml-1 inline-block animate-pulse">●</span>
                          )}
                        </StatusBadge>
                        <span className="font-semibold text-gray-900">
                          {getTargetRepoName(imp.targetRepoId)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {imp.startedAt ? new Date(imp.startedAt).toLocaleString() : 'Not started'}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => toggleImportExpansion(imp.id)}>
                      {isExpanded ? '▼' : '▶'}
                    </Button>
                  </div>

                  {/* Import Details */}
                  {isExpanded && (
                    <div className="mt-3 space-y-3">
                      {/* Import Details */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="font-medium">Duration:</span> {getDuration(imp)}
                        </div>
                        {imp.targetResultSha && (
                          <div>
                            <span className="font-medium">Result SHA:</span>{' '}
                            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                              {imp.targetResultSha.slice(0, 8)}
                            </code>
                          </div>
                        )}
                        {imp.sourceBaseSha && (
                          <div>
                            <span className="font-medium">Source Base:</span>{' '}
                            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                              {imp.sourceBaseSha.slice(0, 8)}
                            </code>
                          </div>
                        )}
                        {imp.sourceHeadSha && (
                          <div>
                            <span className="font-medium">Source Head:</span>{' '}
                            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                              {imp.sourceHeadSha.slice(0, 8)}
                            </code>
                          </div>
                        )}
                        {imp.finishedAt && (
                          <div>
                            <span className="font-medium">Finished:</span>{' '}
                            {new Date(imp.finishedAt).toLocaleString()}
                          </div>
                        )}
                      </div>

                      {/* Logs */}
                      {imp.log && (
                        <div>
                          <h4 className="mb-1 text-sm font-medium text-gray-700">Logs</h4>
                          <div className="max-h-64 overflow-auto rounded-md border bg-gray-50 p-3">
                            <pre className="whitespace-pre-wrap font-mono text-xs">{imp.log}</pre>
                          </div>
                        </div>
                      )}

                      {/* No logs message for running imports */}
                      {!imp.log && isRunning && (
                        <div className="text-sm italic text-gray-500">
                          Logs will appear as import runs...
                        </div>
                      )}

                      {/* Status-specific messages */}
                      {imp.status === 'succeeded_noop' && (
                        <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-600">
                          Import completed successfully but no changes were needed.
                        </div>
                      )}
                      {imp.status === 'failed_dirty' && (
                        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                          Import failed: Target repository has uncommitted changes.
                        </div>
                      )}
                      {imp.status === 'failed_conflict' && (
                        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                          Import failed: Merge conflicts detected.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Download}
            title="No imports found"
            description="Imports will appear here when changes are imported to target repositories"
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenConfigModal}
                disabled={isLoadingTargetRepos}
              >
                Start Import
              </Button>
            }
          />
        )}
      </div>

      {/* Start Import Modal */}
      <Modal
        isOpen={isConfigModalOpen}
        onClose={handleCloseConfigModal}
        title="Start Import"
        size="md"
      >
        <ImportConfigForm
          onSubmit={handleStartImport}
          onCancel={handleCloseConfigModal}
          targetRepos={targetRepos}
        />
      </Modal>
    </div>
  );
}
