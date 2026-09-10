# Discovery (Black Box Replica) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a faithful Helium 10 Black Box replica inside BloomEngine, powered by Keepa's Product Finder, whose results flow into the BloomEngine funnel.

**Architecture:** Two-stage search that mirrors Keepa's cost asymmetry — one flat-cost `/query` call returns an ASIN list to the browser, then only the rows actually on screen are hydrated (1 token each) through a globally-shared 24h cache. All filter keys pass through a single structural allowlist, because Keepa silently ignores unknown keys and returns the entire catalog.

**Tech Stack:** Next.js 14.2 (App Router, pages under `src/app`), React 18, TypeScript 5.3, Redux Toolkit, Tailwind, Supabase (auth + Postgres), Keepa REST API. Tests: Vitest (added in Task 1 — the repo currently has no runner).

**Spec:** `docs/superpowers/specs/2026-09-09-discovery-black-box-design.md`

## Global Constraints

- **Branch:** all work happens on `feat/discovery-black-box` (already created off `dev`). Every task commits here. Nothing is pushed to `main` until the whole feature is done and Dave signs off.
- **Keepa filter keys MUST come from the allowlist in `src/lib/discovery/filterSchema.ts`.** Keepa returns HTTP 200 and the entire 12.7M-product catalog for an unknown key. Never interpolate a user-supplied string into a Keepa `selection` object.
- **Keepa hydration uses `stats=180&history=1&aplus=1` only — 1 token/ASIN.** Never call `fetchAsinSnapshot()` from Discovery; it costs 6 tokens/ASIN.
- **Keepa units are not display units:** prices in **cents**, weights in **grams**, dimensions in **mm**, ratings **×10** (4.5 → 45), dates in **Keepa minutes**. All conversion lives in `filterSchema.ts` and nowhere else.
- **`totalResults` drifts ±100 between identical calls.** Never assert exact equality on it.
- **`page × perPage` must be < 10000**, and `perPage` must be ≥ 50.
- **Naming:** user-facing labels say "Discovery" and "My Funnel". Internal identifiers (`research_products`, the `research` phase key, `/api/research/*`, `/research/[asin]`) keep their existing names. Do not rename them.
- **Never mention Keepa in user-facing copy.** It is an internal data source.
- **Support email in any user-facing copy is `support@bloomengine.ai`.**
- The Keepa API key is `process.env.KEEPA_API_KEY` and must stay server-side. Never expose it to the client.

---

## File Structure

**Phase 7.1 — Information architecture**
| File | Responsibility |
|---|---|
| `package.json`, `vitest.config.ts` | Test runner (Modify / Create) |
| `src/components/NavBar.tsx` | Nav: My Funnel button + Discovery pill (Modify) |
| `src/components/layout/FunnelButton.tsx` | The non-phase "My Funnel" nav button (Create) |
| `src/app/dashboard/page.tsx` | My Funnel = funnel visual + product table (Modify) |
| `next.config.js` | `/research` → `/dashboard` redirect (Modify) |

**Phase 7.2 — Search core**
| File | Responsibility |
|---|---|
| `src/lib/discovery/filterSchema.ts` | The allowlist + all unit conversion (Create) |
| `src/lib/discovery/buildSelection.ts` | Filters → Keepa `selection`; throws on unknown keys (Create) |
| `src/lib/discovery/types.ts` | Shared types across lib + routes + UI (Create) |
| `src/app/api/discovery/search/route.ts` | Stage A — Keepa `/query` (Create) |
| `src/app/api/discovery/hydrate/route.ts` | Stage B — cache-first `/product` (Create) |
| `src/app/discovery/page.tsx` | Route shell (Create) |
| `src/components/Discovery/DiscoveryContent.tsx` | Search state orchestration (Create) |
| `src/components/Discovery/FilterGrid.tsx` | Filter inputs rendered from the schema (Create) |
| `src/components/Discovery/ResultsTable.tsx` | Results table (Create) |

**Phase 7.3 — Results depth**
| File | Responsibility |
|---|---|
| `src/lib/discovery/derivedFilters.ts` | Implied bounds + post-filters (Create) |

**Phase 7.4 — Presets, categories, save**
| File | Responsibility |
|---|---|
| `src/lib/discovery/presets.ts` | Course-derived presets (Create) |
| `src/app/api/discovery/categories/route.ts` | Keepa category tree proxy (Create) |
| `src/components/Discovery/CategoryPicker.tsx` | Lazy drill-down tree (Create) |

---

# PHASE 7.1 — Information Architecture

### Task 1: Test infrastructure

The repo has no test runner (`"test": "echo \"Error: no test specified\" && exit 1"`). Every later task is TDD, so this comes first.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/discovery/sanity.test.ts` (deleted at the end of this task)

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` runs Vitest over `src/**/*.test.ts` with the `@/` alias working.

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest@^2.1.8 vite-tsconfig-paths@^5.1.4
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Wire the npm scripts**

In `package.json`, replace the `"test"` line inside `"scripts"` with:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 4: Write a sanity test that proves the `@/` alias resolves**

Create `src/lib/discovery/sanity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TIER_LIMITS } from '@/lib/subscription/tiers';

describe('vitest harness', () => {
  it('resolves the @/ path alias', () => {
    expect(TIER_LIMITS.core.vetting).toBe(25);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: PASS, 1 test. If it fails with "Cannot find module '@/lib/subscription/tiers'", the `vite-tsconfig-paths` plugin is not loading — confirm `tsconfig.json` has `"paths": { "@/*": ["./src/*"] }`.

- [ ] **Step 6: Delete the sanity test and commit**

```bash
rm src/lib/discovery/sanity.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest runner for discovery work"
```

---

### Task 2: Nav restructure

**Files:**
- Create: `src/components/layout/FunnelButton.tsx`
- Modify: `src/components/NavBar.tsx:44-65` (the `PhasePill` block)

**Interfaces:**
- Consumes: `PhasePill` from `@/components/layout/PhasePill` — signature `{ phase: 'research'|'vetting'|'offer'|'sourcing'; href: string; label: string; isActive?: boolean; className?: string }`
- Produces: `<FunnelButton isActive={boolean} />` — a nav button distinct from the four phase pills.

**Context:** `PhaseType` stays as-is. Discovery reuses `phase="research"` (the blue phase colour) with `href="/discovery"` and `label="Discovery"`. Per the Global Constraints, the internal phase key is not renamed.

- [ ] **Step 1: Create the FunnelButton component**

`src/components/layout/FunnelButton.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';

interface FunnelButtonProps {
  isActive?: boolean;
}

/**
 * "My Funnel" nav button. Deliberately NOT a PhasePill — the funnel is the
 * container of every phase, not a fifth phase, so it must not read as a peer
 * of Discovery / Vetting / Offering / Sourcing.
 */
export function FunnelButton({ isActive = false }: FunnelButtonProps) {
  const base =
    'flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all border focus:outline-none focus:ring-2 focus:ring-violet-400/40';
  const state = isActive
    ? 'text-violet-200 border-violet-500/70 bg-violet-500/18'
    : 'text-violet-200 border-violet-500/50 bg-violet-500/10 hover:bg-violet-500/18 hover:border-violet-400/70';

  return (
    <Link href="/dashboard" className={`${base} ${state}`}>
      <LayoutGrid className="w-4 h-4" />
      <span>My Funnel</span>
    </Link>
  );
}
```

- [ ] **Step 2: Import FunnelButton in NavBar**

In `src/components/NavBar.tsx`, add below the existing `PhasePill` import:

```tsx
import { FunnelButton } from '@/components/layout/FunnelButton';
```

- [ ] **Step 3: Replace the pill block**

In `src/components/NavBar.tsx`, replace the four `<PhasePill .../>` elements (the Research / Vetting / Offering / Sourcing block) with:

```tsx
              <FunnelButton isActive={pathname === '/dashboard'} />
              <div className="hidden sm:block w-px h-6 bg-gray-300 dark:bg-slate-700" />
              <PhasePill
                phase="research"
                href="/discovery"
                label="Discovery"
                isActive={pathname === '/discovery' || pathname?.startsWith('/discovery/')}
              />
              <PhasePill
                phase="vetting"
                href="/vetting"
                label="Vetting"
                isActive={pathname === '/vetting' || pathname?.startsWith('/vetting/') || pathname?.startsWith('/submission/')}
              />
              <PhasePill
                phase="offer"
                href="/offer"
                label="Offering"
                isActive={pathname === '/offer' || pathname?.startsWith('/offer/')}
              />
              <PhasePill
                phase="sourcing"
                href="/sourcing"
                label="Sourcing"
                isActive={pathname === '/sourcing' || pathname?.startsWith('/sourcing/')}
              />
```

- [ ] **Step 4: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `NavBar.tsx` or `FunnelButton.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/FunnelButton.tsx src/components/NavBar.tsx
git commit -m "feat(nav): My Funnel button + Discovery pill replacing Research"
```

---

### Task 3: My Funnel page + /research redirect

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `next.config.js`

**Interfaces:**
- Consumes: `FunnelDashboard` (no props), `Table` from `@/components/Table` — signature `{ setUpdateProducts: (update: boolean) => void; onTabChange?: (tab: string) => void }`, `useProductFunnelStats()` which returns `{ productsInFunnel, productsVetted, productsOffered, productsSourced, setUpdateProducts }`.
- Produces: `/dashboard` renders the funnel visual and the full product table. `/research` redirects to it.

- [ ] **Step 1: Rewrite the dashboard page**

Replace the entire contents of `src/app/dashboard/page.tsx`:

```tsx
'use client';

import MainTemplate from '@/components/MainTemplate';
import { FunnelDashboard } from '@/components/dashboard/FunnelDashboard';
import Table from '@/components/Table';
import { useProductFunnelStats } from '@/hooks/useProductFunnelStats';

/**
 * My Funnel — the store of every saved product, across all phases.
 * The funnel visual sits on top; the full product table (previously the
 * body of /research) sits beneath it.
 */
export default function DashboardPage() {
  const { setUpdateProducts } = useProductFunnelStats();

  return (
    <MainTemplate>
      <FunnelDashboard />
      <div className="mt-8">
        <Table setUpdateProducts={setUpdateProducts} />
      </div>
    </MainTemplate>
  );
}
```

- [ ] **Step 2: Add the redirect to next.config.js**

In `next.config.js`, add a `redirects` function inside the `nextConfig` object, immediately before the `webpack(config)` entry:

```js
  async redirects() {
    return [
      // /research is now "My Funnel" at /dashboard. Exact-path only —
      // /research/[asin] detail pages are unchanged and must still resolve.
      { source: '/research', destination: '/dashboard', permanent: false },
    ];
  },
```

- [ ] **Step 3: Verify the redirect is exact-path**

Run: `npm run dev`, then in another shell:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/research
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/research/B07R7XSNZ1
```

Expected: first prints `307 http://localhost:3000/dashboard`; second prints `200` (NOT a redirect). If the second redirects, the `source` pattern is too broad.

- [ ] **Step 4: Verify visually**

Open `http://localhost:3000/dashboard`. Expected: funnel visual on top, product table below it, nav shows `My Funnel | Discovery Vetting Offering Sourcing`.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx next.config.js
git commit -m "feat(funnel): merge product table into /dashboard, redirect /research"
```

---

# PHASE 7.2 — Search Core

### Task 4: Filter schema — the allowlist

This is the security boundary of the whole feature. Keepa returns HTTP 200 and the entire catalog for an unknown key, so a typo here becomes a silently-wrong product.

**Files:**
- Create: `src/lib/discovery/types.ts`
- Create: `src/lib/discovery/filterSchema.ts`
- Test: `src/lib/discovery/filterSchema.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type RangeValue = { min?: number; max?: number }`
  - `type FilterValue = RangeValue | string | string[] | boolean`
  - `type DiscoveryFilters = Record<string, FilterValue>`
  - `interface FilterDef { id, label, group, keepaKey, kind, toKeepa?, fromKeepa?, invertRange? }`
  - `const FILTER_DEFS: FilterDef[]`
  - `function getFilterDef(id: string): FilterDef | undefined`
  - `function monthsAgoToKeepaMinutes(months: number, now?: number): number`

- [ ] **Step 1: Create the shared types**

`src/lib/discovery/types.ts`:

```ts
/** A min/max pair in DISPLAY units (dollars, stars, pounds, inches, months). */
export interface RangeValue {
  min?: number;
  max?: number;
}

export type FilterValue = RangeValue | string | string[] | boolean;

/** Keyed by FilterDef.id — never by Keepa key. */
export type DiscoveryFilters = Record<string, FilterValue>;

export type FilterGroup = 'product' | 'competitors' | 'sales';
export type FilterKind = 'range' | 'text' | 'textList' | 'boolean' | 'category';

/** One hydrated result row, in DISPLAY units. */
export interface HydratedRow {
  asin: string;
  title: string | null;
  brand: string | null;
  imageUrl: string | null;
  category: string | null;
  bsr: number | null;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  monthlyUnits: number | null;
  monthlyRevenue: number | null;
  parentUnits: number | null;
  parentRevenue: number | null;
  isFba: boolean | null;
  lqs: number | null;
}
```

- [ ] **Step 2: Write the failing test**

`src/lib/discovery/filterSchema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  FILTER_DEFS,
  getFilterDef,
  monthsAgoToKeepaMinutes,
} from './filterSchema';

describe('FILTER_DEFS', () => {
  it('has unique ids', () => {
    const ids = FILTER_DEFS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses imageCount, never the silently-ignored imagesCount', () => {
    const keys = FILTER_DEFS.map((f) => f.keepaKey);
    expect(keys).toContain('imageCount');
    expect(keys).not.toContain('imagesCount');
  });

  it('does not expose filters Keepa cannot run', () => {
    const keys = FILTER_DEFS.map((f) => f.keepaKey);
    for (const banned of ['returnRate', 'revenue', 'sellerCountry', 'categories_exclude']) {
      expect(keys).not.toContain(banned);
    }
  });
});

describe('unit conversion', () => {
  it('converts dollars to cents', () => {
    expect(getFilterDef('price')!.toKeepa!(20)).toBe(2000);
  });

  it('round-trips dollars', () => {
    const def = getFilterDef('price')!;
    expect(def.fromKeepa!(def.toKeepa!(20))).toBe(20);
  });

  it('converts star rating to Keepa tenths', () => {
    expect(getFilterDef('rating')!.toKeepa!(4.5)).toBe(45);
  });

  it('round-trips star rating', () => {
    const def = getFilterDef('rating')!;
    expect(def.fromKeepa!(def.toKeepa!(4.5))).toBe(4.5);
  });

  it('converts pounds to grams', () => {
    expect(getFilterDef('weight')!.toKeepa!(1)).toBe(454);
  });

  it('converts inches to millimetres', () => {
    expect(getFilterDef('longestSide')!.toKeepa!(10)).toBe(254);
  });
});

describe('monthsAgoToKeepaMinutes', () => {
  const NOW = Date.UTC(2026, 8, 9);

  it('is monotonically decreasing as months increase', () => {
    expect(monthsAgoToKeepaMinutes(6, NOW)).toBeGreaterThan(
      monthsAgoToKeepaMinutes(24, NOW),
    );
  });

  it('produces a positive Keepa-epoch minute count for recent dates', () => {
    expect(monthsAgoToKeepaMinutes(1, NOW)).toBeGreaterThan(0);
  });
});

describe('listing age inverts its range', () => {
  it('is marked invertRange, because a MAX age is a MIN timestamp', () => {
    expect(getFilterDef('listingAge')!.invertRange).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- filterSchema`
Expected: FAIL — "Failed to resolve import ./filterSchema".

- [ ] **Step 4: Implement the schema**

`src/lib/discovery/filterSchema.ts`:

```ts
import type { FilterGroup, FilterKind } from './types';

/**
 * Keepa timestamps are "Keepa minutes": minutes since the Unix epoch, minus
 * a fixed offset that places Keepa time zero at 2011-01-01.
 */
export const KEEPA_EPOCH_OFFSET_MINUTES = 21564000;

export function monthsAgoToKeepaMinutes(months: number, now: number = Date.now()): number {
  const ms = now - months * 30 * 24 * 60 * 60 * 1000;
  return Math.round(ms / 60000) - KEEPA_EPOCH_OFFSET_MINUTES;
}

export interface FilterDef {
  /** Stable internal id. This is what the UI and API speak. */
  id: string;
  label: string;
  group: FilterGroup;
  /**
   * The Keepa `selection` key. PROBE-VERIFIED ONLY — see
   * docs/keepa-product-finder-probe-2026-09-09.md. Keepa silently ignores
   * unknown keys and returns the whole catalog, so an unverified key here
   * is a silently-wrong search, not an error.
   */
  keepaKey: string;
  kind: FilterKind;
  /** Display unit -> Keepa unit. Omit when they are the same. */
  toKeepa?: (displayValue: number) => number;
  /** Keepa unit -> display unit. */
  fromKeepa?: (keepaValue: number) => number;
  /**
   * True when a range's min/max swap on conversion. Listing age is the case:
   * a MAXIMUM age of 12 months is a MINIMUM timestamp.
   */
  invertRange?: boolean;
}

export const FILTER_DEFS: FilterDef[] = [
  // ---- Product -------------------------------------------------------
  { id: 'category', label: 'Category & Subcategory', group: 'product', keepaKey: 'categories_include', kind: 'category' },
  { id: 'reviewCount', label: 'Review Count', group: 'product', keepaKey: 'current_COUNT_REVIEWS', kind: 'range' },
  {
    id: 'rating', label: 'Review Rating', group: 'product', keepaKey: 'current_RATING', kind: 'range',
    toKeepa: (v) => Math.round(v * 10), fromKeepa: (v) => v / 10,
  },
  { id: 'bsr', label: 'Best Seller Rank (BSR)', group: 'product', keepaKey: 'current_SALES', kind: 'range' },
  {
    id: 'listingAge', label: 'Listing Age (Months)', group: 'product', keepaKey: 'listedSince', kind: 'range',
    toKeepa: (months) => monthsAgoToKeepaMinutes(months), invertRange: true,
  },
  {
    id: 'weight', label: 'Weight (lb)', group: 'product', keepaKey: 'itemWeight', kind: 'range',
    toKeepa: (lb) => Math.round(lb * 453.592), fromKeepa: (g) => g / 453.592,
  },
  {
    id: 'longestSide', label: 'Longest Side (in)', group: 'product', keepaKey: 'packageLength', kind: 'range',
    toKeepa: (inches) => Math.round(inches * 25.4), fromKeepa: (mm) => mm / 25.4,
  },
  { id: 'fbaOnly', label: 'FBA Only', group: 'product', keepaKey: 'buyBoxIsFBA', kind: 'boolean' },
  // NOTE: imageCount, NOT imagesCount — the latter is silently ignored by Keepa.
  { id: 'imageCount', label: 'Number of Images', group: 'product', keepaKey: 'imageCount', kind: 'range' },
  { id: 'variationCount', label: 'Variation Count', group: 'product', keepaKey: 'variationCount', kind: 'range' },
  { id: 'titleKeywords', label: 'Title Keywords', group: 'product', keepaKey: 'title', kind: 'text' },

  // ---- Competitors ---------------------------------------------------
  { id: 'sellerCount', label: 'Number of Sellers', group: 'competitors', keepaKey: 'current_COUNT_NEW', kind: 'range' },
  { id: 'brand', label: 'Exact Brand Search', group: 'competitors', keepaKey: 'brand', kind: 'textList' },
  { id: 'sellerId', label: 'Exact Seller Search', group: 'competitors', keepaKey: 'sellerIds', kind: 'textList' },

  // ---- Sales ---------------------------------------------------------
  {
    id: 'price', label: 'Price', group: 'sales', keepaKey: 'current_NEW', kind: 'range',
    toKeepa: (dollars) => Math.round(dollars * 100), fromKeepa: (cents) => cents / 100,
  },
  { id: 'priceChange', label: 'Price Change (%)', group: 'sales', keepaKey: 'deltaPercent90_NEW', kind: 'range' },
  { id: 'monthlyUnits', label: 'ASIN Sales (units)', group: 'sales', keepaKey: 'monthlySold', kind: 'range' },
  { id: 'salesChange', label: 'Sales Change (%)', group: 'sales', keepaKey: 'deltaPercent90_SALES', kind: 'range' },
  { id: 'rankDrops90', label: 'Sales Rank Drops (90d)', group: 'sales', keepaKey: 'salesRankDrops90', kind: 'range' },
  { id: 'outOfStockPct', label: 'Out of Stock (%)', group: 'sales', keepaKey: 'outOfStockPercentage90', kind: 'range' },
];

const BY_ID = new Map(FILTER_DEFS.map((f) => [f.id, f]));

export function getFilterDef(id: string): FilterDef | undefined {
  return BY_ID.get(id);
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- filterSchema`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/discovery/types.ts src/lib/discovery/filterSchema.ts src/lib/discovery/filterSchema.test.ts
git commit -m "feat(discovery): probe-verified filter allowlist with unit conversion"
```

---

### Task 5: buildSelection — the structural guard

**Files:**
- Create: `src/lib/discovery/buildSelection.ts`
- Test: `src/lib/discovery/buildSelection.test.ts`

**Interfaces:**
- Consumes: `FILTER_DEFS`, `getFilterDef` from `./filterSchema`; `DiscoveryFilters`, `RangeValue` from `./types`
- Produces:
  - `class UnknownFilterError extends Error`
  - `interface SelectionOptions { page?: number; perPage?: number; sort?: [string, 'asc' | 'desc'] }`
  - `function buildSelection(filters: DiscoveryFilters, opts?: SelectionOptions): Record<string, unknown>`

- [ ] **Step 1: Write the failing test**

`src/lib/discovery/buildSelection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSelection, UnknownFilterError } from './buildSelection';

describe('buildSelection — unknown keys', () => {
  it('throws on a filter id that is not in the schema', () => {
    expect(() => buildSelection({ notARealFilter: { min: 1 } })).toThrow(UnknownFilterError);
  });

  it('throws on the imagesCount typo rather than passing it to Keepa', () => {
    // Keepa would accept this silently and return the entire catalog.
    expect(() => buildSelection({ imagesCount: { min: 5 } })).toThrow(UnknownFilterError);
  });

  it('names the offending filter in the error message', () => {
    expect(() => buildSelection({ bogus: true })).toThrow(/bogus/);
  });
});

describe('buildSelection — range conversion', () => {
  it('emits _gte/_lte using the Keepa key, not the filter id', () => {
    const sel = buildSelection({ bsr: { min: 1, max: 50000 } });
    expect(sel).toMatchObject({ current_SALES_gte: 1, current_SALES_lte: 50000 });
    expect(sel).not.toHaveProperty('bsr_gte');
  });

  it('converts dollars to cents', () => {
    expect(buildSelection({ price: { min: 20, max: 70 } })).toMatchObject({
      current_NEW_gte: 2000,
      current_NEW_lte: 7000,
    });
  });

  it('converts star rating to tenths', () => {
    expect(buildSelection({ rating: { min: 3, max: 4 } })).toMatchObject({
      current_RATING_gte: 30,
      current_RATING_lte: 40,
    });
  });

  it('omits an absent bound instead of emitting undefined', () => {
    const sel = buildSelection({ reviewCount: { max: 1000 } });
    expect(sel).toHaveProperty('current_COUNT_REVIEWS_lte', 1000);
    expect(sel).not.toHaveProperty('current_COUNT_REVIEWS_gte');
  });

  it('inverts listing age: a MAX age becomes a MIN timestamp', () => {
    const sel = buildSelection({ listingAge: { max: 12 } }) as Record<string, number>;
    expect(sel).toHaveProperty('listedSince_gte');
    expect(sel).not.toHaveProperty('listedSince_lte');
  });
});

describe('buildSelection — non-range kinds', () => {
  it('passes text straight through', () => {
    expect(buildSelection({ titleKeywords: 'bead loom' })).toMatchObject({ title: 'bead loom' });
  });

  it('passes a text list through as an array', () => {
    expect(buildSelection({ brand: ['darice'] })).toMatchObject({ brand: ['darice'] });
  });

  it('passes booleans through', () => {
    expect(buildSelection({ fbaOnly: true })).toMatchObject({ buyBoxIsFBA: true });
  });

  it('omits a false boolean entirely — false must not filter', () => {
    expect(buildSelection({ fbaOnly: false })).not.toHaveProperty('buyBoxIsFBA');
  });
});

describe('buildSelection — paging', () => {
  it('defaults to perPage 50 page 0', () => {
    expect(buildSelection({})).toMatchObject({ perPage: 50, page: 0 });
  });

  it('rejects perPage below Keepa minimum of 50', () => {
    expect(() => buildSelection({}, { perPage: 25 })).toThrow(/perPage/);
  });

  it('rejects page x perPage at or beyond the 10000 ceiling', () => {
    expect(() => buildSelection({}, { perPage: 50, page: 200 })).toThrow(/10000/);
  });

  it('allows the last legal page', () => {
    expect(buildSelection({}, { perPage: 50, page: 199 })).toMatchObject({ page: 199 });
  });

  it('emits sort in Keepa tuple form using the Keepa key', () => {
    expect(buildSelection({}, { sort: ['bsr', 'asc'] })).toMatchObject({
      sort: [['current_SALES', 'asc']],
    });
  });

  it('throws when sorting by an unknown filter id', () => {
    expect(() => buildSelection({}, { sort: ['nope', 'asc'] })).toThrow(UnknownFilterError);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- buildSelection`
Expected: FAIL — "Failed to resolve import ./buildSelection".

- [ ] **Step 3: Implement**

`src/lib/discovery/buildSelection.ts`:

```ts
import { getFilterDef } from './filterSchema';
import type { DiscoveryFilters, RangeValue } from './types';

/**
 * Thrown when a filter id is not in FILTER_DEFS.
 *
 * This is the single most important guard in Discovery. Keepa SILENTLY
 * IGNORES unknown `selection` keys — it returns HTTP 200, charges the full
 * 11 tokens, and hands back the entire 12.7M-product catalog. A typo would
 * therefore look exactly like a successful, correctly-filtered search.
 */
export class UnknownFilterError extends Error {
  constructor(id: string) {
    super(
      `Unknown Discovery filter "${id}". Filter ids must exist in FILTER_DEFS ` +
        `(src/lib/discovery/filterSchema.ts). Keepa silently ignores unknown ` +
        `keys and would return the entire catalog.`,
    );
    this.name = 'UnknownFilterError';
  }
}

export interface SelectionOptions {
  page?: number;
  perPage?: number;
  /** [filterId, direction] — the filter id, not the Keepa key. */
  sort?: [string, 'asc' | 'desc'];
}

/** Keepa's own limits, from the probe. */
const MIN_PER_PAGE = 50;
const MAX_DEPTH = 10000;

const isRange = (v: unknown): v is RangeValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function buildSelection(
  filters: DiscoveryFilters,
  opts: SelectionOptions = {},
): Record<string, unknown> {
  const { page = 0, perPage = MIN_PER_PAGE, sort } = opts;

  if (perPage < MIN_PER_PAGE) {
    throw new Error(`perPage must be at least ${MIN_PER_PAGE} (Keepa minimum), got ${perPage}`);
  }
  if (page * perPage >= MAX_DEPTH) {
    throw new Error(
      `page x perPage must be below ${MAX_DEPTH} (Keepa ceiling); got ${page} x ${perPage}`,
    );
  }

  const selection: Record<string, unknown> = {
    productType: [0, 1],
    perPage,
    page,
  };

  for (const [id, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;

    const def = getFilterDef(id);
    if (!def) throw new UnknownFilterError(id);

    if (def.kind === 'range') {
      if (!isRange(value)) continue;
      const convert = def.toKeepa ?? ((n: number) => n);
      // invertRange: a MAX display value becomes a MIN Keepa value, because
      // the conversion is order-reversing (age in months -> timestamp).
      const lowKey = def.invertRange ? 'max' : 'min';
      const highKey = def.invertRange ? 'min' : 'max';

      const low = value[lowKey as keyof RangeValue];
      const high = value[highKey as keyof RangeValue];

      if (typeof low === 'number') selection[`${def.keepaKey}_gte`] = convert(low);
      if (typeof high === 'number') selection[`${def.keepaKey}_lte`] = convert(high);
      continue;
    }

    if (def.kind === 'category') {
      if (Array.isArray(value) && value.length > 0) {
        selection[def.keepaKey] = value.map((v) => Number(v));
      }
      continue;
    }

    if (def.kind === 'boolean') {
      // Only a true boolean filters. `false` means "don't care", not
      // "must be false" — emitting it would silently exclude every FBA row.
      if (value === true) selection[def.keepaKey] = true;
      continue;
    }

    if (def.kind === 'textList') {
      if (Array.isArray(value) && value.length > 0) selection[def.keepaKey] = value;
      continue;
    }

    if (def.kind === 'text') {
      if (typeof value === 'string' && value.trim().length > 0) {
        selection[def.keepaKey] = value.trim();
      }
    }
  }

  if (sort) {
    const [sortId, direction] = sort;
    const sortDef = getFilterDef(sortId);
    if (!sortDef) throw new UnknownFilterError(sortId);
    selection.sort = [[sortDef.keepaKey, direction]];
  }

  return selection;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- buildSelection`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/buildSelection.ts src/lib/discovery/buildSelection.test.ts
git commit -m "feat(discovery): buildSelection with structural unknown-key guard"
```

---

### Task 6: Search API route (Stage A)

**Files:**
- Create: `src/app/api/discovery/search/route.ts`

**Interfaces:**
- Consumes: `buildSelection`, `UnknownFilterError` from `@/lib/discovery/buildSelection`
- Produces: `POST /api/discovery/search` with body `{ filters: DiscoveryFilters, sort?: [string,'asc'|'desc'] }` returning `{ success: true, asins: string[], totalResults: number, capped: boolean }`

**Context:** Follow the auth pattern in `src/app/api/research/add-asin/route.ts:36-56` — Bearer token if present, otherwise the cookie-based server client.

- [ ] **Step 1: Implement the route**

`src/app/api/discovery/search/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { buildSelection, UnknownFilterError } from '@/lib/discovery/buildSelection';

const KEEPA_BASE_URL = 'https://api.keepa.com';

/**
 * Cap on how many ASINs we hand back to the browser. Keepa itself refuses
 * page x perPage >= 10000, and 1000 ASINs is ~10KB — 20 pages of 50, which
 * is far more than anyone pages through. `totalResults` is always returned
 * so the UI can tell the user how much lies beyond the cap.
 */
const MAX_ASINS = 1000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const supabase = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } },
        )
      : createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const apiKey = process.env.KEEPA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Search is unavailable.' }, { status: 500 });
    }

    let selection: Record<string, unknown>;
    try {
      selection = buildSelection(body?.filters ?? {}, {
        perPage: MAX_ASINS,
        page: 0,
        sort: body?.sort,
      });
    } catch (err) {
      if (err instanceof UnknownFilterError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 400 });
      }
      const message = err instanceof Error ? err.message : 'Invalid filters.';
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }

    const url =
      `${KEEPA_BASE_URL}/query?key=${apiKey}&domain=1` +
      `&selection=${encodeURIComponent(JSON.stringify(selection))}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data?.error) {
      // Never surface the upstream provider's name to the user.
      console.error('[discovery/search] provider error', data.error);
      return NextResponse.json(
        { success: false, error: 'Search failed. Please adjust your filters and try again.' },
        { status: 502 },
      );
    }

    const asins: string[] = Array.isArray(data?.asinList) ? data.asinList : [];
    const totalResults: number = typeof data?.totalResults === 'number' ? data.totalResults : asins.length;

    return NextResponse.json({
      success: true,
      asins,
      totalResults,
      capped: totalResults > asins.length,
    });
  } catch (err) {
    console.error('[discovery/search] unexpected', err);
    return NextResponse.json({ success: false, error: 'Search failed.' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify against the live API**

Run `npm run dev`, log in through the browser so a session cookie exists, then in the browser devtools console on any BloomEngine page:

```js
await (await fetch('/api/discovery/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ filters: { category: ['2617941011'], bsr: { min: 1, max: 50000 }, price: { min: 20, max: 70 } } }),
})).json()
```

Expected: `{ success: true, asins: [...1000 items], totalResults: <a number in the tens of thousands>, capped: true }`.

- [ ] **Step 3: Verify the unknown-key guard rejects rather than searching**

```js
await (await fetch('/api/discovery/search', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ filters: { imagesCount: { min: 5 } } }),
})).json()
```

Expected: HTTP 400, `success: false`, message naming `imagesCount`. It must NOT return a result set.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/discovery/search/route.ts
git commit -m "feat(discovery): search route backed by Keepa product finder"
```

---

### Task 7: Hydrate API route (Stage B)

**Files:**
- Create: `src/app/api/discovery/hydrate/route.ts`
- Create: `supabase/migrations/20260909000000_add_fetch_depth_to_keepa_lens_metrics.sql`
- Modify: `src/app/api/extension/enrich/route.ts` (one line — the cache-hit condition)

**Interfaces:**
- Consumes: `HydratedRow` from `@/lib/discovery/types`; `buildEnrichedRow`, `deriveFulfillment`, `EnrichedRow`, `CURVE_VERSION` from `@/lib/keepa/enrichedRow`
- Produces: `POST /api/discovery/hydrate` with body `{ asins: string[] }` returning `{ success: true, rows: HydratedRow[] }`

**⚠️ Shared-cache hazard — read before writing any code.** `keepa_lens_metrics` is
NOT Discovery's private table. `/api/extension/enrich` stores `payload` **as an
`EnrichedRow`** and reads `payload.curveVersion` to decide cache validity (see that
route, lines 129-132). Its primary key is `asin`. If Discovery upserts a differently
shaped payload for the same ASIN it **silently destroys BloomLens's cache entry**,
forcing the extension to re-pay Keepa tokens for data it already had.

Both systems therefore store the SAME `EnrichedRow` shape, and a new `fetch_depth`
column records how deeply each row was fetched:

- Discovery fetches lean (1 token, no buybox/offers) and writes `fetch_depth='lean'`.
  It accepts a row of **either** depth on read — a fuller row is strictly better.
- BloomLens fetches full (6 tokens) and must accept **only** `fetch_depth='full'`,
  so it never serves buybox-less data into the extension drawer.

Net effect: BloomLens's full rows warm Discovery's cache for free, and Discovery's
lean rows never degrade the extension.

**Context:** Sales and revenue come from `buildEnrichedRow(product, opts?)` in `@/lib/keepa/enrichedRow` — the app's single calibrated calculator (BSR curve + per-category band multipliers + Buy Box price preference). Its `EnrichedRow` output already includes `parentMonthlyUnits` and `parentMonthlyRevenue`, derived from the product's own BSR, so the parent-level columns cost nothing extra. `deriveFulfillment(product)` returns `'AMZ' | 'FBA' | 'FBM' | null`.

Reads and writes `public.keepa_lens_metrics` (`asin` PK, `payload` JSONB, `data_quality`, `computed_at`, `cache_until`). Writes require the service-role key — the table has RLS enabled with no policies. Follow `src/app/api/extension/enrich/route.ts` for the existing cache read/write pattern.

- [ ] **Step 1: Add the fetch_depth column**

Create `supabase/migrations/20260909000000_add_fetch_depth_to_keepa_lens_metrics.sql`:

```sql
-- keepa_lens_metrics is shared between Bloom Lens (/api/extension/enrich) and
-- Discovery (/api/discovery/hydrate). They fetch at different depths:
--   full = stats+history+rating+buybox+offers (6 tokens/ASIN) -- Bloom Lens
--   lean = stats+history+aplus                (1 token/ASIN)  -- Discovery
--
-- A lean row is missing Buy Box price and offer data, so buildEnrichedRow falls
-- back to the New price. That is fine for a Discovery results grid but would be
-- a silent quality regression in the Lens drawer. This column lets each consumer
-- require the depth it needs while still sharing every row it can use.
--
-- Default 'full': every row that exists today was written by Bloom Lens.
ALTER TABLE public.keepa_lens_metrics
  ADD COLUMN IF NOT EXISTS fetch_depth TEXT NOT NULL DEFAULT 'full'
  CHECK (fetch_depth IN ('lean', 'full'));

COMMENT ON COLUMN public.keepa_lens_metrics.fetch_depth IS
  'How deeply this row was fetched. lean = Discovery (1 token, no buybox/offers); full = Bloom Lens (6 tokens). Consumers requiring buybox data must filter to full.';
```

Apply it with the Supabase MCP `apply_migration` tool, then confirm:

```sql
SELECT column_name, column_default FROM information_schema.columns
WHERE table_name = 'keepa_lens_metrics' AND column_name = 'fetch_depth';
```

Expected: one row, default `'full'::text`.

- [ ] **Step 2: Make Bloom Lens require full-depth rows**

In `src/app/api/extension/enrich/route.ts`, add `fetch_depth` to the select list:

```ts
      .select('asin, payload, data_quality, cache_until, fetch_depth')
```

and tighten the cache-hit condition so a lean Discovery row is treated as a miss:

```ts
      const versionMatch = payload?.curveVersion === CURVE_VERSION;
      // Discovery writes lean rows (no buybox/offers). They are fine for a
      // results grid but must never reach the Lens drawer as if they were full.
      const depthOk = (row as any)?.fetch_depth !== 'lean';
      if (fresh && versionMatch && depthOk) {
```

- [ ] **Step 3: Implement the route**

`src/app/api/discovery/hydrate/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { buildEnrichedRow, deriveFulfillment, CURVE_VERSION } from '@/lib/keepa/enrichedRow';
import type { EnrichedRow } from '@/lib/keepa/enrichedRow';
import type { HydratedRow } from '@/lib/discovery/types';

const KEEPA_BASE_URL = 'https://api.keepa.com';

/** One visible page. Keeps a page of browsing at ~25 tokens. */
const MAX_ASINS_PER_REQUEST = 50;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function toRow(product: any): HydratedRow {
  // buildEnrichedRow is the app's single calculator for sales/revenue. It
  // applies the corpus-calibrated BSR curve and per-category band multipliers,
  // prefers Buy Box price over New, and derives parent-level units from the
  // product's own BSR — so Parent Sales/Revenue cost no extra tokens.
  //
  // Do NOT read product.monthlySold directly here. That is Amazon's "X+ bought
  // in past month" bucket: it is a ROUND number and displaying it violates the
  // rule that calculated metrics must be smooth and BSR-curve driven. Keepa's
  // bucket is an input to the curve, never a display value.
  //
  // No `siblings` are passed: fetching every sibling would cost several tokens
  // per row. buildEnrichedRow falls back to an equal split across
  // min(variationCount, 5) for the child figure, which is the documented
  // behaviour when siblings are unavailable.
  const enriched = buildEnrichedRow(product);
  return enrichedToHydrated(product?.asin ?? '', enriched, product);
}

/**
 * Project an EnrichedRow (the shape stored in the shared cache) onto the
 * display-unit HydratedRow the Discovery grid renders. `product` is only
 * available on a fresh fetch; on a cache hit we render without it.
 */
function enrichedToHydrated(asin: string, enriched: EnrichedRow, product?: any): HydratedRow {
  return {
    asin,
    title: product?.title ?? null,
    brand: enriched.brand,
    imageUrl: enriched.imageUrl,
    category: enriched.rootCategory,
    bsr: enriched.bsr,
    // EnrichedRow.price is in CENTS; HydratedRow is in display units.
    price: enriched.price === null ? null : enriched.price / 100,
    rating: enriched.rating,
    reviews: enriched.reviews,
    monthlyUnits: enriched.monthlyUnits,
    monthlyRevenue: enriched.monthlyRevenue,
    parentUnits: enriched.parentMonthlyUnits,
    parentRevenue: enriched.parentMonthlyRevenue,
    isFba: product ? deriveFulfillment(product) === 'FBA' : null,
    lqs: null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requested: string[] = Array.isArray(body?.asins) ? body.asins.slice(0, MAX_ASINS_PER_REQUEST) : [];
    if (requested.length === 0) {
      return NextResponse.json({ success: true, rows: [] });
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const supabase = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } },
        )
      : createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    // The cache is a system table with RLS and no policies — service role only.
    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: cached } = await admin
      .from('keepa_lens_metrics')
      .select('asin, payload')
      .in('asin', requested)
      .gt('cache_until', new Date().toISOString());

    // Accept BOTH depths: a Bloom Lens 'full' row is strictly better than the
    // lean one we would fetch. Only the curve version has to match.
    const byAsin = new Map<string, HydratedRow>();
    for (const row of cached ?? []) {
      const payload = (row as any).payload as EnrichedRow | undefined;
      if (payload?.curveVersion === CURVE_VERSION) {
        byAsin.set((row as any).asin, enrichedToHydrated((row as any).asin, payload));
      }
    }

    const misses = requested.filter((a) => !byAsin.has(a));

    if (misses.length > 0) {
      const apiKey = process.env.KEEPA_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ success: false, error: 'Lookup is unavailable.' }, { status: 500 });
      }

      // stats=180&history=1&aplus=1 costs exactly 1 token per ASIN. Adding
      // rating=1 doubles it and buybox+offers takes it to 6 — never add them here.
      const url =
        `${KEEPA_BASE_URL}/product?key=${apiKey}&domain=1` +
        `&asin=${misses.join(',')}&stats=180&history=1&aplus=1`;

      const res = await fetch(url);
      const data = await res.json();

      if (data?.error) {
        console.error('[discovery/hydrate] provider error', data.error);
        return NextResponse.json({ success: false, error: 'Product lookup failed.' }, { status: 502 });
      }

      const cacheUntil = new Date(Date.now() + CACHE_TTL_MS).toISOString();
      const upserts: any[] = [];
      const enrichedByAsin = new Map<string, EnrichedRow>();

      for (const product of data?.products ?? []) {
        if (!product?.asin) continue;
        enrichedByAsin.set(product.asin, buildEnrichedRow(product));
        const row = toRow(product);
        if (!row.asin) continue;
        byAsin.set(row.asin, row);
        upserts.push({
          asin: row.asin,
          // Same shape Bloom Lens stores — see the shared-cache hazard above.
          payload: enrichedByAsin.get(row.asin),
          data_quality: row.bsr === null ? 'limited' : 'full',
          fetch_depth: 'lean',
          computed_at: new Date().toISOString(),
          cache_until: cacheUntil,
        });
      }

      if (upserts.length > 0) {
        const { error: upsertError } = await admin
          .from('keepa_lens_metrics')
          .upsert(upserts, { onConflict: 'asin' });
        if (upsertError) console.error('[discovery/hydrate] cache write failed', upsertError);
      }
    }

    // Preserve the caller's ordering — it is the sorted search order.
    const rows = requested.map((a) => byAsin.get(a)).filter(Boolean) as HydratedRow[];
    return NextResponse.json({ success: true, rows });
  } catch (err) {
    console.error('[discovery/hydrate] unexpected', err);
    return NextResponse.json({ success: false, error: 'Product lookup failed.' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify hydration and caching**

In the browser console, logged in:

```js
const body = JSON.stringify({ asins: ['B07R7XSNZ1','B0012F5G0Q','B07QN8SDB9'] });
console.time('cold'); await (await fetch('/api/discovery/hydrate',{method:'POST',headers:{'Content-Type':'application/json'},body})).json(); console.timeEnd('cold');
console.time('warm'); const r = await (await fetch('/api/discovery/hydrate',{method:'POST',headers:{'Content-Type':'application/json'},body})).json(); console.timeEnd('warm');
r.rows
```

Expected: `rows` has 3 entries with `title`, `price`, `bsr`, `reviews`, `monthlyUnits`, `parentUnits` populated. The second call is markedly faster (cache hit) and consumes no Keepa tokens.

**Check the numbers are not round.** `monthlyUnits` values like `300`, `500`, `1000` across every row mean the bucket is being displayed instead of the BSR curve — `buildEnrichedRow` is not being used correctly. Real curve output is smooth (e.g. `287`, `412`).

- [ ] **Step 5: Confirm the cache was written**

Run the existing Supabase MCP or SQL console:

```sql
SELECT asin, data_quality, fetch_depth, cache_until FROM keepa_lens_metrics
WHERE asin IN ('B07R7XSNZ1','B0012F5G0Q','B07QN8SDB9');
```

Expected: 3 rows, `fetch_depth = 'lean'`, `cache_until` roughly 24h in the future.

- [ ] **Step 6: Confirm Bloom Lens still refetches lean rows**

The extension must not serve a lean row. With the three ASINs above cached lean,
call the enrich route the extension uses and confirm those ASINs are treated as
cache misses (the route logs `toFetch`), not hits.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/discovery/hydrate/route.ts
git commit -m "feat(discovery): cache-first hydrate route at 1 token per ASIN"
```

---

### Task 8: Discovery page — filter grid and results

**Files:**
- Create: `src/app/discovery/page.tsx`
- Create: `src/components/Discovery/DiscoveryContent.tsx`
- Create: `src/components/Discovery/FilterGrid.tsx`
- Create: `src/components/Discovery/ResultsTable.tsx`

**Interfaces:**
- Consumes: `FILTER_DEFS` from `@/lib/discovery/filterSchema`; `DiscoveryFilters`, `HydratedRow`, `RangeValue` from `@/lib/discovery/types`; both API routes from Tasks 6-7.
- Produces: `<FilterGrid filters onChange onSearch searching />`, `<ResultsTable rows loading />`

- [ ] **Step 1: Create the route shell**

`src/app/discovery/page.tsx`:

```tsx
'use client';

import MainTemplate from '@/components/MainTemplate';
import { DiscoveryContent } from '@/components/Discovery/DiscoveryContent';

export default function DiscoveryPage() {
  return (
    <MainTemplate>
      <DiscoveryContent />
    </MainTemplate>
  );
}
```

- [ ] **Step 2: Create the filter grid**

`src/components/Discovery/FilterGrid.tsx`:

```tsx
'use client';

import { Search } from 'lucide-react';
import { FILTER_DEFS } from '@/lib/discovery/filterSchema';
import type { DiscoveryFilters, FilterGroup, RangeValue } from '@/lib/discovery/types';

interface FilterGridProps {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
  onSearch: () => void;
  searching: boolean;
}

const GROUPS: { key: FilterGroup; title: string }[] = [
  { key: 'product', title: 'Product' },
  { key: 'competitors', title: 'Competitors' },
  { key: 'sales', title: 'Sales' },
];

export function FilterGrid({ filters, onChange, onSearch, searching }: FilterGridProps) {
  const setValue = (id: string, value: DiscoveryFilters[string] | undefined) => {
    const next = { ...filters };
    if (value === undefined) delete next[id];
    else next[id] = value;
    onChange(next);
  };

  const setBound = (id: string, bound: 'min' | 'max', raw: string) => {
    const existing = (filters[id] as RangeValue | undefined) ?? {};
    const next: RangeValue = { ...existing };
    if (raw === '') delete next[bound];
    else next[bound] = Number(raw);
    setValue(id, Object.keys(next).length ? next : undefined);
  };

  return (
    <div className="bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 rounded-2xl p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {GROUPS.map((group) => (
          <div key={group.key}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{group.title}</h3>
            <div className="space-y-4">
              {FILTER_DEFS.filter((f) => f.group === group.key && f.kind !== 'category').map((def) => (
                <div key={def.id}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    {def.label}
                  </label>

                  {def.kind === 'range' && (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Min"
                        aria-label={`${def.label} minimum`}
                        value={(filters[def.id] as RangeValue | undefined)?.min ?? ''}
                        onChange={(e) => setBound(def.id, 'min', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        aria-label={`${def.label} maximum`}
                        value={(filters[def.id] as RangeValue | undefined)?.max ?? ''}
                        onChange={(e) => setBound(def.id, 'max', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                      />
                    </div>
                  )}

                  {def.kind === 'text' && (
                    <input
                      type="text"
                      placeholder="Ex: bead loom"
                      value={(filters[def.id] as string) ?? ''}
                      onChange={(e) => setValue(def.id, e.target.value || undefined)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                    />
                  )}

                  {def.kind === 'textList' && (
                    <input
                      type="text"
                      placeholder="Comma separated"
                      value={((filters[def.id] as string[]) ?? []).join(', ')}
                      onChange={(e) => {
                        const list = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                        setValue(def.id, list.length ? list : undefined);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                    />
                  )}

                  {def.kind === 'boolean' && (
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={filters[def.id] === true}
                        onChange={(e) => setValue(def.id, e.target.checked ? true : undefined)}
                      />
                      <span>Only show {def.label}</span>
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={() => onChange({})}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-sm font-medium"
        >
          Clear
        </button>
        <button
          onClick={onSearch}
          disabled={searching}
          className="flex items-center gap-2 px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold"
        >
          <Search className="w-4 h-4" />
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the results table**

`src/components/Discovery/ResultsTable.tsx`:

```tsx
'use client';

import { Loader2 } from 'lucide-react';
import type { HydratedRow } from '@/lib/discovery/types';

interface ResultsTableProps {
  rows: HydratedRow[];
  loading: boolean;
}

const money = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const num = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-US'));

export function ResultsTable({ rows, loading }: ResultsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 dark:text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading products…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-gray-500 dark:text-slate-400">
        No products matched those filters. Try widening your price or BSR range.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-600 dark:text-slate-400 border-b border-gray-200 dark:border-slate-700">
            <th className="py-3 pr-4 font-medium">Product</th>
            <th className="py-3 px-4 font-medium">Category BSR</th>
            <th className="py-3 px-4 font-medium">Price</th>
            <th className="py-3 px-4 font-medium">Parent Sales</th>
            <th className="py-3 px-4 font-medium">ASIN Sales</th>
            <th className="py-3 px-4 font-medium">Parent Revenue</th>
            <th className="py-3 px-4 font-medium">ASIN Revenue</th>
            <th className="py-3 px-4 font-medium">Reviews</th>
            <th className="py-3 px-4 font-medium">Rating</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.asin} className="border-b border-gray-100 dark:border-slate-800">
              <td className="py-3 pr-4">
                <div className="flex items-center gap-3">
                  {row.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={row.imageUrl} alt="" className="w-10 h-10 object-contain rounded" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate max-w-xs text-gray-900 dark:text-white">{row.title ?? row.asin}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {row.asin}
                      {row.isFba === true ? ' · FBA' : row.isFba === false ? ' · FBM' : ''}
                    </p>
                  </div>
                </div>
              </td>
              <td className="py-3 px-4">{num(row.bsr)}</td>
              <td className="py-3 px-4">{money(row.price)}</td>
              <td className="py-3 px-4">{num(row.parentUnits)}</td>
              <td className="py-3 px-4">{num(row.monthlyUnits)}</td>
              <td className="py-3 px-4">{money(row.parentRevenue)}</td>
              <td className="py-3 px-4">{money(row.monthlyRevenue)}</td>
              <td className="py-3 px-4">{num(row.reviews)}</td>
              <td className="py-3 px-4">{row.rating === null ? '—' : row.rating.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Create the orchestrating container**

`src/components/Discovery/DiscoveryContent.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { FilterGrid } from './FilterGrid';
import { ResultsTable } from './ResultsTable';
import type { DiscoveryFilters, HydratedRow } from '@/lib/discovery/types';

const PAGE_SIZE = 25;

async function authedPost(path: string, body: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function DiscoveryContent() {
  const [filters, setFilters] = useState<DiscoveryFilters>({});
  const [asins, setAsins] = useState<string[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<HydratedRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    setSearching(true);
    setError(null);
    setRows([]);
    setPage(0);
    try {
      const data = await authedPost('/api/discovery/search', { filters });
      if (!data?.success) throw new Error(data?.error || 'Search failed.');
      setAsins(data.asins);
      setTotalResults(data.totalResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
      setAsins([]);
      setTotalResults(0);
    } finally {
      setSearching(false);
    }
  }, [filters]);

  // Hydrate only the visible page — this is where the tokens are spent.
  useEffect(() => {
    const slice = asins.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    if (slice.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setHydrating(true);
    authedPost('/api/discovery/hydrate', { asins: slice })
      .then((data) => {
        if (cancelled) return;
        if (data?.success) setRows(data.rows);
        else setError(data?.error || 'Product lookup failed.');
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asins, page]);

  const lastPage = Math.max(0, Math.ceil(asins.length / PAGE_SIZE) - 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Discovery</h1>
        <p className="text-gray-600 dark:text-slate-400 mt-1">
          Find product opportunities, then send the promising ones to your funnel.
        </p>
      </div>

      <FilterGrid filters={filters} onChange={setFilters} onSearch={runSearch} searching={searching} />

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {asins.length > 0 && (
        <div className="bg-white dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Viewing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, asins.length)} of{' '}
              {asins.length.toLocaleString('en-US')} loaded
              {totalResults > asins.length && (
                <> · {totalResults.toLocaleString('en-US')} total matches — narrow your filters to see more of them</>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded-lg border border-gray-300 dark:border-slate-600 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page >= lastPage}
                className="px-3 py-1 rounded-lg border border-gray-300 dark:border-slate-600 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
          <ResultsTable rows={rows} loading={hydrating} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify end to end**

Run `npm run dev`, go to `http://localhost:3000/discovery`. Enter BSR max `50000`, Price min `20`, max `70`, Review Count max `1000`. Click Search.

Expected: a result count appears, then 25 rows render with titles, prices, BSR and reviews. Clicking Next loads the following 25. Clicking Previous returns instantly with no new network call to `/hydrate` visible in the Network tab (cache hit).

- [ ] **Step 6: Commit**

```bash
git add src/app/discovery src/components/Discovery
git commit -m "feat(discovery): filter grid, results table and paged hydration"
```

---

# PHASE 7.3 — Results Depth

### Task 9: Derived filters

**Files:**
- Create: `src/lib/discovery/derivedFilters.ts`
- Test: `src/lib/discovery/derivedFilters.test.ts`

**Interfaces:**
- Consumes: `HydratedRow` from `./types`
- Produces:
  - `interface DerivedFilterInput { revenueMin?, revenueMax?, priceMin?, priceMax?, salesToReviewsMin?, salesToReviewsMax?, excludeBrands?, excludeTitleKeywords? }`
  - `function impliedUnitBounds(input: DerivedFilterInput): { min?: number; max?: number }`
  - `function applyDerivedFilters(rows: HydratedRow[], input: DerivedFilterInput): HydratedRow[]`

- [ ] **Step 1: Write the failing test**

`src/lib/discovery/derivedFilters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyDerivedFilters, impliedUnitBounds } from './derivedFilters';
import type { HydratedRow } from './types';

const row = (over: Partial<HydratedRow>): HydratedRow => ({
  asin: 'A', title: 'Bead Loom Kit', brand: 'Darice', imageUrl: null, category: null,
  bsr: 1000, price: 30, rating: 4.2, reviews: 100, monthlyUnits: 200,
  monthlyRevenue: 6000, parentUnits: null, parentRevenue: null, isFba: true, lqs: null,
  ...over,
});

describe('impliedUnitBounds', () => {
  it('derives a unit floor from a revenue floor and the max price', () => {
    // $5000/mo at no more than $70 each requires at least ceil(5000/70) = 72 units.
    expect(impliedUnitBounds({ revenueMin: 5000, priceMax: 70 }).min).toBe(72);
  });

  it('derives a unit ceiling from a revenue ceiling and the min price', () => {
    expect(impliedUnitBounds({ revenueMax: 15000, priceMin: 20 }).max).toBe(750);
  });

  it('returns no floor when there is no price ceiling to divide by', () => {
    expect(impliedUnitBounds({ revenueMin: 5000 }).min).toBeUndefined();
  });

  it('never excludes a row that passes the exact revenue test', () => {
    // Property check: for every (price, units) inside the price window,
    // passing exact revenue implies passing the implied unit bound.
    const input = { revenueMin: 5000, revenueMax: 15000, priceMin: 20, priceMax: 70 };
    const bounds = impliedUnitBounds(input);
    for (let price = 20; price <= 70; price += 1) {
      for (let units = 1; units <= 1200; units += 1) {
        const revenue = price * units;
        const passesExact = revenue >= 5000 && revenue <= 15000;
        if (!passesExact) continue;
        expect(units).toBeGreaterThanOrEqual(bounds.min!);
        expect(units).toBeLessThanOrEqual(bounds.max!);
      }
    }
  });
});

describe('applyDerivedFilters', () => {
  it('keeps rows inside the revenue window', () => {
    const rows = [row({ asin: 'IN', monthlyRevenue: 8000 }), row({ asin: 'OUT', monthlyRevenue: 500 })];
    const kept = applyDerivedFilters(rows, { revenueMin: 5000, revenueMax: 15000 });
    expect(kept.map((r) => r.asin)).toEqual(['IN']);
  });

  it('excludes brands case-insensitively', () => {
    const rows = [row({ asin: 'KEEP', brand: 'Other' }), row({ asin: 'DROP', brand: 'Darice' })];
    expect(applyDerivedFilters(rows, { excludeBrands: ['darice'] }).map((r) => r.asin)).toEqual(['KEEP']);
  });

  it('excludes title keywords case-insensitively', () => {
    const rows = [row({ asin: 'KEEP', title: 'Pottery Wheel' }), row({ asin: 'DROP', title: 'Bead Loom Kit' })];
    expect(applyDerivedFilters(rows, { excludeTitleKeywords: ['BEAD'] }).map((r) => r.asin)).toEqual(['KEEP']);
  });

  it('filters on sales-to-reviews ratio', () => {
    const rows = [
      row({ asin: 'HIGH', monthlyUnits: 200, reviews: 10 }), // ratio 20
      row({ asin: 'LOW', monthlyUnits: 10, reviews: 100 }),  // ratio 0.1
    ];
    expect(applyDerivedFilters(rows, { salesToReviewsMin: 5 }).map((r) => r.asin)).toEqual(['HIGH']);
  });

  it('keeps rows with missing data rather than silently dropping them', () => {
    // Consistent with the no-band-aids rule: absent data is not a failed test.
    const rows = [row({ asin: 'NULLREV', monthlyRevenue: null })];
    expect(applyDerivedFilters(rows, { revenueMin: 5000 }).map((r) => r.asin)).toEqual(['NULLREV']);
  });

  it('returns every row when no derived filter is set', () => {
    const rows = [row({ asin: 'A' }), row({ asin: 'B' })];
    expect(applyDerivedFilters(rows, {})).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- derivedFilters`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/discovery/derivedFilters.ts`:

```ts
import type { HydratedRow } from './types';

/**
 * Filters Keepa cannot run natively. Revenue is the important one: Keepa has
 * no revenue field, but revenue = price x units and BOTH are filterable, so a
 * revenue window plus a price window implies a unit window we CAN push
 * server-side. The implied window is deliberately wider than the true result
 * set — it is a superset, never a filter that hides valid products.
 */
export interface DerivedFilterInput {
  /** Dollars per month. */
  revenueMin?: number;
  revenueMax?: number;
  /** Dollars. Needed for the implied-bounds trick to be useful. */
  priceMin?: number;
  priceMax?: number;
  salesToReviewsMin?: number;
  salesToReviewsMax?: number;
  excludeBrands?: string[];
  excludeTitleKeywords?: string[];
}

export function impliedUnitBounds(input: DerivedFilterInput): { min?: number; max?: number } {
  const bounds: { min?: number; max?: number } = {};

  // Cheapest possible price => most units needed to clear the revenue floor.
  // We divide by the MAX price to get the LOWEST unit count that could
  // possibly reach revenueMin, so we never exclude a valid row.
  if (input.revenueMin !== undefined && input.priceMax) {
    bounds.min = Math.ceil(input.revenueMin / input.priceMax);
  }
  if (input.revenueMax !== undefined && input.priceMin) {
    bounds.max = Math.floor(input.revenueMax / input.priceMin);
  }
  return bounds;
}

export function applyDerivedFilters(rows: HydratedRow[], input: DerivedFilterInput): HydratedRow[] {
  const excludeBrands = (input.excludeBrands ?? []).map((b) => b.toLowerCase());
  const excludeKeywords = (input.excludeTitleKeywords ?? []).map((k) => k.toLowerCase());

  return rows.filter((row) => {
    // Missing data is not a failed test — show what the data source returned
    // rather than silently dropping rows for being incomplete.
    if (row.monthlyRevenue !== null) {
      if (input.revenueMin !== undefined && row.monthlyRevenue < input.revenueMin) return false;
      if (input.revenueMax !== undefined && row.monthlyRevenue > input.revenueMax) return false;
    }

    if (row.monthlyUnits !== null && row.reviews !== null && row.reviews > 0) {
      const ratio = row.monthlyUnits / row.reviews;
      if (input.salesToReviewsMin !== undefined && ratio < input.salesToReviewsMin) return false;
      if (input.salesToReviewsMax !== undefined && ratio > input.salesToReviewsMax) return false;
    }

    if (excludeBrands.length && row.brand && excludeBrands.includes(row.brand.toLowerCase())) return false;

    if (excludeKeywords.length && row.title) {
      const title = row.title.toLowerCase();
      if (excludeKeywords.some((k) => title.includes(k))) return false;
    }

    return true;
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- derivedFilters`
Expected: PASS, all tests including the property check.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/derivedFilters.ts src/lib/discovery/derivedFilters.test.ts
git commit -m "feat(discovery): derived revenue/ratio/exclusion filters"
```

---

### Task 10: Wire derived filters and sorting into the UI

**Files:**
- Modify: `src/components/Discovery/DiscoveryContent.tsx`
- Modify: `src/components/Discovery/ResultsTable.tsx`
- Modify: `src/app/api/discovery/search/route.ts`

**Interfaces:**
- Consumes: `impliedUnitBounds`, `applyDerivedFilters`, `DerivedFilterInput` from `@/lib/discovery/derivedFilters`
- Produces: search accepts `derived` in its body and folds implied bounds into `monthlyUnits`; `ResultsTable` accepts `sortId`, `sortDir`, `onSort`.

- [ ] **Step 1: Do NOT push implied unit bounds — wire revenue client-side only**

**This step reverses what the spec originally called for. Read why before coding.**

The spec's design pushed an implied unit bound to the provider so a revenue
filter could narrow the catalog server-side. That is unsafe and must not be
built. The implied bound would be applied to the provider's `monthlySold`
field — Amazon's rounded "X+ bought in past month" **bucket** — while the exact
revenue test runs against our **BSR-curve-derived** `monthlyUnits`
(`enrichedRow.ts` sets `unitsSource` to `'weighted-sibling' | 'bsr-curve' |
'bucket-fallback'`). Those are two different measurements of the same quantity.
A bound computed from one and applied to the other can exclude products that
genuinely match the user's revenue filter — silently, with no error and nothing
to alert anyone. That is the one failure this design exists to prevent, and it
violates the project rule against synthetic gates that hide rows.

No widening factor is available that isn't invented, so there is none.

**Therefore:** the search route is NOT modified in this task. Do not import
`impliedUnitBounds` into it. Do not add a `derived` field to its request body.
`impliedUnitBounds()` stays in `derivedFilters.ts` — it is correct over integers
and covered by tests — but it stays UNWIRED.

Add this comment above `impliedUnitBounds` in `src/lib/discovery/derivedFilters.ts`
so the next reader does not re-wire it by mistake:

```ts
/**
 * NOT CURRENTLY WIRED, deliberately.
 *
 * These bounds would be pushed to the provider's `monthlySold` field, which is
 * Amazon's rounded "X+ bought in past month" bucket. Our exact revenue test runs
 * against BSR-curve-derived units instead (see enrichedRow.ts `unitsSource`).
 * Those are different measurements, so a bound derived from one and applied to
 * the other can silently EXCLUDE products that genuinely match the revenue
 * filter — the one failure mode this whole design is meant to prevent.
 *
 * Re-wire only once the divergence between the bucket field and the curve has
 * been measured, and only with a widening margin justified by that measurement.
 */
```

Revenue is therefore applied exactly like the other derived filters: to the rows
already hydrated for the visible page, via `applyDerivedFilters`. This makes a
revenue search return sparser pages, which is correct-but-fewer rather than
fast-but-silently-wrong.

- [ ] **Step 2: Add sorting props to ResultsTable**

In `src/components/Discovery/ResultsTable.tsx`, replace the `ResultsTableProps` interface and the `<thead>` block:

```tsx
interface ResultsTableProps {
  rows: HydratedRow[];
  loading: boolean;
  sortId: string | null;
  sortDir: 'asc' | 'desc';
  onSort: (filterId: string) => void;
}

/** Columns Keepa can sort server-side, keyed by filter id. */
const SORTABLE: Record<string, string> = {
  bsr: 'Category BSR',
  price: 'Price',
  monthlyUnits: 'ASIN Sales',
  reviewCount: 'Reviews',
  rating: 'Rating',
};
```

Replace the `<thead>` element with:

```tsx
        <thead>
          <tr className="text-left text-gray-600 dark:text-slate-400 border-b border-gray-200 dark:border-slate-700">
            <th className="py-3 pr-4 font-medium">Product</th>
            {(['bsr', 'price'] as const).map((id) => (
              <th key={id} className="py-3 px-4 font-medium">
                <button onClick={() => onSort(id)} className="hover:text-blue-500">
                  {SORTABLE[id]}{sortId === id ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
            ))}
            <th className="py-3 px-4 font-medium">
              Parent Sales
              <span className="ml-1 text-xs text-gray-400" title="Calculated from the sales-rank curve, so it sorts within the loaded page only.">ⓘ</span>
            </th>
            <th className="py-3 px-4 font-medium">
              <button onClick={() => onSort('monthlyUnits')} className="hover:text-blue-500">
                ASIN Sales{sortId === 'monthlyUnits' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </button>
            </th>
            <th className="py-3 px-4 font-medium">
              Parent Revenue
              <span className="ml-1 text-xs text-gray-400" title="Calculated, so it sorts within the loaded page only.">ⓘ</span>
            </th>
            <th className="py-3 px-4 font-medium">
              ASIN Revenue
              <span className="ml-1 text-xs text-gray-400" title="Revenue is calculated, so it sorts within the loaded page only.">ⓘ</span>
            </th>
            {(['reviewCount', 'rating'] as const).map((id) => (
              <th key={id} className="py-3 px-4 font-medium">
                <button onClick={() => onSort(id)} className="hover:text-blue-500">
                  {SORTABLE[id]}{sortId === id ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
```

Confirm the `<td>` cells in the body follow the header order: Product, BSR, Price, Parent Sales, ASIN Sales, Parent Revenue, ASIN Revenue, Reviews, Rating.

- [ ] **Step 3: Track sort state and derived filters in DiscoveryContent**

In `src/components/Discovery/DiscoveryContent.tsx`, add the import:

```tsx
import { applyDerivedFilters, type DerivedFilterInput } from '@/lib/discovery/derivedFilters';
```

Add state beside the existing `useState` calls:

```tsx
  const [derived, setDerived] = useState<DerivedFilterInput>({});
  const [sortId, setSortId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
```

Change the body of the `authedPost('/api/discovery/search', ...)` call to:

```tsx
      const data = await authedPost('/api/discovery/search', {
        filters,
        derived,
        sort: sortId ? [sortId, sortDir] : undefined,
      });
```

and add `derived`, `sortId`, `sortDir` to `runSearch`'s dependency array.

Add the sort handler below `runSearch`:

```tsx
  // Sorting is server-side: it re-runs the query and resets to page 1.
  const handleSort = (filterId: string) => {
    if (sortId === filterId) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortId(filterId);
      setSortDir('asc');
    }
  };

  useEffect(() => {
    if (sortId) void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortId, sortDir]);
```

Replace the `<ResultsTable ... />` usage with:

```tsx
          <ResultsTable
            rows={applyDerivedFilters(rows, derived)}
            loading={hydrating}
            sortId={sortId}
            sortDir={sortDir}
            onSort={handleSort}
          />
```

- [ ] **Step 4: Verify**

Run `npm run dev`, go to `/discovery`, search with Price 20–70 and BSR max 50000. Click the "Price" header.

Expected: results re-sort ascending by price, page resets to the first page, and clicking again flips to descending. Revenue's header is not clickable and shows the ⓘ hint.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors in `src/components/Discovery` or `src/app/api/discovery`.

```bash
git add src/components/Discovery src/app/api/discovery/search/route.ts
git commit -m "feat(discovery): server-side sorting and derived revenue filters"
```

---

### Task 11: LQS column

**Files:**
- Modify: `src/app/api/discovery/hydrate/route.ts`
- Modify: `src/components/Discovery/ResultsTable.tsx`

**Interfaces:**
- Consumes: `computeLqsFromKeepaProduct(product: any): LqsResult | null` from `@/lib/keepa/listingQualityScore` (returns `{ score: number; details: {...} }` or `null` when the listing is too sparse to score); `HydratedRow.lqs` from Task 4.
- Produces: `HydratedRow.lqs` populated.

**Context — already resolved, do not re-litigate.** The docstring in `listingQualityScore.ts` says `&rating=1&aplus=1` are required. That is **wrong about `rating`**: the function reads the current rating and review count from `stats.current[16]` and `stats.current[17]` (see lines 60-61), both of which `stats=180` already returns. Only A+ content needs `aplus=1`, which costs nothing. **LQS is therefore free at 1 token/ASIN — keep it always-on and do NOT add `rating=1` to the hydrate call.**

- [ ] **Step 1: Correct the misleading docstring**

In `src/lib/keepa/listingQualityScore.ts`, change the line reading:

```
 * exclusively from the Keepa /product response (with &rating=1&aplus=1
 * required for the rating + A+ checks).
```

to:

```
 * exclusively from the Keepa /product response. Only &aplus=1 is required
 * (and is free); the rating + review checks read stats.current[16] and [17],
 * which any &stats= call already returns. Do NOT add &rating=1 for this —
 * it doubles the per-ASIN token cost for data we already have.
```

- [ ] **Step 2: Populate lqs in the hydrate route**

In `src/app/api/discovery/hydrate/route.ts`, add the import:

```ts
import { computeLqsFromKeepaProduct } from '@/lib/keepa/listingQualityScore';
```

then inside `toRow`, replace `lqs: null,` with:

```ts
    lqs: computeLqsFromKeepaProduct(product)?.score ?? null,
```

- [ ] **Step 3: Add the column to ResultsTable**

Add a header cell after Rating:

```tsx
            <th className="py-3 px-4 font-medium">
              Listing Quality
              <span className="ml-1 text-xs text-gray-400" title="Scored out of 10 from images, title, bullets, A+ content, rating and reviews. Sorts within the loaded page only.">ⓘ</span>
            </th>
```

and a matching body cell:

```tsx
              <td className="py-3 px-4">{row.lqs === null ? '—' : row.lqs.toFixed(1)}</td>
```

- [ ] **Step 4: Verify**

Reload `/discovery` and run a search. Expected: a Listing Quality column showing values between 0.0 and 10.0, with `—` for listings too sparse to score.

**Important:** clear the cache first, or already-cached rows will still have `lqs: null`:

```sql
DELETE FROM keepa_lens_metrics WHERE fetch_depth = 'lean';
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/discovery/hydrate/route.ts src/components/Discovery/ResultsTable.tsx
git commit -m "feat(discovery): listing quality score column"
```

---

# PHASE 7.4 — Categories, Presets, Save

### Task 12: Category tree picker

**Files:**
- Create: `src/app/api/discovery/categories/route.ts`
- Create: `src/components/Discovery/CategoryPicker.tsx`
- Modify: `src/components/Discovery/FilterGrid.tsx`

**Interfaces:**
- Consumes: `DiscoveryFilters` from `@/lib/discovery/types`
- Produces:
  - `GET /api/discovery/categories?parent=<id>` returning `{ success: true, categories: { id: string; name: string; hasChildren: boolean }[] }`
  - `<CategoryPicker selected={string[]} onChange={(ids: string[]) => void} />`

**Context:** Black Box lets you open a root category, expand it, select or deselect individual subcategories, and drill further. The tree is fetched lazily — one level per expand.

- [ ] **Step 1: Resolve the real root category ids first**

Do NOT hand-write Amazon browse-node ids from memory — they are easy to
transpose, and a wrong id silently searches the wrong category. Generate them:

```bash
cat > /tmp/roots.ts <<'EOF'
import * as fs from 'fs'; import * as path from 'path';
try { const t = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
const K = process.env.KEEPA_API_KEY!;
const NAMES = ['Arts, Crafts & Sewing','Automotive','Baby','Beauty & Personal Care',
  'Cell Phones & Accessories','Clothing, Shoes & Jewelry','Electronics',
  'Grocery & Gourmet Food','Health & Household','Home & Kitchen',
  'Industrial & Scientific','Musical Instruments','Office Products',
  'Patio, Lawn & Garden','Pet Supplies','Sports & Outdoors',
  'Tools & Home Improvement','Toys & Games'];
(async () => {
  for (const name of NAMES) {
    const url = `https://api.keepa.com/search?key=${K}&domain=1&type=category&term=${encodeURIComponent(name)}`;
    const d: any = await (await fetch(url)).json();
    const hit = Object.entries(d.categories ?? {})
      .find(([, v]: any) => v.parent === 0 && v.name === name);
    console.log(hit ? `  { id: '${hit[0]}', name: '${name}' },` : `  // UNRESOLVED: ${name}`);
  }
})();
EOF
npx tsx /tmp/roots.ts
```

Each root category is the one whose `parent` is `0`. Paste the printed lines
into the `ROOTS` array below, replacing the placeholder entries. Every id must
be unique — if two names resolve to the same id, one is wrong.

- [ ] **Step 2: Create the category route**

`src/app/api/discovery/categories/route.ts`. Replace the `ROOTS` contents with
the verified output from Step 1, then re-add the `avoid` strings shown here for
the four categories Module 02.3 warns new sellers away from:

```ts
import { NextRequest, NextResponse } from 'next/server';

const KEEPA_BASE_URL = 'https://api.keepa.com';

/**
 * US root categories, ids resolved from the provider's own category search
 * (see this task's Step 1) rather than hand-written.
 *
 * `avoid` carries the course's Module 02.3 guidance. It is a warning, not a
 * block — the provider silently ignores category exclusion, so it cannot be
 * enforced server-side even if we wanted to.
 */
const ROOTS: { id: string; name: string; avoid?: string }[] = [
  // <-- paste verified ids from Step 1 here
];

const AVOID_NOTES: Record<string, string> = {
  'Grocery & Gourmet Food': 'Edible products carry liability risk and are often gated.',
  'Beauty & Personal Care': 'Topical products carry liability risk for new sellers.',
  'Electronics': 'Electronics date quickly and carry high return rates.',
  'Cell Phones & Accessories': 'Accessory markets are trademark-heavy and often gated.',
};

export async function GET(request: NextRequest) {
  const parent = request.nextUrl.searchParams.get('parent');

  // No parent => the root list, served locally. Cheap and stable.
  if (!parent) {
    return NextResponse.json({
      success: true,
      categories: ROOTS.map((r) => ({
        id: r.id,
        name: r.name,
        hasChildren: true,
        avoid: AVOID_NOTES[r.name] ?? null,
      })),
    });
  }

  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'Categories unavailable.' }, { status: 500 });
  }

  const url = `${KEEPA_BASE_URL}/category?key=${apiKey}&domain=1&category=${encodeURIComponent(parent)}&parents=0`;
  const res = await fetch(url);
  const data = await res.json();

  if (data?.error) {
    console.error('[discovery/categories] provider error', data.error);
    return NextResponse.json({ success: false, error: 'Categories unavailable.' }, { status: 502 });
  }

  const node = data?.categories?.[parent];
  const childIds: number[] = node?.children ?? [];

  let categories: { id: string; name: string; hasChildren: boolean }[] = [];
  if (childIds.length > 0) {
    const childUrl =
      `${KEEPA_BASE_URL}/category?key=${apiKey}&domain=1` +
      `&category=${childIds.join(',')}&parents=0`;
    const childRes = await fetch(childUrl);
    const childData = await childRes.json();
    categories = Object.entries(childData?.categories ?? {}).map(([id, value]: [string, any]) => ({
      id,
      name: value?.name ?? id,
      hasChildren: Array.isArray(value?.children) && value.children.length > 0,
    }));
  }

  return NextResponse.json({ success: true, categories });
}
```

- [ ] **Step 2b: Verify every root id is unique and resolves**

```bash
curl -s localhost:3000/api/discovery/categories | python3 -c "
import json,sys
cats=json.load(sys.stdin)['categories']
ids=[c['id'] for c in cats]
assert len(set(ids))==len(ids), 'DUPLICATE root category ids: fix Step 1 output'
print(f'{len(ids)} unique roots OK')"
```

Expected: `18 unique roots OK`. A duplicate means a name resolved to the wrong node.

- [ ] **Step 2: Create the picker**

`src/components/Discovery/CategoryPicker.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, X } from 'lucide-react';

interface CategoryNode {
  id: string;
  name: string;
  hasChildren: boolean;
  avoid?: string | null;
}

interface CategoryPickerProps {
  selected: string[];
  onChange: (ids: string[]) => void;
}

const CACHE_KEY = 'discovery.categoryTree.v1';

function readCache(): Record<string, CategoryNode[]> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CategoryNode[]>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota — the tree just refetches next time */
  }
}

export function CategoryPicker({ selected, onChange }: CategoryPickerProps) {
  const [childrenByParent, setChildrenByParent] = useState<Record<string, CategoryNode[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const load = async (parent: string | null) => {
    const key = parent ?? 'root';
    const cache = readCache();
    if (cache[key]) {
      setChildrenByParent((p) => ({ ...p, [key]: cache[key] }));
      setNameById((p) => ({ ...p, ...Object.fromEntries(cache[key].map((c) => [c.id, c.name])) }));
      return;
    }
    setLoading(key);
    try {
      const res = await fetch(`/api/discovery/categories${parent ? `?parent=${parent}` : ''}`);
      const data = await res.json();
      if (data?.success) {
        setChildrenByParent((p) => ({ ...p, [key]: data.categories }));
        setNameById((p) => ({ ...p, ...Object.fromEntries(data.categories.map((c: CategoryNode) => [c.id, c.name])) }));
        writeCache({ ...cache, [key]: data.categories });
      }
    } finally {
      setLoading(null);
    }
  };

  useEffect(() => {
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        if (!childrenByParent[id]) void load(id);
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  const renderLevel = (parentKey: string, depth: number) => {
    const nodes = childrenByParent[parentKey] ?? [];
    return (
      <ul className={depth === 0 ? '' : 'ml-5 border-l border-gray-200 dark:border-slate-700 pl-2'}>
        {nodes.map((node) => (
          <li key={`${parentKey}-${node.id}`}>
            <div className="flex items-center gap-1 py-1">
              {node.hasChildren ? (
                <button onClick={() => toggleExpand(node.id)} aria-label={`Expand ${node.name}`}>
                  {expanded.has(node.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              ) : (
                <span className="w-4" />
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={selected.includes(node.id)} onChange={() => toggleSelect(node.id)} />
                <span className="text-gray-800 dark:text-slate-200">{node.name}</span>
              </label>
              {node.avoid && (
                <span title={node.avoid}>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                </span>
              )}
            </div>
            {expanded.has(node.id) && (
              loading === node.id
                ? <p className="ml-6 text-xs text-gray-500">Loading…</p>
                : renderLevel(node.id, depth + 1)
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selected.map((id) => (
            <span key={id} className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-800 text-white text-xs">
              {nameById[id] ?? id}
              <button onClick={() => toggleSelect(id)} aria-label={`Remove ${nameById[id] ?? id}`}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-300 dark:border-slate-600 p-3">
        {renderLevel('root', 0)}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount it in FilterGrid**

In `src/components/Discovery/FilterGrid.tsx`, add the import:

```tsx
import { CategoryPicker } from './CategoryPicker';
```

Then inside the `product` group, immediately before the `{FILTER_DEFS.filter(...)}` expression, add:

```tsx
              {group.key === 'product' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    Category &amp; Subcategory
                  </label>
                  <CategoryPicker
                    selected={(filters.category as string[]) ?? []}
                    onChange={(ids) => setValue('category', ids.length ? ids : undefined)}
                  />
                </div>
              )}
```

- [ ] **Step 4: Verify the drill-down**

Reload `/discovery`. Expected: a scrollable category list. Clicking the chevron beside "Patio, Lawn & Garden" expands its subcategories; those with children expand further. Checking a box adds a removable chip. Reloading the page loads the tree instantly from `localStorage`. Categories the course warns about show an amber triangle with a tooltip.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/discovery/categories src/components/Discovery/CategoryPicker.tsx src/components/Discovery/FilterGrid.tsx
git commit -m "feat(discovery): lazy drill-down category picker"
```

---

### Task 13: Course presets

**Files:**
- Create: `src/lib/discovery/presets.ts`
- Test: `src/lib/discovery/presets.test.ts`
- Modify: `src/components/Discovery/FilterGrid.tsx`

**Interfaces:**
- Consumes: `DiscoveryFilters` from `./types`; `DerivedFilterInput` from `./derivedFilters`; `getFilterDef` from `./filterSchema`
- Produces: `interface DiscoveryPreset { id, name, description, filters, derived }`, `const PRESETS: DiscoveryPreset[]`

**Context:** Thresholds come from course Module 02.4 "Winning Product Criteria" — price $20–70, BSR under 50,000, reviews under 1,000, 100+ units/mo at $5K–$15K revenue. Do not invent different numbers.

- [ ] **Step 1: Write the failing test**

`src/lib/discovery/presets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';
import { buildSelection } from './buildSelection';
import { getFilterDef } from './filterSchema';

describe('PRESETS', () => {
  it('has unique ids', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only references filter ids that exist in the schema', () => {
    for (const preset of PRESETS) {
      for (const id of Object.keys(preset.filters)) {
        expect(getFilterDef(id), `preset "${preset.id}" uses unknown filter "${id}"`).toBeDefined();
      }
    }
  });

  it('every preset builds a valid Keepa selection', () => {
    for (const preset of PRESETS) {
      expect(() => buildSelection(preset.filters)).not.toThrow();
    }
  });

  it('encodes the course Winning Product Criteria exactly', () => {
    const winning = PRESETS.find((p) => p.id === 'winning-product-criteria')!;
    expect(winning.filters.price).toEqual({ min: 20, max: 70 });
    expect(winning.filters.bsr).toEqual({ min: 1, max: 50000 });
    expect(winning.filters.reviewCount).toEqual({ max: 1000 });
    expect(winning.filters.monthlyUnits).toEqual({ min: 100 });
    expect(winning.derived).toMatchObject({ revenueMin: 5000, revenueMax: 15000 });
  });

  it('every preset that filters on revenue also sets a price range', () => {
    // The implied-bounds trick needs a price ceiling to derive a unit floor.
    for (const preset of PRESETS) {
      if (preset.derived?.revenueMin !== undefined) {
        expect(preset.filters.price, `preset "${preset.id}"`).toBeDefined();
      }
    }
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- presets`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/discovery/presets.ts`:

```ts
import type { DerivedFilterInput } from './derivedFilters';
import type { DiscoveryFilters } from './types';

export interface DiscoveryPreset {
  id: string;
  name: string;
  description: string;
  filters: DiscoveryFilters;
  derived?: DerivedFilterInput;
}

/**
 * Thresholds come from the course, Module 02.4 "Winning Product Criteria":
 * price $20-70, BSR under 50,000, reviews under 1,000, 100+ units/month at
 * $5K-$15K revenue, and the bonus signal that 3-4 star competitors mean
 * unhappy customers and room to improve. Do not change these numbers
 * without changing the lesson.
 */
export const PRESETS: DiscoveryPreset[] = [
  {
    id: 'winning-product-criteria',
    name: 'Winning Product Criteria',
    description: '$20–$70 · BSR under 50k · under 1,000 reviews · 100+ units/mo at $5K–$15K',
    filters: {
      price: { min: 20, max: 70 },
      bsr: { min: 1, max: 50000 },
      reviewCount: { max: 1000 },
      monthlyUnits: { min: 100 },
    },
    derived: { revenueMin: 5000, revenueMax: 15000, priceMin: 20, priceMax: 70 },
  },
  {
    id: 'weak-competition',
    name: 'Weak Competition',
    description: 'Winning criteria, narrowed to markets where the competition is rated 3–4 stars',
    filters: {
      price: { min: 20, max: 70 },
      bsr: { min: 1, max: 50000 },
      reviewCount: { max: 1000 },
      monthlyUnits: { min: 100 },
      rating: { min: 3, max: 4 },
    },
    derived: { revenueMin: 5000, revenueMax: 15000, priceMin: 20, priceMax: 70 },
  },
  {
    id: 'low-review-openings',
    name: 'Low-Review Openings',
    description: '$20–$70 · BSR under 50k · under 200 reviews — room to rank',
    filters: {
      price: { min: 20, max: 70 },
      bsr: { min: 1, max: 50000 },
      reviewCount: { max: 200 },
    },
  },
];
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- presets`
Expected: PASS.

- [ ] **Step 5: Add preset chips to FilterGrid**

In `src/components/Discovery/FilterGrid.tsx`, add the import:

```tsx
import { PRESETS } from '@/lib/discovery/presets';
import type { DerivedFilterInput } from '@/lib/discovery/derivedFilters';
```

Add `onApplyPreset` to `FilterGridProps`:

```tsx
  onApplyPreset: (filters: DiscoveryFilters, derived: DerivedFilterInput) => void;
```

and render the chips as the first child inside the outer wrapper `<div>`, above the grid:

```tsx
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-sm text-gray-600 dark:text-slate-400">Start from a proven setup:</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            title={preset.description}
            onClick={() => onApplyPreset(preset.filters, preset.derived ?? {})}
            className="px-3 py-1 rounded-full border border-blue-500/50 text-blue-600 dark:text-blue-300 text-xs font-medium hover:bg-blue-500/10"
          >
            {preset.name}
          </button>
        ))}
      </div>
```

- [ ] **Step 6: Wire it in DiscoveryContent**

In `src/components/Discovery/DiscoveryContent.tsx`, pass the handler to `<FilterGrid>`:

```tsx
        onApplyPreset={(f, d) => {
          setFilters(f);
          setDerived(d);
        }}
```

- [ ] **Step 7: Verify**

Reload `/discovery`, click "Winning Product Criteria". Expected: Price fills 20/70, BSR 1/50000, Review Count max 1000, ASIN Sales min 100. Clicking Search returns results.

- [ ] **Step 8: Commit**

```bash
git add src/lib/discovery/presets.ts src/lib/discovery/presets.test.ts src/components/Discovery
git commit -m "feat(discovery): course-derived filter presets"
```

---

### Task 14: Add to Funnel

**Files:**
- Modify: `src/components/Discovery/ResultsTable.tsx`
- Modify: `src/components/Discovery/DiscoveryContent.tsx`

**Interfaces:**
- Consumes: `POST /api/research/add-asin` with body `{ asin: string }` — returns `{ success: boolean, error?: string }`; returns `success: false` with a duplicate message when the ASIN is already in the funnel.
- Produces: `<ResultsTable ... savedAsins={Set<string>} savingAsin={string|null} onAddToFunnel={(asin: string) => void} />`

**Context:** This deliberately reuses the existing route rather than passing Discovery's hydrated row through. Add to Funnel does NOT run vetting — vetting is a market-level analysis needing a competitor set, which a single Discovery ASIN does not have. It consumes no vetting cap.

- [ ] **Step 1: Add the props and column to ResultsTable**

Extend `ResultsTableProps`:

```tsx
  savedAsins: Set<string>;
  savingAsin: string | null;
  onAddToFunnel: (asin: string) => void;
```

Add a final header cell:

```tsx
            <th className="py-3 px-4 font-medium">Funnel</th>
```

and a matching final body cell:

```tsx
              <td className="py-3 px-4">
                {savedAsins.has(row.asin) ? (
                  <span className="text-xs text-emerald-500 font-medium">In funnel</span>
                ) : (
                  <button
                    onClick={() => onAddToFunnel(row.asin)}
                    disabled={savingAsin === row.asin}
                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold"
                  >
                    {savingAsin === row.asin ? 'Adding…' : 'Add to Funnel'}
                  </button>
                )}
              </td>
```

- [ ] **Step 2: Implement the handler in DiscoveryContent**

Add state:

```tsx
  const [savedAsins, setSavedAsins] = useState<Set<string>>(new Set());
  const [savingAsin, setSavingAsin] = useState<string | null>(null);
```

Add the handler below `handleSort`:

```tsx
  const handleAddToFunnel = async (asin: string) => {
    setSavingAsin(asin);
    setError(null);
    try {
      const data = await authedPost('/api/research/add-asin', { asin });
      if (data?.success) {
        setSavedAsins((prev) => new Set(prev).add(asin));
      } else if (typeof data?.error === 'string' && data.error.toLowerCase().includes('already')) {
        // Already in the funnel is a success from the user's point of view.
        setSavedAsins((prev) => new Set(prev).add(asin));
      } else {
        setError(data?.error || 'Could not add that product to your funnel.');
      }
    } catch {
      setError('Could not add that product to your funnel.');
    } finally {
      setSavingAsin(null);
    }
  };
```

Pass the three new props to `<ResultsTable>`:

```tsx
            savedAsins={savedAsins}
            savingAsin={savingAsin}
            onAddToFunnel={handleAddToFunnel}
```

- [ ] **Step 3: Verify end to end**

Run `npm run dev`. On `/discovery`, apply the "Winning Product Criteria" preset, search, then click "Add to Funnel" on the first row.

Expected: the button shows "Adding…", then becomes "In funnel". Navigate to `/dashboard` — the product appears in the table. Return to `/discovery` and click Add on the same row again: it should report "In funnel" rather than an error.

- [ ] **Step 4: Confirm no vetting cap was consumed**

```sql
SELECT COUNT(*) FROM usage_events WHERE operation LIKE 'vetting%' AND created_at > now() - interval '10 minutes';
```

Expected: `0`.

- [ ] **Step 5: Full check and commit**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all tests pass, no type errors, build succeeds.

```bash
git add src/components/Discovery
git commit -m "feat(discovery): add to funnel from search results"
```

---

## Final verification before requesting review

- [ ] `npm test` — all suites pass
- [ ] `npx tsc --noEmit` — clean
- [ ] `npm run build` — succeeds
- [ ] `/research` redirects to `/dashboard`; `/research/B07R7XSNZ1` still renders
- [ ] Nav reads `My Funnel | Discovery Vetting Offering Sourcing`
- [ ] A preset search returns rows, pages forward and back, sorts, and saves to the funnel
- [ ] Monthly Sales / Parent Sales values are smooth, not round bucket numbers (300/500/1000 across every row means the BSR curve is being bypassed)
- [ ] Sending an unknown filter id to `/api/discovery/search` returns 400, not results
- [ ] Push `feat/discovery-black-box` and open ONE PR into `dev` with a single preview URL for Dave to test
- [ ] Do NOT merge to `main` until Dave signs off on the whole feature
