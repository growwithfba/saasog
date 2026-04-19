'use client';

import { X } from 'lucide-react';

export interface TagShape {
  id: string;
  name: string;
  color?: string | null;
}

interface TagChipProps {
  tag: TagShape;
  onRemove?: () => void;
  onClick?: () => void;
  selected?: boolean;
  size?: 'xs' | 'sm';
}

/**
 * Small pill representing a tag. Used on table rows (no remove button)
 * and in the filter bar / tag picker (may be clickable / removable).
 */
export function TagChip({ tag, onRemove, onClick, selected, size = 'xs' }: TagChipProps) {
  const base =
    size === 'sm'
      ? 'px-2.5 py-1 text-xs'
      : 'px-2 py-0.5 text-[11px]';
  const interactive = Boolean(onClick);
  const cls = [
    'inline-flex items-center gap-1 rounded-full border font-medium transition-colors',
    base,
    selected
      ? 'bg-blue-500/20 border-blue-400/50 text-blue-200'
      : 'bg-slate-700/40 border-slate-600/60 text-slate-200 hover:bg-slate-700/60',
    interactive ? 'cursor-pointer' : '',
  ].join(' ');

  const content = (
    <>
      <span className="truncate max-w-[140px]">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 p-0.5 rounded-full hover:bg-slate-600/50 transition-colors"
          aria-label={`Remove tag ${tag.name}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {content}
      </button>
    );
  }
  return <span className={cls}>{content}</span>;
}
