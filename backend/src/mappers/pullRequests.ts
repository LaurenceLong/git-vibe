/**
 * Mapper for PullRequest - converts between domain model (Date) and DTO (ISO string)
 */

import type { PullRequest as PullRequestDomain } from '../types/models.js';
import type { PullRequestDTO } from 'git-vibe-shared';

/**
 * Convert domain model (with Date) to DTO (with ISO string)
 */
export function toDTO(domain: PullRequestDomain): PullRequestDTO {
  return {
    id: domain.id,
    projectId: domain.projectId,
    workItemId: domain.workItemId,
    title: domain.title,
    description: domain.description,
    status: domain.status,
    sourceBranch: domain.sourceBranch,
    targetBranch: domain.targetBranch,
    mergeStrategy: domain.mergeStrategy,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
    mergedAt: domain.mergedAt?.toISOString() ?? null,
    mergedBy: domain.mergedBy,
    mergeCommitSha: domain.mergeCommitSha,
  };
}

/**
 * Convert DTO (with ISO string) to domain model (with Date)
 */
export function toDomain(dto: PullRequestDTO): PullRequestDomain {
  return {
    id: dto.id,
    projectId: dto.projectId,
    workItemId: dto.workItemId,
    title: dto.title,
    description: dto.description,
    status: dto.status,
    sourceBranch: dto.sourceBranch,
    targetBranch: dto.targetBranch,
    mergeStrategy: dto.mergeStrategy,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
    mergedAt: dto.mergedAt ? new Date(dto.mergedAt) : null,
    mergedBy: dto.mergedBy,
    mergeCommitSha: dto.mergeCommitSha,
  };
}
