# Phase 5.4-N close-out + Lens-Expansion redesign queued (2026-05-07 EOD)

End of session 2026-05-07. Three PRs shipped clean to main; a fourth (Recalc pill) was closed after preview testing surfaced architectural issues. The full rework is now spec'd as **Phase 5.4-O — the "Market Expansions" redesign** and is the kickoff item for tomorrow.

**Production state:** `main` at `3164865` (deployed). Phase 5.4-N tier-mislabel fix + r8 band-aware calibration both live. Test Tesy still in pending-cancel state (auto-cancels May 14, no charge).

---

## 1. What shipped today

### bloomengine — production progressed `cf40b48` → `3164865` on `main` (4 merge commits + 4 underlying)

| Commit | What |
|---|---|
| `bb12703` (PR #25) | **Phase 5.4-N tier mislabel fix.** Same `effectiveTier ≠ tier` bug pattern as yesterday's two web-side fixes — but in the BloomLens extension. `deriveLensTier(status, type)` was running stale Phase 5.4 logic that mapped `subscription_type` → tier (YEARLY=pro, MONTHLY=core). Sprint D split tier from billing interval — they're independent axes. Fix replaces with `deriveLensTier(profile)` reading the new `tier` column, plus `deriveEffectiveLensTier(profile)` for trial→pro elevation in feature gating. Five extension routes updated (`me`, `save-funnel`, `funnel-asins`, `markets`, `analyze-market`). Response shape unchanged; no extension version bump or Web Store re-upload needed. |
| `a26a708` (PR #26) | **Phase 5.4-N r8 band-refit.** The 12 v6 single-multiplier categories (Kitchen & Dining, Sports & Outdoors, etc.) re-fit against the same merged corpus v6 used (Supabase submissions filtered to single-variation rows + `scripts/probes/data/h10-extra-corpus.jsonl`, 2,506 deduped samples). 10 of 11 picked up at least one fitted band (n≥30); Industrial & Scientific stays default-only. **Defaults landed within ±13% of v6 across all 11 categories** — corpus is stable, math is sound. Notable band discoveries hidden by the single-mult fits: **Tools & Home Improvement** hunt-mid spikes to 2.41x while default is 1.63x; **Kitchen & Dining** spans 3.4x range across bands (1.39x at hunt-low → 0.41x at deep tail). Version stamp: `v6-2026-05-06-band-aware-r7` → `v7-2026-05-08-band-aware-r8`. |
| `8538ed8` | Merge PR #25 → dev |
| `4cbdea0` | Merge PR #26 → dev |
| `3164865` (PR #27) | **dev → main promotion.** Both fixes shipped to production. |

### Vercel cleanup (manual, your hands)

- ✅ Marked 3 secrets Sensitive in Vercel: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` (Production / live), `SERPAPI_API_KEY` (Development scope dropped). No redeploy needed — Sensitive flag is metadata-only.
- ✅ Production webhook signing secret verified.
- ✅ v0.5.8 zip uploaded to Chrome Web Store (awaiting reviewer approval).

---

## 2. What got CLOSED — PR #28 Recalc pill

PR #28 (Phase 5.4-N: BloomLens Recalc pill on `/vetting/[asin]`) shipped a banner + auto-fire redirect to `/submission/[id]?triggerRecalc=1`. Preview testing surfaced eight distinct issues — see section 4 for the full list and the redesign that resolves them. The PR is **closed**, not merged. The branch `phase-5.4-N-vetting-recalc-pill` is preserved on remote for reference but should be considered obsolete; the redesign in section 4 will land as a fresh PR.

The existing infrastructure is partially salvageable:

- ✅ The banner on `/vetting/[asin]` looks right and Dave likes the visual treatment — keep the markup, just rewire the click action.
- ✅ `/api/analyze` already exposes `lensPendingRecalc` on each submission (commit `68dce8c`). That data plumbing is fine.
- ❌ The redirect to `/submission/[id]?triggerRecalc=1` is wrong destination — that's the public-share renderer, missing the proper navigation chrome.
- ❌ The auto-fire of `handleCompetitorsUpdated` in submission/[id] is wrong because it leverages the *adjustment* (removal) data model for what is conceptually an *addition*.
- ❌ The `__lens_pending_recalc=false` clear in PATCH `action='adjust'` is fine in isolation but predicated on the wrong event semantics.

---

## 3. Repo state (end of day 2026-05-07)

| Repo | Branch | Tip | Status |
|---|---|---|---|
| bloomengine | `main` | `3164865` | **Production. Vercel deployed.** Phase 5.4-N tier fix + r8 calibration live. |
| bloomengine | `dev` | `4cbdea0` | Synced with main (PR #27 promoted dev → main; merge commit `3164865` lives on main only). Should be fast-forwarded to `3164865` at session start tomorrow. |
| bloomengine | `phase-5.4-N-vetting-recalc-pill` (local + remote) | `68dce8c` | **Obsolete — kept for reference.** PR #28 closed. Delete after Phase 5.4-O ships. |
| bloom-lens-extension | `phase-5-2-bottom-drawer-pivot` | `46028a2` | **v0.5.8 uploaded to Web Store, awaiting approval.** |

### MEMORY.md additions today

- `project_recalc_cap_enforcement_deferred.md` — both `/vetting/[asin]` Lens-triggered + `/submission/[id]` manual recalcs run uncapped today. Wire vetting cap into both during recalc rework. **Spec'd to be addressed as part of 5.4-O — see section 4.6.**

---

## 4. Phase 5.4-O — "Market Expansions" redesign (LOCKED 2026-05-07)

**This is tomorrow's primary work.** Read this section carefully before writing any code.

### 4.0 Background — why we're redesigning

Since Phase 5.4-D, BloomLens has had a "Add to existing market" flow on `/api/extension/analyze-market` that appends competitors to a vetted market and sets `submission_data.__lens_pending_recalc = true`. Until PR #28 (today) no UI surface read the flag. PR #28 shipped a banner + recalc trigger that **leveraged the existing remove-competitors adjustment system** to also handle additions.

That conflation is the root problem. Adjustments (removing weak competitors) and Expansions (finding more competitors via different search terms) are **two fundamentally different mental models**. Forcing them through the same data model + UI produced eight distinct UX problems below.

### 4.1 Dave's testing feedback (verbatim, 2026-05-07 ~7:50 PM)

Dave added 3-4 new ASINs to an existing market via BloomLens, then tested the recalc flow on the Vercel preview. His 8 observations:

1. **Banner appearance: keep it.** "I like the way the banner looks."
2. **Wrong destination on Recalculate click.** "When I hit recalculate, it actually opens it up into the share view, not into the actual view that the user should be seeing. The product header is missing."
3. **"Adjusted view — 0 competitors removed" copy is wrong.** "I don't like that the adjusted view says zero competitors removed. We should think of a new way of saying that because I don't even know if we need to say that it's adjusted at all because they are adding competitors ongoing, presumably. Especially if it's a new market that they're trying different Amazon search terms on, looking for more and more competitors."
4. **New comps come in with missing matrix columns.** Dave verified by checking the row for the newly-added competitor (Tlaleikejia, B0FJ5HKBPX). Missing values in: **Category, Variations, Fulfilled By, Seller Count, Active Sellers, Product Weight, Sold By**.
5. **"Reset to original" copy doesn't make sense in this context.** The modal says "Undo all competitor removals" + "0 currently removed" — nonsensical when the user added (didn't remove) comps.
6. **Reset doesn't actually remove the added competitors.** The button does nothing useful for the addition case.
7. **Need a "New Competitors" badge on the Vetting Dashboard list** (not just on the detail page).
8. **Whole framing wrong: addition ≠ adjustment.** "If we are adding new competitors to a market, we should be treating it in a different way that is building up the market rather than saying it has been altered and taken down. Think of a creative way to put this together that matches the experience of finding more competitors in your niche and building up a market to get a full perspective."

### 4.2 Root-cause diagnosis (per-issue → cause)

| # | Symptom | Root cause |
|---|---|---|
| 2 | Recalc opens "share view" without ProductHeader | PR #28's redirect goes to `/submission/[id]` which is the public-share renderer (a different page than `/vetting/[asin]`). The recalc handler lived there because it was authored for a different use case. |
| 3 | "Adjusted view — 0 competitors removed" | PR #28 leveraged the *removal* `adjustment` data model to also persist Lens *additions*. The UI banner under the score reads `submission_data.adjustment` and renders generic "adjusted" copy. |
| 4 | Missing matrix columns | `/api/extension/analyze-market` accepts `ScrapedRow` from BloomLens which has `bsr/price/units/rating/reviews/weightLb/sizeTier/variationCount/seller` but **not** `category` and **not** PDP-only fields like `fulfilledBy/sellerCount/activeSellers/soldBy`. Recalc currently runs Keepa for top 5 by revenue only — it doesn't backfill the new comps' missing columns. |
| 5–6 | "Reset to original" copy + reset doesn't actually undo | `originalSnapshot` is captured on the *first* PATCH `action='adjust'`. PR #28's auto-recalc was that first adjust — so the snapshot was taken **after** Lens already merged the new comps into `productData.competitors` via the analyze-market route. Reset restores to that post-merge state, not pre-Lens-merge state. The reset is doing exactly what it was built to do; it was just never built for this flow. |
| 7 | No badge on vetting list | Never built. |
| 8 | Whole framing wrong | One concept ("adjustment") forced to handle two semantically opposite operations (remove / add). Needs separation. |

### 4.3 The redesign — "Market Expansions" data model

Two distinct concepts on `submission_data`:

```typescript
submission_data: {
  productData: { competitors: [...] },        // canonical, post-merge
  marketScore, metrics, ...

  // EXISTING — for removals (manual edit-competitors flow):
  adjustment: {
    removedAsins: string[],
    adjustedScore: number,
    adjustedAt: string,
  },
  originalSnapshot: { /* pre-FIRST-adjustment state */ },

  // NEW — for additions (BloomLens-driven):
  lensExpansions: [
    {
      addedAsins: string[],                    // the ASINs added in this single expansion event
      addedAt: string,                         // ISO timestamp
      source: 'bloom-lens',                    // future-proofs against other expansion sources
      scoreBefore: number,                     // score before this expansion (after Keepa enrich + recompute)
      scoreAfter: number,                      // score after this expansion
      preExpansionSnapshot: {                  // for per-expansion undo
        productData: { competitors: [...] },   // pre-merge competitor list
        marketScore, metrics, keepaResults, ai_summary,
      },
      acknowledged: boolean,                   // false until user clicks Recalculate or otherwise dismisses
    },
    // ... one entry per expansion event over the market's lifetime
  ],
}
```

**Critical separation rules:**

- An `adjustment` is **one** persistent state — removing more comps overwrites it. There's only ever zero or one adjustment.
- A `lensExpansions` is an **append-only log** — each Lens-driven add creates a new entry with its own snapshot. Multiple expansions can stack.
- Reset flows are independent: "Reset to original" only operates on `adjustment`. "Undo this expansion" operates on a single `lensExpansions[i]`.
- Both can coexist: a user can have both an adjustment (removed weak comps) AND multiple expansions (added more comps over time). The canonical `productData.competitors` reflects all of it merged.

### 4.4 Behavior changes mapped to Dave's 8 points

| # | What changes |
|---|---|
| 1 | **Banner preserved.** Same markup as PR #28 (`AlertCircle` + amber background + "New competitors detected" + "Recalculate" CTA). Lift the inline JSX in `VettingDetailContent.tsx` from PR #28's diff. |
| 2 | **Recalculate runs INLINE on `/vetting/[asin]`.** No redirect. Click → spinner state in the banner ("Recalculating..."), client calls a new endpoint `POST /api/submissions/[id]/lens-recalc`, page rerenders with new score / metrics / banner gone. The `/submission/[id]` recalc handler is left untouched — it's a different code path for the manual remove-competitors flow. |
| 3 | **No "Adjusted view" banner for expansions.** Replace with a different element near the score: a small green "+3 comps from BloomLens · 2 hours ago" pill with a hover-link "View expansion history". Score change is framed as growth: "Score updated to 51.1% as competitors were added" — not "Adjusted from 51.8% to 51.1%". |
| 4 | **Field-gap fix during recalc.** The new endpoint runs Keepa enrichment on the **newly-added comps** (not just top 5 by revenue) to backfill: `category`, `variations`, `productWeight`. The PDP-only fields Lens genuinely can't capture from a SERP scrape — `fulfilledBy`, `sellerCount`, `activeSellers`, `soldBy` — stay as `—` BUT add a tooltip to the `—` cells explaining "Available after a fresh Helium 10 vetting on this ASIN" or similar honest copy. Maintain the cap-rule from Dave's 5.4-N spec: **count the recalc against the user's vetting cap** (since it's the same compute as a fresh vetting — Keepa enrich + scoring + AI summary regen). See section 4.6 for the cap-enforcement requirement that's now coupled with this work. |
| 5–6 | **Reset modal becomes context-aware.** If `adjustment` exists → current "Reset to original" copy shown. If `adjustment` is null but `lensExpansions` is non-empty → no Reset button at the score level. Per-expansion undo is in the expansion-history panel: each entry has an "Undo this expansion" link that removes just that batch's `addedAsins` and restores from that entry's `preExpansionSnapshot`. |
| 7 | **Vetting Dashboard badge.** On the `/vetting` list page, rows whose submission has `lensExpansions.some(e => !e.acknowledged)` get a small green pill: "+N new" (where N is the count of unacknowledged additions across all expansions). Pill clears when the user opens the detail page (mark all as `acknowledged: true`) OR when they click Recalculate (which resolves the recalc-pending state for the latest expansion). |
| 8 | **Reframe everything as growth.** New language model:<br>• Banner copy stays "New competitors detected" (active, not adjustment language).<br>• Score-change copy: "**Score updated** as competitors were added" — not "Adjusted score" or "Score changed."<br>• Pill copy: "**+3 from BloomLens**" — additive symbol.<br>• Reset modal title for adjustments: unchanged.<br>• Per-expansion undo title: "**Remove these 3 competitors?**" — surgical, not "Reset". |

### 4.5 Endpoint changes

#### NEW: `POST /api/submissions/[id]/lens-recalc`

Replaces the redirect-to-/submission/[id] approach.

```typescript
// Auth: bearer token (same pattern as other /api/submissions/* routes)
// Body: empty (server reads everything from submission_data)

// Behavior:
// 1. Load submission, RLS check, find latest unresolved expansion (one without
//    a populated scoreAfter)
// 2. Run cap check via checkCap(supabase, userId, 'vetting'). 402 if exceeded.
// 3. Fetch Keepa for ALL newly-added ASINs in the latest expansion (to backfill
//    category, variations, productWeight). Plus top 5 by revenue across the
//    full competitor set for the score recompute (existing pattern).
// 4. Recompute marketScore + metrics with the merged competitor set.
// 5. Regenerate AI summary (mirrors fresh vetting flow).
// 6. Persist:
//    - Update submission row with new score, status, metrics
//    - Update submission_data.productData.competitors with backfilled fields
//    - Update submission_data.lensExpansions[latest].scoreBefore + scoreAfter
//    - Set submission_data.lensExpansions[latest].acknowledged = true
//    - Clear submission_data.__lens_pending_recalc (legacy flag, drop after one cycle)
// 7. Record vetting usage event (for cap counting) — see section 4.6.
// 8. Return updated submission.
```

#### MODIFIED: `POST /api/extension/analyze-market` (mode=append)

When appending competitors to an already-vetted market:

- Stop setting `__lens_pending_recalc = true` (legacy — replaced by lensExpansions presence).
- BEFORE merging new comps into `productData.competitors`, snapshot the current state as `preExpansionSnapshot`.
- Append a new entry to `submission_data.lensExpansions[]` with `addedAsins`, `addedAt`, `source: 'bloom-lens'`, `preExpansionSnapshot`, `acknowledged: false`. `scoreBefore`/`scoreAfter` left null until recalc.
- Then merge the comps into `productData.competitors` (existing behavior).

#### NEW: `POST /api/submissions/[id]/undo-expansion`

```typescript
// Body: { expansionId: string }  (the addedAt timestamp acts as the ID)
// Behavior:
// 1. Load submission. Find the expansion entry by addedAt match.
// 2. Restore productData.competitors from that entry's preExpansionSnapshot.
// 3. Restore marketScore, metrics, keepaResults, ai_summary from preExpansionSnapshot.
// 4. Remove that expansion from lensExpansions[].
// 5. Persist + return updated submission.
//
// Note: this is "remove THIS batch only" semantics. Earlier expansions stay
// intact. If the user undoes the second expansion of three, expansion 1 and 3
// are preserved. The preExpansionSnapshot was captured at the moment of THIS
// expansion, so restoring it returns to the state right before this batch
// landed — which is correct.
```

#### MODIFIED: `/api/analyze` (GET)

Already exposes `lensPendingRecalc` (commit `68dce8c`). Replace with:

```typescript
lensExpansions: sub.submission_data?.lensExpansions || [],
hasUnacknowledgedExpansion: (sub.submission_data?.lensExpansions || []).some(e => !e.acknowledged),
```

Drop the legacy `lensPendingRecalc` flag from the response after one deploy cycle (so any cached client state has time to refresh).

### 4.6 Cap enforcement — REQUIRED for 5.4-O

Per `project_recalc_cap_enforcement_deferred.md` memory: the deferred cap enforcement is **part of 5.4-O scope**, not a follow-up. The new `/api/submissions/[id]/lens-recalc` endpoint MUST:

1. Call `checkCap(supabase, userId, 'vetting')` before doing the Keepa fetch.
2. Return 402 with the standard cap-modal payload (see `/api/analyze` POST for the canonical shape) when exceeded.
3. Record a `usage_events` row with `provider='extension'`, `operation='vetting'` (or whatever the canonical vetting operation tag is — verify against `cap.ts`) on success.

This is non-negotiable because shipping the inline recalc without cap creates a workaround: a Pro-blocked Core user who's hit their vetting limit could spam BloomLens "Add to existing" → recalc to consume Keepa tokens at no cost. Capping the Lens-triggered path closes that loophole.

The MANUAL recalc on `/submission/[id]` (existing remove-competitors flow) ALSO needs cap enforcement to keep the two paths uniform — but that's a separate file (`/submission/[id]/page.tsx::handleCompetitorsUpdated`) and a separate endpoint (`/api/submissions/[id]` PATCH `action='adjust'`). Add the cap check to PATCH `action='adjust'` in the same PR so it ships together.

### 4.7 UI changes

#### `/vetting/[asin]` (`VettingDetailContent.tsx`)

1. Lift the banner JSX from PR #28's diff (commit `68dce8c`) — same markup, replace the click handler.
2. New click handler: inline POST to `/api/submissions/[id]/lens-recalc`. Show banner spinner state during the call. On success: `setSubmission(updated)` to rerender with new score; banner self-hides because `lensExpansions[latest].acknowledged === true`.
3. NEW component: small "+3 comps from BloomLens · 2 hours ago" pill near the score (replaces the "Adjusted view" banner for expansion-only cases). Hover-link to expansion history.
4. NEW expansion-history panel (collapsed by default, accessed via the pill hover-link): one row per expansion entry showing `addedAt`, `addedAsins.length`, `scoreBefore → scoreAfter`, and an "Undo" button per row. Each Undo posts to `/api/submissions/[id]/undo-expansion`.
5. Existing "Adjusted view" banner stays gated on `submission.adjustment` (removals only). No change to that branch.

#### `/vetting` list page

Adds the "+N new" pill on rows where `submission.hasUnacknowledgedExpansion === true`. Cleared when the user navigates to the detail page (mark-as-read on detail mount) OR explicitly via Recalculate.

#### `/submission/[id]` (the public-share renderer)

NO changes for 5.4-O. The auto-fire `useEffect` from PR #28 that detects `?triggerRecalc=1` should be deleted as part of the cleanup since no surface navigates there with that param anymore. Same for the `useRef` guard. Strip the unused `useSearchParams` import after deletion.

#### Competitor matrix tooltips

For PDP-only columns (`Fulfilled By`, `Seller Count`, `Active Sellers`, `Sold By`), when value is `—` AND the row is from a Lens expansion (track via a `__source: 'bloom-lens'` marker on the competitor object set during analyze-market merge), show a tooltip on hover: "BloomLens captures from Amazon SERP — this field is only available after a fresh Helium 10 vetting upload."

### 4.8 Implementation plan / order of operations

Estimated total: **4–6 hours of careful work.** Recommend splitting across two PRs to make review tractable:

**PR A — Data model + backend** (~2 hours):
1. Add `lensExpansions` to `analyze-market` route (mode=append branch). Snapshot before merge.
2. Build `/api/submissions/[id]/lens-recalc` endpoint with cap enforcement.
3. Build `/api/submissions/[id]/undo-expansion` endpoint.
4. Add cap enforcement to existing PATCH `action='adjust'` (close the workaround loophole).
5. Update `/api/analyze` GET to expose `lensExpansions` + `hasUnacknowledgedExpansion`.
6. Drop the legacy `__lens_pending_recalc` flag from analyze-market (leave one deploy of dual-write if paranoid).

**PR B — UI** (~2-3 hours):
1. Rewire `VettingDetailContent.tsx` banner click to call lens-recalc inline.
2. Add the "+N from BloomLens" pill near the score.
3. Build the expansion-history panel + per-expansion undo UI.
4. Add the "+N new" badge to the `/vetting` list page.
5. Strip the auto-fire useEffect from `/submission/[id]/page.tsx` (cleanup from PR #28).
6. Add tooltips to the PDP-only matrix cells when value is `—` on Lens-sourced rows.

Both PRs target `dev`, then promote together via dev → main when validated on Vercel preview.

### 4.9 What NOT to break

- The manual remove-competitors flow on `/submission/[id]` MUST still work end-to-end after this PR. Its `handleCompetitorsUpdated` handler is a separate code path — don't refactor it unless something else in 5.4-O requires it.
- The `originalSnapshot`-based reset for adjustments must still work. Snapshot semantics ARE different from expansions — keep them separate.
- Existing submissions (zero-state — no `lensExpansions` field on submission_data) must render fine. Default to `[]` everywhere it's read.
- The Vercel preview build of any PR should be tested by Dave end-to-end before merging — this flow is too easy to get subtly wrong.

### 4.10 Acceptance criteria

A 5.4-O ship is "done" when:

- [ ] User on `/vetting/[asin]` sees the banner when fresh comps are pending. ✓ markup lifted from PR #28.
- [ ] Click Recalculate → spinner inline, no page bounce, score + metrics update.
- [ ] After recalc, banner is gone. New "+N from BloomLens · X minutes ago" pill present near score.
- [ ] Hovering the pill reveals an expansion-history panel listing each expansion event.
- [ ] Clicking "Undo" on an expansion entry restores the pre-expansion state for that batch only (other expansions preserved).
- [ ] On `/vetting` list, the row shows "+N new" badge when `hasUnacknowledgedExpansion === true`. Badge clears on detail-page open or recalc.
- [ ] New competitors from Lens have backfilled `category`, `variations`, `productWeight` post-recalc.
- [ ] PDP-only fields (`fulfilledBy`, `sellerCount`, `activeSellers`, `soldBy`) on Lens-sourced rows show `—` with tooltip explaining the limitation.
- [ ] Cap enforcement: a Core user at vetting limit gets 402 with cap-modal payload when clicking Recalculate. PATCH `action='adjust'` (manual recalc) also enforces.
- [ ] No Stripe-hosted page redirects (rule unchanged but easy to forget — cap-modal renders in-app).
- [ ] No "Keepa" or "Helium 10" in user-facing copy. The PDP-tooltip mentions Helium 10 as a vetting source — that's a known exception (the user provides H10 CSVs, they know the name) but verify the tooltip copy with Dave before shipping.

---

## 5. Sprint A status

| Item | Status |
|---|---|
| 5.4-I sub-category granularity | ✅ shipped 2026-05-06 |
| 6 new band-aware category calibrations | ✅ shipped 2026-05-06 |
| Web Store v0.5.7 upload | ✅ shipped earlier this week |
| Web Store v0.5.8 upload | ✅ uploaded 2026-05-07 (awaiting reviewer approval) |
| **r8: refit existing 12 categories with bands** | ✅ shipped 2026-05-07 (PR #26) |
| **Recalc pill on `/vetting/[asin]`** | 🔄 **deferred to 5.4-O — see section 4** |
| Re-enable extension detection | ⏳ Open — pending v0.5.8 reviewer approval + propagation |
| BloomLens UI polish backlog | ⏳ Open — see `project_bloom_lens_ui_polish_backlog.md` |
| PRO-paywall regression verify | ✅ verified during PR #25 work — fix from `b4922a3` is working; mentorship Pro users see no upsell on extension popup |

---

## 6. Sprint C status

Started item 1 (Mandatory-vs-nice field indicators) during today's session, paused at the design-question stage. **No commits, no branch state to recover.**

The exploration found:
- `placeOrderSchema.ts` already has `required: boolean` on every field — the data is canonical.
- `PlaceOrderChecklist.tsx` already separates required from optional structurally (the optional section is currently commented out / hidden).
- `SupplierQuotesTab.tsx` (2,970 LOC) has a `getRequiredFieldClass` helper but no inline label asterisks.

Open design questions queued for tomorrow:
1. Indicator style: red asterisk on required only, OR asterisk + "(optional)" on optional, OR pill badges.
2. Scope: just SupplierQuotesTab, or sweep all sourcing tabs.

---

## 7. What's blocked / awaiting Dave

1. **Re-enable extension detection** in `src/hooks/useExtensionInstalled.ts` — delete the `return false;` early-return at the top once v0.5.8 propagates to existing users' browsers (typically 1-7 days post-Web-Store-approval).
2. **5.4-O kickoff decision** — proceed with the section 4 redesign as spec'd, or iterate further before code starts? (Default: proceed.)
3. **Sprint C item 1 design call** — pick indicator style + scope before re-starting.

---

## 8. V9 remaining roadmap (sprint order: A → E → D → B → C)

### Sprint A — Phase 5 wrap-up
**Mostly done.** 5.4-O closes the last meaningful UX gap (Recalc pill / expansion handling). Web Store v0.5.8 detection re-enable is the only carry-over after that.

### Sprint E — Public launch readiness (biggest open scope)
Unchanged from yesterday's handoff. Strategic decisions still owed:
- Soft-launch shape (invite-only beta cohort vs open Web Store)
- Monitoring (Sentry vs Vercel logs)
- Support channel (email vs Skool vs in-app chat)
- Pricing page polish vs full marketing site
- Onboarding tour scope
- Demo video timing
- Real case-study testimonials

### Sprint D — Phase 7 Billing
**Core scope shipped 2026-05-06.** Polish backlog (low-priority):
- Update payment method UX (no in-app card change today)
- Switch billing interval mid-subscription (proration math)
- Trial-fail-to-convert grace period

### Sprint B — Pre-Vetting / Market Climate polish
9 items in `project_market_climate_v2_polish.md` (2026-04-25 vintage). Verify still current before starting.

### Sprint C — Phase 6 Sourcing polish
- Mandatory-vs-nice field indicators (started, paused)
- Supplier comparison view
- SP-API auto-fetch FBA fees
- PO contract PDF + info-collection popup

---

## 9. Standing rules (don't break)

1. PRs target `dev`, never `main` without explicit instruction.
2. After committing, pause and wait for confirmation before merging or pushing.
3. Don't punt the merge to Dave — push + PR + merge are mine to drive.
4. Never combine commit + merge + push in one chained command.
5. **NO ROUND NUMBERS in displayed metrics.** BSR-curve drives display, full stop.
6. No "Keepa" in user-facing copy. (Helium 10 is a known exception when the user provided the CSV — see 4.10.)
7. "BloomLens" is one word in user-facing surfaces.
8. **No Stripe-hosted page redirects.** All checkout/billing flows render inside BloomEngine via Stripe Embedded.
9. Tolerance-based numeric checks for AI / rounded values (`Math.abs(sum - 100) < 2`).
10. Production deploys from `main`. Dev = preview.
11. Never sacrifice one BSR band's accuracy for another's (calibration vision rule).
12. Any new button in `entrypoints/content/` must use `window.open` (or message background SW), not `chrome.tabs.*`.
13. Sensitive env vars in Vercel must drop the Development environment scope (Vercel constraint).
14. **`effectiveTier` ≠ `tier` for display.** `effectiveTier` is the cap-governing tier (Pro during any trial). `tier` is what the customer purchased. Display the latter; gate caps on the former.
15. **NEW (2026-05-07): Adjustments and Expansions are separate concepts.** Don't conflate them in shared data structures. Removals = `submission_data.adjustment`. Additions = `submission_data.lensExpansions[]`.

---

## 10. Tomorrow's first message to Claude

Use the kickoff prompt at: `docs/handoffs/phase-5.4-O-kickoff-prompt.md`
