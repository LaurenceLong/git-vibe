/**
 * ConfirmModal – Shared confirmation dialog
 * Replaces window.confirm with an in-app modal. Use via useConfirmModal().
 */

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export type ConfirmVariant = 'default' | 'danger';

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

interface ConfirmModalContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmModalContext = createContext<ConfirmModalContextValue | undefined>(undefined);

export function ConfirmModalProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { id: number }) | null>(null);
  const resolverRef = useRef<(value: boolean) => void>();
  const idRef = useRef(0);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const id = ++idRef.current;
      resolverRef.current = resolve;
      setPending({ ...options, id });
    });
  }, []);

  const handleClose = useCallback(() => {
    const resolve = resolverRef.current;
    resolverRef.current = undefined;
    setPending(null);
    resolve?.(false);
  }, []);

  const handleConfirm = useCallback(() => {
    const resolve = resolverRef.current;
    resolverRef.current = undefined;
    setPending(null);
    resolve?.(true);
  }, []);

  const value: ConfirmModalContextValue = { confirm };

  return (
    <ConfirmModalContext.Provider value={value}>
      {children}
      {pending && (
        <ConfirmModalView
          key={pending.id}
          {...pending}
          onConfirm={handleConfirm}
          onCancel={handleClose}
        />
      )}
    </ConfirmModalContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirmModal(): ConfirmModalContextValue {
  const ctx = useContext(ConfirmModalContext);
  if (!ctx) {
    throw new Error('useConfirmModal must be used within ConfirmModalProvider');
  }
  return ctx;
}

interface ConfirmModalViewProps extends ConfirmOptions {
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModalView({
  message,
  title = 'Confirm',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmModalViewProps) {
  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={title}
      closeOnBackdropClick
      closeOnEscape
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-gray-600">{message}</p>
    </Modal>
  );
}
