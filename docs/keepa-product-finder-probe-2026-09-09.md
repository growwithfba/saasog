# Keepa Product Finder (`/query`) — Black Box feasibility probe

**Date:** 2026-09-09
**Question:** Can Keepa's Product Finder endpoint back a Helium 10 Black Box replica inside BloomEngine?
**Verdict: GO** — with four filter gaps that must be handled client-side or dropped.
**Re-run with:** `npx tsx scripts/probe-keepa-product-finder.ts`

---

## 1. Endpoint mechanics (confirmed)

| Property | Value |
|---|---|
| Endpoint | `GET https://api.keepa.com/query?key=…&domain=1&selection=<json>` |
| Cost | **11 tokens per call, regardless of `perPage`** |
| Returns | `asinList` (ASINs only) + `totalResults`. **No product data.** |
| `perPage` | min 50, max 10,000 |
| Pagination | `page × perPage` must be **< 10,000**. `perPage=50 page=199` OK; `page=200` errors |
| Sort | `sort: [["current_SALES","desc"]]` — confirmed to reorder results |
| Account | refillRate **62 tokens/min** (~89k/day), 3,720 bank |

`totalResults` drifts by ~±100 between identical calls — never assert exact equality on it.

### The 10,000-result ceiling

A filter set matching 12.7M products is only reachable for its first 10,000 rows. This matches Black Box, which also caps result depth — the product answer is the same as H10's: **push users to narrow their filters**, and surface `totalResults` so they know how much they're not seeing.

### Cost model

Finding is cheap; **displaying is expensive.**

```
1 search  = 11 tokens              (up to 10,000 ASINs)
1 row     =  1 token to hydrate    (/product, for price/sales/reviews/BSR)
```

A 50-row page therefore costs ~61 tokens. At 62 tokens/min — a pool shared with
BloomLens and vetting — that is roughly **one 50-row page per minute across all
users**. Mitigations agreed at design time: a shared (not per-user) hydration
cache, and hydrating only rows actually on screen.

---

## 2. ⚠️ Unknown filter fields are SILENTLY IGNORED

This is the single most dangerous property of the endpoint.

```
selection = {"categories_include":[2617941011], "totally_bogus_field_xyz":5}
  -> HTTP 200, tokensConsumed 11, totalResults 12,750,200   (i.e. UNFILTERED)
```

No error, no warning. **A typo'd filter name returns the whole catalog and looks
like a successful search.** Implications:

1. Every filter name must come from a hard-coded, probe-verified allowlist. Never
   pass user-supplied keys through to `selection`.
2. Anything not on the allowlist must be rejected loudly in our own code.
3. This probe verifies a field by asserting `totalResults` *moves off baseline*,
   not that the call succeeds.

---

## 3. Filter coverage vs the Black Box grid

Baseline: `{categories_include:[2617941011], productType:[0,1]}` → 12,752,700 results.
(Sanity-checked against `/search?type=category`, which reports `productCount`
12,664,355 for that category — the huge number is real; Keepa counts every product
it has ever tracked, not just live listings.)

### ✅ Supported natively

| Black Box field | Keepa `selection` key | Verified |
|---|---|---|
| Category & Subcategory | `categories_include` / `rootCategory` | 25,000 |
| Review Count | `current_COUNT_REVIEWS_gte/_lte` | 547,800 |
| Review Rating | `current_RATING_gte/_lte` (×10: 4.5 → 45) | 2,563,200 |
| Best Seller Rank | `current_SALES_gte/_lte` | 589,800 |
| Listing Age (Months) | `listedSince` (or `trackingSince`) | 7,521,400 |
| Weight (lb) | `itemWeight` / `packageWeight` (grams) | 2,925,100 |
| Shipping Size | `packageLength/Width/Height` (mm) | 6,592,600 |
| Fulfillment | `buyBoxIsFBA`, `current_AMAZON_gte` | 1,440,800 |
| Number of Images | **`imageCount`** (not `imagesCount`) | 7,718,900 |
| Variation Count | `variationCount` | 2,490,900 |
| Title Keywords | `title` | 220,900 |
| Number of Sellers | `current_COUNT_NEW_gte/_lte` | 7,862,800 |
| Exact Brand Search | `brand` (array) | 12,000 |
| Exact Seller Search | `sellerIds` / `buyBoxSellerId` | 97,000 |
| Price | `current_NEW` / `current_BUY_BOX_SHIPPING` (cents) | 2,566,700 |
| Price Change (%) | `deltaPercent30_NEW` / `deltaPercent90_NEW` | 457,900 |
| ASIN Sales (units) | `monthlySold_gte/_lte` | 51,500 |
| Sales Change (%) | `deltaPercent90_SALES` | 1,338,200 |

Bonus fields Keepa offers that Black Box does not: `salesRankDrops30/90`,
`avg90_SALES`, `outOfStockPercentage90`, `hasParentASIN`, `isSNS`, `numberOfItems`,
`lastRatingUpdate`.

### ❌ Not supported — confirmed ignored

Each was retried under every plausible alternate name and left `totalResults`
inside the noise band:

| Black Box field | Tried | Workaround |
|---|---|---|
| Frequently Returned Item Badge | `returnRate`, `isHighReturnRate` | **None. Drop the filter.** |
| Parent/ASIN **Revenue** | `revenue`, `monthlyRevenue` | Derive `price × monthlySold` after hydration; filter client-side |
| Seller Country/Region | `sellerCountry` | **None natively.** Would need per-seller lookups |
| Exclude Brands / Exclude Title Keywords | `brand: ["!x"]` → 0 results (literal match) | Post-filter hydrated rows client-side |
| Sales to Reviews Ratio | — | Derive after hydration |
| Best Sales Month | — | **None. Drop the filter.** |
| Parent Level Sales/Revenue | — | Keepa is ASIN-level; reuse BloomEngine's existing weighted-sibling attribution |

**Consequence:** any filter marked "derive/post-filter" can only be applied to rows
we have already paid to hydrate. Applying them to a 10,000-ASIN result set is not
affordable. They must be presented as *refinements of the visible page*, not as
catalog-wide filters — or the UI will imply a search it cannot perform.

---

## 4. Constraints that shape implementation

1. **Allowlist filter keys.** Non-negotiable, per §2.
2. **Two-stage cost.** `/query` for ASINs → `/product` for the visible page only.
3. **Cache hydration globally**, keyed by ASIN with a 24h TTL — not per user.
   Popular categories become near-free after the first search.
4. **Units are not display units.** Prices in cents, weights in grams, dimensions
   in mm, rating ×10, dates in Keepa minutes. Conversion belongs in one place.
5. **Cap depth at 10,000** and show `totalResults` so the ceiling is honest.
6. **Revenue is derived, never filtered.** Consistent with the no-band-aids rule:
   show what Keepa returned, compute revenue from price × units.

## 5. Fallbacks if this had been NO-GO

Not needed. For the record: SP-API `getCatalogItems` has no BSR-range search;
Jungle Scout's API is per-seat and pricier; DOM scraping Amazon's own filters is
fragile and against ToS. Keepa remains the right call.
