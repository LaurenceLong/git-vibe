import React from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GitBranch } from 'lucide-react';
import { targetReposApi } from '@/lib/api';
import { CreateTargetRepoSchema } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/Toast';

export const Route = createFileRoute('/target-repos/')({
  component: TargetReposIndex,
});

/**
 * Target repositories index page component
 * Displays list of target repositories with modal for creating new ones
 */
function TargetReposIndex() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const { data: repos, isLoading } = useQuery({
    queryKey: ['target-repos'],
    queryFn: () => targetReposApi.list().then((res) => res.data),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<z.infer<typeof CreateTargetRepoSchema>>({
    resolver: zodResolver(CreateTargetRepoSchema),
    defaultValues: {
      name: '',
      repoPath: '',
      defaultBranch: 'main',
    },
  });

  const createTargetRepoMutation = useMutation({
    mutationFn: (data: z.infer<typeof CreateTargetRepoSchema>) =>
      targetReposApi.create(data).then((res) => res.data),
    onSuccess: () => {
      success('Target repository created successfully!');
      setIsModalOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['target-repos'] });
    },
    onError: (err: Error) => {
      showError(`Failed to create target repository: ${err.message}`);
    },
  });

  const onSubmit = (data: z.infer<typeof CreateTargetRepoSchema>) => {
    createTargetRepoMutation.mutate(data);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    reset();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Target Repositories</h2>
        <Button onClick={() => setIsModalOpen(true)}>Add Target Repo</Button>
      </div>

      {/* Target Repos List */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-white p-4">
              <Skeleton className="mb-2 h-6 w-3/4" />
              <Skeleton className="mb-2 h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : repos && repos.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No target repositories yet"
          description="Add a target repository to get started"
          action={<Button onClick={() => setIsModalOpen(true)}>Add Target Repo</Button>}
        />
      ) : (
        <div className="grid gap-4">
          {repos?.map((repo) => (
            <Link
              key={repo.id}
              to={`/target-repos/${repo.id}`}
              className="rounded-lg border bg-white p-4 transition-colors hover:bg-gray-50"
            >
              <h3 className="text-lg font-semibold text-gray-900">{repo.name}</h3>
              <p className="mt-1 text-sm text-gray-600">{repo.repoPath}</p>
              <div className="mt-2 text-xs text-gray-600">
                <span className="font-medium">Default Branch:</span> {repo.defaultBranch}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Target Repo Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Add Target Repository"
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Name"
            id="name"
            placeholder="My Target Repo"
            error={errors.name?.message}
            fullWidth
            {...register('name')}
          />

          <Input
            label="Repo Path"
            id="repoPath"
            placeholder="/path/to/target/repo"
            error={errors.repoPath?.message}
            fullWidth
            {...register('repoPath')}
          />

          <Input
            label="Default Branch"
            id="defaultBranch"
            placeholder="main"
            error={errors.defaultBranch?.message}
            fullWidth
            {...register('defaultBranch')}
          />

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseModal}
              disabled={isSubmitting || createTargetRepoMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting || createTargetRepoMutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
