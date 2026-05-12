# Sprint E.1 — Pricing polish + subscription rework shipped (2026-05-11)

**Status:** Shipped to production. `main` at `c95e718`. v0.5.11 extension uploaded to Chrome Web Store. Supabase migration applied. Sentry build-perf fix landed as same-day follow-up.

**Sprint context:** Sprint E.1 began (previous session) with Sentry wired into both surfaces — see `sprint-e-1-sentry-shipped.md`. This session picked up where that left off: pricing-page polish was the recommended next code item, the subscription page needed a downgrade flow before the launch-blocking Sentry/pricing/subscription bundle could ship, and Vercel preview builds were running 3-6× slower than baseline due to Sentry's source-map upload.

---

## 1. What shipped

### Pricing page polish (`/plans` + homepage Section 9)

**Iter 1 — depth content + conversion blocks**
- Feature comparison matrix (mobile-scrollable)
- FAQ section (collapsible, 6-7 items)
- Social proof block — 3 **placeholder** testimonials + trust stats
- Competitor anchor table (BloomEngine vs Helium 10 vs Jungle Scout) with "as of May 2026" disclaimer
- Trust badges row (Stripe-secured · no-trial-charge · cancel-anytime · switch-plans-prorated) — reused on homepage Section 9
- Removed redundant trial messaging (oversized banner + per-card "no charges for 7 days" footer)

**Iter 2 — beginner-first terminology + tier-value differentiation**
- Renames locked (pricing surface only — app-wide sweep is a tracked follow-up):
  - Product Vetting → AI Market Analysis
  - SSP / "Source-Sell-Profit" (incorrect — actually "Super Selling Points") → AI Unique Selling Points
  - Multi-point BSR sampling → 30-day demand & competition trends
  - Market Expansions → Refine analysis with additional competitors
  - "In-context Amazon SERP scanning" → deleted (too jargony)
- Matrix restructured: 17 rows → 13 rows, 4 groups (AI Analysis / Chrome Extension / Sourcing & Profit Modeling / Support & Account)
- Two **new aspirational Pro-only differentiators added** (backend gating is a follow-up; Dave OK'd "include limits, fix later"):
  - Supplier quote tracking: Core 10 active / Pro Unlimited
  - PO PDF generation: Core 5/mo / Pro Unlimited
- Five total real value differentiators (was three): vettings, USPs, supplier tracking, PO generation, priority support

### Subscription page rework (`/subscription`)

- "Cancel subscription" red CTA → "Manage subscription" CTA with Cog icon
- New `ManageSubscriptionModal` state machine: `menu` → `downgrade-confirm` | `cancel-reason` → `cancel-save` | `cancel-confirm` → `success`
- Cancellation funnel: 6 predefined reasons + free-text → save offer → final confirm
- Save policy locked (after Dave pushed back on founder-call save offer):
  - Pro user cancelling for any reason → save offer = downgrade to Core
  - Core user cancelling → no save offer; feedback + confirm only
- Label renames on this surface: Product Vettings → AI Market Analyses, SSP Generations → AI Unique Selling Points
- New API: `POST /api/stripe/change-plan` — handles tier changes via `stripe.subscriptions.update()` with `proration_behavior: 'create_prorations'`. Refuses no-op price changes.
- Cancel route extended: optional body `{ reason, free_text, attempted_save_offer, accepted_save_offer, tier }`. Feedback writes are best-effort — wrapped in try/catch so they never block cancellation.

### Sentry build-perf fix (same-day follow-up)

- Added `sourcemaps: { disable: process.env.VERCEL_ENV !== 'production' }` to `withSentryConfig` in `next.config.js`
- Preview/dev builds back to ~1m10s baseline; production still uploads for symbolication
- Tradeoff accepted: errors captured on preview builds show bundled-output coordinates instead of TS source

### Operational

- **v0.5.11 extension** uploaded to Chrome Web Store (manual, by Dave)
- **Supabase migration** `cancellation_feedback` applied to prod via Supabase MCP (project `xtteljvyljimigqvfvly`). RLS locks all writes to service-role only.

---

## 2. PRs shipped this session

| PR | Title | Base | State |
|---|---|---|---|
| [#48](https://github.com/growwithfba/saasog/pull/48) | Sprint E.1: Sentry wired into Next.js app | dev | ✅ merged (carry-over from prior session) |
| [#49](https://github.com/growwithfba/saasog/pull/49) | Sprint E: pricing page polish — depth content + conversion blocks | dev | ✅ merged (3 iter pushes) |
| [#50](https://github.com/growwithfba/saasog/pull/50) | Sprint E.1 → main: Sentry + pricing polish + subscription rework | main | ✅ merged |
| [#51](https://github.com/growwithfba/saasog/pull/51) | Sentry: skip source-map upload on preview builds | dev | ✅ merged |
| ~~#52~~ | (dev → main attempt, blocked by squash history) | main | ❌ closed |
| [#53](https://github.com/growwithfba/saasog/pull/53) | Sentry: skip preview source-map uploads (build perf) | main | ✅ merged |

`main` now at `c95e718`.

---

## 3. Files changed (Sprint E.1 → main #50 + perf #53 combined)

### New files

**Pricing components + data** (`src/components/pricing/`, `src/lib/pricing/`)
- `FeatureMatrix.tsx`, `FAQ.tsx`, `SocialProof.tsx`, `CompetitorTable.tsx`, `TrustBadges.tsx`
- `featureMatrix.ts`, `faq.ts`, `testimonials.ts` (**placeholder testimonials live here**), `competitors.ts`

**Subscription components + flows** (`src/components/subscription/`, `src/lib/subscription/`)
- `ManageSubscriptionModal.tsx` — single-component state machine for the full manage/downgrade/cancel flow
- `cancellation.ts` — `CANCELLATION_REASONS`, `pickSaveOffer(reason, tier)`, `SaveOfferSpec`

**API routes**
- `src/app/api/stripe/change-plan/route.ts` — POST endpoint for tier changes with Stripe proration

**Migration**
- `supabase/migrations/20260511000000_create_cancellation_feedback.sql`

### Modified

- `src/app/plans/page.tsx` — new TIERS data, new sections wired, trimmed trial copy
- `src/app/page.tsx` — Section 9 pricing preview synced
- `src/app/subscription/page.tsx` — `setShowCancelModal` removed, `ManageSubscriptionModal` wired, labels renamed
- `src/app/api/stripe/cancel/route.ts` — accepts optional feedback body, writes to `cancellation_feedback` via service-role client
- `next.config.js` — Sentry `sourcemaps.disable` on non-production VERCEL_ENV

---

## 4. What's blocked / open

### Sprint E open follow-ups (tracked in memory)

1. **App-wide SSP rename + Core limit enforcement** — Task #7. Pricing surface uses new terminology; rest of app (dashboard, vetting flow, extension UI, navigation, API responses) still uses SSP / "product vetting." Backend `TIER_LIMITS` still only gates `vetting` + `ssp` — the new aspirational caps (`suppliers: 10`, `poGeneration: 5/mo`) are advertised but not enforced. Memory: `project_pricing_aspirational_limits.md`. Recommended: enforce within 30 days of launch so no Core user feels misled if they upgrade after blowing past an unenforced cap.

2. **Real testimonials swap** — `src/lib/pricing/testimonials.ts` has 3 placeholder quotes visible on the public `/plans` page. Swap with real attribution once collected with explicit permission. Single constants file edit; no backend work needed.

3. **Sprint E remaining code items** (locked in `project_sprint_e_launch_decisions.md`):
   - Single landing page (hero + 3-5 features + social proof + install CTA)
   - Lightweight onboarding tour (driver.js / react-joyride; 3-step popup + 4-5 step web app)
   - LEARN-button Loom video swap (Dave records)
   - 90-120s demo video for Web Store + landing page (Dave records)

### Carry-overs not blocking ship

- Pre-existing "Dynamic server usage" warnings on `/api/offer/list`, `/api/sourcing/list`, `/api/stripe/get-session` — noisy but non-functional
- Narrow git fetch refspec in Dave's local clone (`+refs/heads/main:refs/remotes/origin/main` instead of `+refs/heads/*:refs/remotes/origin/*`) — caused the rebase-against-stale-`origin/dev` issue this session. One-line fix Dave needs to run himself: `git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*' && git fetch origin --prune`. Per safety rule, I didn't touch his git config.

---

## 5. Lessons captured to memory

| Memory | What it locks |
|---|---|
| `project_pricing_terminology.md` | Beginner-first labels on pricing surface; SSP = "Super Selling Points" (not Source-Sell-Profit) |
| `project_pricing_aspirational_limits.md` | Core caps advertised that aren't backend-enforced yet; 30-day enforcement target |
| `project_sprint_e_1_shipped.md` | This session's shipped state, what's now live on main |

`MEMORY.md` index updated with three new entries pointing to the above.

---

## 6. Sprint E status

| Item | Status | Notes |
|---|---|---|
| Soft-launch shape — open Web Store launch | ✅ decided 2026-05-09 | |
| Sentry monitoring (app + extension) | ✅ shipped to prod | App via PR #50, extension v0.5.11 in Web Store |
| Pricing page polish | ✅ shipped | This session |
| Subscription downgrade + cancellation funnel | ✅ shipped | This session |
| Email + Skool community | 🟡 Dave to spin up | His call when |
| Single landing page | 🔜 next code item | Needs design direction first |
| Lightweight onboarding tour | 🔜 after landing page | |
| LEARN-button Loom video swap | 🟡 Dave records | |
| 90-120s demo video | 🟡 Dave records | Web Store listings convert ~2x with video |

---

## 7. Next-session entry point

The pricing + subscription bundle is shipped and verified. The natural next code item, per `project_sprint_e_launch_decisions.md`, is the **single landing page** (hero + 3-5 features + social proof + install CTA). Worth re-confirming with Dave first since it needs design direction (Figma references / Vercel template / build from scratch).

Alternative paths to surface if landing isn't ready:
- **Onboarding tour** (driver.js / react-joyride) — concrete spec, could ship without design input
- **Real-testimonial swap** in `src/lib/pricing/testimonials.ts` — if Dave has collected quotes
- **App-wide SSP rename + Core limit gating** (Task #7) — closes the consistency gap and stops the aspirational-caps risk window

Pair this handoff with the kickoff prompt provided in chat.

---

## 8. Standing rules (don't break)

1. PRs target `dev`, never `main` without explicit instruction.
2. Push to feature/dev branches without asking; only `main` requires explicit OK.
3. Don't punt the merge to Dave — push + PR + merge are mine to drive after greenlight.
4. Never combine commit + merge + push in one chained command.
5. One test link per testing round. Bundle multiple PRs onto dev or a single feature branch.
6. Verify Supabase schema before trusting persistence.
7. NO ROUND NUMBERS in displayed metrics (BSR-curve drives display).
8. No "Keepa" in user-facing copy.
9. "BloomLens" is one word.
10. No Stripe-hosted page redirects — render in-app via Stripe Embedded.
11. Tolerance-based numeric checks for AI / rounded values.
12. Production deploys from `main`. Dev = preview.
13. `effectiveTier` ≠ `tier` for display.
14. Adjustments and Expansions are separate concepts.
15. **BloomLens always hits production**, regardless of preview URL.
16. Some `/vetting/[asin]` matrix metrics are client-side derived from `competitors`, not from a persisted column. Recalc only changes score, AI briefing, BSR/Price stability.
17. Charm-pricing — Value/Competitive/Premium tiers snap to nearest `.99`.
18. Optional numeric schema fields land as `undefined`. Use `isFiniteNumber()` for value guards.
19. Sentry `beforeSend` filtering required on any new noisy error path — 5k/mo free-tier quota.
20. **NEW (2026-05-11): Pricing surface uses beginner-first terms; rest of app still uses old terms until the app-wide sweep ships** — accept the inconsistency between `/plans`/`/subscription` (new labels) and `/dashboard`/`/vetting`/extension (old labels) for now.
