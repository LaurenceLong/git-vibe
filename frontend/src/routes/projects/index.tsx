import React, { useState, useMemo, useRef } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FolderOpen, X, GitPullRequest, Folder as FolderIcon } from 'lucide-react';
import { projectsApi } from '@/lib/api';
import { CreateProjectSchema } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/Toast';
import { extractErrorMessage } from '@/lib/errorUtils';
import type { Project } from '@/types';

export const Route = createFileRoute('/projects/')({
  component: ProjectsIndex,
});

/**
 * Project card component - memoized to prevent unnecessary re-renders
 */
const ProjectCard = React.memo(
  ({
    project,
    stats,
    onDelete,
    isDeleting,
  }: {
    project: Project;
    stats: ProjectStats;
    onDelete: (project: { id: string; name: string }) => void;
    isDeleting: boolean;
  }) => {
    return (
      <div className="group relative flex max-w-md flex-col rounded-lg border bg-white p-4 transition-colors hover:bg-gray-50">
        {/* Delete button - small X at top right */}
        <button
          onClick={(e) => {
            e.preventDefault();
            onDelete({ id: project.id, name: project.name });
          }}
          disabled={isDeleting}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 disabled:opacity-50 group-hover:opacity-100"
          title="Delete project"
        >
          <X className="h-4 w-4" />
        </button>

        <Link to="/projects/$projectName" params={{ projectName: project.name }} className="block">
          <div className="pr-6">
            <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
            <p className="mt-1 text-sm text-gray-600">{project.sourceRepoPath}</p>

            {/* Project Statistics Short Info */}
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
              <div className="flex items-center gap-1.5">
                <FolderIcon className="h-3.5 w-3.5 text-blue-500" />
                <span>
                  <span className="font-medium">{stats.workItems}</span> work items
                  <span className="text-gray-400"> ({stats.openWorkItems} open)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <GitPullRequest className="h-3.5 w-3.5 text-purple-500" />
                <span>
                  <span className="font-medium">{stats.pullRequests}</span> PRs
                  <span className="text-gray-400"> ({stats.openPullRequests} open)</span>
                </span>
              </div>
            </div>

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
          </div>
        </Link>
      </div>
    );
  }
);

ProjectCard.displayName = 'ProjectCard';

// Type for project stats
type ProjectStats = {
  workItems: number;
  openWorkItems: number;
  pullRequests: number;
  openPullRequests: number;
};

/**
 * Projects index page component
 * Displays list of projects with modal for creating new projects
 */
function ProjectsIndex() {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [projectToDelete, setProjectToDelete] = React.useState<{ id: string; name: string } | null>(
    null
  );
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch projects with statistics included in the response (single query optimization)
  const { data: response, isLoading } = useQuery({
    queryKey: ['projects', currentPage, itemsPerPage, 'with-stats'],
    queryFn: () => projectsApi.list(currentPage, itemsPerPage, true),
  });

  const projects = response?.data?.data || [];
  const pagination = response?.data?.pagination
    ? {
        page: response.data.pagination.page,
        totalPages: response.data.pagination.totalPages,
        total: response.data.pagination.total,
        limit: response.data.pagination.limit,
      }
    : undefined;

  // Get statistics from the API response (backend calculates and returns them)
  const projectStatsMap = useMemo(() => {
    const statsMap = new Map<string, ProjectStats>();
    const statistics = response?.data?.statistics ?? {};

    projects.forEach((project: Project) => {
      const stats = statistics[project.id] ?? {
        workItems: 0,
        openWorkItems: 0,
        pullRequests: 0,
        openPullRequests: 0,
      };
      statsMap.set(project.id, stats);
    });

    return statsMap;
  }, [response, projects]);

  const getProjectStats = useMemo(
    () => (projectId: string) => {
      return (
        projectStatsMap.get(projectId) || {
          workItems: 0,
          openWorkItems: 0,
          pullRequests: 0,
          openPullRequests: 0,
        }
      );
    },
    [projectStatsMap]
  );

  const [sourceRepoPath, setSourceRepoPath] = useState('');
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { data: branchesData, isLoading: isLoadingBranches } = useQuery({
    queryKey: ['branches', sourceRepoPath],
    queryFn: () => projectsApi.getBranchesByPath(sourceRepoPath).then((res) => res.data),
    enabled: sourceRepoPath.length > 0,
  });

  const branches = branchesData?.data || [];
  const currentBranchFromRepo = branchesData?.currentBranch;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<z.infer<typeof CreateProjectSchema>>({
    resolver: zodResolver(CreateProjectSchema),
    defaultValues: {
      name: '',
      sourceRepoPath: '',
      defaultBranch: undefined,
    },
  });

  const watchedSourceRepoPath = watch('sourceRepoPath');

  React.useEffect(() => {
    setSourceRepoPath(watchedSourceRepoPath);
  }, [watchedSourceRepoPath]);

  React.useEffect(() => {
    if (currentBranchFromRepo && !watch('defaultBranch')) {
      setValue('defaultBranch', currentBranchFromRepo);
    }
  }, [currentBranchFromRepo, setValue, watch]);

  const handleFolderPicker = async () => {
    // Try to use File System Access API (modern browsers)
    if ('showDirectoryPicker' in window) {
      try {
        const directoryHandle = await (window as any).showDirectoryPicker();
        // Get the directory name
        const dirName = directoryHandle.name;
        // Note: File System Access API doesn't give us the full path for security reasons
        // We'll use the directory name and let the user adjust if needed
        // For a full path, we'd need a backend endpoint
        setValue('sourceRepoPath', dirName);
        setSourceRepoPath(dirName);
      } catch (error: any) {
        // User cancelled or error occurred
        if (error.name !== 'AbortError') {
          showError('Failed to select folder. Please enter the path manually.');
        }
      }
    } else {
      // Fallback to file input with webkitdirectory
      if (folderInputRef.current) {
        folderInputRef.current.click();
      }
    }
  };

  const handleFolderSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      // Get the directory path from the first file
      const filePath = files[0].webkitRelativePath || files[0].name;
      const directory = filePath.split('/')[0];
      // For webkitdirectory, we can't get the full path, only relative paths
      // We'll use the directory name as a hint
      setValue('sourceRepoPath', directory);
      setSourceRepoPath(directory);
    }
    // Reset the input so the same folder can be selected again
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

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
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to create project');
      showError(errorMessage);
    },
  });

  const onSubmit = (data: z.infer<typeof CreateProjectSchema>) => {
    createProjectMutation.mutate(data);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    reset();
  };

  const handleDeleteClick = (project: { id: string; name: string }) => {
    setProjectToDelete(project);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (projectToDelete) {
      deleteProjectMutation.mutate(projectToDelete.id);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setProjectToDelete(null);
  };

  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => projectsApi.delete(id).then((res) => res.data),
    onSuccess: () => {
      success('Project deleted successfully!');
      setDeleteModalOpen(false);
      setProjectToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to delete project');
      showError(errorMessage);
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Projects</h2>
        <Button onClick={() => setIsModalOpen(true)}>Create Project</Button>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects?.map((project: Project) => (
              <ProjectCard
                key={project.id}
                project={project}
                stats={getProjectStats(project.id)}
                onDelete={handleDeleteClick}
                isDeleting={deleteProjectMutation.isPending}
              />
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
      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title="Create Project" size="md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Name"
            id="name"
            placeholder="My Project"
            error={errors.name?.message}
            fullWidth
            {...register('name')}
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Source Repo Path
              <span className="ml-1 text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <Input
                id="sourceRepoPath"
                placeholder="/path/to/repo or C:\\path\\to\\repo"
                error={errors.sourceRepoPath?.message}
                fullWidth
                className="flex-1"
                {...register('sourceRepoPath')}
              />
              <input
                ref={folderInputRef}
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                style={{ display: 'none' }}
                onChange={handleFolderSelected}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleFolderPicker}
                className="flex items-center gap-2 whitespace-nowrap"
                title="Select folder (may require manual path entry)"
              >
                <FolderOpen className="h-4 w-4" />
                Browse
              </Button>
            </div>
            {errors.sourceRepoPath?.message && (
              <p className="mt-1 text-sm text-red-600">{errors.sourceRepoPath.message}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Enter the full path to your Git repository directory
            </p>
          </div>

          <Select
            label="Default Branch"
            id="defaultBranch"
            error={errors.defaultBranch?.message}
            fullWidth
            loading={isLoadingBranches}
            placeholder="Select a branch"
            options={branches.map((branch: string) => ({
              value: branch,
              label: branch,
            }))}
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

      {/* Delete Project Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} onClose={handleDeleteCancel} title="Delete Project" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-gray-900">{projectToDelete?.name}</span>?
          </p>
          <p className="text-sm text-red-600">
            This action cannot be undone. All associated data including work items, pull requests,
            and storage files will be permanently deleted.
          </p>
          <div className="flex justify-end gap-3 border-t pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={handleDeleteCancel}
              disabled={deleteProjectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteConfirm}
              loading={deleteProjectMutation.isPending}
            >
              Delete Project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
