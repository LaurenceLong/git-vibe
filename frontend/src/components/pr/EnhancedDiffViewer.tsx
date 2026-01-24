/**
 * EnhancedDiffViewer Component
 *
 * Displays a git diff with inline comment buttons and thread indicators
 * Supports commenting on individual lines or ranges
 */

import { useMemo } from 'react';
import { Plus, MessageSquare } from 'lucide-react';
import { parseDiff } from '@/utils/diffParser';

export interface ThreadAnchor {
  filepath: string;
  startLine: number;
  endLine: number;
  side: 'base' | 'head';
  threadId?: string;
}

export interface EnhancedDiffViewerProps {
  diff: string;
  filepath: string | null;
  threads?: ThreadAnchor[];
  onAddComment?: (lineNumber: number, side: 'base' | 'head') => void;
  showInlineButtons?: boolean;
}

interface DiffLineWithNumbers {
  type: 'header' | 'add' | 'remove' | 'context' | 'hunk';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
  filepath?: string;
}

export function EnhancedDiffViewer({
  diff,
  filepath,
  threads = [],
  onAddComment,
  showInlineButtons = true,
}: EnhancedDiffViewerProps) {
  // Parse diff for the selected file
  const diffLines = useMemo(() => {
    if (!diff || !filepath) return [];

    const files = parseDiff(diff);
    const file = files.find((f) => f.filepath === filepath);
    if (!file) return [];

    const lines: DiffLineWithNumbers[] = [];
    let oldLineNum = 0;
    let newLineNum = 0;

    // Add file header
    lines.push({
      type: 'header',
      content: `diff --git a/${filepath} b/${filepath}`,
      filepath: filepath,
    });

    for (const hunk of file.hunks) {
      // Reset line numbers for hunk
      oldLineNum = hunk.oldStart;
      newLineNum = hunk.newStart;

      // Add hunk header
      lines.push({
        type: 'hunk',
        content: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
        oldLineNumber: hunk.oldStart,
        newLineNumber: hunk.newStart,
      });

      for (const line of hunk.lines) {
        if (line.type === 'add') {
          lines.push({
            type: 'add',
            content: '+' + line.content,
            newLineNumber: newLineNum++,
            filepath,
          });
        } else if (line.type === 'remove') {
          lines.push({
            type: 'remove',
            content: '-' + line.content,
            oldLineNumber: oldLineNum++,
            filepath,
          });
        } else {
          lines.push({
            type: 'context',
            content: ' ' + line.content,
            oldLineNumber: oldLineNum++,
            newLineNumber: newLineNum++,
            filepath,
          });
        }
      }
    }

    return lines;
  }, [diff, filepath]);

  // Check if a line has a thread
  const hasThread = (lineNumber: number, side: 'base' | 'head'): boolean => {
    return threads.some(
      (thread) =>
        thread.filepath === filepath &&
        thread.side === side &&
        lineNumber >= thread.startLine &&
        lineNumber <= thread.endLine
    );
  };

  const getLineClass = (line: DiffLineWithNumbers): string => {
    const baseClass = 'group relative flex items-stretch';
    if (line.type === 'add') {
      return `${baseClass} bg-green-50 hover:bg-green-100`;
    } else if (line.type === 'remove') {
      return `${baseClass} bg-red-50 hover:bg-red-100`;
    } else if (line.type === 'hunk') {
      return `${baseClass} bg-blue-50 font-medium`;
    } else if (line.type === 'header') {
      return `${baseClass} bg-gray-100 text-gray-600`;
    }
    return `${baseClass} hover:bg-gray-50`;
  };

  const getContentClass = (line: DiffLineWithNumbers): string => {
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
    return `${baseClass} text-gray-800`;
  };

  const canComment = (line: DiffLineWithNumbers): boolean => {
    return (
      showInlineButtons &&
      !!onAddComment &&
      (line.type === 'add' || line.type === 'remove' || line.type === 'context') &&
      !!filepath
    );
  };

  if (!diff || !filepath) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <p className="text-sm text-gray-500">Select a file to view its diff</p>
      </div>
    );
  }

  if (diffLines.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <p className="text-sm text-gray-500">No changes in this file</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {diffLines.map((line, index) => {
              const threadOnNewLine =
                line.newLineNumber !== undefined && hasThread(line.newLineNumber, 'head');
              const threadOnOldLine =
                line.oldLineNumber !== undefined && hasThread(line.oldLineNumber, 'base');

              return (
                <tr key={index} className={getLineClass(line)}>
                  {/* Old line number + comment button */}
                  <td className="relative w-12 select-none border-r border-gray-200 bg-gray-50 px-2 py-0.5 text-right text-xs text-gray-400">
                    {line.oldLineNumber !== undefined ? (
                      <>
                        <span className="group-hover:hidden">{line.oldLineNumber}</span>
                        {showInlineButtons && onAddComment && canComment(line) && (
                          <button
                            onClick={() => onAddComment(line.oldLineNumber!, 'base')}
                            className="absolute left-0 top-0 hidden h-full w-8 items-center justify-center bg-blue-500 text-white transition-opacity hover:bg-blue-600 group-hover:flex"
                            title="Add comment on this line"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                        {threadOnOldLine && (
                          <span className="absolute left-0 top-0 flex h-full w-8 items-center justify-center bg-yellow-100 text-yellow-800">
                            <MessageSquare className="h-3 w-3" />
                          </span>
                        )}
                      </>
                    ) : (
                      ''
                    )}
                  </td>
                  {/* New line number + comment button */}
                  <td className="relative w-12 select-none border-r border-gray-200 bg-gray-50 px-2 py-0.5 text-right text-xs text-gray-400">
                    {line.newLineNumber !== undefined ? (
                      <>
                        <span className="group-hover:hidden">{line.newLineNumber}</span>
                        {showInlineButtons && onAddComment && canComment(line) && (
                          <button
                            onClick={() => onAddComment(line.newLineNumber!, 'head')}
                            className="absolute left-0 top-0 hidden h-full w-8 items-center justify-center bg-blue-500 text-white transition-opacity hover:bg-blue-600 group-hover:flex"
                            title="Add comment on this line"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                        {threadOnNewLine && (
                          <span className="absolute left-0 top-0 flex h-full w-8 items-center justify-center bg-yellow-100 text-yellow-800">
                            <MessageSquare className="h-3 w-3" />
                          </span>
                        )}
                      </>
                    ) : (
                      ''
                    )}
                  </td>
                  {/* Content */}
                  <td className={getContentClass(line)}>{line.content}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
