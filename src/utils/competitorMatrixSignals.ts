export const REMOVAL_REVENUE_MAX = 1000;
export const REMOVAL_RATING_MAX = 4;
export const REMOVAL_IMAGE_COUNT_MAX = 6;
export const PARENT_REVENUE_TOLERANCE = 50;
export const PARENT_REVENUE_BUCKET_SIZE = 50;
export const ALLOW_ORANGE_ABOVE_REVENUE = false;

export const REVIEW_LOW_GOOD_MAX = 200;
export const REVIEW_HIGH_BAD_MIN = 1000;
export const RATING_LOW_GOOD_MAX = 3.8;
export const RATING_HIGH_BAD_MIN = 4.5;
export const BSR_HIGH_GOOD_MIN = 80000;
export const BSR_LOW_BAD_MAX = 20000;

export type RemovalType = 'none' | 'lightRed' | 'darkRed' | 'orange';
export type CellSignal = 'good' | 'bad' | 'neutral';

type CompetitorRow = {
  asin?: string;
  ASIN?: string;
  monthlyRevenue?: number | string;
  fulfillment?: string;
  fulfillmentType?: string;
  fulfillmentMethod?: string;
  fulfilledBy?: string;
  rating?: number | string;
  imageCount?: number | string;
  image_count?: number | string;
  images?: number | string;
  brandName?: string;
  brand?: string;
  parentLevelRevenue?: number | string;
  parentRevenue?: number | string;
  parent_level_revenue?: number | string;
  [key: string]: any;
};

const toNumber = (value: number | string | undefined | null): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const getFirstNumericMatch = (row: CompetitorRow, matcher: RegExp) => {
  for (const key of Object.keys(row || {})) {
    if (!matcher.test(key)) continue;
    const value = toNumber(row[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

export const getRowAsin = (row: CompetitorRow) => {
  const asin = row.asin || row.ASIN;
  return typeof asin === 'string' ? asin.trim() : '';
};

export const getRowMonthlyRevenue = (row: CompetitorRow) => {
  return toNumber(row.monthlyRevenue) ?? 0;
};

export const getRowRating = (row: CompetitorRow) => {
  return toNumber(row.rating);
};

export const getRowImageCount = (row: CompetitorRow) => {
  return (
    toNumber(row.imageCount) ??
    toNumber(row.image_count) ??
    toNumber(row.images) ??
    getFirstNumericMatch(row, /image.*count/i)
  );
};

export const getRowBrandName = (row: CompetitorRow) => {
  return (row.brandName || row.brand || '').trim();
};

export const getRowParentLevelRevenue = (row: CompetitorRow) => {
  return (
    toNumber(row.parentLevelRevenue) ??
    toNumber(row.parentRevenue) ??
    toNumber(row.parent_level_revenue) ??
    getFirstNumericMatch(row, /parent.*revenue/i)
  );
};

export const normalizeFulfillmentType = (value?: string) => {
  const raw = `${value || ''}`.toUpperCase();
  if (!raw) return '';
  if (raw.includes('MFN') || raw.includes('FBM')) return 'MFN';
  if (raw.includes('AMZ') || raw.includes('AMAZON')) return 'AMZ';
  if (raw.includes('FBA')) return 'FBA';
  return raw;
};

export const getRowFulfillmentType = (row: CompetitorRow) => {
  return normalizeFulfillmentType(
    row.fulfillmentType || row.fulfillment || row.fulfilledBy || row.fulfillmentMethod
  );
};

export const isSameParentRevenue = (a: number | undefined, b: number | undefined) => {
  if (!a || !b) return false;
  return Math.abs(a - b) <= PARENT_REVENUE_TOLERANCE;
};

export const getVariationLowerRevenueAsins = (rows: CompetitorRow[]) => {
  const groups = new Map<string, Array<{ row: CompetitorRow; parentRevenue: number }>>();

  rows.forEach((row) => {
    const brand = getRowBrandName(row);
    const parentRevenue = getRowParentLevelRevenue(row);
    if (!brand || parentRevenue === undefined) return;
    const brandKey = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!brandKey) return;
    const bucket = Math.round(parentRevenue / PARENT_REVENUE_BUCKET_SIZE);
    const key = `${brandKey}::${bucket}`;
    const entry = groups.get(key) || [];
    entry.push({ row, parentRevenue });
    groups.set(key, entry);
  });

  const lowerAsins = new Set<string>();
  // For each parent-revenue cluster of ≥2 siblings, flag EVERY non-highest-
  // revenue ASIN (not just the single lowest). In a 3-way cluster the middle
  // sibling should also be a removal candidate.
  groups.forEach((entries) => {
    if (entries.length < 2) return;
    let maxRevenue = Number.NEGATIVE_INFINITY;
    entries.forEach(({ row }) => {
      const revenue = getRowMonthlyRevenue(row);
      if (Number.isFinite(revenue) && revenue > maxRevenue) {
        maxRevenue = revenue;
      }
    });
    if (!Number.isFinite(maxRevenue)) return;
    entries.forEach(({ row }) => {
      const revenue = getRowMonthlyRevenue(row);
      const asin = getRowAsin(row);
      if (asin && Number.isFinite(revenue) && revenue < maxRevenue) {
        lowerAsins.add(asin);
      }
    });
  });

  // Fallback for CSVs without parent-level revenue (typical H10 X-Ray case):
  // group by brand, cluster siblings by BSR-within-2 OR exact review-count
  // match, flag non-highest-revenue members. Runs when the parent-revenue
  // pass produced nothing, so we don't double-detect for good data.
  if (lowerAsins.size === 0) {
    const byBrand = new Map<string, CompetitorRow[]>();
    rows.forEach((row) => {
      const brand = getRowBrandName(row);
      if (!brand) return;
      const brandKey = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!brandKey) return;
      const entry = byBrand.get(brandKey) || [];
      entry.push(row);
      byBrand.set(brandKey, entry);
    });

    byBrand.forEach((entries) => {
      if (entries.length < 2) return;
      const parent = entries.map((_, i) => i);
      const find = (i: number): number => {
        while (parent[i] !== i) {
          parent[i] = parent[parent[i]];
          i = parent[i];
        }
        return i;
      };
      const union = (i: number, j: number) => {
        const ri = find(i);
        const rj = find(j);
        if (ri !== rj) parent[ri] = rj;
      };
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const aBsr = toNumber(entries[i].bsr);
          const bBsr = toNumber(entries[j].bsr);
          const aReviews = toNumber(entries[i].reviews);
          const bReviews = toNumber(entries[j].reviews);
          const bsrMatch =
            aBsr !== undefined && bBsr !== undefined &&
            aBsr > 0 && bBsr > 0 && Math.abs(aBsr - bBsr) <= 2;
          const reviewsMatch =
            aReviews !== undefined && bReviews !== undefined &&
            aReviews > 0 && bReviews > 0 && aReviews === bReviews;
          if (bsrMatch || reviewsMatch) union(i, j);
        }
      }
      const clusters = new Map<number, CompetitorRow[]>();
      for (let i = 0; i < entries.length; i++) {
        const root = find(i);
        const arr = clusters.get(root) || [];
        arr.push(entries[i]);
        clusters.set(root, arr);
      }
      clusters.forEach((members) => {
        if (members.length < 2) return;
        let maxRevenue = Number.NEGATIVE_INFINITY;
        members.forEach((row) => {
          const revenue = getRowMonthlyRevenue(row);
          if (Number.isFinite(revenue) && revenue > maxRevenue) maxRevenue = revenue;
        });
        if (!Number.isFinite(maxRevenue)) return;
        members.forEach((row) => {
          const revenue = getRowMonthlyRevenue(row);
          const asin = getRowAsin(row);
          if (asin && Number.isFinite(revenue) && revenue < maxRevenue) {
            lowerAsins.add(asin);
          }
        });
      });
    });
  }

  return lowerAsins;
};

export const isVariationLowerRevenue = (
  row: CompetitorRow,
  allRows: CompetitorRow[],
  precomputed?: Set<string>
) => {
  const asin = getRowAsin(row);
  if (!asin) return false;
  const lowerAsins = precomputed || getVariationLowerRevenueAsins(allRows);
  return lowerAsins.has(asin);
};

export const getRecommendedRemovalType = (
  row: CompetitorRow,
  allRows: CompetitorRow[],
  options?: {
    variationLowerRevenueAsins?: Set<string>;
    allowOrangeAboveRevenue?: boolean;
  }
): RemovalType => {
  const monthlyRevenue = getRowMonthlyRevenue(row);
  const rating = getRowRating(row);
  const imageCount = getRowImageCount(row);
  const fulfillmentType = getRowFulfillmentType(row);

  // Variations should be flagged regardless of revenue — a losing child
  // variant making $4k is still a duplicate entry the user likely wants to
  // drop. Check this BEFORE the under-revenue gate so high-revenue variants
  // don't short-circuit to 'none'.
  const isVariantLoser = isVariationLowerRevenue(
    row,
    allRows,
    options?.variationLowerRevenueAsins
  );
  if (isVariantLoser) return 'orange';

  const isUnderRevenue = monthlyRevenue < REMOVAL_REVENUE_MAX;
  if (!isUnderRevenue && !options?.allowOrangeAboveRevenue && !ALLOW_ORANGE_ABOVE_REVENUE) {
    return 'none';
  }

  const isDarkRed =
    isUnderRevenue &&
    (fulfillmentType === 'MFN' ||
      (rating !== undefined && rating < REMOVAL_RATING_MAX) ||
      (imageCount !== undefined && imageCount <= REMOVAL_IMAGE_COUNT_MAX));

  if (isDarkRed) return 'darkRed';
  if (isUnderRevenue) return 'lightRed';
  return 'none';
};

export const getCellSignalClass = (
  type: 'reviews' | 'rating' | 'fulfilledBy' | 'bsr',
  value: number | string | undefined | null
): CellSignal => {
  if (type === 'fulfilledBy') {
    const normalized = normalizeFulfillmentType(typeof value === 'string' ? value : undefined);
    if (normalized === 'MFN') return 'good';
    if (normalized === 'AMZ') return 'bad';
    return 'neutral';
  }

  const numeric = typeof value === 'number' ? value : value ? parseFloat(String(value)) : NaN;
  if (!Number.isFinite(numeric)) return 'neutral';

  if (type === 'reviews') {
    if (numeric >= REVIEW_HIGH_BAD_MIN) return 'bad';
    if (numeric <= REVIEW_LOW_GOOD_MAX) return 'good';
    return 'neutral';
  }

  if (type === 'rating') {
    if (numeric >= RATING_HIGH_BAD_MIN) return 'bad';
    if (numeric <= RATING_LOW_GOOD_MAX) return 'good';
    return 'neutral';
  }

  if (type === 'bsr') {
    if (numeric <= BSR_LOW_BAD_MAX) return 'bad';
    if (numeric >= BSR_HIGH_GOOD_MIN) return 'good';
    return 'neutral';
  }

  return 'neutral';
};
