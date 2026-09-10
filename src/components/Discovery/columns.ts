import type { HydratedRow } from '@/lib/discovery/types';

export type ColumnId =
  | 'category'
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
  /** Numeric columns centre in their cell; text columns stay left. */
  align?: 'center';
  value: (row: HydratedRow) => number | string | null;
  /** How to render it. Numbers stay right-aligned and comparable down a column. */
  format: 'number' | 'money0' | 'money2' | 'decimal1' | 'decimal2' | 'text' | 'stars';
}

const CALCULATED = 'Calculated from the sales-rank curve.';

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
  {
    id: 'category', label: 'Category',
    note: 'The category Category BSR is ranked in. Two products with a similar rank in different categories sell very differently.',
    value: (r) => r.category, format: 'text',
  },
  { id: 'bsr', label: 'Category BSR', sortFilterId: 'bsr', value: (r) => r.bsr, format: 'number', align: 'center' },
  { id: 'price', label: 'Price', sortFilterId: 'price', value: (r) => r.price, format: 'money2', align: 'center' },
  {
    id: 'monthlySales', label: 'Monthly Sales', note: 'Units per month for the whole product. ' + CALCULATED,
    value: (r) => r.parentUnits ?? r.monthlyUnits, format: 'number', align: 'center',
  },
  {
    id: 'monthlyRevenue', label: 'Monthly Revenue', note: 'Monthly sales × 30-day average price, for the whole product. ' + CALCULATED,
    value: (r) => r.parentRevenue ?? r.monthlyRevenue, format: 'money0', align: 'center',
  },
  { id: 'reviews', label: 'Reviews', sortFilterId: 'reviewCount', note: 'Reviews on this listing. Amazon shows a variation family’s pooled total, which is usually higher.', value: (r) => r.reviews, format: 'number', align: 'center' },
  { id: 'rating', label: 'Rating', sortFilterId: 'rating', value: (r) => r.rating, format: 'stars' },
  {
    id: 'lqs', label: 'Listing Quality', note: 'Scored out of 10 from images, title, bullets, A+ content, rating and reviews.',
    value: (r) => r.lqs, format: 'decimal1', align: 'center',
  },
  { id: 'brand', label: 'Brand', value: (r) => r.brand, format: 'text' },
  { id: 'sizeTier', label: 'Shipping Size', value: (r) => r.sizeTier, format: 'text' },
  { id: 'weightLb', label: 'Weight (lb)', value: (r) => r.weightLb, format: 'decimal2', align: 'center' },
  { id: 'dimensions', label: 'Dimensions (in)', value: (r) => r.dimensions, format: 'text' },
  { id: 'listingAge', label: 'Listing Age (mo)', sortFilterId: 'listingAge', value: (r) => r.listingAgeMonths, format: 'number', align: 'center' },
  { id: 'variationCount', label: 'Variations', sortFilterId: 'variationCount', value: (r) => r.variationCount, format: 'number', align: 'center' },
  { id: 'imageCount', label: 'Images', sortFilterId: 'imageCount', value: (r) => r.imageCount, format: 'number', align: 'center' },
  {
    id: 'salesToReviews', label: 'Sales to Reviews', note: 'Monthly units per review — high means sales are outpacing review volume.',
    value: (r) => r.salesToReviews, format: 'decimal2', align: 'center',
  },
];

/** What a first-time user sees: enough to judge an opportunity, not everything. */
export const DEFAULT_VISIBLE: ColumnId[] = [
  'category',
  'brand',
  'bsr',
  'price',
  'monthlySales',
  'monthlyRevenue',
  'reviews',
  'rating',
  'lqs',
];

export const COLUMN_STORAGE_KEY = 'discovery.visibleColumns.v2';
export const COLUMN_ORDER_KEY = 'discovery.columnOrder.v1';
export const COLUMN_WIDTH_KEY = 'discovery.columnWidths.v2';

/** Sensible starting width per column, in px. */
export const DEFAULT_WIDTHS: Record<string, number> = {
  product: 270,
  category: 112,
  bsr: 84,
  price: 76,
  monthlySales: 96,
  monthlyRevenue: 104,
  reviews: 78,
  rating: 100,
  lqs: 96,
  brand: 110,
  sizeTier: 128,
  weightLb: 92,
  dimensions: 132,
  listingAge: 96,
  variationCount: 96,
  imageCount: 84,
  salesToReviews: 100,
};

/** Narrower than this and a header label has nowhere to go. */
export const MIN_COLUMN_WIDTH = 70;

/**
 * Display order of every column, including hidden ones.
 *
 * Kept separate from visibility so that hiding a column and showing it again
 * returns it to where the user dragged it, rather than snapping back to the
 * registry's order.
 */
export function readColumnOrder(): ColumnId[] {
  const all = COLUMNS.map((c) => c.id);
  try {
    const raw = localStorage.getItem(COLUMN_ORDER_KEY);
    if (!raw) return all;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return all;
    const known = parsed.filter((id): id is ColumnId => all.includes(id));
    // Append anything added to the registry since this order was saved, so a
    // new column appears rather than silently never rendering.
    return [...known, ...all.filter((id) => !known.includes(id))];
  } catch {
    return all;
  }
}

export function writeColumnOrder(ids: ColumnId[]) {
  try {
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(ids));
  } catch {
    /* privacy mode or quota */
  }
}

export function readColumnWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COLUMN_WIDTH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function writeColumnWidths(widths: Record<string, number>) {
  try {
    localStorage.setItem(COLUMN_WIDTH_KEY, JSON.stringify(widths));
  } catch {
    /* privacy mode or quota */
  }
}

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

/** Rows per page. 50 is the default; larger pages cost proportionally more. */
export const PAGE_SIZES = [50, 100, 200, 300] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 50;
export const PAGE_SIZE_STORAGE_KEY = 'discovery.pageSize.v1';

export function readPageSize(): PageSize {
  try {
    const raw = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    return (PAGE_SIZES as readonly number[]).includes(raw) ? (raw as PageSize) : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

export function writePageSize(size: PageSize) {
  try {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
  } catch {
    /* privacy mode or quota — the choice just won't persist */
  }
}

/**
 * Order rows by a column, in the browser.
 *
 * Sorting used to re-run the whole search, which meant a spinner and a fresh
 * fetch every time a header was clicked. The search now returns a bounded set
 * that is fully loaded, so ordering is a pure reorder of what is already held
 * — and every column can sort, including the calculated ones the provider
 * could never sort for us.
 *
 * Rows with no value for the sorted column always sink to the bottom, in both
 * directions: "unknown" is not the smallest value, it is the absence of one,
 * and burying it keeps the top of the list meaningful.
 */
export type SortId = ColumnId | 'product';

export function sortRows<T extends HydratedRow>(
  rows: T[],
  columnId: SortId | null,
  direction: 'asc' | 'desc',
): T[] {
  if (!columnId) return rows;
  // The product column is pinned and not in the registry, but it still sorts —
  // alphabetically by title, which is how you find a remembered product again.
  const col =
    columnId === 'product'
      ? ({ value: (r: HydratedRow) => r.title, format: 'text' } as Pick<ColumnDef, 'value' | 'format'>)
      : COLUMNS.find((c) => c.id === columnId);
  if (!col) return rows;

  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = col.value(a);
    const bv = col.value(b);
    if (av === null || av === '') return bv === null || bv === '' ? 0 : 1;
    if (bv === null || bv === '') return -1;
    if (typeof av === 'string' || typeof bv === 'string') {
      return String(av).localeCompare(String(bv)) * factor;
    }
    return (av - bv) * factor;
  });
}

export const TITLE_WRAP_KEY = 'discovery.wrapTitle.v1';

export function readTitleWrap(): boolean {
  try {
    return localStorage.getItem(TITLE_WRAP_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeTitleWrap(on: boolean) {
  try {
    localStorage.setItem(TITLE_WRAP_KEY, String(on));
  } catch {
    /* privacy mode or quota */
  }
}
