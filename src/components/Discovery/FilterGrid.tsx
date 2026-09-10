'use client';

import { ChevronUp, Search } from 'lucide-react';
import { FILTER_DEFS } from '@/lib/discovery/filterSchema';
import type { DiscoveryFilters, FilterGroup, RangeValue } from '@/lib/discovery/types';
import type { DerivedFilterInput } from '@/lib/discovery/derivedFilters';
import { PRESETS } from '@/lib/discovery/presets';
import { CategoryPicker } from './CategoryPicker';
import { FilterLabel } from './FilterLabel';
import { SizeTierPicker } from './SizeTierPicker';
import { FulfillmentPicker } from './FulfillmentPicker';
import { ALL_FULFILLMENT, type FulfillmentChannel } from '@/lib/discovery/types';

interface FilterGridProps {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
  derived: DerivedFilterInput;
  onDerivedChange: (derived: DerivedFilterInput) => void;
  onSearch: () => void;
  searching: boolean;
  onApplyPreset: (filters: DiscoveryFilters, derived: DerivedFilterInput) => void;
  /** Collapses the grid back to the summary bar. Mirrors the bar's Edit. */
  onCollapse: () => void;
}

const GROUPS: { key: FilterGroup; title: string }[] = [
  { key: 'product', title: 'Product' },
  { key: 'listing', title: 'Listing & Shipping' },
  { key: 'competitors', title: 'Competitors' },
  { key: 'sales', title: 'Sales' },
];

/**
 * Column assignment. Product has far more filters than Competitors, so grouping
 * strictly one-group-per-column left the middle column empty two thirds of the
 * way down. Stacking the two short groups in one column evens the three out.
 */
const COLUMNS: FilterGroup[][] = [['product'], ['listing', 'competitors'], ['sales']];

/** Matches the form scale used across the rest of the app (px-4 py-3, 15px). */
const INPUT_CLASS =
  'w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700/50 bg-white dark:bg-slate-900/50 text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-colors';

/**
 * Chrome will happily offer a saved phone number for a field called "Min".
 * autoComplete alone is unreliable, so every field also gets a unique,
 * non-semantic name plus the opt-outs the common password managers respect.
 */
const NO_AUTOFILL = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-form-type': 'other',
} as const;

/**
 * Keys that `type="number"` still permits but that cannot start a valid figure
 * here: scientific notation and a leading plus. Minus is allowed only where a
 * field's own bounds go negative (percentage changes).
 */
function blockInvalidNumberKeys(allowNegative: boolean) {
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    const banned = allowNegative ? ['e', 'E', '+'] : ['e', 'E', '+', '-'];
    if (banned.includes(e.key)) e.preventDefault();
  };
}

/** Hold a typed value inside the field's own bounds. */
function clampToBounds(raw: string, min?: number, max?: number): string {
  if (raw === '') return '';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '';
  if (min !== undefined && n < min) return String(min);
  if (max !== undefined && n > max) return String(max);
  return raw;
}

const LABEL_CLASS =
  'flex text-[15px] font-medium text-slate-700 dark:text-slate-300 mb-1.5';

/** Keys in DerivedFilterInput that hold a min/max pair, keyed by display label. */
const DERIVED_RANGES: { minKey: keyof DerivedFilterInput; maxKey: keyof DerivedFilterInput; label: string; group: FilterGroup }[] = [
  { minKey: 'revenueMin', maxKey: 'revenueMax', label: 'Parent Revenue ($)', group: 'sales' },
  { minKey: 'asinRevenueMin', maxKey: 'asinRevenueMax', label: 'ASIN Revenue ($)', group: 'sales' },
  { minKey: 'parentUnitsMin', maxKey: 'parentUnitsMax', label: 'Parent Sales (units)', group: 'sales' },
  { minKey: 'salesToReviewsMin', maxKey: 'salesToReviewsMax', label: 'Sales to Reviews Ratio', group: 'sales' },
];

/** Keys in DerivedFilterInput that hold a comma-separated string list. */
const DERIVED_LISTS: { key: keyof DerivedFilterInput; label: string; group: FilterGroup }[] = [
  { key: 'excludeBrands', label: 'Exclude Brands', group: 'competitors' },
  { key: 'excludeTitleKeywords', label: 'Exclude Title Keywords', group: 'product' },
];

/** Input step per derived range: money in hundreds, ratios fractional, units whole. */
const derivedStep = (key: string) =>
  key.toLowerCase().includes('revenue') ? 100 : key.toLowerCase().includes('reviews') ? 0.1 : 1;

export function FilterGrid({ filters, onChange, derived, onDerivedChange, onSearch, searching, onApplyPreset, onCollapse }: FilterGridProps) {
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

  // Searching every category at once returns tens of thousands of products and
  // costs a full query to learn nothing useful, so a category is required.
  const hasCategory = Array.isArray(filters.category) && filters.category.length > 0;

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
        {/* Collapsing was previously only reachable by running a search, so a
            user who reopened the grid had no way back to the summary bar. */}
        <button
          type="button"
          onClick={onCollapse}
          className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
        >
          <ChevronUp className="w-4 h-4" />
          Hide filters
        </button>
      </div>

      {/* Category is the filter almost every search starts from, so it gets the
          full width of the panel rather than being squeezed into one column. */}
      <div className="mb-8 pb-8 border-b border-slate-200 dark:border-slate-700/50">
        <label className="block text-base font-semibold text-slate-900 dark:text-white mb-2">
          Category &amp; Subcategory
        </label>
        <CategoryPicker
          selected={(filters.category as string[]) ?? []}
          onChange={(ids) => setValue('category', ids.length ? ids : undefined)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-10">
        {COLUMNS.map((groupKeys, colIndex) => (
          <div key={colIndex} className="space-y-10">
            {groupKeys.map((groupKey) => {
              const group = GROUPS.find((g) => g.key === groupKey)!;
              return (
          <div key={group.key}>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-5 pb-2 border-b border-slate-200 dark:border-slate-700/50">{group.title}</h3>
            <div className="space-y-5">
              {FILTER_DEFS.filter((f) => f.group === group.key && f.kind !== 'category').map((def) => (
                <div key={def.id}>
                  <FilterLabel label={def.label} note={def.note} className={LABEL_CLASS} />

                  {def.kind === 'range' && (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        name={`discovery-${def.id}-min`}
                        {...NO_AUTOFILL}
                        min={def.inputMin}
                        max={def.inputMax}
                        step={def.step ?? 1}
                        onKeyDown={blockInvalidNumberKeys((def.inputMin ?? 0) < 0)}
                        placeholder="Min"
                        aria-label={`${def.label} minimum`}
                        value={(filters[def.id] as RangeValue | undefined)?.min ?? ''}
                        onChange={(e) =>
                          setBound(def.id, 'min', clampToBounds(e.target.value, def.inputMin, def.inputMax))
                        }
                        className={INPUT_CLASS}
                      />
                      <input
                        type="number"
                        inputMode="decimal"
                        name={`discovery-${def.id}-max`}
                        {...NO_AUTOFILL}
                        min={def.inputMin}
                        max={def.inputMax}
                        step={def.step ?? 1}
                        onKeyDown={blockInvalidNumberKeys((def.inputMin ?? 0) < 0)}
                        placeholder="Max"
                        aria-label={`${def.label} maximum`}
                        value={(filters[def.id] as RangeValue | undefined)?.max ?? ''}
                        onChange={(e) =>
                          setBound(def.id, 'max', clampToBounds(e.target.value, def.inputMin, def.inputMax))
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                  )}

                  {def.kind === 'text' && (
                    <input
                      type="text"
                      name={`discovery-${def.id}`}
                      {...NO_AUTOFILL}
                      placeholder="Ex: bead loom"
                      value={(filters[def.id] as string) ?? ''}
                      onChange={(e) => setValue(def.id, e.target.value || undefined)}
                      className={INPUT_CLASS}
                    />
                  )}

                  {def.kind === 'textList' && (
                    <input
                      type="text"
                      name={`discovery-${def.id}`}
                      {...NO_AUTOFILL}
                      placeholder="Comma separated"
                      value={((filters[def.id] as string[]) ?? []).join(', ')}
                      onChange={(e) => {
                        const list = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                        setValue(def.id, list.length ? list : undefined);
                      }}
                      className={INPUT_CLASS}
                    />
                  )}

                  {def.kind === 'fulfillment' && (
                    <FulfillmentPicker
                      selected={(filters[def.id] as FulfillmentChannel[]) ?? ALL_FULFILLMENT}
                      onChange={(next) =>
                        setValue(
                          def.id,
                          next.length === ALL_FULFILLMENT.length ? undefined : (next as unknown as string[]),
                        )
                      }
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

              {group.key === 'listing' && (
                <div>
                  <FilterLabel
                    label="Shipping Size"
                    note="Amazon's size tier, which sets the fulfilment fee. Calculated from each product's dimensions and weight, so this narrows the rows already loaded rather than the search itself."
                    className={LABEL_CLASS}
                  />
                  <SizeTierPicker
                    selected={derived.sizeTiers ?? []}
                    onChange={(tiers) =>
                      onDerivedChange(
                        tiers.length === 0
                          ? (() => {
                              const next = { ...derived };
                              delete next.sizeTiers;
                              return next;
                            })()
                          : { ...derived, sizeTiers: tiers },
                      )
                    }
                    className={INPUT_CLASS}
                  />
                </div>
              )}

              {DERIVED_RANGES.filter((r) => r.group === group.key).map((r) => (
                <div key={r.minKey}>
                  <FilterLabel
                    label={r.label}
                    note="Calculated from the rows already loaded on this page, so this narrows what you see rather than the search itself."
                    className={LABEL_CLASS}
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      name={`discovery-${String(r.minKey)}`}
                      {...NO_AUTOFILL}
                      min={0}
                      step={derivedStep(String(r.minKey))}
                      onKeyDown={blockInvalidNumberKeys(false)}
                      placeholder="Min"
                      aria-label={`${r.label} minimum`}
                      value={(derived[r.minKey] as number | undefined) ?? ''}
                      onChange={(e) => setDerivedBound(r.minKey, clampToBounds(e.target.value, 0))}
                      className={INPUT_CLASS}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      name={`discovery-${String(r.maxKey)}`}
                      {...NO_AUTOFILL}
                      min={0}
                      step={derivedStep(String(r.maxKey))}
                      onKeyDown={blockInvalidNumberKeys(false)}
                      placeholder="Max"
                      aria-label={`${r.label} maximum`}
                      value={(derived[r.maxKey] as number | undefined) ?? ''}
                      onChange={(e) => setDerivedBound(r.maxKey, clampToBounds(e.target.value, 0))}
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
              ))}

              {DERIVED_LISTS.filter((l) => l.group === group.key).map((l) => (
                <div key={l.key}>
                  <FilterLabel
                    label={l.label}
                    note="Applied to the rows already loaded on this page, so this narrows what you see rather than the search itself."
                    className={LABEL_CLASS}
                  />
                  <input
                    type="text"
                    placeholder="Comma separated"
                    aria-label={l.label}
                    value={((derived[l.key] as string[] | undefined) ?? []).join(', ')}
                    onChange={(e) => setDerivedList(l.key, e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              ))}
            </div>
          </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3 mt-6">
        {!hasCategory && (
          <p className="text-sm text-amber-700 dark:text-amber-300 mr-auto">
            Choose a category to search. Every category at once returns tens of thousands of
            products and won&rsquo;t tell you anything useful.
          </p>
        )}
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
          disabled={searching || !hasCategory}
          title={hasCategory ? undefined : 'Choose at least one category first'}
          className="flex items-center gap-2 px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold"
        >
          <Search className="w-4 h-4" />
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
    </div>
  );
}
