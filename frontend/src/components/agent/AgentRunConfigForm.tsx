import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateAgentRunSchema, CreateAgentRunInput } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';

/**
 * Props for the AgentRunConfigForm component
 */
export interface AgentRunConfigFormProps {
  /** Callback when the form is submitted successfully */
  onSubmit: (data: CreateAgentRunInput) => Promise<void>;
  /** Callback when the form is cancelled */
  onCancel: () => void;
  /** Whether the form is currently submitting */
  isLoading?: boolean;
  /** Optional available agent keys */
  availableAgents?: string[];
}

/**
 * AgentRunConfigForm component
 * Form for configuring and triggering an agent run
 *
 * Features:
 * - Agent key selection (if multiple available)
 * - Input summary
 * - Prompt input
 * - Executable path input
 * - Base args input
 * - React Hook Form with Zod validation
 * - Loading state
 */
export function AgentRunConfigForm({
  onSubmit,
  onCancel,
  isLoading = false,
  availableAgents = ['default'],
}: AgentRunConfigFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateAgentRunInput>({
    resolver: zodResolver(CreateAgentRunSchema),
    defaultValues: {
      agentKey: availableAgents[0] || 'default',
      inputSummary: '',
      prompt: '',
      config: {
        executablePath: '',
        baseArgs: [],
      },
    },
  });

  const handleFormSubmit = async (data: CreateAgentRunInput) => {
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Agent Key */}
      {availableAgents.length > 1 && (
        <div>
          <label htmlFor="agentKey" className="mb-1 block text-sm font-medium text-gray-700">
            Agent
          </label>
          <select
            id="agentKey"
            {...register('agentKey')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            {availableAgents.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">Select the AI agent to run</p>
        </div>
      )}

      {/* Input Summary */}
      <div>
        <label htmlFor="inputSummary" className="mb-1 block text-sm font-medium text-gray-700">
          Summary (Optional)
        </label>
        <Input
          id="inputSummary"
          type="text"
          placeholder="Brief description of the task"
          {...register('inputSummary')}
          error={errors.inputSummary?.message}
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-gray-500">A short summary of what the agent will do</p>
      </div>

      {/* Prompt */}
      <div>
        <label htmlFor="prompt" className="mb-1 block text-sm font-medium text-gray-700">
          Prompt
        </label>
        <Textarea
          id="prompt"
          rows={6}
          placeholder="Describe the task for the agent..."
          {...register('prompt')}
          error={errors.prompt?.message}
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-gray-500">Detailed instructions for the agent</p>
      </div>

      {/* Executable Path */}
      <div>
        <label htmlFor="executablePath" className="mb-1 block text-sm font-medium text-gray-700">
          Executable Path
        </label>
        <Input
          id="executablePath"
          type="text"
          placeholder="/path/to/executable"
          {...register('config.executablePath')}
          error={errors.config?.executablePath?.message}
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-gray-500">Path to the agent executable</p>
      </div>

      {/* Base Args */}
      <div>
        <label htmlFor="baseArgs" className="mb-1 block text-sm font-medium text-gray-700">
          Base Arguments (Optional)
        </label>
        <Input
          id="baseArgs"
          type="text"
          placeholder="--arg1 --arg2 (space-separated)"
          {...register('config.baseArgs.0', {
            onChange: (e) => {
              const args = e.target.value.split(' ').filter((arg) => arg.length > 0);
              // Update the baseArgs array
              return args;
            },
          })}
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-gray-500">
          Additional arguments to pass to the agent (space-separated)
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isLoading || isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={isLoading || isSubmitting}>
          Trigger Agent Run
        </Button>
      </div>
    </form>
  );
}
