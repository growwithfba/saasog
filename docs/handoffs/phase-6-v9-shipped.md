# Phase 6 V9 sourcing polish — shipped to production (2026-05-08 EOD)

**Production state:** `main` at `69cda8f` (Vercel deployed). Phase 6 V9 closes the sourcing-page polish work that started as Sprint C item 1 (mandatory-vs-nice indicators) and grew into a full sweep across the Sourcing Hub, Supplier Quotes tab, Profit Matrix tab, Place Order tab, and the BloomLens-import → /vetting flow.

---

## 1. What shipped

### Production progressed `476d48e` → `69cda8f` (1 merge commit + 6 squash commits)

| Squash | PR | What |
|---|---|---|
| `c74f0a3` | #32 | **V9 polish (foundational).** DDP-Basic field-mapping bug fixes (Cost row showed shipping value, Freight/Duty was empty, ROI inflated, totalInvestment understated). Sticky-header flicker fix on short pages. Hub gauge sizing. Profit "Overview" → "Profit Matrix" rename + dropped Christmas-tree red. Sourced Products pill consistency. Sandbox tightening. Supplier Info dropdown bug + "Show/Hide" affordance. **Sprint C item 1: mandatory-vs-nice asterisks** (8 Basic + 12 Advanced fields). Multi-supplier row chrome (alternating blue/purple left accent). Section visual hierarchy. Target Sales Price reads from Offering w/ override. |
| `3e3849d` | #33 | **V9 polish 2.** Product Category mirrors From-Research/Reset pattern. Supplier Quotes empty state cleanup. CBM/Total CBM derived-field demote. Agreed Order Summary visual hierarchy (4 emphasized money cards + 5 demoted secondary stats). SSP+Sampling visual separation under "Quality & Differentiation" caption. |
| `75e0689` | #34 | **Pre-main 1.** Vetting list "Product" → "Market". Continue to Sourcing button purple/indigo branding. CBM AUTO-tag overflow fix. PO Checklist progress bar tier-colored. "Show Agreed" → "Show Unmapped" filter (rewired to filter on `mapped===false`). $NaN bug in Place Order mapped Freight/Duty/Tariff cells. Offering-tab flicker fix. Value/Competitive/Premium prices snap to nearest $0.99. BloomLens auto-score on creation. Re-enabled Download Purchase Order PDF button. |
| `1458ff9` | #35 | **Pre-main 2.** Continue to Sourcing 409 → silent navigate. Whole supplier row click-to-toggle. Profit Matrix toolbar trim (View toggle, Hide Incomplete, Hide Pending dropped). SSP Remove → small trash icon. Drop AUTO tag from CBM. Sample Quality slider polish (tier label + colored fill + bigger thumb). PO row click-to-edit. Show Unmapped no longer leaves empty ghost sections. **Redesigned Purchase Order PDF** (branded header, Buyer/Supplier blocks, emerald money-stats box, full sections, dual signature block, page footers). |
| `a55b240` | #36 | **Pre-main 3.** /api/analyze GET transitional fallback — derives score on-the-fly when `sub.score` is null AND `__lens_origin === true`. Currency formatting on cost / price / fee mapped fields. SSP section now expandable with optional fields rendered inline ("Confirm to include in PO"). Confirm button blocked while editing. New "Show Missing" filter on PO Checklist. |
| `0063183` | #37 | **Pre-main 4.** analyze-market sets `research_products.is_vetted=true` on create. Dashboard.tsx derives is_vetted from score as self-healing fallback for existing data — Bento Box and other already-existing BloomLens markets render the vetted-stage badge without a DB backfill. |
| `69cda8f` | #38 | **dev → main promotion.** All six PRs land in production together. |

### End-to-end validated on Vercel preview before promotion

- ✅ DDP-Basic supplier on Profit Matrix shows correct Cost row + Freight/Duty Combined row + ROI matches profit math
- ✅ Profit Matrix incoterms cell editable bidirectionally; Supplier Quotes Pricing/Terms dropdown updates in lockstep
- ✅ Sourcing detail pages with no supplier quotes — scrolling to the bottom no longer flickers the ProductHeader
- ✅ Sourcing Hub gauge sized to L/R column heights; "CALCULATION ACCURACY" label sits in the header band
- ✅ Supplier Quotes mandatory fields show red `*`; nice-to-haves no longer amber-tint when empty
- ✅ Whole supplier row click toggles expand/collapse (except name field, pencil, checkbox)
- ✅ PO Checklist progress bar: red → amber → yellow → emerald as fields confirm
- ✅ Show Unmapped / Show Missing / Show Unconfirmed filters mutually exclusive
- ✅ Place Order row click-to-edit; Confirm blocked during edit
- ✅ Currency formatting on PO cost cells: `0.5` → `$0.50`, `0.245` → `$0.25`
- ✅ SSP section expandable with "Confirm to include in PO" header
- ✅ Redesigned PO PDF — branded header, two-col Buyer/Supplier, emerald money-stats box
- ✅ BloomLens-imported markets show real PASS/RISKY/FAIL pill + vetted-stage badge (Bento Box, Double Rods Rack)

---

## 2. Files changed today (16 files; +1750 / -540)

### New
- `docs/handoffs/phase-5.4-M-rotations-shipped.md` (carried over)
- `docs/handoffs/phase-5.4-N-kickoff-prompt.md` (carried over)
- `docs/handoffs/phase-5.4-N-shipped-and-lens-redesign.md` (carried over)
- `docs/handoffs/phase-5.4-O-kickoff-prompt.md` (carried over)
- `docs/handoffs/phase-5.4-O-shipped.md` (carried over)
- `.claude/settings.json`

### Modified

| File | Why |
|---|---|
| `src/components/Sourcing/tabs/ProfitCalculatorTab.tsx` | DDP cost-row replacement dropped; freightDutyCombined fallback picks up `ddpPrice` for DDP; renamed everywhere; Christmas-tree styling stripped (no red `isWorst`, only emerald Best); peer-missing two-tier amber/slate; bidirectional incoterms edit; toolbar trim. |
| `src/components/Sourcing/tabs/SupplierQuotesTab.tsx` | landedUnitCost reuses `shippingCost`; `costPrice` cascade adds `exwUnitCost`; mandatory asterisks on 20 labels + nice-to-have `getOptionalFieldClass()`; multi-supplier row chrome with blue/purple accent; section header normalization; CBM derived-field demote (then dropped AUTO tag in pre-main 2); Sample Quality slider polish; whole-row click-to-toggle; Inspection Cost/Unit relabeled (was "Misc"). |
| `src/components/Sourcing/tabs/SourcingHub.tsx` | Gauge sized 200→170→200 (settled); CALCULATION ACCURACY label in header band; Target Sales Price + Product Category override pattern with Reset link. |
| `src/components/Sourcing/tabs/SourcingSandbox.tsx` | Tightened padding/gaps; right column stretches via flex-1 to match left column height. |
| `src/components/Sourcing/SourcingDetailContent.tsx` | min-h-[calc(100vh+12rem)] guard against sticky-toggle flicker; tab nav "Profit Overview" → "Profit Matrix". |
| `src/components/Sourcing/SourcingPageContent.tsx` | Status pill px-3 py-1 to match Vetting; Margin/ROI dropped to plain colored text. |
| `src/components/Sourcing/tabs/placeOrder/PlaceOrderChecklist.tsx` | Show Unmapped/Show Missing/Show Unconfirmed filters; tier-colored progress bar; row click-to-edit; Confirm blocked during edit; optional fields render inline; section hide when filter empties; currency formatting helper. |
| `src/components/Sourcing/tabs/placeOrder/valueMapper.ts` | `isFiniteNumber()` guard for mapped numeric fields fixed `$NaN` bug. |
| `src/components/Sourcing/tabs/placeOrder/pdf.ts` | Full rewrite — branded header, Buyer/Supplier two-col blocks, emerald money-stats box, sectioned details, dual signature block, footers. ~407 added / 145 deleted. |
| `src/components/Sourcing/tabs/PlaceOrderTab.tsx` | Agreed Order Summary visual hierarchy (4 cards + 5 demoted); Download PDF re-enabled with purple gradient. |
| `src/components/Offer/tabs/OfferTab.tsx` | Charm-pricing helper `roundToCharm99()`; Continue to Sourcing 409 silent-navigate; purple/indigo branding. |
| `src/components/Offer/OfferDetailContent.tsx` | Sticky-flicker min-h guard. |
| `src/components/dashboard/Dashboard.tsx` | "Product" column → "Market"; client-side `isVettedDerived` fallback. |
| `src/utils/learnVideos.ts` | "Profit Overview Tab" → "Profit Matrix Tab" + title. |
| `src/app/api/analyze/route.ts` | GET endpoint computes `derivedScore` + `derivedStatus` on-the-fly for Lens-origin submissions with null score. |
| `src/app/api/extension/analyze-market/route.ts` | Auto-score on create via `calculateMarketScore`; `is_vetted=true` set on research_products in both upsert branches. |

---

## 3. Repo state (end of day 2026-05-08)

| Repo | Branch | Tip | Status |
|---|---|---|---|
| bloomengine | `main` | `69cda8f` | **Production. Vercel deployed.** Phase 6 V9 live. |
| bloomengine | `dev` | `0063183` | Synced via PR #38 promotion. |
| bloom-lens-extension | `phase-5-2-bottom-drawer-pivot` | `d56f1a4` | Local commit (markets-picker score colors) — **not pushed**. v0.5.8 still awaiting Web Store review; will roll into v0.5.9 zip. |

### Branches deleted today
- `phase-6-v9-field-mapping` (renamed to `phase-6-v9-polish` mid-session, then merged + deleted via #32)
- `phase-6-v9-polish-2` (#33)
- `phase-6-v9-pre-main-fixes` (#34)
- `phase-6-v9-pre-main-fixes-2` (#35)
- `phase-6-v9-pre-main-fixes-3` (#36)
- `phase-6-v9-pre-main-fixes-4` (#37)

### MEMORY.md additions today
- `feedback_push_freely_except_main.md` — "Push to feature/dev branches without asking; only main needs explicit OK."
- `project_phase_6_v9_ship_state.md` — full shipped state + V10 backlog.

---

## 4. What's open / blocked

### Carry-overs (not blocked, just awaiting external)
1. **Web Store v0.5.8 reviewer approval** — Google review still in progress. Once approved + propagated, delete the `return false;` early-return at the top of `src/hooks/useExtensionInstalled.ts` to re-enable detection.
2. **bloom-lens-extension `d56f1a4`** — local-only commit (markets-picker score colors). Will roll into v0.5.9 zip after v0.5.8 lands.

### V10 backlog (per project_phase_6_v9_ship_state.md memory)
1. **Sourcing dashboard column-picker** with vetting/offering data (was #1 in Dave's original 15-item Phase 6 ask)
2. **FBA fee auto-populate** via SP-API + quarterly maintenance agent (#2/#8)
3. **Supplier Quotes 3-tab restructure** — Supplier Info / Basic Calc / Advanced Calc (#7's bigger ask)
4. **Profit Matrix full data-presentation redesign** (#11's bigger ask)
5. **Place Order Agreed Order Summary full redesign** + checklist front-loading walk-through (#13/#14)
6. **Hub treatment full overhaul** across all three tabs (#15)
7. **Auto-trigger Market Climate generation** on first BloomLens-market detail-page view (currently manual)
8. **Drop the `__lens_origin` score-derivation fallback** in `/api/analyze` — once the auto-score-on-create fix has been in production for ~7 days and existing pre-fix markets have either been manually recalced or expired

### Sprint E (V9 launch readiness — separate track)
Strategic decisions still owed:
- Soft-launch shape (invite-only beta vs open Web Store)
- Monitoring (Sentry vs Vercel logs)
- Support channel (email vs Skool vs in-app chat)
- Pricing page polish vs full marketing site
- Onboarding tour scope
- Demo video timing

---

## 5. Lessons captured to memory

1. **Push-to-feature-branch rule** — Dave updated the global "pause before push" instruction: push freely on any branch except `main`. Saved to `feedback_push_freely_except_main.md`.
2. **BloomLens always hits production** (carried over) — feature work that depends on extension-write paths can't be E2E validated on a Vercel preview alone. Either ship to prod first OR build a transitional read-side fallback (as today's score-derivation in `/api/analyze` did).
3. **Optional schema fields can land as `undefined`, not just `null`** — `field !== null` accepts `undefined`, which slipped past in `valueMapper.ts` and produced `$NaN` in mapped checklist cells. Use `isFiniteNumber()` (the helper introduced in pre-main 1) for any numeric guard going forward.
4. **Charm-pricing semantics** — when rounding marketing prices, snap to the nearest `.99` (favoring round-up on ties). Helper `roundToCharm99()` in `OfferTab.tsx` is the reference impl.

---

## 6. Sprint status (V9 roadmap)

| Item | Status |
|---|---|
| Phase 6 V9 Sourcing polish | ✅ shipped 2026-05-08 (this batch) |
| Phase 6 V9 — Sprint C item 1 (mandatory-vs-nice) | ✅ shipped (was paused for 4 sessions) |
| Web Store v0.5.8 propagation | 🟡 pending Google review |
| Re-enable extension detection | ⏳ pending v0.5.8 propagation |
| BloomLens UI polish backlog | ⏳ ongoing |
| Sprint E launch readiness | 🔜 next major track |

**V9 sourcing polish is closed.** Two carry-overs are external (Google review). Next major track per the V9 roadmap is Sprint E (public launch readiness).

---

## 7. Next session candidates

### PATH A — Validate the V9 ship in production (10 min)
Open BloomLens, create a fresh market, navigate to /vetting, confirm:
- Real score shows up
- PASS/RISKY/FAIL pill renders
- Vetted-stage badge in PROGRESS column
- Detail page Sourcing Hub + Supplier Quotes + Profit Matrix + Place Order tabs all reflect the V9 polish

Probably worth doing FIRST in next session before picking other work.

### PATH B — Sprint E launch readiness (strategic, conversational)
Pick directions on:
- Soft-launch shape
- Monitoring stack (Sentry vs Vercel logs)
- Support channel
- Pricing page polish vs full marketing site
- Onboarding tour scope
- Demo video timing

These are decisions Dave owes; nothing to implement until directions are picked.

### PATH C — V10 Phase 6 redesign track
Big work. Per the locked Flavor 1 plan (V9 ships fast, V10 rebuilds):
- 6.A FBA fee infra (hardcoded table + quarterly maintenance workflow)
- 6.B Supplier Quotes 3-tab restructure + Advanced cleanup with SSP+Sampling separation
- 6.C Profit Matrix overhaul
- 6.D Place Order Agreed Order Summary + checklist walk-through
- 6.E Sourced Products dashboard expansion (column-picker + cross-funnel data)
- 6.F Adds (subset to be picked from B1-B8)

Estimated 3-4 weeks of focused work. Best done after Sprint E ships.

### PATH D — BloomLens follow-ups
- Score pill color coding in markets picker (`d56f1a4` local commit ready to bundle)
- Roll into v0.5.9 zip + Web Store upload once v0.5.8 is approved

---

## 8. Standing rules (don't break)

1. PRs target `dev`, never `main` without explicit instruction.
2. Push to feature/dev branches without asking; only `main` requires explicit OK (per `feedback_push_freely_except_main.md`).
3. Don't punt the merge to Dave — push + PR + merge are mine to drive after testing greenlight.
4. Never combine commit + merge + push in one chained command.
5. **NO ROUND NUMBERS in displayed metrics.** BSR-curve drives display.
6. No "Keepa" in user-facing copy.
7. "BloomLens" is one word in user-facing surfaces.
8. **No Stripe-hosted page redirects.**
9. Tolerance-based numeric checks for AI / rounded values.
10. Production deploys from `main`. Dev = preview.
11. **`effectiveTier` ≠ `tier` for display.**
12. **Adjustments and Expansions are separate concepts.**
13. **BloomLens always hits production**, regardless of preview URL. Feature work that depends on extension-write paths needs prod ship OR a transitional legacy-data fallback.
14. Some `/vetting/[asin]` matrix metrics are client-side derived from `competitors`, not from a persisted column. Recalc only changes score, AI briefing, BSR/Price stability.
15. **NEW (2026-05-08):** Charm-pricing — Value/Competitive/Premium tiers snap to nearest `.99` via `roundToCharm99()`.
16. **NEW (2026-05-08):** Optional numeric schema fields land as `undefined` not just `null`. Use `isFiniteNumber()` for value guards.

---

## 9. Tomorrow's first message to Claude

Use the kickoff prompt at: `docs/handoffs/phase-6-v10-kickoff-prompt.md`
