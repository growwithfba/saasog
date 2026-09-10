'use client';

import { Search, SlidersHorizontal } from 'lucide-react';
import type { DiscoveryFilters, RangeValue } from '@/lib/discovery/types';
import type { DerivedFilterInput } from '@/lib/discovery/derivedFilters';
import { revenueToRankBounds } from '@/lib/discovery/revenueBounds';
import { ROOT_CATEGORY_NAMES } from '@/lib/discovery/rootCategories';

interface TooBroadProps {
  totalResults: number;
  reviewableLimit: number;
  filters: DiscoveryFilters;
  derived: DerivedFilterInput;
  onApplySuggestion: (filters: DiscoveryFilters) => void;
  onShowAnyway: () => void;
  loading: boolean;
}

interface Suggestion {
  label: string;
  detail: string;
  apply: (filters: DiscoveryFilters) => DiscoveryFilters;
}

/**
 * Concrete ways to narrow this specific search — not generic advice.
 *
 * Ordered by how much they usually cut. Only suggestions that would actually
 * change the current filter set are offered, so nothing here is a no-op.
 */
function buildSuggestions(filters: DiscoveryFilters, derived: DerivedFilterInput): Suggestion[] {
  const out: Suggestion[] = [];
  const price = filters.price as RangeValue | undefined;
  const bsr = filters.bsr as RangeValue | undefined;

  // The strongest one: a revenue window implies a rank window via the sales
  // curve. Users routinely pair a tight revenue range with a wide BSR range
  // without realising the two disagree.
  const categories = Array.isArray(filters.category)
    ? (filters.category as string[]).map((id) => ROOT_CATEGORY_NAMES[String(id)] ?? null)
    : [];
  const rank = revenueToRankBounds({
    derived,
    priceMin: price?.min,
    priceMax: price?.max,
    categories,
  });
  if (rank.min !== undefined && rank.max !== undefined) {
    const tighter = (bsr?.min ?? 0) < rank.min || (bsr?.max ?? Infinity) > rank.max;
    if (tighter) {
      out.push({
        label: `Match BSR to your revenue range`,
        detail: `Your revenue filter implies a sales rank of roughly ${rank.min.toLocaleString('en-US')}–${rank.max.toLocaleString('en-US')}${
          bsr ? `, but your BSR filter allows ${(bsr.min ?? 1).toLocaleString('en-US')}–${(bsr.max ?? 0).toLocaleString('en-US')}` : ''
        }.`,
        apply: (f) => ({ ...f, bsr: { min: rank.min, max: rank.max } }),
      });
    }
  }

  if (!filters.category || (Array.isArray(filters.category) && filters.category.length === 0)) {
    out.push({
      label: 'Pick a category',
      detail: 'Searching every category at once is the single biggest reason a result set runs into the thousands.',
      apply: (f) => f, // the picker is above; this one is guidance only
    });
  }

  if (!price) {
    out.push({
      label: 'Set a price range',
      detail: 'A price range also sharpens the revenue filter, which needs one to narrow properly.',
      apply: (f) => ({ ...f, price: { min: 20, max: 70 } }),
    });
  }

  if (!filters.reviewCount) {
    out.push({
      label: 'Cap review count',
      detail: 'Under 1,000 reviews keeps you out of markets already owned by established sellers.',
      apply: (f) => ({ ...f, reviewCount: { max: 1000 } }),
    });
  }

  return out;
}

export function TooBroad({
  totalResults,
  reviewableLimit,
  filters,
  derived,
  onApplySuggestion,
  onShowAnyway,
  loading,
}: TooBroadProps) {
  const suggestions = buildSuggestions(filters, derived);

  return (
    <div className="py-12 px-6 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 dark:bg-blue-500/15 mb-4">
        <SlidersHorizontal className="w-6 h-6 text-blue-600 dark:text-blue-300" />
      </div>

      <p className="text-2xl font-semibold text-gray-900 dark:text-white">
        {totalResults.toLocaleString('en-US')} products match
      </p>
      <p className="mt-2 text-[15px] text-gray-600 dark:text-slate-400 max-w-xl mx-auto">
        That&rsquo;s more than anyone can review. Narrow it under{' '}
        {reviewableLimit.toLocaleString('en-US')} and you&rsquo;ll have a set worth going through
        one by one. Nothing has been loaded yet, so this cost you nothing.
      </p>

      {suggestions.length > 0 && (
        <div className="mt-6 max-w-xl mx-auto text-left space-y-2">
          {suggestions.map((s) => (
            <div
              key={s.label}
              className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-900/60 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-gray-900 dark:text-white">{s.label}</p>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">{s.detail}</p>
              </div>
              {s.apply({}) !== undefined && s.label !== 'Pick a category' && (
                <button
                  type="button"
                  onClick={() => onApplySuggestion(s.apply(filters))}
                  className="shrink-0 px-3 py-1.5 rounded-lg border border-blue-500/50 dark:border-blue-400/50 text-blue-600 dark:text-blue-300 text-sm font-medium hover:bg-blue-500/10"
                >
                  Apply
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <button
          type="button"
          onClick={onShowAnyway}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-gray-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 disabled:opacity-50"
        >
          <Search className="w-4 h-4" />
          {loading ? 'Loading…' : `Show the best ${reviewableLimit} anyway`}
        </button>
        <p className="mt-2 text-sm text-gray-500 dark:text-slate-500">
          Sorted by sales rank — the strongest performers in this filter set.
        </p>
      </div>
    </div>
  );
}
