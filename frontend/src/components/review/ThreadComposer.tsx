import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateThreadSchema, CreateThreadInput } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';

/**
 * Props for the ThreadComposer component
 */
export interface ThreadComposerProps {
  /** Callback when the form is submitted successfully */
  onSubmit: (data: CreateThreadInput) => Promise<void>;
  /** Callback when the form is cancelled */
  onCancel: () => void;
  /** Whether the form is currently submitting */
  isLoading?: boolean;
  /** Optional initial file path */
  initialFile?: string;
  /** Optional initial line number */
  initialLine?: number;
}

/**
 * Severity options for the select dropdown
 */
const severityOptions: SelectOption[] = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
];

/**
 * ThreadComposer component
 * Form for creating a new review thread
 *
 * Features:
 * - Severity selection (info, warning, error)
 * - File path input
 * - Line number input
 * - React Hook Form with Zod validation
 * - Loading state
 *
 * Note: Comments are added separately using CommentComposer after thread creation
 */
export function ThreadComposer({
  onSubmit,
  onCancel,
  isLoading = false,
  initialFile = '',
  initialLine = 1,
}: ThreadComposerProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateThreadInput>({
    resolver: zodResolver(CreateThreadSchema),
    defaultValues: {
      severity: 'info',
      anchor: {
        filePath: initialFile,
        lineNumber: initialLine,
      },
    },
  });

  const handleFormSubmit = async (data: CreateThreadInput) => {
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Severity */}
      <div>
        <label htmlFor="severity" className="mb-1 block text-sm font-medium text-gray-700">
          Severity
        </label>
        <Select
          id="severity"
          options={severityOptions}
          placeholder="Select severity"
          {...register('severity')}
          error={errors.severity?.message}
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-gray-500">The severity level of the review thread</p>
      </div>

      {/* File Path */}
      <div>
        <label htmlFor="anchor.filePath" className="mb-1 block text-sm font-medium text-gray-700">
          File Path
        </label>
        <Input
          id="anchor.filePath"
          type="text"
          placeholder="src/app.tsx"
          {...register('anchor.filePath')}
          error={errors.anchor?.filePath?.message}
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-gray-500">Relative path to the file in the repository</p>
      </div>

      {/* Line Number */}
      <div>
        <label htmlFor="anchor.lineNumber" className="mb-1 block text-sm font-medium text-gray-700">
          Line Number
        </label>
        <Input
          id="anchor.lineNumber"
          type="number"
          min="1"
          placeholder="10"
          {...register('anchor.lineNumber', { valueAsNumber: true })}
          error={errors.anchor?.lineNumber?.message}
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-gray-500">The line number to attach the thread to</p>
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
          Create Thread
        </Button>
      </div>
    </form>
  );
}
