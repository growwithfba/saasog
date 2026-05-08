Picking up after a heavy 2026-05-07 session that closed Phase 5.4-M. Sprint D (tier system + Stripe Embedded + cap enforcement) is fully shipped + validated end-to-end on production. The full Vercel-incident key rotation queue is done. All six Supabase Auth email templates are now BloomEngine-branded. Three bug fixes that came out of the critical-path testing also shipped (tier-card mislabel, profile sidebar mislabel, cancel/resume flow + profile name reflection in AppHeader).

**Read in this order:**

1. `docs/handoffs/phase-5.4-M-rotations-shipped.md` — the full handoff for what just shipped. Section 4 is the small remainder of pending tasks; section 5 is the V9 remaining roadmap; section 6 has 14 open questions grouped A/B/C.
2. `MEMORY.md` — durable rules, especially `feedback_no_stripe_redirects.md`, `project_pricing_yearly_toggle.md`, and the new `effectiveTier ≠ tier` rule (rule #14 in the handoff).
3. `docs/handoffs/phase-5.4-I-ship-and-v9-remaining.md` — older sprint map. V9 sprint order is locked: A → E → D → B → C. Sprint D is done; A is mostly done; **E is the biggest open scope** (public launch readiness) and needs Dave's strategic direction more than mine.

**Verify production is healthy first:**
```
git log -3 main           # top should be cf40b48 "chore: remove dead OpenAI service + uninstall openai package"
curl -s -o /dev/null -w "%{http_code}\n" https://www.bloomengine.ai/api/subscription/usage    # expect 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://www.bloomengine.ai/api/stripe/reactivate  # expect 401 (new endpoint)
```

---

**DON'T immediately code.** This is the most important instruction. Walk Dave through the open list FIRST — there are 14 open questions in section 6 of the handoff doc, plus a few small pending cleanups, and what to prioritize is genuinely his call.

Use the **AskUserQuestion** tool (or numbered options if AskUserQuestion isn't a fit) to elicit his priorities. Walk through these in order:

### Step 1 — Quick cleanups still pending from yesterday (~3 min total)

Ask if Dave wants to knock these out before any new work:

- **Mark 3 secrets as Sensitive in Vercel** (no rotation, just a toggle): `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` (Production / live mode), `SERPAPI_API_KEY` (also deselect Development scope).
- **Verify production webhook signing secret** with a real Stripe event (Test Tesy resume/cancel cycle).
- **Upload `bloom-lens-extension-0.5.8-chrome.zip`** to Chrome Web Store (Dave's manual step — but worth flagging now if it's gone stale).
- **Re-enable extension detection** in `src/hooks/useExtensionInstalled.ts` (delete the `return false;` early-return) — only after v0.5.8 is approved + propagated.

These are 1–2 minutes each. Recommend knocking out Sensitive-flag toggles before anything else.

### Step 2 — Pick the priority track

Ask Dave which of these tracks to push next. Give him 4–5 options via AskUserQuestion:

1. **Sprint E launch readiness** (biggest scope, needs Dave's strategic input). Sub-questions: monitoring (Sentry vs Vercel logs), support channel (email vs Skool vs in-app chat), soft-launch shape (beta cohort vs open), pricing page polish vs full marketing site, onboarding tour scope.
2. **Sprint A finish-up** (calibration r8 — band-refit existing 12 categories from Supabase corpus, ~30 min). Plus the `/vetting/[asin]` Recalc pill UX (deferred from 5.4-E without spec).
3. **Sprint D polish** (update-payment-method UX, switch billing interval mid-subscription, trial-fail-to-convert grace period). These are small post-launch UX wins; could ship pre-launch if priority.
4. **BloomLens UI polish backlog** — see `project_bloom_lens_ui_polish_backlog.md` memory. Open: BloomLens-one-word rename, branded loading state, top-left logo asset, popup outer glow, paywall verification, My Funnel 2s click delay.
5. **Sprint C sourcing** (was originally next, deferred during Sprint D) — mandatory-vs-nice field indicators, supplier comparison view, SP-API auto-fetch FBA fees, PO contract PDF + info-collection popup.
6. **Sprint B Pre-Vetting / Market Climate polish** — 9 items in `project_market_climate_v2_polish.md`, 2026-04-25 vintage. Verify still current before starting.

### Step 3 — Within whichever track Dave picks, ask the strategic sub-questions

If he picks Sprint E (most likely the biggest one), follow up with the Group B questions from section 6 of the handoff doc — monitoring stack, support channel, soft-launch shape, pricing/marketing scope, onboarding tour. Use AskUserQuestion to surface 2–3 of these at a time.

If he picks Sprint A finish-up, ask about r8 priority + Recalc pill UX spec.

If he picks BloomLens polish, the memory doc has the open items + Dave's recurring rules (no Bloom Lens design without pixel-matching the BloomEngine app first — `feedback_lens_pixel_match_first.md`).

---

**Standing rules (don't break):**
- PRs to `dev` never `main` without explicit instruction.
- After commits, pause for push confirm.
- Don't punt merges to Dave — push + PR + merge are mine to drive.
- Never combine commit + merge + push.
- No round numbers in displayed metrics.
- No "Keepa" or "Helium 10" in user-facing copy.
- "BloomLens" is one word.
- No Stripe-hosted redirects.
- Production = main, dev = preview.
- `effectiveTier` is for cap gating only; display the user's `tier`.
- Pixel-match Bloom Lens to BloomEngine app before any Lens UI change.
