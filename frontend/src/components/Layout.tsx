import { Link } from '@tanstack/react-router';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
            <Link to="/" className="text-2xl font-bold text-primary">
              GitVibe
            </Link>
            <div className="flex gap-4">
              <Link
                to="/projects"
                className="text-sm font-medium transition-colors hover:text-primary"
              >
                Projects
              </Link>
              <Link
                to="/target-repos"
                className="text-sm font-medium transition-colors hover:text-primary"
              >
                Target Repos
              </Link>
              <Link
                to="/changesets"
                className="text-sm font-medium transition-colors hover:text-primary"
              >
                Changesets
              </Link>
            </div>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
