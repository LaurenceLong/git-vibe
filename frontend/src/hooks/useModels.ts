import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { AgentModel } from 'git-vibe-shared';

const MODELS_QUERY_KEY = ['models'];

/**
 * Hook to fetch and cache available models.
 * Models are cached in memory with a long stale time (30 minutes).
 */
export function useModels() {
  const queryClient = useQueryClient();

  const {
    data: models = [],
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<AgentModel[]>({
    queryKey: MODELS_QUERY_KEY,
    queryFn: () => projectsApi.getModels().then((res) => res.data.data),
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes
    gcTime: 60 * 60 * 1000, // Keep in memory for 1 hour
    retry: 2,
  });

  /**
   * Prefetch models on app start (call this in main.tsx or root component)
   */
  const prefetchModels = () => {
    void queryClient.prefetchQuery({
      queryKey: MODELS_QUERY_KEY,
      queryFn: () => projectsApi.getModels().then((res) => res.data.data),
      staleTime: 30 * 60 * 1000,
    });
  };

  return {
    models,
    isLoading,
    error,
    refetch,
    isFetching,
    prefetchModels,
  };
}
