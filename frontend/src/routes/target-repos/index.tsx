import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { targetReposApi } from '@/lib/api';
import { useState } from 'react';

export const Route = createFileRoute('/target-repos/')({
  component: TargetReposIndex,
});

function TargetReposIndex() {
  const { data: repos, isLoading } = useQuery({
    queryKey: ['target-repos'],
    queryFn: () => targetReposApi.list().then((res) => res.data),
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    repoPath: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await targetReposApi.create(formData);
    setIsModalOpen(false);
    setFormData({ name: '', repoPath: '' });
  };

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold">Target Repositories</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Add Target Repo
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="grid gap-4">
          {repos?.map((repo) => (
            <div key={repo.id} className="p-4 border rounded-lg bg-card">
              <h3 className="text-lg font-semibold">{repo.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{repo.repoPath}</p>
              <div className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium">Default Branch:</span> {repo.defaultBranch}
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-lg w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Target Repository</h3>
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
                  placeholder="My Target Repo"
                />
              </div>
              <div>
                <label htmlFor="repoPath" className="block text-sm font-medium mb-1">
                  Repo Path
                </label>
                <input
                  id="repoPath"
                  type="text"
                  required
                  value={formData.repoPath}
                  onChange={(e) => setFormData({ ...formData, repoPath: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="/path/to/target/repo"
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
