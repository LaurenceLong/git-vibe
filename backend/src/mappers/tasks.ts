/**
 * Mapper for Task - converts between domain model (Date) and DTO (ISO string)
 */

import type { Task as TaskDomain } from '../types/models.js';
import type { TaskDTO } from 'git-vibe-shared';

/**
 * Convert domain model (with Date) to DTO (with ISO string)
 */
export function toDTO(domain: TaskDomain): TaskDTO {
  return {
    id: domain.id,
    workItemId: domain.workItemId,
    taskType: domain.taskType,
    status: domain.status,
    input: domain.input,
    output: domain.output,
    currentAgentRunId: domain.currentAgentRunId,
    idempotencyKey: domain.idempotencyKey,
    nodeRunId: domain.nodeRunId,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
  };
}

/**
 * Convert DTO (with ISO string) to domain model (with Date)
 */
export function toDomain(dto: TaskDTO): TaskDomain {
  return {
    id: dto.id,
    workItemId: dto.workItemId,
    taskType: dto.taskType,
    status: dto.status,
    input: dto.input,
    output: dto.output,
    currentAgentRunId: dto.currentAgentRunId,
    idempotencyKey: dto.idempotencyKey,
    nodeRunId: dto.nodeRunId,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}
