import React, { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FolderOpen } from 'lucide-react';
import { projectsApi } from '@/lib/api';
import { CreateProjectSchema } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/components/Toast';

export const Route = createFileRoute('/projects/')({
  component: ProjectsIndex,
});

/**
 * Projects index page component
 * Displays list of projects with modal for creating new projects
 */
function ProjectsIndex() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { data: response, isLoading } = useQuery({
    queryKey: ['projects', currentPage, itemsPerPage],
    queryFn: () => projectsApi.list(currentPage, itemsPerPage).then((res) => res.data),
  });

  const projects = response?.data || [];
  const pagination = response?.pagination;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<z.infer<typeof CreateProjectSchema>>({
    resolver: zodResolver(CreateProjectSchema),
    defaultValues: {
      name: '',
      sourceRepoPath: '',
      sourceRepoUrl: '',
      defaultBranch: 'main',
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: (data: z.infer<typeof CreateProjectSchema>) =>
      projectsApi.create(data).then((res) => res.data),
    onSuccess: () => {
      success('Project created successfully!');
      setIsModalOpen(false);
      reset();
      setCurrentPage(1);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err: Error) => {
      showError(`Failed to create project: ${err.message}`);
    },
  });

  const onSubmit = (data: z.infer<typeof CreateProjectSchema>) => {
    createProjectMutation.mutate(data);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    reset();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Projects</h2>
        <Button onClick={() => setIsModalOpen(true)}>Add Project</Button>
      </div>

      {/* Projects List */}
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
      ) : projects && projects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          description="Get started by creating your first project"
          action={<Button onClick={() => setIsModalOpen(true)}>Create Project</Button>}
        />
      ) : (
        <>
          <div className="grid gap-4">
            {projects?.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.name}`}
                className="block rounded-lg border bg-white p-4 transition-colors hover:bg-gray-50"
              >
                <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                <p className="mt-1 text-sm text-gray-600">{project.sourceRepoPath}</p>
                {project.sourceRepoUrl && (
                  <a
                    href={project.sourceRepoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block text-sm text-blue-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {project.sourceRepoUrl}
                  </a>
                )}
                <div className="mt-2 text-xs text-gray-600">
                  <span className="font-medium">Default Branch:</span> {project.defaultBranch}
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-6">
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={setCurrentPage}
                totalItems={pagination.total}
                itemsPerPage={pagination.limit}
              />
            </div>
          )}
        </>
      )}

      {/* Create Project Modal */}
      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title="Add Project" size="md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Name"
            id="name"
            placeholder="My Project"
            error={errors.name?.message}
            fullWidth
            {...register('name')}
          />

          <Input
            label="Source Repo Path"
            id="sourceRepoPath"
            placeholder="/path/to/repo"
            error={errors.sourceRepoPath?.message}
            fullWidth
            {...register('sourceRepoPath')}
          />

          <Input
            label="Source Repo URL (optional)"
            id="sourceRepoUrl"
            type="url"
            placeholder="https://github.com/user/repo"
            error={errors.sourceRepoUrl?.message}
            fullWidth
            {...register('sourceRepoUrl')}
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
              disabled={isSubmitting || createProjectMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting || createProjectMutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
