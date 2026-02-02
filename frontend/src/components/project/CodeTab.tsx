/**
 * Code Tab Component with WorkItem Integration
 *
 * GitHub-like code browser with file tree and file viewer
 * Supports manual file operations (add, edit, delete) integrated with WorkItems
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Custom theme with improved contrast - create a new object with enhanced colors
const customPrismTheme = {
  ...vscDarkPlus,
  'code[class*="language-"]': {
    ...vscDarkPlus['code[class*="language-"]'],
    color: '#e0e0e0',
    background: '#1e1e1e',
  },
  'pre[class*="language-"]': {
    ...vscDarkPlus['pre[class*="language-"]'],
    color: '#e0e0e0',
    background: '#1e1e1e',
  },
  '.token.comment': {
    color: '#6a9955',
  },
  '.token.prolog': {
    color: '#6a9955',
  },
  '.token.doctype': {
    color: '#6a9955',
  },
  '.token.cdata': {
    color: '#6a9955',
  },
  '.token.string': {
    color: '#ce9178',
  },
  '.token.char': {
    color: '#ce9178',
  },
  '.token.attr-value': {
    color: '#ce9178',
  },
  '.token.regex': {
    color: '#ce9178',
  },
  '.token.keyword': {
    color: '#569cd6',
    fontWeight: 'bold',
  },
  '.token.function': {
    color: '#dcdcaa',
  },
  '.token.number': {
    color: '#b5cea8',
  },
  '.token.operator': {
    color: '#d4d4d4',
  },
  '.token.punctuation': {
    color: '#d4d4d4',
  },
  '.token.property': {
    color: '#9cdcfe',
  },
  '.token.boolean': {
    color: '#569cd6',
  },
  '.token.class-name': {
    color: '#4ec9b0',
  },
  '.token.variable': {
    color: '#9cdcfe',
  },
  '.token.constant': {
    color: '#569cd6',
  },
  '.token.tag': {
    color: '#569cd6',
  },
  '.token.attr-name': {
    color: '#92c5f7',
  },
  '.token.selector': {
    color: '#d7ba7d',
  },
  '.token.important': {
    color: '#569cd6',
    fontWeight: 'bold',
  },
  '.token.entity': {
    color: '#ce9178',
  },
};
import { Project, WorkItemDTO } from '@/types';
import { projectsApi } from '@/lib/api';
import { EmptyState } from '@/components/ui/empty-state';
import { CodeBrowserTree } from './CodeBrowserTree';
import { useToast } from '@/components/Toast';
import { extractErrorMessage } from '@/lib/errorUtils';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  GitBranchIcon,
  CopyIcon,
  ExternalLinkIcon,
  ChevronRightIcon,
} from 'lucide-react';

export interface CodeTabProps {
  project: Project;
}

/**
 * Breadcrumb component for file path navigation
 */
function Breadcrumb({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const parts = path.split('/').filter(Boolean);
  const breadcrumbs = parts.map((part, index) => ({
    name: part,
    path: parts.slice(0, index + 1).join('/'),
  }));

  return (
    <nav className="flex items-center space-x-1 text-sm" aria-label="Breadcrumb">
      <button
        onClick={() => onNavigate('')}
        className="text-gray-500 hover:text-gray-700"
        type="button"
      >
        Root
      </button>
      {breadcrumbs.map((crumb, index) => (
        <div key={crumb.path} className="flex items-center space-x-1">
          <ChevronRightIcon className="h-4 w-4 text-gray-400" />
          {index === breadcrumbs.length - 1 ? (
            <span className="font-medium text-gray-900">{crumb.name}</span>
          ) : (
            <button
              onClick={() => onNavigate(crumb.path)}
              className="text-gray-500 hover:text-gray-700"
              type="button"
            >
              {crumb.name}
            </button>
          )}
        </div>
      ))}
    </nav>
  );
}

/**
 * Get file extension to determine language for syntax highlighting
 */
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    sh: 'bash',
    bash: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    sql: 'sql',
    md: 'markdown',
    dockerfile: 'dockerfile',
    vue: 'vue',
    svelte: 'svelte',
  };
  return languageMap[ext] || 'text';
}

export function CodeTab({ project }: CodeTabProps) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  // State for file operations
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [manualWorkItem, setManualWorkItem] = useState<WorkItemDTO | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [editFilePath, setEditFilePath] = useState('');
  const [editFileContent, setEditFileContent] = useState('');
  const [showPRModal, setShowPRModal] = useState(false);
  const [filter, setFilter] = useState('');
  const [isEditingMode, setIsEditingMode] = useState(false);

  // Determine which files to fetch (worktree if editing, main repo otherwise)
  const filesQueryKey =
    isEditingMode && manualWorkItem
      ? ['workitem-files', project.id, manualWorkItem.id]
      : ['project-files', project.id];

  const filesQueryFn =
    isEditingMode && manualWorkItem
      ? () =>
          projectsApi.getWorkItemFiles(project.id, manualWorkItem.id).then((res) => res.data.data)
      : () => projectsApi.getFiles(project.id).then((res) => res.data.data);

  // Fetch project files (from worktree if editing, main repo otherwise)
  const { data: filesData, isLoading: isFilesLoading } = useQuery({
    queryKey: filesQueryKey,
    queryFn: filesQueryFn,
    enabled: !isEditingMode || !!manualWorkItem,
  });

  // Fetch file content (from worktree if editing, main repo otherwise)
  const fileContentQueryKey =
    isEditingMode && manualWorkItem && selectedFile
      ? ['workitem-file-content', project.id, manualWorkItem.id, selectedFile]
      : ['file-content', project.id, selectedFile];

  const fileContentQueryFn =
    isEditingMode && manualWorkItem && selectedFile
      ? () =>
          projectsApi
            .getWorkItemFileContent(project.id, manualWorkItem.id, selectedFile)
            .then((res) => res.data.data)
      : selectedFile
        ? () => projectsApi.getFileContent(project.id, selectedFile).then((res) => res.data.data)
        : async () => null;

  const { data: fileContentResponse, isLoading: isContentLoading } = useQuery({
    queryKey: fileContentQueryKey,
    queryFn: fileContentQueryFn,
    enabled: !!selectedFile && (!isEditingMode || !!manualWorkItem),
  });

  const fileContentData = fileContentResponse?.content;
  const isBinary = fileContentResponse?.isBinary || false;
  const fileSize = fileContentResponse?.size;

  // Get or create manual WorkItem (lazy - only when needed)
  const getOrCreateManualWorkItemMutation = useMutation({
    mutationFn: async (title?: string) => {
      const response = await projectsApi.getOrCreateManualWorkItem(project.id, title);
      return response.data;
    },
    onSuccess: (workItem) => {
      setManualWorkItem(workItem);
      setIsEditingMode(true);
      success('WorkItem initialized for manual editing');
      // Refetch files from worktree
      queryClient.invalidateQueries({ queryKey: ['workitem-files', project.id, workItem.id] });
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to initialize WorkItem');
      showError(errorMessage);
    },
  });

  // Lazy initialization: only create WorkItem on first manual operation
  const ensureWorkItem = async () => {
    if (manualWorkItem) {
      return manualWorkItem;
    }
    if (!getOrCreateManualWorkItemMutation.isPending) {
      const workItem = await getOrCreateManualWorkItemMutation.mutateAsync('Manual edit session');
      return workItem;
    }
    return null;
  };

  // Create file mutation (auto-commits)
  const createFileMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const workItem = await ensureWorkItem();
      if (!workItem) {
        throw new Error('WorkItem not initialized');
      }
      const response = await projectsApi.createFile(project.id, workItem.id, path, content);
      return response.data;
    },
    onSuccess: (data, _variables, _context) => {
      setShowAddModal(false);
      setNewFilePath('');
      setNewFileContent('');
      success(`File created and committed: ${data.commitSha?.substring(0, 7)}`);
      // Refresh files list from worktree
      const workItemId = manualWorkItem?.id;
      if (workItemId) {
        queryClient.invalidateQueries({ queryKey: ['workitem-files', project.id, workItemId] });
      }
      // Select the newly created file
      if (data.path) {
        setSelectedFile(data.path);
      }
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to create file');
      showError(errorMessage);
    },
  });

  // Update file mutation (auto-commits)
  const updateFileMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const workItem = await ensureWorkItem();
      if (!workItem) {
        throw new Error('WorkItem not initialized');
      }
      const response = await projectsApi.updateFile(project.id, workItem.id, path, content);
      return response.data;
    },
    onSuccess: (data) => {
      setShowEditModal(false);
      success(`File updated and committed: ${data.commitSha?.substring(0, 7)}`);
      // Refresh files list and content from worktree
      const workItemId = manualWorkItem?.id;
      if (workItemId) {
        queryClient.invalidateQueries({ queryKey: ['workitem-files', project.id, workItemId] });
        queryClient.invalidateQueries({
          queryKey: ['workitem-file-content', project.id, workItemId, selectedFile],
        });
      }
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to update file');
      showError(errorMessage);
    },
  });

  // Delete file mutation (auto-commits)
  const deleteFileMutation = useMutation({
    mutationFn: async (path: string) => {
      const workItem = await ensureWorkItem();
      if (!workItem) {
        throw new Error('WorkItem not initialized');
      }
      const response = await projectsApi.deleteFile(project.id, workItem.id, path);
      return response.data;
    },
    onSuccess: (data) => {
      setShowDeleteConfirm(false);
      setFileToDelete(null);
      setSelectedFile(null);
      success(`File deleted and committed: ${data.commitSha?.substring(0, 7)}`);
      // Refresh files list from worktree
      const workItemId = manualWorkItem?.id;
      if (workItemId) {
        queryClient.invalidateQueries({ queryKey: ['workitem-files', project.id, workItemId] });
      }
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to delete file');
      showError(errorMessage);
    },
  });

  // Create PR mutation
  const createPRMutation = useMutation({
    mutationFn: async () => {
      if (!manualWorkItem) {
        throw new Error('WorkItem not initialized');
      }
      const response = await projectsApi.createPRFromWorkItem(project.id, manualWorkItem.id);
      return response.data;
    },
    onSuccess: () => {
      setShowPRModal(false);
      success('Pull Request created successfully');
      // Invalidate workitem and pull-requests queries
      queryClient.invalidateQueries({ queryKey: ['workitem', manualWorkItem?.id] });
      queryClient.invalidateQueries({ queryKey: ['pull-requests'] });
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to create PR');
      showError(errorMessage);
    },
  });

  // Handle file selection
  const handleFileSelect = (filepath: string) => {
    setSelectedFile(filepath);
  };

  // Handle add file
  const handleAddFile = async () => {
    if (!newFilePath.trim()) {
      showError('File path is required');
      return;
    }
    createFileMutation.mutate({ path: newFilePath, content: newFileContent });
  };

  // Handle edit file
  const handleEditFile = async () => {
    if (!selectedFile) {
      showError('No file selected');
      return;
    }
    updateFileMutation.mutate({ path: selectedFile, content: editFileContent });
  };

  // Handle delete file
  const handleDeleteFile = async () => {
    if (!fileToDelete) {
      return;
    }
    deleteFileMutation.mutate(fileToDelete);
  };

  // Handle create PR
  const handleCreatePR = () => {
    createPRMutation.mutate();
  };

  // Open edit modal with current file content
  const openEditModal = () => {
    if (!selectedFile || isBinary) {
      return;
    }
    setEditFilePath(selectedFile);
    setEditFileContent(fileContentData || '');
    setShowEditModal(true);
  };

  // Copy file content to clipboard
  const handleCopy = async () => {
    if (!fileContentData) return;
    try {
      await navigator.clipboard.writeText(fileContentData);
      success('Copied to clipboard');
    } catch {
      showError('Failed to copy to clipboard');
    }
  };

  // View raw file (opens in new tab with blob URL)
  const handleViewRaw = () => {
    if (!selectedFile || !fileContentData) return;
    const blob = new Blob([fileContentData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Clean up URL after a delay
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // Navigate breadcrumb
  const handleBreadcrumbNavigate = (_path: string) => {
    // For now, just clear selection - could implement directory navigation later
    setSelectedFile(null);
  };

  const files = filesData || [];
  const language = selectedFile ? getLanguageFromPath(selectedFile) : 'text';

  if (isFilesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <p className="text-sm text-gray-500">Loading repository files...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold text-gray-900">Code</h2>
          <span className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700">
            Branch: <span className="font-medium">{project.defaultBranch}</span>
          </span>
          {manualWorkItem && (
            <span className="flex items-center gap-1 rounded-md bg-blue-100 px-3 py-1 text-sm text-blue-700">
              <GitBranchIcon className="h-4 w-4" />
              <span className="font-medium">Editing in: {manualWorkItem.headBranch}</span>
            </span>
          )}
        </div>
        <div className="flex space-x-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter files..."
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={async () => {
              await ensureWorkItem();
              setShowAddModal(true);
            }}
            className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            disabled={getOrCreateManualWorkItemMutation.isPending}
          >
            <PlusIcon className="h-4 w-4" />
            Add file
          </button>
          {manualWorkItem && (
            <button
              onClick={() => setShowPRModal(true)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Finish & Create PR
            </button>
          )}
        </div>
      </div>

      {files.length === 0 ? (
        <EmptyState
          title="Repository is empty"
          description="This repository doesn't contain any files yet."
        />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* File Tree - Constrained width, responsive */}
          <div className="w-full rounded-lg border bg-white p-4 shadow-sm lg:w-80 lg:max-w-xs lg:flex-shrink-0">
            <h3 className="mb-4 font-medium text-gray-900">Repository Browser</h3>
            <div className="max-h-[600px] overflow-y-auto">
              <CodeBrowserTree
                files={files}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                filter={filter}
              />
            </div>
          </div>

          {/* File Content Viewer - Takes remaining space */}
          <div className="min-w-0 flex-1 rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                {selectedFile ? (
                  <>
                    <Breadcrumb path={selectedFile} onNavigate={handleBreadcrumbNavigate} />
                    <h3 className="mt-1 truncate font-medium text-gray-900">{selectedFile}</h3>
                  </>
                ) : (
                  <h3 className="font-medium text-gray-900">Select a file to view</h3>
                )}
              </div>
              {selectedFile && (
                <div className="ml-4 flex space-x-2">
                  {!isBinary && fileContentData && (
                    <>
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        title="Copy file content"
                      >
                        <CopyIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={handleViewRaw}
                        className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        title="View raw file"
                      >
                        <ExternalLinkIcon className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {manualWorkItem && !isBinary && (
                    <>
                      <button
                        onClick={openEditModal}
                        className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <EditIcon className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setFileToDelete(selectedFile);
                          setShowDeleteConfirm(true);
                        }}
                        className="flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                        Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="max-h-[600px] overflow-y-auto rounded-lg">
              {isContentLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
                    <p className="text-sm text-gray-500">Loading file content...</p>
                  </div>
                </div>
              ) : selectedFile && fileContentData !== undefined ? (
                isBinary ? (
                  <div className="flex flex-col items-center justify-center rounded-lg bg-gray-50 py-12">
                    <p className="mb-2 text-sm font-medium text-gray-900">Binary file</p>
                    <p className="text-sm text-gray-500">
                      {fileSize
                        ? `Size: ${(fileSize / 1024).toFixed(2)} KB`
                        : 'Cannot display binary file'}
                    </p>
                  </div>
                ) : fileContentData === '' ? (
                  <div className="flex items-center justify-center rounded-lg bg-gray-50 py-12">
                    <p className="text-sm text-gray-500">File is empty</p>
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded-lg">
                    <SyntaxHighlighter
                      language={language}
                      style={customPrismTheme}
                      customStyle={{
                        margin: 0,
                        padding: '1rem',
                        background: '#1e1e1e',
                        fontSize: '0.875rem',
                        lineHeight: '1.6',
                        borderRadius: '0.5rem',
                      }}
                      wrapLines={true}
                      wrapLongLines={true}
                      showLineNumbers={true}
                      lineNumberStyle={{
                        minWidth: '3.5em',
                        paddingRight: '1em',
                        color: '#6e7681',
                        userSelect: 'none',
                        borderRight: '1px solid #3e3e3e',
                        marginRight: '1em',
                        textAlign: 'right',
                      }}
                      codeTagProps={{
                        style: {
                          color: '#e0e0e0',
                          fontFamily:
                            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                        },
                      }}
                    >
                      {fileContentData}
                    </SyntaxHighlighter>
                  </div>
                )
              ) : (
                <div className="flex items-center justify-center rounded-lg bg-gray-50 py-12">
                  <p className="text-sm text-gray-500">
                    Select a file from the tree to view its content
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add File Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Add New File</h3>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">File Path</label>
              <input
                type="text"
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                placeholder="src/example.ts"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">Content</label>
              <textarea
                value={newFileContent}
                onChange={(e) => setNewFileContent(e.target.value)}
                placeholder="// Enter file content..."
                rows={10}
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddFile}
                disabled={createFileMutation.isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
              >
                {createFileMutation.isPending ? 'Creating...' : 'Create File'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit File Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-3xl rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Edit File: {editFilePath}</h3>
            <div className="mb-4">
              <textarea
                value={editFileContent}
                onChange={(e) => setEditFileContent(e.target.value)}
                rows={20}
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowEditModal(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditFile}
                disabled={updateFileMutation.isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
              >
                {updateFileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Delete File</h3>
            <p className="mb-6 text-sm text-gray-700">
              Are you sure you want to delete <span className="font-medium">{fileToDelete}</span>?
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteFile}
                disabled={deleteFileMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-red-400"
              >
                {deleteFileMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create PR Modal */}
      {showPRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Finish & Create Pull Request
            </h3>
            <p className="mb-6 text-sm text-gray-700">
              Create a Pull Request from branch{' '}
              <span className="font-medium">{manualWorkItem?.headBranch}</span> to{' '}
              <span className="font-medium">{project.defaultBranch}</span>?
              <br />
              <span className="mt-2 block text-xs text-gray-500">
                Any uncommitted changes will be committed automatically.
              </span>
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowPRModal(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePR}
                disabled={createPRMutation.isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
              >
                {createPRMutation.isPending ? 'Creating...' : 'Create PR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
