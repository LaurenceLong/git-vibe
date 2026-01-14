/**
 * DiscussionTab Component
 *
 * Displays WorkItem description and comment thread
 *
 * Features:
 * - Display WorkItem description/body
 * - Show comment thread (can reuse existing review components)
 * - Allow adding comments
 * - Show timestamps for each comment
 * - Use empty state when no comments exist
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Clock } from 'lucide-react';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/Toast';

export interface DiscussionTabProps {
  workItemId: string;
}

/**
 * DiscussionTab component
 *
 * @param workItemId - The ID of WorkItem to display comments for
 */
export function DiscussionTab({ workItemId }: DiscussionTabProps) {
  const [newComment, setNewComment] = useState('');
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  // Fetch comments for this WorkItem
  // Note: This endpoint doesn't exist yet in the API, we'll use a placeholder
  const { data: comments, isLoading } = useQuery({
    queryKey: ['workitem-comments', workItemId],
    queryFn: async () => {
      // Placeholder: Return empty array for now
      // TODO: Implement actual API call when backend is ready
      return [];
    },
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (body: string) => {
      // Placeholder: No actual API call yet
      // TODO: Implement actual API call when backend is ready
      return { id: Date.now().toString(), body, createdAt: new Date() };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workitem-comments', workItemId] });
      setNewComment('');
      success('Comment added successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to add comment: ${err.message}`);
    },
  });

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    await addCommentMutation.mutateAsync(newComment);
  };

  return (
    <div className="space-y-6">
      {/* Comment Composer */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <form onSubmit={handleAddComment}>
          <label htmlFor="comment" className="mb-2 block text-sm font-medium text-gray-700">
            Add a comment
          </label>
          <Textarea
            id="comment"
            rows={3}
            placeholder="Leave a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            disabled={addCommentMutation.isPending}
          />
          <div className="mt-3 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={addCommentMutation.isPending}
              disabled={!newComment.trim()}
            >
              Comment
            </Button>
          </div>
        </form>
      </div>

      {/* Comments List */}
      {isLoading ? (
        <div className="py-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-600">Loading comments...</p>
        </div>
      ) : comments && comments.length > 0 ? (
        <div className="space-y-4">
          {comments.map((comment: any) => (
            <div key={comment.id} className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4 text-gray-500" />
                  <span className="font-medium text-gray-900">User</span>
                </div>
                <div className="flex items-center space-x-1 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  <span>{new Date(comment.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-gray-700">{comment.body}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={MessageSquare}
          title="No comments yet"
          description="Be the first to leave a comment on this WorkItem"
        />
      )}
    </div>
  );
}
