'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
import { POPOVER, field, secondaryButton, type SurfacePhase } from '@/components/ui/surfaces';

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
  /** Hue for the trigger and search field. Defaults to research (blue). */
  phase?: SurfacePhase;
}

/**
 * The Columns button and its panel, shared by every table. A search box
 * appears once the list is long enough to need one.
 */
export function ColumnPicker({ columns, visible, onChange, defaults, children, footnote, phase = 'research' }: ColumnPickerProps) {
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
        className={secondaryButton(phase, 'sm')}
      >
        <Settings2 className="w-4 h-4" />
        Columns
        <span className="text-slate-400 dark:text-slate-500">
          {visible.length}/{columns.length}
        </span>
      </button>

      {/* z-50: the table's sticky header cells sit at z-30 and come later in
          the DOM, so anything lower gets painted over by them. */}
      {open && (
        <div className={`absolute right-0 z-50 mt-2 w-[34rem] max-w-[calc(100vw-2rem)] ${POPOVER}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-sky-400/15">
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
            <div className="px-4 py-3 border-b border-slate-200 dark:border-sky-400/15 text-[15px] text-slate-800 dark:text-slate-200">
              {children}
            </div>
          )}

          {showSearch && (
            <div className="px-4 pt-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search columns"
                className={field(phase, 'sm')}
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
            <p className="px-4 py-3 border-t border-slate-200 dark:border-sky-400/15 text-sm text-slate-500 dark:text-slate-400">
              {footnote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
