'use client';

import { Filter, Loader2, Search, Trash2 } from 'lucide-react';

interface SelectionBarProps {
  count: number;
  saving: boolean;
  /** True while the view is narrowed to the selection. */
  isolated: boolean;
  onIsolate: () => void;
  onRemove: () => void;
  onSave: () => void;
  onClear: () => void;
}

/**
 * Floating bar for acting on selected rows.
 *
 * Mirrors the Lens drawer's bulk bar — same cyan and emerald glow recipe, same
 * order of actions, so a user who has seen one recognises the other. Analyze
 * Market is deliberately absent for now.
 *
 * Fixed rather than inside the table so it stays reachable however far the
 * user has scrolled.
 */
export function SelectionBar({
  count,
  saving,
  isolated,
  onIsolate,
  onRemove,
  onSave,
  onClear,
}: SelectionBarProps) {
  return (
    <div
      role="status"
      className={`fixed left-1/2 bottom-8 z-40 -translate-x-1/2 transition-all duration-200 ${
        count > 0 ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-5'
      }`}
    >
      <div
        className="flex items-center gap-2 rounded-2xl border border-cyan-400/35 bg-slate-900/95 px-3 py-2.5 backdrop-blur-xl"
        style={{
          boxShadow:
            '0 0 22px rgba(34, 211, 238, 0.28), 0 0 36px rgba(16, 185, 129, 0.18), 0 16px 48px rgba(2, 6, 23, 0.7)',
        }}
      >
        <span className="px-2 text-xs font-medium text-slate-400">
          <span className="mr-1.5 text-base font-semibold text-white">{count}</span>
          selected
        </span>

        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-slate-700" />

        <button
          type="button"
          onClick={onIsolate}
          title={isolated ? 'Show all rows again' : 'Isolate — show only these'}
          aria-pressed={isolated}
          aria-label={isolated ? 'Show all rows again' : 'Isolate selected'}
          className={`grid h-8 w-8 place-items-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
            isolated
              ? 'bg-cyan-500/20 text-cyan-300'
              : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
          }`}
        >
          <Search className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onRemove}
          title="Remove from view"
          aria-label="Remove selected from view"
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-500/15 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
        >
          <Trash2 className="h-4 w-4" />
        </button>

        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-slate-700" />

        <button
          type="button"
          onClick={onClear}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
        >
          Clear
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save to Funnel'}
        </button>
      </div>
    </div>
  );
}
