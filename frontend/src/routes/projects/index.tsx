import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { useState } from 'react';

export const Route = createFileRoute('/projects/')({
  component: ProjectsIndex,
});

function ProjectsIndex() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then((res) => res.data),
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    sourceRepoPath: '',
    sourceRepoUrl: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSubmit = {
      name: formData.name,
      sourceRepoPath: formData.sourceRepoPath,
      sourceRepoUrl: formData.sourceRepoUrl || undefined,
    };
    await projectsApi.create(dataToSubmit);
    setIsModalOpen(false);
    setFormData({ name: '', sourceRepoPath: '', sourceRepoUrl: '' });
  };

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold">Projects</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Add Project
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="grid gap-4">
          {projects?.map((project) => (
            <div key={project.id} className="p-4 border rounded-lg bg-card">
              <h3 className="text-lg font-semibold">{project.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {project.sourceRepoPath}
              </p>
              {project.sourceRepoUrl && (
                <a
                  href={project.sourceRepoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  {project.sourceRepoUrl}
                </a>
              )}
              <div className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium">Default Branch:</span> {project.defaultBranch}
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-lg w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Project</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-1">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="My Project"
                />
              </div>
              <div>
                <label htmlFor="sourceRepoPath" className="block text-sm font-medium mb-1">
                  Source Repo Path
                </label>
                <input
                  id="sourceRepoPath"
                  type="text"
                  required
                  value={formData.sourceRepoPath}
                  onChange={(e) => setFormData({ ...formData, sourceRepoPath: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="/path/to/repo"
                />
              </div>
              <div>
                <label htmlFor="sourceRepoUrl" className="block text-sm font-medium mb-1">
                  Source Repo URL (optional)
                </label>
                <input
                  id="sourceRepoUrl"
                  type="url"
                  value={formData.sourceRepoUrl}
                  onChange={(e) => setFormData({ ...formData, sourceRepoUrl: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="https://github.com/user/repo"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-md hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
