# Phase 5.4-H3 ship + tomorrow's punch list (2026-05-05 EOD)

End-of-day after shipping the H3 calibration arc to production. Long
day — four iterations on the BSR-derived display logic, a magic-link
auth bridge, column-header sort UX fixes. All on `main` and deployed.

This doc covers:
1. What shipped today
2. What's known-broken and needs to be tomorrow's first 30 minutes
3. Calibration analysis from the latest H10 vs BL CSVs
4. Pending work (sprint planning hasn't restarted yet)

---

## What shipped today (2026-05-05 EOD)

### Phase 5.4-H3 r1–r4 — BSR-primary monthly-units calibration

Pre-H3 the per-child units calc was Tier 1 = `monthlySoldRaw × 1.5`
(Amazon's "X+ bought past month" bucket). That produced visibly-rounded
50-multiples in the drawer (1050, 750, 600 etc) which Dave called out
twice as looking inaccurate. Four-step rebuild:

- **r1** (commit `1ebfdae`): swap to BSR-primary. Calibrated curve +
  V3 category multipliers attributed across the variation family
  (`parent / min(N, 5)`) is the primary signal. Bucket retained as a
  "floor" in this pass.
- **r2** (`9337e75`): parent-floor invariant changed from `parent ≥
  child` to `parent ≥ child × min(N, 5)`. Pre-r2 the parent column
  collapsed to equal the child whenever bucket-floor fired — hiding
  family-total info.
- **r3** (`282b937`): drop the bucket-floor display path entirely.
  Calibrated BSR curve drives the displayed value, full stop. Amazon's
  bucket is no longer involved in display — only as a last-resort `× 1.5`
  fallback when BSR is unavailable. **Saved as durable rule:**
  `feedback_no_round_displayed_numbers.md`.
- **r4** (`5329de5`): added rough multipliers for previously-omitted
  categories — Home & Kitchen 3.28×, Health & Household 3.02×, Clothing
  3.0×. Shipped per Dave's "ship it best you can" directive (these aren't
  private-label focus categories).

Each revision bumped `CURVE_VERSION`; the new version-mismatch guard in
the cache lookup auto-invalidates stale `keepa_lens_metrics` payloads on
deploy without a manual truncate.

### Header refactor (extension)

- Three-zone layout: `[logo + free-tracker] · [Community CTA] · [My Funnel + greeting + tier badge]`.
- Rotating chill greeting (`Hey, NAME` / `What's up, NAME?` / `Welcome back, NAME` etc) — deterministic per day per first-name.
- PRO/CORE tier pill (only when paid).
- Community CTA restyled as emerald gradient pill, centered.

### Extension column-header sort UX

- Whole `<th>` is now the click target (was: only label/chevron).
- Active chevron bumped 10 → 16 with 1.05x scale + emerald-400 color.
- `padding-right` raised so chevrons no longer clip on narrow columns.
- Grip + resize stop propagation so they don't double-fire sort.

### Magic-link auth bridge (NEW endpoint, server-side only — extension-side wiring shipped but the click handler isn't working in prod, see Known broken below)

- `POST /api/extension/handoff` — accepts bearer ext_token + safe path,
  returns a one-time Supabase magic-link URL. Path whitelist prevents
  open-redirect abuse.
- Production curl returns 401 (auth-gated, not 404). Route exists.

---

## Repo state (end of day 2026-05-05)

| Repo | Branch | Tip | Status |
|---|---|---|---|
| bloomengine | `dev` | `c0a40ed` | Pushed |
| bloomengine | `main` | `c0a40ed` | **Production. Vercel deployed.** Verified `/api/extension/handoff` and `/api/extension/enrich` both return 401 (live). |
| bloom-lens-extension | `phase-5-2-bottom-drawer-pivot` | `85c11d7` | Pushed. Local dev build at `.output/chrome-mv3-dev/` is what Dave is testing against. |

**Web Store:** still at v0.5.5 (or v0.5.4 if approval delayed). v0.5.6
**not built or uploaded** yet. Public users do NOT see today's extension
changes (header refactor, parent columns, sort UX, My Funnel button).
They DO see the H3 calibration changes (those are server-side and
deployed via `main`).

---

## Known broken — fix first thing tomorrow

### 1. "My Funnel" button doesn't open anything

Dave tested the button in his local unpacked dev extension; it doesn't
open a tab. Endpoint is live in production but possibly:

- Local dev call to `/api/extension/handoff` is failing silently (the
  click handler swallows errors and console-warns). First diagnostic:
  inspect the **service worker DevTools** OR the **content-script
  Network tab** while clicking the button — look for the POST to
  `localhost:3000/api/extension/handoff`. If it 401's, token mismatch.
  If it 500's, Supabase admin call is failing (likely `generateLink`
  needs `SITE_URL` configured in Supabase Auth settings to match the
  production redirect host).
- OR Supabase's `generateLink` returned a URL but `chrome.tabs.create`
  is being blocked. Less likely.

Fix path:
1. Open the unpacked extension's service-worker DevTools (`chrome://extensions` → "service worker").
2. Click My Funnel; watch Network + Console.
3. If POST succeeds and returns a URL, log it before `chrome.tabs.create` and verify the URL is well-formed.
4. If POST fails, drill into the route — most likely the Supabase `auth.admin.generateLink` call. May need to confirm the supabase-admin client has `service_role` key OR that the project's Auth → URL Configuration includes the redirectTo path.

### 2. Home & Kitchen multiplier (3.28×) is overshooting Kitchen-subcategory products by ~3×

Latest CSV pair (2026-05-06 + Helium_10_Xray_2026-05-05 (3)) shows
homebrewing products labeled "Kitchen & Dining" by H10 are labeled
"Home & Kitchen" by Keepa's `categoryTree[0]`. We multiply by 3.28× when
the right multiplier should be 0.853× (Kitchen & Dining). Net: BL parent
~3× over H10 for these rows.

| ASIN | BL Parent | H10 Parent | BL/H10 |
|---|---|---|---|
| B0064O7YFA Five Star Star San 32oz | 5087 | 1556 | 3.27× |
| B00SDLLZDY Fermtech Auto Siphon | 4779 | 1540 | 3.10× |
| B07115V3F7 FastRack Mason Jar | 1263 | 907 | 1.39× |
| B00A6TRKO4 Fastrack Twin Bubble | 1958 | 1218 | 1.61× |

This is the exact "sub-category mix" issue Phase 5.4-H2 originally
omitted these multipliers to avoid. Two clean fixes:

- **A. Drop H&K back to 1.0× (no multiplier).** Restores undershoot for
  actual H&K-classified products but stops the overshoot. Fastest path
  back to "no-worse-than-Phase-5.4-H2." Same call applies to Clothing
  and possibly Health & Household.
- **B. Phase 5.4-I — sub-category granularity.** Index multipliers by
  `categoryTree[1].name` instead of `[0].name`. Needs a few more H10
  CSV exports filtered by sub-category leaf. Material scope (~1 day).

Dave said these aren't focus categories so option A is the pragmatic
default. Confirm at start of tomorrow.

---

## Calibration analysis from latest CSVs

**Tools & Home Improvement** (calibrated 1.614×, prior CSV pair from
floor-lamps search): median BL/H10 parent ratio ~1.05× — at parity. ✓

**Baby Products** (calibrated 0.925×, prior CSV pair from baby-gates):
mixed (1.19× on some rows, 0.59× on others). Acceptable for ship.

**Industrial & Scientific** (calibrated 0.523×, latest homebrew CSV):
roughly fine for the in-sample products.

**Home & Kitchen** (newly 3.28×): overshooting ~3× for Kitchen-subcategory
products. See above.

**Health & Household** (newly 3.02×): undershoots ~2× for some niche
brewing products (B0064O7Y64 Five Star 16oz: BL 731 vs H10 1555 = 0.47×).

**Per-child attribution** has fundamental noise from not having per-
sibling BSR data. Some queried ASINs are bestsellers (queries should
match closely to H10 ASIN Sales), others are non-bestseller siblings
(our `parent / min(N,5)` overshoots H10 for them by 3-13×). No fix
without per-sibling Keepa calls. Parent-level is the more reliable
column to compare against H10.

---

## Pending work (V9 finish-up — sprint plan still locked but not started)

Sprint order Dave approved earlier today: **A → E → D → B → C**.

- **Sprint A — Phase 5 wrap-up.** What's left after H3:
  - Web Store v0.5.6 rebuild + manual upload (Dave's step). Dist at
    `bloom-lens-extension/.output/chrome-mv3/`. Need a changelog.
  - 5.4-I sub-category granularity for H&K / H&H / Clothing (or just
    drop their multipliers — Dave's call).
  - Cell Phones & Accessories aliasing decision.
  - Recalculate pill on `/vetting/[asin]` (deferred from 5.4-E).
  - BloomLens UI polish backlog still open.
- **Sprint E — Public launch readiness.** Onboarding flow, pricing page,
  marketing surfaces, monitoring (Sentry?), support channel, soft
  launch plan.
- **Sprint D — Phase 7 Billing.** Blocked on pricing-table answer.
- **Sprint B — Pre-Vetting / Market Climate polish backlog.**
- **Sprint C — Phase 6 Sourcing polish.**

Detailed proposal: `docs/handoffs/phase-5.4-H2-and-v9-finish.md` (yesterday's doc).
That handoff also has the 10 clarifying questions Dave hasn't fully answered yet.

---

## Hard rules (durable, don't break)

1. PRs target `dev`, never `main` without explicit instruction.
2. After committing, pause and wait for confirmation before merging or pushing.
3. Don't punt the merge to Dave — after testing greenlight, push + merge are mine to drive.
4. Never combine commit + merge + push in one chained command.
5. **NO ROUND NUMBERS in displayed metrics.** BSR-curve drives display, full stop. Amazon's bucket is for validation only. (Saved: `feedback_no_round_displayed_numbers.md`)
6. No "Keepa" in user-facing copy.
7. "BloomLens" is one word in user-facing surfaces.
8. No Stripe-hosted page redirects.
9. Tolerance-based numeric checks for AI / rounded values (`Math.abs(sum - 100) < 2`).
10. Production deploys from `main`. Dev = preview. To ship code to bloomengine.ai, push to main.

---

## Tomorrow's first message to Claude

Use the kickoff prompt at:
`docs/handoffs/phase-5.4-H3-kickoff-prompt.md`

That doc has a copy-paste ready prompt to load into the next terminal session.
