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

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-5">
      <p className="text-sm text-gray-600 dark:text-slate-400">
        <span className="font-semibold text-gray-900 dark:text-white">
          {totalResults.toLocaleString('en-US')}
        </span>{' '}
        match · showing {shown.toLocaleString('en-US')}
      </p>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onNarrow(opt.apply({ filters, derived }))}
          title={opt.detail}
          className="px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 hover:border-blue-500/60 hover:text-blue-600 dark:hover:text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
