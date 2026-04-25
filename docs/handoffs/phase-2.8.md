# Phase 2.8 Handoff — Market Climate redesign

**Date:** 2026-04-24 (end of session)
**Branch:** `v9-score-save` (pushed to origin at `1310d1f`)
**Commits this session:** 15 (range `7b46665..1310d1f`)
**Status:** Section 2 of the redesign locked; legacy 5-tab hub still alive below it; image extraction deferred.

---

## TL;DR for tomorrow

- The Market Climate redesign is **functionally complete from a user's reading perspective** — Story → Pre-Vetting Reports (3 lenses, 5 cards, big-picture summary, hover-zoom sparklines) → At-a-Glance cards.
- The **legacy 5-tab hub** (Insights / Trends / Seasonality / Promos / Competitors) is **still rendered below** the new sections. Dead weight, but live. **2.8h retires it.**
- **Listing images** were promised, deferred, still not in. Keepa already returns them — we just don't extract.
- **Branch is pushed**, dev server killed, all work durable.

---

## What shipped this session

### Outside Phase 2.8 (cleanup / unrelated)

1. **Delete cascade refactor** (`1686eb0`)
   Unified Offering / Vetting / Research delete paths into server-side cascading routes. Fixed the bug where deleting a vetting left the research-page icon lit. New `/api/submissions` DELETE for bulk cascade. Errors surface in the UI instead of being swallowed.

2. **Vetting info-icon tooltips** (`4af734e`)
   Every column in the competitor matrix now has a small `ⓘ` icon with one-to-two-sentence plain-English copy. Time-sensitive fields (price/BSR/etc.) explicitly say "at the time of vetting." Removed the Gross Profit column. Added `formatWeight()` so "2.5" renders as "2.5 lbs."

### Phase 2.8 — Market Climate redesign

3. **2.8a — Rename + sane defaults** (`eb312c8`)
   - "Market Signals" → "Market Climate" everywhere (subtitle, learn-videos entry, CSV upload feedback). Internal code refs left alone.
   - Trends sub-tab is now the landing tab.
   - Auto-select all top-5 competitors on first load (was empty).
   - Default range 12mo (was 24mo).
   - Removed the 2-competitor cap.
   - `removedAsins` from Phase 2.7 honored — removed competitors hidden by default with a "Show removed (N)" toggle.
   - Palette extended from 3 → 6 colors.

4. **Redesign doc v2** (`8f4f853`)
   Full rewrite of `docs/phase-2.8-market-signals-redesign.md` with the event-first vision, locked decisions on the 6 open questions, 7 sub-phase plan.

5. **2.8b — Data foundation** (`e650b5e`)
   - Parse 4 new Keepa CSV series: LISTPRICE (4), NEW_FBA (10), RATING (16), COUNT_REVIEWS (17).
   - Extract `listedSince`, `trackingSince`, `launchDate`, `daysTracked`, `fbaFees`, `returnRate`, `monthlySold`/`monthlySoldHistory`, `buyBoxOwnership` (from `buyBoxSellerIdHistory`).
   - Fetch URL extended to `stats=365` (was 180).
   - **Daily granularity now persisted** in `keepa_analysis.normalized_series_json` (was always null). Downstream phases read daily data without re-calling Keepa.

6. **2.8c — Event detection engine** (`7c3d61a`)
   `src/lib/marketClimate/events.ts` with 8 detectors: LAUNCH, STOCKOUT, MAJOR_PROMO, PROMO_CASCADE, RANK_COLLAPSE, RANK_BREAKOUT, REVIEW_ACCELERATION, COMPETITOR_ENTRY. Each event has a 0–100 impact score and an evidence window (≤30 points) for visualization.

7. **2.8d — AI narration layer** (`421c126`)
   `src/services/marketClimateNarration.ts`. Single batched Sonnet 4.6 call produces marketStory + atAGlance cards + (initially competitorArchaeology + eventDescriptions, later replaced). Voice rules: insights-not-data, banned-jargon list, never mention Keepa, soft-frame expectations, tie to SSP lanes when natural. New `market_climate_narration` TaskKind in the registry.

8. **2.8e — Section 1 + Section 3 UI** (`66c9ed1`)
   `MarketStory.tsx` (renders the AI paragraph) + `AtAGlanceCards.tsx` (3 climate cards with verdict pills + sparklines). First visible payoff of the redesign.

9. **2.8e.1 — Voice revision** (`ad8651f`)
   Card explainers moved into the AI narration so they can read the product category and reason about WHY peaks happen (Mother's Day, back-to-school, etc.). Tied recommendations to SSP angles. Peak months sorted chronologically.

10. **2.8f → 2.8f.2 — Section 2 rebuild** (`13564e8` → `ed7e7aa` → `724e86c`)
    First built as a horizontal event timeline (`13564e8`), then tuned (`ed7e7aa`), then **completely rebuilt** (`724e86c`) as **Pre-Vetting Reports** after Dave flagged the timeline was incoherent. The new design is a per-competitor 3-lens analyzer modeled directly on how Dave reads Keepa charts.

    New modules:
    - `src/lib/marketClimate/competitorProfile.ts` (~440 lines) — pure-TS analysis producing `LaunchSignals`, `PriceSupplySignals`, `RankSignals` per competitor + 3 big-picture syntheses.
    - `src/components/Keepa/PreVettingTabs.tsx` — three-tab UI (Launches / Price & Supply / Rank), collapsed-by-default cards per competitor, fact-only fallback narratives.
    - Rewrote `marketClimateNarration.ts` to output `preVetting` block (per-competitor headline + 3 lens-narratives + 3 big-picture summaries) replacing the old archaeology + eventDescriptions.

    Deleted: `src/components/Keepa/EventTimeline.tsx`.

11. **2.8f.3 — Visual polish** (`da251f5`)
    Per-lens badges (color-coded green/sky/amber/rose), sparklines next to each row, color-toned stat values.

12. **2.8f.4 — Badge cleanup + sparkline hover-zoom** (`545b825`)
    Stripped redundant pills (No stockouts, Above their avg, year-avg labels — all already conveyed by stat color coding). Renamed "Active pricer" → "Frequent sales." Time-to-traction goes red at 5mo+. Buy Box label clarified as "Buy Box now." Hover any sparkline → 360px popover with labeled axes, tooltip, BSR-axis-flipped, $-formatted prices.

13. **2.8f.5 — Refresh loading indicator** (`1310d1f`)
    Pulsing banner with cycling stage messages ("Pulling 12–24 months of market history…" → "Reading how each competitor has behaved…" → 3 more) + Loader2 spinner inline in the Refresh button. Replaces static stale/loading warnings while generation is in flight.

---

## What's blocked / open

### Carried into next session

- **2.8h: Retire the legacy 5-tab hub.** The old Insights / Trends / Seasonality / Promos / Competitors tabs still render below Pre-Vetting. They're now redundant with the new sections. The Trends *chart* is worth salvaging into a "Deep-Dive Chart" collapsed accordion section for power users; the rest can be deleted outright.
- **Listing images on Pre-Vetting cards.** Dave asked for these earlier. Keepa returns `imagesCSV` — we don't extract. Plumb through normalize → render small product thumbnail on the left of each card header.

### Backlog (not committed, not promised for tomorrow)

- **Scoring novice-difficulty modifier.** Saved to memory file `project_scoring_novice_penalty_feedback.md`. Dave flagged that the V4 score showed 97% PASS on a market that's hostile to novice sellers (high reviews, high rating, FBA dominance). Don't start until Dave re-raises.
- **Tooltip enrichment on Pre-Vetting badges.** Currently using `title=` attribute. Could use the same `InfoTooltip` component we use on the vetting page for richer hover content.

---

## Files changed this session (24 files, +4099 / -473)

### New files (5)
- `src/app/api/submissions/route.ts` — bulk DELETE with cascade
- `src/components/Keepa/MarketStory.tsx` — Section 1 paragraph
- `src/components/Keepa/AtAGlanceCards.tsx` — Section 3 climate cards
- `src/components/Keepa/PreVettingTabs.tsx` — Section 2 (the centerpiece)
- `src/lib/marketClimate/competitorProfile.ts` — per-competitor signal analysis
- `src/lib/marketClimate/events.ts` — 8-detector event engine
- `src/services/marketClimateNarration.ts` — Sonnet narration service

### Deleted (1)
- `src/components/Keepa/EventTimeline.tsx` — replaced by `PreVettingTabs.tsx`

### Modified — Keepa data pipeline
- `src/lib/keepa/normalize.ts` — added 4 CSV series + per-competitor metadata
- `src/lib/keepa/compute.ts` — added events + competitorProfiles + narration to `KeepaComputedAnalysis`
- `src/app/api/keepa/analysis/generate/route.ts` — wired full pipeline + bypass list

### Modified — Keepa UI
- `src/components/Keepa/KeepaSignalsHub.tsx` — landing tab, RefreshingBanner, Pre-Vetting wiring
- `src/components/Keepa/KeepaTrendsTab.tsx` — auto-select top 5, removed cap, removedAsins toggle

### Modified — vetting page
- `src/components/Results/ProductVettingResults.tsx` — info-icon tooltips on every column header, removed Gross Profit, formatWeight wiring
- `src/utils/formatters.ts` — added `formatWeight()`
- `src/components/Results/MarketVisuals.tsx` — pass `removedAsins` into hub

### Modified — delete cascade
- `src/app/api/research/route.ts`
- `src/app/api/offer/route.ts`
- `src/components/Offer/OfferPageContent.tsx`
- `src/components/Table.tsx`
- `src/components/dashboard/Dashboard.tsx`

### Modified — misc
- `src/components/Upload/CsvUpload.tsx` — "Generating Market Climate…" copy
- `src/utils/learnVideos.ts` — renamed Market Signals video entry
- `src/lib/anthropic/models.ts` — added `market_climate_narration` TaskKind
- `docs/phase-2.8-market-signals-redesign.md` — v2 rewrite + locked decisions

---

## Next-phase entry points

### Starting 2.8h (legacy hub retirement)

The legacy 5-tab hub renders here:
```
src/components/Keepa/KeepaSignalsHub.tsx, lines ~221–256
```
The tabs strip and the body switch on `activeTab`. To retire:
1. Delete the tabs strip (`<div className="px-6 pt-4">…</div>` containing the buttons).
2. Replace the activeTab body switch with a single collapsed accordion containing **only** `KeepaTrendsTab` (the chart) — that's the one piece worth salvaging because the new sections don't show a per-day overlay chart.
3. Delete `KeepaInsightsTab.tsx`, `KeepaSeasonalityTab.tsx`, `KeepaStockPromoTab.tsx`, `KeepaCompareTab.tsx` and their imports.
4. Remove the `KeepaTabId` type — it was for the legacy tabs.

### Starting listing-image extraction

1. Open `src/lib/keepa/normalize.ts`. The `NormalizedKeepaCompetitor` interface is the place to add an `imageUrl: string | null` field.
2. Keepa returns `imagesCSV` as a comma-separated list of image filenames. Build a URL like `https://images-na.ssl-images-amazon.com/images/I/{filename}.jpg` from the first entry.
3. Pipe through generate route → `analysis.normalized.competitors[i].imageUrl`.
4. In `PreVettingTabs.tsx`, render a small (40×40) image at the left of each card header before the brand name.

---

## Decisions locked this session (documented in the redesign doc)

- All daily history persisted to JSONB. No compression for older data.
- Keepa token cost on `stats=365` accepted.
- Event taxonomy ships with 8 detectors. The remaining 4 (BUY_BOX_SHIFT, PRICE_FLOOR_BREAK, PRICE_WAR, REVIEW_BOMB) deferred until calibration.
- Strategic-prescription card punted to Phase 2.9.
- Legacy hub retired outright in 2.8h. No "legacy view" link.
- Smart-auto timeframe: archaeology cards show full history per competitor; market sections stay at 12mo.
- New section name: **Market Climate**.
- Pre-Vetting Reports default view: collapsed cards (option B).

## Naming + voice rules saved to memory

- `feedback_never_mention_keepa.md` — never use the word "Keepa" in user-facing UI.
- `project_scoring_novice_penalty_feedback.md` — backlog item for scoring calibration.

---

## Open questions for tomorrow

1. **2.8h cutover style.** Delete the legacy tabs all at once, or hide them behind a feature flag for a release? My lean is just delete — they're already dead in terms of utility now that Pre-Vetting covers the same ground.
2. **Image rendering size.** Square 40×40 thumb? Larger 60×60? Same row or above the brand name? Wireframe before coding probably worth it.
3. **Should the deep-dive Trends chart still default-open?** Or always start collapsed in 2.8h? Lean: collapsed; the chart is a power-user view.

---

## Housekeeping

- ✅ Branch pushed to origin (`v9-score-save` at `1310d1f`).
- ✅ Dev server killed at end of session.
- ✅ Memory files current (Keepa rule + scoring backlog).
- ✅ Bypass list updated in generate route — `support@bloomengine.ai` and `dave@growwithfba.com` skip the daily refresh cap.
