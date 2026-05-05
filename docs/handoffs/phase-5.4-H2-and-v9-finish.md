# Phase 5.4-H2 ship + V9 finish-up handoff (2026-05-05)

Today closed out the longest single-day calibration arc to date AND
shipped the first dev → main merge in over three weeks (168 commits).
Production now runs the full Phase 2/3/4/5 stack — the Chrome
extension API surface that mentorship clients have been hitting (and
auth-looping on) is finally live.

This doc has two purposes:
1. Snapshot what shipped today and what's deployed.
2. Propose a roadmap for the remaining V9 work so we can discuss
   priorities before kicking off the next sprint.

---

## What shipped today (2026-05-05)

### Phase 5.4-H2 — base BSR curve recalibration + V3 multipliers

Pivot from 5.4-H. Original 5.4-H plan (per-category multipliers on
top of v1.1.0 universal curve) regressed Test 6 because v1.1.0 was
calibrated to just 48 popular ASINs while the broader H10 corpus
showed the curve overshoots ~2x corpus-wide. Rebuilt against the
merged corpus.

**Training corpus (~3,000 unique ASINs):**
- 2,349 rows from 24 H10 Xray CSV exports across 9 priority categories
  (Toys & Games, Kitchen & Dining, Office Products, Baby, Home &
  Kitchen, Tools & Home Improvement, Clothing, Electronics, Health &
  Household, plus Automotive bonus)
- 2,693 single-variation submission rows where `monthlySales` is
  unambiguously parent-level
- Stored at `scripts/probes/data/h10-extra-corpus.jsonl`

**`bsrSalesCurve.ts` v1.2.0:**
- 10 anchors derived from bucket-median monthly units (Parent Level
  Sales) divided by 30, with geometric-midpoint BSRs per bucket
- Validated against Test 6: per-parent **1.09x median, 100% in
  0.5x-2x band**

**`bsrCategoryMultipliers.ts` v3:**
- 12 root categories qualified (≥20 samples AND median in 0.5x-2x):
  Kitchen & Dining (0.85), Sports & Outdoors (0.76), Pet Supplies
  (0.61), Toys & Games (1.20), Office Products (1.29), Patio Lawn
  & Garden (0.64), Tools & Home Improvement (1.61), Baby (0.93,
  alias Baby Products), Arts Crafts & Sewing (0.58), Electronics
  (0.62), Industrial & Scientific (0.52)
- 3 categories deliberately omitted (median outside 0.5x-2x band):
  Home & Kitchen (3.28x, n=231), Health & Household (3.02x, n=95),
  Clothing/Shoes/Jewelry (4.84x, n=195) — real signal, sub-category
  mix issue. They fall back to base curve (1.0x).

### Phase 5.4-H2 follow-up — root category surfaced to drawer

The drawer's Category column was showing the synth placeholder
("Home & Kitchen") for every row because the enrich payload didn't
include the category back. Server now returns `rootCategory: string |
null` from `pickRootCategoryName(product)`; drawer's `mergeEnriched`
overwrites `category` with it. Confirmed live via post-fix CSV
exports showing per-row real categories (Toys & Games, Pet Supplies,
Electronics, etc).

### Critical fix — CORS allowlist for production extension

`src/lib/extensionAuth.ts:27-29` had a placeholder that was never
filled in. Production extension's `chrome-extension://cighgincghljicihnhbhiehpngfpgbkg`
origin wasn't in `ALLOWED_EXTENSION_ORIGINS` → every CORS preflight
to `/api/extension/*` returned 403 → drawer couldn't read responses
→ users hit an auth loop after signing in. Confirmed by mentorship
clients Kathy + Kosus on the 2026-05-05 group call.

### dev → main merge (the big deploy)

- Local main was at `fc602f3` (Apr 19, "Merge v9-research-detail-redo")
- Production deployed from main per `vercel.json` + Vercel project settings
- Fast-forwarded main to `fa29608` (today's CORS fix), shipping 168
  commits at once: all of Phase 2 (review insights, AI vetting, market
  climate v2), Phase 3 (funnel UX), Phase 4 (price map), Phase 5
  (entire Chrome extension API surface), Phase 5.4-H2 calibration
- **bloomengine.ai now serves Phase 5 features for the first time.**
  Mentorship clients should be able to use the extension after a tab
  refresh (or full Chrome restart to clear cached failed-auth state).

### Test-account upgrades

Both `dave@growwithfba.com` and `dkaaventures@gmail.com` upgraded to
`subscription_status='ACTIVE'` + `subscription_type='YEARLY'` (= `pro`
tier — full features, unlimited searches). Used for dev-preview
validation before the merge.

---

## Repo state (end of day 2026-05-05)

| Repo | Branch | Tip | Status |
|---|---|---|---|
| bloomengine | `dev` | `fa29608` | Pushed |
| bloomengine | `main` | `fa29608` | **Production. Vercel auto-deployed.** |
| bloom-lens-extension | `phase-5-2-bottom-drawer-pivot` | `3bb1e10` | Pushed (Category display fix). Not on extension's main yet. |

**Deployed to Web Store:** v0.5.4 (or v0.5.5 if approval landed
overnight). v0.5.6 with the rootCategory display fix is NOT built or
uploaded — needs a manual Web Store submission round.

**Database state:** all migrations through `20260504000000_create_keepa_lens_metrics.sql`
applied to production Supabase (`xtteljvyljimigqvfvly`). Cache
truncated twice today (post-fix to clear stale payloads). 2 user
accounts upgraded to pro.

---

## Open issues observed today (small, not blocking)

1. **Older vetted products show no image + greyed-out badges** in the
   Vetted Markets list. Dave noticed during dev-preview validation;
   confirmed pre-existing data issue (those products predate the
   listing-image pipeline). Not blocking the merge but worth a backfill
   pass.
2. **Old AI Review Insights / SSPs** require manual "Upgrade to new
   view" click to re-render in the new format. Acceptable per Dave.
3. **Sub-category mix** in 3 outlier categories (H&K, H&H, Clothing)
   means single-multiplier-per-root doesn't fit — they fall back to
   base curve. Phase 5.4-I scope.
4. **Cell Phones & Accessories** treated as separate root by Keepa,
   no multiplier — falls back to base curve. Decision pending whether
   to alias to Electronics.

---

## What's left for V9 (proposed roadmap)

Status of the original V9 roadmap (per `project_v9_roadmap.md`,
revised 2026-04-27):

- **Phase 0–4 ✅ DONE** (foundations, app shell, AI engine, funnel
  UX, vetting visualization)
- **Phase 5** — most sub-phases done (5.1 probe ✅, 5.2 scaffold ✅,
  5.3 scraper ✅, 5.4-A through 5.4-H2 ✅, 5.8 Web Store submit ✅).
  Sub-phases 5.5 (filters/sort/columns/export) and 5.7 (insights +
  market flags) need a status check — Dave should confirm what was
  silently absorbed into the 5.4 sprints vs. still TODO.
- **Phase 6 (Sourcing polish), Phase 7 (Billing/usage)** — both
  un-started.

### Proposed sequence for V9 finish-up

I'm proposing 4 sprints. Order is a recommendation, not locked.

#### Sprint A — Phase 5 wrap-up (1-3 days)

Loose ends from the Chrome extension push that should land before
public-launch readiness work begins.

1. **5.4-I sub-category granularity** for the 3 outlier root categories.
   Approach: nested multipliers indexed by `categoryTree[1].name`
   (sub-category leaf) where data density allows; fall back to root.
   Needs: H10 corpus per sub-category leaf (Dave can pull more CSVs
   filtered by sub-category — e.g. "Cookware", "Bakeware",
   "Decorative Pillows").
2. **Cell Phones & Accessories aliasing** decision. Either alias to
   Electronics multiplier (treats them the same) OR leave as base
   curve fallback (acknowledges they're distinct). Probably needs a
   small data probe to inform.
3. **Web Store v0.5.6** rebuild + upload with the rootCategory
   display fix. Dave's manual step (he has Web Store access). I'll
   prep the zip, write the changelog.
4. **BloomLens UI polish backlog** items still open from 2026-04-29
   list (per memory):
   - Branded pulsing skeleton with progress copy ("Fetching… 58/75")
   - New top-left logo asset (waiting on Dave or designer)
   - (Verify which others have shipped since the memory was written)
5. **Recalculate pill on `/vetting/[asin]`** (deferred from 5.4-E).
   Today the flag sits in `submission_data.__lens_pending_recalc`
   waiting for UI. Banner + Keepa-enrichment endpoint scoped to
   `__lens_new` competitors + a rescore. Material scope (~2 days).

#### Sprint B — Pre-Vetting + Market Climate polish (1-2 days)

The 9-item backlog from 2026-04-25 (`project_market_climate_v2_polish.md`).
Mostly visual/copy fixes. Cluster these into one focused day:

- Established-listings sparkline differentiation (vs in-window)
- 120-day post-launch hover popover clarity
- Headline copy de-duplication (don't restate stat-column data)
- Expanded card adds new info (not just restated facts)
- Period-explicit column headers (e.g., "Average BSR last 12 months")
- BSR axis flip (low at bottom on popover + sparkline)
- Narration tightening (read actual numbers before making demand
  call)

#### Sprint C — Phase 6 Sourcing polish (3-5 days)

From the V9 roadmap:
- **Mandatory vs nice-to-have** field indicators on sourcing forms
- **Supplier comparison view** (likely a side-by-side table)
- **SP-API auto-fetch FBA fees** (replaces manual entry)
- **PO contract PDF generation + info-collection popup**

Alibaba automation explicitly scoped to V11 (not in V9).

#### Sprint D — Phase 7 Billing/usage (3-5 days, BLOCKED)

- **Stripe Embedded Checkout** (per durable rule: no Stripe-hosted
  page redirects). Refactor `/api/stripe/checkout/route.ts` to mount
  Stripe Embedded inside an in-app `/upgrade` page.
- **Tiered subscription gating** (Free / Core / Pro). Code already has
  `deriveLensTier` and `lensFeatures` — needs the same pattern in the
  in-app vetting/sourcing/SSP routes.
- **Per-feature caps** off `usage_events` (table exists from Phase 0).
- **Account usage dashboard** showing usage vs. cap per period.
- **Webhook session-link flow** for upgrade redirects.

**Blocked on:** the pricing table Dave still owes (per V9 roadmap memory).

#### Sprint E — Public launch readiness ("anyone and everyone")

Not in the original V9 roadmap, but Dave's stated goal of "take this
to anyone and everyone to try" needs:

1. **Onboarding flow.** First-run experience after sign-up. What
   should new users see? Tutorial overlay? Sample vetted product?
   Guided "vet your first market" flow?
2. **Pricing page.** Public-facing /pricing page once Phase 7 lands
   tiers.
3. **Marketing/landing surfaces.** Currently bloomengine.ai shows the
   logged-out app. May or may not be enough — discuss whether we
   need a separate marketing site / hero page.
4. **Help docs.** Video walkthroughs (Dave's strength), FAQ, support
   contact. Could be Notion / Intercom / built-in.
5. **Production monitoring.** We pushed 168 commits — error tracking
   (Sentry?) + performance monitoring would catch regressions before
   users do.
6. **Support channel.** Email? In-app chat? Discord?
7. **Soft launch plan.** Mentorship clients first → broader beta →
   public. Define gates between each.

---

## Clarifying questions for Dave

To turn the above into an actual sprint plan, I need answers to:

1. **Priority order.** Which sprint first — A (extension wrap-up), B
   (polish), C (sourcing), D (billing), E (launch)? My instinct is
   A → E → D (auth fix is live, polish loose ends, then launch
   prep, then billing once pricing is locked).

2. **Pricing table for Phase 7.** Are Free / Core / Pro tiers locked?
   What's in/out of each tier? Monthly + Yearly prices?

3. **"Anyone and everyone" definition.** Open public sign-up, or
   invite-gated beta? If gated, who decides who gets in?

4. **Marketing surface.** Is bloomengine.ai (the current logged-out
   landing) the marketing site, or do we need a separate hero
   site/sub-domain?

5. **Phase 5 sub-phases that may or may not exist.** Have 5.5
   (filters/sort/columns/export) and 5.7 (insights + market flags)
   been silently absorbed into other sub-phases, or are there real
   gaps to fill?

6. **Sub-category granularity for the 3 outlier categories.** Worth
   the data-collection effort (you'd need to pull H10 CSVs per
   sub-category leaf), or accept current limitation? Dave's earlier
   call was "don't sweat Electronics, BSRs are noisy" — same logic
   may apply here.

7. **Recalculate pill on `/vetting/[asin]`.** Important for the first
   public launch, or post-launch nice-to-have? Today the data flag
   exists; only the UI is missing.

8. **Soft launch plan.** Are mentorship clients the gate before opening
   broadly? What signals readiness for the next gate?

9. **Web Store v0.5.6.** Want to rebuild + upload immediately tomorrow
   to ship the Category display fix to public users, or batch with
   future extension changes?

10. **Older vetted products' missing images.** Backfill pass worth
    doing? Or accept that pre-pipeline data stays as-is?

---

## Hard rules (durable, from CLAUDE.md + memory)

1. PRs target `dev`, never `main` without explicit instruction.
2. Don't punt merge to Dave — after testing greenlight, push + merge
   are mine to drive.
3. Never combine commit + merge + push in one chained command — run
   each step separately.
4. No "Keepa" in user-facing copy — internal only.
5. Never write "Bloom Lens" two-words — it's "BloomLens" everywhere
   user-facing.
6. No Stripe-hosted page redirects — checkout flows render in-app via
   Stripe Embedded.
7. Skeleton state must NOT flash synth values before real values land
   (Tier 2 cell guard is in place; don't loosen).
8. Tolerance-based numeric checks for AI / rounded values
   (`Math.abs(sum - 100) < 2`).
9. Apply migrations directly — pure CREATE/ADD ops are auto-OK; surface
   destructive ops to Dave first.
10. Probe third-party APIs before writing implementation code.

---

## Carrying gotchas (still apply)

- WXT shadow DOM click-outside handlers must use `e.composedPath()`,
  not `e.target`.
- WXT CSS HMR is unreliable — `rm -rf .output .wxt && npm run dev`
  resets it.
- MV3 content-script `Origin: https://www.amazon.com` on fetch (not
  `chrome-extension://`).
- `.env.local` needs `EXTENSION_DEV_ALLOW_ANY=1` for any
  `chrome-extension://` origin during local dev.
- `research_products` is the funnel store; don't create new tables
  for vetting/funnel data without strong reason.
- Production deploys from **`main`** (not `dev` — confirmed via
  Vercel UI 2026-05-05). Dev deploys as preview only. To ship code
  to bloomengine.ai, push to main.

---

## First message to send Dave

Don't kick off any sprint until the 10 clarifying questions above
have answers. Open with:

> "Picking up V9 finish-up. Read the handoff at
> `bloomengine/docs/handoffs/phase-5.4-H2-and-v9-finish.md` and
> `MEMORY.md`. Confirmed Vercel build [succeeded/failed] post-merge,
> mentorship-client extension [is/isn't] working post-deploy.
> Ready to talk priorities — answering the 10 questions in the
> handoff is the fastest path to a sprint plan."

Then wait for Dave to set priorities before generating any code.
