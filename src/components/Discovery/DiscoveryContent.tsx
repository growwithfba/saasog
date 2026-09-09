'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { FilterGrid } from './FilterGrid';
import { ResultsTable } from './ResultsTable';
import type { DiscoveryFilters, HydratedRow } from '@/lib/discovery/types';

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

  const runSearch = useCallback(async () => {
    setSearching(true);
    setError(null);
    setRows([]);
    setPage(0);
    setHasSearched(true);
    try {
      const data = await authedPost('/api/discovery/search', { filters });
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
  }, [filters]);

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
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asins, page]);

  const lastPage = Math.max(0, Math.ceil(asins.length / PAGE_SIZE) - 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Discovery</h1>
        <p className="text-gray-600 dark:text-slate-400 mt-1">
          Find product opportunities, then send the promising ones to your funnel.
        </p>
      </div>

      <FilterGrid filters={filters} onChange={setFilters} onSearch={runSearch} searching={searching} />

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {asins.length > 0 && (
        <div className="bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Viewing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, asins.length)} of{' '}
              {asins.length.toLocaleString('en-US')} loaded
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
          <ResultsTable rows={rows} loading={hydrating} />
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
