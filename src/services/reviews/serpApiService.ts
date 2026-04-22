/**
 * Phase 2.5 — SerpAPI Amazon Reviews client (PRIMARY).
 *
 * Endpoint: https://serpapi.com/search?engine=amazon_reviews&...
 * Docs: https://serpapi.com/amazon-product-reviews-information
 *
 * Pagination: SerpAPI returns ~10 reviews per `page`. To get N reviews
 * we walk pages 1..ceil(N/10) sequentially (parallel requests risk
 * tripping the per-hour rate limit on the Developer plan).
 *
 * Cost model: each page = 1 search credit. At the locked Developer
 * tier a 100-review pull costs ~10 searches = $0.15 (Phase 2.4 doc).
 *
 * Failure modes that should bubble as ProviderError so the route can
 * failover to Rainforest: network errors, 4xx/5xx responses, and zero
 * reviews returned (which usually means the ASIN has no public reviews
 * OR Amazon's response shape changed).
 */

import {
  FetchReviewsOptions,
  FetchReviewsResult,
  NormalizedReview,
  ProviderError,
  ReviewsProvider,
} from './types';

const SERPAPI_BASE = 'https://serpapi.com/search';
const REVIEWS_PER_PAGE = 10;
const MAX_PAGES = 20; // safety stop — covers 200 reviews even if requested limit drifts

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
  body?: string;
  rating?: number;
  date?: string;        // e.g. "Reviewed in the United States on March 15, 2025"
  review_date?: string;
  date_iso8601?: string; // when present, prefer this
  verified_purchase?: boolean;
  helpful_votes?: number;
  profile?: { name?: string };
  images?: Array<{ link?: string }>;
  link?: string;
}

interface SerpApiPageResponse {
  reviews?: SerpApiReviewRaw[];
  search_metadata?: { status?: string };
  error?: string;
  pagination?: { next?: string };
}

/**
 * Best-effort ISO normalization. SerpAPI returns either a clean
 * `date_iso8601` field OR a fluffy "Reviewed in the United States on
 * March 15, 2025" string. Try the clean field first.
 */
function normalizeDate(raw: SerpApiReviewRaw): string | undefined {
  if (raw.date_iso8601) {
    const parsed = new Date(raw.date_iso8601);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  const fluffy = raw.date || raw.review_date;
  if (!fluffy) return undefined;
  // Pull "March 15, 2025" out of the fluffy string.
  const monthDayYear = fluffy.match(/([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/);
  if (monthDayYear) {
    const parsed = new Date(monthDayYear[1]);
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
  const body = (raw.body || '').trim();
  if (!body) return null;
  return {
    body,
    title: raw.title?.trim() || undefined,
    rating: clampRating(raw.rating),
    date: normalizeDate(raw),
    verifiedPurchase: Boolean(raw.verified_purchase),
    helpfulVotes: typeof raw.helpful_votes === 'number' ? raw.helpful_votes : undefined,
    author: raw.profile?.name?.trim() || undefined,
    imageUrls: Array.isArray(raw.images)
      ? raw.images.map((i) => i?.link || '').filter(Boolean)
      : undefined,
    source: 'serpapi',
  };
}

/**
 * Defensive dedupe — protects against SerpAPI returning the same review
 * twice on adjacent pages (rare, but documented in their changelog).
 * Key on date + body prefix to catch the same review even if helpful
 * vote counts drifted between page fetches.
 */
function dedupe(reviews: NormalizedReview[]): NormalizedReview[] {
  const seen = new Set<string>();
  const out: NormalizedReview[] = [];
  for (const r of reviews) {
    const key = `${r.date || ''}|${r.body.slice(0, 80)}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function fetchPage(asin: string, page: number, apiKey: string): Promise<SerpApiPageResponse> {
  const url = new URL(SERPAPI_BASE);
  url.searchParams.set('engine', 'amazon_reviews');
  url.searchParams.set('asin', asin);
  url.searchParams.set('page', String(page));
  url.searchParams.set('amazon_domain', 'amazon.com');
  url.searchParams.set('sort_by', 'recent');
  url.searchParams.set('api_key', apiKey);

  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    throw new ProviderError(
      `SerpAPI HTTP ${res.status} on page ${page}: ${body.slice(0, 200)}`,
      'serpapi'
    );
  }
  const json = (await res.json()) as SerpApiPageResponse;
  if (json.error) {
    throw new ProviderError(`SerpAPI error on page ${page}: ${json.error}`, 'serpapi');
  }
  return json;
}

export const serpApiService: ReviewsProvider = {
  name: 'serpapi',

  async fetchReviews(asin: string, opts: FetchReviewsOptions): Promise<FetchReviewsResult> {
    if (!asin || !/^[A-Z0-9]{10}$/i.test(asin)) {
      throw new ProviderError(`Invalid ASIN: "${asin}"`, 'serpapi');
    }
    const apiKey = getApiKey();
    const targetPages = Math.min(MAX_PAGES, Math.ceil(opts.limit / REVIEWS_PER_PAGE));
    const startedAt = Date.now();

    const collected: NormalizedReview[] = [];
    let page = 1;
    while (page <= targetPages && collected.length < opts.limit) {
      const pageData = await fetchPage(asin, page, apiKey);
      const raw = Array.isArray(pageData.reviews) ? pageData.reviews : [];
      const normalized = raw
        .map(normalizeOne)
        .filter((r): r is NormalizedReview => r !== null);
      collected.push(...normalized);
      // Stop early if SerpAPI ran out of reviews before we hit our target.
      if (raw.length < REVIEWS_PER_PAGE) break;
      page += 1;
    }

    const deduped = dedupe(collected).slice(0, opts.limit);

    if (deduped.length === 0) {
      throw new ProviderError(
        `SerpAPI returned 0 usable reviews for ASIN ${asin} — likely no public reviews or response shape drift.`,
        'serpapi'
      );
    }

    return {
      reviews: deduped,
      reachedLimit: deduped.length >= opts.limit,
      latencyMs: Date.now() - startedAt,
    };
  },
};
