/**
 * Settings Tab Component
 * Displays and allows editing of project settings
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { Project, AgentParams } from '@/types';
import { Button } from '@/components/ui/Button';
import { Select, SelectOption } from '@/components/ui/Select';

export interface SettingsTabProps {
  project: Project;
}

export function SettingsTab({ project }: SettingsTabProps) {
  const [name, setName] = useState(project.name);
  const [defaultBranch, setDefaultBranch] = useState(project.defaultBranch);
  const [defaultAgent, setDefaultAgent] = useState(project.defaultAgent || 'opencode');
  const [agentParams, setAgentParams] = useState<AgentParams>({});
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string; provider?: string }[]>([]);

  // Parse agentParams from JSON string on mount and when project changes
  useEffect(() => {
    if (project.agentParams) {
      try {
        setAgentParams(JSON.parse(project.agentParams));
      } catch {
        setAgentParams({});
      }
    } else {
      setAgentParams({});
    }
  }, [project.agentParams]);

  const queryClient = useQueryClient();

  // Fetch available models from OpenCode CLI
  const { data: modelsData, isLoading: isLoadingModels } = useQuery({
    queryKey: ['models'],
    queryFn: () => projectsApi.getModels().then((res) => res.data.data),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Update available models when data changes
  useEffect(() => {
    if (modelsData && Array.isArray(modelsData)) {
      setAvailableModels(modelsData);
    }
  }, [modelsData]);

  const updateProjectMutation = useMutation({
    mutationFn: (data: { name?: string; defaultBranch?: string; defaultAgent?: string; agentParams?: AgentParams }) =>
      projectsApi.update(project.id, data),
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
      defaultAgent: defaultAgent !== project.defaultAgent ? defaultAgent : undefined,
      agentParams: Object.keys(agentParams).length > 0 ? agentParams : undefined,
    });
  };

  const handleCancel = () => {
    setName(project.name);
    setDefaultBranch(project.defaultBranch);
    setDefaultAgent(project.defaultAgent || 'opencode');
    if (project.agentParams) {
      try {
        setAgentParams(JSON.parse(project.agentParams));
      } catch {
        setAgentParams({});
      }
    } else {
      setAgentParams({});
    }
    setIsEditing(false);
    setMessage(null);
  };

  const agentOptions: SelectOption[] = [
    { value: 'opencode', label: 'OpenCode' },
    { value: 'claudcode', label: 'ClaudeCode' },
  ];

  // Build model options from fetched models
  const modelOptions: SelectOption[] = [
    { value: '', label: 'Default (use agent default)' },
    ...availableModels.map((model) => ({
      value: model.id,
      label: model.name,
    })),
  ];

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

          {/* Default Agent */}
          <div className="mb-4">
            <label htmlFor="default-agent" className="mb-2 block text-sm font-medium text-gray-700">
              Default Code Agent
            </label>
            <Select
              id="default-agent"
              options={agentOptions}
              value={defaultAgent}
              onChange={(e) => setDefaultAgent(e.target.value)}
              disabled={!isEditing}
              fullWidth
            />
            <p className="mt-1 text-xs text-gray-500">
              Select the default AI agent to use for code generation and tasks
            </p>
          </div>

          {/* Default Model (stored in agentParams) */}
          <div className="mb-4">
            <label htmlFor="default-model" className="mb-2 block text-sm font-medium text-gray-700">
              Default Model
            </label>
            {isLoadingModels ? (
              <div className="flex items-center space-x-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
                <span className="text-sm text-gray-500">Loading available models...</span>
              </div>
            ) : (
              <Select
                id="default-model"
                options={modelOptions}
                value={agentParams.model || ''}
                onChange={(e) =>
                  setAgentParams((prev) => ({
                    ...prev,
                    model: e.target.value || undefined,
                  }))
                }
                disabled={!isEditing}
                fullWidth
              />
            )}
            <p className="mt-1 text-xs text-gray-500">
              Select the default AI model. Leave empty to use the agent's default model. Models are fetched from OpenCode CLI.
            </p>
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
