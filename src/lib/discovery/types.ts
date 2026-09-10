/** A min/max pair in DISPLAY units (dollars, stars, pounds, inches, months). */
export interface RangeValue {
  min?: number;
  max?: number;
}

export type FilterValue = RangeValue | string | string[] | boolean;

/** Keyed by FilterDef.id — never by Keepa key. */
export type DiscoveryFilters = Record<string, FilterValue>;

export type FilterGroup = 'product' | 'listing' | 'competitors' | 'sales';
export type FilterKind = 'range' | 'text' | 'textList' | 'boolean' | 'category';

/** One hydrated result row, in DISPLAY units. */
export interface HydratedRow {
  asin: string;
  title: string | null;
  brand: string | null;
  imageUrl: string | null;
  category: string | null;
  bsr: number | null;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  monthlyUnits: number | null;
  monthlyRevenue: number | null;
  parentUnits: number | null;
  parentRevenue: number | null;
  isFba: boolean | null;
  lqs: number | null;
  /** Shipping size tier, e.g. "Large Standard-Size". */
  sizeTier: string | null;
  /** Package weight in pounds. */
  weightLb: number | null;
  /** Package dimensions, already formatted in inches. */
  dimensions: string | null;
  /** Whole months since the listing first appeared. */
  listingAgeMonths: number | null;
  /** How many variations the family holds. */
  variationCount: number | null;
  /** Main-image count on the listing. */
  imageCount: number | null;
  /** Monthly units per review — high means sales outpacing review volume. */
  salesToReviews: number | null;
}
