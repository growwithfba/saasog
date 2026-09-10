'use client';

import { Fragment } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { HeaderCell } from './HeaderCell';
import type { HydratedRow } from '@/lib/discovery/types';
import type { VariationRow } from '@/app/api/discovery/variations/route';
import {
  COLUMNS,
  DEFAULT_WIDTHS,
  MIN_COLUMN_WIDTH,
  formatCell,
  type ColumnId,
} from './columns';

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
  columnOrder: ColumnId[];
  onColumnOrderChange: (ids: ColumnId[]) => void;
  columnWidths: Record<string, number>;
  onColumnWidthsChange: (widths: Record<string, number>) => void;
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
  columnOrder,
  onColumnOrderChange,
  columnWidths,
  onColumnWidthsChange,
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

  // User's dragged order, filtered to what's visible — so hiding a column and
  // showing it again returns it to where they put it.
  const cols = columnOrder
    .filter((id) => visibleColumns.includes(id))
    .map((id) => COLUMNS.find((c) => c.id === id))
    .filter(Boolean) as typeof COLUMNS;

  const widthOf = (id: string) => columnWidths[id] ?? DEFAULT_WIDTHS[id] ?? 130;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = columnOrder.indexOf(active.id as ColumnId);
    const to = columnOrder.indexOf(over.id as ColumnId);
    if (from === -1 || to === -1) return;
    onColumnOrderChange(arrayMove(columnOrder, from, to));
  };

  // Drag-to-resize. Listens on the window rather than the handle so the
  // pointer can leave the 6px strip mid-drag without the resize stopping.
  const handleResizeStart = (id: ColumnId, startWidth: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const onMove = (ev: MouseEvent) => {
      onColumnWidthsChange({
        ...columnWidths,
        [id]: Math.max(MIN_COLUMN_WIDTH, startWidth + (ev.clientX - startX)),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const colSpan = cols.length + 2; // product + funnel

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
    <div className="overflow-x-auto">
      {/* Fixed layout so a dragged width is honoured exactly rather than being
          renegotiated by the browser; minWidth keeps a narrow column set from
          leaving the table floating in half the card. */}
      <table className="text-[15px]" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
        <thead>
          <tr className="border-b border-gray-200 dark:border-slate-700">
            <th
              style={{ width: widthOf('product'), minWidth: widthOf('product') }}
              className="px-3 py-3 text-left font-semibold uppercase tracking-wide text-[11px] text-gray-500 dark:text-slate-400"
            >
              Product
            </th>
            <SortableContext items={cols.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
              {cols.map((col) => (
                <HeaderCell
                  key={col.id}
                  col={col}
                  width={widthOf(col.id)}
                  isSorted={sortId === col.id}
                  sortDir={sortDir}
                  onSort={onSort}
                  onResizeStart={handleResizeStart}
                />
              ))}
            </SortableContext>
            <th
              style={{ width: widthOf('funnel'), minWidth: widthOf('funnel') }}
              className="px-3 py-3 text-left font-semibold uppercase tracking-wide text-[11px] text-gray-500 dark:text-slate-400"
            >
              Funnel
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.asin}>
              <tr className="border-b border-gray-100 dark:border-slate-800">
                <td
                  style={{ width: widthOf('product'), maxWidth: widthOf('product') }}
                  className="px-3 py-3 align-top"
                >
                  <div className="flex items-start gap-3">
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
                      <a
                        href={`https://www.amazon.com/dp/${row.asin}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`Open ${row.asin} on Amazon`}
                        onClick={(e) => e.stopPropagation()}
                        className="group/img relative shrink-0 block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={row.imageUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-20 h-20 object-contain rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        />
                        <span className="absolute -top-1.5 -right-1.5 grid place-items-center w-5 h-5 rounded-full bg-blue-600 text-white opacity-0 scale-90 group-hover/img:opacity-100 group-hover/img:scale-100 transition-all">
                          <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      </a>
                    )}
                    <div className="min-w-0">
                      <p className="text-gray-900 dark:text-white leading-snug line-clamp-3">
                        {row.title ?? row.asin}
                      </p>
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
                    style={{ width: widthOf(col.id), maxWidth: widthOf(col.id) }}
                    className={`px-3 py-3 align-top truncate text-gray-700 dark:text-slate-300 tabular-nums ${col.align === 'right' ? 'text-right' : ''}`}
                  >
                    {formatCell(col.value(row), col.format)}
                  </td>
                ))}
                <td style={{ width: widthOf('funnel') }} className="px-3 py-3 align-top">
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
    </DndContext>
  );
}
