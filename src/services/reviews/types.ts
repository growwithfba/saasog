/**
 * Phase 2.5 — shared types for the reviews-pull provider abstraction.
 *
 * The two vendors (SerpAPI primary, Rainforest fallback) implement the
 * same ReviewsProvider interface, so the API route doesn't care which
 * one served the request. NormalizedReview is the canonical shape that
 * gets persisted to offer_products.reviews and fed into the existing
 * generateReviewAnalysisJSON pipeline shipped in Phase 2.2.
 */

export type ProviderName = 'serpapi' | 'rainforest';

/**
 * Canonical review shape stored in offer_products.reviews and consumed
 * by the SSP analysis pipeline. Keep in sync with the loose `Review`
 * type used by analyzeAnthropic.ts (title / body / rating). All other
 * fields are vendor-augmented metadata we keep so future features
 * (e.g. verified-only filtering, image extraction) don't require a
 * second pull.
 */
export interface NormalizedReview {
  /** Review body text. The signal that drives SSP analysis. */
  body: string;
  title?: string;
  /** 1-5 stars. Null/zero is treated as "unrated" by the analysis pipeline. */
  rating: 1 | 2 | 3 | 4 | 5 | 0;
  /** ISO 8601 date string (YYYY-MM-DD). */
  date?: string;
  verifiedPurchase?: boolean;
  helpfulVotes?: number;
  author?: string;
  imageUrls?: string[];
  /** Vendor identifier, kept for telemetry. */
  source?: ProviderName;
}

export interface FetchReviewsOptions {
  /**
   * Target number of reviews to return. Vendors paginate ~10 per page
   * so the provider implementation handles the page math. Capped at 200
   * by the route layer.
   */
  limit: number;
}

export interface FetchReviewsResult {
  reviews: NormalizedReview[];
  /** Whether the vendor returned the full requested limit. */
  reachedLimit: boolean;
  /** Wall-clock latency for the full pull (incl. all pages). */
  latencyMs: number;
}

export interface ReviewsProvider {
  name: ProviderName;
  /**
   * Fetch up to `opts.limit` reviews for the ASIN. Implementations
   * should:
   *   - paginate internally
   *   - dedupe by (date + first 80 chars of body) defensively
   *   - throw on any non-recoverable error so the caller can failover
   * The wrapping route is responsible for observability + caching.
   */
  fetchReviews(asin: string, opts: FetchReviewsOptions): Promise<FetchReviewsResult>;
}

/**
 * Thrown by a provider when its specific failure should trigger
 * the fallback chain. Network errors, 5xx, rate-limit responses,
 * and "no reviews returned" all qualify.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: ProviderName,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
