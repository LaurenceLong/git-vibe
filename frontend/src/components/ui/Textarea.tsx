/**
 * Textarea Component
 * A reusable textarea component with label, error, and auto-resize support
 */

import React, { TextareaHTMLAttributes, forwardRef, useEffect, useRef } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
  autoResize?: boolean;
  minRows?: number;
  maxRows?: number;
}

/**
 * Textarea component with label, error message, and auto-resize support
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      fullWidth = false,
      autoResize = false,
      minRows = 1,
      maxRows,
      className = '',
      id,
      style,
      ...props
    },
    ref
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const internalRef = (ref as React.RefObject<HTMLTextAreaElement>) || textareaRef;

    const textareaId = id || `textarea-${Math.random().toString(36).substring(2, 9)}`;

    // Auto-resize functionality
    useEffect(() => {
      if (autoResize && internalRef.current) {
        const textarea = internalRef.current;
        const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight, 10);
        const paddingTop = parseInt(window.getComputedStyle(textarea).paddingTop, 10);
        const paddingBottom = parseInt(window.getComputedStyle(textarea).paddingBottom, 10);

        const resize = () => {
          textarea.style.height = 'auto';
          const newHeight = textarea.scrollHeight;

          const minHeight = minRows * lineHeight + paddingTop + paddingBottom;
          const finalHeight = Math.max(newHeight, minHeight);

          if (maxRows) {
            const maxHeight = maxRows * lineHeight + paddingTop + paddingBottom;
            textarea.style.height = `${Math.min(finalHeight, maxHeight)}px`;
            textarea.style.overflowY = finalHeight > maxHeight ? 'auto' : 'hidden';
          } else {
            textarea.style.height = `${finalHeight}px`;
            textarea.style.overflowY = 'hidden';
          }
        };

        resize();

        textarea.addEventListener('input', resize);
        window.addEventListener('resize', resize);

        return () => {
          textarea.removeEventListener('input', resize);
          window.removeEventListener('resize', resize);
        };
      }
    }, [autoResize, minRows, maxRows, internalRef]);

    const baseStyles =
      'block rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed resize-none';

    const errorStyles = error
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500';

    const widthStyle = fullWidth ? 'w-full' : '';

    const defaultStyle = autoResize ? { minHeight: `${minRows * 24}px` } : {};

    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label htmlFor={textareaId} className="mb-1 block text-sm font-medium text-gray-700">
            {label}
            {props.required && <span className="ml-1 text-red-500">*</span>}
          </label>
        )}
        <textarea
          ref={internalRef}
          id={textareaId}
          className={`${baseStyles} ${errorStyles} ${widthStyle} ${className}`}
          style={{ ...defaultStyle, ...style }}
          aria-invalid={!!error}
          aria-describedby={error ? `${textareaId}-error` : undefined}
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="mt-1 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
