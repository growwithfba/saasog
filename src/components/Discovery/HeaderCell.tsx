'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, ChevronsUpDown, GripVertical } from 'lucide-react';
import type { ColumnDef, ColumnId } from './columns';

interface HeaderCellProps {
  col: ColumnDef;
  width: number;
  isSorted: boolean;
  sortDir: 'asc' | 'desc';
  onSort: (id: ColumnId) => void;
  onResizeStart: (id: ColumnId, startWidth: number, e: React.MouseEvent) => void;
}

/**
 * A draggable, resizable column header.
 *
 * Mirrors the Bloom Lens drawer's table: drag listeners live only on the grip,
 * so a click anywhere else on the header sorts cleanly instead of being
 * swallowed by a drag that never happened. The grip and the resize handle both
 * stop propagation so neither double-fires a sort.
 */
export function HeaderCell({
  col,
  width,
  isSorted,
  sortDir,
  onSort,
  onResizeStart,
}: HeaderCellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.id,
  });

  return (
    <th
      ref={setNodeRef}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        ...(isDragging ? { position: 'relative', zIndex: 3 } : {}),
      }}
      onClick={() => onSort(col.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort(col.id);
        }
      }}
      className={`group relative select-none px-3 py-3 text-left align-middle font-semibold uppercase tracking-wide text-[11px] cursor-pointer whitespace-nowrap ${
        isSorted
          ? 'text-blue-600 dark:text-blue-300'
          : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      <div className={`flex items-center gap-1.5 ${col.align === 'right' ? 'justify-end' : ''}`}>
        <span
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          role="button"
          tabIndex={0}
          aria-label={`Drag to reorder ${col.label}`}
          className="cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="w-3 h-3" />
        </span>
        <span className="truncate">{col.label}</span>
        {col.note && (
          <span className="text-slate-400 dark:text-slate-600 text-[10px]" title={col.note}>
            ⓘ
          </span>
        )}
        <span aria-hidden="true" className="shrink-0">
          {isSorted ? (
            sortDir === 'asc' ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )
          ) : (
            <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-60" />
          )}
        </span>
      </div>

      <span
        onMouseDown={(e) => onResizeStart(col.id, width, e)}
        onClick={(e) => e.stopPropagation()}
        aria-hidden="true"
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40"
      />
    </th>
  );
}
