'use client';

import { Filter, Loader2, X } from 'lucide-react';

interface SelectionBarProps {
  count: number;
  saving: boolean;
  onSave: () => void;
  onClear: () => void;
}

/**
 * Floating bar for acting on selected rows.
 *
 * Mirrors the Bloom Lens drawer's bulk bar — same cyan/emerald glow recipe, so
 * a user who has seen one recognises the other. It sits fixed above the fold
 * rather than inside the table so it stays reachable however far the user has
 * scrolled.
 */
export function SelectionBar({ count, saving, onSave, onClear }: SelectionBarProps) {
  return (
    <div
      role="status"
      className={`fixed left-1/2 bottom-8 z-40 -translate-x-1/2 transition-all duration-200 ${
        count > 0 ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-5'
      }`}
    >
      <div
        className="flex items-center gap-3 rounded-2xl border border-cyan-400/35 bg-slate-900/95 px-4 py-2.5 backdrop-blur-xl"
        style={{
          boxShadow:
            '0 0 22px rgba(34, 211, 238, 0.28), 0 0 36px rgba(16, 185, 129, 0.18), 0 16px 48px rgba(2, 6, 23, 0.7)',
        }}
      >
        <span className="text-sm text-slate-300">
          <span className="text-base font-semibold text-white">{count}</span> selected
        </span>

        <button
          type="button"
          onClick={onClear}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
          {saving ? 'Saving…' : `Save ${count === 1 ? 'product' : 'products'} to funnel`}
        </button>
      </div>
    </div>
  );
}
