# 2026-05-13 EOD handoff — Keepa-everywhere sweep shipped to dev

## State at end of session

- **`dev` branch** is at `d1f8a46`. Keepa-everywhere sweep is merged via PR #70 (squashed). 4 iterative commits collapsed into a single dev commit.
- **`main` branch** (production) is at `b20952a` — pre-sweep. Has NOT been promoted yet.
- **Bloom Lens extension** is at v0.5.12 in production / Chrome Web Store. v0.5.13 (drawer aggregation gating) is queued in Web Store review behind v0.5.12.

## The locked architectural principle (do not re-litigate)

> All research + vetting data flows from Keepa via one shared hydration module across every entry point. SERP DOM keeps ONE legitimate role: the per-ASIN `sponsored` boolean. Sponsored placement is personalized/dynamic/auction-driven so no third-party data source — Keepa included — can flag it.
>
> When Keepa returns null / -1, the displayed value is **N/A**. Never falls back to SERP DOM.

Locked by Dave on 2026-05-12. Confirmed via research note `docs/keepa-search-sponsored-research-2026-05-13.md` (Keepa `/search` endpoint exists for keyword → ASIN; Keepa has no sponsored-detection field anywhere).

## What landed in PR #70 (the sweep, now on dev)

### New shared modules
- `src/lib/keepa/enrichedRow.ts` — extracted `buildEnrichedRow` + `buildEmptyEnrichedRow` + helpers (median, posOrNull, pickImageUrl, pickRootCategoryName, deriveFulfillment, deriveSizeTier, formatDimensions). Exports `KEEPA_FETCH_PARAMS = 'stats=180&history=1&rating=1&buybox=1&offers=20&aplus=1'` for canonical Keepa calls.
- `src/lib/keepa/hydrateCompetitor.ts` — single entry point all write paths call. `hydrateCompetitorsFromKeepa(asins, opts)` batches up to 100 ASINs per Keepa call, returns `CanonicalCompetitor` records. Optional `opts.sponsoredAsins` map merges the sponsored boolean from SERP DOM.
- `src/lib/keepa/listingQualityScore.ts` — 7-criterion LQS from Keepa fields. Probe confirmed `aPlus` is the correct field name (not `aPlusContent` or `hasAPlus`).

### Write paths refactored
- `/api/extension/analyze-market` — drops `scrapedRowToCompetitor`; uses shared module. SERP-DOM payload read only for `sponsored` per ASIN.
- `/api/extension/save-funnel` — same pattern.
- `/api/research` (PUT bulk insert) — re-hydrates every ASIN from Keepa before insert. `rehydrateFromKeepa: false` body flag bypasses.
- `/api/research/add-asin` — via `src/lib/keepa/asinSnapshot.ts`. Now computes monthly_units_sold + monthly_revenue from BSR curve, active_sellers from `liveOffersOrder.length` filtered to NEW condition (not the all-time `offers.length`), fulfilled_by from live offer flags, and **resolves the BSR-tracked category via Keepa `/category`** when `salesRankReference` doesn't match `categoryTree`.
- `/api/extension/enrich` — added `&rating=1&buybox=1` to the Keepa URL. Uses cur[18] BUY_BOX_SHIPPING as preferred price source.

### New "Refresh Market Data" button + endpoint
- `POST /api/submissions/[id]/refresh-market-data` — re-hydrates every competitor in the submission via the shared module. Preserves sponsored flags from existing competitor records. Daily-cap-gated at 10 refreshes/day per user (tracked via `usage_events` with `operation='market_refresh'`).
- UI: icon-only button (RefreshCw) in the top-right corner of `/vetting/[asin]` header.

### Vetting page header redesign (Dave's option 3, locked 2026-05-13)
- PASS / RISKY / FAIL badge **dropped** from /vetting/[asin] header (stays on /offer/[asin]).
- Pencil stays inline next to title.
- Refresh + Share are icon-only in the top-right corner, smaller (h-7 w-7), wrapped in the styled `InfoTooltip` component (same one column headers use — replaces the slow native `title=""` tooltips).
- Tooltip strings: Pencil = "Change market name", Refresh = "Refresh 30-day data", Share = "Share this market" / "Sharing on — click to copy link again".

### Funnel-list (/research page Table.tsx) fixes
- "Review" column now reads `review` (singular) FIRST since that's what mapSnapshotToResearch writes. Falls back to `reviews`/`Reviews`/`review_count` for legacy data.
- "Number of Images" now reads `product.images.length` first (Keepa's array form) — `imagesCSV` is undefined on modern responses.
- "Net Price" and "Sales Year Over Year" columns + headers + cells **entirely removed** (not just hidden) — Net Price requires Amazon SP-API; Sales YoY requires multi-year history.

### CSV upload
- Both uploaders (`CsvUpload.tsx` full-flow + `CsvUploadResearch.tsx` /research-page) now detect 'BloomLens' format separately from 'H10'. Previously misidentified BloomLens CSVs as Helium 10 because `imageurl` matched H10's `url` indicator → used H10 mapping that didn't have `monthlysales`/`monthlyrevenue` keys.
- Drop-zone copy: "Supports CSV files from BloomLens, Helium 10, or Jungle Scout" (was Helium-10-only).

### Probes shipped with the sweep
- `scripts/probes/keepa-hydration-fields.ts` — verifies every mapped Keepa field on 5 representative ASINs.
- `scripts/probes/keepa-category-and-sellers.ts` — the diagnostic that exposed the category-mismatch + liveOffersOrder bugs on B0095UVKRI.
- `scripts/probes/keepa-category-resolve-verify.ts` — proves the /category resolution returns "Automotive" for B0095UVKRI.

### Cache invalidation
- `CURVE_VERSION` bumped to `…+keepa-everywhere-2026-05-13` so old `keepa_lens_metrics` rows (built before `&rating=1&buybox=1`) get refetched on next drawer load.

## Remaining work — prioritized

### Task A — Promote sweep to production (main) ★ start here

**Why this is task #1:** BloomLens v0.5.12 is hardcoded to hit `bloomengine.ai` (production), not Vercel previews. Until the sweep is on `main`, the extension-side flows (Analyze Market + Save to Funnel) can't be E2E tested against the new server logic. Dave confirmed during sweep testing that this is the right gate.

**Plan:**
1. Open a PR from `dev` to `main` titled something like "Promote Keepa-everywhere sweep to production".
2. PR description should summarize what's changing for prod users (this handoff doc is a good source).
3. Wait for Vercel preview on the dev → main PR to deploy. Smoke-test the preview.
4. **Pause and ask Dave before merging** (main requires explicit OK per `feedback_push_freely_except_main.md`).
5. After Dave's OK: merge, verify the production deploy succeeded.
6. Update memory `project_2026_05_12_shipped.md` with the new prod commit SHA.

**Risk:** low. Write paths refactored cleanly. Read paths (vetting matrix display) unchanged. Calibration math unchanged. The big behavior changes (Keepa-sourced fields, Refresh button) are additive.

### Task B — Batch-path category resolution (the unfinished half of the sweep)

**Problem:** `hydrateCompetitorsFromKeepa` (used by Refresh Market Data + analyze-market + save-funnel) does NOT resolve the BSR-tracked category when it differs from `categoryTree[0]`. Only `fetchAsinSnapshot` (single-ASIN, used by /api/research/add-asin) has this fix.

**Impact:** When a user runs Refresh Market Data on a market containing a multi-category product (like B0095UVKRI where BSR is in Automotive but categoryTree[0] is "Health & Household"), the BSR curve uses the wrong category multiplier and produces wrong revenue/units. The new analyze-market flow has the same issue.

**Root-cause already verified:** `scripts/probes/keepa-category-and-sellers.ts` proves the mismatch. `scripts/probes/keepa-category-resolve-verify.ts` proves the Keepa `/category` endpoint resolves it correctly.

**Plan:**
1. In `src/lib/keepa/hydrateCompetitor.ts`, after the batched Keepa `/product` fetch returns N products:
   - Walk products, collect `salesRankReference` catIds that are NOT in their respective `categoryTree`.
   - If any mismatches: single Keepa `/category` call with comma-separated catIds and `&parents=1`. Build a Map<catId, ResolvedPath>.
2. Modify `buildEnrichedRow` in `src/lib/keepa/enrichedRow.ts` to accept an optional `bsrCategoryPath: string[] | null` parameter. When provided, use it for both `rootCategory` and the `bsrToMonthlyUnitsByCategory` call.
3. In `hydrateCompetitor`, pass the resolved path per-product to `buildEnrichedRow`.

**Reference implementation:** the async resolution code in `src/lib/keepa/asinSnapshot.ts` (around the `bsrCategoryName`/`bsrCategoryPath` resolution block) is the template. Reuse the same parent-walk logic.

**Cost:** 1 extra Keepa /category call per refresh batch (cheap — `/category` is ~1 token regardless of how many catIds you batch).

### Task C — Extension `mergeEnriched` flip → v0.5.14

**Repo:** `bloom-lens-extension` (sibling directory to `bloomengine`).
**File:** `entrypoints/content/mockData.ts:mergeEnriched`.

**Current state:** Explicit "Tier 1 = DOM scrape wins for reviews/rating" policy (see comment at ~line 370 in mockData.ts).

**Required change:** Flip so Keepa-enriched fields win for EVERY field except `sponsored`. The only field that should still come from the SERP DOM scrape is `sponsored` (since Keepa can't detect sponsored placement).

**Plan:**
1. Rewrite the `mergeEnriched` function. New rule: `enriched.X ?? base.X` for every field, EXCEPT `sponsored` which is always `base.sponsored`.
2. Bump version in `package.json` to `0.5.14`.
3. Build the zip: `pnpm zip` (or whatever the build command is for the extension).
4. Upload Sentry source maps for release `0.5.14`.
5. Submit to Chrome Web Store.
6. Note for user-facing comm: v0.5.12 is currently shipping. v0.5.13 (drawer aggregation gating) is in Web Store review queue. v0.5.14 will stack behind v0.5.13.

**Dependency:** Task A complete (production has the sweep). Without prod, the extension's new behavior would request data from a server that still returns SERP-shaped responses.

**Reference memory:** `feedback_extension_merge_synth_fallback.md` documents the prior failure mode where `?? base.X` synth fallbacks defeated server-side null guarantees.

### Task D — PR #68 + PR #69 decisions

**PR #68 (`fix/inflated-reviews-detection` → `dev`)**
- Adds `src/lib/competitorDataQuality.ts` with `isReviewCountInflated()` composite-signal helper. Detection rule: `reviews >= 1000 AND (reviewsPerDay > 100 OR (BSR > 500_000 AND monthlySales < 50))`.
- Applies the helper at 3 points: `/api/extension/enrich`, `/api/extension/analyze-market` (write-time guardrail), `ProductVettingResults` (read-time gate).
- Also adds `&rating=1` to the Keepa fetch URL.
- **Updated context as of 2026-05-13:** the sweep already added `&rating=1` so that piece is redundant. The composite-signal helper still has value as defense-in-depth for variation-family aggregation cases where Keepa itself returns inflated parent-level review counts (TheraICE-style 4 children all showing 43,519 reviews).
- **Recommendation:** merge as safety net. Low risk — only marks bad rows `dataQuality: 'limited'`, doesn't break anything. Will need to rebase against current dev (the enrich rating=1 hunk will conflict).

**PR #69 (`fix/ssp-vetting-terminology-sweep` → `dev`)**
- Unsolicited terminology rename across 18 files. SSP → USP and "product vetting" → "market analysis".
- Background: pricing-page terminology was locked 2026-05-11 (`project_pricing_terminology.md`). The rest-of-app rename was pending but not explicitly tasked. PR #69 attempted that sweep without confirmation.
- **Recommendation:** Dave's call. If we want app-wide consistency NOW: merge. If we want to revisit deliberately: close and tackle as a planned sprint item.

### Task E — Calibration question: BSR-curve under-estimating vs Helium 10

**Symptom:** On some products, the BSR-curve produces estimates 2-8× lower than Helium 10's widget for the same ASIN. Confirmed cases during 2026-05-13 testing:
- HAKSEN deviled egg `B0CGZXZHGD`: H10 = 92 units / $1,281 revenue. We = 42 units / $587. ~2× under.
- Tlaleikejia tire ramp `B0FJ5HKBPX` (Industrial & Scientific): H10 = 591 units / $31,948 revenue. We = 76 units / $3,799. ~8× under.

**What's NOT broken:** within-market math is internally consistent (vetting score is stable, competitor-to-competitor ratios make sense). The issue is the absolute scale.

**Hypotheses to test:**
1. Calibration corpus may not cover Industrial & Scientific or certain Home & Kitchen sub-categories well.
2. Per-category multipliers in `src/lib/extension/bsrCategoryMultipliers.ts` may need expansion.
3. Variation-cap dampening (parent_units / min(N, 5)) may over-attribute family-total to BSR.
4. The post-sweep category-resolution fix (Task B done) may narrow some discrepancies — re-test after Task B.

**Plan:**
1. After Task B lands, re-run testing on the same 3 ASINs above. Note new numbers.
2. Use `scripts/probes/keepa-attribution-validate.ts` to compare BSR-curve output across a broader corpus (we have H10 CSVs in Supabase from earlier calibration work — `scripts/probes/calibrate-from-csv-folder.ts` has the corpus loader).
3. Identify which categories are under-calibrated. Either:
   - Add new per-category multipliers, OR
   - Surface a "low-confidence category" signal in the UI when matched_category falls back to the universal curve.

**Don't start until other tasks are clear.** This is a calibration investigation, not a quick fix. Memory has the context: `project_calibration_vision.md`.

### Task F — Dedup `buildEnrichedRow` math

**Problem:** The same math now lives in two places:
- `src/lib/keepa/enrichedRow.ts` (new shared module from the sweep — used by `hydrateCompetitor`)
- `src/app/api/extension/enrich/route.ts` (still inline — used by the BloomLens drawer enrich endpoint)

**Risk:** future calibration tweaks would need to be applied twice. Easy to forget one.

**Plan:**
1. Refactor `enrich/route.ts` to import `buildEnrichedRow` + `buildEmptyEnrichedRow` + helpers from `@/lib/keepa/enrichedRow`.
2. Delete the inline copies in enrich.
3. **Preserve the relisted-ASIN guardrail** that wraps buildEnrichedRow's output in enrich (see lines ~504-576 in the current file — checks `reviews/listingAgeDays > 50` and overrides certain fields). That logic doesn't belong in the shared module; keep it as a post-processor in the enrich route specifically.
4. Test: drawer enrichment values should be identical before/after the refactor.

### Task G — Vetting matrix em-dashes for `B0DMF899R6` (Ayerphalo bacon grease)

**Symptom:** Competitor row in the bacon-grease market shows — for Monthly Revenue / Strength / Market Share / Review Share / Rating in the vetting matrix. Amazon + Keepa both have full data for this ASIN.

**Trigger:** The competitor's stored `dataQuality === 'limited'`. The matrix UI dashes any row with that flag.

**Root cause to verify:** `dataQuality` is set to `'limited'` in `buildEnrichedRow` when `bsr30dMedian` is null. That happens when there are fewer than 5 BSR data points in the trailing 30 days (`points30.length >= 5` gate).

**Plan:**
1. Probe Keepa for B0DMF899R6 specifically — examine `csv[3]` shape. Count data points in the trailing 30 days.
2. If `csv[3]` is genuinely sparse for this ASIN: adjust threshold from `>= 5` to `>= 3` OR allow medians to use any-time-window of available history.
3. If `csv[3]` is dense but our smoothing is wrong: look for a bug in the daily-bucketing logic in `buildEnrichedRow` lines ~140-160.
4. **Don't forget the cache.** A pre-sweep row might still be in `keepa_lens_metrics` for this ASIN. The CURVE_VERSION bump should have busted it but verify by hitting the row on a fresh refresh.

## Standing rules (do not violate)

- PRs target `dev`. `main` requires explicit OK before merge.
- Don't combine commit + merge + push into one command. Each step separately so Dave can verify between stages.
- Single PR per change set.
- After testing greenlight: push + PR + merge are mine to drive — don't tell Dave to merge his own PRs.
- Push freely to feature branches and `dev`. Only `main` needs confirmation.
- BloomLens hits production hardcoded. Extension-write changes need prod ship to be E2E testable on preview, OR a transitional legacy-data fallback.
- One test link per testing round. Consolidate multiple PRs into one preview URL.
- Kickoff prompts in chat (fenced code block). Handoff docs go to file.
- When asking Dave to test, use USER LANGUAGE — where to go, what to click, what to look for. No internal codenames.
- Verify Dave can actually execute a suggested step (access, data, route) before proposing it. Don't punt verification onto him.
- Verify Supabase schema before trusting persistence claims.
- Never display round numbers in calculated metrics (BSR-curve driven, smooth values only).
- Never mention Keepa in user-facing UI.
- "BloomLens" is one word.
- Never redirect users to Stripe-hosted pages.
- Production = `main`. Dev = preview.
- Charm-pricing snaps to .99.
- effectiveTier ≠ tier; Adjustments ≠ Expansions.
- Optional numeric schema fields can land as undefined — use `isFiniteNumber()`.
- BSR enrichment must be multi-point, not snapshot.
- Don't say "relisted ASIN" or "previous owner of ASIN" — those framings are factually wrong. Use neutral terms: "inflated review count", "data quality limited".

## Files / memories worth reading first next session

1. **`memory/project_keepa_everywhere_sweep.md`** — full architectural plan that drove this work. Still active.
2. **`memory/project_keepa_sweep_deferred_issues.md`** — the canonical list of what didn't land. Aligned with this handoff.
3. **`docs/keepa-search-sponsored-research-2026-05-13.md`** — the research note that locked the architecture. Confirms Keepa has `/search` and confirms Keepa has no sponsored field.
4. **`src/lib/keepa/enrichedRow.ts`** + **`src/lib/keepa/hydrateCompetitor.ts`** — the new shared modules. Read these before touching anything that hydrates competitor data.
5. **`scripts/probes/keepa-category-and-sellers.ts`** + **`scripts/probes/keepa-category-resolve-verify.ts`** — diagnostic + verification for the category-mismatch fix. Reference for Task B.

## Open questions deferred to next session

- Calibration: are H10's higher numbers actually right? Or is our BSR curve more accurate and H10 over-estimates? Probe corpus comparison would clarify.
- PR #69 fate (terminology sweep) — Dave wants to decide, not me.
- After v0.5.14 ships, do we need a paired v0.5.15 for the drawer to consume the new `__keepa_data_quality` marker in saved competitor records? (Currently the drawer doesn't read it; the matrix on /vetting/[asin] does.)
