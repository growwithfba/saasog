'use client';

import { ColumnPicker } from '@/components/DataTable';
import { COLUMNS, DEFAULT_VISIBLE, PAGE_SIZES, type ColumnId, type PageSize } from './columns';
import { secondaryButton } from '@/components/ui/surfaces';

interface TableControlsProps {
  from: number;
  to: number;
  total: number;
  totalMatches?: number;
  page: number;
  lastPage: number;
  onPageChange: (page: number) => void;
  pageSize: PageSize;
  onPageSizeChange: (size: PageSize) => void;
  /** The column picker only belongs on one of the two bars. */
  showColumnPicker?: boolean;
  visibleColumns?: ColumnId[];
  onColumnsChange?: (ids: ColumnId[]) => void;
  wrapTitle?: boolean;
  onWrapTitleChange?: (on: boolean) => void;
}

/**
 * The count and paging controls, rendered above and below the table.
 *
 * A long page means the controls scroll out of reach exactly when they are
 * needed, so both ends carry them. Only the top bar gets the column picker —
 * duplicating a popover would give two sources of truth on screen at once.
 */
export function TableControls({
  from,
  to,
  total,
  totalMatches,
  page,
  lastPage,
  onPageChange,
  pageSize,
  onPageSizeChange,
  showColumnPicker = false,
  visibleColumns = [],
  onColumnsChange,
  wrapTitle = false,
  onWrapTitleChange,
}: TableControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <p className="text-sm text-gray-500 dark:text-slate-500">
        {total === 0 ? (
          'No products'
        ) : (
          <>
            <span className="text-[15px] font-semibold text-gray-900 dark:text-white">
              {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')}
            </span>
            <span className="mx-1.5">of</span>
            <span className="font-medium text-gray-700 dark:text-slate-300">
              {total.toLocaleString('en-US')}
            </span>
            {totalMatches !== undefined && totalMatches > total && (
              <span className="ml-2 pl-2 border-l border-slate-300 dark:border-slate-700">
                {totalMatches.toLocaleString('en-US')} matched
              </span>
            )}
          </>
        )}
      </p>

      <div className="flex items-center gap-2 ml-auto">
        <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-500">
          <span className="whitespace-nowrap">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
            aria-label="Rows per page"
            className={secondaryButton('research', 'sm')}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        {showColumnPicker && onColumnsChange && onWrapTitleChange && (
          <ColumnPicker
            columns={COLUMNS.map((c) => ({ id: c.id, label: c.label }))}
            visible={visibleColumns ?? []}
            onChange={(ids) => onColumnsChange(ids as ColumnId[])}
            defaults={DEFAULT_VISIBLE}
            footnote="Product and Funnel always show. Your choice is remembered on this device."
          >
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={!!wrapTitle}
                onChange={(e) => onWrapTitleChange(e.target.checked)}
                className="w-4 h-4 shrink-0 rounded border-slate-400 dark:border-slate-600 text-blue-600 focus:ring-blue-500/40"
              />
              <span>Wrap product title</span>
            </label>
          </ColumnPicker>
        )}

        {/* Segmented pair — one border around both, so paging reads as a single
            control rather than two unrelated buttons. */}
        <div className="flex items-center rounded-lg border border-slate-300 dark:border-blue-500/40 overflow-hidden">
          <button
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
            aria-label="Previous page"
            className="px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-blue-100 bg-slate-100 dark:bg-blue-500/10 hover:bg-slate-200 dark:hover:bg-blue-500/20 disabled:opacity-35 disabled:hover:bg-slate-100 dark:disabled:hover:bg-blue-500/10 transition-colors"
          >
            Previous
          </button>
          <span className="w-px self-stretch bg-slate-200 dark:bg-slate-700/60" />
          <button
            onClick={() => onPageChange(Math.min(lastPage, page + 1))}
            disabled={page >= lastPage}
            aria-label="Next page"
            className="px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-blue-100 bg-slate-100 dark:bg-blue-500/10 hover:bg-slate-200 dark:hover:bg-blue-500/20 disabled:opacity-35 disabled:hover:bg-slate-100 dark:disabled:hover:bg-blue-500/10 transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
