import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { settingsRepository } from '../repositories/SettingsRepository.js';
import { AgentKeySchema } from 'git-vibe-shared';

const GlobalSettingsResponseSchema = z.object({
  defaultAgent: AgentKeySchema,
  agentParams: z.record(z.unknown()),
});

const UpdateGlobalSettingsSchema = z.object({
  defaultAgent: AgentKeySchema.optional(),
  agentParams: z.record(z.unknown()).optional(),
});

export async function settingsRoutes(server: FastifyInstance) {
  server.get('/api/settings', async (_request, reply) => {
    try {
      const settings = await settingsRepository.getGlobalSettings();
      let agentParams: Record<string, unknown> = {};
      try {
        agentParams = JSON.parse(settings.defaultAgentParams || '{}') as Record<string, unknown>;
      } catch {
        agentParams = {};
      }
      const response = GlobalSettingsResponseSchema.parse({
        defaultAgent: settings.defaultAgent as 'opencode' | 'claudecode',
        agentParams,
      });
      return reply.status(200).send(response);
    } catch (error) {
      return reply.status(500).send({
        error: true,
        message: 'Failed to get settings',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.patch('/api/settings', async (request, reply) => {
    try {
      const body = UpdateGlobalSettingsSchema.parse(request.body);
      const updates: { defaultAgent?: string; defaultAgentParams?: string } = {};
      if (body.defaultAgent !== undefined) {
        updates.defaultAgent = body.defaultAgent;
      }
      if (body.agentParams !== undefined) {
        updates.defaultAgentParams = JSON.stringify(body.agentParams);
      }
      if (Object.keys(updates).length === 0) {
        const current = await settingsRepository.getGlobalSettings();
        let agentParams: Record<string, unknown> = {};
        try {
          agentParams = JSON.parse(current.defaultAgentParams || '{}') as Record<string, unknown>;
        } catch {
          agentParams = {};
        }
        return reply.status(200).send({
          defaultAgent: current.defaultAgent,
          agentParams,
        });
      }
      const updated = await settingsRepository.updateGlobalSettings(updates);
      let agentParams: Record<string, unknown> = {};
      try {
        agentParams = JSON.parse(updated.defaultAgentParams || '{}') as Record<string, unknown>;
      } catch {
        agentParams = {};
      }
      const response = GlobalSettingsResponseSchema.parse({
        defaultAgent: updated.defaultAgent as 'opencode' | 'claudecode',
        agentParams,
      });
      return reply.status(200).send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: true,
          message: 'Validation failed',
          details: error.errors,
        });
      }
      return reply.status(500).send({
        error: true,
        message: 'Failed to update settings',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
