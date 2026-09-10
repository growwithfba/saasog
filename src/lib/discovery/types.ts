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
}
