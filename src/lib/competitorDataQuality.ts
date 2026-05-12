/**
 * Detect competitors whose displayed review count is inconsistent with the
 * rest of their listing data. The mechanism on Amazon's side can be one of
 * several things — variation-family review aggregation on the SERP DOM,
 * catalog-content editing on a long-lived ASIN, sponsored-brand card
 * scraping that picks up brand-aggregate counts — but from BloomEngine's
 * vantage point we only need to recognize the data-quality problem, not
 * its cause. Calling these "relisted ASINs" was inaccurate; ASINs aren't
 * transferred between owners on Amazon. Use `dataQuality: 'limited'`.
 *
 * Detection is intentionally a two-signal gate. A pure reviews-per-day
 * velocity check (the v1 heuristic that shipped in PR #55) false-positives
 * on legitimate viral products — e.g. a product with BSR 22 selling 3,000+
 * units/month can sustain 90 reviews/day organically. Two real corpus
 * checks both pass the new gate:
 *   - Loocio B09DF9NWC7: 24,340 reviews, BSR 22, 3,634/mo sales → NOT flagged
 *   - TheraICE B0CBSQVMHM: 43,519 reviews, BSR 645, 22,458/mo sales → NOT flagged
 * Two real corpus cases both flag correctly:
 *   - B0GBX8QY64 (Dave's screenshot): 15,343 reviews, BSR 1,006,500, 3/mo → FLAG
 *   - B0GQSRRRXK (the 2026-05-11 case): 18,602 reviews, age 70 days → FLAG (velocity)
 */

const REVIEWS_FLOOR = 1000;
const REVIEWS_PER_DAY_CAP = 100;
const BSR_POOR_FLOOR = 500_000;
const MONTHLY_SALES_FLOOR = 50;

type MaybeNumeric = number | string | null | undefined;

const asNumber = (v: MaybeNumeric): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const dateFirstAvailableToDays = (raw: MaybeNumeric, now: number = Date.now()): number | null => {
  if (raw == null) return null;
  // Accept ISO strings, Date-parseable strings, or numeric epoch.
  const ms = typeof raw === 'number' ? raw : Date.parse(String(raw));
  if (!Number.isFinite(ms)) return null;
  const days = Math.floor((now - ms) / 86_400_000);
  return days >= 0 ? Math.max(1, days) : null;
};

export interface CompetitorLike {
  reviews?: MaybeNumeric;
  monthlySales?: MaybeNumeric;
  bsr?: MaybeNumeric;
  dateFirstAvailable?: MaybeNumeric;
  age?: MaybeNumeric;
}

/**
 * Returns true when the competitor's review count is internally
 * inconsistent with the rest of its listing data and should NOT be
 * trusted for share-% denominators, market-size classification, or
 * direct display.
 */
export function isReviewCountInflated(comp: CompetitorLike, now: number = Date.now()): boolean {
  const reviews = asNumber(comp.reviews);
  if (reviews == null || reviews < REVIEWS_FLOOR) return false;

  const ageDays =
    dateFirstAvailableToDays(comp.dateFirstAvailable, now) ??
    (asNumber(comp.age) != null ? Math.max(1, Math.round((asNumber(comp.age) as number) * 30)) : null);

  // Signal A: implausible accumulation velocity. 100 reviews/day is well
  // above any real product's organic rate (peak viral products top out
  // around 50/day per Amazon community benchmarks). Catches cases where
  // Keepa-derived sales/BSR are ALSO polluted from the same source as the
  // review count, leaving velocity as the only clean signal.
  if (ageDays != null && reviews / ageDays > REVIEWS_PER_DAY_CAP) return true;

  // Signal B: sales/rank can't support the displayed review count. A real
  // listing accumulating 1,000+ reviews has to be selling; if BSR is way
  // down AND monthly-sales velocity is near zero, the reviews are coming
  // from somewhere other than this product's own sales history.
  const bsr = asNumber(comp.bsr);
  const monthlySales = asNumber(comp.monthlySales);
  const bsrPoor = bsr != null && bsr > BSR_POOR_FLOOR;
  const salesLow = monthlySales != null && monthlySales < MONTHLY_SALES_FLOOR;
  if (bsrPoor && salesLow) return true;

  return false;
}

/**
 * Returns a shallow-copied competitor with `dataQuality: 'limited'` set
 * when the review count is inflated. Use when WRITING competitor records
 * (analyze-market route) so downstream consumers see the flag.
 */
export function tagCompetitorDataQuality<T extends CompetitorLike>(comp: T, now: number = Date.now()): T & { dataQuality?: 'limited' } {
  if (!isReviewCountInflated(comp, now)) return comp;
  return { ...comp, dataQuality: 'limited' };
}
