'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SIZE_TIERS } from '@/lib/discovery/derivedFilters';
import { POPOVER } from '@/components/ui/surfaces';

interface SizeTierPickerProps {
  selected: string[];
  onChange: (tiers: string[]) => void;
  className: string;
}

/**
 * Multi-select for Amazon's size tiers.
 *
 * Unlike the other filters this one narrows the loaded rows rather than the
 * search, because the provider has no size-tier field to query — see
 * `DerivedFilterInput.sizeTiers`.
 */
export function SizeTierPicker({ selected, onChange, className }: SizeTierPickerProps) {
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

  const toggle = (tier: string) =>
    onChange(selected.includes(tier) ? selected.filter((t) => t !== tier) : [...selected, tier]);

  const summary =
    selected.length === 0
      ? 'None selected'
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`${className} flex items-center justify-between text-left`}
      >
        <span className={selected.length === 0 ? 'text-slate-400 dark:text-slate-500' : ''}>
          {summary}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute left-0 right-0 z-30 mt-1 py-1 ${POPOVER}`}
        >
          {SIZE_TIERS.map((tier) => {
            const on = selected.includes(tier);
            return (
              <button
                key={tier}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(tier)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span
                  aria-hidden="true"
                  className={`grid place-items-center w-4 h-4 rounded border transition-colors ${
                    on
                      ? 'bg-cyan-500 border-cyan-500 text-white'
                      : 'border-slate-400 dark:border-slate-600'
                  }`}
                >
                  {on && <Check className="w-3 h-3" strokeWidth={3} />}
                </span>
                {tier}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
