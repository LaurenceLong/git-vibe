import type { AgentModel } from './AgentAdapter.js';

export type AgentKey = 'opencode' | 'claudecode';

/**
 * In-memory cache for agent models
 * Models are cached per-agent and loaded on demand
 */
class ModelsCache {
  private cachedModels: Map<AgentKey, AgentModel[]> = new Map();
  private initializationPromises: Map<AgentKey, Promise<void>> = new Map();

  /**
   * Initialize the cache for a specific agent by fetching models from the agent adapter
   */
  async initialize(agent: AgentKey): Promise<void> {
    // Return existing promise if initialization is already in progress for this agent
    if (this.initializationPromises.has(agent)) {
      return this.initializationPromises.get(agent);
    }

    // Return early if already initialized for this agent
    if (this.cachedModels.has(agent)) {
      return;
    }

    const promise = (async () => {
      try {
        let adapter;
        if (agent === 'opencode') {
          const { openCodeAgentAdapter } = await import('./OpenCodeAgentAdapter.js');
          adapter = openCodeAgentAdapter;
        } else if (agent === 'claudecode') {
          const { claudeCodeAgentAdapter } = await import('./ClaudeCodeAgentAdapter.js');
          adapter = claudeCodeAgentAdapter;
        } else {
          throw new Error(`Unknown agent: ${agent}`);
        }

        console.log(`[ModelsCache] Fetching models from ${agent} agent adapter...`);
        const models = await adapter.getModels();
        this.cachedModels.set(agent, models);
        console.log(`[ModelsCache] Cached ${models.length} models for ${agent}`);
      } catch (error) {
        console.error(`[ModelsCache] Failed to initialize models cache for ${agent}:`, error);
        // Set empty array to prevent repeated failed attempts
        this.cachedModels.set(agent, []);
      } finally {
        this.initializationPromises.delete(agent);
      }
    })();

    this.initializationPromises.set(agent, promise);
    return promise;
  }

  /**
   * Get cached models for a specific agent
   * Returns empty array if cache is not initialized yet
   */
  getModels(agent: AgentKey): AgentModel[] {
    return this.cachedModels.get(agent) || [];
  }

  /**
   * Check if the cache has been initialized for a specific agent
   */
  isReady(agent: AgentKey): boolean {
    return this.cachedModels.has(agent);
  }

  /**
   * Force refresh the cache for a specific agent
   * This can be used to manually refresh the models list
   */
  async refresh(agent: AgentKey): Promise<void> {
    this.cachedModels.delete(agent);
    return this.initialize(agent);
  }
}

// Export singleton instance
export const modelsCache = new ModelsCache();
