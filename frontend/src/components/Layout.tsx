import { Link, useLocation } from '@tanstack/react-router';
import { useState } from 'react';
import { Input } from '@/components/ui/Input';

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement search functionality
    console.log('Searching for:', searchQuery);
  };

  // Check if we're on a project detail page
  const isProjectPage = /^\/projects\/[^/]+$/.test(location.pathname) ||
                        /^\/projects\/[^/]+\/(code|workitems|pullrequests|actions|settings)$/.test(location.pathname);

  // Extract project name from path if on project page
  const projectName = isProjectPage ? location.pathname.split('/')[2] : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/projects" className="text-2xl font-bold text-primary">
                GitVibe
              </Link>
              {isProjectPage && projectName && (
                <div className="flex items-center space-x-2 text-sm">
                  <Link
                    to="/projects"
                    className="font-medium text-gray-900 hover:text-blue-600"
                  >
                    Projects
                  </Link>
                  <span className="text-gray-400">/</span>
                  <span className="font-medium text-gray-900">{projectName}</span>
                </div>
              )}
            </div>

            {/* Search bar */}
            {isProjectPage && (
              <form onSubmit={handleSearch} className="flex-1 max-w-md">
                <Input
                  type="text"
                  placeholder="Search or jump to..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-sm"
                />
              </form>
            )}
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
