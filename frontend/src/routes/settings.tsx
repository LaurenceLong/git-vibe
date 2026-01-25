/**
 * Global Settings - default project settings used when creating a new project
 * Same level as Projects and Dashboard in the app navigation
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, projectsApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Select, SelectOption } from '@/components/ui/Select';
import { useModels } from '@/hooks/useModels';
import { useToast } from '@/components/Toast';
import type { AgentKey, AgentParams } from '@/types';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  component: GlobalSettings,
});

function GlobalSettings() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [defaultAgent, setDefaultAgent] = useState<AgentKey>('opencode');
  const [agentParams, setAgentParams] = useState<AgentParams>({});
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);

  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['settings', 'global'],
    queryFn: () => settingsApi.get(),
  });

  useEffect(() => {
    if (settings) {
      setDefaultAgent((settings.defaultAgent as AgentKey) || 'opencode');
      setAgentParams(settings.agentParams || {});
    }
  }, [settings]);

  const { models, isLoading: isLoadingModels, refetch: refetchModels } = useModels(defaultAgent);

  const updateSettingsMutation = useMutation({
    mutationFn: (data: { defaultAgent?: AgentKey; agentParams?: AgentParams }) =>
      settingsApi.update(data),
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Settings saved successfully' });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: () => {
      setMessage({ type: 'error', text: 'Failed to save settings' });
      setTimeout(() => setMessage(null), 3000);
    },
  });

  const handleSave = () => {
    updateSettingsMutation.mutate({
      defaultAgent,
      agentParams: Object.keys(agentParams).length > 0 ? agentParams : {},
    });
  };

  const handleCancel = () => {
    if (settings) {
      setDefaultAgent((settings.defaultAgent as AgentKey) || 'opencode');
      setAgentParams(settings.agentParams || {});
    }
    setIsEditing(false);
    setMessage(null);
  };

  const handleRefreshModels = async () => {
    setIsRefreshingModels(true);
    try {
      await projectsApi.refreshModels(defaultAgent);
      await refetchModels();
      success('Models refreshed successfully');
    } catch {
      showError('Failed to refresh models');
    } finally {
      setIsRefreshingModels(false);
    }
  };

  const agentOptions: SelectOption[] = [
    { value: 'opencode', label: 'OpenCode' },
    { value: 'claudecode', label: 'ClaudeCode' },
  ];

  const modelOptions: SelectOption[] = [
    { value: '', label: 'Default (use agent default)' },
    ...models.map((model) => ({
      value: model.id,
      label: model.name,
    })),
  ];

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Global Settings</h2>
        <p className="mb-4 text-sm text-gray-600">
          Default project settings. These are applied when creating a new project (Default Code
          Agent and Default Model).
        </p>
        <div className="rounded-lg border bg-gray-50 p-6">
          {message && (
            <div
              className={`mb-4 rounded-md p-4 ${
                message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="default-agent" className="mb-2 block text-sm font-medium text-gray-700">
              Default Code Agent
            </label>
            <Select
              id="default-agent"
              options={agentOptions}
              value={defaultAgent}
              onChange={(e) => setDefaultAgent(e.target.value as AgentKey)}
              disabled={!isEditing}
              fullWidth
            />
            <p className="mt-1 text-xs text-gray-500">
              Default AI agent for new projects (code generation and tasks)
            </p>
          </div>

          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <label htmlFor="default-model" className="block text-sm font-medium text-gray-700">
                Default Model
              </label>
              <button
                type="button"
                onClick={handleRefreshModels}
                disabled={isRefreshingModels}
                className="rounded p-1 text-green-600 hover:bg-green-100 hover:text-green-700 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-green-600"
                title="Refresh model list"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={isRefreshingModels ? 'animate-spin' : ''}
                >
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 21h5v-5" />
                </svg>
              </button>
            </div>
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
              Default AI model for new projects. Leave empty to use the agent&apos;s default model.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {!isEditing ? (
              <Button
                variant="primary"
                onClick={() => setIsEditing(true)}
                disabled={updateSettingsMutation.isPending}
              >
                Edit Settings
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  loading={updateSettingsMutation.isPending}
                >
                  Save Changes
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleCancel}
                  disabled={updateSettingsMutation.isPending}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
