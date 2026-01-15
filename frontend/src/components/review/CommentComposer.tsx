import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AddCommentSchema, AddCommentInput } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';

/**
 * Props for the CommentComposer component
 */
export interface CommentComposerProps {
  /** Callback when the form is submitted successfully */
  onSubmit: (data: AddCommentInput) => Promise<void>;
  /** Whether the form is currently submitting */
  isLoading?: boolean;
  /** Optional placeholder text */
  placeholder?: string;
}

/**
 * CommentComposer component
 * Form for adding a comment to a review thread
 *
 * Features:
 * - Comment content textarea
 * - React Hook Form with Zod validation
 * - Loading state
 */
export function CommentComposer({
  onSubmit,
  isLoading = false,
  placeholder = 'Add a comment...',
}: CommentComposerProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<AddCommentInput>({
    resolver: zodResolver(AddCommentSchema),
    defaultValues: {
      body: '',
    },
  });

  const handleFormSubmit = async (data: AddCommentInput) => {
    await onSubmit(data);
    reset();
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-3">
      {/* Comment */}
      <div>
        <Textarea
          id="body"
          rows={3}
          placeholder={placeholder}
          {...register('body')}
          error={errors.body?.message}
          disabled={isLoading}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" loading={isLoading || isSubmitting}>
          Add Comment
        </Button>
      </div>
    </form>
  );
}
