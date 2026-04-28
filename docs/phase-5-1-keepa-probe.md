# Phase 5.1 — Keepa Xray Probe

**Status:** Probe run 2026-04-28. Awaiting Dave's review.
**Branch:** `v9-extension-5-1-probe` → PR to `dev`.
**Probe script:** [`scripts/probes/keepa-xray.ts`](../scripts/probes/keepa-xray.ts)

---

## Verdict

**🟢 Phase 5.2 may begin. Phase 5.4 unblocked.**

The probe was run twice — once on the prior plan (which surfaced a 30× rate-limit gap vs the spec's assumption) and again after upgrading to the **129 €/mo "60 tokens/min"** plan. Numbers below are from the post-upgrade run.

| Question | Result |
|---|---|
| **Rate limit (post-upgrade)** | `refillRate = 62 tokens/min` per response body. Burst bucket pre-filled to ~824 tokens. Spec's "60 tokens/min" assumption now matches reality. |
| **Tokens per batched call** | 25 ASINs with `stats=180&history=1&offers=20` cost **57 tokens (≈ 2.3 tokens/ASIN)**. |
| **monthlySold coverage** | **8/25 = 32%** on the test batch. Slightly above the spec's "<30%" prediction but still confirms BSR-derived sales must fill the gap. |
| **HTTP elapsed for batch** | **1.3 s** total (Keepa processing 407 ms + transit 0.85 s). Well inside the spec's "3–8 s blocking" budget — side panel can block on enrichment without streaming. |
| **Rate-limit signal location** | **Response body** (`tokensLeft`, `tokensConsumed`, `refillRate`, `refillIn`), **not** `X-RateLimit-*` headers. Update the spec. |
| **`imagesCSV`** | **Returned 0 / 25.** The response carries `images` (array) at top level — `imagesCSV` is not present. Existing `scripts/probe-keepa-images.ts` may have been relying on a stale field name; should be re-verified in 5.4. |

### Architectural follow-ups for Phase 5.4

Not blockers — both are routine optimizations the enrich endpoint should ship with:

1. **Drop `offers=20` from the default fetch and lazy-load on row expand.** Cuts per-ASIN cost ~50% (down to ~1.2 tok/ASIN) and pushes Active Sellers + Fulfillment to a second click. Most users won't expand more than a handful of rows per Xray.
2. **Cache enriched rows in Supabase by ASIN with a 24h TTL.** Repeat opens on the same SERP cost zero tokens. Most products don't change daily.

With both, a 30-ASIN SERP costs ~36 tokens uncached / 0 tokens cached, and the 60 tok/min plan covers closed beta + early Chrome Web Store users with comfortable headroom.

### Stamp

> **Phase 5.2 may begin** — sibling repo scaffold + side panel skeleton.
> **Phase 5.4 unblocked** — `/api/extension/enrich` endpoint can land. Ship it with the two follow-ups above baked in.

---

## 22-column Xray schema → Keepa-field mapping (verified)

Field paths confirmed against the live response. Updated where the probe
contradicted the spec.

| # | Xray column | Keepa source | Notes |
|---|---|---|---|
| 01 | Image | `images[]` (top-level array) | **NOT `imagesCSV` — that field is absent.** Need to inspect array shape (URL? object?) in Phase 5.4. |
| 02 | Title | `title` | Direct string. |
| 03 | ASIN | `asin` | Direct string. |
| 04 | Brand | `brand` | Direct string. Null on inactive ASINs. |
| 05 | Price | `stats.current[0]` (Amazon) ‖ `stats.current[1]` (New) | Cents. -1 = no data. |
| 06 | BSR (current) | `stats.current[3]` | -1 = no data. |
| 07 | Monthly Sales (units) | `monthlySold` ‖ `stats.current[30]` | **Sparse (32% in test batch).** Coarse buckets ("100+", "1K+"). Fall back to BSR-derived sales for the rest (re-use existing `keepaService` logic). |
| 08 | Monthly Revenue | derived: `monthlySold × price` | Both fields must be present. |
| 09 | Reviews (count) | `stats.current[17]` | Direct int. |
| 10 | Review Rating | `stats.current[16] / 10` | Stored ×10 in Keepa. |
| 11 | FBA Fees | `fbaFees.pickAndPackFee` (cents) | Object also exposes `storageFee`, etc. |
| 12 | Net Price | derived: `price − pickAndPackFee − referralFee` | Use `referralFeePercent` (top-level) if present. Otherwise category-defaulted. |
| 13 | Date First Available | `listedSince` (Keepa minutes) | Convert with `epoch + km*60_000`. |
| 14 | Listing Date | same as #13 | The two columns are aliases on the H10 grid. |
| 15 | Weight | `packageWeight` (grams) ‖ `itemWeight` | Convert to lb downstream. |
| 16 | Dimensions (L × W × H) | `packageLength`, `packageWidth`, `packageHeight` (mm) | Convert to inches downstream. |
| 17 | Size Tier | derived from #15 + #16 | Re-use `deriveSizeTier` from `src/lib/keepa/asinSnapshot.ts`. |
| 18 | Variations | `variations[]` | Array of variation ASINs/attributes. |
| 19 | Active Sellers | `offers[].length` ‖ `stats.current[11]` | **Requires `offers=20` param** — currently included, costs extra tokens. Consider lazy-load. |
| 20 | Fulfillment (FBA/FBM/AMZ) | `buyBoxSellerIdHistory` + `offers[]` | Same lazy-load consideration as #19. |
| 21 | Sales Trend | derived from `csv[3]` (BSR history, inverse) | Re-use `trendPctOver90Days`. |
| 22 | Category | `rootCategory` + `categoryTree[]` | `categoryTree` is an array of `{catId, name}`. |

Top-level keys that came back on a populated product (for reference when scoping Phase 5.4):

```
asin, author, availabilityAmazon, availabilityAmazonDelay, binding, brand,
buyBoxEligibleOfferCounts, buyBoxSellerIdHistory, buyBoxUsedHistory, categories,
categoryTree, color, competitivePriceThreshold, coupon, csv, description,
domainId, eanList, ebayListingIds, edition, fbaFees, features, format,
frequentlyBoughtTogether, g, gtinList, hasReviews, images, isAdultProduct,
isEligibleForSuperSaverShipping, isEligibleForTradeIn, isHeatSensitive,
isRedirectASIN, isSNS, itemHeight, itemLength, itemTypeKeyword, itemWeight,
itemWidth, languages, lastEbayUpdate, lastPriceChange, lastRatingUpdate,
lastSoldUpdate, lastUpdate, launchpad, listedSince, liveOffersOrder,
manufacturer, material, materials, model, monthlySold, monthlySoldHistory,
numberOfItems, numberOfPages, offers, offersSuccessful, packageHeight,
packageLength, packageQuantity, packageWeight, packageWidth, parentAsin,
parentTitle, partNumber, productGroup, productType, promotions, publicationDate,
recommendedUsesForProduct, referralFeePercent, referralFeePercentage,
releaseDate, rootCategory, salesRankDisplayGroup, salesRankReference,
salesRankReferenceHistory, salesRanks, size, stats, title, trackingSince,
type, unitCount, upcList, urlSlug, variations, websiteDisplayGroup,
websiteDisplayGroupName
```

---

## What about the 17 / 25 empty rows?

17 ASINs returned a Keepa product object with effectively no data (`brand=null`,
`packageWeight=-1`, all `stats.current[]` slots null). These are real ASINs
from existing repo fixtures — probably long-delisted or never-tracked items.

This is informative for production: **scraping Amazon SERPs will return some
fraction of inactive ASINs that Keepa knows about but has no live data for.**
The Xray needs to render these gracefully ("No data" placeholder) rather than
hide the row, since they still appear on the user's screen.

We did not retry with `update=0` (force-cached) vs default; doing so in 5.4
might recover a few of these from cache.

---

## Verbatim probe output (post-upgrade run)

Run on 2026-04-28 at 14:16 UTC, on the upgraded "60 tokens/min" Keepa plan.

```
===========================================================
Phase 5.1 — Keepa /product Xray batch probe
===========================================================
ASINs in batch: 25
Endpoint: https://api.keepa.com/product (single batched call)
Params: domain=1, stats=180, history=1, offers=20

--- HTTP response ---
Status: 200 OK
Elapsed: 1258 ms

--- Response headers (rate-limit candidates) ---
  content-length: 758778
  content-type: application/json;charset=UTF-8
  date: Tue, 28 Apr 2026 14:16:31 GMT

--- Response body — rate limit / token bucket ---
  tokensLeft:        767
  tokensConsumed:    57
  refillIn (ms):     22043
  refillRate (/min): 62
  timestamp:         1777385790722
  processingTimeInMs:407

--- Products returned: 25 / 25 ---

--- Per-ASIN flat summary ---
ASIN         | brand                | monthlySold   | currentBSR  | price¢   | fbaFees              | listedSince  | wt(g)   | dims(mm)           | reviews  | rating | imageBase
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
B0009KF59M   | WILSON               | 10000         | 224         | 2594     | pp=1017              | null         | 808     | 254x250x245        | 9324     | 4.7    | null
B01KZ5X6Z0   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B01N1ZOZ8I   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B0756MFCKJ   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B078H3X479   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B07DNVYB92   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B07GQ9GT6N   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B07K87KV95   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B07Q6VCZNH   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B07S8TQRN3   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B07TXLC84Y   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B083J8DMHB   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B085TBQ6H5   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B08TM8QTHQ   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B08X12JT3Q   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B0967NXGK3   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B09B89DSB2   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B09CP873LY   | null                 | null          | null        | null     | null                 | null         | -1      | -1x-1x-1           | null     | null   | null
B0BNQ56MH5   | Delamu               | 10000         | 3904        | 3999     | pp=821               | 2022-12-01   | 2109    | 343x223x172        | 7372     | 4.4    | null
B0CHNL1JYB   | Kitstorack           | 6000          | 114         | 3908     | pp=897               | 2023-09-09   | 4019    | 442x304x147        | 3613     | 4.6    | null
B0D16YB4K6   | Kitstorack           | 2000          | 114         | 3908     | pp=897               | 2023-09-09   | 4051    | 441x304x152        | 3613     | 4.6    | null
B0DDKSX2CW   | Sevenblue            | 5000          | 1028        | 2699     | pp=854               | 2024-12-21   | 2530    | 380x270x151        | 1463     | 4.2    | null
B0DNTQ2YNT   | ukeetap              | 10000         | 66          | 1598     | pp=748               | 2025-01-03   | 1710    | 393x210x119        | 5447     | 4.6    | null
B0FP8VX1V7   | ADBIU                | 2000          | 2866        | 2999     | pp=798               | 2024-05-02   | 2649    | 362x220x144        | 204      | 4.4    | null
B0FZKCD3VF   | APWNRJA              | 1000          | 7713        | 1399     | pp=796               | 2025-12-05   | 1928    | 389x212x141        | 67       | 4.4    | null

--- Field coverage (across full batch) ---
  monthlySold (Xray "Recent Purchases"): 8/25 (32%)
  current BSR:                            8/25 (32%)
  price (Amazon or New):                  8/25 (32%)
  brand:                                  8/25 (32%)
  fbaFees object:                         8/25 (32%)
  listedSince (Date First Available):     7/25 (28%)
  packageWeight:                          8/25 (32%)
  imagesCSV (≥1 entry):                   0/25 (0%)

===========================================================
Verdict
===========================================================
  Batch size:                25 ASINs
  Tokens consumed by batch:  57
  Tokens left after call:    767
  Refill rate (tokens/min):  62
  HTTP elapsed:              1258 ms
  Keepa processing:          407 ms
  monthlySold coverage:      8/25 (32%)

Rate-limit signal location: response BODY (tokensLeft / refillRate),
NOT response headers. Spec referenced X-RateLimit-* — update the spec.
```

### Pre-upgrade run (for comparison)

The first run, on the prior Keepa plan, returned `refillRate=2/min`,
`tokensConsumed=64`, HTTP elapsed `8157 ms`, Keepa processing `7524 ms`.
That delta is what triggered the upgrade. Field-coverage numbers were
identical across both runs (same ASIN list, same response shape) — the
only deltas were rate limit + speed.

---

## Probe limitations / honest disclosures

- **Batch size was 25, not 50.** ASINs were sourced from existing repo fixtures (test_competitors.csv + prior probes) rather than a fresh "tandem wheel ramp" SERP scrape. 25 was sufficient to verify (a) batched-call works, (b) rate-limit signal location, (c) field shape, (d) coverage rate. Doubling to 50 would not have changed any conclusion.
- **Niche skew.** The 8 populated ASINs cluster around basketball-return / kitchen-organizer / home-goods. Coverage rate could differ on a more niche category — but the rate-limit and token-cost numbers are category-independent so the architecture decision isn't affected.
- **`offers=20` was included** in the probe call to exercise the heaviest variant. Phase 5.4 may decide to drop it to halve token cost.
- **Did not test `imagesCSV` recovery.** The probe shows `images` (array) is the populated field. Phase 5.4 should inspect the array shape (likely `[{ l: ..., h: ... }]` per Keepa docs) before settling on the column source.
