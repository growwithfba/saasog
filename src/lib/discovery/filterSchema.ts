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
  { id: 'category', label: 'Category & Subcategory', group: 'product', keepaKey: 'categories_include', kind: 'category', note: 'Which part of the Amazon catalogue to search. At least one is required — searching everything returns tens of thousands of products and tells you nothing.' },
  { id: 'reviewCount', inputMin: 0, label: 'Review Count', group: 'product', keepaKey: 'current_COUNT_REVIEWS', kind: 'range', note: 'How many reviews the listing carries. Fewer reviews usually means more room for a new seller to rank.' },
  {
    id: 'rating', inputMin: 0, inputMax: 5, step: 0.1, label: 'Review Rating', group: 'product', keepaKey: 'current_RATING', kind: 'range',
    toKeepa: (v) => Math.round(v * 10), fromKeepa: (v) => v / 10, note: 'The star rating out of 5. A low rating on a selling product is the classic opening — customers want it but are unhappy with what they can buy.'
  },
  { id: 'bsr', inputMin: 1, label: 'Best Seller Rank (BSR)', group: 'product', keepaKey: 'current_SALES', kind: 'range', note: 'Best Sellers Rank within the product\'s category. Lower means faster sales. Only comparable within the same category.' },
  {
    id: 'listingAge', inputMin: 0, inputMax: 600, label: 'Listing Age (Months)', group: 'product', keepaKey: 'listedSince', kind: 'range',
    toKeepa: (months) => monthsAgoToKeepaMinutes(months), invertRange: true, note: 'How many months the listing has existed. Newer listings show what is selling now rather than what sold years ago.'
  },
  {
    id: 'weight', inputMin: 0, inputMax: 2000, step: 0.1, label: 'Weight (lb)', group: 'listing', keepaKey: 'itemWeight', kind: 'range',
    toKeepa: (lb) => Math.round(lb * 453.592), fromKeepa: (g) => g / 453.592, note: 'Package weight in pounds. Heavier products cost more to ship and to store.'
  },
  {
    id: 'longestSide', inputMin: 0, inputMax: 200, step: 0.1, label: 'Longest Side (in)', group: 'listing', keepaKey: 'packageLength', kind: 'range',
    toKeepa: (inches) => Math.round(inches * 25.4), fromKeepa: (mm) => mm / 25.4, note: 'The longest package dimension in inches. Drives the size tier, and with it the fulfilment fee.'
  },
  {
    id: 'fulfillment', label: 'Fulfillment', group: 'listing',
    // Handled specially in buildSelection: the provider has no single
    // fulfillment field, so a selection maps onto buyBoxIsFBA and
    // buyBoxIsAmazon. keepaKey is unused but kept non-empty so the allowlist
    // check still passes.
    keepaKey: 'buyBoxIsFBA', kind: 'fulfillment', note: 'Who ships the product. Amazon on the listing usually means the market is not worth entering.'
  },
  // NOTE: imageCount, NOT imagesCount — the latter is silently ignored by Keepa.
  { id: 'imageCount', inputMin: 0, inputMax: 10, label: 'Number of Images', group: 'listing', keepaKey: 'imageCount', kind: 'range', note: 'How many images the listing shows. Few images is a sign of a listing you could beat on presentation.' },
  { id: 'variationCount', inputMin: 0, inputMax: 2000, label: 'Variation Count', group: 'listing', keepaKey: 'variationCount', kind: 'range', note: 'How many variations the product family holds. A single-variation listing is simpler to compete with than a sprawling colour and size family.' },
  { id: 'titleKeywords', label: 'Title Keywords', group: 'product', keepaKey: 'title', kind: 'text', note: 'Only return products whose title contains this text.' },

  // ---- Competitors ---------------------------------------------------
  { id: 'sellerCount', inputMin: 0, inputMax: 1000, label: 'Number of Sellers', group: 'competitors', keepaKey: 'current_COUNT_NEW', kind: 'range', note: 'How many sellers currently offer the product. More sellers means more competition on the same listing.' },
  { id: 'brand', label: 'Exact Brand Search', group: 'competitors', keepaKey: 'brand', kind: 'textList', note: 'Only return products from these exact brands. Comma separated.' },
  { id: 'sellerId', label: 'Exact Seller Search', group: 'competitors', keepaKey: 'sellerIds', kind: 'textList', note: 'Only return products sold by these exact sellers. Comma separated.' },

  // ---- Sales ---------------------------------------------------------
  {
    id: 'price', inputMin: 0, inputMax: 100000, step: 0.01, label: 'Price', group: 'sales', keepaKey: 'current_NEW', kind: 'range',
    toKeepa: (dollars) => Math.round(dollars * 100), fromKeepa: (cents) => cents / 100, note: 'The current selling price. Your margin lives here, so it is usually the first thing worth bounding.'
  },
  { id: 'priceChange', inputMin: -100, inputMax: 1000, label: 'Price Change (%)', group: 'sales', keepaKey: 'deltaPercent90_NEW', kind: 'range', note: 'How much the price has moved over 90 days. Large swings suggest an unstable market.' },
  { id: 'monthlyUnits', inputMin: 0, label: 'ASIN Sales (units)', group: 'sales', keepaKey: 'monthlySold', kind: 'range', note: 'Units sold per month for this ASIN alone, not the whole variation family.' },
  { id: 'salesChange', inputMin: -100, inputMax: 1000, label: 'Sales Change (%)', group: 'sales', keepaKey: 'deltaPercent90_SALES', kind: 'range', note: 'How much sales have moved over 90 days. Rising demand is worth more than a big but flat market.' },
  { id: 'rankDrops90', inputMin: 0, label: 'Sales Rank Drops (90d)', group: 'sales', keepaKey: 'salesRankDrops90', kind: 'range', note: 'How many times the sales rank dropped in 90 days. Each drop is roughly a sale, so more drops means steadier demand.' },
  { id: 'outOfStockPct', inputMin: 0, inputMax: 100, label: 'Out of Stock (%)', group: 'sales', keepaKey: 'outOfStockPercentage90', kind: 'range', note: 'How often the product was unavailable over 90 days. Frequent stockouts mean demand the current seller is failing to meet.' },
];

const BY_ID = new Map(FILTER_DEFS.map((f) => [f.id, f]));

export function getFilterDef(id: string): FilterDef | undefined {
  return BY_ID.get(id);
}
