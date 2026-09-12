'use client';

import { Hash, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { keywordFrequency } from '@/lib/discovery/keywords';
import type { HydratedRow } from '@/lib/discovery/types';
import { field, secondaryButton } from '@/components/ui/surfaces';

/** Chips shown before the "Show N more" reveal. Matches the Lens drawer. */
const INITIAL_CHIPS = 24;

interface KeywordPanelProps {
  /** Rows the frequency is measured over — after the grid and chip filters. */
  rows: HydratedRow[];
  /** How many rows survive once the keyword picks are applied. */
  matchedCount: number;
  included: string[];
  excluded: string[];
  onChange: (next: { included: string[]; excluded: string[] }) => void;
}

/**
 * Keyword frequency over the loaded titles, as an include/exclude picker.
 *
 * Clicking a chip includes that word; the X on an included chip demotes it to
 * the excluded list beneath. That gives one control two directions without a
 * mode switch, which is what makes sifting a market fast — you keep what looks
 * promising and push away what doesn't, from the same row of chips.
 */
export function KeywordPanel({
  rows,
  matchedCount,
  included,
  excluded,
  onChange,
}: KeywordPanelProps) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState('');
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

  // Frequency is measured over the unfiltered rows on purpose. Recomputing it
  // against the narrowed set would make every chip's count collapse the moment
  // one was picked, and the remaining counts would no longer describe the
  // market the user is looking at.
  const frequency = useMemo(() => keywordFrequency(rows), [rows]);

  const chosen = new Set([...included, ...excluded]);
  const needle = filter.trim().toLowerCase();
  const available = frequency.filter(
    (f) => !chosen.has(f.word) && (needle === '' || f.word.includes(needle)),
  );
  const shown = showAll ? available : available.slice(0, INITIAL_CHIPS);
  const activeCount = included.length + excluded.length;

  const include = (word: string) =>
    onChange({ included: [...included, word], excluded: excluded.filter((w) => w !== word) });

  const exclude = (word: string) =>
    onChange({ included: included.filter((w) => w !== word), excluded: [...excluded, word] });

  const clear = (word: string) =>
    onChange({
      included: included.filter((w) => w !== word),
      excluded: excluded.filter((w) => w !== word),
    });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={secondaryButton('research', 'sm')}
      >
        <Hash className="w-4 h-4" />
        Keywords
        {activeCount > 0 && (
          <span className="px-1.5 rounded-full bg-blue-600 text-white text-xs">{activeCount}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[34rem] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-gray-200 dark:border-slate-800">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
              Keyword Frequency
            </span>
            <span className="text-xs text-gray-400 dark:text-slate-500">
              {frequency.length.toLocaleString('en-US')} unique
            </span>
          </div>

          {/* A busy market yields well over a thousand distinct words, so the
              chip list alone is not a way to find a specific one. */}
          <div className="px-4 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
              <input
                type="search"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setShowAll(false);
                }}
                placeholder="Find a keyword…"
                aria-label="Find a keyword"
                className={`${field('research', 'sm')} pl-8`}
              />
            </div>
          </div>

          <div className="px-4 py-3 max-h-72 overflow-y-auto">
            {included.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {included.map((word) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-[13px] font-medium bg-blue-600 text-white ring-2 ring-blue-400/40"
                  >
                    {word}
                    <button
                      type="button"
                      onClick={() => clear(word)}
                      title={`Stop filtering to "${word}"`}
                      aria-label={`Stop filtering to ${word}`}
                      className="grid place-items-center w-4 h-4 rounded-full hover:bg-blue-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {shown.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-slate-400 py-2">
                  {needle
                    ? `No keyword matches “${filter.trim()}”.`
                    : 'No keywords left to pick from.'}
                </p>
              ) : (
                shown.map(({ word, count }) => (
                  // A span wrapping two buttons, not a button with a button
                  // inside it: the word includes, the X excludes, and nested
                  // buttons are invalid HTML.
                  <span
                    key={word}
                    className="group inline-flex items-center rounded-full text-[13px] font-medium bg-slate-100 dark:bg-slate-800/80 border border-transparent dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => include(word)}
                      title={`Show only listings with "${word}"`}
                      className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-l-full hover:text-gray-900 dark:hover:text-white"
                    >
                      {word}
                      <span className="text-gray-400 dark:text-slate-500">{count}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => exclude(word)}
                      title={`Exclude listings with "${word}"`}
                      aria-label={`Exclude listings with ${word}`}
                      className="grid place-items-center w-5 h-5 mr-1.5 rounded-full text-gray-400 dark:text-slate-500 opacity-50 group-hover:opacity-100 hover:bg-amber-500/20 hover:text-amber-600 dark:hover:text-amber-400 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {!showAll && available.length > INITIAL_CHIPS && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Show {(available.length - INITIAL_CHIPS).toLocaleString('en-US')} more
              </button>
            )}
          </div>

          {excluded.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-800">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Excluded
              </span>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {excluded.map((word) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-[13px] font-medium bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:text-amber-300 line-through"
                  >
                    {word}
                    <button
                      type="button"
                      onClick={() => clear(word)}
                      title={`Stop excluding "${word}"`}
                      aria-label={`Stop excluding ${word}`}
                      className="grid place-items-center w-4 h-4 rounded-full no-underline hover:bg-amber-500/20"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-gray-200 dark:border-slate-800">
            <span className="text-sm text-gray-600 dark:text-slate-400">
              <span className="font-semibold text-gray-900 dark:text-white">
                {matchedCount.toLocaleString('en-US')}
              </span>{' '}
              of {rows.length.toLocaleString('en-US')} listings
            </span>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => onChange({ included: [], excluded: [] })}
                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear keywords
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
