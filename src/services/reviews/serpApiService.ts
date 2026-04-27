/**
 * Phase 2.5 — SerpAPI Amazon Product client.
 *
 * Engine: `amazon_product` (confirmed by live probe 2026-04-21; the
 * `amazon_reviews` engine named in Phase 2.4 research does NOT exist
 * on the platform).
 *
 * What this endpoint actually returns per ASIN:
 *   - reviews_information.authors_reviews:       ~7 author review bodies
 *   - reviews_information.other_countries_reviews: ~5 localized reviews
 *   - reviews_information.summary.text:          Amazon's own AI summary
 *                                                 of the product's full
 *                                                 review corpus
 *   - reviews_information.summary.insights:      8 AI-extracted topic
 *                                                 tags Amazon has mined
 *   - reviews_information.summary.customer_reviews: star histogram
 *
 * Amazon changed public-facing review access in Feb 2025, making any
 * ASIN-level pagination impractical without session cookies. So the
 * BloomEngine design (confirmed with Dave) aggregates across 7–12
 * competitor ASINs per submission to reach ~80–140 raw review bodies
 * PLUS 7–12 editorial summaries and topic-tag sets. This is richer
 * input than a 100-review single-ASIN pull.
 */

import { NormalizedReview, ProviderError } from './types';

const SERPAPI_BASE = 'https://serpapi.com/search';

export interface ProductDataResult {
  asin: string;
  productTitle?: string;
  /** Raw review bodies (authors + other-countries merged). */
  reviews: NormalizedReview[];
  /** Amazon's editorial "Customers say" AI summary of all reviews. */
  amazonSummary?: string;
  /** 8 AI-extracted topic tags Amazon has already mined from reviews. */
  amazonInsights?: string[];
  /** Star rating histogram (absolute counts). */
  ratingHistogram?: Partial<Record<'5 star' | '4 star' | '3 star' | '2 star' | '1 star', number>>;
  /** Wall-clock latency for this single call. */
  latencyMs: number;
}

function getApiKey(): string {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) {
    throw new ProviderError(
      'SERPAPI_API_KEY is not configured. Set it in .env.local and Vercel env vars.',
      'serpapi'
    );
  }
  return key;
}

interface SerpApiReviewRaw {
  title?: string;
  text?: string;
  rating?: number;
  date?: string;          // e.g. "Reviewed in the United States on March 15, 2025"
  review_date?: string;
  date_iso8601?: string;
  verified_purchase?: boolean;
  helpful_votes?: number;
  author?: string;
  profile?: { name?: string };
  images?: Array<{ link?: string }>;
}

interface SerpApiSummary {
  text?: string;
  insights?: Array<string | { title?: string; text?: string }>;
  customer_reviews?: Record<string, number>;
}

interface SerpApiReviewsInformation {
  summary?: SerpApiSummary;
  authors_reviews?: SerpApiReviewRaw[];
  other_countries_reviews?: SerpApiReviewRaw[];
}

interface SerpApiAmazonProductResponse {
  error?: string;
  product_results?: { title?: string };
  reviews_information?: SerpApiReviewsInformation;
}

function normalizeDate(raw: SerpApiReviewRaw): string | undefined {
  if (raw.date_iso8601) {
    const parsed = new Date(raw.date_iso8601);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  const fluffy = raw.date || raw.review_date;
  if (!fluffy) return undefined;
  const match = fluffy.match(/([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/);
  if (match) {
    const parsed = new Date(match[1]);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return undefined;
}

function clampRating(raw: number | undefined): NormalizedReview['rating'] {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 0;
  if (n > 5) return 5;
  return n as NormalizedReview['rating'];
}

function normalizeOne(raw: SerpApiReviewRaw): NormalizedReview | null {
  const body = (raw.text || '').trim();
  if (!body) return null;
  return {
    body,
    title: raw.title?.trim() || undefined,
    rating: clampRating(raw.rating),
    date: normalizeDate(raw),
    verifiedPurchase: Boolean(raw.verified_purchase),
    helpfulVotes: typeof raw.helpful_votes === 'number' ? raw.helpful_votes : undefined,
    author: raw.author?.trim() || raw.profile?.name?.trim() || undefined,
    imageUrls: Array.isArray(raw.images)
      ? raw.images.map((i) => i?.link || '').filter(Boolean)
      : undefined,
    source: 'serpapi',
  };
}

function normalizeInsights(raw: SerpApiSummary['insights']): string[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const cleaned = raw
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object') {
        return (entry.title || entry.text || '').toString().trim();
      }
      return '';
    })
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

export async function fetchProductData(asin: string): Promise<ProductDataResult> {
  if (!asin || !/^[A-Z0-9]{10}$/i.test(asin)) {
    throw new ProviderError(`Invalid ASIN: "${asin}"`, 'serpapi');
  }
  const apiKey = getApiKey();

  const url = new URL(SERPAPI_BASE);
  url.searchParams.set('engine', 'amazon_product');
  url.searchParams.set('asin', asin);
  url.searchParams.set('amazon_domain', 'amazon.com');
  url.searchParams.set('api_key', apiKey);

  const startedAt = Date.now();
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) {
    let bodyText = '';
    try { bodyText = await res.text(); } catch { /* ignore */ }
    throw new ProviderError(
      `SerpAPI HTTP ${res.status} for ASIN ${asin}: ${bodyText.slice(0, 200)}`,
      'serpapi'
    );
  }
  const json = (await res.json()) as SerpApiAmazonProductResponse;
  if (json.error) {
    throw new ProviderError(`SerpAPI error for ASIN ${asin}: ${json.error}`, 'serpapi');
  }

  const ri = json.reviews_information || {};
  const rawReviews: SerpApiReviewRaw[] = [
    ...(Array.isArray(ri.authors_reviews) ? ri.authors_reviews : []),
    ...(Array.isArray(ri.other_countries_reviews) ? ri.other_countries_reviews : []),
  ];
  const reviews = rawReviews
    .map(normalizeOne)
    .filter((r): r is NormalizedReview => r !== null);

  return {
    asin,
    productTitle: json.product_results?.title,
    reviews,
    amazonSummary: ri.summary?.text?.trim() || undefined,
    amazonInsights: normalizeInsights(ri.summary?.insights),
    ratingHistogram: ri.summary?.customer_reviews as ProductDataResult['ratingHistogram'],
    latencyMs: Date.now() - startedAt,
  };
}

/**
 * Pull product data for N ASINs in parallel. Failures on individual
 * ASINs are tolerated — we return whatever subset succeeded, so a
 * bad competitor in a market doesn't kill the whole analysis.
 */
export async function fetchProductDataMany(
  asins: string[]
): Promise<{ results: ProductDataResult[]; failures: Array<{ asin: string; error: string }> }> {
  const settled = await Promise.allSettled(asins.map((a) => fetchProductData(a)));
  const results: ProductDataResult[] = [];
  const failures: Array<{ asin: string; error: string }> = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') {
      results.push(s.value);
    } else {
      failures.push({
        asin: asins[i],
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      });
    }
  });
  return { results, failures };
}
