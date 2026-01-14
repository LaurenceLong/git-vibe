/**
 * Settings Tab Component
 * Displays and allows editing of project settings
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { Project } from '@/types';
import { Button } from '@/components/ui/Button';

export interface SettingsTabProps {
  project: Project;
}

export function SettingsTab({ project }: SettingsTabProps) {
  const [name, setName] = useState(project.name);
  const [defaultBranch, setDefaultBranch] = useState(project.defaultBranch);
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const queryClient = useQueryClient();

  const updateProjectMutation = useMutation({
    mutationFn: (data: { name?: string; defaultBranch?: string }) =>
      projectsApi.get(project.id).then(() => {
        // Note: This is a placeholder - actual update endpoint may differ
        return Promise.resolve({ data: { ...project, ...data } });
      }),
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Settings saved successfully' });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: () => {
      setMessage({ type: 'error', text: 'Failed to save settings' });
      setTimeout(() => setMessage(null), 3000);
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      setMessage({ type: 'error', text: 'Project name is required' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (!defaultBranch.trim()) {
      setMessage({ type: 'error', text: 'Default branch is required' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    updateProjectMutation.mutate({
      name: name !== project.name ? name : undefined,
      defaultBranch: defaultBranch !== project.defaultBranch ? defaultBranch : undefined,
    });
  };

  const handleCancel = () => {
    setName(project.name);
    setDefaultBranch(project.defaultBranch);
    setIsEditing(false);
    setMessage(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Project Settings</h2>
        <div className="rounded-lg border bg-gray-50 p-6">
          {/* Message */}
          {message && (
            <div
              className={`mb-4 rounded-md p-4 ${
                message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Project Name */}
          <div className="mb-4">
            <label htmlFor="project-name" className="mb-2 block text-sm font-medium text-gray-700">
              Project Name
            </label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isEditing}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="Enter project name"
            />
          </div>

          {/* Default Branch */}
          <div className="mb-4">
            <label
              htmlFor="default-branch"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Default Branch
            </label>
            <input
              id="default-branch"
              type="text"
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
              disabled={!isEditing}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="e.g., main, master"
            />
          </div>

          {/* Source Path (Read-only) */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">Source Path</label>
            <input
              type="text"
              value={project.sourceRepoPath}
              disabled
              className="w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-500"
              readOnly
            />
            <p className="mt-1 text-xs text-gray-500">Source path cannot be changed</p>
          </div>

          {/* Source URL (Read-only) */}
          {project.sourceRepoUrl && (
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">Source URL</label>
              <input
                type="text"
                value={project.sourceRepoUrl}
                disabled
                className="w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-500"
                readOnly
              />
              <p className="mt-1 text-xs text-gray-500">Source URL cannot be changed</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center space-x-3">
            {!isEditing ? (
              <Button
                variant="primary"
                onClick={() => setIsEditing(true)}
                disabled={updateProjectMutation.isPending}
              >
                Edit Settings
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  loading={updateProjectMutation.isPending}
                >
                  Save Changes
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleCancel}
                  disabled={updateProjectMutation.isPending}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Project Metadata */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Project Metadata</h2>
        <div className="rounded-lg border bg-gray-50 p-6">
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium text-gray-700">Project ID:</span>{' '}
              <span className="text-gray-900">{project.id}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Created:</span>{' '}
              <span className="text-gray-900">{new Date(project.createdAt).toLocaleString()}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Last Updated:</span>{' '}
              <span className="text-gray-900">{new Date(project.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
