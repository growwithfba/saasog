'use client';

import { Checkbox } from '@/components/ui/Checkbox';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ALL_FULFILLMENT, type FulfillmentChannel } from '@/lib/discovery/types';

interface FulfillmentPickerProps {
  selected: FulfillmentChannel[];
  onChange: (next: FulfillmentChannel[]) => void;
}

const LABELS: Record<FulfillmentChannel, string> = {
  FBA: 'FBA — Fulfilled by Amazon',
  FBM: 'FBM — Fulfilled by merchant',
  AMZ: 'AMZ — Sold by Amazon',
};

export function FulfillmentPicker({ selected, onChange }: FulfillmentPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = selected.length === 0 ? ALL_FULFILLMENT : selected;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (c: FulfillmentChannel) => {
    const next = active.includes(c) ? active.filter((x) => x !== c) : [...active, c];
    // Deselecting everything would match nothing, so treat it as "all".
    onChange(next.length === 0 ? ALL_FULFILLMENT : next);
  };

  const summary =
    active.length === ALL_FULFILLMENT.length ? 'All' : active.join(', ');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 text-left text-[15px] text-slate-900 dark:text-white hover:border-slate-400 dark:hover:border-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
      >
        <span>{summary}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full rounded-lg border border-slate-300 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-2xl p-2">
          {ALL_FULFILLMENT.map((c) => (
            <label
              key={c}
              className="flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/70 text-[15px] text-slate-800 dark:text-slate-200"
            >
              <Checkbox
                checked={active.includes(c)}
                onChange={() => toggle(c)}
                className="shrink-0"
              />
              <span>{LABELS[c]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
