'use client';

import { useEffect } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export type ConfirmTone = 'destructive' | 'neutral';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}

/**
 * Lightweight confirmation modal, styled to match the BloomEngine
 * dark theme. Use in place of window.confirm() for any action the
 * user might want to back out of.
 *
 *   const [confirm, setConfirm] = useState<null | { ... }>(null);
 *   ...
 *   <ConfirmModal
 *     isOpen={confirm !== null}
 *     {...confirm}
 *     onClose={() => setConfirm(null)}
 *   />
 */
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'neutral',
  onConfirm,
  onClose,
  busy,
}: ConfirmModalProps) {
  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, busy]);

  if (!isOpen) return null;

  const isDestructive = tone === 'destructive';
  const Icon = isDestructive ? AlertTriangle : HelpCircle;

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
                isDestructive
                  ? 'bg-red-500/15 text-red-400'
                  : 'bg-blue-500/15 text-blue-400'
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-700/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-slate-700/40 hover:bg-slate-700/60 text-slate-200 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-60 ${
              isDestructive
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
