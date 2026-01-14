import React from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { projectsApi, changesetsApi } from '@/lib/api';
import { CreateChangeSetSchema } from '@/lib/validation';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/Toast';

export const Route = createFileRoute('/changesets/new')({
  component: NewChangeset,
});

/**
 * New changeset creation page component
 * Form to create a new changeset with validation and draft persistence
 */
function NewChangeset() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const searchParams = Route.useSearch();
  const projectId = (searchParams as any).project_id;

  // Fetch projects for the project selector
  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then((res) => res.data),
  });

  // Fetch branches for the selected project
  const { data: branches, isLoading: isLoadingBranches } = useQuery({
    queryKey: ['project-branches', projectId],
    queryFn: () => projectsApi.getBranches(projectId || '').then((res) => res.data),
    enabled: !!projectId,
  });

  // Form setup
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<z.infer<typeof CreateChangeSetSchema>>({
    resolver: zodResolver(CreateChangeSetSchema),
    defaultValues: {
      projectId: projectId || '',
      title: '',
      body: '',
      baseBranch: '',
    },
  });

  // Watch for changes to save draft
  const watchedValues = watch();

  // Save draft to localStorage
  React.useEffect(() => {
    const draft = {
      projectId: watchedValues.projectId,
      title: watchedValues.title,
      body: watchedValues.body,
      baseBranch: watchedValues.baseBranch,
    };
    localStorage.setItem('changeset-draft', JSON.stringify(draft));
  }, [watchedValues]);

  // Load draft on mount
  React.useEffect(() => {
    const draft = localStorage.getItem('changeset-draft');
    if (draft) {
      try {
        const parsedDraft = JSON.parse(draft);
        if (parsedDraft.title) setValue('title', parsedDraft.title);
        if (parsedDraft.body) setValue('body', parsedDraft.body);
        if (parsedDraft.baseBranch) setValue('baseBranch', parsedDraft.baseBranch);
        if (parsedDraft.projectId && !projectId) setValue('projectId', parsedDraft.projectId);
      } catch (e) {
        console.error('Failed to parse draft:', e);
      }
    }
  }, [setValue, projectId]);

  // Mutation for creating changeset
  const createChangesetMutation = useMutation({
    mutationFn: (data: z.infer<typeof CreateChangeSetSchema>) =>
      changesetsApi.create(data).then((res) => res.data),
    onSuccess: (data) => {
      success('Changeset created successfully!');
      localStorage.removeItem('changeset-draft');
      navigate({ to: `/changesets/${data.id}` });
    },
    onError: (err: Error) => {
      showError(`Failed to create changeset: ${err.message}`);
    },
  });

  // Handle project change
  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProjectId = e.target.value;
    setValue('projectId', newProjectId);
    setValue('baseBranch', ''); // Reset branch when project changes
  };

  // Handle form submission
  const onSubmit = (data: z.infer<typeof CreateChangeSetSchema>) => {
    createChangesetMutation.mutate(data);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <Link to="/changesets" className="text-sm text-blue-600 hover:underline">
          ← Back to Changesets
        </Link>
      </div>

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Create New Changeset</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Project Selector */}
          <Select
            label="Project"
            id="projectId"
            options={[
              { value: '', label: 'Select a project' },
              ...(projects?.map((p: any) => ({ value: p.id, label: p.name })) || []),
            ]}
            loading={isLoadingProjects}
            error={errors.projectId?.message}
            fullWidth
            {...register('projectId', { onChange: handleProjectChange })}
          />

          {/* Title */}
          <Input
            label="Title"
            id="title"
            placeholder="Enter changeset title"
            error={errors.title?.message}
            fullWidth
            {...register('title')}
          />

          {/* Body */}
          <Textarea
            label="Description (optional)"
            id="body"
            placeholder="Enter a description for this changeset"
            error={errors.body?.message}
            fullWidth
            autoResize
            minRows={3}
            maxRows={10}
            {...register('body')}
          />

          {/* Base Branch */}
          <Select
            label="Base Branch"
            id="baseBranch"
            options={[
              { value: '', label: 'Select a branch' },
              ...(branches?.map((b: string) => ({ value: b, label: b })) || []),
            ]}
            loading={isLoadingBranches}
            error={errors.baseBranch?.message}
            fullWidth
            {...register('baseBranch')}
          />

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t pt-4">
            <Link to="/changesets">
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </Link>
            <Button type="submit" loading={isSubmitting || createChangesetMutation.isPending}>
              Create Changeset
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
