import React from 'react';

/**
 * Props for the DiffViewer component
 */
export interface DiffViewerProps {
  /** The diff content as a string */
  diff: string;
  /** Optional array of line numbers that have review threads */
  threadLines?: number[];
}

/**
 * Represents a parsed diff line
 */
interface DiffLine {
  /** Line number in the original file */
  originalLine?: number;
  /** Line number in the new file */
  newLine?: number;
  /** The type of change */
  type: 'header' | 'add' | 'remove' | 'context' | 'hunk';
  /** The content of the line */
  content: string;
  /** Whether this line has a thread */
  hasThread?: boolean;
}

/**
 * DiffViewer component
 * Displays a git diff with syntax highlighting and line numbers
 *
 * Features:
 * - Color-coded diff lines (green for additions, red for deletions)
 * - Line numbers for both original and new files
 * - Thread anchors highlighting
 * - Support for empty diff
 */
export function DiffViewer({ diff, threadLines = [] }: DiffViewerProps) {
  // Parse the diff into structured lines
  const parseDiff = (diffContent: string): DiffLine[] => {
    if (!diffContent || diffContent.trim() === '') {
      return [];
    }

    const lines = diffContent.split('\n');
    const parsedLines: DiffLine[] = [];
    let originalLineNum = 0;
    let newLineNum = 0;

    for (const line of lines) {
      const diffLine: DiffLine = {
        content: line,
        type: 'context',
      };

      // Check if line has a thread
      const lineMatch = line.match(/^@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (lineMatch) {
        // Hunk header
        originalLineNum = parseInt(lineMatch[1], 10);
        newLineNum = parseInt(lineMatch[2], 10);
        diffLine.type = 'hunk';
        diffLine.originalLine = originalLineNum;
        diffLine.newLine = newLineNum;
      } else if (
        line.startsWith('diff --git') ||
        line.startsWith('index') ||
        line.startsWith('---') ||
        line.startsWith('+++')
      ) {
        // Diff header
        diffLine.type = 'header';
      } else if (line.startsWith('+')) {
        // Added line
        diffLine.type = 'add';
        diffLine.newLine = newLineNum;
        newLineNum++;
        diffLine.hasThread = threadLines.includes(newLineNum);
      } else if (line.startsWith('-')) {
        // Removed line
        diffLine.type = 'remove';
        diffLine.originalLine = originalLineNum;
        originalLineNum++;
      } else if (line.startsWith(' ')) {
        // Context line
        diffLine.type = 'context';
        diffLine.originalLine = originalLineNum;
        diffLine.newLine = newLineNum;
        originalLineNum++;
        newLineNum++;
        diffLine.hasThread = threadLines.includes(newLineNum);
      } else if (line.startsWith('\\')) {
        // Diff metadata (e.g., "No newline at end of file")
        diffLine.type = 'context';
      }

      parsedLines.push(diffLine);
    }

    return parsedLines;
  };

  const parsedLines = parseDiff(diff);

  // Get line style based on type
  const getLineClass = (line: DiffLine): string => {
    const baseClass = 'flex items-stretch';

    if (line.type === 'add') {
      return `${baseClass} bg-green-50`;
    } else if (line.type === 'remove') {
      return `${baseClass} bg-red-50`;
    } else if (line.type === 'hunk') {
      return `${baseClass} bg-blue-50 font-medium`;
    } else if (line.type === 'header') {
      return `${baseClass} bg-gray-100 text-gray-600`;
    }

    return baseClass;
  };

  // Get content style based on type
  const getContentClass = (line: DiffLine): string => {
    const baseClass = 'flex-1 px-2 py-0.5 text-sm font-mono whitespace-pre';

    if (line.type === 'add') {
      return `${baseClass} text-green-800`;
    } else if (line.type === 'remove') {
      return `${baseClass} text-red-800`;
    } else if (line.type === 'hunk') {
      return `${baseClass} text-blue-800`;
    } else if (line.type === 'header') {
      return `${baseClass} text-gray-600`;
    }

    return `${baseClass} text-gray-800 ${line.hasThread ? 'bg-yellow-100' : ''}`;
  };

  // Handle empty diff
  if (!diff || diff.trim() === '') {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No changes to display</h3>
        <p className="mt-1 text-sm text-gray-500">
          There are no differences between the base and current commits.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {parsedLines.map((line, index) => (
              <tr key={index} className={getLineClass(line)}>
                {/* Original line number */}
                <td className="w-12 select-none border-r border-gray-200 px-2 py-0.5 text-right text-xs text-gray-400">
                  {line.originalLine !== undefined ? line.originalLine : ''}
                </td>
                {/* New line number */}
                <td className="w-12 select-none border-r border-gray-200 px-2 py-0.5 text-right text-xs text-gray-400">
                  {line.newLine !== undefined ? line.newLine : ''}
                </td>
                {/* Content */}
                <td className={getContentClass(line)}>
                  {line.content}
                  {line.hasThread && (
                    <span className="ml-2 inline-flex items-center rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                      💬
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
