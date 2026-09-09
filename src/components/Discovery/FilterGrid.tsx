'use client';

import { Search } from 'lucide-react';
import { FILTER_DEFS } from '@/lib/discovery/filterSchema';
import type { DiscoveryFilters, FilterGroup, RangeValue } from '@/lib/discovery/types';

interface FilterGridProps {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
  onSearch: () => void;
  searching: boolean;
}

const GROUPS: { key: FilterGroup; title: string }[] = [
  { key: 'product', title: 'Product' },
  { key: 'competitors', title: 'Competitors' },
  { key: 'sales', title: 'Sales' },
];

export function FilterGrid({ filters, onChange, onSearch, searching }: FilterGridProps) {
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

  return (
    <div className="bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 rounded-2xl p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {GROUPS.map((group) => (
          <div key={group.key}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{group.title}</h3>
            <div className="space-y-4">
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
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={() => onChange({})}
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
