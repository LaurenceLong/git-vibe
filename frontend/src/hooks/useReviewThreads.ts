/**
 * useReviewThreads Hook
 *
 * Fetches all review threads for a pull request.
 * Creates new thread.
 * Adds comment to thread.
 * Resolves/unresolves thread.
 * Shows toast notifications on success/error.
 * Handles outdated threads (when head changes).
 *
 * @example
 * ```tsx
 * function ReviewThreadsComponent({ pullRequestId }: { pullRequestId: string }) {
 *   const { threads, isLoading, error, createThread, addComment, resolveThread, unresolveThread } =
 *     useReviewThreads(pullRequestId);
 *
 *   const handleCreateThread = async () => {
 *     await createThread({ file: 'src/app.ts', line: 10, comment: 'Fix this issue' });
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleCreateThread}>Create Thread</button>
 *       {threads?.map((thread) => (
 *         <div key={thread.id}>
 *           <p>{thread.status}</p>
 *           <button onClick={() => resolveThread(thread.id)}>Resolve</button>
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewsApi } from '../lib/api';
import { useToast } from '../components/Toast';
import { extractErrorMessage } from '../lib/errorUtils';
import type { ReviewThreadDTO, ReviewCommentDTO, AgentRunDTO } from 'git-vibe-shared';

interface CreateThreadData {
  severity: 'info' | 'warning' | 'error';
  anchor: {
    filePath: string;
    lineNumber: number;
  };
}

interface AddCommentData {
  body: string;
}

interface AddressWithAgentData {
  agentKey: string;
  prompt: string;
  inputSummary?: string;
}

interface UseReviewThreadsResult {
  /** The list of review threads */
  threads: ReviewThreadDTO[] | undefined;
  /** Whether the threads are loading */
  isLoading: boolean;
  /** Any error that occurred while fetching threads */
  error: Error | null;
  /** Function to create a new review thread */
  createThread: (data: CreateThreadData) => Promise<ReviewThreadDTO>;
  /** Function to add a comment to a thread */
  addComment: (threadId: string, data: AddCommentData) => Promise<ReviewCommentDTO>;
  /** Function to resolve a thread */
  resolveThread: (threadId: string) => Promise<ReviewThreadDTO>;
  /** Function to unresolve a thread */
  unresolveThread: (threadId: string) => Promise<ReviewThreadDTO>;
  /** Function to address thread with agent */
  addressWithAgent: (threadId: string, data: AddressWithAgentData) => Promise<AgentRunDTO>;
  /** Whether address with agent is in progress */
  isAddressingWithAgent: boolean;
}

/**
 * Hook to manage review threads for a pull request
 *
 * @param pullRequestId - The ID of the pull request to manage threads for
 * @returns Object containing threads data, loading state, error, and thread management functions
 */
export function useReviewThreads(pullRequestId: string): UseReviewThreadsResult {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  // Fetch all threads for the pull request
  const query = useQuery({
    queryKey: ['review-threads', pullRequestId],
    queryFn: async () => {
      const response = await reviewsApi.getThreads(pullRequestId);
      return response.data;
    },
    enabled: !!pullRequestId,
    retry: 2,
  });

  // Create new thread
  const createThreadMutation = useMutation({
    mutationFn: async (data: CreateThreadData) => {
      const response = await reviewsApi.createThread(pullRequestId, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-threads', pullRequestId] });
      success('Review thread created successfully');
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to create thread');
      showError(errorMessage);
    },
  });

  // Add comment to thread
  const addCommentMutation = useMutation({
    mutationFn: async ({ threadId, data }: { threadId: string; data: AddCommentData }) => {
      const response = await reviewsApi.addComment(pullRequestId, threadId, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-threads', pullRequestId] });
      success('Comment added successfully');
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to add comment');
      showError(errorMessage);
    },
  });

  // Resolve thread
  const resolveThreadMutation = useMutation({
    mutationFn: async (threadId: string) => {
      const response = await reviewsApi.resolveThread(pullRequestId, threadId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-threads', pullRequestId] });
      success('Thread resolved successfully');
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to resolve thread');
      showError(errorMessage);
    },
  });

  // Unresolve thread (re-open)
  const unresolveThreadMutation = useMutation({
    mutationFn: async (threadId: string) => {
      const response = await reviewsApi.unresolveThread(pullRequestId, threadId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-threads', pullRequestId] });
      success('Thread reopened successfully');
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to reopen thread');
      showError(errorMessage);
    },
  });

  // Address thread with agent
  const addressWithAgentMutation = useMutation({
    mutationFn: async ({ threadId, data }: { threadId: string; data: AddressWithAgentData }) => {
      const response = await reviewsApi.addressWithAgent(pullRequestId, threadId, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-threads', pullRequestId] });
      queryClient.invalidateQueries({ queryKey: ['agent-runs', pullRequestId] });
      success('Agent triggered successfully');
    },
    onError: (err: unknown) => {
      const errorMessage = extractErrorMessage(err, 'Failed to trigger agent');
      showError(errorMessage);
    },
  });

  return {
    threads: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    createThread: (data: CreateThreadData) => createThreadMutation.mutateAsync(data),
    addComment: (threadId: string, data: AddCommentData) =>
      addCommentMutation.mutateAsync({ threadId, data }),
    resolveThread: (threadId: string) => resolveThreadMutation.mutateAsync(threadId),
    unresolveThread: (threadId: string) => unresolveThreadMutation.mutateAsync(threadId),
    addressWithAgent: (threadId: string, data: AddressWithAgentData) =>
      addressWithAgentMutation.mutateAsync({ threadId, data }),
    isAddressingWithAgent: addressWithAgentMutation.isPending,
  };
}
