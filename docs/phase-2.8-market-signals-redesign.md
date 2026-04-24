# Market Climate — Ground-Up Redesign Proposal

**Author:** Claude (paired with Dave)
**Updated:** 2026-04-24
**Status:** Draft v2 — major rewrite, supersedes the 2026-04-23 version
**Branch:** `v9-score-save` (2.8a shipped as `eb312c8`)

---

## Why this document exists (v2)

The v1 proposal (2026-04-23) promised a polished line chart with at-a-glance climate cards. We shipped the framing layer as Phase 2.8a — renamed the section to **Market Climate**, auto-selected top-5, defaulted to 12mo, piped `removedAsins` — but when Dave compared the result side-by-side with the Keepa Chrome extension on the same ASIN, the conclusion was clear: **we are throwing away most of the signal, and a prettier line chart doesn't fix that.**

Keepa hands us 30+ distinct time series per ASIN at hourly (some minute-level) granularity, plus launch dates, offer-count history, buy-box ownership history, FBA fee estimates, and monthly-sold trends. We currently fetch 8 series, aggregate to monthly medians, and discard ~70% of the detail that makes Keepa's own extension compelling to look at.

**The redesign goal:** build the most insightful, narrative-driven market-history view in the Amazon product-research space. Keepa has the best raw data and the worst explanation layer. Helium 10 / Jungle Scout / SmartScout each solve one corner (cohort view, brand trajectory, share-of-voice) but none of them tell the story. That's the gap BloomEngine owns.

**The product pitch:**

> "Explain this ASIN's last 24 months to me in 30 seconds, with peer context."

Everything below serves that one sentence.

---

## Part 1 — What we're throwing away

### 1.1 Keepa CSV series we don't fetch

Our fetch URL today (`src/app/api/keepa/products/route.ts:106`):

```
/product?key=${apiKey}&domain=${domain}&asin=${asins.join(',')}&stats=180&history=1
```

We parse 8 CSV types. Keepa actually returns 30+. Below are the ones worth adding, by leverage:

| CSV Idx | Name | Why it matters | Current status |
|---|---|---|---|
| **4** | **LISTPRICE** | MSRP / list-price anchor. Buy Box below list = active discount; Buy Box = list = full price. Without it we can't tell price-anchor behavior. | **Not fetched** |
| **10** | **NEW_FBA** | Lowest 3P-FBA price excluding Amazon. The real "competitor at rest" price. | **Not fetched** |
| **16** | **RATING** | Integer 0–50 (45 = 4.5 stars), daily. Ratings trajectory is half the Keepa extension's bottom chart and we have zero of it. | **Not fetched** |
| **17** | **COUNT_REVIEWS** | Daily total review count. Source for review velocity (reviews/month), review-bomb detection, launch momentum. | **Not fetched** |
| **11** | **COUNT_NEW** | Count of New offers on listing. Surges = competitor entry; crashes = competitor exits. We fetch it but **only compress to monthly count, never analyze entry/exit**. | Fetched but under-used |
| — | **monthlySoldHistory** | Amazon's "1K+ bought in past month" tracked over time. The most trustworthy demand proxy in the Keepa corpus. | **Not fetched** |
| — | **listedSince** | Amazon's "Date First Available" — authoritative launch date. | **Not fetched** |
| — | **trackingSince** | When Keepa first saw the ASIN. Lower bound on product age. | **Not fetched** |
| — | **buyBoxSellerIdHistory** | `[time, sellerId]` pairs. Who held Buy Box and when. Essential for "Amazon → 3P → back to Amazon" shifts. | **Not fetched** |
| — | **fbaFees** | Pick/pack + storage estimates, in cents. Feeds into the margin model we've been hand-waving. | **Not fetched** |
| — | **returnRate** | Bucketed return-rate indicator. Risk signal. | **Not fetched** |

The `history=1` + `stats=180` params are roughly correct — we want to **extend `stats=365`** (or all-time) and **add `&offers=20&buybox=1&stock=1`** for offers depth. Cost: each additional-hundred offers costs a small token multiplier. Worth it.

### 1.2 Per-competitor signals we compute then quietly drop

From `src/lib/keepa/compute.ts`:

- `priceVolatilityPct` — computed per competitor, never displayed (only `priceStabilityPct` is shown).
- `rankVolatilityPct` — same.
- `peakMonths` per competitor — computed, never shown (only market-wide peaks surface).
- Per-competitor `promoEvents[]` — aggregated into a market-wide bar chart; individual timing is lost.
- Per-competitor stockout events — not detected at all (only market-wide `oosTimePct`).

### 1.3 Granularity collapse

Every daily data point is bucketed to **monthly median**:

```ts
// src/lib/keepa/compute.ts:113–128
const aggregateMonthly = (points: KeepaPoint[]) => {
  const buckets = new Map<string, number[]>();
  points.forEach(point => {
    const key = monthKeyFromTimestamp(point.timestamp);
    buckets.get(key)?.push(point.value);
  });
  return Array.from(buckets.entries())
    .map(([month, values]) => ({ month, value: median(values) }))
    .sort();
};
```

24 months of daily BSR = ~730 points → we keep 24. **We can't tell the difference between "sustained $20 for 28 days" and "spiked $14 for one day and $24 for 27 days" — the median hides both.** Stockout timing, launch rockiness, promo precision — all invisible at this resolution.

---

## Part 2 — The moat: treat history as a stream of events, not a line chart

Every competing tool renders history as line charts and expects the user to pattern-match. That's fine for operators; it fails for the first-time PL seller we serve.

**The re-framing:** a product's history is a sequence of **events**. Events are classifiable, rankable by impact, narratable in plain English, and overlayable on a timeline at a much higher level of abstraction than a line chart can provide.

### Proposed event taxonomy

| Event Type | Detection rule | Signal strength | Plain-English frame |
|---|---|---|---|
| **LAUNCH** | First non-`-1` in `csv[3]` SALES + `listedSince` confirm | High | "Launched [month]. [n] days tracked." |
| **STOCKOUT** | ≥2-day run of `-1` in `csv[18]` BUY_BOX_SHIPPING | High | "Out of stock [dates], [n] days." |
| **MAJOR_PROMO** | Price drop ≥15% sustained ≥2 days | High | "[n%] promo in [month]." |
| **PROMO_CASCADE** | ≥3 top-5 competitors promo within 14-day window | High | "Market-wide promo wave in [month]." |
| **RANK_COLLAPSE** | BSR worsened ≥100% over 14 days | Medium | "Rank collapsed from #X to #Y in [window]." |
| **RANK_BREAKOUT** | BSR improved ≥50% sustained ≥7 days | Medium | "Broke out from #X to #Y after [adjacent event]." |
| **REVIEW_BOMB** | ≥20% of all reviews in a 7-day window + avg rating drops ≥0.3 stars | High | "Sudden review spike in [month] dropped rating from 4.X to 4.Y." |
| **REVIEW_ACCELERATION** | Review velocity ≥2× 90-day trailing average | Medium | "Review pace 2× accelerated starting [month]." |
| **COMPETITOR_ENTRY** | `csv[11]` COUNT_NEW increases ≥50% over 30 days | Medium | "New competitors entered in [month] ([n] new offers)." |
| **BUY_BOX_SHIFT** | `buyBoxSellerIdHistory` transitions between Amazon ↔ 3P ≥3 times | Medium | "Buy Box changed hands [n] times in [window]." |
| **PRICE_FLOOR_BREAK** | Price drops below 90-day 5th percentile | Low | "Price hit a new 90-day low of $X." |
| **PRICE_WAR** | ≥3 top-5 drop price within 7 days, avg drop ≥10% | High | "Price war in [month] — top 5 dropped avg [n%]." |

Each event object:

```ts
{
  type: EventType;
  asin: string | 'MARKET';        // 'MARKET' for cross-competitor events
  startTimestamp: number;
  endTimestamp?: number;
  impactScore: number;            // 0–100, our own scoring model
  evidence: {                     // links back to raw data for trust
    dataPoints: { timestamp, value, series }[];
  };
  description: string;            // AI-generated, 15–25 words
}
```

**Why this is the moat:** every other tool ships lines. The work of pattern-matching lives in the user's head. We ship *events* with impact scores and narrations — the pattern-matching already done. A novice seller who can't read a BSR chart can read "Ladkou launched 126 days ago with a rocky first month, accelerated after a promo push, and now holds a top-5 position with only 24 reviews."

---

## Part 3 — Information architecture

Replaces the current 5-tab structure entirely. One scrollable page, five sections, top to bottom:

```
┌──────────────────────────────────────────────────────────┐
│  MARKET CLIMATE                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ SECTION 1: THE STORY ─────────────────────────────┐  │
│  │  [~80-word AI paragraph: what this market did over │  │
│  │   the last 24 months, plain English]               │  │
│  │                                                    │  │
│  │  Uses banned-jargon list from Phase 2.7. Target    │  │
│  │  audience: first-time PL seller.                   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ SECTION 2: WHAT HAPPENED, WHEN ───────────────────┐  │
│  │  Horizontal timeline, 24mo wide                    │  │
│  │                                                    │  │
│  │  │  │ │    │    │ │ │     │  │    │                │  │
│  │  │  LAUNCH   PROMO  STOCK PROMO   PRICE-WAR        │  │
│  │  │  (Ladkou) (OSP)  (Ofir) (mass) (Nov)            │  │
│  │                                                    │  │
│  │  Filter chips: [All] [Price] [Rank] [Reviews]      │  │
│  │                [Per competitor]                    │  │
│  │                                                    │  │
│  │  Click any dot → card expands:                     │  │
│  │    type, ASIN, date, AI description,               │  │
│  │    impact score, evidence-chart thumbnail          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ SECTION 3: AT A GLANCE ───────────────────────────┐  │
│  │  Three cards, side by side                         │  │
│  │                                                    │  │
│  │  [Price Climate]  [Demand Climate] [Seasonal Peak] │  │
│  │   Stable ↗ 8%     Seasonal Q4     Oct–Dec (2×)    │  │
│  │   [sparkline]     [sparkline]     [mini calendar] │  │
│  │   "Prices have drifted up 8% year-over-year,       │  │
│  │    a market accepting higher price points."        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ SECTION 4: COMPETITOR ARCHAEOLOGY ────────────────┐  │
│  │  One card per top-5 competitor                     │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │ Ladkou  [NEW ENTRANT · 126 days tracked]     │ │  │
│  │  │                                              │ │  │
│  │  │ "Launched Nov 2025. Rocky first month      │ │  │
│  │  │  (BSR 80K). Pushed to #8K after a Feb 5–8  │ │  │
│  │  │  promo. 4.7 rating on 24 reviews. Still    │ │  │
│  │  │  gaining velocity — 13 BSR drops/month."   │ │  │
│  │  │                                              │ │  │
│  │  │ Events: Launch · Promo · Review-accel       │ │  │
│  │  │                                              │ │  │
│  │  │ [▸ Deep dive]  opens per-comp chart         │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  │  ... one card per competitor ...                   │  │
│  │                                                    │  │
│  │  Competitor cards use badges:                      │  │
│  │    NEW ENTRANT (<180 days tracked)                 │  │
│  │    RISING (positive BSR trend, recent events)      │  │
│  │    STABLE (low volatility, no major events)        │  │
│  │    DECLINING (negative trend, stockouts)           │  │
│  │    EMBATTLED (recent price war / review bomb)      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ SECTION 5: DEEP-DIVE CHARTS (collapsed) ──────────┐  │
│  │  ▸ Price & BSR overlay (what 2.8a already built)   │  │
│  │  ▸ Rating & review trajectory (new)                │  │
│  │  ▸ Offer-count history (new — entries/exits)       │  │
│  │  ▸ Buy Box ownership timeline (new)                │  │
│  │  ▸ Seasonality curve                               │  │
│  │                                                    │  │
│  │  Each chart collapses by default. Power users      │  │
│  │  expand. First-time sellers never see them unless  │  │
│  │  they ask.                                         │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### What this kills

- **Seasonality sub-tab** — peak/trough info folds into Section 3 Card C.
- **Promos & Stockouts sub-tab** — events land in the Section 2 timeline with full context; aggregate stats fold into Section 3.
- **Competitors sub-tab** — the opaque Price Stability % / Demand Stability % / Promo Freq % table is replaced by Section 4 narrative cards.
- **Insights sub-tab** — the Market Story text moves to Section 1 (keeping it); the five metric cards get simplified into Section 3 (Price / Demand / Seasonal).
- **Trends sub-tab** — the chart moves to Section 5 as a collapsed power-user view. The work from 2.8a (auto-select top 5, 12mo default, removed-asins toggle) carries over.

No more five-tab navigation. One page, scrollable, narrative-ordered.

---

## Part 4 — AI narration layers

Three distinct prompts, each with its own cache. All follow the Phase 2.7 `vettingSummary.ts` pattern — role-prompt + banned-jargon list + schema + plain-English examples.

| Layer | Input | Output | Cache key |
|---|---|---|---|
| **Market Story** (Section 1) | Full computed analysis + top-5 aggregate + detected events | 60–90 word paragraph | `submission_data.marketClimate.story` |
| **Event description** (Section 2, per event) | One event object + its evidence window | 15–25 word description | Stored in the event itself |
| **Competitor archaeology** (Section 4, per competitor) | Single competitor's full history + events targeting that ASIN | 50–70 word narrative + badge tag | `submission_data.marketClimate.archaeology[asin]` |

**Cost control:**
- All three layers generated once per submission on first view.
- Event descriptions generated in a single batched call (1 LLM call per submission, not 12).
- Market Story + archaeology batched together in one call with structured output.
- Total: **~2 LLM calls per submission** (one batched, one story). Amortized cost similar to the existing vetting summary.
- Regenerate only on explicit "Refresh Market Climate" click.

---

## Part 5 — Proposed implementation phasing

Eight phases, each shippable on its own merge. 2.8a ✅ already done.

| Phase | Scope | Effort | Dependencies |
|---|---|---|---|
| **2.8b** | Expand Keepa fetch: add CSV 4, 10, 16, 17 + `monthlySoldHistory`, `listedSince`, `trackingSince`, `buyBoxSellerIdHistory`, `fbaFees`, `returnRate`. Extend stats to 365d. Persist **daily** history in `keepa_analysis.normalized_series_json` (currently null). | 3–4h | None |
| **2.8c** | Event detection engine: `src/lib/marketClimate/events.ts` with 12 event detectors. Batch-run on cached history. Store events in `submission_data.marketClimate.events[]`. Impact scoring model. | 4–6h | 2.8b |
| **2.8d** | AI narration (three layers): prompts, schema validation, caching, "Refresh" button. Model: Haiku 4.5 for event descriptions (cheap, batched), Sonnet 4.6 for Market Story + archaeology. | 3h | 2.8c |
| **2.8e** | UI Section 1 (Market Story) + Section 3 (At-a-Glance cards). Simplest render; proves out the AI cache. | 2h | 2.8d |
| **2.8f** | UI Section 2 (Event Timeline component). Interactive — click event → expand card → evidence-chart thumbnail. Filter chips. | 5–6h | 2.8c, 2.8d |
| **2.8g** | UI Section 4 (Competitor Archaeology cards) with badge logic + on-demand per-competitor deep-dive chart. | 4h | 2.8c, 2.8d |
| **2.8h** | UI Section 5 (Deep-Dive Charts) — reorganize existing charts into collapsed accordion, add 3 new charts (Rating/Review trajectory, Offer-count history, Buy Box ownership). Retire the 5-tab structure. | 4h | 2.8b (needs expanded data) |
| **Totals** | | ~25–30h | |

Each phase has a demo milestone — something visible Dave can pass/fail on before moving to the next.

---

## Part 6 — Decisions (locked 2026-04-24)

1. **Daily storage:** store all daily. No compression, no weekly rollup for older data. Simpler, fits Supabase budget comfortably.
2. **Keepa token cost:** accepted. Market Climate generation is once per submission, not per-page-view.
3. **Event taxonomy:** ship 8 high-confidence events in 2.8c (LAUNCH, STOCKOUT, MAJOR_PROMO, PROMO_CASCADE, RANK_COLLAPSE, RANK_BREAKOUT, REVIEW_ACCELERATION, COMPETITOR_ENTRY). Calibrate in production, then add the remaining 4 (BUY_BOX_SHIFT, PRICE_FLOOR_BREAK, PRICE_WAR, REVIEW_BOMB) as 2.8c.1.
4. **Strategic Implication card:** punted to 2.9. Reason: prescription depends on a scoring/strategy model we haven't built; shipping archaeology first gives us a clearer picture of what prescription needs to say.
5. **Legacy sub-tab hub:** deleted outright in 2.8h. No "legacy view" link.
6. **Default timeframe:** smart auto. If any top-5 has `trackingSince` < 180 days, that competitor's archaeology card shows max available; market-wide sections stay at 12mo. Power users retain a manual 12/24/max toggle.

---

## Part 7 — What "outperforming every other tool" looks like

| Capability | Keepa Ext | Helium 10 | Jungle Scout | SmartScout | **BloomEngine (this redesign)** |
|---|:---:|:---:|:---:|:---:|:---:|
| Raw daily history | ✅ | ❌ | ❌ | ❌ | ✅ |
| Cohort overlay (top 5 at once) | partial | ✅ | partial | partial | ✅ |
| Launch-date awareness | ✅ | partial | partial | ❌ | ✅ |
| Stockout detection + timing | partial | ❌ | ❌ | ❌ | ✅ |
| Review/rating trajectory chart | ✅ | partial | partial | ❌ | ✅ |
| Buy Box ownership history | partial | ❌ | ❌ | ❌ | ✅ |
| Event detection (stockouts, promos, entries) | ❌ | partial | ❌ | partial | **✅ (12 types)** |
| Impact-ranked event timeline | ❌ | ❌ | ❌ | ❌ | **✅** |
| Plain-English market story | ❌ | ❌ | ❌ | ❌ | **✅** |
| Per-competitor AI archaeology | ❌ | ❌ | ❌ | ❌ | **✅** |
| Novice-seller framing | ❌ | ❌ | ❌ | ❌ | **✅** |

The last five rows are where we become the only option in the market. Keepa has the best raw data and zero interpretation. Helium 10 has the best cohort view but wraps it in a $500/mo enterprise SKU. SmartScout has brand trajectories but no narrative. Nobody translates 24 months of Amazon data into "what happened, what it means, and what you should do."

That's what we're building.

---

## Summary of what I'm asking you to green-light

1. The vision: **event-first, AI-narrated competitive archaeology** replaces the 5-tab line-chart hub entirely.
2. The data expansion: add 6 Keepa CSV types and 6 top-level fields to the fetch, persist daily detail.
3. The event taxonomy: 8 high-confidence event types to ship, 4 more deferred.
4. The IA: one scrollable page with 5 narrative-ordered sections (Story → Timeline → At-a-Glance → Archaeology → Deep-Dive).
5. The AI narration: three prompts (Market Story, Event Descriptions, Competitor Archaeology), ~2 LLM calls per submission, cached aggressively.
6. The phasing: 7 sub-phases after 2.8a, ~25–30 hours total.
7. The six open questions above — answer with the "leans" or redirect.

Once greenlit, 2.8b (data expansion) is the starting block. Every downstream phase depends on it.
