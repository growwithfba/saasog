# Discovery (Black Box replica) — shipped to `dev`

**Date:** 2026-09-09
**Branch:** `dev` @ `9b84e2a` (also on `feat/discovery-black-box`)
**Scale:** 53 commits, 52 files, +9,454 lines
**Status:** Complete and on `dev`. **Not** on `main` / production.

---

## What this is

A Helium 10 Black Box replica built natively into BloomEngine, intended to
**replace Helium 10 as our fundamental product-research tool**. It is phase 1
of the funnel IA:

```
[My Funnel] | Discovery → Vetting → Offering → Sourcing
```

- `/research` is **deleted**. The saved-products funnel moved to `/dashboard`
  ("My Funnel").
- `/discovery` is the new Black Box surface.

---

## Architecture (the parts worth knowing before touching anything)

### Keepa cost model — this drove every design decision

| Call | Cost |
|---|---|
| `/query` (Product Finder) | ~11 tokens base + ~1 per 100 ASINs returned. Measured: perPage 50 = 11, 1000 = 20, 10000 = 110 |
| `/query` for `totalResults` only | base only — **counting is nearly free** |
| `/product` @ `stats=180&history=1&aplus=1` | 1 token/ASIN |
| `/product` + `rating=1` | **2 tokens/ASIN** — required, see gotcha below |
| `/product` + `buybox=1&offers=20` | 6 tokens/ASIN |

Hard caps: `/category` max **10** IDs per batch. `/product` max **100** ASINs
per batch. `page × perPage < 10,000`. `perPage` min 50.

### The search flow

1. **Count first** (`totalResults`, nearly free) → tell the user "1,240 products
   match, displaying the first 250."
2. Fetch up to `REVIEWABLE_LIMIT = 250` ASINs, best sales rank first.
3. Hydrate all 250 in **one pass** via `/api/discovery/hydrate`.
4. **All sorting, paging and filtering is client-side** from there — no
   re-search on sort. Every column sorts, including calculated ones.
5. If the match count is over 250, offer narrowing options (price leads when
   revenue is set) via `narrowing.ts`.

### Shared cache — `public.keepa_lens_metrics`

Used by **both** `/api/discovery/hydrate` and the live BloomLens
`/api/extension/enrich`. Payload is a shared `EnrichedRow`.

A `fetch_depth` column (`'lean' | 'full'`) was added this session and
**the migration is already applied to production**:
`supabase/migrations/20260909000000_add_fetch_depth_to_keepa_lens_metrics.sql`

> ⚠️ The extension's upsert must write `fetch_depth` **explicitly**. PostgREST
> omits columns absent from the payload, so a lean row would otherwise stay
> lean forever — a permanent 6-token miss. This is fixed; don't regress it.

### Revenue filtering — the hard problem

Revenue is two-dimensional (price × units) and **no single Keepa filter
expresses it**. Measured: 87/100 raw results came back above the ceiling.
Price banding didn't help (9% error both directions); BSR banding wouldn't
either.

Solution: rank pre-filter by inverting the BSR→units curve
(`revenueBounds.ts`, `RANK_WIDENING = 1.5` — measured p50 1.02, 96% within
1.5×) onto `avg30_SALES`, then an exact client-side test. Guidance tells the
user that narrowing **price** is the effective lever.

### De-duplication

`singleVariation: true` — free, server-side, verified 20/20 distinct parents.

### Attribution — get this right

- `parentMonthlyUnits` = **measured** (BSR curve on the parent rank)
- `monthlyUnits` (ASIN-level) = `parent ÷ min(variationCount, 5)` = **estimate**

I had this backwards at first. The parent figure is the trustworthy one.

---

## File map

```
src/lib/discovery/
  types.ts            HydratedRow (22 fields), FilterKind, ALL_FULFILLMENT
  filterSchema.ts     probe-verified allowlist + input bounds
  buildSelection.ts   → Keepa selection JSON; throws UnknownFilterError
  derivedFilters.ts   client-side filters Keepa can't express
  revenueBounds.ts    BSR-curve inversion for revenue pre-filtering
  hydrateRow.ts       EnrichedRow ↔ HydratedRow, cents→dollars
  hydrateAsins.server.ts  shared cache-first hydration (batch 100)
  narrowing.ts        "narrow price / BSR / units" suggestions
  presets.ts          4 presets incl. Dave's "coding" preset
  rootCategories.ts   18 resolved root category IDs

src/app/api/discovery/
  search/      REVIEWABLE_LIMIT=250, MAX_ASINS=1000
  hydrate/     MAX_ASINS_PER_REQUEST=300
  categories/  CATEGORY_BATCH_SIZE=10  ← Keepa's hard cap
  variations/  MAX_VARIATIONS=20

src/components/Discovery/
  DiscoveryContent  FilterGrid  ResultsTable  columns.ts  HeaderCell
  ColumnPicker  CategoryPicker  FulfillmentPicker  SelectionBar  TableControls
```

**Docs:** `docs/keepa-product-finder-probe-2026-09-09.md` (probe note, GO
verdict, filter coverage table, cost model),
`docs/superpowers/specs/2026-09-09-discovery-black-box-design.md`,
`docs/superpowers/plans/2026-09-09-discovery-black-box.md`.
Re-runnable probe: `scripts/probe-keepa-product-finder.ts`.

---

## Table UX — ported from the BloomLens Chrome extension

Deliberately matched to the extension's drawer table: same font, larger rows
by default (bigger images), click image → opens on Amazon, hover to enlarge,
drag-to-reorder columns (dnd-kit), resizable columns, wrap-product-title
toggle, sortable title column, rows-per-page + prev/next at **both** top and
bottom, funnel icon in a thin column left of the image for save-on-the-go,
checkbox multi-select → "Save to Funnel" bar, saved rows glow blue.

Default 50 rows; 100/200/300 available.

---

## Gotchas I paid for — don't relearn these

1. **Unknown `selection` keys are SILENTLY IGNORED by Keepa.** You get HTTP 200
   and the entire 12.7M-product catalog. Hence the allowlist +
   `UnknownFilterError`. The guard must run **before** the null check:
   ```ts
   const def = getFilterDef(id);
   if (!def) throw new UnknownFilterError(id);
   if (value === undefined || value === null) continue;  // AFTER, not before
   ```

2. **`rating=1` is required.** Without it Keepa returns `-1` for reviews and
   rating. I asserted otherwise early on and had an implementer "correct" a
   docstring that was telling the truth. It also meant LQS was understated by
   ~3 points (5.7 vs 8.6 on the same product).

3. **`/category` caps at 10 IDs**, not 100. Sending more silently returns an
   error object in the child response that's easy to miss.

4. **`EnrichedRow.monthlyRevenue` is in CENTS.** Divide by 100.

5. **Never run `npm run build` while the dev server is running.** It corrupts
   `.next` (`Cannot find module './7454.js'`, or a page rendering with zero
   CSS). I did this twice. Use `npx tsc --noEmit` and `npm test`.

6. `vitest.config.mts` **must** be `.mts` — `vite-tsconfig-paths@5` is
   ESM-only and root `package.json` has no `"type": "module"`.

---

## Testing

Vitest added this session (the repo had no test runner). **92 tests, all
passing**: `npm test -- --run`.

`npx tsc --noEmit` reports 4 errors, all in `keepa-tests/` — a pre-existing
standalone scratch directory missing `@jest/globals`, untouched by this work.
Zero errors in the app itself.

---

## Open / not yet done

- **Not in production.** Everything is on `dev`. Needs a `dev → main` PR when
  Dave greenlights.
- **Browser verification is partial.** The last round (loading style matched to
  the Offering page's SSP builder, page header styling matched to
  Vetting/Offering/Sourcing, sleeker results-header buttons) was typechecked
  and unit-tested but **not visually confirmed** by Dave before we wrapped.
  Start there.
- `impliedUnitBounds` in `derivedFilters.ts` is written but **deliberately
  unwired** — there's a comment explaining why. Leave it unless revisiting
  revenue narrowing.
- Uncommitted in the working tree (all **pre-existing**, none from this work):
  deleted PNGs, `.DS_Store` churn, `yarn.lock`, untracked `marketing/`.

---

## Git note — read this before your next push

The repo's fetch refspec was `+refs/heads/main:refs/remotes/origin/main`,
mapping **only main**. That meant `origin/dev` was a stale local ref that never
updated — comparisons against it silently lied ("0 behind" when the remote was
5 commits ahead), and the push was rejected.

Fixed this session:
```
git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
```

Also worth knowing: remote `dev` is rebuilt via **squash merges**, so our
original commits (`a447bd6`, `b6b2709`) exist there under different SHAs.
Local `dev` and `origin/dev` are now both `9b84e2a`. No force-push was used.

---

## Suggested next session

1. Dave opens `/discovery` on `dev` and eyeballs the final styling round.
2. Fix whatever he flags.
3. `dev → main` PR when he greenlights.
