/**
 * CodeBrowserTree Component
 *
 * GitHub-style file tree view for browsing repository files
 * Matches the structure and behavior of ChangedFilesTree.tsx
 */

import { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface CodeBrowserTreeProps {
  files: Array<{
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
  }>;
  selectedFile?: string | null;
  onFileSelect: (filepath: string) => void;
  filter?: string;
}

export interface RepoFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children: Map<string, TreeNode>;
  parent?: TreeNode;
  size?: number;
}

const FILE_ICON = (
  <svg
    aria-label="File"
    aria-hidden="true"
    height="16"
    viewBox="0 0 16 16"
    version="1.1"
    width="16"
    className="text-gray-500"
  >
    <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
  </svg>
);

const DIRECTORY_ICON = (
  <svg
    aria-label="Directory"
    aria-hidden="true"
    height="16"
    viewBox="0 0 16 16"
    version="1.1"
    width="16"
    className="text-blue-500"
  >
    <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
  </svg>
);

/**
 * Normalize path separators (handle both / and \)
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Build a tree structure from file paths
 */
function buildFileTree(files: RepoFile[]): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    type: 'directory',
    children: new Map(),
  };

  for (const file of files) {
    // Normalize path to use forward slashes (handle Windows backslashes)
    const normalizedPath = normalizePath(file.path);
    const parts = normalizedPath.split('/').filter(Boolean);

    // Skip empty paths
    if (parts.length === 0) continue;

    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      // Always use forward slashes for path construction
      const currentPath = current.path ? `${current.path}/${part}` : part;

      if (!current.children.has(part)) {
        const node: TreeNode = {
          name: part,
          path: currentPath,
          type: isLast ? file.type : 'directory',
          children: new Map(),
          parent: current,
        };
        if (isLast && file.size !== undefined) {
          node.size = file.size;
        }
        current.children.set(part, node);
      } else {
        // If node already exists and this is the last part, ensure type is correct
        const existingNode = current.children.get(part)!;
        if (isLast && file.type === 'file' && existingNode.type === 'directory') {
          // This shouldn't happen, but handle it gracefully
          existingNode.type = 'file';
        }
        if (isLast && file.size !== undefined) {
          existingNode.size = file.size;
        }
      }

      current = current.children.get(part)!;
    }
  }

  return root;
}

/**
 * Check if a node matches the filter
 */
function matchesFilter(node: TreeNode, filter: string): boolean {
  if (!filter) return true;
  const lowerFilter = filter.toLowerCase();
  const normalizedPath = normalizePath(node.path);
  return normalizedPath.toLowerCase().includes(lowerFilter);
}

/**
 * Check if any descendant matches the filter
 */
function hasMatchingDescendant(node: TreeNode, filter: string): boolean {
  if (!filter) return true;
  if (matchesFilter(node, filter)) return true;
  for (const child of node.children.values()) {
    if (hasMatchingDescendant(child, filter)) return true;
  }
  return false;
}

interface TreeNodeItemProps {
  node: TreeNode;
  level: number;
  selectedFile?: string | null;
  onFileSelect: (filepath: string) => void;
  filter: string;
  expandedNodes: Set<string>;
  onToggleExpand: (path: string) => void;
}

function TreeNodeItem({
  node,
  level,
  selectedFile,
  onFileSelect,
  filter,
  expandedNodes,
  onToggleExpand,
}: TreeNodeItemProps) {
  const normalizedSelectedFile = selectedFile ? normalizePath(selectedFile) : null;
  const isExpanded = expandedNodes.has(node.path);
  const isSelected = normalizedSelectedFile === node.path;
  const hasChildren = node.children.size > 0;
  const shouldShow = !filter || matchesFilter(node, filter) || hasMatchingDescendant(node, filter);
  const children = Array.from(node.children.values()).sort((a, b) => {
    // Directories first, then files, then alphabetically
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  if (!shouldShow) return null;

  const handleClick = () => {
    if (node.type === 'directory') {
      onToggleExpand(node.path);
    } else {
      // Normalize path before passing to parent (in case parent expects consistent format)
      onFileSelect(node.path);
    }
  };

  // Calculate indentation: each level adds 20px (16px for indent + 4px spacing)
  const indentWidth = level * 20;

  return (
    <li
      className="ActionList-item relative"
      role="treeitem"
      aria-level={level + 1}
      aria-expanded={node.type === 'directory' ? isExpanded : undefined}
      data-filterable-item-text={node.path}
      hidden={!shouldShow}
      style={{ '--ActionList-tree-depth': level + 1 } as React.CSSProperties}
    >
      {isSelected && <div className="absolute bottom-0 left-0 top-0 w-0.5 bg-blue-500" />}
      <button
        className={`ActionList-content flex w-full items-center gap-1.5 px-2 py-1 text-left transition-colors hover:bg-gray-50 ${
          isSelected ? 'bg-blue-50' : ''
        }`}
        style={{ paddingLeft: `${indentWidth + 8}px` }}
        onClick={handleClick}
        type="button"
        aria-label={
          node.type === 'directory' ? `Toggle ${node.name} directory` : `Select ${node.name} file`
        }
      >
        {node.type === 'directory' ? (
          <span className="-ml-1 flex w-4 flex-shrink-0 items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )}
          </span>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        <span className="flex-shrink-0">
          {node.type === 'directory' ? DIRECTORY_ICON : FILE_ICON}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            isSelected ? 'font-medium text-blue-900' : 'text-gray-900'
          }`}
        >
          {node.name}
        </span>
        {node.size !== undefined && (
          <span className="ml-auto flex-shrink-0 whitespace-nowrap text-xs text-gray-500">
            {formatFileSize(node.size)}
          </span>
        )}
      </button>
      {node.type === 'directory' && isExpanded && hasChildren && (
        <ul
          className="ActionList ActionList--subGroup ml-0"
          role="group"
          aria-label={`Contents of ${node.name}`}
          style={{ marginLeft: 0 }}
        >
          {children
            .filter(
              (child) =>
                !filter || matchesFilter(child, filter) || hasMatchingDescendant(child, filter)
            )
            .map((child) => (
              <TreeNodeItem
                key={child.path}
                node={child}
                level={level + 1}
                selectedFile={selectedFile}
                onFileSelect={onFileSelect}
                filter={filter}
                expandedNodes={expandedNodes}
                onToggleExpand={onToggleExpand}
              />
            ))}
        </ul>
      )}
    </li>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * CodeBrowserTree component
 */
export function CodeBrowserTree({
  files,
  selectedFile,
  onFileSelect,
  filter = '',
}: CodeBrowserTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildFileTree(files), [files]);

  // Initialize: expand root-level directories by default (only on mount)
  useEffect(() => {
    const rootChildren = Array.from(tree.children.values());
    const rootDirs = rootChildren.filter((child) => child.type === 'directory');
    if (rootDirs.length > 0) {
      setExpandedNodes((prev) => {
        const newSet = new Set(prev);
        rootDirs.forEach((dir) => newSet.add(dir.path));
        return newSet;
      });
    }
  }, [tree]);

  // Auto-expand directories that contain selected file
  useEffect(() => {
    if (selectedFile) {
      const normalizedPath = normalizePath(selectedFile);
      const parts = normalizedPath.split('/').filter(Boolean);
      const paths: string[] = [];
      let currentPath = '';
      for (const part of parts.slice(0, -1)) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        paths.push(currentPath);
      }
      setExpandedNodes((prev) => {
        const newSet = new Set(prev);
        paths.forEach((path) => newSet.add(path));
        return newSet;
      });
    }
  }, [selectedFile]);

  const handleToggleExpand = (path: string) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const rootChildren = Array.from(tree.children.values()).sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  if (rootChildren.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500">
        {filter ? 'No files match the filter' : 'No files found'}
      </div>
    );
  }

  return (
    <nav aria-label="File Tree Navigation">
      <ul
        className="ActionList ActionList--tree"
        role="tree"
        aria-label="File Tree"
        style={{ paddingLeft: 0 }}
      >
        {rootChildren.map((child) => (
          <TreeNodeItem
            key={child.path}
            node={child}
            level={0}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
            filter={filter}
            expandedNodes={expandedNodes}
            onToggleExpand={handleToggleExpand}
          />
        ))}
      </ul>
    </nav>
  );
}
