import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateImportSchema, CreateImportInput } from '@/lib/validation';
import { Button } from '@/components/ui/Button';

/**
 * Props for the ImportConfigForm component
 */
export interface ImportConfigFormProps {
  /** Callback when the form is submitted successfully */
  onSubmit: (data: CreateImportInput) => Promise<void>;
  /** Callback when the form is cancelled */
  onCancel: () => void;
  /** Whether the form is currently submitting */
  isLoading?: boolean;
  /** Available target repositories */
  targetRepos: Array<{ id: string; name: string }>;
}

/**
 * ImportConfigForm component
 * Form for configuring and starting an import job
 *
 * Features:
 * - Target repository selection
 * - React Hook Form with Zod validation
 * - Loading state
 */
export function ImportConfigForm({
  onSubmit,
  onCancel,
  isLoading = false,
  targetRepos,
}: ImportConfigFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateImportInput>({
    resolver: zodResolver(CreateImportSchema),
    defaultValues: {
      targetRepoId: '',
    },
  });

  const handleFormSubmit = async (data: CreateImportInput) => {
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Target Repository */}
      <div>
        <label htmlFor="targetRepoId" className="mb-1 block text-sm font-medium text-gray-700">
          Target Repository
        </label>
        <select
          id="targetRepoId"
          {...register('targetRepoId')}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
        >
          <option value="">Select a target repository...</option>
          {targetRepos.map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.name}
            </option>
          ))}
        </select>
        {errors.targetRepoId && (
          <p className="mt-1 text-sm text-red-600">{errors.targetRepoId.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">Select the repository to import changes to</p>
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
          Start Import
        </Button>
      </div>
    </form>
  );
}
