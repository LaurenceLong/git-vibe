/**
 * Mapper for AgentRun - converts between domain model (Date) and DTO (ISO string)
 */

import type { AgentRun as AgentRunDomain } from '../types/models.js';
import type { AgentRunDTO } from 'git-vibe-shared';

/**
 * Convert domain model (with Date) to DTO (with ISO string)
 */
export function toDTO(domain: AgentRunDomain): AgentRunDTO {
  return {
    id: domain.id,
    projectId: domain.projectId,
    workItemId: domain.workItemId,
    agentKey: domain.agentKey,
    status: domain.status,
    inputSummary: domain.inputSummary,
    inputJson: domain.inputJson,
    sessionId: domain.sessionId,
    linkedAgentRunId: domain.linkedAgentRunId,
    log: domain.log,
    logPath: domain.logPath,
    stdoutPath: domain.stdoutPath,
    stderrPath: domain.stderrPath,
    headShaBefore: domain.headShaBefore,
    headShaAfter: domain.headShaAfter,
    commitSha: domain.commitSha,
    pid: domain.pid,
    startedAt: domain.startedAt?.toISOString() ?? null,
    finishedAt: domain.finishedAt?.toISOString() ?? null,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
  };
}

/**
 * Convert DTO (with ISO string) to domain model (with Date)
 */
export function toDomain(dto: AgentRunDTO): AgentRunDomain {
  return {
    id: dto.id,
    projectId: dto.projectId,
    workItemId: dto.workItemId,
    agentKey: dto.agentKey,
    status: dto.status,
    inputSummary: dto.inputSummary,
    inputJson: dto.inputJson,
    sessionId: dto.sessionId,
    linkedAgentRunId: dto.linkedAgentRunId,
    log: dto.log,
    logPath: dto.logPath,
    stdoutPath: dto.stdoutPath,
    stderrPath: dto.stderrPath,
    headShaBefore: dto.headShaBefore,
    headShaAfter: dto.headShaAfter,
    commitSha: dto.commitSha,
    pid: dto.pid,
    startedAt: dto.startedAt ? new Date(dto.startedAt) : null,
    finishedAt: dto.finishedAt ? new Date(dto.finishedAt) : null,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}
