'use client';

import { Fragment } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, ChevronsUpDown, ChevronUp, Filter, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/Checkbox';
import { Tooltip } from '@/components/ui/Tooltip';
import { AsinCell } from './AsinCell';
import { StarRating } from './StarRating';
import { HeaderCell } from './HeaderCell';
import { ListingThumbnail } from '@/components/Product/ListingThumbnail';
import type { HydratedRow } from '@/lib/discovery/types';
import type { VariationRow } from '@/app/api/discovery/variations/route';
import {
  COLUMNS,
  DEFAULT_WIDTHS,
  MIN_COLUMN_WIDTH,
  formatCell,
  type ColumnId,
  type SortId,
} from './columns';

interface ResultsTableProps {
  rows: HydratedRow[];
  loading: boolean;
  sortId: SortId | null;
  sortDir: 'asc' | 'desc';
  onSort: (columnId: SortId) => void;
  savedAsins: Set<string>;
  onAddToFunnel: (asin: string) => void;
  visibleColumns: ColumnId[];
  wrapTitle: boolean;
  selectedAsins: Set<string>;
  onToggleSelect: (asin: string) => void;
  onToggleSelectAll: () => void;
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
  onAddToFunnel,
  visibleColumns,
  wrapTitle,
  selectedAsins,
  onToggleSelect,
  onToggleSelectAll,
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
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading products...</p>
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

  /** Opaque background for the left-pinned cells. The row's own tints are
   *  translucent, which is fine for cells that scroll with it but would let
   *  scrolled columns show through a sticky one — so these are the same
   *  tints flattened onto the card: white / slate-900, the blue-500 selection
   *  wash, and the slate hover wash. */
  const pinnedBg = (selected: boolean) =>
    selected
      ? 'bg-[#f3f7fe] group-hover/row:bg-[#e9f0fd] dark:bg-[#13223e] dark:group-hover/row:bg-[#152746]'
      : 'bg-white group-hover/row:bg-slate-50 dark:bg-slate-900 dark:group-hover/row:bg-[#151e31]';

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
  const colSpan = cols.length + 4; // checkbox + funnel icon + image + product

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
    {/* max-h + overflow on the same box: a sticky thead needs a scrolling
        ancestor to stick inside, and the page itself scrolling would let the
        header slide away exactly as it does today. */}
    <div className="overflow-auto max-h-[calc(100vh-13rem)]">
      {/* Fixed layout so a dragged width is honoured exactly rather than being
          renegotiated by the browser; minWidth keeps a narrow column set from
          leaving the table floating in half the card. */}
      <table className="text-[15px]" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
        <thead>
          <tr className="border-b border-gray-200 dark:border-slate-700">
            {/* Checkbox, save-to-funnel and image are pinned to the left edge
                so a row stays identifiable and actionable while the rest of
                the table scrolls sideways. The offsets are the running sum of
                the pinned widths: w-10 (40) → left-10, + w-8 (32) → 72px. The
                header corners sit above both the sticky header row (z-20) and
                the pinned body cells (z-10). */}
            <th className="sticky top-0 left-0 z-30 bg-white dark:bg-slate-900 w-10 px-2 py-3">
              <Checkbox
                checked={rows.length > 0 && rows.every((r) => selectedAsins.has(r.asin))}
                onChange={onToggleSelectAll}
                aria-label="Select all products on this page"
                className="border-slate-500"
              />
            </th>
            {/* Thin save column, immediately left of the image — a product is
                judged by its picture, so the action belongs beside it rather
                than at the far end of a horizontally-scrolling table. */}
            <th className="sticky top-0 left-10 z-30 bg-white dark:bg-slate-900 w-8 px-1 py-3" aria-label="Save to funnel" />
            {/* 80px thumbnail + px-2 either side. */}
            <th className="sticky top-0 left-[72px] z-30 bg-white dark:bg-slate-900 w-[96px] px-2 py-3 text-left font-semibold uppercase tracking-wide text-[11px] text-gray-500 dark:text-slate-400 border-r border-gray-200 dark:border-slate-700">
              Image
            </th>
            <th
              style={{ width: widthOf('product'), minWidth: widthOf('product') }}
              onClick={() => onSort('product')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSort('product');
                }
              }}
              className={`group relative select-none cursor-pointer pl-2 pr-3.5 py-3 text-left font-semibold uppercase tracking-wide text-[11px] sticky top-0 z-20 bg-white dark:bg-slate-900 ${
                sortId === 'product'
                  ? 'text-blue-600 dark:text-blue-300'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span className="flex items-center gap-1">
                Product
                <span aria-hidden="true">
                  {sortId === 'product' ? (
                    sortDir === 'asc' ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 opacity-40 group-hover:opacity-80" />
                  )}
                </span>
              </span>
              <span
                onMouseDown={(e) => handleResizeStart('product' as ColumnId, widthOf('product'), e)}
                onClick={(e) => e.stopPropagation()}
                aria-hidden="true"
                className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40"
              />
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
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.asin}>
              <tr
                className={`group/row border-b border-gray-100 dark:border-slate-800 transition-colors ${
                  selectedAsins.has(row.asin)
                    ? 'bg-blue-500/5 dark:bg-blue-500/10 hover:bg-blue-500/10 dark:hover:bg-blue-500/[0.14]'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                {/* Pinned cells need an opaque background or the scrolled
                    columns show through; these are the row's translucent
                    selected/hover tints flattened onto the card. */}
                <td className={`sticky left-0 z-10 w-10 px-2 py-3 align-middle border-r border-gray-100 dark:border-slate-800/60 transition-colors ${pinnedBg(selectedAsins.has(row.asin))}`}>
                  <Checkbox
                    checked={selectedAsins.has(row.asin)}
                    onChange={() => onToggleSelect(row.asin)}
                    aria-label={`Select ${row.title ?? row.asin}`}
                    className="border-slate-500"
                  />
                </td>
                <td className={`sticky left-10 z-10 w-8 px-1 py-3 align-middle border-r border-gray-100 dark:border-slate-800/60 transition-colors ${pinnedBg(selectedAsins.has(row.asin))}`}>
                  <button
                    type="button"
                    onClick={() => onAddToFunnel(row.asin)}
                    disabled={savedAsins.has(row.asin)}
                    title={savedAsins.has(row.asin) ? 'In your funnel' : 'Save to funnel'}
                    aria-label={savedAsins.has(row.asin) ? 'In your funnel' : `Save ${row.title ?? row.asin} to funnel`}
                    className={`grid place-items-center w-7 h-7 rounded-lg transition-colors ${
                      savedAsins.has(row.asin)
                        ? 'text-cyan-500 dark:text-cyan-400 cursor-default'
                        : 'text-slate-400 dark:text-slate-600 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10'
                    } disabled:cursor-default`}
                  >
                    <Filter className="w-4 h-4" />
                  </button>
                </td>
                <td className={`sticky left-[72px] z-10 w-[96px] px-2 py-3 align-middle border-r border-gray-200 dark:border-slate-700 transition-colors ${pinnedBg(selectedAsins.has(row.asin))}`}>
                  <ListingThumbnail
                    src={row.imageUrl}
                    size="2xl"
                    linkHref={`https://www.amazon.com/dp/${row.asin}`}
                    linkLabel={`Open ${row.asin} on Amazon`}
                    glow={savedAsins.has(row.asin)}
                  />
                </td>
                <td
                  style={{ width: widthOf('product'), maxWidth: widthOf('product') }}
                  className="px-2 py-3 align-middle border-r border-gray-100 dark:border-slate-800/60"
                >
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
                    <div className="min-w-0">
                      {/* A wrapped title is fully visible already, so the tip
                          would only repeat it. Truncated, it is the only way
                          to read the rest without widening the column. */}
                      {wrapTitle ? (
                        <p className="text-gray-900 dark:text-white leading-snug">
                          {row.title ?? row.asin}
                        </p>
                      ) : (
                        <Tooltip text={row.title ?? ''} size="lg" display="block">
                          <span className="block text-gray-900 dark:text-white leading-snug truncate">
                            {row.title ?? row.asin}
                          </span>
                        </Tooltip>
                      )}
                      <AsinCell asin={row.asin} fulfillment={row.fulfillment} />
                    </div>
                  </div>
                </td>
                {cols.map((col) => (
                  <td
                    key={col.id}
                    style={{ width: widthOf(col.id), maxWidth: widthOf(col.id) }}
                    className={`px-3 py-3 align-middle truncate border-r border-gray-100 dark:border-slate-800/60 text-gray-700 dark:text-slate-300 tabular-nums ${col.align === 'center' ? 'text-center' : ''}`}
                  >
                    {col.format === 'stars' ? (
                      typeof col.value(row) === 'number' ? (
                        <StarRating value={col.value(row) as number} />
                      ) : (
                        '—'
                      )
                    ) : (
                      formatCell(col.value(row), col.format)
                    )}
                  </td>
                ))}

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
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-500 dark:hover:bg-emerald-400 text-white text-xs font-semibold"
                                    >
                                      Add
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
