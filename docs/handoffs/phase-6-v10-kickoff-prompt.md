# Phase 6 V10 + Sprint E kickoff prompt

Paste the block below into the next session.

---

```
Picking up after Phase 6 V9 sourcing polish (shipped EOD 2026-05-08).
Production at main 69cda8f — six PRs squash-merged via PR #38. Phase 6
V9 is closed; Sprint C item 1 (mandatory-vs-nice indicators) finally
landed after being paused for four sessions.

Read in this order:
1. docs/handoffs/phase-6-v9-shipped.md — full session summary. Section 4
   has open follow-ups; section 7 lists candidate paths for next session.
2. MEMORY.md — durable rules. New entries since last session:
   feedback_push_freely_except_main.md (workflow rule),
   project_phase_6_v9_ship_state.md (V9 ship state + V10 backlog).

Verify production is healthy:
git log -3 main          # top should be 69cda8f "Merge pull request #38 from growwithfba/dev"
curl -s -o /dev/null -w "%{http_code}\n" https://www.bloomengine.ai/api/subscription/usage    # expect 401
curl -s -o /dev/null -w "%{http_code}\n" https://www.bloomengine.ai/api/extension/me          # expect 401
git checkout dev && git pull --ff-only origin main    # ensure dev is at 69cda8f

---

DON'T immediately code. Four path options for this session — present
them via AskUserQuestion and let Dave choose:

PATH A (recommended — quick prod validation, then pick a real track)
Open BloomLens, create a fresh market, navigate to /vetting on
production, confirm the V9 ship landed cleanly:
- Real score + PASS/RISKY/FAIL pill on the dashboard list
- Vetted-stage badge in the PROGRESS column
- Detail page renders Sourcing Hub gauge in header band
- Supplier Quotes mandatory asterisks visible
- Profit Matrix tab labeled correctly with no Christmas red
- Place Order Show Unmapped/Show Missing/Show Unconfirmed filters work
- Download Purchase Order PDF renders the new branded layout

After validating, Dave picks PATH B / C / D for the bulk of the
session.

PATH B (Sprint E launch readiness — strategic, conversational)
V9 sourcing polish is done. The major remaining V9 track is public
launch readiness. Several decisions Dave owes before code can start:
- Soft-launch shape (invite-only beta cohort vs open Web Store)
- Monitoring (Sentry vs Vercel logs)
- Support channel (email vs Skool vs in-app chat)
- Pricing page polish vs full marketing site
- Onboarding tour scope
- Demo video timing
- Real case-study testimonials

This session would be conversational — picking directions — not
heavy coding.

PATH C (V10 Phase 6 redesign — heavy code, ~3-4 weeks total)
Per the Flavor 1 plan locked at the start of V9, V10 is the bigger
redesign track that V9 deferred. Sub-phases:
- 6.A FBA fee infra (hardcoded table + quarterly maintenance workflow)
- 6.B Supplier Quotes 3-tab restructure (Supplier Info / Basic Calc /
       Advanced Calc) + Advanced cleanup with SSP+Sampling separation
- 6.C Profit Matrix full data-presentation redesign
- 6.D Place Order Agreed Order Summary + checklist front-loading
       walk-through
- 6.E Sourced Products dashboard expansion (column-picker + cross-
       funnel data integration)
- 6.F Adds (subset of B1-B8 from the original 15-item plan)

Best done after Sprint E ships, but Dave can elect to start now if
launch readiness can wait. Pick a sub-phase to scope.

PATH D (BloomLens follow-ups — small, contained)
- bloom-lens-extension has a local-only commit (d56f1a4) for markets
  picker score color coding. Push, zip into v0.5.9 once v0.5.8 clears
  Web Store review.
- Investigate whether v0.5.8 has been approved (Google review in
  progress as of 2026-05-08).

---

Standing rules (don't break):
- PRs target dev, never main without explicit instruction
- Push to feature/dev branches without asking; only main needs OK
- Don't punt merges to Dave — push + PR + merge are mine to drive
- Never combine commit + merge + push in one chained command
- No round numbers in displayed metrics
- No "Keepa" in user-facing copy
- "BloomLens" is one word
- No Stripe-hosted redirects
- Production = main, dev = preview
- effectiveTier ≠ tier for display
- Adjustments and Expansions are separate concepts
- BloomLens always hits production — feature work touching extension
  writes needs prod-ship OR legacy-fallback to E2E test
- Some /vetting matrix metrics are client-side derived, not recalc-
  driven
- Charm-pricing — Value/Competitive/Premium tiers snap to nearest .99
  via roundToCharm99()
- Optional numeric schema fields land as undefined not just null;
  use isFiniteNumber() for value guards
```

---

That's the prompt. The block between the triple-backticks is what gets pasted into the next session.
