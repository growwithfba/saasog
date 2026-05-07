# Tomorrow's kickoff prompt — Phase 5.4-M follow-up (2026-05-07)

Paste this into the next Claude Code terminal session.

---

Picking up after Sprint D shipped to `main` last night. Production now has the full Free-Trial / Core / Pro tier system with Stripe Embedded Checkout, cap enforcement, the rebuilt landing page, and the Tier 1 extension-promo CTAs.

**Read in this order:**

1. `/Users/davekeefe/Documents/PythonScripts/bloomengine/docs/handoffs/phase-5.4-M-sprint-d-shipped.md` — the full handoff. Section 5 is the morning critical-path checklist; section 6 is the open-questions list.

2. `MEMORY.md` — durable rules and project state. Specifically `feedback_no_stripe_redirects.md` (locked rule, enforced via Embedded Checkout in Phase 2 of Sprint D), `project_pricing_yearly_toggle.md` (toggle behavior), and `feedback_pr_target_branch.md` (dev unless explicit).

3. `docs/handoffs/phase-5.4-I-ship-and-v9-remaining.md` — the V9 sprint map. Sprint D is now done; Sprint A wrap-up + Sprint E launch readiness + Sprint C sourcing are the remaining tracks.

**Verify production is healthy first:**

```
git log -3 main           # top should be b4922a3 "Phase 5.4-M (Sprint D, Phase 6)"
curl -s -o /dev/null -w "%{http_code}\n" https://www.bloomengine.ai/api/extension/handoff -X POST   # expect 401
curl -s -o /dev/null -w "%{http_code}\n" https://www.bloomengine.ai/api/extension/enrich -X POST    # expect 401
curl -s -o /dev/null -w "%{http_code}\n" https://www.bloomengine.ai/api/subscription/usage          # expect 401 (new endpoint, auth-gated)
```

Then visit `bloomengine.ai/plans` in an incognito window — should show the new 2-tier design (Core $39/$32, Pro $99/$79) with the monthly/yearly toggle and "Start 7-Day Free Trial" CTAs that open a modal (NOT redirect to Stripe).

If anything looks off, the rollback is `git revert b4922a3..` on main.

**DON'T immediately start coding. Walk Dave through the critical-path checklist first — it's the gate before declaring Sprint D shipped.**

## A) Critical path — must pass before anything else

1. **`/plans` smoke test** (1 min) — Logged out, visit `bloomengine.ai/plans`. Confirm: new 2-tier design, monthly/yearly toggle works, "Start 7-Day Free Trial" opens a modal that loads the Stripe checkout form (not a redirect).

2. **End-to-end signup test** (5 min) — Use a fresh email + real card. Walk:
   - Pick a tier → click Start Free Trial
   - Modal: enter card `4242 4242 4242 4242` won't work in live mode — use a real card. The 7-day trial means $0 charged immediately.
   - On success, returns to `/register?session_id=...`
   - Sign up with email/password → land in app
   - Spot-check Vercel logs for the webhook: should see `customer.subscription.created` arrive at `/api/stripe/webhook` and return 200.
   - Spot-check Supabase: the new `profiles` row should have `tier`, `billing_interval`, `trial_ends_at`, `current_period_*`, `stripe_customer_id`, `stripe_subscription_id` populated.

3. **`/subscription` page** (1 min) — Logged in as the new test user. Should show: tier card with Trial badge, trial countdown banner, usage progress bars (0/25 + 0/15), Cancel button.

4. **`/profile` page** (1 min) — Logged in. Sidebar should show "Current Plan" card with tier name + Trial badge linking to `/subscription`.

5. **Refund the test signup charge** in Stripe Dashboard → Customers → find the test customer → cancel + refund.

If any of 1-4 fails, debug + fix BEFORE moving to anything else. Likely failure modes:
- Modal blank → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` not picked up in production (verify Vercel + redeploy with cache off)
- Webhook returns 500 → check `STRIPE_WEBHOOK_SECRET` matches BloomEngine AI PROD endpoint signing secret
- Profile not updating → check `supabaseAdmin` is using the new `sb_secret_*` key (rotated yesterday)

## B) Vercel-incident rotations (preventive — Dave NOT in affected subset)

These are the lower-priority rotations from yesterday that got deferred. All same flow: rotate at source → update Vercel + `.env.local` → mark Sensitive (deselect Development env) → redeploy.

| # | Key | Where to rotate |
|---|---|---|
| 6 | `KEEPA_API_KEY` | Keepa portal |
| 7 | `RESEND_API_KEY` | Resend dashboard → API keys → revoke + create new |
| 8 | `ANTHROPIC_API_KEY` | console.anthropic.com → Settings → API keys |
| 9 | `OPENAI_SECRET_KEY` | **Probably DELETE** — we primarily use Anthropic. Confirm by `grep -rn "openai" src/` to see if anything still imports the OpenAI SDK. If grep returns nothing, delete the env var entirely. |
| 10 | `STRIPE_SECRET_KEY` (Pre-Production) | Stripe Test mode → API keys → roll |
| 11 | `Prod BloomEngine` restricted Stripe key | Confirm what uses it before touching |

Order doesn't really matter — knock them out in any sequence. Each rotation needs a redeploy with cache ON (since none of these are `NEXT_PUBLIC_*`).

## C) Extension v0.5.8 Web Store upload (Dave's manual step)

The packaged zip for v0.5.8 is at `/Users/davekeefe/Documents/PythonScripts/bloom-lens-extension/.output/bloom-lens-extension-0.5.8-chrome.zip`. v0.5.8 adds the bloomengine.ai detection content script that the website's `useExtensionInstalled` hook reads. Reviewer note for the dashboard:

> v0.5.8 — Adds a content script on bloomengine.ai that signals to the website when the extension is installed, so the site can hide install prompts for existing users. No new permissions or feature changes.

Once v0.5.8 is approved AND has propagated to users' browsers, **re-enable detection** by deleting the `return false;` early-return at the top of `src/hooks/useExtensionInstalled.ts`. Right now every "Get Extension" CTA shows for everyone (intentional while v0.5.7 is the live version).

## D) Sprint E launch readiness — next big track

Once Sprint D is verified shipped + the rotations are done + extension is uploaded, Sprint E becomes the focus. Open items per yesterday's discussion:

- **Demo video** — Dave to record. Once available, slot into landing page section 8 (between Versus and Case Studies). Will need a new component or a simple `<video>` embed in `src/app/page.tsx`.
- **Real case-study quotes + photos** — Replace `CASE_STUDIES` constant in `src/app/page.tsx` with the real Barbara/Art/Will/James testimonials when Dave has them gathered.
- **Marketing site** — Bigger build. Dave wants this BEFORE soft launch (per yesterday). Anchored to Helium 10 + Data Dive aesthetic. Pricing-locked references already in `phase-5.4-M-sprint-d-shipped.md`.
- **Onboarding tour** — In-app walkthrough OR popup welcome screen OR both. Dave to set up post-launch.

## E) If Dave wants to skip the test path and dive into something else

Don't. The critical path is short — 10 minutes total — and confirms a $39-99/month revenue path actually works. Push back gently if he tries to skip.

If he insists, at minimum get him to do step 1 (`/plans` smoke test, 1 minute) before moving on. The other steps can theoretically wait, but step 1 catches the biggest production-broken risk.

## Standing rules (don't break)

- PRs target `dev`, never `main` without explicit instruction. (Yesterday's main push was explicit — Sprint D batch.)
- After committing, pause and wait for confirmation before pushing.
- Don't punt merge to Dave — push + PR + merge are mine to drive.
- Never combine commit + merge + push in one chain.
- NO ROUND NUMBERS in displayed metrics — BSR-curve drives display.
- No "Keepa" in user-facing copy. "BloomLens" is one word.
- **No Stripe-hosted page redirects** (enforced via Embedded Checkout in production now).
- Never sacrifice one BSR band's accuracy for another's.
- Any new button in extension `entrypoints/content/` MUST use `window.open` (or runtime.sendMessage), not `chrome.tabs.*`.
- Production = main. Dev = preview.
- Sensitive env vars must drop the Development environment (Vercel constraint).
