import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workflowsApi } from '@/lib/api';
import { Save, X, Edit2, WrapText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useConfirmModal } from '@/components/ConfirmModal';
import type { Workflow } from 'git-vibe-shared';

export interface WorkflowConfigEditorProps {
  workflowId: string;
  workflow: Workflow | null;
  onClose?: () => void;
}

export function WorkflowConfigEditor({ workflowId, workflow, onClose }: WorkflowConfigEditorProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [wrapText, setWrapText] = useState(true);
  const queryClient = useQueryClient();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    if (workflow) {
      const content = JSON.stringify(workflow, null, 2);
      setEditedContent(content);
      setHasUnsavedChanges(false);
    }
  }, [workflow]);

  const updateMutation = useMutation({
    mutationFn: async (content: string) => {
      try {
        const parsed = JSON.parse(content);
        return await workflowsApi.update(workflowId, {
          definition: parsed,
        });
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error(`Invalid JSON: ${error.message}`);
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
      setHasUnsavedChanges(false);
      setIsEditMode(false);
      setValidationError(null);
    },
    onError: (error: any) => {
      setValidationError(error?.response?.data?.message || error?.message || 'Failed to save');
    },
  });

  const handleSave = () => {
    setValidationError(null);
    try {
      JSON.parse(editedContent); // Validate JSON
      updateMutation.mutate(editedContent);
    } catch (error) {
      if (error instanceof SyntaxError) {
        setValidationError(`Invalid JSON: ${error.message}`);
      }
    }
  };

  const handleCancel = async () => {
    if (hasUnsavedChanges) {
      if (
        !(await confirm({
          message: 'You have unsaved changes. Are you sure you want to cancel?',
        }))
      ) {
        return;
      }
    }
    if (workflow) {
      setEditedContent(JSON.stringify(workflow, null, 2));
    }
    setHasUnsavedChanges(false);
    setIsEditMode(false);
    setValidationError(null);
  };

  const handleCloseWithWarning = async () => {
    if (hasUnsavedChanges) {
      if (
        !(await confirm({
          message: 'You have unsaved changes. Are you sure you want to leave?',
        }))
      ) {
        return;
      }
    }
    onClose?.();
  };

  // Warn on navigation away
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleContentChange = (newContent: string) => {
    setEditedContent(newContent);
    setHasUnsavedChanges(true);
    setValidationError(null);
  };

  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        No workflow configuration available
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          {onClose && (
            <button onClick={handleCloseWithWarning} className="text-gray-600 hover:text-gray-900">
              ← Back
            </button>
          )}
          <h2 className="text-lg font-semibold text-gray-900">Workflow Configuration</h2>
          {hasUnsavedChanges && (
            <span className="text-xs font-medium text-yellow-600">• Unsaved changes</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Wrap toggle - only show in view mode */}
          {!isEditMode && (
            <button
              onClick={() => setWrapText(!wrapText)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                wrapText
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
              title={wrapText ? 'Disable text wrapping' : 'Enable text wrapping'}
            >
              <WrapText className="h-4 w-4" />
              {wrapText ? 'Wrap' : 'No Wrap'}
            </button>
          )}
          {isEditMode ? (
            <>
              <Button variant="secondary" size="sm" onClick={handleCancel}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                loading={updateMutation.isPending}
              >
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setIsEditMode(true)}>
              <Edit2 className="h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {validationError}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
        {isEditMode ? (
          <textarea
            value={editedContent}
            onChange={(e) => handleContentChange(e.target.value)}
            className={`h-full w-full resize-none border-0 bg-white p-4 font-mono text-sm text-gray-900 focus:outline-none ${
              wrapText ? 'whitespace-pre-wrap' : 'overflow-x-auto whitespace-pre'
            }`}
            spellCheck={false}
            wrap={wrapText ? 'soft' : 'off'}
          />
        ) : (
          <div
            className={`h-full overflow-auto p-4 ${
              wrapText ? 'overflow-x-hidden' : 'overflow-x-auto'
            }`}
          >
            <pre
              className={`font-mono text-sm text-gray-900 ${
                wrapText ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
              }`}
            >
              {JSON.stringify(workflow, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-3 text-xs text-gray-500">
        {isEditMode
          ? 'Edit the JSON configuration. Changes will be validated before saving.'
          : 'Read-only mode. Click Edit to modify the configuration.'}
      </div>
    </div>
  );
}
