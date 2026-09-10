'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { LightsaberUnderline } from '@/components/LightsaberUnderline';
import { supabase } from '@/utils/supabaseClient';
import { FilterGrid } from './FilterGrid';
import { ResultsTable } from './ResultsTable';
import type { DiscoveryFilters, HydratedRow } from '@/lib/discovery/types';
import {
  applyDerivedFilters,
  applyFulfillmentFilter,
  hasAsinLevelFilters,
  matchingVariations,
  type DerivedFilterInput,
} from '@/lib/discovery/derivedFilters';
import type { VariationRow } from '@/app/api/discovery/variations/route';
import { ColumnPicker } from './ColumnPicker';
import { SelectionBar } from './SelectionBar';
import { TableControls } from './TableControls';
import { buildNarrowOptions } from '@/lib/discovery/narrowing';
import {
  readVisibleColumns,
  writeVisibleColumns,
  readPageSize,
  writePageSize,
  DEFAULT_VISIBLE,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  sortRows,
  readColumnOrder,
  writeColumnOrder,
  readColumnWidths,
  writeColumnWidths,
  readTitleWrap,
  writeTitleWrap,
  type ColumnId,
  type SortId,
  type PageSize,
} from './columns';


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
  // Collapsed once a search runs so the results own the screen. The filter
  // panel is tall, and leaving it open pushed every result below the fold.
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [hydrating, setHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [derived, setDerived] = useState<DerivedFilterInput>({});
  const [sortId, setSortId] = useState<SortId | null>(null);
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
  // Order and widths are separate from visibility so hiding a column and
  // showing it again returns it to where the user dragged it, at the width
  // they set.
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(DEFAULT_VISIBLE);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [wrapTitle, setWrapTitle] = useState(false);
  const handleWrapTitleChange = (on: boolean) => {
    setWrapTitle(on);
    writeTitleWrap(on);
  };

  // Rows ticked for a bulk save. Cleared after a successful save so the bar
  // collapses — the same behaviour the Lens drawer has.
  const [selectedAsins, setSelectedAsins] = useState<Set<string>>(new Set());
  const [savingBulk, setSavingBulk] = useState(false);
  const handleColumnOrderChange = (ids: ColumnId[]) => {
    setColumnOrder(ids);
    writeColumnOrder(ids);
  };
  const handleColumnWidthsChange = (w: Record<string, number>) => {
    setColumnWidths(w);
    writeColumnWidths(w);
  };
  useEffect(() => {
    setVisibleColumns(readVisibleColumns());
    setColumnOrder(readColumnOrder());
    setColumnWidths(readColumnWidths());
    setWrapTitle(readTitleWrap());
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
    setFiltersOpen(false);
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
        // Ordering here decides WHICH products survive the cap, not how they
        // are displayed — the table sorts itself. Best rank first.
        sort: ['bsr', 'asc'],
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
  }, [filters, derived]);

  // Sorting is server-side: it re-runs the query and resets to page 1.
  const handleSort = (columnId: SortId) => {
    if (sortId === columnId) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortId(columnId);
      setSortDir('asc');
    }
    setPage(0);
  };

  // Deliberately no effect here: sorting is a client-side reorder of rows we
  // already hold, so it must not trigger a search.

  // Add to Funnel calls ONLY /api/research/add-asin — it never triggers vetting
  // (a market-level analysis needing a competitor set) and never touches the
  // metered vetting cap. A duplicate ASIN is treated as success: the product
  // is already in the user's funnel, which is what "In funnel" communicates.
  const showVariations = hasAsinLevelFilters(filters, derived);

  /**
   * One chip per active filter, for the collapsed bar — so a user can see what
   * they searched without reopening the panel.
   */
  const activeFilterSummary: string[] = (() => {
    const out: string[] = [];
    const range = (v: unknown) => v as { min?: number; max?: number } | undefined;
    const fmt = (label: string, r?: { min?: number; max?: number }, unit = '') => {
      if (!r || (r.min === undefined && r.max === undefined)) return;
      if (r.min !== undefined && r.max !== undefined) out.push(`${label} ${unit}${r.min}–${unit}${r.max}`);
      else if (r.min !== undefined) out.push(`${label} ${unit}${r.min}+`);
      else out.push(`${label} under ${unit}${r.max}`);
    };
    const cats = filters.category as string[] | undefined;
    if (cats?.length) out.push(`${cats.length} ${cats.length === 1 ? 'category' : 'categories'}`);
    fmt('Price', range(filters.price), '$');
    fmt('BSR', range(filters.bsr));
    fmt('Reviews', range(filters.reviewCount));
    fmt('Rating', range(filters.rating));
    fmt('Units', range(filters.monthlyUnits));
    fmt('Variations', range(filters.variationCount));
    if (derived.revenueMin !== undefined || derived.revenueMax !== undefined) {
      fmt('Revenue', { min: derived.revenueMin, max: derived.revenueMax }, '$');
    }
    const ful = filters.fulfillment as string[] | undefined;
    if (ful?.length && ful.length < 3) out.push(ful.join(', '));
    return out;
  })();

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

  const toggleSelect = (asin: string) => {
    setSelectedAsins((prev) => {
      const next = new Set(prev);
      if (next.has(asin)) next.delete(asin);
      else next.add(asin);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedAsins((prev) => {
      const allOnPage = visibleRows.every((r) => prev.has(r.asin));
      const next = new Set(prev);
      // Only ever affects the current page — a select-all that silently
      // reached rows the user cannot see would be a nasty surprise on save.
      for (const r of visibleRows) {
        if (allOnPage) next.delete(r.asin);
        else next.add(r.asin);
      }
      return next;
    });
  };

  const handleSaveSelected = async () => {
    const asins = Array.from(selectedAsins);
    if (asins.length === 0) return;
    setSavingBulk(true);
    setError(null);
    const saved = new Set(savedAsins);
    let failures = 0;
    // Sequential rather than parallel: each save costs a provider token and
    // hits the same route, and a burst of 50 would be rude to both.
    for (const asin of asins) {
      try {
        const data = await authedPost('/api/research/add-asin', { asin });
        if (data?.success || data?.existing_id) saved.add(asin);
        else failures += 1;
      } catch {
        failures += 1;
      }
    }
    setSavedAsins(saved);
    setSelectedAsins(new Set());
    setSavingBulk(false);
    if (failures > 0) {
      setError(
        failures === asins.length
          ? 'Could not add those products to your funnel.'
          : `Added ${asins.length - failures} of ${asins.length}. The rest could not be added.`,
      );
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

  // Hydrate everything the search returned, in one pass.
  //
  // The search is capped at a reviewable number of products, so fetching them
  // all up front costs a bounded amount and makes every later interaction
  // instant: sorting, paging and the derived filters all run in the browser
  // with no further requests. Fetching per page meant a sort re-ran the whole
  // search and every page turn showed a spinner.
  useEffect(() => {
    if (asins.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setHydrating(true);
    authedPost('/api/discovery/hydrate', { asins })
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
  }, [asins]);

  // Everything below runs on rows already in memory — no request, no spinner.
  const matchingRows = applyFulfillmentFilter(
    applyDerivedFilters(rows, derived),
    filters.fulfillment as string[] | undefined,
  );
  const sortedRows = sortRows(matchingRows, sortId, sortDir);
  // Offered only when the result set was actually cut — otherwise the user is
  // already seeing everything and there is nothing to narrow toward.
  const narrowOptions =
    totalResults > asins.length ? buildNarrowOptions({ filters, derived }).slice(0, 4) : [];
  const lastPage = Math.max(0, Math.ceil(sortedRows.length / pageSize) - 1);
  const pageStart = Math.min(page, lastPage) * pageSize;
  const visibleRows = sortedRows.slice(pageStart, pageStart + pageSize);

  return (
    <div className="space-y-6">
      <SelectionBar
        count={selectedAsins.size}
        saving={savingBulk}
        onSave={handleSaveSelected}
        onClear={() => setSelectedAsins(new Set())}
      />
      {/* Same header treatment the other phases use — the phase-coloured
          lightsaber underline from SectionStats — so Discovery reads as part of
          the funnel rather than a bolted-on tool. Discovery uses the `research`
          phase colour, matching its nav pill. */}
      <div className="mb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white relative mb-2 pb-2">
            Discovery
            <div className="absolute bottom-0 left-0">
              <LightsaberUnderline phase="research" width="260px" />
            </div>
          </h2>
        </div>
        <p className="text-gray-700 dark:text-slate-400">
          Find product opportunities, then send the promising ones to your funnel.
        </p>
      </div>

      {!filtersOpen && (
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="group w-full flex items-center justify-between gap-4 px-5 py-3.5 rounded-2xl border border-gray-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 text-left hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-500">
              Filters
            </span>
            {activeFilterSummary.length === 0 ? (
              <span className="text-sm text-gray-500 dark:text-slate-400">None set</span>
            ) : (
              activeFilterSummary.map((chip) => (
                <span
                  key={chip}
                  className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-transparent dark:border-slate-700/60 text-[13px] font-medium text-slate-700 dark:text-slate-300"
                >
                  {chip}
                </span>
              ))
            )}
          </span>
          <span className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-300 group-hover:bg-blue-500/10 transition-colors">
            Edit
          </span>
        </button>
      )}

      {filtersOpen && (
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
      )}

      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {asins.length > 0 && (
        <div className="bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 rounded-2xl p-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mb-5">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              {sortedRows.length === 0 ? (
                'No products'
              ) : (
                <>
                  Showing{' '}
                  <span className="font-medium text-gray-900 dark:text-white">
                    {(pageStart + 1).toLocaleString('en-US')}–
                    {Math.min(pageStart + pageSize, sortedRows.length).toLocaleString('en-US')}
                  </span>{' '}
                  of {sortedRows.length.toLocaleString('en-US')}
                  {totalResults > asins.length && (
                    <> · {totalResults.toLocaleString('en-US')} total matches</>
                  )}
                </>
              )}
            </p>

            <div className="flex items-center gap-2 ml-auto">
              {narrowOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    const next = opt.apply({ filters, derived });
                    setFilters(next.filters);
                    setDerived(next.derived);
                  }}
                  title={opt.detail}
                  className="px-2.5 py-1.5 rounded-full border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 hover:border-blue-500/60 hover:text-blue-600 dark:hover:text-blue-300"
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                <span className="whitespace-nowrap">Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value) as PageSize)}
                  aria-label="Rows per page"
                  className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <ColumnPicker
                visible={visibleColumns}
                onChange={handleColumnsChange}
                wrapTitle={wrapTitle}
                onWrapTitleChange={handleWrapTitleChange}
              />
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-sm text-gray-700 dark:text-slate-300 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page >= lastPage}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-sm text-gray-700 dark:text-slate-300 disabled:opacity-40"
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
            columnOrder={columnOrder}
            onColumnOrderChange={handleColumnOrderChange}
            wrapTitle={wrapTitle}
            selectedAsins={selectedAsins}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            columnWidths={columnWidths}
            onColumnWidthsChange={handleColumnWidthsChange}
          />

          {sortedRows.length > 0 && (
            <div className="mt-5 pt-5 border-t border-gray-100 dark:border-slate-800">
              <TableControls
                from={pageStart + 1}
                to={Math.min(pageStart + pageSize, sortedRows.length)}
                total={sortedRows.length}
                totalMatches={totalResults}
                page={page}
                lastPage={lastPage}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={handlePageSizeChange}
              />
            </div>
          )}
        </div>
      )}

      {!searching && !hasSearched && asins.length === 0 && !error && (
        <div className="bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 rounded-2xl p-12 text-center text-gray-500 dark:text-slate-400">
          Set your filters above and click Search to find product opportunities.
        </div>
      )}

      {searching && (
        <div className="bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 rounded-2xl">
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
            <p className="text-slate-400">Searching for products...</p>
          </div>
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
