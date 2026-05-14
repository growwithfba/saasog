# 2026-05-13 (late-evening) handoff — Calibration r9 + BloomLens v0.5.14 shipped

## State at end of session

- **`main`** = `397ca91`. Production = bloomengine.ai. Includes everything from the morning handoffs (band-aid strip, marketShare, Keepa-everywhere sweep) PLUS the r9 Big Five calibration.
- **`dev`** = `8431ce9`. In sync with main.
- **BloomLens extension** = v0.5.14 uploaded to the Chrome Web Store by Dave at end of session. v0.5.13 still in Web Store review queue, v0.5.14 stacks behind it.
- **`keepa_lens_metrics` cache**: `CURVE_VERSION` bumped with `+big-five-recal-2026-05-13` so cached predictions for the recalibrated categories auto-invalidate on next fetch.

## What landed in production today (this session)

### BloomLens extension v0.5.14 (extension repo)

Two changes paired with a third polish iteration after Dave tested locally:

1. **Dropped the `LIMITED_DASH_KEYS` gate** in `bloom-lens-extension/entrypoints/content/Drawer.tsx`. Renderers now handle null per Dave's display rule directly: rating / BSR / reviews / percentages → N/A; monthly units & revenue + parent monthly fields → 0 / $0. The wholesale dataQuality-based gate is gone.
2. **Dropped the sibling `EXPORT_LIMITED_BLANK_KEYS` gate** in the CSV export — same class of band-aid in a parallel code path. CSV cells now reflect actual null/0 values.
3. **Flipped `mergeEnriched`** in `bloom-lens-extension/entrypoints/content/mockData.ts` — Keepa wins for every value except `sponsored` (Keepa can't see SERP placement). `image` falls back to base when Keepa is null so the table isn't visually broken. `title` stays from base (not on `EnrichedRowPayload`).
4. **MockRow type widened**: `bsr`, `rating`, `reviews`, `bsrTrend`, `price` are now `number | null`. The type system enforces the null-handling rule downstream.
5. **Em-dash → literal "N/A"** in the drawer after Dave's local test feedback. Limited rows now show the actual letters "N/A" instead of "—".
6. **PR consolidation in extension repo**: Opened PR #4 (`feature/v0.5.14-strip-limited-gating` → `dev`) which superseded the stalled PR #2 (Save to Funnel toggle-to-remove) and PR #3 (v0.5.13 aggregate gating). Both older PRs closed. Extension repo's `dev` branch (was `599ba7c`) is now at `f4ce5d3` and reflects what's about to ship on the Web Store.

### Calibration r9 — Big Five recalibration (main repo)

PR #76 → dev → PR #77 → main. All shipped in one session.

Refits the five priority categories that showed clear, consistent under-prediction against the H10 ground-truth corpus. All five now sit at observed median ratio **1.00×** (was 0.43-0.70× before).

| Category | r8 sample | r9 sample | Before | After |
|---|---|---|---|---|
| Patio, Lawn & Garden | 208 | **1,491** | 0.43× | **1.00×** |
| Pet Supplies | 231 | **1,779** | 0.50× | **1.00×** |
| Industrial & Scientific | 85 | **776** | 0.66× | **1.00×** |
| Kitchen & Dining | 480 | **1,242** | 0.67× | **1.00×** |
| Arts, Crafts & Sewing | 126 | **931** | 0.70× | **1.01×** |

Headline band-level changes:
- **P/L/G 4k-15k**: 0.317 → **1.587 (× 5.01)**. The 0.317 was the lowest mult in the entire file — an obvious fitting artifact from r8's n=30 sample. r9 confirms on n=463.
- **Pet Supplies 0-4k**: NEW band added at mult 2.000. Top movers were consistently under-predicted ~3×.
- **Pet Supplies 200k+**: NEW band at mult 0.197 — opposite direction from the rest of the category. Long tail OVER-predicts by 3×.
- **K&D had the curve shape backwards**: r8's 4k-15k was 1.393 (over) and 15k-60k was 0.836 (way under). r9 swaps these to 1.013 and 1.796.
- **I&S** previously had no bands at all (default-only fit on n=85). r9 adds 4 bands.
- **A/C/S 60k-200k**: 0.345 → 0.690. r8 over-fit to n=30; r9's n=365 shows it should double.

11 other priority + non-priority categories were intentionally NOT touched — they sit within ±10% of calibrated.

## The big methodology revelations from today

These should anchor any future calibration work — getting them wrong wastes hours and produces misleading numbers.

### Revelation 1 — Use H10's category for calibration, NOT Keepa's resolved category

When calibrating against H10's Parent Level Sales as the ground truth, the categories you bucket by must match what H10 reports. The first probe I tried today bucketed H10's actual-sales rows by H10's label, then compared them to BloomEngine's cached predictions which were bucketed by Keepa's BSR-tracked category. **Apples-to-oranges.** It produced wildly misleading numbers like H&H 0.16× and Musical Instruments 7.85× — both completely contradicted by the H10-category-bucketed probe (H&H 1.06×, MI 1.00×).

Dave caught this: *"you can just go and get the Helium 10 data, match it to the correct categories, and then you can calibrate from there, no?"* He was right. The original probe `h10-csv-overshoot-by-category.ts` was always the right tool.

### Revelation 2 — The BSR statistic isn't the bottleneck

I built a test (`scripts/probes/median-vs-sum-test.ts`) to verify the hypothesis that switching from median-BSR to sum-of-daily-rates would close the calibration gap. **The test disproved the hunch.** Across 106 paired ASINs:

- Method A (median-BSR): overall median ratio 0.67×
- Method B (sum-of-daily-rates): overall median ratio 0.73×

That's a ~6-point improvement at the aggregate level, but per-category the picture is mixed:
- Toys & Games has surge-prone products where Method B fixes 2-3× under-predictions
- Arts, Crafts & Sewing has BSR dips that Method B amplifies into 2-4× over-predictions
- Pet Supplies / I&S / K&D still under-predict similarly with both methods → multiplier is the issue

Conclusion: keep median. Don't switch the statistic. Fix multipliers instead.

### Revelation 3 — "More data made it worse" was actually "more data made it more representative"

When P/L/G's category-level median moved from 0.55× (n=104) to 0.33× (n=802) after Dave added more H10 CSVs, Dave reasonably asked how that could happen. The answer: the OLD 104-row sample was biased toward niches Dave had been vetting (mid-band BSRs in less-broken parts of the curve). The NEW 802-row sample represented the full BSR range, including the 4k-15k band which had been catastrophically miscalibrated (0.16-0.18×) all along. The 4k-15k band grew from 22% of the OLD sample to 37% of the NEW sample — that's what shifted the headline median.

Calibration didn't get worse. The representativeness improved.

### Revelation 4 — Test methodology before applying multiplier changes

I initially proposed Pet Supplies × 2.45 and P/L/G × 1.80 based on the broken Keepa-cache probe. Dave's response was: *"Let's run some TESTS before we change any code based on a hunch."* That was the right call. The actual multiplier shifts needed turned out to be different (some larger, some smaller, all band-specific). If we had applied the original proposals, we'd have over-calibrated some bands and missed others.

## Probes shipped to repo

- `scripts/probes/h10-band-aware-probe.ts` — per-category × per-BSR-band probe. Run against any H10 CSV corpus to see current calibration accuracy band-by-band. This is the **primary calibration tool** going forward.
- `scripts/probes/median-vs-sum-test.ts` — disproved the surge-window hypothesis. Worth keeping for future "should we switch statistics?" questions.
- `scripts/probes/plg-split-analysis.ts` — OLD-vs-NEW corpus comparison that explained the "more data made it worse" finding. Reusable for any future category where Dave questions a directional shift.

Existing probes (untracked at end of session — see "Open loose ends" below):
- `scripts/probes/h10-csv-overshoot-by-category.ts` — yesterday's category-level overshoot probe. Foundational; the band-aware probe builds on it.
- `scripts/probes/h10-vs-bloomlens-missing-data.ts` and `scripts/probes/keepa-probe-missing-data-asins.ts` — yesterday's investigation probes from the band-aid-strip work.

## Errors I made today (so future-me doesn't repeat them)

1. **I built the wrong probe first** — bucketed H10 ground truth by H10 category but compared against Keepa-categorized predictions. The numbers were noise. **Fix:** when calibrating against an external source's ground truth, always bucket by the SAME category labels that source uses. The two sides of a calibration comparison must use the same category system.

2. **I proposed multiplier changes from the broken probe.** When I saw "P/L/G under by 3×" from the apples-to-oranges probe, I immediately drafted a × 1.80 multiplier proposal. Dave had to pull me back to test first. **Fix:** never propose multiplier changes without first verifying the methodology matches what production does.

3. **I asked for Keepa token spend when I didn't need to.** Spent 20 minutes designing a "fetch Keepa data for missing ASINs" workflow. Dave correctly redirected: *"you can just go and get the Helium 10 data... we do NOT need to update all the OLD data — we need to improve the calibrations for the FUTURE."* The Supabase corpus has BSR histories for prior submissions, but for FORWARD calibration of H10-category-based predictions, only the H10 CSVs are needed. **Fix:** before designing any data-fetch workflow, ask whether existing data on disk would answer the question.

4. **I underestimated how much H10 data Dave already had.** My first sweep only found 11 CSVs in Downloads. Broader sweep found 208. Dave's hint led me to the `X-Ray Files` folder with 557 more — total 765 CSVs / 16k rows. **Fix:** start any corpus-building work with a broad `find` for ALL `Helium_10_Xray_*.csv` files across `/Users/davekeefe`, not just one folder.

## Remaining work — prioritized

### Stage 2 calibration (deferred, only if Dave re-raises)

The remaining 7 priority + non-priority categories that showed mild miscalibration. Magnitudes are ±5-34% — defensible to touch with the same 16k-row corpus methodology, but Dave deliberately deferred them in this session ("no crazy multipliers").

| Category | Observed median (16k corpus) | Suggested change | Why not now |
|---|---|---|---|
| Baby | 1.34× | ÷ 1.34 | 4k-15k+ bands over-predict because no calibrated bands above 0-4k exist; add bands at 4k-15k (n=69) and 15k-60k (n=63) |
| Health & Household | 1.12× | ÷ 1.12 | Mild magnitude |
| Electronics | 1.11× | ÷ 1.11 | Mild magnitude; tail bands have n<15 |
| Home & Kitchen | 1.08× | ÷ 1.08 | Mild magnitude; H&K is already complex with K&D leaf-first lookup |
| Sports & Outdoors | 0.92× | × 1.08 | Mild magnitude; corpus shows 0-4k under (×1.25), 60k-200k+ slightly over |
| Office Products | 0.93× | × 1.08 | Mild magnitude; mostly the 15k-60k band (×1.17) |
| Tools & Home Improvement | 0.96× | × 1.04 | Mildest — within noise floor |

When Dave re-raises Stage 2:
1. Re-run `npx tsx scripts/probes/h10-band-aware-probe.ts /tmp/combined-h10-full.csv` to confirm the medians hold
2. Use Stage 2 candidates as a pure cleanup PR, NOT mixed with new feature work

### Pet Supplies 200k+ band needs a second look

r9 added a band at 200k+ with mult 0.197 (÷ 3 from default) based on n=32 — exactly at Dave's n≥30 threshold. The observed ratio was 3.00× (we over-predicted by 3× without the new band). Sample is thin and the direction is opposite from every other Pet Supplies band. **If Dave gets student feedback that Pet Supplies long-tail predictions look too low, this is the first place to investigate.**

### Industrial & Scientific 200k+ band still uncalibrated

r9 only fit 4 bands for I&S (0-200k). The 200k+ band has n=24 in the current corpus — below the threshold. Falls back to the new default (0.751). When the I&S corpus grows past n=30 in the 200k+ band, refit.

### Production verification after r9 ship

- Need to spot-check a Pet Supplies, P/L/G, K&D, I&S, or A/C/S market via the BloomEngine app
- Re-vet a fresh ASIN in one of these categories, compare the revenue number to Helium 10's Parent Level Sales
- Watch for student feedback that numbers "shifted" — they DID shift, by design

Rollback if needed: `git revert 397ca91` then re-promote dev → main.

### BloomLens extension state

- v0.5.14 zip uploaded to Web Store by Dave; pending review
- v0.5.13 still in Web Store review queue (drawer aggregation gating)
- v0.5.14 stacks behind v0.5.13
- No further extension work queued

### Open loose ends in the repo

- `scripts/probes/h10-csv-overshoot-by-category.ts`, `scripts/probes/h10-vs-bloomlens-missing-data.ts`, and `scripts/probes/keepa-probe-missing-data-asins.ts` are still UNTRACKED in the working tree. They've been there since yesterday's investigation work but weren't included in any PR. Either:
  - Commit them in a small cleanup PR (they're useful diagnostic tools), or
  - Decide they're throwaway and `rm` them

- `.claude/skills/` directory is untracked — probably should be in `.gitignore` (it's Claude Code skill cache).

- Two existing handoff docs from earlier today (`docs/handoffs/2026-05-13-band-aid-strip-shipped-handoff.md` and `docs/handoffs/2026-05-13-keepa-sweep-shipped-to-dev-handoff.md`) are also untracked. Those should get committed alongside this one.

## Files / memories worth reading first next session

1. **`src/lib/extension/bsrCategoryMultipliers.ts`** — current calibrated multipliers. The 5 r9-refit categories have comments explaining the change rationale.
2. **`scripts/probes/h10-band-aware-probe.ts`** — the primary calibration tool. Run any time you suspect a category's calibration drifted.
3. **`memory/feedback_calibration_data_accuracy.md`** — Dave's rule about never mixing Amazon bucket-floors with BSR-calibrated estimates.
4. **`memory/project_calibration_vision.md`** — revenue zones + priority categories + band-aware multiplier requirements.
5. **`memory/feedback_no_mathematical_band_aids.md`** — re-locked yesterday. Trust Keepa values, don't gate on synthetic thresholds.

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
- No review-velocity guardrails. Ever.
- No mathematical band-aids without Dave's explicit ask. Trust Keepa data.
- No extension zip builds until Dave has tested locally.
- **New today: Use H10's category labels when calibrating against H10 ground truth. Don't bucket by Keepa-resolved category — that's apples-to-oranges.**
- **New today: Test the methodology before proposing multiplier changes. A hunch with a clean-looking number is not enough.**
