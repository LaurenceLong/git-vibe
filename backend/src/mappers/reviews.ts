/**
 * Mapper for ReviewThread and ReviewComment - converts between domain models (Date) and DTOs (ISO string)
 */

import type {
  ReviewThread as ReviewThreadDomain,
  ReviewComment as ReviewCommentDomain,
} from '../types/models.js';
import type { ReviewThreadDTO, ReviewCommentDTO } from 'git-vibe-shared';

/**
 * Convert domain model (with Date) to DTO (with ISO string) for ReviewThread
 */
export function reviewThreadToDTO(domain: ReviewThreadDomain): ReviewThreadDTO {
  return {
    id: domain.id,
    pullRequestId: domain.pullRequestId,
    status: domain.status,
    severity: domain.severity,
    anchor: domain.anchor,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
  };
}

/**
 * Convert DTO (with ISO string) to domain model (with Date) for ReviewThread
 */
export function reviewThreadToDomain(dto: ReviewThreadDTO): ReviewThreadDomain {
  return {
    id: dto.id,
    pullRequestId: dto.pullRequestId,
    status: dto.status,
    severity: dto.severity,
    anchor: dto.anchor,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

/**
 * Convert domain model (with Date) to DTO (with ISO string) for ReviewComment
 */
export function reviewCommentToDTO(domain: ReviewCommentDomain): ReviewCommentDTO {
  return {
    id: domain.id,
    threadId: domain.threadId,
    body: domain.body,
    createdAt: domain.createdAt.toISOString(),
  };
}

/**
 * Convert DTO (with ISO string) to domain model (with Date) for ReviewComment
 */
export function reviewCommentToDomain(dto: ReviewCommentDTO): ReviewCommentDomain {
  return {
    id: dto.id,
    threadId: dto.threadId,
    body: dto.body,
    createdAt: new Date(dto.createdAt),
  };
}
