# Sprint D ship + Vercel-incident hygiene (2026-05-06 EOD)

End of session 2026-05-06. Wraps Sprint D — the full Free-Trial / Core / Pro tier system, Stripe Embedded Checkout migration, cap enforcement, and the landing-page overhaul + extension-promo CTAs that started the day. Everything pushed to `main` at `b4922a3` and Vercel is deploying.

---

## 1. What shipped today

### Production now at `main b4922a3` — 12 commits
Everything that was on `dev` is now on `main`. Vercel auto-deploys from `main`, so production is in the middle of the swap as of EOD.

| Commit | What |
|---|---|
| `181651c` | **Phase 5.4-K** — Tier 1 BloomEngine Chrome Extension promotion CTAs (page-header pill, vetting + research empty-state cards, /plans card, /profile Connected Apps section, CSV-upload banners). Detection hook returns false (Dave testing); flip back later. |
| `c1fccaa` | **Phase 5.4-L** — Landing page overhaul, sections 1-4 (hero rewrite + product mockup, trust strip, bold metrics, 5-card feature grid). |
| `79e26e2` | **Phase 5.4-L** — Landing page sections 5-10 (tabbed phase reveal, Versus comparison, case studies, pricing preview, final CTA + footer). |
| `b222236` | **Phase 5.4-L** — Iteration on Dave's feedback: hero mockup with Market Cap / Rev per Comp / AI briefing, on-brand 4-phase progression, accurate tab copy (no Helium 10), male randomuser portraits, removed false "no card required", added Skool link. |
| `ceb71f2` | **Phase 5.4-L** — `Active Sellers` → `Sellers Helped` truthfulness fix. |
| `9c0e34c` | **Phase 5.4-M (Sprint D, Phase 1)** — Tier schema + `checkCap` helpers. Migration `phase_5_4_m_tier_subscription_model` applied to prod Supabase. Backfilled 32 existing users to `tier='pro'`. New module `src/lib/subscription/`. |
| `dd15786` | **Phase 5.4-M (Sprint D, Phase 2)** — Stripe Embedded Checkout endpoint + tier-mapping helper. Webhook handler now writes new tier columns alongside legacy. Installed `@stripe/stripe-js` + `@stripe/react-stripe-js`. New `<StripeEmbeddedCheckout/>` component. |
| `eff0371` | **Phase 5.4-M (Sprint D, Phase 3)** — `/plans` rebuilt as 2-tier with monthly/yearly toggle + modal Embedded Checkout. Landing page section 9 updated to real Core/Pro. New `<CheckoutModal/>` component. |
| `6f4116e` | **Phase 5.4-M** — Idempotent Stripe test-mode product seeder (`scripts/seed-stripe-tier-products.ts`). Used today to recover after products only existed in live mode. |
| `a6f7ba1` | **Phase 5.4-M (Sprint D, Phase 4)** — Cap enforcement on `/api/analyze`, `/api/extension/analyze-market` (mode=create), `/api/offer/analyze-reviews?generateSSP=true`. New `/api/subscription/usage` endpoint. `<CapReachedModal/>` + `<UsageWarningToast/>`. Toast wired into PageShell + MainTemplate. |
| `266abfd` | **Phase 5.4-M (Sprint D, Phase 5)** — `/subscription` rebuilt with tier card + usage progress bars + trial countdown + upgrade modal + cancel flow. New `/api/stripe/cancel`. `/profile` Current Plan sidebar card. `/plans` width fix. |
| `b4922a3` | **Phase 5.4-M (Sprint D, Phase 6)** — PRO-paywall regression fix in `SubscriptionCheck`: tier is now the source of truth (was the cause of "paywall fires for already-PRO users" bug). Migration `phase_5_4_m_backfill_legacy_pro_status` applied — 13 users with `tier='pro' AND subscription_status=NULL` upgraded to ACTIVE. Deleted dead `/api/stripe/anonymous-checkout` route. |

### Vercel security incident (Apr 19, 2026) — defensive rotation underway

Confirmed via web search: Vercel was breached April 19, 2026 via Context.ai OAuth supply-chain attack. **Dave was NOT in the affected subset** (per direct email from Vercel Security on Apr 20), but Vercel still recommended preventive rotation of all customers' env vars. Started tonight, rest deferred to morning.

| Key | Status |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Rotated to new Supabase Secret API key format (`sb_secret_*`). Verified working via Stripe webhook resend (200 OK). Marked Sensitive in Vercel. |
| `STRIPE_SECRET_KEY` (Production) | ✅ Rolled in Stripe Live mode. Old key in 24h grace period. Vercel updated, Sensitive flag set. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ Added to Vercel for the first time. `pk_live_*` → Production only. `pk_test_*` → Preview only. Same name, two scopes (Vercel pattern). |
| `KEEPA_API_KEY` | ⏳ Tomorrow |
| `RESEND_API_KEY` | ⏳ Tomorrow |
| `ANTHROPIC_API_KEY` | ⏳ Tomorrow |
| `OPENAI_SECRET_KEY` | ⏳ Tomorrow — likely **delete** (we use Anthropic, OpenAI key may be unused) |
| `STRIPE_WEBHOOK_SECRET` (Production) | ✅ Verified matches BloomEngine AI PROD endpoint signing secret. No rotation needed. |
| `STRIPE_SECRET_KEY` (Pre-Production) | ⏳ Tomorrow (test mode) |

---

## 2. New tier system — locked decisions

| Decision | Value |
|---|---|
| Tiers | Free Trial (7d) → Core / Pro |
| Core pricing | $39/mo or $32/mo billed yearly ($384/yr, save $84) |
| Pro pricing | $99/mo or $79/mo billed yearly ($948/yr, save $240) |
| Yearly default | Yes (per pricing-toggle memory) |
| Caps (Core only) | 25 vettings/mo + 15 SSPs/mo. Unlimited Chrome scans / sourcing / refreshes. |
| Pro = | Unlimited everything. |
| Trial mechanic | 7-day full-access trial, card required, both tier cards offer trial, converts to whichever tier was picked at checkout |
| Cap-hit UX | Hard block at 100% with upgrade modal. Soft toast at 80%. |
| Multi-seat | Tabled to V10 — single-seat only for V9 |
| Existing 32 users | All backfilled to `tier='pro'` (mentorship clients keep unlimited) |

---

## 3. Repo state (end of day 2026-05-06)

| Repo | Branch | Tip | Status |
|---|---|---|---|
| bloomengine | `main` | `b4922a3` | **Production. Vercel deploying.** All Sprint D + landing page + extension CTAs + Refresh pill from yesterday. |
| bloomengine | `dev` | `b4922a3` | Same as main. Up to date. |
| bloom-lens-extension | `phase-5-2-bottom-drawer-pivot` | `46028a2` | v0.5.8 with bloomengine.ai detection content script. **Awaiting Web Store upload** — zip at `.output/bloom-lens-extension-0.5.8-chrome.zip`. |
| Web Store | — | v0.5.7 published | v0.5.8 still pending Dave's manual upload from yesterday. |

---

## 4. Files changed (today)

### bloomengine — 12 commits, ~30 files
- **New library**: `src/lib/subscription/{tiers,state,cap,stripeMapping,index}.ts`
- **New components**: `src/components/{checkout/{StripeEmbeddedCheckout,CheckoutModal},subscription/{CapReachedModal,UsageWarningToast},extension/ExtensionCTA}.tsx`
- **New hook**: `src/hooks/useExtensionInstalled.ts`
- **New API routes**: `src/app/api/{stripe/{embedded-checkout,cancel},subscription/usage}/route.ts`
- **Deleted**: `src/app/api/stripe/anonymous-checkout/route.ts` (dead since Phase 3)
- **Modified**: `src/app/{page,plans/page,profile/page,subscription/page}.tsx`, `src/components/{layout/{PageShell,PageTitleBlock,AppHeader},SectionStats,SubscriptionCheck,MainTemplate,Upload/{CsvUpload,CsvUploadResearch},Offer/tabs/SspBuilderHubTab,Vetting/VettingDetailContent,Results/ProductVettingResults,dashboard/Dashboard,Table}.tsx`
- **Modified API routes**: `src/app/api/{analyze,extension/analyze-market,offer/analyze-reviews,stripe/webhook,submissions/[id]}/route.ts`
- **New script**: `scripts/seed-stripe-tier-products.ts`
- **Memory updates**: `feedback_no_stripe_redirects.md` (existing), new `reference_support_email.md`, `project_pricing_yearly_toggle.md`

### bloom-lens-extension — 1 commit
- New `entrypoints/bloomengine-flag.content.ts` — runs on bloomengine.ai pages, sets `data-bloomengine-extension="installed"` + dispatches `bloomengine:extension-detected` event for the website's detection hook
- Version 0.5.7 → 0.5.8

### Supabase — 2 migrations applied to prod
- `phase_5_4_m_tier_subscription_model` — added tier/billing_interval/trial_ends_at/current_period_*/stripe_*_id columns to profiles + indexes. Backfilled all 32 users to tier='pro'.
- `phase_5_4_m_backfill_legacy_pro_status` — set subscription_status='ACTIVE' for the 13 users with tier='pro' AND subscription_status=NULL.

### Stripe — created via dashboard or CLI
- Live mode: BloomEngine Core + Pro products with 4 prices (Dave created earlier today)
- Test mode: Same products + prices (created via `seed-stripe-tier-products.ts`)
- Live mode webhook: Existing BloomEngine AI PROD endpoint already wired to `/api/stripe/webhook`

---

## 5. What's blocked / awaiting Dave (morning checklist)

### Critical path (must do before declaring Sprint D shipped)
1. **Visit `bloomengine.ai/plans` logged out** — confirm new 2-tier design + monthly/yearly toggle + modal Embedded Checkout. Should NOT redirect to a Stripe-hosted page.
2. **Test full signup with a real card** on a fresh email. Use a real card (will charge $0 during 7-day trial; refund if you want to start over). Steps:
   - Pick a tier → click Start Free Trial
   - Complete card form in modal → returns to `/register?session_id=...`
   - Sign up with email/password → land in app
   - Verify webhook fired in Vercel logs
   - Check `profiles` row in Supabase has `tier`, `billing_interval`, `trial_ends_at`, `stripe_subscription_id` populated
3. **Visit `bloomengine.ai/subscription`** — confirm tier card, trial countdown, usage progress bars (0/25 + 0/15), Cancel button.
4. **Visit `bloomengine.ai/profile`** — confirm Current Plan sidebar card with Trial badge.
5. **If everything passes, refund the test signup charge** in Stripe Dashboard.

### Vercel-incident rotations (preventive, all preventive — Dave NOT in affected subset)
6. Rotate `KEEPA_API_KEY` — Keepa portal → regenerate → update Vercel + `.env.local` → mark Sensitive
7. Rotate `RESEND_API_KEY` — Resend dashboard → API keys → revoke + create new → update Vercel → mark Sensitive
8. Rotate `ANTHROPIC_API_KEY` — console.anthropic.com → Settings → API keys → rotate → update Vercel → mark Sensitive
9. Decide on `OPENAI_SECRET_KEY` — if unused (we primarily use Anthropic), **delete** instead of rotating
10. Rotate `STRIPE_SECRET_KEY` (Pre-Production) — Stripe Test mode → roll → update Vercel
11. Confirm `Prod BloomEngine` restricted Stripe key is still needed; rotate if so

### Extension Web Store upload
12. Upload `bloom-lens-extension-0.5.8-chrome.zip` to Chrome Web Store. Reviewer note: *"v0.5.8 — Adds a content script on bloomengine.ai that signals to the website when the extension is installed, so the site can hide install prompts for existing users. No new permissions or feature changes."*

### Re-enable extension detection on website
13. Once v0.5.8 is approved + live in users' browsers, re-enable detection in `src/hooks/useExtensionInstalled.ts` by deleting the `return false;` early-return at the top. Right now every CTA shows for everyone (intentional during testing).

---

## 6. Open questions for next session

### Tier-system polish (low-priority but worth raising)
1. **Update payment method UX** — Currently no in-app way to change card on file. Workaround: cancel + resubscribe via /plans. Will need Stripe SetupIntent + Payment Element flow eventually.
2. **Switch billing interval mid-subscription** — No UI to flip Core monthly → Core yearly. Workaround: cancel + resubscribe. Adds proration math when we build it.
3. **Resume a pending cancellation** — Once user clicks Cancel, no UI to undo. Adding a `cancel_at_period_end: false` Reactivate button is small.
4. **Trial-extension flow** — If a user's trial fails to convert (card declined), what happens? Stripe sends `customer.subscription.deleted` and the existing webhook marks subscription_status=CANCELED. They lose access. Probably need a grace period + email reminder flow.

### Sprint E (launch readiness — biggest open scope)
5. **Demo video** — Dave was going to record. Once available, slot into landing page section 8 (between Versus and Case Studies).
6. **Real case-study testimonials** — Currently using drafted quotes for Barbara/Art/Will/James + randomuser.me male portraits. Replace `CASE_STUDIES` constant in `src/app/page.tsx` with real photos + quotes when collected.
7. **Soft launch shape** — Web Store is open today; needs proper rollout plan. (Per memory: full marketing site first, landing page references in progress.)
8. **Onboarding tour** — Dave to set up post-launch. First-time-user walkthrough on bloomengine.ai vs popup welcome screen vs both.

### Sprint C (sourcing — original ask, still queued)
9. **Sourcing page polish** — Mandatory-vs-nice field indicators, supplier comparison view, SP-API auto-fetch FBA fees, PO contract PDF + info-collection popup. Original ask from session start.

### Bloom Lens UI polish (per memory)
10. BloomLens-one-word rename, branded loading state, top-left logo asset, popup outer glow, My Funnel 2s click delay. Memory: `project_bloom_lens_ui_polish_backlog.md`.

---

## 7. Standing rules (don't break)

1. PRs target `dev`, never `main` without explicit instruction. (Today's main push was explicitly authorized — full Sprint D batch.)
2. After committing, pause and wait for confirmation before merging or pushing.
3. Don't punt the merge to Dave — push + PR + merge are mine to drive.
4. Never combine commit + merge + push in one chained command.
5. **NO ROUND NUMBERS in displayed metrics.** BSR-curve drives display, full stop.
6. No "Keepa" in user-facing copy.
7. "BloomLens" is one word in user-facing surfaces.
8. **No Stripe-hosted page redirects.** All checkout/billing flows must render inside BloomEngine via Stripe Embedded. (Today: enforced in Phase 2 — `/api/stripe/embedded-checkout` returns `client_secret`, modal hosts the iframe.)
9. Tolerance-based numeric checks for AI / rounded values (`Math.abs(sum - 100) < 2`).
10. Production deploys from `main`. Dev = preview.
11. Never sacrifice one BSR band's accuracy for another's (calibration vision rule).
12. Any new button in `entrypoints/content/` must use `window.open` (or message background SW), not `chrome.tabs.*`.
13. Sensitive env vars must drop the Development environment (Vercel constraint).

---

## 8. Tomorrow's first message to Claude

Use the kickoff prompt at: `docs/handoffs/phase-5.4-M-kickoff-prompt.md`
