Picking up after a heavy 2026-05-07 session that closed Phase 5.4-N. Three PRs shipped clean to main (PR #25 extension tier mislabel, PR #26 r8 band-aware calibration, PR #27 dev → main promotion). A fourth PR (#28 Recalc pill) was closed after preview testing surfaced architectural issues. The full rework is now spec'd as Phase 5.4-O — the "Market Expansions" redesign — and is the kickoff item for today.

Read in this order:

1. docs/handoffs/phase-5.4-N-shipped-and-lens-redesign.md — the full handoff. **Section 4 is the locked redesign spec for Phase 5.4-O.** It is detailed for a reason — Dave's testing surfaced 8 distinct issues with the previous attempt, and the redesign has to address all of them coherently. Read every subsection (4.0 through 4.10) before writing any code.
2. MEMORY.md — durable rules, especially the new rule #15 (Adjustments and Expansions are separate concepts), `feedback_no_stripe_redirects.md`, `project_recalc_cap_enforcement_deferred.md` (now coupled with 5.4-O scope), and the existing rule #14 (effectiveTier ≠ tier).
3. docs/handoffs/phase-5.4-N-kickoff-prompt.md — yesterday's kickoff for context on the V9 sprint order (A → E → D → B → C). Sprint A is mostly done; 5.4-O closes the last meaningful UX gap before Sprint E.

Verify production is healthy first:
git log -3 main           # top should be 3164865 "Merge pull request #27 from growwithfba/dev"
curl -s -o /dev/null -w "%{http_code}\n" https://www.bloomengine.ai/api/subscription/usage    # expect 401
curl -s -o /dev/null -w "%{http_code}\n" https://www.bloomengine.ai/api/extension/me   # expect 401

---
DON'T immediately code. This is the most important instruction.

The Phase 5.4-O redesign spec is locked but it touches a lot of surface area — endpoints, data model, UI in two places. Before any code, walk Dave through three things:

Step 1 — Confirm the spec is still current

Read section 4 of the handoff doc carefully. Then ask Dave:
- Anything he wants to change about the spec overnight? (Common: someone sleeps on a design and wants to tweak it.)
- Should we proceed with the two-PR split (PR A backend + data model, PR B UI) recommended in section 4.8, or one big PR?
- Cap enforcement on the manual recalc PATCH `action='adjust'` is bundled into 5.4-O scope per section 4.6 — is that still right, or does he want to defer that piece again?

Step 2 — Pick the cleanup wins to start with (~5 min)

A few small items should land BEFORE 5.4-O code starts:
- Fast-forward `dev` to match `main` at session start (`git checkout dev && git pull --ff-only origin main` — they diverged because PR #27 created a merge commit on main only).
- Delete the obsolete remote branch `phase-5.4-N-vetting-recalc-pill` after Dave confirms PR #28 closure is final and no salvage is needed beyond what section 2 of the handoff already documented.
- Confirm Web Store v0.5.8 reviewer status — if approved + propagated, re-enable extension detection in src/hooks/useExtensionInstalled.ts (delete the `return false;` early-return).

Step 3 — Sprint C item 1 design questions

Sprint C item 1 (Mandatory-vs-nice field indicators) was started yesterday and paused at design questions. Two open calls (use AskUserQuestion):

a. Indicator style:
- Red asterisk on required only (HTML form convention, lowest noise)
- Asterisk on required + "(optional)" suffix on optional (most explicit, matches Dave's "mandatory-vs-nice" framing)
- Pill badges on each field (highest visibility, possibly too noisy for 30+ field forms)

b. Scope:
- Just SupplierQuotesTab (~30 min, highest-traffic form)
- All sourcing tabs (60-90 min, full sweep)
- SupplierQuotes + PlaceOrderChecklist (~45 min)

Note: Sprint C item 1 should be a SECONDARY track for the day. 5.4-O is the priority. Only spin Sprint C up if 5.4-O is blocked or paused for review/testing.

---

Standing rules (don't break):
- PRs target `dev`, never `main` without explicit instruction.
- After commits, pause for push confirm.
- Don't punt merges to Dave — push + PR + merge are mine to drive.
- Never combine commit + merge + push.
- No round numbers in displayed metrics.
- No "Keepa" in user-facing copy.
- "BloomLens" is one word.
- No Stripe-hosted redirects.
- Production = main, dev = preview.
- effectiveTier is for cap gating only; display the user's tier.
- Pixel-match Bloom Lens to BloomEngine app before any Lens UI change.
- **NEW: Adjustments and Expansions are separate concepts.** Removals = submission_data.adjustment. Additions = submission_data.lensExpansions[]. Don't conflate them.

5.4-O acceptance criteria are in section 4.10 of the handoff. Use those as the test plan when the Vercel preview is up — Dave will be testing this end-to-end, and the previous attempt taught us that subtle cross-page navigation issues only surface in real preview testing.
