# Next session kickoff prompt (updated 2026-05-09)

Paste the block below into the next session.

---

Picking up after Phase 6 V9 iter1 + iter2 (shipped EOD 2026-05-09). Production at main `39bf4f6` — 8 PRs squash-merged via PR #47. V9 polish is functionally closed; two items deferred (auto market climate, SSP miscategorization), item 12 (Offer→Sourcing flow) parked for V10.

Read in this order:
1. `docs/handoffs/phase-6-v9-iter2-shipped.md` — full session summary. Section 4 has open follow-ups; section 7 lists candidate paths for next session.
2. `MEMORY.md` — durable rules. New entries since last session: `feedback_verify_supabase_schema_before_trusting_persistence.md` (debugging rule), `feedback_one_test_link_per_session.md` (testing workflow rule).

Verify production is healthy:
```
git log -3 main          # top should be 39bf4f6 "Merge pull request #47 from growwithfba/dev"
curl -s -o /dev/null -w "%{http_code}\n" https://www.bloomengine.ai/api/subscription/usage    # expect 401
curl -s -o /dev/null -w "%{http_code}\n" https://www.bloomengine.ai/api/extension/me          # expect 401
git checkout dev && git pull --ff-only origin main    # ensure dev tracks main (or its latest squash)
```

Check on BloomLens v0.5.10 Web Store status:
- Dave was uploading v0.5.10 manually after the 2026-05-09 session — confirm it's live before assuming the picker fixes are in users' hands.
- Web Store reviews typically 1-3 days from upload.

DON'T immediately code. Four path options — present via AskUserQuestion and let me choose:

**PATH A (Recommended — Sprint E launch readiness, strategic, conversational).** V9 is functionally done; the next major track is making it ship-ready for users beyond the mentorship cohort. Decisions owed: soft-launch shape (invite-only beta vs open Web Store), monitoring stack (Sentry vs Vercel logs), support channel (email vs Skool vs in-app chat), pricing page polish vs full marketing site, onboarding tour scope, demo video timing. Nothing to implement until directions are picked.

**PATH B (V10 sub-phase scoping — heavy code, multi-week).** Pick one Phase 6 redesign target and produce a scope doc + implementation plan. Candidates:
- 6.A FBA fee infra (hardcoded table + quarterly maintenance workflow)
- 6.B Supplier Quotes 3-tab restructure (Supplier Info / Basic Calc / Advanced Calc)
- 6.C Profit Matrix full data-presentation overhaul (today's Bottom Line refinements were a tactical pass; V10 rebuilds the rest)
- 6.D Place Order Agreed Order Summary overhaul + checklist front-loading walk-through
- 6.E Sourced Products dashboard column-picker
- 6.F Hub treatment overhaul across all three tabs
- Item 12 — Offer → Sourcing transition redesign (architectural — single-page vs three-tab discoverability question)

**PATH C (Item 8 — SSP categorization fix).** AI prompt-tuning. Top-pick SSPs sometimes land in the wrong category (e.g., a quality-shift SSP filed under Bundle). Inspect the SSP-generation prompt, add a categorization-validation pass after generation. ~half day. Smallest, most contained option.

**PATH D (Cleanup pass).** Three carry-overs from the 2026-05-09 session worth tidying:
- Add the missing `status` and `profit_calculator` columns to `sourcing_products` (or remove the API references — your call). The pre-existing data-layer gap surfaced during today's `sourcing_hub` migration.
- Retire the `__lens_origin` score-derivation fallback in `/api/analyze` and `/api/extension/markets`. Safe to remove ~2026-05-15 (~7 days after the auto-score-on-create fix shipped).
- Remove the dead Refine state/handlers in `SspBuilderHubTab.tsx` (left in place during iter1 #40 for low-risk shipping).

Standing rules (don't break):
- PRs target `dev`, never `main` without explicit instruction
- Push to feature/dev branches without asking; only `main` needs OK
- Don't punt merges to me — push + PR + merge are yours to drive after greenlight
- Never combine commit + merge + push in one chained command
- **One test link per testing round** — bundle multiple PRs onto dev or a single feature branch; never hand me a list of separate PR previews
- **Verify Supabase schema before trusting persistence** — `information_schema.columns` first when chasing persistence bugs
- No round numbers in displayed metrics
- No "Keepa" in user-facing copy
- "BloomLens" is one word
- No Stripe-hosted redirects
- Production = main, dev = preview
- effectiveTier ≠ tier for display
- Adjustments and Expansions are separate concepts
- BloomLens always hits production — feature work touching extension writes needs prod-ship OR legacy-fallback to E2E test
- Some /vetting matrix metrics are client-side derived, not recalc-driven
- Charm-pricing — Value/Competitive/Premium tiers snap to nearest .99 via roundToCharm99()
- Optional numeric schema fields land as undefined not just null; use isFiniteNumber() for value guards
