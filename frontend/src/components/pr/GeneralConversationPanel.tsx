/**
 * GeneralConversationPanel Component
 *
 * Displays general comments and allows creating new ones
 * Shows all non-inline threads for the PR
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MessageSquare, CheckCircle, Circle } from 'lucide-react';
import type { WorkItemThread } from '@/hooks/useWorkItemThreads';
import { formatDateTime } from '@/lib/datetime';

export interface GeneralConversationPanelProps {
  threads: WorkItemThread[];
  onCreateComment: (data: {
    body: string;
    intent:
      | 'question'
      | 'bug'
      | 'refactor'
      | 'style'
      | 'security'
      | 'performance'
      | 'test'
      | 'docs'
      | 'other';
    authorName: string;
  }) => Promise<void>;
  onResolveThread: (threadId: string) => Promise<void>;
  onUnresolveThread: (threadId: string) => Promise<void>;
  currentUserName?: string;
  isSubmitting?: boolean;
}

const INTENT_OPTIONS: Array<{
  value: GeneralConversationPanelProps['threads'][0]['comments'] extends (infer U)[]
    ? U extends { intent: infer I }
      ? I
      : never
    : never;
  label: string;
}> = [
  { value: 'question', label: 'Question' },
  { value: 'bug', label: 'Bug' },
  { value: 'refactor', label: 'Refactor' },
  { value: 'style', label: 'Style' },
  { value: 'security', label: 'Security' },
  { value: 'performance', label: 'Performance' },
  { value: 'test', label: 'Test' },
  { value: 'docs', label: 'Documentation' },
  { value: 'other', label: 'Other' },
];

export function GeneralConversationPanel({
  threads,
  onCreateComment,
  onResolveThread,
  onUnresolveThread,
  currentUserName = 'User',
  isSubmitting = false,
}: GeneralConversationPanelProps) {
  const [showComposer, setShowComposer] = useState(false);
  const [body, setBody] = useState('');
  const [intent, setIntent] = useState<
    | 'question'
    | 'bug'
    | 'refactor'
    | 'style'
    | 'security'
    | 'performance'
    | 'test'
    | 'docs'
    | 'other'
  >('question');

  // Filter general comments (non-inline threads)
  const generalThreads = threads.filter((thread) => {
    try {
      const anchor = JSON.parse(thread.anchor);
      return anchor.type === 'general' || !anchor.filepath;
    } catch {
      return true; // Treat as general if anchor parsing fails
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    await onCreateComment({
      body: body.trim(),
      intent,
      authorName: currentUserName,
    });
    setBody('');
    setShowComposer(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Conversation</h3>
        {!showComposer && (
          <Button variant="primary" size="sm" onClick={() => setShowComposer(true)}>
            Add Comment
          </Button>
        )}
      </div>

      {showComposer && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <select
                value={intent}
                onChange={(e) =>
                  setIntent(
                    e.target.value as
                      | 'question'
                      | 'bug'
                      | 'refactor'
                      | 'style'
                      | 'security'
                      | 'performance'
                      | 'test'
                      | 'docs'
                      | 'other'
                  )
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {INTENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a general comment..."
              className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={4}
              required
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowComposer(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" loading={isSubmitting}>
                Comment
              </Button>
            </div>
          </form>
        </div>
      )}

      {generalThreads.length === 0 && !showComposer ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No general comments yet</h3>
          <p className="mt-1 text-sm text-gray-500">Start a conversation about this PR</p>
        </div>
      ) : (
        <div className="space-y-4">
          {generalThreads.map((thread) => (
            <div
              key={thread.id}
              className={`rounded-lg border bg-white p-4 shadow-sm ${
                thread.status === 'resolved' ? 'opacity-75' : ''
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {thread.status === 'resolved' ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-gray-400" />
                  )}
                  <span className="text-sm font-medium text-gray-900">
                    {thread.status === 'resolved' ? 'Resolved' : 'Open'}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    thread.status === 'resolved'
                      ? onUnresolveThread(thread.id)
                      : onResolveThread(thread.id)
                  }
                >
                  {thread.status === 'resolved' ? 'Unresolve' : 'Resolve'}
                </Button>
              </div>

              {thread.comments && thread.comments.length > 0 && (
                <div className="space-y-3">
                  {[...thread.comments]
                    .sort((a, b) => {
                      // Sort by createdAt ascending (oldest first) for chronological order
                      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                    })
                    .map((comment) => (
                      <div key={comment.id} className="rounded-md bg-gray-50 p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {comment.authorName}
                            </span>
                            <span className="text-xs text-gray-500">{comment.intent}</span>
                            <span className="text-xs text-gray-400">
                              {formatDateTime(comment.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className="whitespace-pre-wrap text-sm text-gray-700">
                          {comment.body}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
