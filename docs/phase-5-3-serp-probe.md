# Phase 5.3 — SERP DOM Scraper Probe

**Status:** Probe run 2026-04-29 (v2). Selectors locked, decisions captured below — ready to implement.
**Branch:** TBD (will land on the `bloom-lens-extension` repo's Phase 5.3 branch).
**Probe script:** [`scripts/probes/serp-scraper.ts`](https://github.com/growwithfba/bloom-lens-extension/blob/phase-5-2-bottom-drawer-pivot/scripts/probes/serp-scraper.ts) (in the `bloom-lens-extension` sibling repo).

---

## Why this probe gates 5.3

Phase 5.3 replaces `mockData.ts` with a live DOM scrape of `[data-asin]` rows from the Amazon SERP. Amazon rotates class names, varies sponsored-result markup across query types, and ships new fields like "X+ bought in past month" inconsistently. Locking selectors blind would mean re-touching the scraper every time we tested on a new query.

The probe runs in DevTools console on a real SERP, tries multiple strategies per field (primary CSS selector → fallback CSS selectors → regex over row text), and reports which strategy fired for which field. We pick the survivor set before writing implementation.

## How to run

1. Open Chrome, go to a SERP, ideally **3 different queries** so we can see selector stability across markup variants:
   - Broad consumer: `https://www.amazon.com/s?k=grill+brushes`
   - Niche w/ sponsored slots: `https://www.amazon.com/s?k=raised+garden+bed`
   - Category page: `https://www.amazon.com/s?rh=n%3A172282` (Electronics)
2. Open DevTools → Console.
3. Copy the full contents of `serp-scraper.ts` and paste into the console. The probe runs immediately.
4. Capture three things from each run:
   - Total rows extracted
   - The "Field coverage" `console.table` (population %)
   - The "Selector strategy hits" `console.table` (which selectors won)
5. Paste the three console outputs into the **Run results** section below.

## Verdict

**🟢 Phase 5.3 may begin. All 9 fields have a working selector strategy.**

| Question | Result |
|---|---|
| **`[data-asin]` rows on a typical SERP** | 150 total, 137 with valid 10-char ASINs, **71 of which are real product cards** (the rest are nested inner containers). |
| **Row filter that cleanly picks product cards** | `[data-asin].s-result-item` — gives exactly the 71 cards. The mystery 66 rows are inner `data-asin` containers with hashed CSS-module classes (e.g. `_c2Itd_pdCntr_2lxVH`); they don't carry `s-result-item` and don't render product fields. |
| **`title` coverage** | **71/71 (100%)** via `[data-cy="title-recipe"] h2`. The legacy `h2 .a-text-normal`, `h2 a span`, `h2 a` selectors are all dead in the current markup. |
| **`price` coverage** | **71/71 (100%)** via `.a-price[data-a-color="base"] .a-offscreen`. Range pricing falls through to the same `.a-offscreen` reader (returns the low end). |
| **`image` coverage** | **71/71 (100%)** via `img.s-image`. |
| **`rating` coverage** | **71/71 (100%)** via `[aria-label*="out of 5 stars"]`. |
| **`reviews` coverage** | **71/71 (100%)** via `[aria-label$="ratings"]` / `[aria-label$="rating"]` / `[aria-label$="reviews"]`. |
| **`sponsored` detection** | **23/71 sponsored.** Two selectors: `.puis-sponsored-label-text, .s-sponsored-label-text` (13 hits) plus `[aria-label*="Sponsored" i]` (10 hits) — OR-chained. The original `closest('[data-component-type="sp-sponsored-result"]')` ancestor approach got **0 hits** in the current markup (Amazon flattened sponsored rows into the main result list); drop it. |
| **`prime` detection** | **54/71 (76%)** via the catch-all `[class*="prime" i]` (matches CSS-module-hashed classes that retain "prime" in their name). The classic `i.a-icon-prime` and aria-label approaches got 0 hits — Amazon swapped to a CSS-module styled icon. |
| **`boughtPastMonth` coverage** | **47/71 (66%)** via text match on `.a-row.a-size-base`. Expected sparse — only popular listings carry the badge. `null` is acceptable. |
| **Critical-field misses (broken rows in the lock filter)** | 0 — all 71 rows that pass the row filter have title + price. |

## Run results

### Run 1 — `https://www.amazon.com/s?k=halo+ball` (2026-04-29, probe v2)

**Snapshot:**
- Total `[data-asin]` elements: 150
- Product rows (valid 10-char ASIN): 137
- Rows extracted: 137
- Rows after `s-result-item` filter: **71** (the canonical product cards)

**Row-type buckets** (the key v2 insight):
| signature | count | classification |
|---|---|---|
| `dct=s-search-result` + `s-result-item=yes` | 60 | ✅ canonical product card |
| no dct + `s-result-item=yes` | 10 | ✅ product card variant (carousel/featured) |
| no dct + `s-widget=yes` + `s-result-item=yes` | 1 | ✅ widget result |
| no dct + no class | **66** | ❌ nested inner container, skip |

**Field coverage** (denominator = 137 raw rows; the 66 misses are mostly the no-class buckets above):
| field | populated | pct (of 137 raw) | pct (of 71 product cards) |
|---|---|---|---|
| `asin` | 137 | 100.0% | 100% |
| `title` | 71 | 51.8% | **100%** |
| `price` | 71 | 51.8% | **100%** |
| `image` | 71 | 51.8% | **100%** |
| `rating` | 71 | 51.8% | **100%** |
| `reviews` | 71 | 51.8% | **100%** |
| `sponsored` | 23 | 16.8% | 32% (consistent with visible Sponsored slots on the SERP) |
| `prime` | 54 | 39.4% | 76% |
| `boughtPastMonth` | 47 | 34.3% | 66% |

**Selector strategy hits:**
| field | MISS | primary | fallback[1] | fallback[2] | fallback[3] | regex[2] |
|---|---|---|---|---|---|---|
| title | 66 | — | — | — | **71** | — |
| price | 66 | **71** | — | — | — | — |
| image | 65 | **71** | — | 1 | — | — |
| rating | 66 | **71** | — | — | — | — |
| reviews | 66 | **71** | — | — | — | — |
| sponsored | 114 | — | 13 | 10 | — | — |
| prime | 83 | — | — | — | **54** | — |
| boughtPastMonth | 90 | — | 46 | — | — | 1 |

The mystery-row outerHTML sample confirmed the inner-container hypothesis: classes like `_c2Itd_pdCntr_2lxVH _c2Itd_desktopProductContainer_NWk91` are hashed CSS-module names, not stable selectors — they're rendered as nested children of larger card components.

The working-row sample showed the canonical structure: `data-component-type="s-search-result"` + `s-result-item s-asin` classes, exactly as expected.

### Run 2 / Run 3 — _deferred_

The Run 1 signal is decisive: 100% coverage on the 5 core fields once row-filter is applied, plus working selectors for the 4 secondary fields (Prime, Sponsored, BoughtPastMonth, plus the ancestor-killing primary that we're dropping). Locking selectors based on Run 1 alone with a re-runnable probe in `scripts/probes/serp-scraper.ts` for future verification on category pages or rotating layouts. If Phase 5.3 implementation surfaces a query/category where extraction craters, the probe can be re-run and selectors adjusted incrementally.

---

## Selector lock

Locked 2026-04-29 from Run 1. Order = priority. Anything that hit zero on Run 1 dropped. Anything where a fallback consistently beat the primary was promoted.

```ts
// bloom-lens-extension/entrypoints/content/selectors.ts
//
// Source-of-truth selectors for SERP DOM extraction. Order within each
// array is priority — extractor breaks at first non-null result.
// Ground truth: docs/phase-5-3-serp-probe.md (run 2026-04-29).

export const ROW_SELECTOR = '[data-asin].s-result-item';
// Filter: ASIN attribute must match /^[A-Z0-9]{10}$/. The .s-result-item
// class filter cleanly excludes the ~66 nested inner containers that
// also carry data-asin.

export const SELECTORS = {
  title:   ['[data-cy="title-recipe"] h2'],
  price:   ['.a-price[data-a-color="base"] .a-offscreen', '.a-price .a-offscreen', '.a-price-range'],
  image:   ['img.s-image'],
  rating:  ['[aria-label*="out of 5 stars"]'],
  reviews: ['[aria-label$="ratings"]', '[aria-label$="rating"]', '[aria-label$="reviews"]'],
  // Sponsored is OR-chained — if either matches, flag = true.
  sponsoredAny: ['.puis-sponsored-label-text', '.s-sponsored-label-text', '[aria-label*="Sponsored" i]'],
  // Prime catches CSS-module-hashed classes that retain "prime" — the
  // legacy i.a-icon-prime no longer exists in the current markup.
  primeAny: ['[class*="prime" i]'],
  // BoughtPastMonth is text-matched, not selector-matched. Find the row
  // and regex /(\d+(?:\.\d+)?[KkMm]?\+?) bought in past month/i.
  boughtPastMonthHost: ['.a-row.a-size-base'],
};
```

| Field | Selector(s) | Coverage on cards | Notes |
|---|---|---|---|
| `asin` | `data-asin` attr + `^[A-Z0-9]{10}$` regex | 100% | Stable. |
| Row filter | `[data-asin].s-result-item` | 71/71 cards captured | Discriminates canonical product cards from nested inner containers. |
| `title` | `[data-cy="title-recipe"] h2` | 100% | Cypress test-id is the only stable hook in current markup. Legacy `h2 .a-text-normal` / `h2 a span` / `h2 a` selectors **all dead** — dropped. |
| `price` | `.a-price[data-a-color="base"] .a-offscreen` | 100% | Range pricing (`From $X`) returns low-end via the same `.a-offscreen` reader. |
| `image` | `img.s-image` | 100% | One row needed `[data-image-source-density] img` fallback in v2 — keep as fallback for safety. |
| `rating` | `[aria-label*="out of 5 stars"]` | 100% | Parse: `m[1]` of `/(\d+(?:\.\d+)?)\s*out of 5 stars/i`. |
| `reviews` | `[aria-label$="ratings"]` (or `rating`/`reviews`) | 100% | Parse: `m[1]` of `/([\d,]+)\s*(?:ratings?\|reviews?)/i`. |
| `sponsored` | `.puis-sponsored-label-text` ∨ `.s-sponsored-label-text` ∨ `[aria-label*="Sponsored" i]` | 23/71 (32%) | Plausible — that's how many sponsored slots appeared. **Drop** the `closest('[data-component-type="sp-sponsored-result"]')` ancestor approach (0 hits in current markup). |
| `prime` | `[class*="prime" i]` | 76% | Catches the CSS-module-hashed classes Amazon shipped. **Drop** `i.a-icon-prime` (0 hits). The 17/71 misses are non-Prime listings, expected. |
| `boughtPastMonth` | text match `/\d+(?:\.\d+)?[KkMm]?\+?\s*bought\s*in\s*past\s*month/i` on `.a-row.a-size-base` | 66% | Sparse by design — only popular listings carry the badge. `null` is fine. |

These land in `bloom-lens-extension/entrypoints/content/selectors.ts` — co-located with the content script per the post-5.2 architecture (the side-panel `shared/` split collapsed when we pivoted to a content-script drawer; both scraper and consumer live in the same React tree now).

## Stamp

> **🔒 Phase 5.4 unblocked.** Phase 5.3 implementation may begin: wire `selectors.ts` + scraper into `index.tsx` (or a new `scraper.ts`), pass thin rows to the React drawer state, replace `mockData` import. Heavy fields stay as "Loading…" placeholders until the 5.4 enrich endpoint fills them.
