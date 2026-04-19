'use client';

import { Filter, X } from 'lucide-react';
import type { TagShape } from './TagChip';

export type BatchFilter = 'all' | 'researched' | 'vetted' | 'offered' | 'sourced';
export type StatusFilter = 'all' | 'PASS' | 'RISKY' | 'FAIL';

export interface FilterState {
  /** Tag IDs that must be present on each row (AND). */
  tagIds: string[];
  status: StatusFilter;
  batch: BatchFilter;
}

export function emptyFilters(): FilterState {
  return { tagIds: [], status: 'all', batch: 'all' };
}

export function hasActiveFilters(f: FilterState): boolean {
  return f.tagIds.length > 0 || f.status !== 'all' || f.batch !== 'all';
}

interface FilterBarProps {
  tags: TagShape[];
  filters: FilterState;
  onChange: (next: FilterState) => void;
  /** If true, hide the status filter (e.g., research page where submissions don't exist yet). */
  hideStatusFilter?: boolean;
}

const BATCH_OPTIONS: { value: BatchFilter; label: string }[] = [
  { value: 'all', label: 'All stages' },
  { value: 'researched', label: 'Researched only' },
  { value: 'vetted', label: 'Vetted' },
  { value: 'offered', label: 'Has offer' },
  { value: 'sourced', label: 'Sourced' },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string; tone: string }[] = [
  { value: 'all', label: 'All scores', tone: 'text-slate-200' },
  { value: 'PASS', label: 'PASS', tone: 'text-emerald-300' },
  { value: 'RISKY', label: 'RISKY', tone: 'text-amber-300' },
  { value: 'FAIL', label: 'FAIL', tone: 'text-red-300' },
];

export function FilterBar({ tags, filters, onChange, hideStatusFilter }: FilterBarProps) {
  const toggleTag = (id: string) => {
    const next = filters.tagIds.includes(id)
      ? filters.tagIds.filter((x) => x !== id)
      : [...filters.tagIds, id];
    onChange({ ...filters, tagIds: next });
  };

  const active = hasActiveFilters(filters);

  return (
    <div className="mb-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 mr-2">
          <Filter className="h-3.5 w-3.5" />
          Filters
        </div>

        {/* Batch (funnel stage) */}
        <select
          value={filters.batch}
          onChange={(e) => onChange({ ...filters, batch: e.target.value as BatchFilter })}
          className="rounded-md border border-slate-700/60 bg-slate-800/60 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500/60"
        >
          {BATCH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Status (vetting score) */}
        {!hideStatusFilter && (
          <select
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value as StatusFilter })}
            className="rounded-md border border-slate-700/60 bg-slate-800/60 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500/60"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {/* Tag pills — clickable, multi-select */}
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 ml-1">
            {tags.map((tag) => {
              const selected = filters.tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    selected
                      ? 'bg-blue-500/20 border-blue-400/60 text-blue-200'
                      : 'bg-slate-800/50 border-slate-600/60 text-slate-300 hover:bg-slate-700/60'
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}

        {active && (
          <button
            type="button"
            onClick={() => onChange(emptyFilters())}
            className="ml-auto inline-flex items-center gap-1 rounded-md bg-slate-800/60 hover:bg-slate-700/60 px-2.5 py-1.5 text-xs text-slate-300 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Apply a FilterState to an array of rows. Each row is assumed to carry
 * - tags: TagShape[]
 * - is_vetted / is_offered / is_sourced booleans (from research_products)
 * - status: PASS | RISKY | FAIL (from a linked submission, if present)
 */
export function applyFilters<T extends {
  tags?: TagShape[];
  is_vetted?: boolean;
  is_offered?: boolean;
  is_sourced?: boolean;
  status?: string | null;
}>(rows: T[], filters: FilterState): T[] {
  return rows.filter((row) => {
    if (filters.tagIds.length > 0) {
      const rowIds = new Set((row.tags || []).map((t) => t.id));
      for (const id of filters.tagIds) if (!rowIds.has(id)) return false;
    }
    if (filters.status !== 'all') {
      if ((row.status || '').toUpperCase() !== filters.status) return false;
    }
    if (filters.batch !== 'all') {
      switch (filters.batch) {
        case 'researched':
          if (row.is_vetted || row.is_offered || row.is_sourced) return false;
          break;
        case 'vetted':
          if (!row.is_vetted) return false;
          break;
        case 'offered':
          if (!row.is_offered) return false;
          break;
        case 'sourced':
          if (!row.is_sourced) return false;
          break;
      }
    }
    return true;
  });
}
