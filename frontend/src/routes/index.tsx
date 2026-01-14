import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  return (
    <div className="space-y-8">
      <div className="py-12 text-center">
        <h1 className="mb-4 text-4xl font-bold">Welcome to GitVibe</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          AI Agent Orchestration for Git Repository Management
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Link
          to="/projects"
          className="rounded-lg border bg-card p-6 transition-colors hover:bg-accent"
        >
          <h2 className="mb-2 text-xl font-semibold">Projects</h2>
          <p className="text-sm text-muted-foreground">
            Manage your source projects and repositories
          </p>
        </Link>

        <Link
          to="/target-repos"
          className="rounded-lg border bg-card p-6 transition-colors hover:bg-accent"
        >
          <h2 className="mb-2 text-xl font-semibold">Target Repos</h2>
          <p className="text-sm text-muted-foreground">Configure target repositories for changes</p>
        </Link>

        <Link
          to="/changesets"
          className="rounded-lg border bg-card p-6 transition-colors hover:bg-accent"
        >
          <h2 className="mb-2 text-xl font-semibold">Changesets</h2>
          <p className="text-sm text-muted-foreground">View and manage changesets and patches</p>
        </Link>
      </div>
    </div>
  );
}
