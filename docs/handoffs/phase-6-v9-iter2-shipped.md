# Phase 6 V9 iter1 + iter2 — shipped to production (2026-05-09)

**Production state:** `main` at `39bf4f6` (Vercel deployed). Heavy single-day iteration on top of yesterday's V9 ship — bug fixes from Dave's prod validation walkthrough, two rounds of polish refinements, plus a one-off DB schema fix for a column that had been silently missing.

---

## 1. What shipped

### Production progressed `69cda8f` → `39bf4f6` (1 merge commit + 8 squash commits)

| Commit | PR | What |
|---|---|---|
| `b5ea64f` | #39 | **Critical bugs (items 13/14/16).** Competitive ≠ Premium price collision (anchored on median, not top-5 avg). Offer → Sourcing target-price flow via new `sourcing_hub.offerTargetSalesPrice` field + 3-state Hub label ("Overridden" / "From Offering" / "From Original ASIN"). Calculation Accuracy ring stays at 0% on add (incoterms default = `''` instead of `'DDP'`). **Also exposed + fixed a pre-existing data-layer bug: the `sourcing_hub` JSONB column didn't exist in prod, so Hub overrides had been silently failing to persist for the entire feature's lifetime.** |
| `1d072e4` | #40 | **SSP polish (items 9/10/11).** Dropped Refine button (Ask AI only). AI Note redesign — blue accent border + gradient bg + Sparkles icon + larger body text. Top-Pick badge spacing fix. |
| `bbc43a9` | #41 | **Supplier Quotes UX (items 15/17/18/19).** Auto-focus + select-all on Add Supplier; collapse-others + scroll-to-new on Add; Collapse All / Expand All toolbar buttons; Hide-supplier (`isHidden` field on `SupplierQuoteRow`, hidden rows surface as click-to-unhide pills, excluded from Sourcing Hub accuracy ring). |
| `2977ec4` | #42 | **PO Checklist filter auto-expand (item 21).** Show Unmapped / Show Missing / Show Unconfirmed now expand matching sections + collapse non-matches in one go. Mutual-exclusivity logic moved into a single `applyFilter` helper. |
| `b671668` | #43 | **Profit Matrix Totals — first redesign pass (item 20).** "Bottom Line — Profit, Margin & ROI" gradient header, emerald-tinted profit-metric rows, slate cost rows. (Refined further in iter2 below.) |
| `fec7a7b` | #44 | **iter2 — 7 polish items (A-G).** Each from second-round prod feedback: A) SSP ghost-gap fix via inline button layout (no separate action bar). B) Enter blurs supplier name field. C) Bidirectional hide between Supplier Quotes and Profit Matrix (Profit Matrix's local `hiddenSuppliers` Set replaced with the persisted `isHidden` flag; toggle calls `handleUpdateQuote`). D) Bottom Line refinements — reordered (cost rows first, outcomes after), continuous emerald band, **Trophy dropped (tacky)**, tier-based cell coloring per supplier-quotes-style helpers (red/yellow/emerald), Best emphasized via ring not badge, less boxy. E) Sticky supplier-name thead (`sticky top-16`). F) Dropped green/red Save/Cancel buttons from Profit Matrix cell editing — blur saves, Enter saves, Escape cancels. G) Same treatment for PO Checklist value editing. |
| `5248af9` | #45 | **Sticky thead fix.** iter2's `sticky top-16` didn't actually engage because the table sat inside `overflow-x-auto`, which the browser coerces into a y-axis scroll container with no fixed height. Switched to bounded internal scroll on the matrix card (`overflow-auto max-h-[calc(100vh-12rem)]`) so the thead has a real scroll context. The matrix now scrolls inside its own card with supplier names pinned to the top. |
| `f5f68a5` | #46 | **Pre-vet fallback (item 4).** Mirrored `/api/analyze`'s score-derivation fallback in `/api/extension/markets` so the BloomLens markets picker shows real scores for old Lens-origin submissions with NULL score (5 affected: Bento Box, Double Rods Rack, Jump Rope, 2 deviled-egg). No DB writes — pure read-side heal until the next user-driven Recalc. |
| `39bf4f6` | #47 | **dev → main promotion.** All 8 squash commits land in production together. |

### Database migration applied directly to prod

- **`add_sourcing_hub_column_to_sourcing_products`** — `ALTER TABLE public.sourcing_products ADD COLUMN IF NOT EXISTS sourcing_hub JSONB NOT NULL DEFAULT '{}'::jsonb`. Additive, reversible. Rows backfilled to `{}`. Required because the API had been referencing this column for months but the migration was never applied — `status` and `profit_calculator` are still missing too (separate carry-over).

### Extension repo (separate)

- **bloom-lens-extension v0.5.10** zip ready at `.output/bloom-lens-extension-0.5.10-chrome.zip` (628 kB). Dave will push to Web Store. Bundles items 1, 2, 3, 5, 6 plus the carry-over markets-picker score-pill colors.
  - 1) IN FUNNEL badge: glow on the product image (cyan/emerald multi-stop ring), muted corner badge in Save-to-Funnel palette
  - 2) FAB position: `bottom: 96px` (above Helium 10's chrome)
  - 3) Analyze Market modal: shared shell size for both tabs (`min-height: 460px, max-width: 640px`), custom JS-driven cyan-stripes resize handle in bottom-right (browser-native `resize: both` removed — was tiny + caused modal to close on release)
  - 5) My Funnel button: matches BloomEngine Research PhasePill (blue palette, font-weight 600, rounded-xl, blue glow on hover)
  - 6) My Funnel destination: kept at `/research` (the funnel listing) — Dave confirmed fine

---

## 2. Files changed today (28 files; +2,849 / −992)

Notable areas:
- `src/components/Sourcing/tabs/ProfitCalculatorTab.tsx` — biggest churn (+533/−281). Tier-based cell coloring, dropped Save/Cancel buttons, sticky thead with bounded scroll, Bottom Line restructure, bidirectional hide via `isHidden` flag.
- `src/components/Sourcing/tabs/SupplierQuotesTab.tsx` — Hide button, Collapse All / Expand All, focus on add, collapse-others, incoterms default to `''`.
- `src/components/Sourcing/SourcingDetailContent.tsx` — auto-save now includes `sourcingHub` in body + dataHash.
- `src/components/Offer/tabs/OfferTab.tsx` — Competitive price anchored on median, Continue-to-Sourcing 409 PATCH path.
- `src/components/Offer/tabs/SspBuilderHubTab.tsx` — inline button layout, Refine removal, AI Note redesign.
- `src/app/api/extension/markets/route.ts` — Pre-vet fallback for old Lens markets.
- `src/components/Sourcing/types.ts` — added `SourcingHubData.offerTargetSalesPrice` and `SupplierQuoteRow.isHidden`.

Plus carry-over docs: `phase-5.4-M-rotations-shipped.md`, `phase-5.4-N-*`, `phase-5.4-O-*`, `phase-6-v9-shipped.md`, `phase-6-v10-kickoff-prompt.md` (carried into main from yesterday's dev branch).

---

## 3. Repo state (end of day 2026-05-09)

| Repo | Branch | Tip | Status |
|---|---|---|---|
| bloomengine | `main` | `39bf4f6` | **Production. Vercel deployed.** |
| bloomengine | `dev` | `f5f68a5` | All work merged; in sync with main (one merge commit ahead). |
| bloom-lens-extension | `phase-5-2-bottom-drawer-pivot` | `a27a82e` | v0.5.10 zip built and pushed. Dave pushing to Web Store. |

### Branches deleted today
- `phase-6-v9-critical-bugs` (#39)
- `phase-6-v9-ssp-polish` (#40)
- `phase-6-v9-supplier-quotes-ux` (#41)
- `phase-6-v9-misc` (#42)
- `phase-6-v9-profit-matrix-totals` (#43)
- `phase-6-v9-iter2` (#44)
- `phase-6-v9-sticky-fix` (#45)
- `phase-6-v9-prevet-fallback` (#46)

### MEMORY.md additions today
- `feedback_verify_supabase_schema_before_trusting_persistence.md` — when chasing persistence bugs, query `information_schema.columns` first. The `/api/sourcing` route still references `status` and `profit_calculator` columns that don't exist; only `sourcing_hub` was added.
- `feedback_one_test_link_per_session.md` — one test link per testing round. Bundle multiple PRs onto dev (or a single feature branch); never hand Dave a list of separate PR previews. Triggered by the iter1 round where I gave him 4 PR links.

---

## 4. What's open / blocked

### V10 backlog (per yesterday's plan, partially overlapping with today's items)
1. **Item 8 — SSP miscategorization.** AI prompt-tuning, not UI. Top picks landing in wrong categories (e.g., quality-shift SSPs filed under Bundle). Worth a separate look at the SSP-generation prompt — might need a category re-checking pass after generation.
2. **Item 12 — Offer → Sourcing transition redesign.** "Where do I go next" problem after locking SSPs. The `Continue to Sourcing` CTA is at the bottom of the Offer page; might need stronger discoverability OR a single-page restructure. Architectural call belongs in V10.
3. **Sourcing dashboard column-picker** with vetting/offering data (#1 in Dave's original Phase 6 ask).
4. **FBA fee auto-populate** via SP-API + quarterly maintenance agent.
5. **Supplier Quotes 3-tab restructure** — Supplier Info / Basic Calc / Advanced Calc.
6. **Profit Matrix full data-presentation redesign** beyond today's Bottom Line work.
7. **Place Order Agreed Order Summary full redesign** + checklist front-loading walk-through.
8. **Hub treatment full overhaul** across all three tabs.
9. **Auto-trigger Market Climate generation** on first BloomLens-market detail-page view (currently manual — Dave wants this deferred for now to save credits).

### Pre-existing data-layer carry-overs (not blocking, but worth a future cleanup)
- **`sourcing_products.status` and `sourcing_products.profit_calculator` columns are missing.** API references them in POST/PATCH but DB silently drops the writes. Auto-save doesn't currently send them, so no in-feature regression — but the API surface lies. Either add the columns OR remove the references.
- **`__lens_origin` score-derivation fallback** can be retired in `/api/analyze` and `/api/extension/markets` once pre-fix Lens markets have aged out (~7 days from 2026-05-08).

### Sprint E (V9 launch readiness — separate track, decisions Dave owes)
- Soft-launch shape (invite-only beta vs open Web Store)
- Monitoring (Sentry vs Vercel logs)
- Support channel (email vs Skool vs in-app chat)
- Pricing page polish vs full marketing site
- Onboarding tour scope
- Demo video timing

---

## 5. Lessons captured to memory

1. **Verify Supabase schema before trusting persistence** (`feedback_verify_supabase_schema_before_trusting_persistence.md`). Discovered the `sourcing_hub` column was missing while debugging item 14. The bug looked like a client-side fetch issue; it was a missing column. Future persistence-bug debugging should start with `information_schema.columns`.
2. **One test link per testing round** (`feedback_one_test_link_per_session.md`). Dave hard-rejected the iter1 4-PR-link testing flow. Going forward: bundle work onto dev (or a single feature branch) and give one preview URL when it's time to test.
3. **Browser `resize: both` is fragile inside modal overlays.** It's tiny, hard to grab, and the mouseup-outside-modal event gets interpreted as a click on the overlay → onClose fires. Custom JS-driven resize handles with an `isResizingRef` guard are safer.
4. **`overflow-x: auto` + sticky-y is a trap.** The browser coerces overflow-x-auto into a y-axis scroll container too. With no fixed height, sticky-y has nothing to stick against. For sticky table headers, give the wrapper a bounded `overflow-auto max-h: ...` so the table scrolls inside its own card.

---

## 6. Sprint status (V9 roadmap)

| Item | Status |
|---|---|
| Phase 6 V9 Sourcing polish (yesterday's batch) | ✅ shipped 2026-05-08 |
| **Phase 6 V9 iter1 + iter2 (today's batch)** | ✅ **shipped 2026-05-09** |
| BloomLens v0.5.10 — Web Store upload | 🟡 in Dave's hands (zip ready) |
| `__lens_origin` score-derivation fallback retirement | ⏳ wait ~7 days, then remove |
| BloomLens UI polish backlog | ⏳ ongoing |
| Sprint E launch readiness | 🔜 next major track (decisions owed) |
| V10 Phase 6 redesign track | 🔜 multi-week, post-Sprint-E |

**V9 polish is closed.** Two items deferred (auto market climate, SSP miscategorization). Item 12 (Offer→Sourcing flow) belongs in V10. Everything else from Dave's two prod-validation rounds is shipped or scoped.

---

## 7. Next session candidates

### PATH A — Sprint E launch readiness (strategic, conversational)
Decisions Dave owes:
- Soft-launch shape
- Monitoring stack
- Support channel
- Pricing page polish vs marketing site
- Onboarding tour scope
- Demo video timing

Nothing to implement until directions picked. Best track right now since V9 is functionally done.

### PATH B — V10 sub-phase scoping
Pick one of the bigger Phase 6 items (Sourcing dashboard column-picker, Supplier Quotes 3-tab restructure, Profit Matrix full redesign, Place Order overhaul, Hub overhaul) and produce a detailed scope doc + implementation plan. 3-4 weeks of focused work for the full V10 once kicked off.

### PATH C — Item 8 SSP categorization fix
AI prompt-tuning to keep top-pick SSPs from landing in the wrong category. Inspect the SSP-generation prompt and add a categorization-validation pass. ~half day.

### PATH D — Cleanup pass
- Add the missing `status` and `profit_calculator` columns to `sourcing_products` (or remove the API references).
- Retire the `__lens_origin` fallback in `/api/analyze` and `/api/extension/markets`.
- Remove dead Refine state/handlers from `SspBuilderHubTab.tsx` (left in place during iter1 #40 for low-risk shipping).

---

## 8. Standing rules (don't break)

1. PRs target `dev`, never `main` without explicit instruction.
2. Push to feature/dev branches without asking; only `main` requires explicit OK.
3. Don't punt the merge to Dave — push + PR + merge are mine to drive after greenlight.
4. Never combine commit + merge + push in one chained command.
5. **NEW (2026-05-09): One test link per testing round.** Bundle multiple PRs onto dev (or a single feature branch); never hand Dave a list of separate PR previews.
6. **NEW (2026-05-09): Verify Supabase schema before trusting persistence.** Run `information_schema.columns` against any column the API touches; the codebase has a history of references to columns that don't exist.
7. NO ROUND NUMBERS in displayed metrics. BSR-curve drives display.
8. No "Keepa" in user-facing copy.
9. "BloomLens" is one word in user-facing surfaces.
10. No Stripe-hosted page redirects.
11. Tolerance-based numeric checks for AI / rounded values.
12. Production deploys from `main`. Dev = preview.
13. `effectiveTier` ≠ `tier` for display.
14. Adjustments and Expansions are separate concepts.
15. **BloomLens always hits production**, regardless of preview URL. Feature work that depends on extension-write paths needs prod ship OR a transitional legacy-data fallback.
16. Some `/vetting/[asin]` matrix metrics are client-side derived from `competitors`, not from a persisted column. Recalc only changes score, AI briefing, BSR/Price stability.
17. Charm-pricing — Value/Competitive/Premium tiers snap to nearest `.99` via `roundToCharm99()`.
18. Optional numeric schema fields land as `undefined` not just `null`. Use `isFiniteNumber()` for value guards.

---

## 9. Tomorrow's first message to Claude

Use the kickoff prompt at: `docs/handoffs/phase-6-v10-kickoff-prompt.md` (updated below to supersede the stale 2026-05-08 version).
