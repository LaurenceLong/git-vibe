/**
 * Code Tab Component
 * Displays source files and repository contents
 */

import { Project } from '@/types';
import { EmptyState } from '@/components/ui/empty-state';

export interface CodeTabProps {
  project: Project;
}

export function CodeTab({ project }: CodeTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold text-gray-900">Code</h2>
          <span className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700">
            Branch: <span className="font-medium">{project.defaultBranch}</span>
          </span>
        </div>
        <div className="flex space-x-2">
          <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Add file
          </button>
          <button className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
            Clone
          </button>
        </div>
      </div>

      <EmptyState
        title="Repository not yet initialized"
        description="The repository structure will be displayed here once the project is fully set up"
      />

      {/* TODO: Implement file tree and code viewer */}
      <div className="rounded-lg border bg-gray-50 p-6">
        <h3 className="mb-4 font-medium text-gray-900">Repository Browser</h3>
        <ul className="list-inside list-disc space-y-2 text-sm text-gray-600">
          <li>Browse files and directories</li>
          <li>View file contents with syntax highlighting</li>
          <li>Compare branches and commits</li>
          <li>Manage file operations (add, edit, delete)</li>
        </ul>
      </div>
    </div>
  );
}
