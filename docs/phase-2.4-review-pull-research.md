# Phase 2.4 — Automated Review Pulls: Vendor Research & Decision Doc

**Status:** Draft for Dave's review · 2026-04-21
**Author:** Claude (BloomEngine V9 AI engine phase)
**Decision needed:** Primary vendor selection before Phase 2.5 build

---

## TL;DR

**Primary pick: SerpAPI Amazon Reviews.** Dedicated reviews endpoint, all the fields the SSP pipeline needs, US-based legal indemnification on every plan, and the Developer tier ($75/mo) covers ~600 submissions/month at 80 reviews each with room to spare.

**Fallback: Rainforest API (Traject Data).** Wired behind the same provider interface so a SerpAPI outage auto-routes to Rainforest without user-visible failure.

**Estimated monthly cost:** $75/mo in steady state (SerpAPI alone). $158/mo worst case if we pay Rainforest in parallel for redundancy at launch.

**Three of the five candidates got ruled out.** Keepa doesn't return review text (only counts and ratings), Oxylabs has no dedicated Amazon reviews endpoint, and Bright Data is the most legally exposed of the three capable vendors.

---

## Candidates evaluated

1. Keepa Reviews
2. Rainforest API (Traject Data)
3. Oxylabs Amazon Scraper API
4. Bright Data Amazon Reviews Scraper
5. SerpAPI Amazon Reviews

---

## Why the three rule-outs

### Keepa Reviews — ❌ *No review body text*

Keepa's product data API returns review **count** and **average rating** (including historical series), but not individual review text, author, date, verified-purchase flag, or helpful votes. Keepa's own `ratingCount` history has also been frozen since April 9 2025 because Amazon removed that public data point. We use Keepa today for BSR + price, so the integration cost would have been near-zero — but the data just isn't there.

### Oxylabs — ❌ *No first-class reviews endpoint*

Oxylabs ships six Amazon targets in their Web Scraper API (product, search, pricing, sellers, bestsellers, and a generic URL target) — but no dedicated `amazon_reviews` target in the current docs. To pull reviews we'd need to hit the generic URL endpoint with a custom HTML parser, which negates the "pay a vendor" premise — we'd own scraper maintenance forever. Their infrastructure is strong (98%+ success rate, 50 req/s standard concurrency) but the abstraction we need isn't there.

### Bright Data — ❌ *Legal exposure*

Bright Data has a dedicated Amazon Reviews scraper (`brightdata.com/products/web-scraper/amazon/reviews`) with a `max_reviews` parameter and all the fields we need. Pricing is competitive at $1.50 per 1K records ($60/mo at our projected volume). The block is the legal picture: Bright Data is the former Luminati, currently a defendant in scraping-related litigation from Meta and X/Twitter. Those suits target Bright Data, not its customers, but the company does not offer customer indemnification the way SerpAPI does. For a SaaS approaching public launch this is the riskiest of the three otherwise-capable options.

---

## The two that made the cut

### SerpAPI Amazon Reviews (recommended primary)

Dedicated endpoint at `serpapi.com/amazon-product-reviews-information` via `engine=amazon_reviews`. Returns title, body, rating, date, verified-purchase flag, helpful votes, author, profile link, and images. 10 reviews per page via `page` pagination. For the 80 reviews per submission we analyze today, that's 8 API calls per submission.

**Pricing (2026 plans):**

| Plan | Monthly cost | Searches included | Cost per search |
|---|---|---|---|
| Developer | $75 | 5,000 | $0.015 |
| Production | $150 | 15,000 | $0.010 |
| Big Data | $275 | 30,000 | $0.009 |

**Concurrency:** Developer = 1,000 searches/hour. Production = 3,000/hour. No search rollover — unused searches evaporate each month.

**Why it wins:**
- **US Legal Shield** — SerpAPI defends customers against scraping-related litigation, on every paid plan. Nobody else offers this.
- Dedicated reviews engine, stable since 2016, all the fields the SSP pipeline reads.
- Minor outage history logged on StatusGator (22 min in Aug 2025, 3 min in Dec 2025) — within acceptable SLA for a non-real-time feature.
- Clean JSON shape, no parser maintenance required on our side.

**Known concerns:**
- Pagination is capped at Amazon's own ~100 visible reviews per sort order without filter tricks. At 80 reviews per submission we're safely under the cap.
- No search rollover means we have to plan for peak-month usage, not average-month.

### Rainforest API (Traject Data) (recommended fallback)

Also a dedicated Amazon-data vendor, with a `type=reviews` request type returning the same field set. Traject Data is US-based, well-documented, and has the cleanest Amazon docs of any vendor in this category.

**Pricing:**

| Plan | Monthly cost | Credits | Cost per call |
|---|---|---|---|
| Starter | $83 | 10,000 | $0.0083 |
| Production | $375 | 250,000 | $0.0015 |

**Why it's the fallback, not the primary:**
- **2025 degradation.** Amazon changed their review sort order and Rainforest's `reviews` v2 endpoint lost access to "most recent" review ordering. Rainforest now recommends pulling top reviews via `type=product`, which limits pagination depth and changes which reviews you get. Trustpilot reviews confirm the complaint ("first page only" showing up repeatedly through 2025). SerpAPI hasn't been affected the same way.
- **No legal indemnification** — still a low-risk US vendor, but not SerpAPI-low.

**Why it's still the right fallback:**
- At our launch volume it's $83/mo vs SerpAPI's $75/mo — effectively the same price.
- Same field set as SerpAPI, so the normalizer built for Phase 2.5 maps trivially.
- If SerpAPI is down, Rainforest going "top reviews only" is still much better than 0 reviews for our AI analysis.

---

## Cost math at BloomEngine volume

Each submission pulls 80 reviews. Each vendor returns 10 reviews per page → **8 API calls per submission**.

| Submissions/mo | API calls/mo | SerpAPI plan | Rainforest plan | SerpAPI cost | Rainforest cost |
|---|---|---|---|---|---|
| 100 | 800 | Developer (5K/mo) | Starter (10K/mo) | $75 | $83 |
| 500 | 4,000 | Developer (5K/mo) | Starter (10K/mo) | **$75** | **$83** |
| 1,000 | 8,000 | Production (15K/mo) | Starter (10K/mo) | $150 | $83 |
| 2,000 | 16,000 | Production (15K/mo) — need top-up | Starter (10K/mo) — need top-up | ~$200 | ~$200 |
| 5,000 | 40,000 | Big Data (30K/mo) — or custom | Production ($375 / 250K) | ~$400 | $375 |

At **launch volume (estimated 100–500 submissions/mo)**: SerpAPI Developer tier covers us clean at $75/mo.

At **scale (5K+ submissions/mo)**: Rainforest's per-call economics pull ahead. We keep the provider abstraction so we can flip primary when the math inverts.

**Parallel-redundancy cost** (both providers live, each handling a share): $75 + $83 = **$158/mo** at launch. That's likely worth it for the first 90 days while we earn trust in either vendor's uptime.

---

## Legal risk ranking

1. **SerpAPI — low.** US-based, explicit Legal Shield indemnification on paid plans, no known litigation.
2. **Rainforest (Traject Data) — low.** US-based structured-data vendor, transparent docs, clean reputation.
3. **Keepa — low.** Long-established, used openly by Amazon sellers, but moot — capability ruled it out.
4. **Oxylabs — medium.** Lithuanian residential-proxy vendor, their own docs tell users to consult counsel.
5. **Bright Data — medium-high.** Former Luminati, active defendant in scraping suits from Meta and X. Customer indemnification is not as explicit as SerpAPI's.

**Note on Amazon's SP-API:** For a moment we considered using Amazon's own Selling Partner API. It does NOT expose third-party review pulls. SP-API reviews endpoints are limited to the seller's own listings, and as of 2026 Amazon is introducing a $1,400/yr + usage fee for SP-API access regardless. Not viable for BloomEngine's vetting workflow, which scans listings the user does NOT own.

---

## Recommended implementation shape for Phase 2.5

```
src/services/reviews/
  providers/
    serpApi.ts         // primary
    rainforest.ts      // fallback
  types.ts             // ReviewsProvider interface, normalized Review shape
  index.ts             // getReviewsProvider() — picks primary, failover-aware
  cache.ts             // Supabase-backed per-ASIN cache (TTL 7d)
```

**Provider interface sketch:**
```ts
export interface ReviewsProvider {
  name: 'serpapi' | 'rainforest';
  fetchReviews(asin: string, opts: { limit: number }): Promise<NormalizedReview[]>;
}

export interface NormalizedReview {
  body: string;
  title?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  date: string;              // ISO
  verifiedPurchase: boolean;
  helpfulVotes?: number;
  author?: string;
  imageUrls?: string[];
  locale?: string;
}
```

**Flow:**
1. User clicks "Pull reviews" on the offer page (or it runs auto after a vetting save).
2. Route hits `getReviewsProvider()` → returns SerpAPI client by default.
3. SerpAPI client makes 8 paginated calls for 80 reviews, dedupes, returns normalized array.
4. On any SerpAPI failure class (5xx, rate-limit, timeout), auto-route to Rainforest client with identical signature.
5. Normalized reviews get persisted to `offer_products.reviews` and then pipe into the existing `generateReviewAnalysisJSON` → SSP flow we shipped in Phase 2.2.
6. Cache per-ASIN for 7 days so re-pulls during the same research session don't re-bill.

**Observability:** every fetch goes through `withTracking()` from `src/utils/observability.ts`, provider-tagged, logged to `usage_events` so we can see vendor cost/latency/error rates per user in the Phase 6 billing dashboard.

---

## Pilot plan before committing to a vendor

Before we sign a plan, run a 5-ASIN pilot against both vendors and compare:

1. Pick 5 ASINs across categories we've vetted historically (one each: high-review / low-review / recently-launched / bundle / multipack).
2. For each ASIN, pull 80 reviews from both SerpAPI and Rainforest.
3. Diff the sets: how many reviews overlap? How many are unique to each? How recent is the newest review from each?
4. Feed each vendor's review set through `generateReviewAnalysisJSON` and compare the SSP output — are the `pain_clusters` and `market_verdict` materially different?
5. Log wall-clock latency and error rate.

**Acceptance bar:** SerpAPI must return at least 60 unique reviews per ASIN (with at least 30 from the last 12 months) AND produce SSP output indistinguishable from the current manual-upload flow.

**Cost:** ~$5 of SerpAPI credits + ~$5 Rainforest — we can run this pilot without committing to a paid plan yet (both vendors have trial credits).

**Duration:** 1 day of engineering + 1 day to review the SSP outputs.

---

## Open questions for Dave

These affect the final plan selection and the architecture:

1. **Expected launch volume.** What's the realistic submissions-per-month target for the first 90 days after V9 ships? My math assumes 100–500. If you think it's >1K, we should start on SerpAPI Production ($150) to avoid mid-month overage.
2. **Cache TTL.** Currently the plan caches per-ASIN for 7 days. That means if a user re-pulls the same ASIN within a week, we don't re-bill. Is 7 days the right window, or do you want fresher data (3 days, 24h) at the cost of more API spend?
3. **Manual CSV path.** Do we keep the manual CSV/DOCX upload as a fallback after Phase 2.5 ships? (My recommendation: yes — it's the only option if both vendors go down, and some users may have private review data they want to analyze that isn't on Amazon.)
4. **Pilot timing.** Can you approve a 1-day pilot in the next week? Or do you want to wait until Phase 2.4-2.7 are all planned before running any external API calls?
5. **Bright Data exception.** The $60/mo pay-as-you-go is cheaper than both recommended vendors. Want me to reconsider if you're OK with the legal exposure? I'm leaving it out because we're approaching public launch.

---

## What this doc is NOT

- Not a commitment to SerpAPI — I want the pilot results before we sign a plan.
- Not an implementation plan. Phase 2.5 will turn this into a build plan with tickets, branches, and acceptance tests.
- Not a vendor contract analysis — if we end up signing with SerpAPI, their ToS should be read by you or a lawyer (not me) before committing.

---

## Sources

- [Keepa Python API methods](https://keepaapi.readthedocs.io/en/latest/api_methods.html)
- [Keepa API Reference (Data Virtuality)](https://docs.datavirtuality.com/connectors/keepa-api-reference)
- [Rainforest API pricing](https://trajectdata.com/pricing/rainforest-api)
- [Rainforest API product updates](https://docs.trajectdata.com/rainforestapi/product-updates)
- [Rainforest Trustpilot reviews](https://www.trustpilot.com/review/rainforestapi.com)
- [Oxylabs Amazon Scraper API](https://oxylabs.io/products/scraper-api/ecommerce/amazon)
- [Oxylabs Amazon targets docs](https://developers.oxylabs.io/scraping-solutions/web-scraper-api/targets/amazon)
- [Bright Data Amazon Reviews Scraper](https://brightdata.com/products/web-scraper/amazon/reviews)
- [Bright Data Amazon Reviews Dataset](https://brightdata.com/products/datasets/amazon/reviews)
- [SerpAPI pricing](https://serpapi.com/pricing)
- [SerpAPI Amazon Product Reviews Information API](https://serpapi.com/amazon-product-reviews-information)
- [SerpAPI Legal Shield policy](https://serpapi.com/legal-us-shield)
- [Amazon SP-API fees for 2026](https://ppc.land/amazon-introduces-fees-for-third-party-developer-api-access-in-2026/)
