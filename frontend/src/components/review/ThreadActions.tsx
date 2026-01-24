import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ThreadStatusBadge } from './ThreadStatusBadge';
import { Bot, CheckCircle2, RotateCcw, ChevronDown } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';

/**
 * Props for the ThreadActions component
 */
export interface ThreadActionsProps {
  /** The status of the thread */
  status: 'open' | 'resolved' | 'outdated';
  /** Whether the worktree is present */
  worktreePresent: boolean;
  /** Whether an agent is currently running */
  isAddressingWithAgent?: boolean;
  /** Callback when resolve is clicked */
  onResolve: () => void;
  /** Callback when unresolve is clicked */
  onUnresolve: () => void;
  /** Callback when address with agent is clicked */
  onAddressWithAgent: (agentKey: string, prompt: string) => void;
  /** The creation date of the thread */
  createdAt: Date;
  /** The updated date of the thread */
  updatedAt: Date;
}

/**
 * ThreadActions component
 * Displays actions for managing a review thread
 *
 * Features:
 * - Show thread status with badge
 * - Resolve/Unresolve buttons
 * - Address with agents dropdown
 * - Thread metadata display
 * - Worktree status awareness
 */
export function ThreadActions({
  status,
  worktreePresent,
  isAddressingWithAgent = false,
  onResolve,
  onUnresolve,
  onAddressWithAgent,
  createdAt,
  updatedAt,
}: ThreadActionsProps) {
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('code-review');
  const [agentPrompt, setAgentPrompt] = useState<string>('');

  const agents = [
    { key: 'code-review', label: 'Code Review Agent' },
    { key: 'refactor', label: 'Refactor Agent' },
    { key: 'fix', label: 'Fix Agent' },
  ];

  const canAddressWithAgent = worktreePresent && status !== 'resolved' && !isAddressingWithAgent;

  const handleAddressWithAgent = () => {
    if (agentPrompt.trim()) {
      onAddressWithAgent(selectedAgent, agentPrompt);
      setAgentPrompt('');
      setShowAgentDropdown(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Thread Status and Metadata */}
      <div className="flex flex-wrap items-center gap-3">
        <ThreadStatusBadge status={status} />
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span>Created: {formatDateTime(createdAt)}</span>
          <span>Updated: {formatDateTime(updatedAt)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Resolve/Unresolve */}
        {status === 'open' && (
          <Button variant="secondary" size="sm" onClick={onResolve} disabled={!worktreePresent}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Resolve
          </Button>
        )}
        {status === 'resolved' && (
          <Button variant="secondary" size="sm" onClick={onUnresolve} disabled={!worktreePresent}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reopen
          </Button>
        )}

        {/* Address with Agents */}
        <div className="relative">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAgentDropdown(!showAgentDropdown)}
            disabled={!canAddressWithAgent}
          >
            <Bot className="mr-2 h-4 w-4" />
            Address with agents
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>

          {/* Agent Dropdown */}
          {showAgentDropdown && (
            <div className="absolute right-0 z-10 mt-2 w-80 rounded-md border bg-white p-4 shadow-lg">
              <div className="mb-3">
                <label className="mb-2 block text-sm font-medium text-gray-700">Select Agent</label>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isAddressingWithAgent}
                >
                  {agents.map((agent) => (
                    <option key={agent.key} value={agent.key}>
                      {agent.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">Prompt</label>
                <textarea
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  placeholder="Describe what you want the agent to do..."
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isAddressingWithAgent}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAgentDropdown(false)}
                  disabled={isAddressingWithAgent}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAddressWithAgent}
                  disabled={!agentPrompt.trim() || isAddressingWithAgent}
                  loading={isAddressingWithAgent}
                >
                  {isAddressingWithAgent ? 'Running...' : 'Run Agent'}
                </Button>
              </div>

              {!worktreePresent && (
                <p className="mt-3 text-xs text-amber-600">
                  Worktree is missing. Please recreate the worktree to perform actions.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
