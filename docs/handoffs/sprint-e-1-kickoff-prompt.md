# Sprint E.1 — next-session kickoff prompt

Paste verbatim at the start of the next session.

---

```
Picking up Sprint E.1 wrap-up. Sentry was the focus of yesterday's session
(2026-05-09 EOD): wired into both surfaces, app on dev via PR #48, extension
v0.5.11 zip queued behind Web Store v0.5.10 approval.

Read in this order:
1. docs/handoffs/sprint-e-1-sentry-shipped.md — full session summary. Section 4
   has open follow-ups; section 7 lists candidate next paths.
2. MEMORY.md — durable rules. New entries: project_sprint_e_launch_decisions.md,
   project_sentry_plumbing.md.

Verify state:
git log -3 main          # top should still be 39bf4f6 (V9 iter2 ship)
gh pr view 48 --json state,mergeable,statusCheckRollup | jq
git checkout dev && git pull --ff-only origin dev
ls -lh ../bloom-lens-extension/.output/bloom-lens-extension-0.5.11-chrome.zip

Confirm with Dave:
- BloomLens v0.5.10 Web Store status (still pending approval = hold v0.5.11;
  approved = ship v0.5.11 zip)
- PR #48 Vercel preview status (build green = ready for him to validate / merge)

Three things in flight:
1. PR #48 (sprint-e/sentry-app → dev) — needs Dave's greenlight on the preview,
   then I merge to dev, validate dev preview, then merge to main on his OK.
2. v0.5.11 extension zip at bloom-lens-extension/.output/ — push to Web Store
   the moment v0.5.10 is approved by Google. ALLOWED_EXTENSION_ORIGINS env vars
   on bloomengine should already include extension ID cighgincghljicihnhbhiehpngfpgbkg.
3. Sprint E remaining code items (locked in project_sprint_e_launch_decisions.md):
   - Pricing page polish (yearly toggle, Helium 10 pattern, up to 20% off — already
     specced in project_pricing_yearly_toggle.md)
   - Single landing page (hero + 3-5 features + social proof + install CTA)
   - Lightweight onboarding tour (3-step extension popup + 4-5 step web app via
     driver.js or react-joyride; LEARN-button Loom videos stay separate)

DON'T auto-merge PR #48. DON'T push v0.5.11 to Web Store without confirming
v0.5.10 status. DON'T immediately code — three path options:

PATH A (recommended) — Pricing page polish. Smallest scoped, already specced,
unblocks Web Store conversion math. ~1 day.

PATH B — Landing page build. Larger surface (hero + features + social proof +
CTA). Needs design direction first; check if Dave has Figma references or wants
to start from a Vercel template.

PATH C — Onboarding tour. driver.js / react-joyride install + 7-9 tour steps
across two surfaces. Coordinates with the LEARN-button Loom videos Dave is
recording in parallel.

Standing rules: PRs target dev never main without OK; push to feature/dev freely;
main needs explicit OK; one test link per testing round; verify Supabase schema
before trusting persistence; no round numbers in displayed metrics; "BloomLens"
is one word; no Stripe-hosted redirects; production = main, dev = preview;
effectiveTier ≠ tier; Adjustments and Expansions are separate; BloomLens always
hits production; some /vetting matrix metrics are client-side derived not
recalc-driven; charm-pricing snaps to .99; optional numeric schema fields can
land as undefined — use isFiniteNumber(); Sentry beforeSend filtering required
on any new noisy error path (5k/mo free-tier quota).
```
