'use client';

import { QUICK_FILTERS, type QuickFilterId } from '@/lib/discovery/quickFilters';

interface QuickFilterChipsProps {
  active: QuickFilterId;
  counts: Record<QuickFilterId, number>;
  onChange: (id: QuickFilterId) => void;
}

/**
 * The chip row above the results, mirroring the Lens drawer's.
 *
 * Single-select: these are lenses onto the same result set, not stacking
 * filters, and a user who ticks three of them has really just built a filter
 * — which is what the grid above is for.
 *
 * A chip matching nothing stays visible but goes inert, so the row does not
 * reflow as the user pages or saves.
 */
export function QuickFilterChips({ active, counts, onChange }: QuickFilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {QUICK_FILTERS.map((def) => {
        const count = counts[def.id] ?? 0;
        const isActive = active === def.id;
        const isEmpty = count === 0 && def.id !== 'all';
        return (
          <button
            key={def.id}
            type="button"
            title={def.note}
            disabled={isEmpty}
            onClick={() => onChange(def.id)}
            aria-pressed={isActive}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${
              isActive
                ? 'bg-blue-600 border-blue-600 text-white'
                : isEmpty
                  ? 'bg-transparent border-gray-200 dark:border-slate-800 text-gray-300 dark:text-slate-700 cursor-default'
                  : 'bg-slate-100 dark:bg-slate-800/80 border-transparent dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            {def.label}
            <span className={isActive ? 'text-blue-100' : 'text-gray-400 dark:text-slate-500'}>
              {count.toLocaleString('en-US')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
