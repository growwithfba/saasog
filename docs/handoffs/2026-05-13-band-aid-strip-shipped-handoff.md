# 2026-05-13 EOD handoff — Band-aid strip + Market Share fix shipped to production

## State at end of session

- **`main`** is at `d93d176`. Production = bloomengine.ai. Includes the Keepa-everywhere sweep AND the band-aid strip from today.
- **`dev`** is at `56b1432` — in sync with main.
- **BloomLens extension** is at v0.5.12 in the Chrome Web Store. v0.5.13 (drawer aggregation gating) is still in Web Store review behind v0.5.12. **No new extension builds went out today.** Per Dave: no more zips until we've tested locally.

## What landed in production today (across PR #71, #72, #74, #75)

### From earlier session (PR #71 — promoted Keepa sweep)
- All competitor data flows from Keepa via the shared `hydrateCompetitorsFromKeepa` module. SERP DOM keeps ONE role: the per-ASIN `sponsored` boolean.
- Refresh Market Data button on `/vetting/[asin]`.
- Single-ASIN add path resolves BSR-tracked category via Keepa `/category` when `categoryTree[0]` disagrees with `salesRankReference`.
- Vetting page header redesign (icon-only refresh/share, styled tooltips, PASS badge dropped from /vetting/[asin]).
- BloomLens-format CSV detection.

### PR #72 — Batch-path category resolution + dedup
- `hydrateCompetitorsFromKeepa` now does the same Keepa `/category` resolution that `fetchAsinSnapshot` does — fixes Refresh Market Data + analyze-market + save-funnel for multi-category products (B0095UVKRI was the canonical example).
- One Keepa `/category` call per batch (cheap; comma-separated catIds).
- `buildEnrichedRow` gained an optional `bsrCategoryPath` parameter; when provided, drives root category, category-curve lookup, and band-aware multiplier resolution.
- Deleted ~500 lines of duplicated math from `src/app/api/extension/enrich/route.ts` — now imports from `@/lib/keepa/enrichedRow`.

### PR #74 — Strip data-quality band-aids + compute marketShare
**Two bugs found in Dave's CSV test against H10:**
1. BloomLens drawer dashed rows that had full Keepa data. Two root causes — both synthetic gates that nullified valid data:
   - `points30.length >= 5` BSR-history threshold (stamped `dataQuality: 'limited'` on legitimately strong stable rankers like B0C1HCCK2T which has BSR=1, 19,542 reviews, monthlySold=10,000 — but only 4 rank-change points in 30 days because rank #1 doesn't move).
   - Implausible-review-velocity guardrail (`reviews/listingAgeDays > 50`) fired on legitimate variation-family children like B0GX2PRW13 (29-day-old child of a mature parent family with 1,580 shared reviews → 54.5/day → trip).
2. Market Share rendered 0.00% on every row of every fresh market. `analyze-market` and `refresh-market-data` stored `competitors[]` from Keepa hydration without computing per-row `marketShare` before insert. Matrix UI reads `competitor.marketShare || 0` → 0% across the board.

**Fixes shipped:**
- `enrichedRow.ts`: `dataQuality: 'limited'` only fires when Keepa returned no usable signal at all (no BSR snapshot AND no monthlySold AND no reviews AND no rating). Previous `bsr30dMedian != null` gate dropped.
- `enrich/route.ts`: implausible-review-velocity guardrail deleted (~50 lines).
- `analyze-market/route.ts`: computes `marketShare` + `reviewShare` per competitor at write time.
- `refresh-market-data/route.ts`: same, after re-hydration.
- `ProductVettingResults.tsx`: render-time recompute of `marketShare` + `reviewShare` against active-set totals. Self-heals older markets stored before the write-path fix.
- `bsrSalesCurve.ts`: `CURVE_VERSION` bumped to invalidate `keepa_lens_metrics` cache rows stamped `'limited'` by the prior gates.

### Closed PRs (do not reopen)
- **PR #68** — Inflated-review composite signal. Closed. Same wrong mental model as the guardrail. Variation-family review pooling makes the entire premise invalid.
- **PR #69** — Unsolicited terminology rename SSP→USP. Closed. SSP references stay across the app — Dave's Skool training uses SSP. Pricing-page rename was the ONLY scope ever locked.
- **PR #73** — Standalone guardrail removal. Subsumed by PR #74.

## The locked rules (DO NOT VIOLATE — this is what Dave reset today)

### Rule: No mathematical band-aids
Every transformation that nullifies, gates, or filters Keepa data must be justified. The default behavior is **show what Keepa returned**. If Keepa gave us BSR, use it. If it gave us reviews, use them. If it gave us rating, use it.

Synthetic thresholds that mark rows `'limited'` and then dash fields downstream are the pattern we're cutting. Specifically banned:
- Reviews-per-listing-age ratio checks. Variation families share review pools across children — see `feedback_no_review_velocity_guardrails.md`. A 30-day-old child can legitimately display 1,000+ reviews. This is not a signal of "inflation" or "relisted ASIN."
- BSR-history-points thresholds that null out monthly units. If `csv[3]` is sparse, fall back to `currentBsr` snapshot — don't drop the row to limited.
- Any "composite signal" that combines reviews + age + BSR to flag rows as suspicious. The product domain doesn't support these heuristics.

### Rule: Display rules for missing fields
When Keepa returns no data for a specific field:
- Rating, BSR, percentage fields, category — show N/A (em-dash).
- Monthly units, monthly revenue, parent units, parent revenue — show $0 / 0. These are quantitative answers, and "no rank → 0 sales" is a meaningful answer.

### Rule: No extension zip builds until tested locally
Dave wants to load the unpacked extension from disk and verify behavior BEFORE we cut a Web Store zip. Don't run `pnpm zip` and don't submit to the Web Store without explicit go-ahead.

### Rule: Variation-family review aggregation is normal Amazon behavior
Parent ASINs with multiple variations share their accumulated review count across every child ASIN. A child variation launched yesterday will display the parent's full review history. This is correct, not a bug. Don't build code that treats this pattern as suspicious. Don't describe it as "relisted ASIN" or "previous owner of ASIN" — both framings are factually wrong.

## Errors I made today (so future-me doesn't repeat them)

1. **I built the wrong fix first.** PR #73 only removed the implausible-review-velocity guardrail. I missed that the `>= 5 BSR points in 30 days` threshold was the SAME class of band-aid eating the same kind of data. Should have stripped both together — and the `dataQuality` flag pattern entirely. Dave had to point this out by sending the second CSV. The pattern: if I find one band-aid, look for siblings before declaring the fix complete.

2. **I made bad manual math.** Looked at B00Y2SBLIQ (California Scents, BSR 1170 H&H), did the BSR-curve math by hand, concluded H&H multiplier was 7.8× too high. Then ran a corpus probe and found H&H median ratio = 0.85 (15% UNDER, not over). My hand math used wrong BSR (snapshot 1170 vs the H10 export's 11,683). **Run the probe before forming a calibration hypothesis.** Hand math against a single data point is worse than no math.

3. **I proposed test plans that weren't testable.** Multiple times I asked Dave to "open the BloomLens drawer on the preview URL" — that's impossible because the extension is hardcoded to bloomengine.ai. Per `feedback_bloomlens_hits_production.md`. Before suggesting a test, verify Dave can actually execute it on the surface available.

4. **I invented theories instead of reading data.** "Relisted ASIN", "ASIN takeover", "previous owner of ASIN" — all factually wrong framings I kept reaching for. The actual explanation (variation-family review pooling) was simpler and present in the data the whole time. Default to reading the data; don't reach for theories.

5. **I conflated "matrix shows 0" with "Keepa has no data."** Spent time on calibration hypotheses when the actual bug was that `analyze-market` was never computing `marketShare` before insert. The matrix showed 0% because the field didn't exist on the stored competitor records. **Before blaming math, check whether the field exists in the data layer.**

6. **I gave Dave 3-item test plans where 1 item would have sufficed.** "Test the drawer fix AND the matrix recovery AND the regression sniff" — when the testable scope on preview was just the matrix. One thing per test plan. Per `feedback_one_test_link_per_session.md` and `feedback_explain_tests_as_user.md`.

## Remaining work — prioritized

### Task A — BloomLens extension drawer fix (next priority, local-test first)

**Why:** After today's main ship, the production server (bloomengine.ai) returns `dataQuality: 'full'` for rows that previously came back `'limited'`. But the drawer's `LIMITED_DASH_KEYS` gate at `bloom-lens-extension/entrypoints/content/Drawer.tsx:2466-2493` still dashes rows whose dataQuality is 'limited'. That now only affects truly-no-data rows (Keepa returned nothing). For those, Dave's rule says monthly revenue should show $0 (not em-dash), but rating/BSR can stay N/A.

Also still pending: the `mergeEnriched` flip in `entrypoints/content/mockData.ts` so the extension trusts Keepa fields over the SERP DOM scrape for every field except `sponsored`. This was Task C from the original handoff.

**Plan:**
1. Make extension code changes (drawer drop LIMITED_DASH_KEYS, mockData flip mergeEnriched).
2. Hand Dave a load-unpacked path or repo branch to test locally — no zip, no Web Store submission yet.
3. After Dave validates locally, bump to v0.5.14, zip, submit. Note that v0.5.13 (drawer aggregation gating) is still in Web Store review queue and v0.5.14 will stack behind it.

### Task B — Calibration sanity check (defer; only re-raise if Dave does)

The corpus probe shipped today (`scripts/probes/h10-csv-overshoot-by-category.ts`) showed H&H median 0.85× and Automotive median 0.99× vs H10 — calibration is fine across the bulk of the corpus. The per-product big swings (B01N632E3W at 61× over) are driven by snapshot-BSR vs 30d-median input divergence — that's a different question (BSR-volatility handling). **Don't propose recalibration without re-running the probe first.** And do not propose a BSR-volatility cap without Dave re-raising it — that's another band-aid.

### Task C — Pre-Keepa-sweep matrix data recovery

Old markets created before the Keepa-everywhere sweep have SERP-DOM-sourced competitor data with gaps for sponsored placements. Clicking Refresh Market Data on those markets re-hydrates them from Keepa and now also recomputes marketShare/reviewShare. No code change needed — just user action. If Dave wants a backfill script that walks all submissions and triggers Refresh, that's a separate ask.

### Task D — `dataQuality: 'limited'` is now only set when Keepa returned NOTHING

For products like the nopicsn/Generic/LQXNXHC dropshipper listings in Dave's test (BSR=-1, no reviews, no rating, no monthlySold), the row IS still marked limited and the matrix still includes them with $0 revenue / 0% share. Per Dave's rule that's acceptable. If we ever want to exclude them entirely from analyze-market submissions, that's a separate design call.

## Files / memories worth reading first next session

1. **`memory/feedback_no_review_velocity_guardrails.md`** — locked rule today. Never build reviews/listing-age heuristics.
2. **`memory/feedback_inflated_review_terminology.md`** — updated today. Variation-family review pooling is the explanation for high-review-on-new-listing patterns.
3. **`src/lib/keepa/enrichedRow.ts`** — the canonical Keepa → EnrichedRow logic. `dataQuality` semantics: 'full' if any signal present, 'limited' only if Keepa returned nothing.
4. **`src/lib/keepa/hydrateCompetitor.ts`** — write-path entry point for every market-affecting operation. Now does BSR-tracked-category resolution.
5. **`src/app/api/extension/analyze-market/route.ts`** + **`src/app/api/submissions/[id]/refresh-market-data/route.ts`** — the two write paths that now correctly compute `marketShare` + `reviewShare`.
6. **`src/components/Results/ProductVettingResults.tsx:1041-1070`** — render-time recompute of marketShare/reviewShare. Important to know this exists when reasoning about matrix display.
7. **`scripts/probes/h10-vs-bloomlens-missing-data.ts`** + **`scripts/probes/keepa-probe-missing-data-asins.ts`** — diagnostic probes that exposed today's bugs. Reuse for similar investigations.

## Standing rules (do not violate)

These are the cross-session rules — re-read before suggesting any change:

- PRs target `dev`. `main` requires explicit OK before merge.
- Don't combine commit + merge + push into one command. Each step separately so Dave can verify.
- Single PR per change set.
- After testing greenlight: push + PR + merge are mine to drive — don't punt to Dave.
- Push freely to feature branches and `dev`. Only `main` needs confirmation.
- BloomLens hits production hardcoded. Extension-write changes need prod ship to be E2E testable on preview, OR a transitional legacy-data fallback.
- One test link per testing round. Consolidate multiple PRs into one preview URL.
- Kickoff prompts in chat (fenced code block). Handoff docs go to file.
- When asking Dave to test, use USER LANGUAGE — where to go, what to click, what to look for. No internal codenames.
- Verify Dave can actually execute a suggested step (access, data, route) before proposing it.
- Verify Supabase schema before trusting persistence claims.
- Never display round numbers in calculated metrics (BSR-curve driven, smooth values only).
- Never mention Keepa in user-facing UI.
- "BloomLens" is one word.
- Never redirect users to Stripe-hosted pages.
- Production = `main`. Dev = preview.
- Don't say "relisted ASIN" or "previous owner of ASIN" — those framings are factually wrong. Variation families share review pools — that's the normal pattern.
- **New today: No review-velocity guardrails. Ever.**
- **New today: No mathematical band-aids without Dave's explicit ask. Trust Keepa data.**
- **New today: No extension zip builds until Dave has tested locally.**
