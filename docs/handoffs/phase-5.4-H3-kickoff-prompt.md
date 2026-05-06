# Tomorrow's kickoff prompt

Copy-paste the block below into the next Claude Code terminal session
when you start tomorrow.

---

```
Picking up after the Phase 5.4-H3 ship. Read in this order:

1. /Users/davekeefe/Documents/PythonScripts/bloomengine/docs/handoffs/phase-5.4-H3-ship-and-tomorrow.md
   — yesterday's handoff covering r1-r4 calibration, the magic-link
   handoff endpoint, header refactor, sort UX fixes, calibration
   analysis from the latest H10 vs BL CSV pair, and the punch list
   for today.

2. MEMORY.md — durable rules and project state. Note the new
   feedback_no_round_displayed_numbers.md rule from yesterday.

3. docs/handoffs/phase-5.4-H2-and-v9-finish.md — the V9 sprint
   plan + 10 clarifying questions Dave still owes answers on.
   Sprint order locked: A → E → D → B → C.

First three things to do, in order:

A) Verify production is healthy after yesterday's merge. Curl
   /api/extension/handoff and /api/extension/enrich on www.bloomengine.ai —
   both should return 401 (auth-gated, not 404). Check git log on
   main, top should be c0a40ed.

B) Diagnose the My Funnel button. Dave reported it doesn't open
   anything when clicked from the local unpacked dev extension. The
   POST /api/extension/handoff endpoint deployed but the click might
   be failing silently. Open the unpacked extension's service-worker
   DevTools at chrome://extensions, click My Funnel, watch Network +
   Console. Most likely culprits: Supabase admin generateLink
   permission, or redirectTo not whitelisted in Supabase Auth → URL
   Configuration. Don't write code until the actual failure mode is
   identified.

C) Decide H&K calibration — drop the 3.28x multiplier back to 1.0x
   OR start Phase 5.4-I (sub-category granularity). Yesterday's
   homebrew-search CSV pair showed the 3.28x is overshooting
   Kitchen-subcategory-classified products by ~3x because Keepa
   returns "Home & Kitchen" as the root and we apply the H&K
   multiplier blindly. Dave said H&K isn't a private-label focus
   category, so option A (drop to 1.0x) is the pragmatic default.
   Walk Dave through both options, get a yes on one, ship it as r5.

After A/B/C: Web Store v0.5.6 rebuild + changelog. Dist is at
bloom-lens-extension/.output/chrome-mv3/. Dave does the manual upload.
That ships header refactor + parent columns + sort UX + My Funnel
button to all users (assuming My Funnel is fixed by then).

Then resume Sprint A — 5.4-I sub-category granularity if not chosen
above, BloomLens UI polish backlog, recalc pill on /vetting/[asin],
Cell Phones & Accessories aliasing.

Don't punt the merge — after testing greenlight, push + merge are
yours to drive. Don't combine commit + merge + push in one chain;
each step separate, pause for explicit confirmation before merging.
Production = main, dev = preview.
```

---

If Dave wants you to skip the punch list and go straight to V9
sprint planning, ask him to answer the 10 questions in
`phase-5.4-H2-and-v9-finish.md` and convert the proposed roadmap
into a locked sprint plan.
