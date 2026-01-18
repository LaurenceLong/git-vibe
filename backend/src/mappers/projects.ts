/**
 * Mapper for Project - converts between domain model (Date) and DTO (ISO string)
 */

import type { Project as ProjectDomain } from '../types/models.js';
import type { ProjectDTO } from 'git-vibe-shared';

/**
 * Convert domain model (with Date) to DTO (with ISO string)
 */
export function toDTO(domain: ProjectDomain): ProjectDTO {
  return {
    id: domain.id,
    name: domain.name,
    sourceRepoPath: domain.sourceRepoPath,
    sourceRepoUrl: domain.sourceRepoUrl,
    relayRepoPath: domain.relayRepoPath,
    defaultBranch: domain.defaultBranch,
    defaultAgent: domain.defaultAgent,
    agentParams: domain.agentParams,
    maxAgentConcurrency: domain.maxAgentConcurrency,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
  };
}

/**
 * Convert DTO (with ISO string) to domain model (with Date)
 */
export function toDomain(dto: ProjectDTO): ProjectDomain {
  return {
    id: dto.id,
    name: dto.name,
    sourceRepoPath: dto.sourceRepoPath,
    sourceRepoUrl: dto.sourceRepoUrl,
    relayRepoPath: dto.relayRepoPath,
    defaultBranch: dto.defaultBranch,
    defaultAgent: dto.defaultAgent,
    agentParams: dto.agentParams,
    maxAgentConcurrency: dto.maxAgentConcurrency,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}
