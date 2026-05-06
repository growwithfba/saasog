# Tomorrow's kickoff prompt

Copy-paste the block below into the next Claude Code terminal session when you start tomorrow.

---

```
Picking up after the Phase 5.4-I ship. Sprint A's calibration heavy-
lifting wrapped yesterday — production now runs band-aware multipliers
across 18 categories (12 legacy + 6 fresh-calibrated from 2,304 ASINs).
The remaining V9 work is mostly Sprint E (public launch readiness)
which needs Dave's strategic input rather than more code grinding.

Read in this order:

1. /Users/davekeefe/Documents/PythonScripts/bloomengine/docs/handoffs/phase-5.4-I-ship-and-v9-remaining.md
   — yesterday's handoff. Section 6 is the V9 sprint map; section 7
   is the question list Dave owes answers on.

2. MEMORY.md — durable rules and project state. Specifically the new
   project_calibration_vision.md ($4k-$25k revenue zone, never
   sacrifice one BSR band for another, 14 priority categories).

3. docs/handoffs/phase-5.4-H2-and-v9-finish.md — the original V9
   sprint plan from 2026-05-05. Some items it lists are now done;
   yesterday's handoff has the current punch list.

Verify production is healthy:
- git log -3 main → top should be 20304ee "Phase 5.4-I r7: band-aware..."
- curl https://www.bloomengine.ai/api/extension/handoff (POST) → 401
- curl https://www.bloomengine.ai/api/extension/enrich (POST)  → 401
- bloom-lens-extension/.output/bloom-lens-extension-0.5.7-chrome.zip
  exists (Web Store upload pending Dave's manual step)

DON'T immediately start coding. Sprint A's remaining items are small
but Sprint E's scope is undefined. Ask Dave the questions below FIRST
to lock the next direction. Order:

A) Sprint A finish-up (small items, can be done in any order):
   1. r8: band-refit existing 12 categories using the in-Supabase
      corpus (no new CSVs needed). Worth doing now or skip to Sprint E?
   2. Recalc pill on /vetting/[asin] — what's the desired UX?
   3. PRO-paywall regression — modal fires for already-PRO users.
      Fix in Sprint A or roll into Sprint D billing pass?
   4. BloomLens UI polish backlog — see
      project_bloom_lens_ui_polish_backlog.md. Any specific items
      to prioritize before launch?

B) Sprint E (public launch readiness — biggest unknown):
   5. Soft launch shape — invite-only beta cohort first, or open
      Web Store install + sign-ups to anyone immediately?
   6. Monitoring — Sentry (paid, proactive) vs. Vercel logs (free,
      reactive)? Pick one before launch.
   7. Support channel — email (dave@growwithfba.com), Skool community,
      or in-app chat?
   8. Pricing page — polish the existing one, or build a full
      marketing site first?
   9. Onboarding tour — in-app walkthrough for first-time users, or
      just the popup welcome screen the extension already has?

C) Sprint D (when we get there):
   10. Pricing table — Free / Core / Pro feature matrix + monthly
       limits (searches, vettings, save-to-funnel etc). Owed since
       2026-04-27. Sprint D is blocked until we have this.

Walk through each section in order. Get a yes/no/defer on every
item before writing any code. After alignment, propose a 60-90 min
work block for the highest-priority item Dave picked.

Standing rules (don't break):
- PRs target `dev`, never `main` without explicit instruction.
- Calibration ships have gone direct to main (matching H3 + I
  precedent). For non-calibration work go through dev.
- After committing, pause and wait for confirmation before pushing.
- Don't punt the merge — push + PR + merge are mine to drive.
- Never combine commit + merge + push in one chain.
- NO ROUND NUMBERS in displayed metrics.
- No "Keepa" in user-facing copy. "BloomLens" is one word.
- No Stripe-hosted page redirects.
- Never sacrifice one BSR band's accuracy for another's.
- Any new button in extension entrypoints/content/ MUST use
  window.open (or runtime.sendMessage to background), NOT chrome.tabs.*.
- Production = main. Dev = preview. To ship code to bloomengine.ai,
  push to main.
```

---

If Dave wants to skip the Sprint A wrap-up entirely and go straight to Sprint E launch planning, run section B's questions (5–9) as a single conversation rather than picking one item at a time. Sprint E is big enough that doing it piecemeal will leave gaps — better to lock the whole launch shape first, then sequence the work.

If Dave wants to skip Sprint E and jump to Sprint D billing, get the pricing table answer (question 10) before doing anything else — Sprint D is meaningless without it.
