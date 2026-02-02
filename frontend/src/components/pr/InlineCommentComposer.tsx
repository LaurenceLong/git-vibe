/**
 * InlineCommentComposer Component
 *
 * Form for creating inline comments on specific lines in the diff
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { X } from 'lucide-react';

export interface InlineCommentData {
  body: string;
  intent:
    | 'question'
    | 'bug'
    | 'refactor'
    | 'style'
    | 'security'
    | 'performance'
    | 'test'
    | 'docs'
    | 'other';
}

export interface InlineCommentComposerProps {
  lineNumber: number;
  side: 'base' | 'head';
  filepath: string;
  onSubmit: (data: InlineCommentData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const INTENT_OPTIONS: Array<{ value: InlineCommentData['intent']; label: string }> = [
  { value: 'question', label: 'Question' },
  { value: 'bug', label: 'Bug' },
  { value: 'refactor', label: 'Refactor' },
  { value: 'style', label: 'Style' },
  { value: 'security', label: 'Security' },
  { value: 'performance', label: 'Performance' },
  { value: 'test', label: 'Test' },
  { value: 'docs', label: 'Documentation' },
  { value: 'other', label: 'Other' },
];

export function InlineCommentComposer({
  lineNumber,
  side,
  filepath,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: InlineCommentComposerProps) {
  const [body, setBody] = useState('');
  const [intent, setIntent] = useState<InlineCommentData['intent']>('question');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    await onSubmit({ body: body.trim(), intent });
    setBody('');
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium text-gray-900">
          Comment on line {lineNumber} ({side === 'base' ? 'base' : 'head'})
        </div>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600" type="button">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-2 text-xs text-gray-600">{filepath}</div>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <select
            value={intent}
            onChange={(e) => setIntent(e.target.value as InlineCommentData['intent'])}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {INTENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment..."
          className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          rows={4}
          required
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" loading={isSubmitting}>
            Comment
          </Button>
        </div>
      </form>
    </div>
  );
}
