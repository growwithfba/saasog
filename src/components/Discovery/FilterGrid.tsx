'use client';

import { Search } from 'lucide-react';
import { FILTER_DEFS } from '@/lib/discovery/filterSchema';
import type { DiscoveryFilters, FilterGroup, RangeValue } from '@/lib/discovery/types';
import type { DerivedFilterInput } from '@/lib/discovery/derivedFilters';
import { PRESETS } from '@/lib/discovery/presets';
import { CategoryPicker } from './CategoryPicker';

interface FilterGridProps {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
  derived: DerivedFilterInput;
  onDerivedChange: (derived: DerivedFilterInput) => void;
  onSearch: () => void;
  searching: boolean;
  onApplyPreset: (filters: DiscoveryFilters, derived: DerivedFilterInput) => void;
}

const GROUPS: { key: FilterGroup; title: string }[] = [
  { key: 'product', title: 'Product' },
  { key: 'competitors', title: 'Competitors' },
  { key: 'sales', title: 'Sales' },
];

/** Keys in DerivedFilterInput that hold a min/max pair, keyed by display label. */
const DERIVED_RANGES: { minKey: keyof DerivedFilterInput; maxKey: keyof DerivedFilterInput; label: string; group: FilterGroup }[] = [
  { minKey: 'revenueMin', maxKey: 'revenueMax', label: 'Monthly Revenue ($)', group: 'sales' },
  { minKey: 'salesToReviewsMin', maxKey: 'salesToReviewsMax', label: 'Sales to Reviews Ratio', group: 'sales' },
];

/** Keys in DerivedFilterInput that hold a comma-separated string list. */
const DERIVED_LISTS: { key: keyof DerivedFilterInput; label: string; group: FilterGroup }[] = [
  { key: 'excludeBrands', label: 'Exclude Brands', group: 'competitors' },
  { key: 'excludeTitleKeywords', label: 'Exclude Title Keywords', group: 'product' },
];

export function FilterGrid({ filters, onChange, derived, onDerivedChange, onSearch, searching, onApplyPreset }: FilterGridProps) {
  const setValue = (id: string, value: DiscoveryFilters[string] | undefined) => {
    const next = { ...filters };
    if (value === undefined) delete next[id];
    else next[id] = value;
    onChange(next);
  };

  const setBound = (id: string, bound: 'min' | 'max', raw: string) => {
    const existing = (filters[id] as RangeValue | undefined) ?? {};
    const next: RangeValue = { ...existing };
    if (raw === '') delete next[bound];
    else next[bound] = Number(raw);
    setValue(id, Object.keys(next).length ? next : undefined);
  };

  const setDerivedBound = (key: keyof DerivedFilterInput, raw: string) => {
    const next = { ...derived };
    if (raw === '') delete next[key];
    else next[key] = Number(raw) as never;
    onDerivedChange(next);
  };

  const setDerivedList = (key: keyof DerivedFilterInput, raw: string) => {
    const next = { ...derived };
    const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) delete next[key];
    else next[key] = list as never;
    onDerivedChange(next);
  };

  return (
    <div className="bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 rounded-2xl p-6">
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-sm text-gray-600 dark:text-slate-400">Start from a proven setup:</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            title={preset.description}
            onClick={() => onApplyPreset(preset.filters, preset.derived ?? {})}
            className="px-3 py-1 rounded-full border border-blue-500/50 dark:border-blue-400/50 text-blue-600 dark:text-blue-300 text-xs font-medium hover:bg-blue-500/10 dark:hover:bg-blue-400/10"
          >
            {preset.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {GROUPS.map((group) => (
          <div key={group.key}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{group.title}</h3>
            <div className="space-y-4">
              {group.key === 'product' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Category &amp; Subcategory
                  </label>
                  <CategoryPicker
                    selected={(filters.category as string[]) ?? []}
                    onChange={(ids) => setValue('category', ids.length ? ids : undefined)}
                  />
                </div>
              )}
              {FILTER_DEFS.filter((f) => f.group === group.key && f.kind !== 'category').map((def) => (
                <div key={def.id}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    {def.label}
                  </label>

                  {def.kind === 'range' && (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Min"
                        aria-label={`${def.label} minimum`}
                        value={(filters[def.id] as RangeValue | undefined)?.min ?? ''}
                        onChange={(e) => setBound(def.id, 'min', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        aria-label={`${def.label} maximum`}
                        value={(filters[def.id] as RangeValue | undefined)?.max ?? ''}
                        onChange={(e) => setBound(def.id, 'max', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
                      />
                    </div>
                  )}

                  {def.kind === 'text' && (
                    <input
                      type="text"
                      placeholder="Ex: bead loom"
                      value={(filters[def.id] as string) ?? ''}
                      onChange={(e) => setValue(def.id, e.target.value || undefined)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
                    />
                  )}

                  {def.kind === 'textList' && (
                    <input
                      type="text"
                      placeholder="Comma separated"
                      value={((filters[def.id] as string[]) ?? []).join(', ')}
                      onChange={(e) => {
                        const list = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                        setValue(def.id, list.length ? list : undefined);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
                    />
                  )}

                  {def.kind === 'boolean' && (
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={filters[def.id] === true}
                        onChange={(e) => setValue(def.id, e.target.checked ? true : undefined)}
                      />
                      <span>Only show {def.label}</span>
                    </label>
                  )}
                </div>
              ))}

              {DERIVED_RANGES.filter((r) => r.group === group.key).map((r) => (
                <div key={r.minKey}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    {r.label}
                    <span
                      className="ml-1 text-xs text-gray-400 dark:text-slate-500"
                      title="Calculated from the rows already loaded on this page, so this narrows what you see rather than the search itself."
                    >
                      ⓘ
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      aria-label={`${r.label} minimum`}
                      value={(derived[r.minKey] as number | undefined) ?? ''}
                      onChange={(e) => setDerivedBound(r.minKey, e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      aria-label={`${r.label} maximum`}
                      value={(derived[r.maxKey] as number | undefined) ?? ''}
                      onChange={(e) => setDerivedBound(r.maxKey, e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              ))}

              {DERIVED_LISTS.filter((l) => l.group === group.key).map((l) => (
                <div key={l.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    {l.label}
                    <span
                      className="ml-1 text-xs text-gray-400 dark:text-slate-500"
                      title="Applied to the rows already loaded on this page, so this narrows what you see rather than the search itself."
                    >
                      ⓘ
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder="Comma separated"
                    aria-label={l.label}
                    value={((derived[l.key] as string[] | undefined) ?? []).join(', ')}
                    onChange={(e) => setDerivedList(l.key, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={() => {
            onChange({});
            onDerivedChange({});
          }}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-sm font-medium text-gray-700 dark:text-slate-300"
        >
          Clear
        </button>
        <button
          onClick={onSearch}
          disabled={searching}
          className="flex items-center gap-2 px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold"
        >
          <Search className="w-4 h-4" />
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
    </div>
  );
}
