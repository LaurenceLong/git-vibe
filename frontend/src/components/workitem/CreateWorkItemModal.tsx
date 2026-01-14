/**
 * CreateWorkItemModal Component
 *
 * Modal form to create new WorkItems
 *
 * Features:
 * - Modal form to create new WorkItem
 * - Fields: Type (Issue/Feature Request), Title, Body
 * - Validation using Zod schema
 * - Submit creates WorkItem with worktree + branch
 * - Show loading state during creation
 * - Close modal on success and navigate to WorkItem detail
 * - Handle errors with user-friendly messages
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateWorkItemSchema } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';

export interface CreateWorkItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSubmit: (data: {
    type: 'issue' | 'feature-request';
    title: string;
    body?: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

/**
 * CreateWorkItemModal component
 *
 * @param isOpen - Whether the modal is open
 * @param onClose - Callback when modal is closed
 * @param projectId - The project ID to create WorkItem for
 * @param onSubmit - Callback when form is submitted
 * @param isLoading - Whether the form is currently submitting
 */
export function CreateWorkItemModal({
  isOpen,
  onClose,
  projectId,
  onSubmit,
  isLoading = false,
}: CreateWorkItemModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(CreateWorkItemSchema),
    defaultValues: {
      projectId,
      type: 'issue',
      title: '',
      body: '',
    },
  });

  const handleFormSubmit = async (data: any) => {
    await onSubmit(data);
    reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create New Work Item" size="lg">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        {/* Type Selection */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Type
          </label>
          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                value="issue"
                {...register('type')}
                disabled={isLoading || isSubmitting}
                className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Issue</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                value="feature-request"
                {...register('type')}
                disabled={isLoading || isSubmitting}
                className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Feature Request</span>
            </label>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Select whether this is an issue or a feature request
          </p>
          {errors.type && <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>}
        </div>

        {/* Title */}
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium text-gray-700">
            Title <span className="text-red-500">*</span>
          </label>
          <Input
            id="title"
            type="text"
            placeholder="Brief description of the work item"
            {...register('title')}
            error={errors.title?.message}
            disabled={isLoading || isSubmitting}
            fullWidth
          />
          <p className="mt-1 text-xs text-gray-500">A short, descriptive title for the work item</p>
        </div>

        {/* Body */}
        <div>
          <label htmlFor="body" className="mb-1 block text-sm font-medium text-gray-700">
            Description
          </label>
          <Textarea
            id="body"
            rows={6}
            placeholder="Detailed description of the work item..."
            {...register('body')}
            error={errors.body?.message}
            disabled={isLoading || isSubmitting}
            fullWidth
          />
          <p className="mt-1 text-xs text-gray-500">
            Provide more details about the work item (optional)
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isLoading || isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isLoading || isSubmitting}>
            Create Work Item
          </Button>
        </div>
      </form>
    </Modal>
  );
}
