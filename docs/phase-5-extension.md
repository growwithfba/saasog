# Phase 5 — Bloom Lens (Xray-class Chrome extension)

**Status:** Spec drafted 2026-04-27. Ready to start at 5.1.
**Predecessor:** Phase 4 (Vetting visualization finish-up) merged into `dev` as `cabd8ec`.
**Branch convention:** one branch per sub-phase off latest `dev`. PR target = `dev`.

---

## Goal

Ship **Bloom Lens**, a Chrome extension that achieves Helium 10 Xray feature parity (SERP-overlay product research table) and then beats it via deep BloomEngine integration: Save-to-Funnel, Add-as-Competitor to an open vetting, "Vet this market" bulk import, score chips on rows the user already touched, removal-candidate hints + market flags inline, PDP overlay (deferred to follow-up).

Bloom Lens replaces today's CSV-upload entry into vetting. By the end of Phase 5, the user can sit on any Amazon SERP and create a fully-vetted market in 2 clicks.

---

## Decisions locked (2026-04-27)

| | |
|---|---|
| **Repo layout** | Separate sibling repo `bloomengine-extension`. Different build (Vite + WXT), different deploy (Chrome Web Store vs Vercel). Type-sharing via a small `scripts/sync-types.ts` that copies relevant types from this repo into `bloomengine-extension/shared/types.ts` on commit. |
| **Framework** | WXT + React + TypeScript. WXT auto-generates the MV3 manifest, handles HMR for content scripts + side panel, has the lowest config overhead of the 2025 contenders (vs CRXJS, Plasmo). |
| **Manifest** | V3 only. `chrome.sidePanel` for the right-edge panel (matches H10's UX). Host permissions on `*://*.amazon.com/*` and `https://app.bloomengine.com/*`. |
| **Data path** | Hybrid. Content script DOM-scrapes SERP rows for thin fields (ASIN, title, price, image, rating, reviews, sponsored, prime, "X+ bought past month") — free, instant. One backend endpoint `POST /api/extension/enrich` proxies Keepa `/product?asin=…` (batchable up to 100 ASINs per request) for the meaty columns (BSR, fees, dimensions, weight, listing date, brand, monthlySold). SerpAPI + RainForest are documented fallbacks but NOT on the critical path. |
| **Auth** | Extension popup → opens `app.bloomengine.com/extension-auth` page → Supabase tokens posted back via `chrome.runtime.sendMessage` (extension declared in `externally_connectable.matches` on the BloomEngine page). Service worker stores tokens in `chrome.storage.local` via a custom Supabase storage adapter (default `localStorage` doesn't exist in MV3 service workers). PKCE refresh runs in a `chrome.offscreen` document because `crypto.subtle.digest` needs DOM. |
| **Pricing** | Free for all signed-in users during beta. Paid gating ("Vet this market" bulk action limit, etc.) lands in Phase 7 alongside Stripe tiers. |
| **PDP overlay** | Deferred. Ship 5.1–5.8 first. Reopen as Phase 5.9+ once SERP-side has product-market fit. |
| **Brand chip behavior** | v1: clicking a brand on the Xray table just filters the current Xray. No new dashboard view this phase. |
| **Keepa rate limit** | **Resolved 2026-04-28.** Dave upgraded to the 129 €/mo "60 tokens/min" plan after the 5.1 probe surfaced that the prior plan was actually 2 tok/min. Verified `refillRate=62/min` against live response. Rate-limit signal lives in the response **body** (`tokensLeft`, `refillRate`), not `X-RateLimit-*` headers. |
| **Monthly sales math** | **Per-category BSR → sales curve, not Keepa `monthlySold`.** Same approach as H10 / JS / SS. `monthlySold` becomes a tooltip / secondary signal. V1 ships with a publicly-published curve approximation; Phase 5.4 adds a calibration harness (`scripts/probes/h10-vs-bloom-sales.ts`) that takes Dave's stash of H10 Xray CSVs as ground truth. Curves are versioned with a `calibratedAt` field — re-tuned quarterly because Amazon's category sizes drift upward over time (more SKUs ⇒ same units sold maps to higher BSR). |
| **Listing Quality Score (LQS)** | Shared helper at `src/lib/listing/qualityScore.ts`. Consumed by the extension's enrich endpoint **and** by the in-app competitor scorer. Inputs: image count, title length, bullet count + length, description length. Output: `{score 0–10, breakdown, flags}`. First cut weight in the composite competitor score is 10%, calibrated against existing vetting outcomes so historical scores don't shift. |
| **Page-1 scope, sponsored, dedupe** | Content script scrapes all `[data-asin]` rows on the SERP — organic + sponsored. Sponsored rows visible by default with a badge; H10-style toggle to hide. Dedupe by ASIN, keep the highest-position occurrence. |
| **Imperial ↔ metric toggle** | Weight + dimension columns get a unit toggle, persisted to `profiles.preferences.extensionUnits`. |
| **Variations dropdown** | Per-row chevron reveals child variations. Initial response carries `variations[]` so the count renders immediately; expand triggers a second batched Keepa call (~200 tokens, lazy, 24h cache) and populates new **Parent Revenue** + **Parent Units Sold** columns. |
| **Product name** | **Bloom Lens.** Locked 2026-04-28. Sibling-repo working name: `bloom-lens-extension` (the older `bloomengine-extension` references in this doc still apply structurally — the rename happens at repo-init time in Phase 5.2). |

---

## Architecture

### Directory layout (sibling repo)

```
bloomengine-extension/
  wxt.config.ts
  package.json                 # vite, wxt, react, @supabase/supabase-js
  entrypoints/
    background.ts              # SW: auth, API broker, message router
    content.ts                 # injected on amazon.com/s* and amazon.com/dp/*
    sidepanel/                 # React app
      App.tsx
      components/
        XrayTable.tsx
        AggregateStrip.tsx
        FilterBar.tsx
        RowActions.tsx
      hooks/
        useEnrichment.ts
        useBloomSession.ts
      api/client.ts            # fetch wrapper → app.bloomengine.com/api/extension/*
    popup/                     # sign-in / settings
    offscreen/                 # PKCE crypto + token refresh
  shared/
    types.ts                   # synced from this repo
    selectors.ts               # Amazon DOM selectors w/ regex fallbacks
    parser.ts                  # SERP HTML → thin row DTO
  scripts/
    sync-types.ts
  public/icons/
```

### New backend endpoints in this repo

```
src/app/api/extension/
  enrich/route.ts              # POST { asins[] } → Keepa /product batch + 22-column shape
  asin-status/route.ts         # GET ?asins=A,B,C → which exist in user's funnel + scores
  save-listing/route.ts        # POST { asin, stage } → adds to research
  add-competitor/route.ts      # POST { submissionId, asin } → adds to a vetting in progress
  vet-from-serp/route.ts       # POST { asins[], niche? } → creates vetting submission
  vetting-score/route.ts       # GET ?asin= → latest score
  reviews-prewarm/route.ts     # POST { asins[] } → kicks off /api/offer/pull-reviews
  _cors.ts                     # one CORS helper applied to all /api/extension/*
```

Auth headers: `Authorization: Bearer <supabase_access_token>` on every request. CORS allow-origin can be `*` since the bearer is the auth.

### Data flow per Xray open

1. User on `amazon.com/s?k=…`. Content script injects a "BloomEngine Xray" FAB.
2. Click → `chrome.runtime.sendMessage` → service worker calls `chrome.sidePanel.open({ windowId })`.
3. Side panel boots, asks content script (via long-lived `chrome.runtime.connect` port) for thin rows.
4. Content script returns thin rows (ASIN list + 8 visible fields) within ~200ms. Side panel renders the table immediately with placeholders for heavy columns.
5. Side panel calls `POST /api/extension/enrich { asins }` via service worker.
6. Backend chunks into ≤100-ASIN Keepa batches, returns enriched rows. Side panel fills heavy columns as they arrive (streaming via SSE or polling — TBD in 5.4).

---

## Killer features (ranked)

### MVP (Phase 5.1–5.5)
1. SERP table — 22 columns (revised list below), sortable, filterable, customizable, matches H10 visually. Page-1 scope: all `[data-asin]` rows including sponsored, deduplicated by ASIN.
2. Aggregate strip — Total Revenue, Avg Price/BSR/Reviews, "X of top 10 over $5K", "X of top 10 under 75 reviews", **brand-concentration mini-bar** ("8 of 22 from 3 brands").
3. Filters — retail price, ratings, size tier, ASIN/parent revenue, weight, review count, fulfillment type, FBA fees, brand, title-keyword include/exclude, hide sponsored toggle.
4. Customize columns — persist to `profiles.preferences.extensionColumns`. Imperial/metric toggle persisted to `profiles.preferences.extensionUnits`.
5. CSV/XLSX export.
6. **Score chip per row** (pulled forward from 5.6 — strongest BloomEngine differentiator, ~free via bulk `asin-status` query). If the ASIN exists in any of the user's submissions, show its latest score next to the title.

#### Revised 22-column list (replaces the spec's earlier draft)

| # | Column | Notes |
|---|---|---|
| 01 | Image | `images[]` array (NOT `imagesCSV` — that field is absent in /product responses). |
| 02 | Title | |
| 03 | ASIN | |
| 04 | Brand | |
| 05 | Price | |
| 06 | BSR (current) | |
| 07 | Monthly Units Sold | **Per-category BSR→sales curve.** Tooltip shows Keepa's coarse `monthlySold` bucket as secondary signal. |
| 08 | Monthly Revenue | Derived from #07 × Price. |
| 09 | Parent Units Sold | Lazy-loaded on variations dropdown expand. |
| 10 | Parent Revenue | Lazy-loaded on variations dropdown expand. |
| 11 | Reviews (count) | |
| 12 | Review Rating | |
| 13 | FBA Fees | `pickAndPackFee` only. Storage fee dropped per Dave. |
| 14 | Net Price | Derived: `price − pickAndPackFee − referralFee%`. |
| 15 | Listing Date / Date First Available | |
| 16 | Weight | Imperial/metric toggle. |
| 17 | Dimensions (L×W×H) | Imperial/metric toggle. |
| 18 | Size Tier | Derived. |
| 19 | Variations (count) | Click chevron → expand to show child rows. |
| 20 | Fulfillment (FBA/FBM/AMZ) | Lazy-loaded — requires `offers=20` on Keepa call. |
| 21 | Recent BSR Δ% (90d) | Free from `csv[3]`. Replaces the spec's earlier "Sales Trend" column. |
| 22 | Days Since Last Price Change | Free from `lastPriceChange`. |

Plus two non-column row decorations:
- **Listing Quality Score (0–10)** — small chip on hover/expand, also feeds the in-app competitor score.
- **BloomEngine vetting score chip** — when this ASIN is in one of the user's prior submissions.

**Dropped from the original draft:** Active Sellers, Sales Trend (replaced by #21).

### BloomEngine moat (Phase 5.6)

(Score chip moved into MVP above.)

7. **Save to Funnel** per row → research stage.
8. **Add as Competitor** per row → live-update an open vetting via Supabase realtime channel.
9. **"Vet this market"** bulk action — 5–15 selected rows → auto-creates a vetting submission with those competitors. **Replaces today's CSV upload entirely.**

### Insight layer (Phase 5.7)
10. **Removal-candidate hints inline** — apply existing `getSuggestedRemovals` from `src/lib/vetting/insights.ts` to SERP rows. "Likely not a true competitor" / "FBM-only weak" / "Overpriced low-sales" annotations BEFORE the user imports.
11. **Market-flag preview** on aggregate strip — same insights engine generates "⚠️ Top 1 holds 47% share" / "✅ Healthy review distribution"
12. **Reviews pre-warm** bulk action — kicks off `/api/offer/pull-reviews` so insights are ready when the user opens the offer tab later

### Deferred (5.9+ or V11)
13. PDP overlay on `amazon.com/dp/*` (score + Save-to-Funnel + review-insights link)
14. Listing-quality score per row (title length, image count, A+ presence)
15. Watch-list alerts (SW polls a saved SERP query daily)
16. Brand-grab (full brand catalog scrape)
17. Reverse-keyword mode (Cerebro equivalent — depends on V11 keyword infra)
18. True competitor suggestions across markets (depends on V11 market clustering)

---

## Phased plan

Each sub-phase ≈ 1 commit's worth of work. Each PRs to `dev`.

### 5.1 — Keepa probe **(research gate, no UI)**
- Write a probe script (`scripts/probes/keepa-xray.ts`) that takes ~50 ASINs from a sample SERP page (e.g. "tandem wheel ramp" → harvest the ASINs by hand or via a quick fetch).
- Calls Keepa `/product?asin=A,B,C…` in one batch. Logs:
  - HTTP response headers, especially `X-RateLimit-Remaining` / `X-RateLimit-Limit` (confirms actual tokens/min on Dave's plan)
  - Total tokens consumed
  - Response time
  - Per-ASIN flat summary: ASIN, brand, monthlySold (null vs value), current BSR, fbaFees object, listingDate, dims, weight, reviews, rating, image
  - % of ASINs returning `monthlySold` (expected <30%; we fall back to BSR-derived sales for the rest, same logic as `keepaService.transformKeepaData`)
- Output a `docs/phase-5-1-keepa-probe.md` note with the verified Xray-column → Keepa-field mapping and the rate-limit confirmation. **Stamp with "Phase 5.2 may begin."**
- Acceptance: Dave reviews + merges. No code changes outside the probe + the doc.

### 5.2 — Sibling repo scaffold + side panel skeleton
- New repo `bloomengine-extension` with WXT + React + TS.
- MV3 manifest with `sidePanel`, `storage`, `tabs`, host permissions.
- Content script injects "Open BloomEngine Xray" FAB on `amazon.com/s*`.
- Click → service worker opens side panel via `chrome.sidePanel.open`.
- Side panel renders a placeholder table with hardcoded mock data + BloomEngine logo.
- No auth, no real data.
- Acceptance: Local-load unpacked extension, navigate to Amazon search, click FAB, see side panel with mock rows.

### 5.3 — DOM scraper + thin-row pipeline
- Content script extracts thin rows from `[data-asin]` rows on the SERP.
- Selectors live in `shared/selectors.ts` with regex fallbacks for class-name rotation.
- Posts to side panel via long-lived port.
- Side panel renders table with thin fields populated, "Loading…" placeholders for heavy fields.
- Acceptance: On any Amazon SERP, side panel shows correct ASIN list with title/price/rating/reviews populated within 200ms. Sponsored toggle works.

### 5.4 — `/api/extension/enrich` + auth + shared helpers

Backend + auth flow:
- Add the `app.bloomengine.com/extension-auth` page to this repo.
- Add `POST /api/extension/enrich` route. Calls Keepa `/product` in batches, transforms output into the revised 22-column shape above.
- **Drop `offers=20` from the default fetch** — lazy-load on row expand. Halves token cost; pushes Active Sellers + Fulfillment to a second click.
- **Cache enriched rows in Supabase by ASIN with 24h TTL** — repeat opens on the same SERP cost zero tokens.
- Service worker auth flow: popup button → opens auth page → tokens posted via `externally_connectable` → stored in `chrome.storage.local`.
- Service worker fetches enrich, single blocking call (verified 1.3 s in 5.1 probe — no streaming needed).

Shared helpers (this repo, callable by both extension enrich endpoint and existing in-app pipelines):
- **`src/lib/extension/bsrSalesCurve.ts`** — versioned per-category BSR→sales curve table. Includes `calibratedAt` ISO date + `notes`. V1 ships with publicly-published approximation.
- **`src/lib/listing/qualityScore.ts`** — Listing Quality Score helper. Inputs from Keepa `/product`: image count, title length, bullet count + length, description length. Output: `{score 0–10, breakdown, flags}`. Wired into the in-app competitor scorer at 10% weight (calibrated against existing vetting outcomes so historical scores don't shift).
- **`scripts/probes/h10-vs-bloom-sales.ts`** — calibration harness. Accepts a Helium 10 Xray CSV export, runs our model on the same ASINs, prints per-row + 90th-percentile delta. Re-runnable; adopted curve diffs reviewed before commit.

Acceptance:
- Signed-in user opens panel on a SERP. All 22 columns populate within ~2 seconds (lazy columns show "—" until expanded).
- Variations dropdown chevron expands to fetch + show child variations within ~1 second.
- LQS column populates and matches what the in-app competitor scorer computes for the same ASIN.
- Calibration harness runs against at least one of Dave's H10 CSV exports and reports a per-category delta breakdown. Curve tuned until 90th-percentile delta ≤ ±25%.

### 5.5 — Filters, sort, columns, export
- All H10 filters.
- Customize-columns modal → persist to `profiles.preferences.extensionColumns`.
- CSV export. XLSX nice-to-have (defer if scope creeps).
- Acceptance: H10 Xray UX parity, minus BloomEngine superpowers.

### 5.6 — BloomEngine superpowers (1–2 commits)
- `Save to Funnel` per row → `POST /api/extension/save-listing`.
- `Add as Competitor` per row → live-updates target vetting via Supabase realtime.
- Score chip per row → bulk `GET /api/extension/asin-status?asins=…` on table render.
- `Vet this market` bulk action → `POST /api/extension/vet-from-serp` creates a new vetting submission with selected ASINs as competitors.
- Acceptance: SERP → research, SERP → vetting (in progress), SERP → new vetting submission all work end-to-end.

### 5.7 — Insights + market flags
- Apply `getSuggestedRemovals` to SERP rows → inline removal badges.
- Apply market-flag generators → aggregate-strip flags.
- Reviews pre-warm bulk action.
- Acceptance: SERP rows show "likely not a true competitor" annotations; aggregate strip shows market flags.

### 5.8 — Polish + Chrome Web Store submission
- Empty states, error handling, telemetry via existing `usage_events` (extend with extension surface).
- Icon set, store listing copy, screenshots.
- Submit to CWS as **unlisted** for closed beta.
- Acceptance: Listed under unlisted CWS link; Dave + 2 beta testers can install.

### 5.9+ (post-launch follow-ups)
- PDP overlay
- Watch-list alerts
- Brand-grab
- Listing-quality score
- (Etc. — see catalog above)

---

## Unknowns resolved in 5.1

(See `docs/phase-5-1-keepa-probe.md` for full numbers + verbatim probe output.)

1. **Keepa rate limit.** Was 2 tok/min on the prior plan. Dave upgraded to the 129 €/mo "60 tok/min" plan; verified `refillRate=62/min`, burst bucket pre-filled to ~824. Rate-limit signal lives in response **body**, not `X-RateLimit-*` headers.
2. **`monthlySold` coverage.** 32% on the test batch. Triggered the broader decision to **always** use a BSR→sales curve and demote `monthlySold` to a tooltip. See "Decisions locked" → "Monthly sales math".
3. **Keepa response time.** 1.3 s for a 25-ASIN batch on the upgraded plan (was 8.1 s on the throttled plan). Side panel can block on enrichment without streaming.
4. **`imagesCSV` field.** Absent on the live response — the populated field is `images[]`. Spec column 01 is updated accordingly.

---

## References

- Keepa Product struct: https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/structs/Product.java
- Keepa Python API methods: https://keepaapi.readthedocs.io/en/latest/api_methods.html
- chrome.sidePanel API: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- Supabase auth in MV3 (chrome.storage.local + offscreen PKCE): https://chethiyakd.medium.com/supabase-auth-in-a-chrome-extension-what-you-wont-find-in-the-docs-a2ae6691cca3
- WXT vs CRXJS vs Plasmo (2025): https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/
- Helium 10 Xray reference: https://www.helium10.com/tools/product-research/xray/
- Existing repo touchpoints:
  - `src/services/keepaService.ts` — reuse `getCompetitorData` batch logic
  - `src/lib/vetting/insights.ts` — reuse `getSuggestedRemovals` + flag generators in 5.7
  - `src/app/api/research/add-asin/route.ts` — existing add-ASIN flow
  - `src/app/api/keepa/products/route.ts` — existing Keepa proxy pattern
