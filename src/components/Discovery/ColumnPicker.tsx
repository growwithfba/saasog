'use client';

import { useEffect, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { COLUMNS, DEFAULT_VISIBLE, type ColumnId } from './columns';

interface ColumnPickerProps {
  visible: ColumnId[];
  onChange: (ids: ColumnId[]) => void;
  wrapTitle: boolean;
  onWrapTitleChange: (on: boolean) => void;
}

export function ColumnPicker({ visible, onChange, wrapTitle, onWrapTitleChange }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
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

  const toggle = (id: ColumnId) => {
    onChange(visible.includes(id) ? visible.filter((c) => c !== id) : [...visible, id]);
  };

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
          {visible.length}/{COLUMNS.length}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[34rem] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-300 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700/70">
            <p className="text-base font-semibold text-slate-900 dark:text-white">Columns</p>
            <div className="flex items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => onChange(COLUMNS.map((c) => c.id))}
                className="text-blue-600 dark:text-blue-300 hover:underline underline-offset-2"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => onChange(DEFAULT_VISIBLE)}
                className="text-slate-500 dark:text-slate-400 hover:underline underline-offset-2"
              >
                Reset
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 dark:border-slate-700/70 cursor-pointer text-[15px] text-slate-800 dark:text-slate-200">
            <input
              type="checkbox"
              checked={wrapTitle}
              onChange={(e) => onWrapTitleChange(e.target.checked)}
              className="w-4 h-4 shrink-0 rounded border-slate-400 dark:border-slate-600 text-blue-600 focus:ring-blue-500/40"
            />
            <span>Wrap product title</span>
          </label>

          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 max-h-[22rem] overflow-y-auto">
            {COLUMNS.map((col) => (
              <label
                key={col.id}
                className="flex items-center gap-2.5 cursor-pointer text-[15px] text-slate-800 dark:text-slate-200 py-1"
              >
                <input
                  type="checkbox"
                  checked={visible.includes(col.id)}
                  onChange={() => toggle(col.id)}
                  className="w-4 h-4 shrink-0 rounded border-slate-400 dark:border-slate-600 text-blue-600 focus:ring-blue-500/40"
                />
                <span className="truncate">{col.label}</span>
              </label>
            ))}
          </div>

          <p className="px-4 py-3 border-t border-slate-200 dark:border-slate-700/70 text-sm text-slate-500 dark:text-slate-400">
            Product and Funnel always show. Your choice is remembered on this device.
          </p>
        </div>
      )}
    </div>
  );
}
