# Handoff — 2026-09-11: full-window layout, shared table chrome, Learn pause, brand header

**Branch state:** everything below is on `dev` (head `15b8795`) via PRs #100, #101, #102. Nothing merged to `main`. `dev` also carries the entire Discovery Black Box build from 2026-09-09/10 that has never been in production, so the next `dev → main` merge is a big one and needs a deliberate ship decision.

Dave verified the dev preview end to end (dashboard, Vetting, Offering, Sourcing, Discovery search) and signed off: "Everything looks good on the dev link."

## What shipped

### 1. Full-window layout on every app page (`0ed6bb5`)
- `MainTemplate` and `NavBar` default to `wide`; `PageShell` and `AppHeader` drop the 1280px cap; `Footer` gained a `wide` prop so nav, body and footer line up.
- Inner `max-w-7xl` wrappers removed from `/submission/[id]` and the three CSV uploaders.
- Prose/form pages (terms, privacy, support, profile, preferences, subscription) keep a reading column inside the wide shell — a 2500px form is worse.

### 2. Shared table chrome — `src/components/DataTable/` (`90becde` and after)
One look for every table, settled on Discovery's version and borrowing two things back from the Lens drawer (hover help on labels, resizable image column):

| Piece | File | Role |
|---|---|---|
| Class constants | `styles.ts` | `TABLE`, `TABLE_STYLE`, `TABLE_SCROLL`, `HEAD_CELL`, `HEAD_CELL_PINNED`, `HEAD_ROW`, `ROW`, `CELL`, `CELL_PINNED_EDGE`, `PINNED` offsets, `rowTint`, `pinnedBg`, `pinnedCell`, `MIN_COLUMN_WIDTH` |
| Header cell | `HeaderCell.tsx` | drag grip (dnd-kit), resize handle, always-visible sort chevron, hover tooltip from `note` (no marker — Dave rejected the dotted underline) |
| Column picker | `ColumnPicker.tsx` | count on the button, Select all / Reset, search past 12 columns, optional groups, `children` slot for extra toggles. Panel is `z-50` so sticky headers can't paint over it |
| Prefs | `useColumnPrefs.ts` | `${key}.visible / .order / .widths` in localStorage, read after mount |
| Resize | `useColumnResize.ts` | window-level mousemove so the pointer can leave the handle |

**Tables on it (all six):**
- Discovery results (`Discovery/ResultsTable.tsx`) — help text on every column; image column resizable; checkbox + funnel + image pinned left. Hooks hoisted above the loading return (#101).
- Research funnel (`Table.tsx`) — **column registry** `FUNNEL_COLUMNS` replaces 23 hand-written columns; checkbox + image pinned left, Progress pinned right; Category/Brand always-on but movable.
- Vetting competitor matrix (`Results/ProductVettingResults.tsx`) — `MATRIX_*` registry, height follows the window (no 500px cap), image split out of Brand, grouped picker (Default / Uploaded). Kept: chips, remove/restore, accent bars, heat pills. `globals.css` removal-accent rule now skips `.sticky` cells so flagged rows stay pinned.
- Vetted Markets (`dashboard/Dashboard.tsx`) — `VETTING_LIST_COLUMNS`; visibility still profile-saved via `useColumnPreferences('vetting_columns')`; Progress pinned right.
- Offering (`Offer/OfferPageContent.tsx`) and Sourcing (`Sourcing/SourcingPageContent.tsx`) — `OFFER_COLUMNS` / `SOURCING_COLUMNS`; gained a Columns picker they never had.

**Dave's locked calls:** hover-label help, no marker; 15px body app-wide; matrix height follows the window.

### 3. Learn paused (`1b6cb9a`)
`LEARN_ENABLED = false` in `src/lib/featureFlags.ts` hides the Learn button on every page (both title blocks), the Learning Hub link in both profile menus and the landing footer, short-circuits `LearnModal`, and redirects `/learn → /dashboard`. One-line flip to restore once the Loom materials are redone.

### 4. Brand header (`bd221ec`, PR #102)
- `src/components/Logo.tsx` draws the lockup live: transparent plant mark + "Bloom" (silver gradient) + "Engine" (sky → cyan → green → lime), Montserrat ExtraBold via `next/font/google` → `--font-brand` → Tailwind `font-brand`. Sized off the `h-N` class. `tone="dark"` pins dark colours (used on the always-dark `AppHeader`).
- `src/components/layout/HeaderFlourish.tsx` — light rule along the header's bottom edge + faint blue/green flow lines from the far edges, masked to fade before the pills, hidden below `lg`. Rendered inside both navs (`relative overflow-hidden`, bg `#0b1224/80`).
- Reference artwork: `~/Downloads/BloomCohort23.png` (cohort lockup).

## What's blocked / unverified
- **Light mode NavBar** with the new wordmark not eyeballed (Playwright can't sign in; Dave's Chrome check was dark). If "Bloom" lacks contrast on white, deepen `from-slate-800 to-slate-600` in `Logo.tsx`.
- **The one-off "Application error" Dave saw** on the dev link right after the #100 deploy did not reproduce anywhere (all six surfaces checked signed-in in his Chrome). Best explanation: stale chunks during the alias switch. If it recurs, get the page + console line.
- No tests cover any of the tables; `tsc` is the gate (`keepa-tests/` has 4 pre-existing errors, ignore). Project has no ESLint config (`next lint` prompts to set one up).

## Files changed (today, on dev)
- Layout: `components/MainTemplate.tsx`, `NavBar.tsx`, `layout/{PageShell,AppHeader,Footer,HeaderFlourish}.tsx`, `app/submission/[id]/page.tsx`, `components/Upload/*.tsx`
- Tables: `components/DataTable/*`, `components/Table.tsx`, `components/Discovery/{ResultsTable,TableControls,DiscoveryContent,columns}.ts(x)` (old `Discovery/HeaderCell.tsx` + `ColumnPicker.tsx` deleted), `components/Results/ProductVettingResults.tsx`, `components/dashboard/Dashboard.tsx`, `components/Offer/OfferPageContent.tsx`, `components/Sourcing/SourcingPageContent.tsx`, `app/globals.css`
- Learn: `lib/featureFlags.ts`, `layout/PageTitleBlock.tsx`, `SectionStats.tsx`, `LearnModal.tsx`, `NavBar.tsx`, `layout/AppHeader.tsx`, `app/page.tsx`, `dashboard/Dashboard.tsx`, `app/learn/page.tsx`
- Brand: `components/Logo.tsx`, `app/layout.tsx`, `tailwind.config.js`

## Next-session entry point
1. **Decide the `dev → main` ship.** `git log --oneline origin/main..origin/dev` is ~60 commits (Discovery Black Box + today). Dave must say "ship to main" explicitly; production is served by Vercel project `saasogv6` from `main`. After merge, verify the production deploy and smoke the same five checks.
2. Any visual tweaks Dave raises after using the tables for a day go into the shared pieces first (`DataTable/styles.ts` / `HeaderCell.tsx`), never per-table.
3. Optional follow-ups noted but not started: Discovery heat pills on ASIN/Parent Revenue (Lens-style, deliberately deferred); a wrap-title toggle on the funnel table (it clamps to two lines instead).

## Open questions
- Ship the whole `dev` branch to `main` now, or gate Discovery behind a flag and ship layout + tables + brand first? (Discovery has never been in prod; it spends Keepa tokens per search.)
- Keep Montserrat for the wordmark only, or adopt it for page titles too now that it's loaded?
- When do the Learn materials get redone, so the flag has a flip date?
