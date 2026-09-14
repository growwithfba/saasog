# Handoff — 2026-09-14: budget + surfaces to production, light mode to dev only

**Branch state at close**
- **Production (`main` 937b60b, verified on Vercel `saasogv6`)** — Discovery daily budget (#107) + shared surface system / page ambience / section rules / header-menu clip fix (#108) + the theme flag made env-driven + vitest lockfile + 13 legacy PNGs removed. Five smoke checks still owed by Dave on the live site (dashboard, Discovery, /vetting, a vetting detail, /sourcing; /profile must show NO Appearance card).
- **`dev` 4577d91** — main + the whole light-mode round (#110). **Not for production.** Dave, 2026-09-13: "I don't want any of that on prod."
- No feature branch is open. `feat/ux-round-2026-09-12` and `feat/light-mode-2026-09-13` are merged; delete at leisure.
- Working tree: only the two `.DS_Store` files. `.env.local` carries `NEXT_PUBLIC_THEME_TOGGLE=true` for local review (restart the dev server after changing it).

## The one rule that changed
**dev → main is no longer a plain merge.** dev carries light mode; main must not. Until Dave lifts the hold, anything bound for production is branched from `main` (or cherry-picked), PR'd to main directly on his say-so, and merged back into dev afterwards. Memory: `project_2026_09_14_shipped`.

## What shipped

### 1. To production (#108 → dev, #109 dev → main)
- `src/components/ui/surfaces.ts`: panels / fields / buttons / chips / popovers / tab strips / section rules. Dark depth goes DOWN (page slate-900 → panel `#0b1324` → field `#0a1226`), blue-tinted hairlines, no grey fills, secondary buttons are phase-tinted chips.
- `layout/PageAmbience.tsx` (login glows behind every page), `ui/SectionHeading.tsx` (one lit rule), `LightsaberUnderline` 480px / 2px everywhere, header-menu clip fix inside `HeaderFlourish`.
- `src/lib/featureFlags.ts`: `THEME_TOGGLE_ENABLED = process.env.NEXT_PUBLIC_THEME_TOGGLE === 'true'`. Off on every deploy.
- `yarn.lock` now matches the vitest devDependency (added in 94987ab, lockfile never committed). `GWF7.png` + `VettingV6.png` kept — `/analyze` still shows them.

### 2. To dev only (#110) — light mode
Every surface gains a light default; dark stays under `dark:`. Rules live in **`docs/light-mode-contract.md`** (read it before touching any light-mode class).
- **Shared**: cool off-white page (`PAGE_BG`), navy hairlines (`HAIRLINE`, `HAIRLINE_SOFT`), well tone `#f5f8fd`, hover wash `#f3f6fc`. Hue lives in icons / bars / chips / links / active states only; big numbers and metric values are ink, with a 6px hue dot where the colour means something. **Every glow is dark-only** (helpers set a CSS var; the shadow class is `dark:`-scoped — see `PROGRESS_BADGE_GLOW_CLASS`, `HEADER_NUMBER_GLOW_CLASS` in `utils/phaseStyles.ts`).
- Nav pills ink at rest in light, phase tint only on active / hover. `AppHeader` (the PageShell header) is now theme-aware and class-identical to `NavBar`.
- Title beam, section rules, header rule run one step deeper in light (600/500) so they exist on white.
- **One checkbox** everywhere: `ui/Checkbox` (visible check, `indeterminate` prop, light box). Native `<input type="checkbox">` is gone from the app.
- **Dashboard**: ink stat numbers, hairline cards, single-edge funnel bars, "22% of funnel" notes, hue-dot activity badges, Quick actions heading (no tracked eyebrow), rocket emoji dropped.
- **Tables** (`DataTable/styles.ts`): header on the well tone, navy rules, cool hover. Filter bar, tag chips, tag pickers all light.
- **Vetting list + detail**: product header (shared buttons, white stepper pills, cyan current stage), stat cards, Market Structure / Health (ink + dot), verdict card (RISKY word + bar keep hue), matrix tabs + chips (cyan), matrix heat cells (badge recipe), Competitive Signals, Price Map (light tints), Market Climate + Deep-Dive chart, tooltips, share/confirm modals.
- **Sourcing**: list (ink + dot for margin/ROI), Sandbox, Hub (gauge track light), Supplier Quotes, Profit Matrix (chart light), Place Order, freight tab — done by a scripted token sweep (`scratchpad/sweep.py`, not in repo) plus hand fixes: solid buttons keep white text, tier borders pale, KPI values ink. **Not yet reviewed on screen.**
- **Auth pages** (login / register / plans): `Logo tone="light"` pinned (Dave's call: the light wordmark on the always-dark pages), `Footer tone="dark"` pinned.
- **Terms / Privacy / Support** follow the member's theme (my call, reversible). Their Back link pointed at the deleted `/research`; now `/dashboard`.
- `src/hooks/useIsDarkTheme.ts` — one hook for chart colours chosen in JS (was duplicated in three files).

### Deliberate dark deltas in #110 (tokens used where files had literals) — glance at these in dark
Competitive Signals' two selects (now `field()`), Market Climate wrapper + header rule + Refresh button (now `PANEL` / `HAIRLINE` / `secondaryButton`). Everything else in dark should be pixel-identical.

## What's blocked / unverified
- **Sourcing tabs in light** — correct by rule, unseen. Expect white-on-white nested cards.
- **Offer pages** (`Offer/OfferPageContent.tsx`, `Offer/OfferFooterActions.tsx`, offer detail) and **research detail** (`Research/ResearchDetailContent.tsx`, 15 dark-only classes) — no light pass at all.
- Dashboard leftovers from the first critique: Recent Activity's empty half, table row height (80px thumbnails), left-aligned numbers with cents, "Add tag" on every row, "N/A" styled as a value.
- Discovery budget refusal path still never tripped live (no non-exempt account).
- Rate limit note: four parallel agents died at once on the session cap (resets 4:30pm Cancun). Don't fan out more than needed; the sweep script + hand fixes was faster anyway.

## Files changed
- **#108 (production)**: 47 files, +855/−172 — surfaces, layout/*, LightsaberUnderline, NavBar, SectionStats, StatCard, DataTable/{styles,ColumnPicker}, stage/StageWorkContainer, Discovery/*, dashboard/*, Table, Results/ProductVettingResults, Offer/*, Sourcing/*, lib/featureFlags, app/profile, yarn.lock, public/*.png deletions.
- **#110 (dev)**: 64 files, +2326/−1852 — layout (7), Sourcing (9 incl. tabs), Icons (5), Tags (4), Keepa (4), ui (3), Results (3), Product (3), Discovery (3), dashboard (2), DataTable (2), auth/Login, Vetting/VettingDetailContent, Research/ResearchDetailContent (checkbox only), Offer/OfferPageContent (checkbox only), Table, StatCard, ShareModal, NavBar, MainTemplate, Logo, LightsaberUnderline, utils/phaseStyles, hooks/useIsDarkTheme (new), app/{terms,privacy,support,register,plans}, docs/light-mode-contract.md (new).

## Next-session entry point
1. Run locally on `dev` with the toggle on. Screenshot lap in light: **Sourcing** (list, Sandbox, a product's Hub / Supplier Quotes / Profit Matrix / Place Order), then **Offer** (list + a product), then research detail. Fix per `docs/light-mode-contract.md`; surfaces go in `surfaces.ts` / `DataTable/styles.ts`, per-component only for copy colours.
2. Then the dashboard leftovers above.
3. Any production work in the meantime: branch from `main`, never merge dev → main.

## Open questions
- When does light mode get cleared for production? Dave's hold stands until he lifts it. When he does: flip the flag on via the Vercel env var (`NEXT_PUBLIC_THEME_TOGGLE=true`), not code.
- Terms / Privacy / Support following the theme — Dave was "fine either way"; I chose follow-the-theme. Confirm or revert.
- Montserrat on page titles — still holding. Learn flag date — still none. Budget numbers Core 2,500 / Pro 10,000 — still Dave's to confirm.
