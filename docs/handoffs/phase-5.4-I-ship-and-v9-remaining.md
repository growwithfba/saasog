# Phase 5.4-I ship + V9 remaining roadmap (2026-05-06 EOD)

End of session 2026-05-06. Wraps the BSR calibration arc that started yesterday with H3 r1–r4. Today shipped r5 (drop overshoot multipliers), r6 (leaf-first lookup), r7 (band-aware multipliers + 6 fresh calibrations totaling 2,304 ASINs), the My Funnel button fix, and packaged extension v0.5.7 ready for Web Store upload.

---

## 1. What shipped today

### bloomengine — production at `20304ee` on `main`

| Commit | Phase | What |
|---|---|---|
| `a88e9e4` | 5.4-H3 r5 | Drop H&K / H&H / Clothing multipliers to 1.0×. Stops the brewing-products overshoot reported in yesterday's homebrew CSV pair (Keepa returns "Home & Kitchen" as `categoryTree[0]` for Kitchen-subcategory products → blanket 3.28× multiplier overshot ~3×). |
| `768580d` | 5.4-I r6 | **Leaf-first category resolution.** `categoryMultiplier()` accepts a path now and walks Keepa's `categoryTree` leaf → root, returning the deepest calibrated entry. Brewing/cookware (path `["Home & Kitchen", "Kitchen & Dining", "Brewing"]`) correctly hits the existing K&D 0.853× instead of the no-op H&K root. New `EnrichedRow.matchedCategory` field for telemetry. |
| `20304ee` | 5.4-I r7 | **Band-aware multipliers** — `CATEGORY_MULTIPLIERS` schema now stores `{ default, bands?, n, fitDate, notes? }` per category. Lookup walks bands by BSR within the matched category, falls back to default. **6 new category calibrations** from fresh per-category H10 batches (2,304 ASINs total): Beauty & Personal Care, Health & Household, Cell Phones & Accessories, Automotive, Home & Kitchen (root), Musical Instruments. Two of those (Automotive, Musical Instruments) were previously NOT calibrated. New calibration harness `scripts/probes/calibrate-from-csv-folder.ts` ingests any folder of H10 CSVs and emits ready-to-paste band-aware fits. New `EnrichedRow.matchedBand` field for telemetry. |

`CURVE_VERSION` bumped to `r7-cat-v6-band-aware`. Auto-invalidates cached `keepa_lens_metrics` payloads on deploy.

### bloom-lens-extension — `175303a` on `phase-5-2-bottom-drawer-pivot`

| Commit | What |
|---|---|
| `e95a6fb` | **Fix My Funnel button.** v0.5.6 shipped with `chrome.tabs.create` being called from `Drawer.tsx` — but `chrome.tabs.*` is not exposed to MV3 content scripts, so the click silently no-op'd. Swapped both calls to `window.open(url, '_blank', 'noopener,noreferrer')`. Verified working in local unpacked extension (2s click-to-open delay, acceptable). Same root cause as the 2026-05-04 "Create account" link fix — the rule "any new button in `entrypoints/content/` must use `window.open` (or message background SW), not chrome.tabs.\*" is now in the polish backlog. |
| `175303a` | Bump version 0.5.6 → 0.5.7 for Web Store. |

**Production zip ready for upload:** `/Users/davekeefe/Documents/PythonScripts/bloom-lens-extension/.output/bloom-lens-extension-0.5.7-chrome.zip` (611 KB). Manifest verified — version 0.5.7, no localhost permission (prod build), all icons in place. Reviewer note for the Web Store dashboard:

> v0.5.7 — Fix: "My Funnel" button in the BloomLens drawer header now opens correctly. Previous version called a Chrome tabs API that's not available in content scripts. No permissions or feature changes.

---

## 2. New band-aware calibrations (live on prod now)

Each entry below replaces a prior 1.0× fallback. Brewing/cookware products are unaffected — they still resolve to K&D 0.853× via leaf-first.

| Category | n | Default | Bands |
|---|---|---|---|
| Beauty & Personal Care | 232 | 4.421× | 2 (0-4k @ 4.290×, 4k-15k @ 5.951×) |
| Health & Household | 204 | 6.468× | 3 (0-4k @ 6.139×, 4k-15k @ 7.396×, 15k-60k @ 6.503×) |
| Cell Phones & Accessories | 263 | 0.875× | 2 (0-4k @ 0.893×, 4k-15k @ 0.797×) |
| **Automotive** | 379 | 1.058× | **5 bands, full coverage** (0.796× / 1.032× / 2.043× / 2.200× / 1.717×) |
| **Home & Kitchen (root)** | 623 | 5.310× | **5 bands, full coverage** (2.798× / 4.810× / 8.299× / 10.404× / 5.175×) |
| Musical Instruments | 603 | 0.116× | 3 (0-4k @ 0.123×, 4k-15k @ 0.109×, 15k-60k @ 0.124×) |

**The strongest validation** for band-aware over single-multiplier was Automotive and H&K — Automotive multiplier swings 0.80×-2.20× across BSR, H&K swings 2.8×-10.4×. A single-fit would have been ~2× wrong at both ends in opposite directions.

**The calibration vision is durable** — captured in `project_calibration_vision.md` (memory). Key rules:
- $4k-$25k/mo revenue is the student sweet spot but accuracy must hold across the full BSR range.
- 100k BSR is not "long tail throwaway" — seasonal products live there.
- Never sacrifice one BSR band's accuracy to lift another's.
- 14 PL-focus categories listed; B&PC / H&H / Cell Phones / Clothing are "broader-user" categories with lower priority for new sample collection.

---

## 3. Repo state (end of day 2026-05-06)

| Repo | Branch | Tip | Status |
|---|---|---|---|
| bloomengine | `main` | `20304ee` | **Production. Vercel deployed.** Auto-cache-invalidating; first Lens read post-deploy shows new numbers. |
| bloomengine | `dev` | `c0a40ed` | Stale — main has moved past it. Worth fast-forwarding before next session. |
| bloom-lens-extension | `phase-5-2-bottom-drawer-pivot` | `175303a` | Pushed. v0.5.7 zip built locally, awaiting Dave's manual Web Store upload. |
| Web Store | — | v0.5.6 published | v0.5.7 pending upload + review. |

---

## 4. Files changed (today)

### bloomengine (4 files, +487 / -59)
- `src/lib/extension/bsrCategoryMultipliers.ts` — schema refactor + 6 new band-aware entries (+229).
- `src/lib/extension/bsrSalesCurve.ts` — `bsrToMonthlyUnitsByCategory` accepts BSR for band lookup; CURVE_VERSION bump.
- `src/app/api/extension/enrich/route.ts` — extracts category path; passes BSR through; new `matchedCategory` + `matchedBand` fields on `EnrichedRow`.
- `scripts/probes/calibrate-from-csv-folder.ts` — **new** band-aware calibration harness (188 lines).

### bloom-lens-extension (2 files)
- `entrypoints/content/Drawer.tsx` — My Funnel `chrome.tabs.create` → `window.open` swap.
- `package.json` — version 0.5.6 → 0.5.7.

---

## 5. What's blocked / awaiting Dave

1. **Web Store v0.5.7 upload.** Zip is built; only Dave can submit through the Developer Dashboard. Should clear review fast (no permission changes).
2. **V9 sprint direction.** Sprint A's calibration heavy-lifting is done — the remaining items are smaller. Sprint E (public launch readiness) is the biggest open scope and needs Dave's call on monitoring, support channel, soft launch plan, marketing surfaces. See questions in section 7.
3. **r8 — band-refit existing 12 categories** using existing in-Supabase corpus. ~30 min of work, no new CSVs needed. Worth doing before Sprint E's launch readiness so the calibration table is uniformly band-aware.

---

## 6. V9 remaining roadmap (sprint order locked: A → E → D → B → C)

### Sprint A — Phase 5 wrap-up (mostly done)
| Item | Status |
|---|---|
| 5.4-I sub-category granularity (H&K / H&H / Clothing fix) | ✅ shipped today via r6 leaf-first + r7 H&K bands |
| 6 new category calibrations (Automotive, Musical, B&PC, H&H, Cell Phones, H&K) | ✅ shipped today |
| Web Store v0.5.7 upload | ⏳ Dave's manual step |
| **r8: refit existing 12 categories with bands** (no new CSVs needed) | ⏳ Open — uses Supabase corpus via the existing `calibrate-category-multipliers.ts` harness, extended with band logic |
| Cell Phones & Accessories aliasing | ✅ Superseded — the category is calibrated now |
| Recalculate pill on `/vetting/[asin]` | ⏳ Open — deferred from 5.4-E |
| BloomLens UI polish backlog | ⏳ See `project_bloom_lens_ui_polish_backlog.md` (memory). Open items: BloomLens-one-word rename, branded loading state, top-left logo asset, popup outer glow, **paywall fires for PRO users**, **My Funnel 2s click delay** |

### Sprint E — Public launch readiness (biggest open scope)
Spec lives in `phase-5.4-H2-and-v9-finish.md` from 2026-05-05. Captures things that need Dave's strategic direction more than mine:
- Onboarding flow for first-time signups (popup → drawer → first vetting)
- Pricing page polish (currently functional, may need marketing copy + visual treatment)
- Marketing surfaces (landing page sections, demo video, social proof)
- **Monitoring** — Sentry? Datadog? Just Vercel logs? Decide before public launch.
- **Support channel** — email (dave@growwithfba.com)? In-app chat? Skool community? Decide before public launch.
- **Soft launch plan** — invite list, beta cohort size, feedback collection, launch announcement timing.

### Sprint D — Phase 7 Billing
- Tiered Stripe (Free / Core / Pro) — already partially live (PRO badge in popup; subscription gating partially wired).
- Per-feature caps off `usage_events`.
- Account usage dashboard.
- **Blocked on:** pricing table Dave still owes (specific feature/limit matrix per tier).

### Sprint B — Pre-Vetting / Market Climate polish backlog
9 items captured in `project_market_climate_v2_polish.md` (memory). 2026-04-25 vintage; verify still current before starting.

### Sprint C — Phase 6 Sourcing polish
- Mandatory-vs-nice field indicators
- Supplier comparison view
- SP-API auto-fetch FBA fees
- PO contract PDF + info-collection popup
- Alibaba automation deferred to V11

---

## 7. Open questions for next session

The next Claude needs Dave's answers on these before starting Sprint A wrap-up vs Sprint E:

### Calibration / Sprint A finish
1. **r8 priority.** Worth doing the band-refit of existing 12 categories before Sprint E? It's ~30 min and makes the calibration table uniformly band-aware. Or is "good enough for launch" the bar?
2. **Recalc pill on `/vetting/[asin]`** — what's the desired UX? Show stale-data indicator? Trigger re-fetch? This was deferred from 5.4-E without a final spec.
3. **PRO-paywall bug** — fix as part of Sprint A wrap-up, or roll into Sprint D billing pass since it's auth/subscription-gating logic?

### Sprint E (the big one)
4. **Soft launch — beta cohort or open?** Invite-only beta first or open the doors to anyone with the Web Store link?
5. **Monitoring stack.** Sentry adds vendor cost + complexity but catches errors users won't report. Vercel logs are free but reactive. Pick one.
6. **Support channel.** Email-only is simplest; Skool community is closest to where students already are; in-app chat (Intercom etc) is highest-touch but most expensive.
7. **Pricing page polish vs full marketing site.** Are we shipping a single `/pricing` page now and a marketing site later, or doing both before launch?
8. **Onboarding tour.** First-time-user walkthrough on the BloomEngine app, or just the popup welcome screen the extension already has? Both?

### Sprint D (when we get there)
9. **Pricing table.** Owed since 2026-04-27 — Free / Core / Pro feature matrix, monthly limits per tier (searches, vettings, save-to-funnel, etc).

---

## 8. Standing rules (don't break)

1. PRs target `dev`, never `main` without explicit instruction. (Today's r5/r6/r7 went straight to `main` because they were urgent calibration ships matching yesterday's H3 r1-r4 pattern — same deploy-now precedent.)
2. After committing, pause and wait for confirmation before merging or pushing.
3. Don't punt the merge to Dave — push + PR + merge are mine to drive.
4. Never combine commit + merge + push in one chained command.
5. **NO ROUND NUMBERS in displayed metrics.** BSR-curve drives display, full stop.
6. No "Keepa" in user-facing copy.
7. "BloomLens" is one word in user-facing surfaces.
8. No Stripe-hosted page redirects.
9. Tolerance-based numeric checks for AI / rounded values (`Math.abs(sum - 100) < 2`).
10. Production deploys from `main`. Dev = preview.
11. **Never sacrifice one BSR band's accuracy for another's** (calibration vision rule).
12. **Any new button in `entrypoints/content/` must use `window.open` (or message background SW), not `chrome.tabs.*`.**

---

## 9. Tomorrow's first message to Claude

Use the kickoff prompt at: `docs/handoffs/phase-5.4-I-kickoff-prompt.md`
