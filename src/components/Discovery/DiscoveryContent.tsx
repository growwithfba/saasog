'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { FilterGrid } from './FilterGrid';
import { ResultsTable } from './ResultsTable';
import type { DiscoveryFilters, HydratedRow } from '@/lib/discovery/types';
import { applyDerivedFilters, type DerivedFilterInput } from '@/lib/discovery/derivedFilters';

const PAGE_SIZE = 25;

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
  const [searching, setSearching] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [derived, setDerived] = useState<DerivedFilterInput>({});
  const [sortId, setSortId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [savedAsins, setSavedAsins] = useState<Set<string>>(new Set());
  const [savingAsin, setSavingAsin] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    setSearching(true);
    setError(null);
    setRows([]);
    setAsins([]);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
      setAsins([]);
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
    const slice = asins.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
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
  }, [asins, page]);

  const lastPage = Math.max(0, Math.ceil(asins.length / PAGE_SIZE) - 1);
  const visibleRows = applyDerivedFilters(rows, derived);
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
        onSearch={runSearch}
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
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Viewing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, asins.length)} of{' '}
              {asins.length.toLocaleString('en-US')} loaded
              {hiddenByDerived > 0 && (
                <> · {hiddenByDerived.toLocaleString('en-US')} hidden by your revenue/exclusion filters</>
              )}
              {totalResults > asins.length && (
                <> · {totalResults.toLocaleString('en-US')} total matches — narrow your filters to see more of them</>
              )}
            </p>
            <div className="flex gap-2">
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
