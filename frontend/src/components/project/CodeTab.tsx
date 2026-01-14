/**
 * Code Tab Component
 * Displays source files and repository contents
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Project, RepoFile } from '@/types';
import { projectsApi } from '@/lib/api';
import { EmptyState } from '@/components/ui/empty-state';

export interface CodeTabProps {
  project: Project;
}

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  size?: number;
}

function buildFileTree(files: RepoFile[]): FileTreeNode[] {
  const tree: FileTreeNode[] = [];
  const map = new Map<string, FileTreeNode>();

  // Sort files by path to ensure proper tree building
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.split('/');
    let currentLevel = tree;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLastPart = i === parts.length - 1;

      let node = map.get(currentPath);

      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isLastPart ? file.type : 'directory',
          size: file.size,
        };

        if (node.type === 'directory') {
          node.children = [];
        }

        map.set(currentPath, node);
        currentLevel.push(node);
      }

      if (!isLastPart && node.children) {
        currentLevel = node.children;
      }
    }
  }

  return tree;
}

function FileTreeItem({ node, level = 0, onFileClick }: { node: FileTreeNode; level?: number; onFileClick: (file: RepoFile) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = () => {
    if (node.type === 'directory') {
      setIsExpanded(!isExpanded);
    } else {
      onFileClick({
        name: node.name,
        path: node.path,
        type: node.type,
        size: node.size,
      });
    }
  };

  const getIcon = () => {
    if (node.type === 'directory') {
      return isExpanded ? (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      );
    }
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  };

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-100 ${level > 0 ? 'ml-4' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        <span className="text-gray-500">{getIcon()}</span>
        <span className={`text-sm ${node.type === 'directory' ? 'font-medium' : ''}`}>{node.name}</span>
        {node.size !== undefined && <span className="text-xs text-gray-400">{formatFileSize(node.size)}</span>}
      </div>
      {node.type === 'directory' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem key={child.path} node={child} level={level + 1} onFileClick={onFileClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CodeTab({ project }: CodeTabProps) {
  const [selectedFile, setSelectedFile] = useState<RepoFile | null>(null);

  const { data: filesData, isLoading, error } = useQuery({
    queryKey: ['project-files', project.id],
    queryFn: () => projectsApi.getFiles(project.id).then((res) => res.data.data),
  });

  const { data: fileContentData, isLoading: isContentLoading } = useQuery({
    queryKey: ['file-content', project.id, selectedFile?.path],
    queryFn: () =>
      projectsApi.getFileContent(project.id, selectedFile!.path).then((res) => res.data.data.content),
    enabled: !!selectedFile,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mb-2 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 mx-auto" />
          <p className="text-sm text-gray-500">Loading repository files...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load repository"
        description="There was an error loading the repository files. Please try again."
      />
    );
  }

  const files = filesData || [];
  const fileTree = buildFileTree(files);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold text-gray-900">Code</h2>
          <span className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700">
            Branch: <span className="font-medium">{project.defaultBranch}</span>
          </span>
        </div>
        <div className="flex space-x-2">
          <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Add file
          </button>
          <button className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
            Clone
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <EmptyState
          title="Repository is empty"
          description="This repository doesn't contain any files yet."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* File Tree */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="mb-4 font-medium text-gray-900">Repository Browser</h3>
            <div className="max-h-[600px] overflow-y-auto">
              {fileTree.map((node) => (
                <FileTreeItem key={node.path} node={node} onFileClick={setSelectedFile} />
              ))}
            </div>
          </div>

          {/* File Content Viewer */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="mb-4 font-medium text-gray-900">
              {selectedFile ? selectedFile.path : 'Select a file to view'}
            </h3>
            <div className="max-h-[600px] overflow-y-auto rounded-lg bg-gray-50 p-4">
              {isContentLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="mb-2 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 mx-auto" />
                    <p className="text-sm text-gray-500">Loading file content...</p>
                  </div>
                </div>
              ) : selectedFile && fileContentData ? (
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                  {fileContentData}
                </pre>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-gray-500">Select a file from the tree to view its content</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
