/**
 * ChangedFilesTree Component
 *
 * GitHub-style file tree view for changed files with expandable directories
 */

import { useState, useMemo } from 'react';
import { ChangedFile } from '@/utils/diffParser';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface ChangedFilesTreeProps {
  files: ChangedFile[];
  selectedFile?: string | null;
  onFileSelect: (filepath: string) => void;
  filter?: string;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  file?: ChangedFile;
  children: Map<string, TreeNode>;
  parent?: TreeNode;
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

const DIFF_ICONS = {
  added: (
    <svg
      title="added"
      aria-hidden="true"
      height="16"
      viewBox="0 0 16 16"
      version="1.1"
      width="16"
      className="text-green-600"
    >
      <path d="M2.75 1h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25V2.75C1 1.784 1.784 1 2.75 1Zm10.5 1.5H2.75a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM8 4a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 8 4Z" />
    </svg>
  ),
  modified: (
    <svg
      title="modified"
      aria-hidden="true"
      height="16"
      viewBox="0 0 16 16"
      version="1.1"
      width="16"
      className="text-yellow-600"
    >
      <path d="M13.25 1c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25V2.75C1 1.784 1.784 1 2.75 1ZM2.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z" />
    </svg>
  ),
  deleted: (
    <svg
      title="removed"
      aria-hidden="true"
      height="16"
      viewBox="0 0 16 16"
      version="1.1"
      width="16"
      className="text-red-600"
    >
      <path d="M13.25 1c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25V2.75C1 1.784 1.784 1 2.75 1ZM2.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25Zm8.5 6.25h-6.5a.75.75 0 0 1 0-1.5h6.5a.75.75 0 0 1 0 1.5Z" />
    </svg>
  ),
  renamed: (
    <svg
      title="renamed"
      aria-hidden="true"
      height="16"
      viewBox="0 0 16 16"
      version="1.1"
      width="16"
      className="text-blue-600"
    >
      <path d="M13.25 1c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 15H2.75A1.75 1.75 0 0 1 1 13.25V2.75C1 1.784 1.784 1 2.75 1ZM2.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25Zm9.03 6.03-3.25 3.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l1.97-1.97H4.75a.75.75 0 0 1 0-1.5h4.69L7.47 5.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018l3.25 3.25a.75.75 0 0 1 0 1.06Z" />
    </svg>
  ),
};

/**
 * Build a tree structure from file paths
 */
function buildFileTree(files: ChangedFile[]): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    type: 'directory',
    children: new Map(),
  };

  for (const file of files) {
    const parts = file.filepath.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = current.path ? `${current.path}/${part}` : part;

      if (!current.children.has(part)) {
        const node: TreeNode = {
          name: part,
          path: currentPath,
          type: isLast ? 'file' : 'directory',
          children: new Map(),
          parent: current,
        };
        if (isLast) {
          node.file = file;
        }
        current.children.set(part, node);
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
  return node.path.toLowerCase().includes(lowerFilter);
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
  const isExpanded = expandedNodes.has(node.path);
  const isSelected = selectedFile === node.path;
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
      onFileSelect(node.path);
    }
  };

  const diffIcon = node.file && DIFF_ICONS[node.file.status];

  const indentWidth = level * 16;

  return (
    <li
      className="ActionList-item relative"
      role="treeitem"
      aria-level={level + 1}
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
        {diffIcon && <span className="ml-auto flex-shrink-0">{diffIcon}</span>}
        {node.file && (
          <span className="ml-2 flex-shrink-0 whitespace-nowrap text-xs text-gray-500">
            <span className="text-green-600">+{node.file.additions}</span>
            <span className="ml-1 text-red-600">-{node.file.deletions}</span>
          </span>
        )}
      </button>
      {node.type === 'directory' && isExpanded && hasChildren && (
        <ul className="ActionList ActionList--subGroup ml-0" role="group">
          {children.map((child) => (
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

/**
 * ChangedFilesTree component
 */
export function ChangedFilesTree({
  files,
  selectedFile,
  onFileSelect,
  filter = '',
}: ChangedFilesTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildFileTree(files), [files]);

  // Auto-expand directories that contain selected file
  useMemo(() => {
    if (selectedFile) {
      const parts = selectedFile.split('/').filter(Boolean);
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
        {filter ? 'No files match the filter' : 'No files changed'}
      </div>
    );
  }

  return (
    <nav aria-label="File Tree Navigation">
      <ul className="ActionList ActionList--tree" role="tree" aria-label="File Tree">
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
