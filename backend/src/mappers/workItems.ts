/**
 * Mapper for WorkItem - converts between domain model (Date) and DTO (ISO string)
 */

import type { WorkItem as WorkItemDomain } from '../types/models.js';
import type { WorkItemDTO } from 'git-vibe-shared';

/**
 * Convert domain model (with Date) to DTO (with ISO string)
 */
export function toDTO(domain: WorkItemDomain): WorkItemDTO {
  return {
    id: domain.id,
    projectId: domain.projectId,
    type: domain.type,
    title: domain.title,
    body: domain.body,
    status: domain.status,
    workspaceStatus: domain.workspaceStatus,
    worktreePath: domain.worktreePath,
    headBranch: domain.headBranch,
    baseBranch: domain.baseBranch,
    baseSha: domain.baseSha,
    headSha: domain.headSha,
    lockOwnerRunId: domain.lockOwnerRunId,
    lockExpiresAt: domain.lockExpiresAt?.toISOString() ?? null,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
  };
}

/**
 * Convert DTO (with ISO string) to domain model (with Date)
 */
export function toDomain(dto: WorkItemDTO): WorkItemDomain {
  return {
    id: dto.id,
    projectId: dto.projectId,
    type: dto.type,
    title: dto.title,
    body: dto.body,
    status: dto.status,
    workspaceStatus: dto.workspaceStatus,
    worktreePath: dto.worktreePath,
    headBranch: dto.headBranch,
    baseBranch: dto.baseBranch,
    baseSha: dto.baseSha,
    headSha: dto.headSha,
    lockOwnerRunId: dto.lockOwnerRunId,
    lockExpiresAt: dto.lockExpiresAt ? new Date(dto.lockExpiresAt) : null,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}
