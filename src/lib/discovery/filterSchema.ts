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
  /**
   * Bounds for the input itself, in DISPLAY units. These stop values that
   * cannot describe a real product — a 10-star rating, a negative price — from
   * being typed at all, rather than silently returning nothing from a search.
   * `max` is omitted where no natural ceiling exists (review counts, BSR).
   */
  inputMin?: number;
  inputMax?: number;
  /** Input step; defaults to 1 (whole numbers). */
  step?: number;
  /** Plain-English explanation, shown on the ⓘ beside the label. */
  note?: string;
}

export const FILTER_DEFS: FilterDef[] = [
  // ---- Product -------------------------------------------------------
  { id: 'category', label: 'Category & Subcategory', group: 'product', keepaKey: 'categories_include', kind: 'category', note: 'The Amazon categories and subcategories to search within.' },
  { id: 'reviewCount', inputMin: 0, label: 'Review Count', group: 'product', keepaKey: 'current_COUNT_REVIEWS', kind: 'range', note: 'The number of customer reviews on the listing.' },
  {
    id: 'rating', inputMin: 0, inputMax: 5, step: 0.1, label: 'Review Rating', group: 'product', keepaKey: 'current_RATING', kind: 'range',
    toKeepa: (v) => Math.round(v * 10), fromKeepa: (v) => v / 10, note: 'The average customer rating, out of 5 stars.'
  },
  { id: 'bsr', inputMin: 1, label: 'Best Seller Rank (BSR)', group: 'product', keepaKey: 'current_SALES', kind: 'range', note: 'The product\'s Best Sellers Rank in its main category. A lower rank means it sells faster.' },
  {
    id: 'listingAge', inputMin: 0, inputMax: 600, label: 'Listing Age (Months)', group: 'product', keepaKey: 'listedSince', kind: 'range',
    toKeepa: (months) => monthsAgoToKeepaMinutes(months), invertRange: true, note: 'How long the listing has been on Amazon, in months.'
  },
  {
    id: 'weight', inputMin: 0, inputMax: 2000, step: 0.1, label: 'Weight (lb)', group: 'listing', keepaKey: 'itemWeight', kind: 'range',
    toKeepa: (lb) => Math.round(lb * 453.592), fromKeepa: (g) => g / 453.592, note: 'The shipping weight of the product, in pounds.'
  },
  {
    id: 'longestSide', inputMin: 0, inputMax: 200, step: 0.1, label: 'Longest Side (in)', group: 'listing', keepaKey: 'packageLength', kind: 'range',
    toKeepa: (inches) => Math.round(inches * 25.4), fromKeepa: (mm) => mm / 25.4, note: 'The longest side of the product package, in inches.'
  },
  {
    id: 'fulfillment', label: 'Fulfillment', group: 'listing',
    // Handled specially in buildSelection: the provider has no single
    // fulfillment field, so a selection maps onto buyBoxIsFBA and
    // buyBoxIsAmazon. keepaKey is unused but kept non-empty so the allowlist
    // check still passes.
    keepaKey: 'buyBoxIsFBA', kind: 'fulfillment', note: 'Who ships the order: Amazon for the seller (FBA), the seller themselves (FBM), or Amazon as the seller.'
  },
  // NOTE: imageCount, NOT imagesCount — the latter is silently ignored by Keepa.
  { id: 'imageCount', inputMin: 0, inputMax: 10, label: 'Number of Images', group: 'listing', keepaKey: 'imageCount', kind: 'range', note: 'The number of images on the product listing.' },
  { id: 'variationCount', inputMin: 0, inputMax: 2000, label: 'Variation Count', group: 'listing', keepaKey: 'variationCount', kind: 'range', note: 'The number of variations, such as colours or sizes, in the product family.' },
  { id: 'titleKeywords', label: 'Title Keywords', group: 'product', keepaKey: 'title', kind: 'text', note: 'Only show products whose title contains these words.' },

  // ---- Competitors ---------------------------------------------------
  { id: 'sellerCount', inputMin: 0, inputMax: 1000, label: 'Number of Sellers', group: 'competitors', keepaKey: 'current_COUNT_NEW', kind: 'range', note: 'The number of sellers currently offering this product.' },
  { id: 'brand', label: 'Exact Brand Search', group: 'competitors', keepaKey: 'brand', kind: 'textList', note: 'Only show products from these brands. Separate multiple with commas.' },
  { id: 'sellerId', label: 'Exact Seller Search', group: 'competitors', keepaKey: 'sellerIds', kind: 'textList', note: 'Only show products from these sellers. Separate multiple with commas.' },

  // ---- Sales ---------------------------------------------------------
  {
    id: 'price', inputMin: 0, inputMax: 100000, step: 0.01, label: 'Price', group: 'sales', keepaKey: 'current_NEW', kind: 'range',
    toKeepa: (dollars) => Math.round(dollars * 100), fromKeepa: (cents) => cents / 100, note: 'The current listed price of the product.'
  },
  { id: 'priceChange', inputMin: -100, inputMax: 1000, label: 'Price Change (%)', group: 'sales', keepaKey: 'deltaPercent90_NEW', kind: 'range', note: 'How much the price has changed over the past 90 days.' },
  { id: 'monthlyUnits', inputMin: 0, label: 'ASIN Sales (units)', group: 'sales', keepaKey: 'monthlySold', kind: 'range', note: 'Estimated units sold for this specific ASIN over the past 30 days.' },
  { id: 'salesChange', inputMin: -100, inputMax: 1000, label: 'Sales Change (%)', group: 'sales', keepaKey: 'deltaPercent90_SALES', kind: 'range', note: 'How much sales have changed over the past 90 days.' },
  { id: 'rankDrops90', inputMin: 0, label: 'Sales Rank Drops (90d)', group: 'sales', keepaKey: 'salesRankDrops90', kind: 'range', note: 'How many times the sales rank dropped over the past 90 days. Each drop indicates a sale.' },
  { id: 'outOfStockPct', inputMin: 0, inputMax: 100, label: 'Out of Stock (%)', group: 'sales', keepaKey: 'outOfStockPercentage90', kind: 'range', note: 'The percentage of the past 90 days the product was out of stock.' },
];

const BY_ID = new Map(FILTER_DEFS.map((f) => [f.id, f]));

export function getFilterDef(id: string): FilterDef | undefined {
  return BY_ID.get(id);
}
