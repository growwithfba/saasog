'use client';

import { ColumnPicker } from './ColumnPicker';
import { PAGE_SIZES, type ColumnId, type PageSize } from './columns';

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
      <p className="text-sm text-gray-600 dark:text-slate-400">
        {total === 0 ? (
          'No products'
        ) : (
          <>
            Showing{' '}
            <span className="font-medium text-gray-900 dark:text-white">
              {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')}
            </span>{' '}
            of {total.toLocaleString('en-US')}
            {totalMatches !== undefined && totalMatches > total && (
              <> · {totalMatches.toLocaleString('en-US')} total matches</>
            )}
          </>
        )}
      </p>

      <div className="flex items-center gap-2 ml-auto">
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
          <span className="whitespace-nowrap">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
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

        {showColumnPicker && onColumnsChange && onWrapTitleChange && (
          <ColumnPicker
            visible={visibleColumns}
            onChange={onColumnsChange}
            wrapTitle={wrapTitle}
            onWrapTitleChange={onWrapTitleChange}
          />
        )}

        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-sm text-gray-700 dark:text-slate-300 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(Math.min(lastPage, page + 1))}
          disabled={page >= lastPage}
          className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-sm text-gray-700 dark:text-slate-300 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
