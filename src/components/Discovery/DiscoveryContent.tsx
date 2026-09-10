'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { FilterGrid } from './FilterGrid';
import { ResultsTable } from './ResultsTable';
import type { DiscoveryFilters, HydratedRow } from '@/lib/discovery/types';
import {
  applyDerivedFilters,
  applyFulfillmentFilter,
  hasDerivedFilters,
  hasAsinLevelFilters,
  matchingVariations,
  type DerivedFilterInput,
} from '@/lib/discovery/derivedFilters';
import type { VariationRow } from '@/app/api/discovery/variations/route';
import { ColumnPicker } from './ColumnPicker';
import { NarrowBar } from './NarrowBar';
import type { NarrowState } from '@/lib/discovery/narrowing';
import {
  readVisibleColumns,
  writeVisibleColumns,
  readPageSize,
  writePageSize,
  DEFAULT_VISIBLE,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  type ColumnId,
  type PageSize,
} from './columns';


/**
 * How many extra candidates to fetch per visible row when a derived filter is
 * active. Those filters can only be judged after a row is hydrated, so without
 * this the page renders whatever survives — a $5k-$50k revenue window left 1
 * row of 50. 4x costs 4x the tokens on those searches, which is the honest
 * price of a full page.
 */
const OVER_FETCH = 4;

/** The hydrate route's own ceiling. */
const MAX_HYDRATE = 300;

async function authedPost(path: string, body: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function DiscoveryContent() {
  const [filters, setFilters] = useState<DiscoveryFilters>({});
  const [asins, setAsins] = useState<string[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<HydratedRow[]>([]);
  // How many the provider says matched, versus how many we actually returned.
  // A capped set still shows results; NarrowBar explains the gap.
  const [reviewableLimit, setReviewableLimit] = useState(250);

  const [searching, setSearching] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [derived, setDerived] = useState<DerivedFilterInput>({});
  const [sortId, setSortId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Per-ASIN breakdown for one expanded row. Only ever fetched when the user
  // has set a filter that can differ between variations — otherwise the
  // breakdown would restate the parent row and cost tokens to say nothing.
  // Column choice is per-device. Starts from the default so the server and
  // first client render agree; localStorage is read after mount to avoid a
  // hydration mismatch.
  // Rows per page. Each row costs 2 provider tokens to hydrate, so this is the
  // single biggest lever on what a search spends — 300 rows is ~600 tokens.
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const handlePageSizeChange = (size: PageSize) => {
    setPageSize(size);
    writePageSize(size);
    setPage(0); // row N of the old size is not row N of the new one
  };

  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(DEFAULT_VISIBLE);
  useEffect(() => {
    setVisibleColumns(readVisibleColumns());
    setPageSize(readPageSize());
  }, []);
  const handleColumnsChange = (ids: ColumnId[]) => {
    setVisibleColumns(ids);
    writeVisibleColumns(ids);
  };

  const [expandedAsin, setExpandedAsin] = useState<string | null>(null);
  const [variationRows, setVariationRows] = useState<VariationRow[] | null>(null);
  const [variationTotal, setVariationTotal] = useState(0);
  const [variationTruncated, setVariationTruncated] = useState(false);
  const [variationsLoading, setVariationsLoading] = useState(false);
  const [variationsError, setVariationsError] = useState<string | null>(null);

  const [savedAsins, setSavedAsins] = useState<Set<string>>(new Set());
  const [savingAsin, setSavingAsin] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    setSearching(true);
    setError(null);
    setRows([]);
    setAsins([]);
    setExpandedAsin(null);
    setVariationRows(null);
    setPage(0);
    setHasSearched(true);
    try {
      // `derived` filters (revenue, sales-to-reviews, exclusions) are never
      // sent to the search route — they apply client-side, below, against
      // the rows already hydrated for the visible page. See the note above
      // `impliedUnitBounds` in derivedFilters.ts for why.
      const data = await authedPost('/api/discovery/search', {
        filters,
        sort: sortId ? [sortId, sortDir] : undefined,
      });
      if (!data?.success) throw new Error(data?.error || 'Search failed.');
      setAsins(data.asins);
      setTotalResults(data.totalResults);
      if (typeof data.reviewableLimit === 'number') setReviewableLimit(data.reviewableLimit);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
      setAsins([]);
    setExpandedAsin(null);
    setVariationRows(null);
      setTotalResults(0);
    } finally {
      setSearching(false);
    }
  }, [filters, derived, sortId, sortDir]);

  // Sorting is server-side: it re-runs the query and resets to page 1.
  const handleSort = (filterId: string) => {
    if (sortId === filterId) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortId(filterId);
      setSortDir('asc');
    }
  };

  useEffect(() => {
    if (sortId) void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortId, sortDir]);

  // Add to Funnel calls ONLY /api/research/add-asin — it never triggers vetting
  // (a market-level analysis needing a competitor set) and never touches the
  // metered vetting cap. A duplicate ASIN is treated as success: the product
  // is already in the user's funnel, which is what "In funnel" communicates.
  const showVariations = hasAsinLevelFilters(filters, derived);

  const handleToggleVariations = async (asin: string) => {
    if (expandedAsin === asin) {
      setExpandedAsin(null);
      return;
    }
    setExpandedAsin(asin);
    setVariationRows(null);
    setVariationsError(null);
    setVariationsLoading(true);
    try {
      const data = await authedPost('/api/discovery/variations', { asin });
      if (data?.success) {
        // Filter client-side against the same bounds the user set: the
        // provider applied them when picking the family, never per sibling.
        setVariationRows(matchingVariations(data.rows as VariationRow[], filters, derived));
        setVariationTotal(data.total ?? 0);
        setVariationTruncated(Boolean(data.truncated));
      } else {
        setVariationsError(data?.error || 'Could not load variations.');
      }
    } catch {
      setVariationsError('Could not load variations. Check your connection and try again.');
    } finally {
      setVariationsLoading(false);
    }
  };

  const handleAddToFunnel = async (asin: string) => {
    setSavingAsin(asin);
    setError(null);
    try {
      const data = await authedPost('/api/research/add-asin', { asin });
      if (data?.success || data?.existing_id) {
        // A duplicate (structured `existing_id` on the 409 branch) is a
        // success from the user's point of view — the product IS already
        // in their funnel. Checked via the structured field, not the
        // message text, so it survives any copy change.
        setSavedAsins((prev) => new Set(prev).add(asin));
      } else {
        setError(data?.error || 'Could not add that product to your funnel.');
      }
    } catch {
      setError('Could not add that product to your funnel.');
    } finally {
      setSavingAsin(null);
    }
  };

  // Hydrate only the visible page — this is where the tokens are spent.
  useEffect(() => {
    // Derived filters (revenue, exclusions) can only be judged after a row is
    // hydrated, so with one active a page of exactly pageSize can render almost
    // empty — a $5k-$50k revenue window left 1 row of 50 visible. When one is
    // set, fetch a wider slice so the page fills up. Capped at the route's
    // limit; the header reports how many were actually checked, so a partial
    // page never looks like a complete one.
    const overFetch = hasAsinLevelFilters(filters, derived) || hasDerivedFilters(derived);
    const want = overFetch ? Math.min(pageSize * OVER_FETCH, MAX_HYDRATE) : pageSize;
    const start = page * want;
    const slice = asins.slice(start, start + want);
    if (slice.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setHydrating(true);
    authedPost('/api/discovery/hydrate', { asins: slice })
      .then((data) => {
        if (cancelled) return;
        if (data?.success) setRows(data.rows);
        else setError(data?.error || 'Product lookup failed.');
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setError('Could not load these products. Check your connection and try again.');
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asins, page, pageSize]);

  const pageStride =
    hasAsinLevelFilters(filters, derived) || hasDerivedFilters(derived)
      ? Math.min(pageSize * OVER_FETCH, MAX_HYDRATE)
      : pageSize;
  const lastPage = Math.max(0, Math.ceil(asins.length / pageStride) - 1);
  const visibleRows = applyFulfillmentFilter(
    applyDerivedFilters(rows, derived),
    filters.fulfillment as string[] | undefined,
  );
  const hiddenByDerived = rows.length - visibleRows.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Discovery</h1>
        <p className="text-gray-600 dark:text-slate-400 mt-1">
          Find product opportunities, then send the promising ones to your funnel.
        </p>
      </div>

      <FilterGrid
        filters={filters}
        onChange={setFilters}
        derived={derived}
        onDerivedChange={setDerived}
        onSearch={() => void runSearch()}
        searching={searching}
        onApplyPreset={(f, d) => {
          setFilters(f);
          setDerived(d);
        }}
      />

      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {asins.length > 0 && (
        <div className="bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 rounded-2xl p-6">
          {totalResults > asins.length && (
            <NarrowBar
              totalResults={totalResults}
              shown={asins.length}
              filters={filters}
              derived={derived}
              onNarrow={(next) => {
                setFilters(next.filters);
                setDerived(next.derived);
              }}
            />
          )}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              <span className="font-medium text-gray-900 dark:text-white">
                {visibleRows.length.toLocaleString('en-US')}{' '}
                {visibleRows.length === 1 ? 'product' : 'products'}
              </span>
            </p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                <span className="whitespace-nowrap">Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value) as PageSize)}
                  aria-label="Rows per page"
                  className="px-2 py-2 rounded-lg border border-slate-300 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <ColumnPicker visible={visibleColumns} onChange={handleColumnsChange} />
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded-lg border border-gray-300 dark:border-slate-600 text-sm text-gray-700 dark:text-slate-300 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page >= lastPage}
                className="px-3 py-1 rounded-lg border border-gray-300 dark:border-slate-600 text-sm text-gray-700 dark:text-slate-300 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
          <ResultsTable
            rows={visibleRows}
            loading={hydrating}
            sortId={sortId}
            sortDir={sortDir}
            onSort={handleSort}
            savedAsins={savedAsins}
            savingAsin={savingAsin}
            onAddToFunnel={handleAddToFunnel}
            showVariations={showVariations}
            expandedAsin={expandedAsin}
            variationRows={variationRows}
            variationTotal={variationTotal}
            variationTruncated={variationTruncated}
            variationsLoading={variationsLoading}
            variationsError={variationsError}
            onToggleVariations={handleToggleVariations}
            visibleColumns={visibleColumns}
          />
        </div>
      )}

      {!searching && !hasSearched && asins.length === 0 && !error && (
        <div className="bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 rounded-2xl p-12 text-center text-gray-500 dark:text-slate-400">
          Set your filters above and click Search to find product opportunities.
        </div>
      )}

      {!searching && hasSearched && asins.length === 0 && !error && (
        <div className="bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 rounded-2xl p-12 text-center text-gray-500 dark:text-slate-400">
          No products matched those filters. Try widening your price or BSR range.
        </div>
      )}
    </div>
  );
}
