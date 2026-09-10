import type { FilterGroup, FilterKind } from './types';

/**
 * Keepa timestamps are "Keepa minutes": minutes since the Unix epoch, minus
 * a fixed offset that places Keepa time zero at 2011-01-01.
 */
export const KEEPA_EPOCH_OFFSET_MINUTES = 21564000;

export function monthsAgoToKeepaMinutes(months: number, now: number = Date.now()): number {
  const ms = now - months * 30 * 24 * 60 * 60 * 1000;
  return Math.round(ms / 60000) - KEEPA_EPOCH_OFFSET_MINUTES;
}

export interface FilterDef {
  /** Stable internal id. This is what the UI and API speak. */
  id: string;
  label: string;
  group: FilterGroup;
  /**
   * The Keepa `selection` key. PROBE-VERIFIED ONLY — see
   * docs/keepa-product-finder-probe-2026-09-09.md. Keepa silently ignores
   * unknown keys and returns the whole catalog, so an unverified key here
   * is a silently-wrong search, not an error.
   */
  keepaKey: string;
  kind: FilterKind;
  /** Display unit -> Keepa unit. Omit when they are the same. */
  toKeepa?: (displayValue: number) => number;
  /** Keepa unit -> display unit. */
  fromKeepa?: (keepaValue: number) => number;
  /**
   * True when a range's min/max swap on conversion. Listing age is the case:
   * a MAXIMUM age of 12 months is a MINIMUM timestamp.
   */
  invertRange?: boolean;
}

export const FILTER_DEFS: FilterDef[] = [
  // ---- Product -------------------------------------------------------
  { id: 'category', label: 'Category & Subcategory', group: 'product', keepaKey: 'categories_include', kind: 'category' },
  { id: 'reviewCount', label: 'Review Count', group: 'product', keepaKey: 'current_COUNT_REVIEWS', kind: 'range' },
  {
    id: 'rating', label: 'Review Rating', group: 'product', keepaKey: 'current_RATING', kind: 'range',
    toKeepa: (v) => Math.round(v * 10), fromKeepa: (v) => v / 10,
  },
  { id: 'bsr', label: 'Best Seller Rank (BSR)', group: 'product', keepaKey: 'current_SALES', kind: 'range' },
  {
    id: 'listingAge', label: 'Listing Age (Months)', group: 'product', keepaKey: 'listedSince', kind: 'range',
    toKeepa: (months) => monthsAgoToKeepaMinutes(months), invertRange: true,
  },
  {
    id: 'weight', label: 'Weight (lb)', group: 'listing', keepaKey: 'itemWeight', kind: 'range',
    toKeepa: (lb) => Math.round(lb * 453.592), fromKeepa: (g) => g / 453.592,
  },
  {
    id: 'longestSide', label: 'Longest Side (in)', group: 'listing', keepaKey: 'packageLength', kind: 'range',
    toKeepa: (inches) => Math.round(inches * 25.4), fromKeepa: (mm) => mm / 25.4,
  },
  { id: 'fbaOnly', label: 'FBA Only', group: 'listing', keepaKey: 'buyBoxIsFBA', kind: 'boolean' },
  // NOTE: imageCount, NOT imagesCount — the latter is silently ignored by Keepa.
  { id: 'imageCount', label: 'Number of Images', group: 'listing', keepaKey: 'imageCount', kind: 'range' },
  { id: 'variationCount', label: 'Variation Count', group: 'listing', keepaKey: 'variationCount', kind: 'range' },
  { id: 'titleKeywords', label: 'Title Keywords', group: 'product', keepaKey: 'title', kind: 'text' },

  // ---- Competitors ---------------------------------------------------
  { id: 'sellerCount', label: 'Number of Sellers', group: 'competitors', keepaKey: 'current_COUNT_NEW', kind: 'range' },
  { id: 'brand', label: 'Exact Brand Search', group: 'competitors', keepaKey: 'brand', kind: 'textList' },
  { id: 'sellerId', label: 'Exact Seller Search', group: 'competitors', keepaKey: 'sellerIds', kind: 'textList' },

  // ---- Sales ---------------------------------------------------------
  {
    id: 'price', label: 'Price', group: 'sales', keepaKey: 'current_NEW', kind: 'range',
    toKeepa: (dollars) => Math.round(dollars * 100), fromKeepa: (cents) => cents / 100,
  },
  { id: 'priceChange', label: 'Price Change (%)', group: 'sales', keepaKey: 'deltaPercent90_NEW', kind: 'range' },
  { id: 'monthlyUnits', label: 'ASIN Sales (units)', group: 'sales', keepaKey: 'monthlySold', kind: 'range' },
  { id: 'salesChange', label: 'Sales Change (%)', group: 'sales', keepaKey: 'deltaPercent90_SALES', kind: 'range' },
  { id: 'rankDrops90', label: 'Sales Rank Drops (90d)', group: 'sales', keepaKey: 'salesRankDrops90', kind: 'range' },
  { id: 'outOfStockPct', label: 'Out of Stock (%)', group: 'sales', keepaKey: 'outOfStockPercentage90', kind: 'range' },
];

const BY_ID = new Map(FILTER_DEFS.map((f) => [f.id, f]));

export function getFilterDef(id: string): FilterDef | undefined {
  return BY_ID.get(id);
}
