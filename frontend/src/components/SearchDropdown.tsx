import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { searchApi, projectsApi } from '@/lib/api';
import type { Project, WorkItem, PullRequest } from 'git-vibe-shared';

interface SearchResult {
  type: 'project' | 'workitem' | 'pullrequest';
  data: Project | WorkItem | PullRequest;
}

interface SearchDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
}

export function SearchDropdown({ isOpen, onClose, query }: SearchDropdownProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Perform search on backend using debounced query
  const { data: searchResponse, isLoading } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchApi.search(debouncedQuery, 20),
    enabled: debouncedQuery.trim().length > 0,
  });

  // Transform search results into SearchResult format
  const results = useMemo(() => {
    if (!searchResponse?.data) return [];

    const searchResults: SearchResult[] = [];

    // Add projects
    searchResponse.data.projects.forEach((project) => {
      searchResults.push({ type: 'project', data: project });
    });

    // Add work items
    searchResponse.data.workItems.forEach((item) => {
      searchResults.push({ type: 'workitem', data: item });
    });

    // Add pull requests
    searchResponse.data.pullRequests.forEach((pr) => {
      searchResults.push({ type: 'pullrequest', data: pr });
    });

    return searchResults;
  }, [searchResponse]);

  const projectNames = searchResponse?.data?.projectNames ?? {};

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % results.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          handleResultClick(results[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  // Handle result click
  const handleResultClick = async (result: SearchResult) => {
    onClose();

    switch (result.type) {
      case 'project': {
        const project = result.data as Project;
        navigate({ to: `/projects/${project.name}` });
        break;
      }
      case 'workitem': {
        const workItem = result.data as WorkItem;
        try {
          const projectResponse = await projectsApi.get(workItem.projectId);
          const project = projectResponse.data;
          navigate({
            to: '/projects/$projectName/workitems',
            params: { projectName: project.name },
            search: { status: 'all', type: 'all', workItemId: workItem.id },
          });
        } catch (error) {
          console.error('Failed to fetch project for work item:', error);
        }
        break;
      }
      case 'pullrequest': {
        const pr = result.data as PullRequest;
        try {
          const projectResponse = await projectsApi.get(pr.projectId);
          const project = projectResponse.data;
          navigate({
            to: '/projects/$projectName/pullrequests',
            params: { projectName: project.name },
            search: { status: 'all', prId: pr.id },
          });
        } catch (error) {
          console.error('Failed to fetch project for pull request:', error);
        }
        break;
      }
    }
  };

  // Group results by type
  const groupedResults = {
    projects: results.filter((r) => r.type === 'project'),
    workitems: results.filter((r) => r.type === 'workitem'),
    pullrequests: results.filter((r) => r.type === 'pullrequest'),
  };

  // Get icon for result type
  const getResultIcon = (type: string) => {
    switch (type) {
      case 'project':
        return (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        );
      case 'workitem':
        return (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        );
      case 'pullrequest':
        return (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  // Get status badge for work items and PRs
  const getStatusBadge = (result: SearchResult) => {
    if (result.type === 'workitem') {
      const workItem = result.data as WorkItem;
      return (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            workItem.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
          }`}
        >
          {workItem.status}
        </span>
      );
    }
    if (result.type === 'pullrequest') {
      const pr = result.data as PullRequest;
      return (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            pr.status === 'open'
              ? 'bg-green-100 text-green-800'
              : pr.status === 'merged'
                ? 'bg-purple-100 text-purple-800'
                : 'bg-red-100 text-red-800'
          }`}
        >
          {pr.status}
        </span>
      );
    }
    return null;
  };

  // Render result section
  const renderSection = (title: string, sectionResults: SearchResult[], startIndex: number) => {
    if (sectionResults.length === 0) return null;

    return (
      <div className="mb-2">
        <div className="bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {title}
        </div>
        {sectionResults.map((result, sectionIndex) => {
          const globalIndex = startIndex + sectionIndex;
          const isSelected = selectedIndex === globalIndex;
          return (
            <button
              key={`${result.type}-${result.data.id}`}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-100 ${
                isSelected ? 'bg-blue-50' : ''
              }`}
              onClick={() => handleResultClick(result)}
              onMouseEnter={() => setSelectedIndex(globalIndex)}
            >
              <div className="flex-shrink-0 text-gray-400">{getResultIcon(result.type)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900">
                    {result.type === 'project'
                      ? (result.data as Project).name
                      : (result.data as WorkItem | PullRequest).title}
                  </span>
                  {getStatusBadge(result)}
                </div>
                {result.type === 'workitem' && (
                  <>
                    {(result.data as WorkItem).projectId && projectNames[(result.data as WorkItem).projectId] && (
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        Project: {projectNames[(result.data as WorkItem).projectId]}
                      </p>
                    )}
                    {(result.data as WorkItem).body && (
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {(result.data as WorkItem).body}
                      </p>
                    )}
                  </>
                )}
                {result.type === 'pullrequest' && (
                  <>
                    {(result.data as PullRequest).projectId && projectNames[(result.data as PullRequest).projectId] && (
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        Project: {projectNames[(result.data as PullRequest).projectId]}
                      </p>
                    )}
                    {(result.data as PullRequest).description && (
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {(result.data as PullRequest).description}
                      </p>
                    )}
                  </>
                )}
                {result.type === 'project' && (
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {(result.data as Project).sourceRepoPath}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      data-search-dropdown
      className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
      onKeyDown={handleKeyDown}
    >
      {isLoading && query.trim() ? (
        <div className="px-4 py-8 text-center text-gray-500">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-b-2 border-gray-400"></div>
          <p className="mt-2 text-sm">Searching...</p>
        </div>
      ) : query.trim() && results.length === 0 ? (
        <div className="px-4 py-8 text-center text-gray-500">
          <svg
            className="mx-auto h-12 w-12 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="mt-2 text-sm">No results found</p>
          <p className="mt-1 text-xs text-gray-400">Try adjusting your search terms</p>
        </div>
      ) : !query.trim() ? (
        <div className="px-4 py-6">
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Keyboard shortcuts</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Focus search</span>
                <kbd className="rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs">
                  ⌘K
                </kbd>
              </div>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Navigate results</span>
                <kbd className="rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs">
                  ↑↓
                </kbd>
              </div>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Select result</span>
                <kbd className="rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs">
                  Enter
                </kbd>
              </div>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Close</span>
                <kbd className="rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs">
                  Esc
                </kbd>
              </div>
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Search tips</h3>
            <ul className="space-y-1 text-xs text-gray-600">
              <li>• Search projects by name</li>
              <li>• Search work items by title or description</li>
              <li>• Search pull requests by title or description</li>
            </ul>
          </div>
        </div>
      ) : (
        <>
          {renderSection('Projects', groupedResults.projects, 0)}
          {renderSection('Work Items', groupedResults.workitems, groupedResults.projects.length)}
          {renderSection(
            'Pull Requests',
            groupedResults.pullrequests,
            groupedResults.projects.length + groupedResults.workitems.length
          )}
        </>
      )}
    </div>
  );
}

interface SearchInputProps {
  projectId?: string;
}

export function SearchInput({ projectId: _projectId }: SearchInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFocus = () => {
    setIsOpen(true);
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Delay closing to allow click events on dropdown items
    setTimeout(() => {
      const dropdown = document.querySelector('[data-search-dropdown]');
      if (!dropdown?.contains(e.relatedTarget as Node)) {
        setIsOpen(false);
      }
    }, 200);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          id="input-jml75uq"
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Search or jump to..."
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-invalid="false"
        />
        <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 sm:inline-block">
          ⌘K
        </kbd>
      </div>
      <SearchDropdown isOpen={isOpen} onClose={handleClose} query={query} />
    </div>
  );
}
