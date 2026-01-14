/**
 * useReviewThreads Hook
 *
 * Fetches all review threads for a changeset.
 * Creates new thread.
 * Adds comment to thread.
 * Resolves/unresolves thread.
 * Shows toast notifications on success/error.
 * Handles outdated threads (when head changes).
 *
 * @example
 * ```tsx
 * function ReviewThreadsComponent({ changesetId }: { changesetId: string }) {
 *   const { threads, isLoading, error, createThread, addComment, resolveThread, unresolveThread } =
 *     useReviewThreads(changesetId);
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
import { ReviewThread } from '../types';

interface CreateThreadData {
  file: string;
  line: number;
  comment: string;
}

interface AddCommentData {
  comment: string;
}

interface AddressWithAgentData {
  agentKey: string;
  prompt: string;
  inputSummary?: string;
}

interface UseReviewThreadsResult {
  /** The list of review threads */
  threads: ReviewThread[] | undefined;
  /** Whether the threads are loading */
  isLoading: boolean;
  /** Any error that occurred while fetching threads */
  error: Error | null;
  /** Function to create a new review thread */
  createThread: (data: CreateThreadData) => Promise<void>;
  /** Function to add a comment to a thread */
  addComment: (threadId: string, data: AddCommentData) => Promise<void>;
  /** Function to resolve a thread */
  resolveThread: (threadId: string) => Promise<void>;
  /** Function to unresolve a thread */
  unresolveThread: (threadId: string) => Promise<void>;
  /** Function to address thread with agent */
  addressWithAgent: (threadId: string, data: AddressWithAgentData) => Promise<void>;
  /** Whether address with agent is in progress */
  isAddressingWithAgent: boolean;
}

/**
 * Hook to manage review threads for a changeset
 *
 * @param changesetId - The ID of the changeset to manage threads for
 * @returns Object containing threads data, loading state, error, and thread management functions
 */
export function useReviewThreads(changesetId: string): UseReviewThreadsResult {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  // Fetch all threads for the changeset
  const query = useQuery({
    queryKey: ['review-threads', changesetId],
    queryFn: async () => {
      const response = await reviewsApi.getThreads(changesetId);
      return response.data as ReviewThread[];
    },
    enabled: !!changesetId,
    retry: 2,
  });

  // Create new thread
  const createThreadMutation = useMutation({
    mutationFn: async (data: CreateThreadData) => {
      const response = await reviewsApi.createThread(changesetId, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-threads', changesetId] });
      success('Review thread created successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to create thread: ${err.message}`);
    },
  });

  // Add comment to thread
  const addCommentMutation = useMutation({
    mutationFn: async ({ threadId, data }: { threadId: string; data: AddCommentData }) => {
      const response = await reviewsApi.addComment(changesetId, threadId, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-threads', changesetId] });
      success('Comment added successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to add comment: ${err.message}`);
    },
  });

  // Resolve thread
  const resolveThreadMutation = useMutation({
    mutationFn: async (threadId: string) => {
      const response = await reviewsApi.resolveThread(changesetId, threadId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-threads', changesetId] });
      success('Thread resolved successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to resolve thread: ${err.message}`);
    },
  });

  // Unresolve thread (re-open)
  const unresolveThreadMutation = useMutation({
    mutationFn: async (threadId: string) => {
      const response = await reviewsApi.unresolveThread(changesetId, threadId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-threads', changesetId] });
      success('Thread reopened successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to reopen thread: ${err.message}`);
    },
  });

  // Address thread with agent
  const addressWithAgentMutation = useMutation({
    mutationFn: async ({ threadId, data }: { threadId: string; data: AddressWithAgentData }) => {
      const response = await reviewsApi.addressWithAgent(changesetId, threadId, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-threads', changesetId] });
      queryClient.invalidateQueries({ queryKey: ['agent-runs', changesetId] });
      success('Agent triggered successfully');
    },
    onError: (err: Error) => {
      showError(`Failed to trigger agent: ${err.message}`);
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
