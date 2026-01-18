/**
 * LogPane Component
 *
 * Displays a single log pane with header and content
 *
 * Features:
 * - Auto-scroll to bottom when content changes
 * - Copy button for log content
 * - Loading and streaming states
 * - Responsive layout
 */

import { useEffect, useRef, useMemo } from 'react';
import { Copy, Terminal } from 'lucide-react';
import Convert from 'ansi-to-html';

export interface LogPaneProps {
  title: string;
  content: string;
  accentColor: string;
  onCopy: () => void;
  showCopyFeedback: boolean;
  isStreaming?: boolean;
  isLoading?: boolean;
}

/**
 * LogPane component - displays a single log pane with header and content
 */
export function LogPane({
  title,
  content,
  accentColor,
  onCopy,
  showCopyFeedback,
  isStreaming = false,
  isLoading = false,
}: LogPaneProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Initialize ANSI to HTML converter
  // Using options that work well for terminal-like displays
  const ansiConverter = useMemo(
    () =>
      new Convert({
        fg: '#fff',
        bg: '#000',
        newline: true,
        escapeXML: true,
        stream: false,
      }),
    []
  );

  // Convert ANSI escape codes to HTML
  const htmlContent = useMemo(() => {
    if (!content) return '';
    return ansiConverter.toHtml(content);
  }, [content, ansiConverter]);

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [content]);

  return (
    <div className="flex h-full flex-col rounded-lg border bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center space-x-2">
          <Terminal className={`h-4 w-4 ${accentColor}`} />
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        <button
          onClick={onCopy}
          className="flex items-center space-x-1 rounded-md px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          disabled={!content}
          title={content ? 'Copy to clipboard' : 'Nothing to copy'}
        >
          <Copy className="h-4 w-4" />
          <span>{showCopyFeedback ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-gray-900">
        {content ? (
          <pre
            className="whitespace-pre-wrap p-4 font-mono text-sm text-gray-100"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            {isLoading || isStreaming ? (
              <div className="flex flex-col items-center space-y-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-100" />
                <p className="text-sm text-gray-400">
                  {isStreaming ? 'Waiting for logs...' : 'Loading logs...'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No logs available</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
