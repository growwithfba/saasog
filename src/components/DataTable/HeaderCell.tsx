'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, ChevronsUpDown, GripVertical } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { HEAD_CELL } from './styles';

export interface HeaderCellProps {
  id: string;
  label: string;
  /** Plain-English help, shown on hover. Labels with help get a dotted underline. */
  note?: string;
  width: number;
  align?: 'left' | 'center';
  /** Omit to render a plain, unsortable header. */
  onSort?: (id: string) => void;
  isSorted?: boolean;
  sortDir?: 'asc' | 'desc';
  /** Omit to drop the resize handle. */
  onResizeStart?: (id: string, startWidth: number, e: React.MouseEvent) => void;
  /** Must sit inside a SortableContext. Omit to drop the grip. */
  draggable?: boolean;
}

/**
 * A draggable, resizable, sortable column header — the one every table uses.
 *
 * Mirrors the Bloom Lens drawer: drag listeners live only on the grip, so a
 * click anywhere else on the header sorts cleanly instead of being swallowed
 * by a drag that never happened. The grip and the resize handle both stop
 * propagation so neither double-fires a sort. Help text sits on the label
 * itself (hover), as the drawer does — a separate ⓘ glyph collided with
 * wrapped labels on narrow columns.
 */
export function HeaderCell({
  id,
  label,
  note,
  width,
  align = 'left',
  onSort,
  isSorted = false,
  sortDir = 'desc',
  onResizeStart,
  draggable = false,
}: HeaderCellProps) {
  const sortable = useSortable({ id, disabled: !draggable });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;

  const labelNode = (
    <span
      className={`min-w-0 break-normal leading-tight ${
        note ? 'border-b border-dotted border-current/40 cursor-help' : ''
      }`}
    >
      {label}
    </span>
  );

  return (
    <th
      ref={draggable ? setNodeRef : undefined}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        transform: draggable ? CSS.Transform.toString(transform) : undefined,
        transition: draggable ? transition : undefined,
        opacity: isDragging ? 0.6 : 1,
        ...(isDragging ? { position: 'relative' as const, zIndex: 30 } : {}),
      }}
      onClick={onSort ? () => onSort(id) : undefined}
      role={onSort ? 'button' : undefined}
      tabIndex={onSort ? 0 : undefined}
      onKeyDown={
        onSort
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSort(id);
              }
            }
          : undefined
      }
      className={`group relative pl-2 pr-3.5 ${HEAD_CELL} ${
        onSort ? 'cursor-pointer' : ''
      } ${
        isSorted
          ? 'text-blue-600 dark:text-blue-300'
          : onSort
            ? 'hover:text-gray-900 dark:hover:text-white'
            : ''
      }`}
    >
      <div className={`flex items-center gap-1 ${align === 'center' ? 'justify-center' : ''}`}>
        {draggable && (
          <span
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            role="button"
            tabIndex={0}
            aria-label={`Drag to reorder ${label}`}
            className="cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-600 opacity-30 group-hover:opacity-100 transition-opacity"
          >
            <GripVertical className="w-3 h-3" />
          </span>
        )}
        {note ? <Tooltip text={note}>{labelNode}</Tooltip> : labelNode}
        {onSort && (
          <span aria-hidden="true" className="shrink-0">
            {isSorted ? (
              sortDir === 'asc' ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )
            ) : (
              <ChevronsUpDown className="w-3 h-3 opacity-40 group-hover:opacity-80" />
            )}
          </span>
        )}
      </div>

      {onResizeStart && (
        <span
          onMouseDown={(e) => onResizeStart(id, width, e)}
          onClick={(e) => e.stopPropagation()}
          aria-hidden="true"
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40"
        />
      )}
    </th>
  );
}
