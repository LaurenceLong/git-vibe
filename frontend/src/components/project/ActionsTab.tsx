/**
 * Actions Tab Component
 * Displays CI/CD workflows and runs for the project
 */

import { Project } from '@/types';
import { EmptyState } from '@/components/ui/empty-state';

export interface ActionsTabProps {
  project: Project;
}

export function ActionsTab({ project }: ActionsTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Actions</h2>
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          New Workflow
        </button>
      </div>

      <EmptyState
        title="No workflows configured yet"
        description="Set up CI/CD workflows to automate your project's build, test, and deployment processes"
      />

      {/* TODO: Implement workflow listing and execution */}
      <div className="rounded-lg border bg-gray-50 p-6">
        <h3 className="mb-4 font-medium text-gray-900">Getting Started with Actions</h3>
        <ul className="list-inside list-disc space-y-2 text-sm text-gray-600">
          <li>Create workflow files in your repository</li>
          <li>Configure triggers for automatic runs</li>
          <li>View workflow runs and logs</li>
          <li>Set up branch protection rules</li>
        </ul>
      </div>
    </div>
  );
}
