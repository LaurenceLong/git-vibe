import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateThreadSchema, CreateThreadInput } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';

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
 * ThreadComposer component
 * Form for creating a new review thread
 *
 * Features:
 * - File path input
 * - Line number input
 * - Comment content textarea
 * - React Hook Form with Zod validation
 * - Loading state
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
      file: initialFile,
      line: initialLine,
      comment: '',
    },
  });

  const handleFormSubmit = async (data: CreateThreadInput) => {
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* File Path */}
      <div>
        <label htmlFor="file" className="mb-1 block text-sm font-medium text-gray-700">
          File Path
        </label>
        <Input
          id="file"
          type="text"
          placeholder="src/app.tsx"
          {...register('file')}
          error={errors.file?.message}
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-gray-500">Relative path to the file in the repository</p>
      </div>

      {/* Line Number */}
      <div>
        <label htmlFor="line" className="mb-1 block text-sm font-medium text-gray-700">
          Line Number
        </label>
        <Input
          id="line"
          type="number"
          min="1"
          placeholder="10"
          {...register('line', { valueAsNumber: true })}
          error={errors.line?.message}
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-gray-500">The line number to attach the thread to</p>
      </div>

      {/* Comment */}
      <div>
        <label htmlFor="comment" className="mb-1 block text-sm font-medium text-gray-700">
          Comment
        </label>
        <Textarea
          id="comment"
          rows={4}
          placeholder="Describe the issue or suggestion..."
          {...register('comment')}
          error={errors.comment?.message}
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-gray-500">Add your review comment or feedback</p>
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
