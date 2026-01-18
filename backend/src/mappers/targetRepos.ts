/**
 * Mapper for TargetRepo - converts between domain model (Date) and DTO (ISO string)
 */

import type { TargetRepo as TargetRepoDomain } from '../types/models.js';
import type { TargetRepoDTO } from 'git-vibe-shared';

/**
 * Convert domain model (with Date) to DTO (with ISO string)
 */
export function toDTO(domain: TargetRepoDomain): TargetRepoDTO {
  return {
    id: domain.id,
    name: domain.name,
    repoPath: domain.repoPath,
    defaultBranch: domain.defaultBranch,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
  };
}

/**
 * Convert DTO (with ISO string) to domain model (with Date)
 */
export function toDomain(dto: TargetRepoDTO): TargetRepoDomain {
  return {
    id: dto.id,
    name: dto.name,
    repoPath: dto.repoPath,
    defaultBranch: dto.defaultBranch,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}
