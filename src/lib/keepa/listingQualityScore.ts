/**
 * Listing Quality Score — 7 criteria from Keepa product data, scored to 10.
 *
 * Replaces the H10 LQS we previously scraped from SERP DOM. Inputs come
 * exclusively from the Keepa /product response (with &rating=1&aplus=1
 * required for the rating + A+ checks).
 *
 * Criteria (each worth 10/7 ≈ 1.43 points; sum capped at 10):
 *   1. 7+ images
 *   2. Shorter image side > 1000px (main image quality)
 *   3. Title length > 150 chars
 *   4. 5+ bullets (features)
 *   5. A+ content present
 *   6. Rating ≥ 4.0
 *   7. 10+ reviews
 *
 * Skipped (not worth the complexity):
 *   - White-background main image — requires pixel analysis; Amazon
 *     enforces compliance so most listings pass anyway.
 *
 * Returns null if we have insufficient Keepa data to compute even a
 * partial score (no title, no images, no rating fields — looks like
 * a deactivated listing).
 */

export interface LqsResult {
  /** Final score, 0-10 with one decimal. */
  score: number;
  /** Per-criterion pass/fail for debugging + tooltip display. */
  details: {
    sevenPlusImages: boolean;
    imageDimensionsOver1000: boolean;
    titleOver150Chars: boolean;
    fivePlusBullets: boolean;
    aPlusContent: boolean;
    ratingOverFour: boolean;
    tenPlusReviews: boolean;
  };
  passedCount: number;
}

const CRITERION_WEIGHT = 10 / 7; // ≈ 1.4286

export function computeLqsFromKeepaProduct(product: any): LqsResult | null {
  if (!product || typeof product !== 'object') return null;

  // If we have NO usable signal at all, return null (rather than 0/10).
  const hasAnySignal =
    typeof product.title === 'string' ||
    Array.isArray(product.images) ||
    Array.isArray(product.features) ||
    product.stats?.current;
  if (!hasAnySignal) return null;

  const images = Array.isArray(product.images) ? product.images : [];
  const features = Array.isArray(product.features) ? product.features : [];
  const title = typeof product.title === 'string' ? product.title : '';
  const current: number[] = product?.stats?.current ?? [];

  const ratingTenths = typeof current[16] === 'number' && current[16] > 0 ? current[16] : null;
  const reviews = typeof current[17] === 'number' && current[17] >= 0 ? current[17] : null;

  const details: LqsResult['details'] = {
    sevenPlusImages: images.length >= 7,
    // The shorter side of the main image. Keepa stores lH (height) + lW (width).
    imageDimensionsOver1000:
      images.length > 0 &&
      typeof images[0]?.lH === 'number' &&
      typeof images[0]?.lW === 'number' &&
      Math.min(images[0].lH, images[0].lW) > 1000,
    titleOver150Chars: title.length > 150,
    fivePlusBullets: features.length >= 5,
    // Field name confirmed via probe (scripts/probes/keepa-hydration-fields.ts) —
    // Keepa exposes A+ content under `aPlus` as an array. Empty array = no A+;
    // any entries = A+ present.
    aPlusContent: Array.isArray(product.aPlus) && product.aPlus.length > 0,
    ratingOverFour: ratingTenths != null && ratingTenths / 10 >= 4.0,
    tenPlusReviews: reviews != null && reviews >= 10,
  };

  const passedCount = Object.values(details).filter(Boolean).length;
  const score = Math.round(passedCount * CRITERION_WEIGHT * 10) / 10;

  return { score, details, passedCount };
}
