'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
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
import { ColumnPicker } from '@/components/DataTable';
import { QuickFilterChips } from './QuickFilterChips';
import { KeywordPanel } from './KeywordPanel';
import { searchRows } from '@/lib/discovery/resultSearch';
import { applyKeywordFilters } from '@/lib/discovery/keywords';
import {
  applyQuickFilter,
  quickFilterCounts,
  type QuickFilterId,
} from '@/lib/discovery/quickFilters';
import { SelectionBar } from './SelectionBar';
import { TableControls } from './TableControls';
import { buildNarrowOptions } from '@/lib/discovery/narrowing';
import { PANEL, PANEL_PAD, field } from '@/components/ui/surfaces';
import {
  readVisibleColumns,
  writeVisibleColumns,
  readPageSize,
  writePageSize,
  COLUMNS,
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

/**
 * How many funnel saves run at once. Each is a multi-second, token-costing
 * Keepa fetch, so this trades a polite burst against minutes of wall-clock.
 */
const SAVE_CONCURRENCY = 4;

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
  // Set when the day's Discovery budget ran out mid-load: the rows we could
  // afford are shown, and this says how many were left. Cleared on search.
  const [budgetNotice, setBudgetNotice] = useState<string | null>(null);
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

  const [quickFilter, setQuickFilter] = useState<QuickFilterId>('all');
  const [query, setQuery] = useState('');
  /** Narrow the view to the current selection. */
  const [isolated, setIsolated] = useState(false);
  /** ASINs the user has removed from view. Not a delete — the search is intact. */
  const [hiddenAsins, setHiddenAsins] = useState<Set<string>>(new Set());
  const [keywords, setKeywords] = useState<{ included: string[]; excluded: string[] }>({
    included: [],
    excluded: [],
  });

  const [expandedAsin, setExpandedAsin] = useState<string | null>(null);
  const [variationRows, setVariationRows] = useState<VariationRow[] | null>(null);
  const [variationTotal, setVariationTotal] = useState(0);
  const [variationTruncated, setVariationTruncated] = useState(false);
  const [variationsLoading, setVariationsLoading] = useState(false);
  const [variationsError, setVariationsError] = useState<string | null>(null);

  const [savedAsins, setSavedAsins] = useState<Set<string>>(new Set());

  const runSearch = useCallback(async () => {
    setFiltersOpen(false);
    setSearching(true);
    setError(null);
    setBudgetNotice(null);
    // A new result set carries none of the old view state: rows removed from
    // the previous search must not stay hidden in this one.
    setHiddenAsins(new Set());
    setIsolated(false);
    setSelectedAsins(new Set());
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

  const unsave = (asins: string[]) =>
    setSavedAsins((prev) => {
      const next = new Set(prev);
      for (const a of asins) next.delete(a);
      return next;
    });

  /**
   * Bounded-concurrency bulk save, also optimistic.
   *
   * This used to run strictly sequentially to pace token spend, but each save
   * takes several seconds, so ticking 50 rows meant minutes of waiting. Four at
   * a time keeps the burst polite to both our route and Keepa while making the
   * common case feel immediate. Token cost is unchanged — same calls, less
   * wall-clock.
   */
  const handleSaveSelected = async () => {
    const asins = Array.from(selectedAsins);
    if (asins.length === 0) return;
    setSavingBulk(true);
    setError(null);
    setSavedAsins((prev) => {
      const next = new Set(prev);
      for (const a of asins) next.add(a);
      return next;
    });
    setSelectedAsins(new Set());

    const queue = [...asins];
    const failed: string[] = [];
    const worker = async () => {
      for (;;) {
        const asin = queue.shift();
        if (asin === undefined) return;
        try {
          const data = await authedPost('/api/research/add-asin', { asin });
          if (!(data?.success || data?.existing_id)) failed.push(asin);
        } catch {
          failed.push(asin);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(SAVE_CONCURRENCY, queue.length) }, worker),
    );

    if (failed.length > 0) {
      unsave(failed);
      setError(
        failed.length === asins.length
          ? 'Could not add those products to your funnel.'
          : `Added ${asins.length - failed.length} of ${asins.length}. The rest could not be added.`,
      );
    }
    setSavingBulk(false);
  };


  /**
   * Optimistic on purpose. The write behind this is a 6-token Keepa fetch that
   * populates ~20 funnel fields and routinely takes several seconds; making the
   * user watch a spinner for it was the complaint. The row reads as saved
   * immediately and rolls back with an error if the write actually fails.
   */
  const handleAddToFunnel = async (asin: string) => {
    setSavedAsins((prev) => new Set(prev).add(asin));
    setError(null);
    try {
      const data = await authedPost('/api/research/add-asin', { asin });
      // A duplicate (structured `existing_id` on the 409 branch) is a success
      // from the user's point of view — the product IS already in their funnel.
      // Checked via the structured field, not the message text, so it survives
      // any copy change.
      if (!(data?.success || data?.existing_id)) {
        unsave([asin]);
        setError(data?.error || 'Could not add that product to your funnel.');
      }
    } catch {
      unsave([asin]);
      setError('Could not add that product to your funnel.');
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
        if (data?.success) {
          setRows(data.rows);
          const skipped = Number(data?.budget?.skipped ?? 0);
          if (data?.budget?.exhausted && skipped > 0) {
            const loaded = Array.isArray(data.rows) ? data.rows.length : 0;
            setBudgetNotice(
              `You've used today's Discovery budget, so ${loaded.toLocaleString('en-US')} of the ` +
                `${(loaded + skipped).toLocaleString('en-US')} matching products are shown. ` +
                'It resets over the next 24 hours.',
            );
          }
        } else setError(data?.error || 'Product lookup failed.');
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
  // Removed and isolated rows come off the top, so the chip counts and the
  // keyword frequency both describe what the user is actually looking at.
  const visibleAfterDismissal = matchingRows.filter(
    (r) => !hiddenAsins.has(r.asin) && (!isolated || selectedAsins.has(r.asin)),
  );
  const quickCounts = quickFilterCounts(visibleAfterDismissal, savedAsins);
  const chipRows = applyQuickFilter(visibleAfterDismissal, quickFilter, savedAsins);
  // Keyword frequency is measured on the searched set but BEFORE the keyword
  // picks, so the chips keep describing the market rather than collapsing to
  // whatever the last pick left behind.
  const searchedRows = searchRows(chipRows, query);
  const keywordRows = applyKeywordFilters(searchedRows, keywords.included, keywords.excluded);
  const sortedRows = sortRows(keywordRows, sortId, sortDir);
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
        isolated={isolated}
        onIsolate={() => {
          setIsolated((on) => !on);
          setPage(0);
        }}
        onRemove={() => {
          setHiddenAsins((prev) => new Set([...prev, ...selectedAsins]));
          setSelectedAsins(new Set());
          setIsolated(false);
          setPage(0);
        }}
        onSave={handleSaveSelected}
        onClear={() => {
          setSelectedAsins(new Set());
          setIsolated(false);
        }}
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
              <LightsaberUnderline phase="research" width="480px" />
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
          className={`group w-full flex items-center justify-between gap-4 px-5 py-3.5 text-left hover:border-slate-300 dark:hover:border-slate-500 transition-colors ${PANEL}`}
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
        onCollapse={() => setFiltersOpen(false)}
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

      {budgetNotice && !error && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {budgetNotice}
        </div>
      )}

      {asins.length > 0 && (
        <div className={PANEL_PAD}>
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
                  className={field('research', 'sm', false)}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <ColumnPicker
                columns={COLUMNS.map((c) => ({ id: c.id, label: c.label }))}
                visible={visibleColumns}
                onChange={(ids) => handleColumnsChange(ids as ColumnId[])}
                defaults={DEFAULT_VISIBLE}
                footnote="Product and Funnel always show. Your choice is remembered on this device."
              >
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wrapTitle}
                    onChange={(e) => handleWrapTitleChange(e.target.checked)}
                    className="w-4 h-4 shrink-0 rounded border-slate-400 dark:border-slate-600 text-blue-600 focus:ring-blue-500/40"
                  />
                  <span>Wrap product title</span>
                </label>
              </ColumnPicker>
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

          {/* Search and keyword picking sit on their own line: both act on the
              rows already in memory, unlike the counts and paging above. */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search ASIN, brand, or title…"
                aria-label="Search the loaded results"
                className={`${field('research', 'sm')} pl-9`}
              />
            </div>
            <KeywordPanel
              rows={searchedRows}
              matchedCount={keywordRows.length}
              included={keywords.included}
              excluded={keywords.excluded}
              onChange={(next) => {
                setKeywords(next);
                setPage(0);
              }}
            />
          </div>

          {/* Lenses onto the result set, below the counts and above the table —
              where the Lens drawer puts them. */}
          <div className="mb-5">
            <QuickFilterChips
              active={quickFilter}
              counts={quickCounts}
              onChange={(id) => {
                setQuickFilter(id);
                // A narrower set can be shorter than the current page index.
                setPage(0);
              }}
            />
          </div>

          <ResultsTable
            rows={visibleRows}
            loading={hydrating}
            sortId={sortId}
            sortDir={sortDir}
            onSort={handleSort}
            savedAsins={savedAsins}
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
        <div className={`${PANEL} p-12 text-center text-gray-500 dark:text-slate-400`}>
          Set your filters above and click Search to find product opportunities.
        </div>
      )}

      {searching && (
        <div className={PANEL}>
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
            <p className="text-slate-400">Searching for products...</p>
          </div>
        </div>
      )}

      {!searching && hasSearched && asins.length === 0 && !error && (
        <div className={`${PANEL} p-12 text-center text-gray-500 dark:text-slate-400`}>
          No products matched those filters. Try widening your price or BSR range.
        </div>
      )}
    </div>
  );
}
