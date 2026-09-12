'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Settings2 } from 'lucide-react';

export interface PickerColumn {
  id: string;
  label: string;
  /** Optional section heading; columns without one come first. */
  group?: string;
}

interface ColumnPickerProps {
  columns: PickerColumn[];
  visible: string[];
  onChange: (ids: string[]) => void;
  /** What Reset returns to. */
  defaults: string[];
  /** Extra toggles rendered above the column grid (e.g. "Wrap product title"). */
  children?: ReactNode;
  /** Footer note, e.g. which columns always show. */
  footnote?: string;
}

/**
 * The Columns button and its panel, shared by every table. A search box
 * appears once the list is long enough to need one.
 */
export function ColumnPicker({ columns, visible, onChange, defaults, children, footnote }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (id: string) => {
    onChange(visible.includes(id) ? visible.filter((c) => c !== id) : [...visible, id]);
  };

  const showSearch = columns.length > 12;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? columns.filter((c) => c.label.toLowerCase().includes(q)) : columns;
  }, [columns, query]);

  const groups = useMemo(() => {
    const map = new Map<string | undefined, PickerColumn[]>();
    for (const c of filtered) {
      const list = map.get(c.group) ?? [];
      list.push(c);
      map.set(c.group, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const checkbox = 'w-4 h-4 shrink-0 rounded border-slate-400 dark:border-slate-600 text-blue-600 focus:ring-blue-500/40';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 text-sm font-medium text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 transition-colors"
      >
        <Settings2 className="w-4 h-4" />
        Columns
        <span className="text-slate-400 dark:text-slate-500">
          {visible.length}/{columns.length}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[34rem] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-300 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700/70">
            <p className="text-base font-semibold text-slate-900 dark:text-white">Columns</p>
            <div className="flex items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => onChange(columns.map((c) => c.id))}
                className="text-blue-600 dark:text-blue-300 hover:underline underline-offset-2"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => onChange(defaults)}
                className="text-slate-500 dark:text-slate-400 hover:underline underline-offset-2"
              >
                Reset
              </button>
            </div>
          </div>

          {children && (
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700/70 text-[15px] text-slate-800 dark:text-slate-200">
              {children}
            </div>
          )}

          {showSearch && (
            <div className="px-4 pt-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search columns"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 px-3 py-1.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
              />
            </div>
          )}

          <div className="p-4 max-h-[22rem] overflow-y-auto space-y-4">
            {groups.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">No matching columns.</p>
            )}
            {groups.map(([group, cols]) => (
              <div key={group ?? '__ungrouped'}>
                {group && (
                  <p className="mb-2 text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-500">
                    {group}
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
                  {cols.map((col) => (
                    <label
                      key={col.id}
                      className="flex items-center gap-2.5 cursor-pointer text-[15px] text-slate-800 dark:text-slate-200 py-1"
                    >
                      <input
                        type="checkbox"
                        checked={visible.includes(col.id)}
                        onChange={() => toggle(col.id)}
                        className={checkbox}
                      />
                      <span className="truncate">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {footnote && (
            <p className="px-4 py-3 border-t border-slate-200 dark:border-slate-700/70 text-sm text-slate-500 dark:text-slate-400">
              {footnote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
