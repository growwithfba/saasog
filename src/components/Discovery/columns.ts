import type { HydratedRow } from '@/lib/discovery/types';

export type ColumnId =
  | 'bsr'
  | 'price'
  | 'monthlySales'
  | 'monthlyRevenue'
  | 'reviews'
  | 'rating'
  | 'lqs'
  | 'brand'
  | 'sizeTier'
  | 'weightLb'
  | 'dimensions'
  | 'listingAge'
  | 'variationCount'
  | 'imageCount'
  | 'salesToReviews';

export interface ColumnDef {
  id: ColumnId;
  label: string;
  /**
   * The filter id to sort by, when the provider can sort this column itself.
   * Omitted for calculated columns — those can only be ordered within the
   * rows already loaded, so offering a header click would imply the whole
   * result set had been re-sorted when it hadn't.
   */
  sortFilterId?: string;
  /** Shown on the ⓘ marker for calculated columns. */
  note?: string;
  align?: 'right';
  value: (row: HydratedRow) => number | string | null;
  /** How to render it. Numbers stay right-aligned and comparable down a column. */
  format: 'number' | 'money0' | 'money2' | 'decimal1' | 'decimal2' | 'text';
}

const SORTS_IN_PAGE = 'Calculated, so it sorts within the loaded page only.';

/**
 * Every column Discovery can show, in display order.
 *
 * Only columns backed by data we already pay for appear here. Deliberately
 * absent, because the provider does not expose them: the frequently-returned
 * badge, seller name and seller country. Storage fee and best sales period
 * would need Amazon's fee schedule and month-level history respectively —
 * neither is derivable from what a row currently costs.
 */
export const COLUMNS: ColumnDef[] = [
  { id: 'bsr', label: 'Category BSR', sortFilterId: 'bsr', value: (r) => r.bsr, format: 'number', align: 'right' },
  { id: 'price', label: 'Price', sortFilterId: 'price', value: (r) => r.price, format: 'money2', align: 'right' },
  {
    id: 'monthlySales', label: 'Monthly Sales', note: 'Units per month for the whole product, from the sales-rank curve. ' + SORTS_IN_PAGE,
    value: (r) => r.parentUnits ?? r.monthlyUnits, format: 'number', align: 'right',
  },
  {
    id: 'monthlyRevenue', label: 'Monthly Revenue', note: 'Monthly sales × 30-day average price, for the whole product. ' + SORTS_IN_PAGE,
    value: (r) => r.parentRevenue ?? r.monthlyRevenue, format: 'money0', align: 'right',
  },
  { id: 'reviews', label: 'Reviews', sortFilterId: 'reviewCount', note: 'Reviews on this listing. Amazon shows a variation family’s pooled total, which is usually higher.', value: (r) => r.reviews, format: 'number', align: 'right' },
  { id: 'rating', label: 'Rating', sortFilterId: 'rating', value: (r) => r.rating, format: 'decimal1', align: 'right' },
  {
    id: 'lqs', label: 'Listing Quality', note: 'Scored out of 10 from images, title, bullets, A+ content, rating and reviews. ' + SORTS_IN_PAGE,
    value: (r) => r.lqs, format: 'decimal1', align: 'right',
  },
  { id: 'brand', label: 'Brand', value: (r) => r.brand, format: 'text' },
  { id: 'sizeTier', label: 'Shipping Size', value: (r) => r.sizeTier, format: 'text' },
  { id: 'weightLb', label: 'Weight (lb)', value: (r) => r.weightLb, format: 'decimal2', align: 'right' },
  { id: 'dimensions', label: 'Dimensions (in)', value: (r) => r.dimensions, format: 'text' },
  { id: 'listingAge', label: 'Listing Age (mo)', sortFilterId: 'listingAge', value: (r) => r.listingAgeMonths, format: 'number', align: 'right' },
  { id: 'variationCount', label: 'Variations', sortFilterId: 'variationCount', value: (r) => r.variationCount, format: 'number', align: 'right' },
  { id: 'imageCount', label: 'Images', sortFilterId: 'imageCount', value: (r) => r.imageCount, format: 'number', align: 'right' },
  {
    id: 'salesToReviews', label: 'Sales to Reviews', note: 'Monthly units per review — high means sales are outpacing review volume. ' + SORTS_IN_PAGE,
    value: (r) => r.salesToReviews, format: 'decimal2', align: 'right',
  },
];

/** What a first-time user sees: enough to judge an opportunity, not everything. */
export const DEFAULT_VISIBLE: ColumnId[] = [
  'bsr',
  'price',
  'monthlySales',
  'monthlyRevenue',
  'reviews',
  'rating',
  'lqs',
];

export const COLUMN_STORAGE_KEY = 'discovery.visibleColumns.v1';

export function readVisibleColumns(): ColumnId[] {
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE;
    // Drop anything no longer in the registry so a renamed column can't
    // resurrect itself as a blank column.
    const known = new Set(COLUMNS.map((c) => c.id));
    const kept = parsed.filter((id): id is ColumnId => known.has(id));
    return kept.length > 0 ? kept : DEFAULT_VISIBLE;
  } catch {
    return DEFAULT_VISIBLE;
  }
}

export function writeVisibleColumns(ids: ColumnId[]) {
  try {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* privacy mode or quota — the choice just won't persist */
  }
}

export function formatCell(value: number | string | null, format: ColumnDef['format']): string {
  if (value === null || value === '') return '—';
  if (typeof value === 'string') return value;
  switch (format) {
    case 'money0':
      return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    case 'money2':
      return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'decimal1':
      return value.toFixed(1);
    case 'decimal2':
      return value.toFixed(2);
    default:
      return value.toLocaleString('en-US');
  }
}
