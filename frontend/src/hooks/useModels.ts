import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { AgentModel } from 'git-vibe-shared';

/**
 * Hook to fetch available models from the backend.
 * The backend caches models in memory per agent, so this hook fetches from the cached endpoint.
 */
export function useModels(agent?: string) {
  const MODELS_QUERY_KEY = ['models', agent || 'opencode'];

  const {
    data: models = [],
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<AgentModel[]>({
    queryKey: MODELS_QUERY_KEY,
    queryFn: () => projectsApi.getModels(agent).then((res) => res.data.data),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes (backend handles main caching)
    gcTime: 10 * 60 * 1000, // Keep in memory for 10 minutes
    retry: 2,
  });

  return {
    models,
    isLoading,
    error,
    refetch,
    isFetching,
  };
}
