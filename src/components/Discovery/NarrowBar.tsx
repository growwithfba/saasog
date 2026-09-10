'use client';

import type { DiscoveryFilters } from '@/lib/discovery/types';
import type { DerivedFilterInput } from '@/lib/discovery/derivedFilters';
import { buildNarrowOptions, type NarrowState } from '@/lib/discovery/narrowing';

interface NarrowBarProps {
  totalResults: number;
  shown: number;
  filters: DiscoveryFilters;
  derived: DerivedFilterInput;
  onNarrow: (next: NarrowState) => void;
}

/**
 * Shown when a search matched more than one page of results can hold.
 *
 * Results still load — this is guidance, not a gate. The buttons tighten the
 * filters that are currently loosest, so a user can click their way down to a
 * reviewable set rather than guessing which number to change.
 */
export function NarrowBar({ totalResults, shown, filters, derived, onNarrow }: NarrowBarProps) {
  const options = buildNarrowOptions({ filters, derived }).slice(0, 5);
  const revenueSet = derived.revenueMin !== undefined || derived.revenueMax !== undefined;

  return (
    <div className="rounded-xl border border-amber-500/30 dark:border-amber-400/25 bg-amber-50 dark:bg-amber-500/5 px-5 py-4 mb-5">
      <p className="text-[15px] text-gray-900 dark:text-white">
        <span className="font-semibold">{totalResults.toLocaleString('en-US')} products match</span>
        <span className="text-gray-600 dark:text-slate-400">
          {' '}— showing the strongest {shown.toLocaleString('en-US')} by sales rank.
        </span>
      </p>
      <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
        {revenueSet
          ? 'Tighten a filter to bring the whole set into view. With a revenue filter set, narrowing price helps most — revenue is price × units, so a wide price range lets through products well above your ceiling.'
          : 'Tighten a filter to bring the whole set into view. Each button narrows the one it names.'}
      </p>

      {options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onNarrow(opt.apply({ filters, derived }))}
              title={opt.detail}
              className="group px-3 py-2 rounded-lg border border-amber-500/40 dark:border-amber-400/30 bg-white dark:bg-slate-900/60 text-left hover:border-amber-500/70 dark:hover:border-amber-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
            >
              <span className="block text-sm font-medium text-gray-900 dark:text-white">
                {opt.label}
              </span>
              <span className="block text-xs text-gray-500 dark:text-slate-400">{opt.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
