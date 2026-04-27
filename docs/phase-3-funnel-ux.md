# Phase 3 — Funnel UX & Product Identity

**Status:** Spec drafted 2026-04-25. Ready to start.
**Branch:** TBD (suggest `v9-funnel-ux`, branched from `v9-score-save` HEAD).
**Predecessor:** Phase 2.9 (deep-dive chart rebuild) shipped on `v9-score-save`.

---

## Why this phase

Phase 2 built the AI engine and Market Climate. Phase 3 closes the gap between "the analysis is great" and "the funnel feels like a polished product." 10 user-facing asks captured 2026-04-25, grouped into 5 sub-phases by dependency.

The original "Phase 3 — Visualization & Market Signals overhaul" has been renumbered to Phase 4; the Market-Signals chunk of it was already absorbed by 2.8/2.9.

---

## Sub-phases

### 3.1 — Custom product names

**Goal:** Users rename a product from its long Amazon title to something short and memorable. Reflected everywhere.

**Schema:**
- Migration: `ALTER TABLE submissions ADD COLUMN display_name TEXT NULL;`.
- Read precedence in code: `display_name ?? original_title`.

**Helper:**
- New `getProductDisplayName(submission)` (suggest `src/utils/product.ts`) — single source of truth.

**API:**
- Extend the existing `PATCH /api/submissions/[id]` to accept `display_name` (Phase 2.7 already established this PATCH endpoint).

**UI:**
- Inline-edit pencil — clickable on the new ProductHeader (3.3). Click to edit-in-place, Enter saves, Esc cancels, blur saves.
- Replace title reads on:
  - `/dashboard` Recent Activity rows
  - `/research` list rows
  - `/vetting` list rows
  - `/vetting/[id]` page header (the screenshot in Dave's ask)
  - `/offer/[id]` and `/sourcing/[id]` page headers
  - `/share/...` public view
  - Browser `<title>` per page

**Acceptance:** rename a product, refresh every page above, see the new name. Original title still visible on the product header (smaller secondary line) for cross-reference.

---

### 3.2 — Listing images everywhere

**Goal:** Show the Amazon main image next to product name on every funnel list and detail header.

**Source:** Already extracted in the vetting matrix work (commits `7b8db0d`, `32c28d5`, `00f2469`). `imageUrl` lives in normalized Keepa data. Persist to `submissions.image_url` (or read from cached Keepa analysis) so other pages don't re-fetch.

**Migration:** `ALTER TABLE submissions ADD COLUMN image_url TEXT NULL;` — backfill from existing Keepa analyses where possible.

**UI placements:**
- Dashboard Recent Activity rows (24×24)
- Research list rows (32×32)
- Vetting list rows (32×32)
- Offer list, sourcing list (32×32)
- ProductHeader thumbnail (48×48 expanded, 32×32 sticky)
- Reuse the hover-zoom popover from the vetting matrix.

**Acceptance:** every funnel surface shows the product image; missing-image fallback is a clean placeholder, not a broken-icon.

---

### 3.3 — Unified ProductHeader + sticky behavior

**Goal:** One component on every product detail page that surfaces image + name + ASIN + actions + funnel-stage progress, with sticky compact mode on scroll.

**Component:** `src/components/Product/ProductHeader.tsx` (new).

**Props:** `submission` (with stage data joined or fetched).

**Layout (expanded, top of page):**
- Left: 48×48 image · stacked (display name large + ASIN small + edit pencil).
- Center: stage progress strip — Research · Vetting · Offering · Sourcing — each lit/unlit based on data presence; current stage emphasized.
- Right: page-specific actions (Back · Share · Build-next, etc.).

**Stage detection:**
- Research: always lit (the ASIN is in the funnel).
- Vetting: `submissions.score IS NOT NULL`.
- Offering: an `offer_products` row exists for this submission.
- Sourcing: a sourcing row exists for this submission.

**Sticky behavior:**
- `position: sticky; top: <topbar-height>;`.
- On scroll past the hero, switch to compact mode: 32×32 thumb · name · current-stage pill · primary action only.
- IntersectionObserver flips a `data-sticky` attribute that drives the styling.

**Used by:** `/research/[id]`, `/vetting/[id]`, `/offer/[id]`, `/sourcing/[id]`. Replaces the bespoke header on each.

---

### 3.4 — Funnel-list ergonomics

**3.4a — Pagination defaults**
- Research: change default page size from 10 → 50; keep the existing selector.
- Vetting: add a page-size selector (currently missing per the ask), default 50.

**3.4b — Configurable vetting columns**
- New column-picker dropdown on the vetting list.
- Persist selection in `profiles.preferences JSONB` (key `vetting_columns`) so it follows the user across devices.
- Migration: `ALTER TABLE profiles ADD COLUMN preferences JSONB DEFAULT '{}'::jsonb;` (if not already present).

**3.4c — Tag manager**
- New "Manage tags" UI — modal off the existing tag picker, or a small settings page.
- Delete-tag globally → cascade-removes the tag from every submission for this user.
- Multi-select rows on research + vetting lists → bulk-action bar (bulk add tag, bulk remove tag).

**3.4d — Post-add-ASIN visibility**
- After a successful single-ASIN add, default-sort research by `created_at desc`.
- Scroll the new row into view (or animate a brief highlight pulse).
- Open question: navigate straight into the new submission's detail page instead? Dave's lean: scroll-into-view (preserves batch-add context). Confirm before building.

---

### 3.5 — Dashboard funnel viz

**Goal:** Replace the fixed-width stacked-trapezoid with one whose width scales with stage count.

**Approach:**
- Each row's width: `lerp(minWidthPct, 100, count / maxCount)` where `maxCount = max(stage_counts)`.
- Animate width transitions when counts change.
- Keep the existing color treatment + numbers + stage labels.

**Acceptance:** with Funnel=248, Vetted=24, Offerings=2, Sourced=1, the visual narrows proportionally top→bottom; visiting after another vetting widens the Vetted row visibly.

---

## Execution order

3.1 → 3.2 → 3.3 (these three compound — name + image + header all live on the new ProductHeader).
3.4 sub-items in any order after.
3.5 last.

One commit per sub-phase or finer. Open a fresh branch off `v9-score-save` HEAD.
