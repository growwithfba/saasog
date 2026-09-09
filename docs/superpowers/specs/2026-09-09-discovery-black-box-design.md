# Discovery — Helium 10 Black Box replica

**Date:** 2026-09-09
**Status:** Design approved, pending implementation plan
**Probe:** `docs/keepa-product-finder-probe-2026-09-09.md` (verdict: GO)
**Probe script:** `scripts/probe-keepa-product-finder.ts`

---

## 1. Purpose

BloomEngine has no way to *find* a product. Every entry point — CSV upload, manual
ASIN, BloomLens "Save to Funnel" — starts from an ASIN the user already found
somewhere else. In practice that somewhere else is Helium 10 Black Box.

Discovery closes that gap: a faithful Black Box replica, powered by Keepa's Product
Finder, whose results flow into the BloomEngine funnel instead of dead-ending in a
CSV export. The goal is that a BloomEngine user has no remaining reason to keep a
Helium 10 subscription for product research.

**Non-goals for v1:** user-saved filter presets, multi-marketplace (US only),
Chrome-extension surface, keyword/competitor/niche search modes (Black Box's other
tabs). Scale/quota engineering is explicitly deferred — the current user base is
small and the token budget is workable.

---

## 2. Data source: Keepa Product Finder

Full findings in the probe note. The three properties that shape this design:

**Cost is asymmetric.** `/query` costs 11 tokens and returns up to 10,000 ASINs.
`/product` costs ~1 token per ASIN and is the only way to get price, sales, reviews
or BSR. Finding is nearly free; *displaying* is the entire cost.

**Depth is capped at 10,000.** `page × perPage` must be < 10,000. A filter set
matching 12.7M products is only reachable for its first 10,000 rows. Black Box has
the same ceiling; we surface `totalResults` so the limit is honest.

**Unknown filter keys are silently ignored.** A typo'd key returns the entire
catalog with HTTP 200 and looks like a successful search. This is the single most
dangerous property of the endpoint and §4 is built around it.

Account: 62 tokens/min refill, shared with BloomLens and vetting.

---

## 3. Architecture

Two stages, mirroring the cost asymmetry.

```
POST /api/discovery/search
  filters ──> buildSelection() ──> Keepa /query ──> { asinList[], totalResults }
  11 tokens. Result cached 1h keyed by hash(filters).

POST /api/discovery/hydrate
  25 ASINs ──> keepa_lens_metrics WHERE cache_until > now()   (hit: free)
          └──> Keepa /product for misses only ──> write back  (miss: ~1 token each)
```

Search returns the whole ASIN list. The client pages through it locally and requests
hydration one visible page at a time. Consequences:

- Paging back to an already-seen page costs nothing.
- A second user searching the same category pays almost nothing, because
  `keepa_lens_metrics` is keyed by ASIN globally, not per user.
- A search the user abandons after page 1 costs 11 + ~25 tokens, not 11 + 10,000.

**Cache reuse.** `keepa_lens_metrics` (migration `20260504000000`) already is the
right table: ASIN primary key, 24h TTL on moving fields, JSONB payload holding
BSR/monthlyUnits/monthlyRevenue/dimensions/variationCount, service-role writes only.
Discovery reads and writes it exactly as `/api/extension/enrich` does. **No new
cache table.**

### Modules

| Path | Responsibility |
|---|---|
| `src/lib/discovery/filterSchema.ts` | The allowlist. Single source of truth for every filter. |
| `src/lib/discovery/buildSelection.ts` | Filter values → Keepa `selection` JSON. Throws on unknown keys. |
| `src/lib/discovery/derivedFilters.ts` | Implied bounds + post-filters for what Keepa can't run. |
| `src/lib/discovery/presets.ts` | Built-in presets from the course. |
| `src/app/api/discovery/search/route.ts` | Stage A. |
| `src/app/api/discovery/hydrate/route.ts` | Stage B. |
| `src/app/discovery/page.tsx` | Filter grid + results table. |

Reused unchanged: `src/lib/keepa/*` for hydration, BSR-curve sales estimation,
category resolution and weighted-sibling parent attribution.

---

## 4. The filter schema — structural defence against silent-ignore

Because Keepa accepts and ignores unknown keys, an allowlist maintained by
convention will eventually leak a typo into production and return unfiltered
results that *look* correct. The allowlist is therefore structural: there is no
code path from user input to `selection` that does not pass through the schema.

```ts
interface FilterDef {
  id: string;              // 'reviewCount'
  label: string;           // 'Review Count'
  group: 'product' | 'competitors' | 'sales';
  keepaKey: string;        // 'current_COUNT_REVIEWS'  — probe-verified
  kind: 'range' | 'text' | 'enum' | 'boolean' | 'category';
  unit?: UnitConversion;   // dollars→cents, lb→grams, in→mm, rating×10, months→keepaMinutes
}
```

The filter grid UI, request validation, and `buildSelection()` are all generated
from this one array. `buildSelection()` throws on any key absent from the schema
rather than passing it through. A filter that is not in the schema cannot reach
Keepa, because no path exists.

The schema also owns unit conversion in exactly one place. Keepa's units are not
display units: **prices in cents, weights in grams, dimensions in mm, rating ×10
(4.5 → 45), dates in Keepa-minutes.** Scattering these conversions is how the
numbers silently rot.

### Verified filters (v1)

Product: category, review count, review rating, BSR, listing age, weight,
shipping dimensions, fulfillment (FBA/AMZ), number of images (`imageCount` —
note: *not* `imagesCount`, which is silently ignored), variation count, title keywords.

Competitors: number of sellers, exact brand, exact seller / buy-box seller.

Sales: price, price change %, ASIN sales (units), sales change %.

Keepa extras beyond Black Box, offered because they are free: sales-rank drops
(30/90d), average 90-day BSR, out-of-stock %.

---

## 5. Derived filters

Three Black Box filters have no Keepa equivalent but are recoverable.

**Revenue** is the important one — serious researchers filter on it constantly.
Revenue = price × units, and Keepa can filter both. Given a revenue floor and a
price range, we push the implied unit bound server-side and apply the exact
revenue test to hydrated rows:

```
unitsMin = ceil(revenueMin / priceMax)      // conservative: never excludes a keeper
unitsMax = floor(revenueMax / priceMin)
```

This is a strict superset of the true result set, so nothing valid is lost. It is
efficient only when a price range is set — without one, `priceMax` is unbounded and
the implied floor collapses to zero. The UI therefore nudges for a price range when
revenue is used. (All three built-in presets set one.)

**Exclude brands / exclude title keywords** — post-filter on hydrated rows.
**Sales-to-reviews ratio** — computed from hydrated rows, then filtered.

**Dropped entirely** (no equivalent, no derivation): Frequently Returned Item
Badge, Best Sales Month, Seller Country/Region. These are not rendered — no
disabled controls, no tooltips explaining absence. Users only see filters that work.

**Consequence to respect:** derived filters apply only to rows we have paid to
hydrate. They narrow the visible page, not the 12.7M. Applying them across a
10,000-ASIN result set is unaffordable. The revenue implied-bound trick is what
keeps revenue feeling like a real catalog filter rather than a page refinement.

---

## 6. Information architecture

Research today is really two things: a *phase* and the *store of every saved
product*. Discovery takes over the phase; the store becomes "the Funnel".

```
[▦ My Funnel] │ Discovery → Vetting → Offering → Sourcing
```

- `/dashboard` becomes **My Funnel**: the existing `FunnelDashboard` visual on top,
  today's `Table.tsx` product table beneath it. Reachable by the logo and by an
  explicit "My Funnel" nav button.
- `/research` (index only) redirects to `/dashboard`.
- `/research/[asin]` detail pages are untouched.
- `/discovery` is the new Black Box surface, using the existing `research` phase
  colour and `PhasePill` component.

**Deliberate constraint — labels change, internals do not.** The
`research_products` table, the `research` phase key, the `/research/[asin]` routes
and the `/api/research/*` endpoints keep their names. A true research→discovery
rename would touch hundreds of call sites across the app *and* the Chrome
extension — which is hardcoded to production and cannot be tested on a dev
preview — for zero user-visible benefit.

---

## 7. Results table

Columns from the Black Box results screenshot: Product (thumbnail, title, ASIN,
FBA/FBM badge), Category BSR, Price, Parent Level Sales, ASIN Sales, Parent Level
Revenue, ASIN Revenue, Reviews. Plus two BloomEngine columns: **LQS**
(`listingQualityScore.ts`) and **Add to Funnel**.

Parent-level sales and revenue reuse the existing weighted-sibling attribution
(`project_weighted_sibling_attribution`) rather than introducing a second
estimator. Revenue is derived as price × units — never a Keepa filter result —
consistent with the no-mathematical-band-aids rule: show what Keepa returned.

**Sorting.** Keepa-native columns sort server-side via `sort: [[key, dir]]`, which
re-runs the query for 11 tokens and resets to page 1. Derived columns (revenue,
sales-to-reviews, LQS) sort within the loaded page only, and the UI says so.

**Add to Funnel** creates a `research_products` row via the existing
`/api/research/add-asin` path, unchanged. It runs no vetting: vetting is a
market-level analysis requiring a competitor set, which a lone Discovery ASIN does
not have. It consumes no vetting cap. Rows land in the funnel unvetted, and the
user vets deliberately later.

Note that this costs one Keepa token per save even though Discovery has just
hydrated that ASIN, because the two paths do not share a shape:
`mapSnapshotToResearch()` consumes an `AsinSnapshot` (carrying `price_trend`,
`size_tier`, `sales_year_over_year`, `pending_sources`), which is richer than the
derived-metrics blob in `keepa_lens_metrics`. Making Discovery's hydration produce
`AsinSnapshot`-shaped data would make saving free *and* keep one hydration path in
the codebase — see §11.

---

## 8. Presets

Three built-in presets, verified against the course (Module 02.4, "Winning Product
Criteria"). No user-saved presets in v1.

| Preset | Filters |
|---|---|
| **Winning Product Criteria** | price $20–70 · BSR < 50,000 · reviews < 1,000 · units ≥ 100/mo · revenue $5K–$15K |
| **Weak Competition** | Winning criteria + rating 3.0–4.0 (the course's "if top competitors have 3–4 star ratings, that's gold") |
| **Low-Review Openings** | price $20–70 · BSR < 50,000 · reviews < 200 ("ideally in the low hundreds or less") |

The category picker flags the root categories Module 02.3 tells new sellers to
avoid — edible/topical, electronics, gated/trademarked — as a warning, not a block.
Keepa's `categories_exclude` is silently ignored, so this cannot be enforced
server-side and is presented as guidance.

---

## 9. Testing

`filterSchema`, `buildSelection` and `derivedFilters` are pure functions and are
written test-first. The load-bearing tests:

1. **`buildSelection()` throws on any key not in the schema.** The direct guard
   against the silent-ignore hazard. Includes a test asserting a plausible typo
   (`imagesCount` vs `imageCount`) is rejected rather than passed through.
2. **Every unit conversion round-trips.** $20 → 2000 → $20; 4.5★ → 45 → 4.5.
3. **Implied bounds are a true superset.** Property test: for random
   (price, units) pairs, any row passing the exact revenue test also passes the
   implied unit bound. A failure here silently hides valid products.
4. **`totalResults` is never compared for exact equality** (it drifts ±100).

`scripts/probe-keepa-product-finder.ts` remains the re-runnable integration check
against the live API.

---

## 10. Phasing and release

Each phase is one PR into `dev`. **Nothing reaches production until the whole
feature is complete and Dave has signed off**; `main` gets a single merge at the
end. Phases are review boundaries, not release boundaries — so a problem in
sorting does not force unpicking the nav work.

| Phase | Scope |
|---|---|
| **7.1** | IA: nav restructure, funnel merge into `/dashboard`, `/research` redirect |
| **7.2** | Search core: filter schema, `buildSelection`, search + hydrate routes, basic results table |
| **7.3** | Sorting, pagination, parent attribution, LQS column, derived filters |
| **7.4** | Course presets, category warnings, Add to Funnel |
| **→** | `dev` → `main`, one production ship |

Discovery touches no extension-write paths (it is read-only against Keepa plus one
funnel insert), so unlike prior phases it tests cleanly on a dev preview URL.
One preview link per testing round.

---

## 11. Open questions for implementation

None blocking. Three to resolve in-flight:

1. **Should Discovery hydration produce `AsinSnapshot`?** If yes, Add to Funnel
   becomes free and the app keeps a single hydration path; if no, Discovery carries
   a second, lighter shape and saves cost one token. Decide at the top of 7.2 —
   it determines the hydrate route's return type, so it cannot be deferred past
   that point.
2. **Category picker data.** Keepa's `/category` endpoint returns the full tree;
   whether to ship a static category list or fetch it live is a 7.2 decision.
3. **Search result cache location.** The 1h ASIN-list cache can live in memory or
   in Postgres. In-memory is simpler but does not survive Vercel's function
   recycling; decide in 7.2 once the real hit rate is visible.
