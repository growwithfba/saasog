'use client';

import { Fragment } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { HydratedRow } from '@/lib/discovery/types';
import type { VariationRow } from '@/app/api/discovery/variations/route';
import { COLUMNS, formatCell, type ColumnId } from './columns';

interface ResultsTableProps {
  rows: HydratedRow[];
  loading: boolean;
  sortId: ColumnId | null;
  sortDir: 'asc' | 'desc';
  onSort: (columnId: ColumnId) => void;
  savedAsins: Set<string>;
  savingAsin: string | null;
  onAddToFunnel: (asin: string) => void;
  visibleColumns: ColumnId[];
  /**
   * Per-ASIN breakdown. Only supplied when the user has set a filter that can
   * differ between variations — otherwise a breakdown would just restate the
   * parent row, and fetching it would spend tokens for nothing.
   */
  showVariations: boolean;
  expandedAsin: string | null;
  variationRows: VariationRow[] | null;
  variationTotal: number;
  variationTruncated: boolean;
  variationsLoading: boolean;
  variationsError: string | null;
  onToggleVariations: (asin: string) => void;
}

const money2 = (n: number | null) =>
  n === null
    ? '—'
    : n.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
const num = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-US'));

export function ResultsTable({
  rows,
  loading,
  sortId,
  sortDir,
  onSort,
  savedAsins,
  savingAsin,
  onAddToFunnel,
  visibleColumns,
  showVariations,
  expandedAsin,
  variationRows,
  variationTotal,
  variationTruncated,
  variationsLoading,
  variationsError,
  onToggleVariations,
}: ResultsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 dark:text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading products…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-gray-500 dark:text-slate-400">
        No products matched those filters. Try widening your price or BSR range.
      </div>
    );
  }

  // Registry order, not click order, so the table never reshuffles on toggle.
  const cols = COLUMNS.filter((c) => visibleColumns.includes(c.id));
  const colSpan = cols.length + 2; // product + funnel

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[15px]">
        <thead>
          <tr className="text-left text-gray-600 dark:text-slate-400 border-b border-gray-200 dark:border-slate-700">
            <th className="py-3 pr-4 font-medium">Product</th>
            {cols.map((col) => (
              <th
                key={col.id}
                className={`py-3 px-4 font-medium whitespace-nowrap ${col.align === 'right' ? 'text-right' : ''}`}
              >
                <button
                  onClick={() => onSort(col.id)}
                  className="hover:text-blue-500 dark:hover:text-blue-400"
                >
                  {col.label}
                  {sortId === col.id ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
                {col.note && (
                  <span className="ml-1 text-xs text-gray-400 dark:text-slate-500" title={col.note}>
                    ⓘ
                  </span>
                )}
              </th>
            ))}
            <th className="py-3 px-4 font-medium whitespace-nowrap">Funnel</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.asin}>
              <tr className="border-b border-gray-100 dark:border-slate-800">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    {showVariations && (
                      <button
                        type="button"
                        onClick={() => onToggleVariations(row.asin)}
                        aria-expanded={expandedAsin === row.asin}
                        aria-label={`${expandedAsin === row.asin ? 'Hide' : 'Show'} matching variations of ${row.title ?? row.asin}`}
                        className="shrink-0 rounded p-0.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
                      >
                        {expandedAsin === row.asin ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    {row.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={row.imageUrl} alt="" className="w-10 h-10 object-contain rounded shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate max-w-xs text-gray-900 dark:text-white">{row.title ?? row.asin}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        {row.asin}
                        {row.fulfillment ? ` · ${row.fulfillment}` : ''}
                      </p>
                    </div>
                  </div>
                </td>
                {cols.map((col) => (
                  <td
                    key={col.id}
                    className={`py-3 px-4 whitespace-nowrap text-gray-700 dark:text-slate-300 ${col.align === 'right' ? 'text-right' : ''}`}
                  >
                    {formatCell(col.value(row), col.format)}
                  </td>
                ))}
                <td className="py-3 px-4">
                  {savedAsins.has(row.asin) ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
                      In funnel
                    </span>
                  ) : (
                    <button
                      onClick={() => onAddToFunnel(row.asin)}
                      disabled={savingAsin === row.asin}
                      className="px-3 py-1 rounded-lg bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap"
                    >
                      {savingAsin === row.asin ? 'Adding…' : 'Add to Funnel'}
                    </button>
                  )}
                </td>
              </tr>

              {showVariations && expandedAsin === row.asin && (
                <tr className="border-b border-gray-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                  <td colSpan={colSpan} className="px-6 py-4">
                    {variationsLoading ? (
                      <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin" /> Checking this product&rsquo;s variations…
                      </p>
                    ) : variationsError ? (
                      <p className="text-sm text-red-600 dark:text-red-400">{variationsError}</p>
                    ) : !variationRows || variationRows.length === 0 ? (
                      <p className="text-sm text-gray-600 dark:text-slate-400">
                        {variationTotal === 0
                          ? 'This product has no variations — the row above is the whole listing.'
                          : `None of the ${variationTotal} variations checked match your filters.`}
                      </p>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
                          {variationRows.length} of {variationTotal} variations match your filters
                          {variationTruncated &&
                            ' — only the first 20 were checked, narrow your filters to see the rest'}
                        </p>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-500 dark:text-slate-500">
                              <th className="py-1 pr-4 font-medium">Variation</th>
                              <th className="py-1 px-3 font-medium text-right">Price</th>
                              <th className="py-1 px-3 font-medium text-right">Monthly Sales</th>
                              <th className="py-1 px-3 font-medium text-right">Reviews</th>
                              <th className="py-1 px-3 font-medium text-right">Rating</th>
                              <th className="py-1 px-3 font-medium">Funnel</th>
                            </tr>
                          </thead>
                          <tbody>
                            {variationRows.map((v) => (
                              <tr key={v.asin} className="border-t border-gray-200 dark:border-slate-800">
                                <td className="py-2 pr-4">
                                  <p className="text-gray-900 dark:text-white">
                                    {v.variantLabel ?? v.title ?? v.asin}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-slate-400">{v.asin}</p>
                                </td>
                                <td className="py-2 px-3 text-right text-gray-700 dark:text-slate-300">
                                  {money2(v.price)}
                                </td>
                                <td className="py-2 px-3 text-right text-gray-700 dark:text-slate-300">
                                  {num(v.monthlyUnits)}
                                </td>
                                <td className="py-2 px-3 text-right text-gray-700 dark:text-slate-300">
                                  {num(v.reviews)}
                                </td>
                                <td className="py-2 px-3 text-right text-gray-700 dark:text-slate-300">
                                  {v.rating === null ? '—' : v.rating.toFixed(1)}
                                </td>
                                <td className="py-2 px-3">
                                  {savedAsins.has(v.asin) ? (
                                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                      In funnel
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => onAddToFunnel(v.asin)}
                                      disabled={savingAsin === v.asin}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-50 text-white text-xs font-semibold"
                                    >
                                      {savingAsin === v.asin ? 'Adding…' : 'Add'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
