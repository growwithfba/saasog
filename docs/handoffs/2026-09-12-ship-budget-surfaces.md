# Handoff — 2026-09-12: dev → main ship, Discovery daily budget, shared surface system (WIP), light mode started

**Branch state at close**
- **Production (`main` `b683d59`)** — the whole 09-09/10/11 body of work is live: Discovery Black Box, full-window layout, shared DataTable chrome, Learn pause, brand header, plus the icon-asset fix. Five smoke checks passed signed in as the Bloom Training account.
- **`dev` `c4bd54e`** — main + PR #107, the Discovery daily budget. **Not on main.**
- **`feat/ux-round-2026-09-12` `d32e22a`** (pushed, no PR) — the shared surface system + light-mode start. Dave's call: keep iterating locally on this one branch, then one PR to dev and one dev → main. Local dev server on :3000 was already running and picks the branch up.

## What shipped

### 1. dev → main (PR #104, merge commit `c8806aa`; PR #106, `b683d59`)
Shipped the whole branch rather than gating Discovery: the nav IA, the table chrome and the shared `keepa_lens_metrics` row made it inseparable, and the `fetch_depth` migration was already applied in prod. PR #106 fixed the plant-mark PNG `Logo.tsx` has pointed at since #102 — it was only ever in the working tree, never committed, so every deploy 404'd it.

### 2. Discovery daily budget (PR #107 → dev)
Token-counted, never shown as "tokens". `src/lib/discovery/budget.ts` (constants + pure maths, tested), `budget.server.ts` (24h sum of `usage_events.tokens_in`, insert helper, 429 response; tested with a fake client).

| Tier | Budget / rolling 24h |
|---|---|
| Core | 2,500 |
| Pro / trial | 10,000 |
| support@ + Dave | exempt |

- **Measured cost of one wide search (dev):** 20 (search lists 1,000 ASINs) + 500 (client hydrates all 250) = **~520 tokens**. A narrow search is ~30. Core ≈ 4–5 wide searches a day.
- Search refuses (429 + "You've used today's Discovery budget. It resets over the next 24 hours."). Hydrate never refuses: cached rows free, uncached best-first until budget runs out, amber "N of M shown" notice. Variations same. Only `status='ok'` events count; usage-read error fails open.
- Refusal path is unit-tested only — both available accounts are exempt.

### 3. Shared surface system (`feat/ux-round-2026-09-12`, WIP)
`src/components/ui/surfaces.ts` is the one place for panels, fields, buttons, chips, popovers, tab strips and section rules — the DataTable/styles.ts idea for everything that isn't a table.

**Dave's locked calls, in order they were made:**
1. First pass used lighter slate for depth → "too much grey". **Depth goes DOWN in dark mode**: page slate-900 → PANEL `#0b1324` (solid, blue-tinted hairline, lit top edge) → field `#0a1226` with inner top shadow. Grey fills are banned; secondary buttons are tinted chips in the phase hue (nav-pill treatment).
2. Fields were pure black → too cold; now navy one step below the panel.
3. Picker buttons ring only on `focus-visible` (`fieldButton()`), so a click never leaves them lit.
4. The login page's two ambient glows (blue top-left, green bottom-right) sit behind every app page: `layout/PageAmbience.tsx`, rendered first inside a `relative isolate` wrapper in `MainTemplate` and `PageShell`. Dark only.
5. Section rules: **one** full-width line, lit at the left, fading right, with a bloom — `ui/SectionHeading.tsx`. A stub + hairline read as two misaligned pieces and was rejected.
6. Page-title beam (`LightsaberUnderline`) is the same language, heavier, **480px everywhere** (was 320/260), 2px core — 3px was "a little thick". No longer clamped to the title's width.
7. Hierarchy of lines: header rule (full spectrum) → page-title beam (page hue, 2px) → section rule (page hue, 1px).

**Applied to:** Discovery (grid, pickers, keyword panel, table controls, results panel), funnel dashboard + table, vetting list + matrix, Offering + Sourcing via `stage/StageWorkContainer.tsx` (new `phase` prop), `DataTable/ColumnPicker.tsx` (new `phase` prop), `DataTable/styles.ts` (header + pinned cells `#0b1324`; blue-tinted rules), StatCard, the three deep buttons (offer footer, sourcing global actions, supplier quotes). Every page speaks only its own hue; the spectrum lives in the header.

**Header menu bug fixed:** yesterday's flourish put `overflow-hidden` on the nav, which clipped the profile dropdown. Clipping now lives inside `HeaderFlourish` in its own inset layer.

### 4. Light mode (started, not member-ready)
- Profile → Appearance card restored behind **`THEME_TOGGLE_ENABLED`** in `src/lib/featureFlags.ts`. **Currently `true` for local review. Must be `false` before the PR to dev.**
- `dashboard/FunnelDashboard.tsx` got a first light pass (47 class swaps: white cards, dark text, tinted hovers, grey bar tracks, pale-green banner). Dave: "better, but more work is needed."
- Nothing else has been looked at in light mode. Discovery, vetting, offer, sourcing, tables, the wordmark on white — all unchecked.

## What's blocked / unverified
- **Light mode across the app** — see above. Rest of tomorrow's first block.
- **Discovery budget refusal path** never tripped live (no non-exempt login). A Core test account would settle it.
- **Working tree** on the branch still carries 15 uncommitted deletions of old logo PNGs in `public/` (Elevate*, GWF*, VettingCalculator*, favicon.ico/png) — pre-existing, unrelated, untouched. Decide whether to commit or restore before the PR.
- Unused imports may linger in `SourcingPageContent.tsx` (`PANEL_TABS`, `field`) — tsc doesn't flag them; tidy on the PR.

## Files changed (branch `feat/ux-round-2026-09-12`, one commit `d32e22a`, 33 files)
- **New:** `ui/surfaces.ts`, `ui/SectionHeading.tsx`, `layout/PageAmbience.tsx`
- **Surfaces / chrome:** `LightsaberUnderline.tsx`, `layout/{HeaderFlourish,PageShell,PageTitleBlock,AppHeader}.tsx`, `MainTemplate.tsx`, `NavBar.tsx`, `SectionStats.tsx`, `StatCard.tsx`, `DataTable/{styles.ts,ColumnPicker.tsx}`, `stage/StageWorkContainer.tsx`
- **Pages:** `Discovery/*` (grid, pickers, keyword panel, table controls, content), `dashboard/{Dashboard,FunnelDashboard}.tsx`, `Table.tsx`, `Results/ProductVettingResults.tsx`, `Offer/{OfferPageContent,OfferFooterActions}.tsx`, `Sourcing/{SourcingPageContent,SourcingGlobalActions}.tsx`, `Sourcing/tabs/SupplierQuotesTab.tsx`
- **Flags / profile:** `lib/featureFlags.ts`, `app/profile/page.tsx`

(Budget PR #107 files: `lib/discovery/budget{,.server}{,.test}.ts`, `hydrateAsins.server.ts`, the three `api/discovery/*` routes, `Discovery/DiscoveryContent.tsx`.)

## Next-session entry point
1. **Light mode, funnel dashboard first** (`FunnelDashboard.tsx`), then the same lap Discovery → Vetting → Offering → Sourcing → tables, in light. Toggle is Profile → Appearance. Every fix goes into `ui/surfaces.ts` / `DataTable/styles.ts` when it is a surface, per-component only for copy colours.
2. Check **"Bloom" on white** in the wordmark (`Logo.tsx`; deepen `from-slate-800 to-slate-600` if it lacks contrast).
3. Before the PR: `THEME_TOGGLE_ENABLED = false`, decide the `public/` deletions, `tsc` + `vitest`, one PR to dev, Dave verifies the dev link, then dev → main with the standard five smoke checks on `saasogv6`.

## Open questions
- Light mode: ship it hidden (flag off) with whatever state it reaches, or hold the whole branch until light is presentable? Dave leaned toward "hidden from the user" — flag off is the safe default.
- Montserrat for page titles — still on hold until Dave gives more context.
- Learn flag flip — "once we have made a few more changes", no date.
- Budget numbers: Core 2,500 / Pro 10,000 were set by me after the wide-search measurement replaced the 110-token estimate Dave first approved. One constant if he wants them moved.
- Optional micro-saving: the search lists 1,000 ASINs but returns 250 (7 tokens/search).
