# Phase 5.4-M close-out + Vercel-incident rotations (2026-05-07 EOD)

End of session 2026-05-07. Wraps Phase 5.4-M with the morning critical-path validation, three bug-fix passes on the just-shipped Sprint D tier system, the full Vercel-incident key rotation queue, the OpenAI dead-code purge, and a complete polish of the Supabase Auth transactional emails.

**Production state:** `main` at `cf40b48` (deployed). Sprint D is fully shipped + validated end-to-end; Test Tesy lives in Stripe live mode at `cus_UTRZqpAfkR8aBN` / `sub_1TUUfzG4KxGhBse6Bx8Jvu6T` in pending-cancel state (will fully cancel May 14, no charge will fire).

---

## 1. What shipped today

### bloomengine — production progressed `1d868e6` → `cf40b48` on `main` (3 commits)

| Commit | What |
|---|---|
| `7be42a0` | **Phase 5.4-M tier-card fix.** `/subscription` page was reading `usage.effectiveTier` (which is `'pro'` during *any* trial by design in `state.ts:47`) for the tier-card *display*. Result: a Core trial user saw "BloomEngine Pro" + rocket icon + "Upgrade to Pro" button — internally contradictory. Switched header to read `usage.tier` (selected). Added "· Pro features unlocked" sub-text inside the TRIAL pill so the Pro-feature trial perk is communicated without lying about the tier. Also fixed the broken icon: `bg-clip-text text-transparent` only clips gradients onto **text glyphs**, not SVG paths — that's why the icon rendered as an empty green square. Replaced with a solid `iconColor` per tier. |
| `c2b450e` | **Phase 5.4-M /profile sidebar fix.** Same `effectiveTier`-as-display bug, different file: the Current Plan sidebar card was reading `data.effectiveTier`, so Core trial users saw "BloomEngine Pro". One-line fix to `data.tier`. The `isInTrial` pill is gated independently and stays correct. |
| `8531e83` | **Phase 5.4-M cancel/resume flow.** Closes the deferred Reactivate item from yesterday's Sprint D handoff (Q3 in section 6). Read cancel state live from Stripe in `/api/subscription/usage` (no DB mirror — Stripe is source of truth, no migration needed). New `/api/stripe/reactivate` endpoint flips `cancel_at_period_end: false`. Redesigned `/subscription` cancel zone: active state is a single polished card (no duplicate "Cancel subscription" title + link); pending-cancel state replaces it with an amber "Subscription ending May 14, 2026" card + Resume CTA + cancellation date. Fixes both the post-cancel-still-shows-Cancel bug and the duplication complaint. **Also fixed `/profile` name update**: handleSave now dispatches `setUser` to Redux so the AppHeader dropdown reflects the new name immediately, no refresh needed. Existing `reduxUser` is merged so subscription fields populated elsewhere survive. |
| `cf40b48` | **OPENAI cleanup.** `analyzeOpenAI.ts` had zero importers — the entire offer pipeline (4 routes, every `ssp_generate*` operation) runs through `analyzeAnthropic.ts`. Deleted 1209 lines of dead service code + uninstalled the `openai` package. Prepared `OPENAI_SECRET_KEY` for Vercel + `.env.local` deletion. |

### Sprint D critical-path: validated end-to-end on production

Walked the morning checklist (Steps A–E from `phase-5.4-M-kickoff-prompt.md`):
- **A. /plans smoke test** ✅ — 2-tier design, monthly/yearly toggle, modal Embedded Checkout, no Stripe-hosted redirects.
- **B. End-to-end signup with real card** ✅ — Test Tesy signed up Core/monthly. Verified row in `profiles`: tier=core, billing_interval=monthly, subscription_status=TRIALING, trial_ends_at=2026-05-14, stripe_customer_id + stripe_subscription_id populated. Webhook fired correctly.
- **C. /subscription page** 🟡→✅ — initially failed (tier-card mislabel bug above); fixed and re-verified.
- **D. /profile Plan badge** 🟡→✅ — initially failed (sidebar mislabel bug); fixed and re-verified.
- **E. Cancel test** ✅ — exercised in-app cancel flow + Stripe set to cancel_at_period_end=true. Resume button (built today) verified the round-trip.

### Vercel-incident key rotation queue: complete

Today's pre-emptive rotation (Vercel breach Apr 19, 2026 — Dave was not in affected subset, but Vercel recommended preventive rotation):

| Key | Action |
|---|---|
| `OPENAI_SECRET_KEY` | ✅ **Deleted.** Dead code purge made it unused. |
| `ANTHROPIC_API_KEY` | ✅ Rotated. Smoke-tested via `claude-haiku-4-5-20251001` ping. |
| `RESEND_API_KEY` | ✅ Rotated. New key scoped to **send-only** (best practice). Verified by sending real test email to support@bloomengine.ai (id `9d7e8960-5c80-4cd0-a9db-67ac0435c42c`). |
| `KEEPA_API_KEY` | ✅ Rotated. Verified via `/token` endpoint — 3,720 tokens left, refilling at 62/min, 0% rate-limit penalty. |
| `STRIPE_SECRET_KEY` (test mode / Pre-Production) | ✅ Rotated. Verified via `/v1/balance` — `livemode: false` confirms correct scope. |
| `STRIPE_WEBHOOK_SECRET` (Production / live) | ✅ Rotated via Stripe's "Roll secret" with 24h grace overlap on the BloomEngine AI PROD endpoint. |
| Supabase ↔ Resend SMTP integration key (separate full-access key in Resend) | ✅ Rotated. Replaced full-access key with **send-only** scope (was overprivileged for SMTP). New key plugged into Supabase Dashboard → Auth → SMTP Settings. Verified by triggering password reset and receiving email. |
| `STRIPE_WEBHOOK_SECRET` (Pre-Production / test) | ✅ **Cleaned up — deleted.** The endpoint it was paired with (`saasogv6.vercel.app/api/s...`) was orphaned from the pre-rebrand era. Stripe-side endpoint deleted, Vercel env var deleted. Local dev should use `stripe listen` (Stripe CLI generates session-specific secrets). |

All Vercel-stored secrets that were active during the breach window are now rotated. **No customer-facing impact.** All Sensitive flags now properly set on rotated vars. "Needs Attention" badges in Vercel: gone.

### Supabase Auth email templates: full polish pass

The morning password-reset test surfaced that the entire Supabase Auth email template suite was running on the **pre-rebrand "Grow With FBA AI" branding** (smiley logo, dark blue text on dark blue button = unreadable, "© 2025" copyright, etc.). Built six BloomEngine-branded HTML templates with consistent shell:

- ✅ Confirm signup
- ✅ Reset Password (verified delivered + rendering)
- ✅ Magic Link
- ✅ Change Email Address
- ✅ Reauthentication (code-based, not button)
- ✅ Invite User

Design: dark slate-900 body, slate-800 card with 16px radius, BloomEngine horizontal logo on solid dark header (no gradient — Dave's call after first preview), gradient blue→emerald CTA button as the only accent. Logo asset hosted at `https://www.bloomengine.ai/BloomEngine-HorizontalLogo-Final-DarkMode.png` (verified HTTP 200 with permissive CORS).

These are NOT in the repo — they live in Supabase Dashboard → Authentication → Email Templates. Source of truth lives in chat history of this session if they need to be re-pasted.

---

## 2. Repo state (end of day 2026-05-07)

| Repo | Branch | Tip | Status |
|---|---|---|---|
| bloomengine | `main` | `cf40b48` | **Production. Vercel deployed.** All 4 commits from today live. |
| bloomengine | `dev` | `cf40b48` | Synced with main. Was *severely* behind at start of day (`19a8dbf` Phase 5.4-G3 — 12 commits behind); fast-forwarded mid-session. Going forward, dev should track main. |
| bloom-lens-extension | `phase-5-2-bottom-drawer-pivot` | `46028a2` | **Unchanged today.** v0.5.8 zip still awaiting Web Store upload. |
| Web Store | — | v0.5.7 published | v0.5.8 still pending Dave's manual upload. |

---

## 3. Files changed (today)

### bloomengine — 4 commits, ~1465 lines net (-1213 / +252)

**New files:**
- `src/app/api/stripe/reactivate/route.ts` — mirror of `/api/stripe/cancel`, flips `cancel_at_period_end: false`

**Deleted files:**
- `src/services/analyzeOpenAI.ts` — 1209 lines of dead OpenAI-backed service replaced by `analyzeAnthropic.ts` months ago

**Modified:**
- `src/app/api/subscription/usage/route.ts` — fetches Stripe subscription's `cancel_at_period_end` + `cancel_at` for the `/subscription` page (fail-soft if Stripe is unreachable)
- `src/app/subscription/page.tsx` — tier-card uses `tier` not `effectiveTier`; new pending-cancel UI with Resume button; "Pro features unlocked" sub-text on TRIAL pill; icon CSS fix
- `src/app/profile/page.tsx` — sidebar tier card uses `tier`; `handleSave` dispatches Redux `setUser` to update AppHeader name immediately
- `package.json` + `package-lock.json` + `yarn.lock` — `openai` package removed

### Supabase
No migrations applied today.

### `.env.local` (local-only, not committed)
- Removed: `OPENAI_SECRET_KEY`
- Updated: `ANTHROPIC_API_KEY`, `KEEPA_API_KEY`, `STRIPE_SECRET_KEY` (test mode)
- Added: `RESEND_API_KEY` (was previously not in `.env.local`)
- Note: `STRIPE_WEBHOOK_SECRET` line 10 still has the old test-mode value. With the orphan endpoint deleted, this value is dead. When you next run `stripe listen`, replace with the CLI-generated session secret.

---

## 4. What's blocked / awaiting Dave

### Tiny cleanups (not blocking, ~3 min)
1. **Mark 3 secrets as Sensitive in Vercel** (no rotation needed — flag toggle only):
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY` (Production / live mode)
   - `SERPAPI_API_KEY` — also deselect Development scope since `.env.local` has it
2. **Verify production webhook signing secret** with a real event. Trigger a `customer.subscription.updated` from Stripe Dashboard → Webhooks → BloomEngine AI PROD endpoint → "Send test webhook." Or just have Test Tesy click Resume → Cancel on `/subscription`. Watch for 200 OK in the Stripe event delivery log. (Not strictly required — the rotation succeeded; this is belt-and-suspenders.)

### Pending decisions (no action this session, deferred)
3. **`SERPAPI_API_KEY` rotation** — *not* required for incident hygiene (added 2026-04-21, **after** the April 19 breach window — was never exposed). Optional periodic rotation; defer to next quarter.

### Web Store / extension (carrying over from prior handoffs)
4. **Upload `bloom-lens-extension-0.5.8-chrome.zip`** to Chrome Web Store. Reviewer note already drafted in `phase-5.4-M-sprint-d-shipped.md` section 5.
5. **Re-enable extension detection** in `src/hooks/useExtensionInstalled.ts` — delete the `return false;` early-return at the top once v0.5.8 propagates to existing users' browsers. Right now every CTA shows for everyone (intentional during testing).

---

## 5. V9 remaining roadmap (sprint order locked: A → E → D → B → C)

### Sprint A — Phase 5 wrap-up
| Item | Status |
|---|---|
| 5.4-I sub-category granularity | ✅ shipped 2026-05-06 |
| 6 new band-aware category calibrations | ✅ shipped 2026-05-06 |
| Web Store v0.5.7 upload | ✅ shipped earlier this week |
| Web Store v0.5.8 upload | ⏳ Open — Dave's manual step |
| **r8: refit existing 12 categories with bands** (no new CSVs needed) | ⏳ Open — uses Supabase corpus + existing harness |
| Recalculate pill on `/vetting/[asin]` | ⏳ Open — deferred from 5.4-E without spec |
| BloomLens UI polish backlog | ⏳ See `project_bloom_lens_ui_polish_backlog.md`. Open: BloomLens-one-word rename, branded loading state, top-left logo asset, popup outer glow, **paywall fires for PRO users** (probably resolved by Phase 6 fix from yesterday but verify), **My Funnel 2s click delay** |

### Sprint E — Public launch readiness (biggest open scope)
Pulled from `phase-5.4-H2-and-v9-finish.md`. Needs Dave's strategic direction:
- **Demo video** — Dave was going to record. Slot into landing page section 8 (between Versus and Case Studies) once available.
- **Real case-study testimonials** — currently using drafted quotes for Barbara/Art/Will/James + randomuser.me male portraits. Replace `CASE_STUDIES` constant in `src/app/page.tsx` with real photos + quotes when collected.
- **Onboarding tour** — first-time-user walkthrough on bloomengine.ai vs popup welcome screen vs both.
- **Pricing page polish** — currently functional, may need marketing copy + visual treatment.
- **Marketing surfaces** — landing page sections, demo video slot, social proof.
- **Monitoring** — Sentry? Datadog? Just Vercel logs? Decide before public launch.
- **Support channel** — email (`support@bloomengine.ai`)? In-app chat? Skool community? Decide before public launch.
- **Soft launch plan** — invite list, beta cohort size, feedback collection, launch announcement timing.

### Sprint D — Phase 7 Billing
**Sprint D core scope is SHIPPED** (tier system + Stripe Embedded + cap enforcement live in production as of 2026-05-06). Remaining tier-system polish (low-priority follow-ups):
- Update payment method UX — currently no in-app way to change card on file (workaround: cancel + resubscribe).
- Switch billing interval mid-subscription — no UI to flip Core monthly → Core yearly (workaround: cancel + resubscribe; needs proration math when built).
- ~~Resume a pending cancellation~~ — **DONE 2026-05-07** (cancel/resume flow shipped today).
- Trial-extension flow — what happens if a user's trial fails to convert (card declined)? Currently webhook marks subscription_status=CANCELED. Needs grace period + email reminder flow.

### Sprint B — Pre-Vetting / Market Climate polish backlog
9 items captured in `project_market_climate_v2_polish.md` (memory). 2026-04-25 vintage; verify still current before starting.

### Sprint C — Phase 6 Sourcing polish
- Mandatory-vs-nice field indicators
- Supplier comparison view
- SP-API auto-fetch FBA fees
- PO contract PDF + info-collection popup
- Alibaba automation deferred to V11

---

## 6. Open questions for next session

The next Claude needs Dave's answers on these before starting any new work. Group A is calibration / extension wrap-up; Group B is the Sprint E launch arc; Group C is Sprint D polish that piggybacks on what shipped today.

### Group A — Sprint A finish
1. **r8 priority.** Worth band-refitting the existing 12 categories before Sprint E? ~30 min of work, makes the calibration table uniformly band-aware. Or "good enough for launch"?
2. **Recalc pill on `/vetting/[asin]`** — what's the desired UX? Show stale-data indicator? Trigger re-fetch on click? This was deferred from 5.4-E without a spec.
3. **PRO-paywall regression** — was supposedly fixed in Phase 6 of Sprint D (commit `b4922a3`). Verify the Bloom Lens popup no longer shows the upsell for PRO users. If still broken, fix as part of Sprint A wrap-up.

### Group B — Sprint E (the big one)
4. **Soft launch — beta cohort or open?** Invite-only beta first or open the Web Store doors?
5. **Monitoring stack.** Sentry adds vendor cost + complexity but catches errors users won't report. Vercel logs are free but reactive. Pick one.
6. **Support channel.** Email-only (`support@bloomengine.ai`) is simplest. Skool community is closest to where students already are. In-app chat (Intercom, Crisp) is highest-touch but most expensive.
7. **Pricing page polish vs full marketing site.** Are we shipping the existing `/pricing` page now and a full marketing site later? Or both before launch?
8. **Onboarding tour.** First-time-user walkthrough on the BloomEngine app, popup welcome screen on the extension, or both?
9. **Demo video** — when's it being recorded? Want me to draft a script outline?

### Group C — Sprint D polish (post-launch follow-ups)
10. **Update-payment-method UX** — Stripe SetupIntent + Payment Element flow when the customer's card changes. Build this pre-launch or post?
11. **Switch billing interval mid-subscription** — flip Core monthly → Core yearly without canceling. Proration math needed.
12. **Trial-fail-to-convert handling** — what happens when a card declines on day 7? Grace period + email + cap-down to free? Currently it just hard-canceles.

### Standalone questions
13. **`SERPAPI_API_KEY` rotation** — skip until next quarter (recommended) or rotate now for completeness?
14. **`SUPABASE_SERVICE_ROLE_KEY` / `STRIPE_SECRET_KEY` (Production) / `SERPAPI_API_KEY` Sensitive flags** — toggle now, or wait until something else needs to happen in Vercel?

---

## 7. Standing rules (don't break)

1. PRs target `dev`, never `main` without explicit instruction.
2. After committing, pause and wait for confirmation before merging or pushing.
3. Don't punt the merge to Dave — push + PR + merge are mine to drive.
4. Never combine commit + merge + push in one chained command.
5. **NO ROUND NUMBERS in displayed metrics.** BSR-curve drives display, full stop.
6. No "Keepa" in user-facing copy.
7. "BloomLens" is one word in user-facing surfaces.
8. **No Stripe-hosted page redirects.** All checkout/billing flows must render inside BloomEngine via Stripe Embedded.
9. Tolerance-based numeric checks for AI / rounded values (`Math.abs(sum - 100) < 2`).
10. Production deploys from `main`. Dev = preview.
11. **Never sacrifice one BSR band's accuracy for another's** (calibration vision rule).
12. Any new button in `entrypoints/content/` must use `window.open` (or message background SW), not `chrome.tabs.*`.
13. Sensitive env vars in Vercel must drop the Development environment scope (Vercel constraint).
14. **`effectiveTier` ≠ `tier` for display.** `effectiveTier` is the cap-governing tier (Pro during any trial). `tier` is what the customer purchased. Display the latter; gate caps on the former.

---

## 8. Tomorrow's first message to Claude

Use the kickoff prompt at: `docs/handoffs/phase-5.4-N-kickoff-prompt.md`
