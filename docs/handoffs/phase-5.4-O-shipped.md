# Phase 5.4-O shipped — Market Expansions to production (2026-05-08 EOD)

**Production state:** `main` at `476d48e` (deployed). Phase 5.4-O Market Expansions redesign is live end-to-end. Three PRs merged today; multi-expansion stacking validated on the Vercel preview before promotion.

---

## 1. What shipped

### Production progressed `3164865` → `476d48e` (3 merge commits + 5 underlying)

| Commit | What |
|---|---|
| `357ad79` (PR #29) | **Phase 5.4-O PR A — backend + data model.** New `submission_data.lensExpansions[]` append-only log with per-batch `preExpansionSnapshot`. New endpoints: `POST /api/submissions/[id]/lens-recalc` (fetches Keepa for unresolved-expansion ASINs ∪ top-5, backfills category/productWeight/variations/brand on Lens-sourced rows, recomputes score + AI summary, marks unresolved as resolved + acknowledged); `POST /api/submissions/[id]/undo-expansion` (per-batch restore from `preExpansionSnapshot`). Cap enforcement on lens-recalc AND PATCH `action='adjust'` — closes the spam-append → recalc loophole. `/api/analyze` GET surfaces `lensExpansions` + `hasUnacknowledgedExpansion`. Shared `deriveSummaryMetrics` helper extracted so generate-summary and lens-recalc share the AI-briefing input contract. `cap.ts` vetting cap now counts `submissions` rows + `usage_events.operation = 'vetting_recalc'`. |
| `34f559a` (PR #30) | **Phase 5.4-O PR B — UI + cleanup.** Recalculate banner appears when `lensExpansions.some(e => e.scoreAfter == null)`. Click runs `lens-recalc` inline (no `/submission/[id]?triggerRecalc=1` redirect). `+N from BloomLens · X ago` emerald pill replaces the banner post-recalc; click toggles a history panel with per-entry `Undo` (window.confirm gated). `+N new` emerald badge on `/vetting` list rows where `hasUnacknowledgedExpansion`. PDP-only matrix tooltips on `__lens_origin` rows for fulfillment/sellerCount/activeSellers/soldBy ("Captured from Amazon search results — fills in when you vet from a Helium 10 CSV"). New `mark-expansions-read` endpoint clears the dashboard badge on detail-page mount. Drops the legacy `__lens_pending_recalc` dual-write from analyze-market. |
| `e76d080` (PR #30) | **Fix-ups from preview testing.** `/api/extension/markets` joins `research_products.display_name` so the BloomLens "Add to existing market" picker shows the renamed market label (was showing the original ASIN listing title even after the user renamed in BloomEngine). Legacy `__lens_pending_recalc` fallback so the banner works on data created before this lands: `/api/analyze` exposes `lensPendingRecalcLegacy`, banner condition reads it, lens-recalc accepts the legacy-only path (uses `__lens_new` flagged competitors as the Keepa-backfill target) and synthesizes a `lensExpansions` entry post-recalc so the pill + history panel show. Synthesized entries have `preExpansionSnapshot: null` and the Undo button is gated on snapshot presence. |
| `aced1a3` (PR #30) | **Banner copy tightening.** Old copy promised "refresh the score, market metrics, and AI summary" but Market Cap / Rev-per-Comp / Total Competitors don't change at recalc time (they're derived client-side from `competitors`, which already updated at BloomLens-append time). New copy: "refresh the score, stability signals, and AI briefing using the latest sales-rank data for the new competitors." |
| `476d48e` (PR #31) | **dev → main promotion.** Both 5.4-O PRs shipped to production together. |

### End-to-end validated on Vercel preview before promotion

- ✅ Banner appears on legacy-data markets (legacy fallback path)
- ✅ Click Recalculate → spinner inline, score updated `22.6% → 25.9%`
- ✅ AI briefing fully regenerated to reflect new top-5 stats
- ✅ BSR / Price Stability transitioned `Moderate → Stable` (Keepa-driven signals)
- ✅ Banner replaced by `+1 from BloomLens · just now` pill
- ✅ Expansion-history panel shows the entry with score delta
- ✅ Dashboard `+N new` badge clears on detail-page open
- ✅ **Multi-expansion stacking** — Dave sent two ASINs via two separate BloomLens search sessions to the same market, then ran a single Recalculate. The append-only log captured both expansion events; one recalc resolved both in a single pass with the same `scoreAfter`. Spec section 4.4 row 8 design intent confirmed working.

---

## 2. Files changed today (13 files; +1593 / -234)

### New

- `src/app/api/submissions/[id]/lens-recalc/route.ts` — 463 lines. Inline recalc endpoint.
- `src/app/api/submissions/[id]/undo-expansion/route.ts` — 163 lines. Per-batch restore.
- `src/app/api/submissions/[id]/mark-expansions-read/route.ts` — 113 lines. Dashboard badge clear.
- `src/lib/vetting/deriveSummaryMetrics.ts` — 160 lines. Shared AI-briefing metric derivation.

### Modified

| File | Why |
|---|---|
| `src/app/api/analyze/route.ts` | GET response exposes `lensExpansions`, `hasUnacknowledgedExpansion`, `lensPendingRecalcLegacy`. |
| `src/app/api/extension/analyze-market/route.ts` | mode=append snapshots + appends a `lensExpansions[]` entry on vetted markets. Field-name aliases `productWeight` + `variations` so the matrix reads them. Drops legacy `__lens_pending_recalc` dual-write at the end. |
| `src/app/api/extension/markets/route.ts` | Joins `research_products.display_name` for the picker label. |
| `src/app/api/submissions/[id]/route.ts` | PATCH `action='adjust'` adds cap-check (402 with cap-modal payload) + records `vetting_recalc` usage_event on success. |
| `src/app/api/vetting/generate-summary/route.ts` | Refactored to import the shared `deriveSummaryMetrics`. |
| `src/components/Results/ProductVettingResults.tsx` | `wrapWithLensTooltip` helper for PDP-only columns on `__lens_origin` rows. |
| `src/components/Vetting/VettingDetailContent.tsx` | Banner + pill + history panel + handlers for lens-recalc, undo-expansion, mark-as-read. CapReachedModal hookup. Imports + state additions. |
| `src/components/dashboard/Dashboard.tsx` | New `NewExpansionBadge` (emerald, mirrors AdjustedBadge style). Stacks beside AdjustedBadge in the score column. |
| `src/lib/subscription/cap.ts` | `vetting` cap counts `submissions` rows + `usage_events.operation = 'vetting_recalc'`. |

---

## 3. Repo state (end of day 2026-05-08)

| Repo | Branch | Tip | Status |
|---|---|---|---|
| bloomengine | `main` | `476d48e` | **Production. Vercel deployed.** Phase 5.4-O live. |
| bloomengine | `dev` | `476d48e` | Synced with main (PR #31 promoted dev → main). |
| bloom-lens-extension | `phase-5-2-bottom-drawer-pivot` | `46028a2` | **v0.5.8 still awaiting Web Store reviewer approval** (carried over from yesterday). |

### Branches deleted today

- `phase-5.4-N-vetting-recalc-pill` (closed PR #28; obsolete with 5.4-O shipped)
- `phase-5.4-O-backend` (PR #29 merged)
- `phase-5.4-O-ui` (PR #30 merged)

### MEMORY.md additions today

- `feedback_bloomlens_hits_production.md` — testing rule about BloomLens always hitting prod regardless of which preview is active.
- `project_phase_5_4_o_state.md` — full shipped state.

---

## 4. What's blocked / open

### Carry-overs (not blocked, just awaiting external)

1. **Web Store v0.5.8 reviewer approval** — Google review in progress. Once approved + propagated (typically 1–7 days), delete the `return false;` early-return at the top of `src/hooks/useExtensionInstalled.ts` to re-enable detection.

### Real-data E2E now possible (was blocked yesterday)

2. **Undo on fresh expansions** — `lensExpansions` now writes proper `preExpansionSnapshot` on every BloomLens-append because production has PR A code. Any new expansion the user creates from this point forward gets a real snapshot, so the Undo button appears in the history panel for those entries. Dave should validate this when he naturally hits the flow next session.

3. **Markets-popup display_name** — works on production now. When Dave next opens BloomLens "Add to existing market", market rows should show their renamed labels (e.g., "Frozen Meat Slicer" instead of "Manual Frozen Meat Slicer, Upgraded Stainless Steel Meat Cutter fo…").

### Follow-ups (low priority, separate work)

4. **BloomLens repo: score pill color coding in markets picker.** All score pills currently render emerald regardless of `submission.status`. `/api/extension/markets` already returns `status`; the extension client just doesn't read it for color classes. Should mirror BloomEngine app: PASS → emerald, RISKY → amber, FAIL → red. Pure client-side fix in `bloom-lens-extension`. Repo URL on Dave's machine; not in this repo's scope.

5. **Drop legacy `__lens_pending_recalc` fallback** — after one full deploy cycle on production (~1 week of stable operation), remove the transitional fallback code in three places:
   - `src/app/api/analyze/route.ts` — drop `lensPendingRecalcLegacy` from response
   - `src/components/Vetting/VettingDetailContent.tsx` — drop `hasLegacyPendingRecalc`, simplify `showRecalcBanner` to `unresolvedExpansions.length > 0`
   - `src/app/api/submissions/[id]/lens-recalc/route.ts` — drop the `isLegacyOnly` branch and the synthesized-entry path
   Plus the residual `__lens_pending_recalc: false` writes in `lens-recalc/route.ts:255` and `undo-expansion/route.ts:125`.

---

## 5. Lessons captured to memory

1. **BloomLens always hits production** regardless of whether Dave is testing on a preview URL. The extension is hardcoded to `bloomengine.ai`. Means feature work that depends on extension-write paths can't be E2E validated on a preview alone — either ship to prod first OR build a transitional fallback path that operates on legacy data shapes (as today's PR B fix-up did).

2. **Some matrix metrics are client-side derived, not Keepa-driven.** Market Cap, Revenue per Competitor, Total Competitors, Top 5 Concentration, Unique Brands, Strong/Decent/Weak counts, FBA Dominance, Mature Listings — all derived in `ProductVettingResults` from `activeCompetitors`. They update the moment `productData.competitors` changes (e.g., at BloomLens-append time), not at recalc time. The things that DO change at recalc are score, AI briefing, and BSR/Price stability badges — anything that depends on fresh Keepa data. Banner copy needs to be honest about this contract.

3. **Multi-expansion stacking validated.** The append-only `lensExpansions[]` log + "resolve all unresolved on a single recalc" pattern handles the realistic flow (user does multiple BloomLens searches with different terms over time, then recalcs once). Spec section 4.4 design intent confirmed.

---

## 6. Sprint A status (V9 roadmap)

| Item | Status |
|---|---|
| 5.4-I sub-category granularity | ✅ shipped 2026-05-06 |
| 6 new band-aware category calibrations | ✅ shipped 2026-05-06 |
| Web Store v0.5.7 | ✅ shipped earlier this week |
| Web Store v0.5.8 | 🟡 uploaded 2026-05-07, awaiting Google review |
| r8: refit existing 12 categories with bands | ✅ shipped 2026-05-07 |
| Recalc pill on /vetting/[asin] | ✅ shipped 2026-05-08 (this phase, full redesign) |
| Re-enable extension detection | ⏳ pending v0.5.8 propagation |
| BloomLens UI polish backlog | ⏳ ongoing |
| BloomLens markets-picker score colors | ⏳ separate repo follow-up |

**Sprint A is effectively closed.** Two carry-overs are external (Google review) or repo-external (BloomLens client). Next sprint per V9 roadmap is Sprint E (public launch readiness).

---

## 7. Sprint E preview (next session candidates)

Per `project_v9_roadmap.md`, Sprint E open scope:

- Soft-launch shape (invite-only beta cohort vs open Web Store)
- Monitoring (Sentry vs Vercel logs)
- Support channel (email vs Skool vs in-app chat)
- Pricing page polish vs full marketing site
- Onboarding tour scope
- Demo video timing
- Real case-study testimonials

These are strategy decisions Dave owes; nothing to implement until directions are picked.

Alternative next-session paths if Sprint E feels too open-ended:

- **BloomLens follow-up #4** — score pill color coding in the markets picker. Quick win, ~30 min in the extension repo.
- **Sprint C item 1** — Mandatory-vs-nice field indicators (started yesterday, paused at design questions). Two open calls: indicator style (asterisk only / asterisk + "(optional)" / pill badges) and scope (just SupplierQuotesTab / all sourcing tabs / SupplierQuotes + PlaceOrderChecklist).
- **Sprint B** — Pre-Vetting / Market Climate v2 polish backlog (9 items in `project_market_climate_v2_polish.md`, vintage 2026-04-25; verify still current).

---

## 8. Standing rules (don't break)

1. PRs target `dev`, never `main` without explicit instruction.
2. After committing, pause and wait for confirmation before merging or pushing.
3. Don't punt the merge to Dave — push + PR + merge are mine to drive after testing greenlight.
4. Never combine commit + merge + push in one chained command.
5. **NO ROUND NUMBERS in displayed metrics.** BSR-curve drives display.
6. No "Keepa" in user-facing copy. Helium 10 is the documented exception (PDP-tooltip per 5.4-O acceptance criteria).
7. "BloomLens" is one word in user-facing surfaces.
8. **No Stripe-hosted page redirects.** All billing flows render in-app via Stripe Embedded.
9. Tolerance-based numeric checks for AI / rounded values (`Math.abs(sum - 100) < 2`).
10. Production deploys from `main`. Dev = preview.
11. Never sacrifice one BSR band's accuracy for another's.
12. Any new button in `entrypoints/content/` must use `window.open` (or message background SW), not `chrome.tabs.*`.
13. Sensitive env vars in Vercel must drop the Development environment scope.
14. **`effectiveTier` ≠ `tier` for display.** `effectiveTier` gates caps; `tier` is what the customer purchased — display the latter.
15. **Adjustments and Expansions are separate concepts.** Removals = `submission_data.adjustment`. Additions = `submission_data.lensExpansions[]`.
16. **NEW (2026-05-08):** BloomLens always hits production, regardless of which preview URL is active. Feature work that depends on extension-write paths needs either a prod ship or a transitional legacy-data fallback to be E2E testable.
17. **NEW (2026-05-08):** Some `/vetting/[asin]` matrix metrics are client-side derived from `competitors`, not from a persisted column. Market Cap / Rev-per-Comp / Total Competitors / Market Structure stats update at append-time, NOT at recalc-time. Recalc changes score, AI briefing, BSR/Price stability — that's it.
