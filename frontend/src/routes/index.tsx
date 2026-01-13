import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  return (
    <div className="space-y-8">
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold mb-4">Welcome to GitVibe</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          AI Agent Orchestration for Git Repository Management
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Link
          to="/projects"
          className="p-6 border rounded-lg bg-card hover:bg-accent transition-colors"
        >
          <h2 className="text-xl font-semibold mb-2">Projects</h2>
          <p className="text-sm text-muted-foreground">
            Manage your source projects and repositories
          </p>
        </Link>

        <Link
          to="/target-repos"
          className="p-6 border rounded-lg bg-card hover:bg-accent transition-colors"
        >
          <h2 className="text-xl font-semibold mb-2">Target Repos</h2>
          <p className="text-sm text-muted-foreground">
            Configure target repositories for changes
          </p>
        </Link>

        <Link
          to="/changesets"
          className="p-6 border rounded-lg bg-card hover:bg-accent transition-colors"
        >
          <h2 className="text-xl font-semibold mb-2">Changesets</h2>
          <p className="text-sm text-muted-foreground">
            View and manage changesets and patches
          </p>
        </Link>
      </div>
    </div>
  );
}
