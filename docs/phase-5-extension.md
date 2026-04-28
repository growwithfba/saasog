# Phase 5 — BloomEngine Chrome Extension (Xray-class)

**Status:** Spec drafted 2026-04-27. Ready to start at 5.1.
**Predecessor:** Phase 4 (Vetting visualization finish-up) merged into `dev` as `cabd8ec`.
**Branch convention:** one branch per sub-phase off latest `dev`. PR target = `dev`.

---

## Goal

Ship a Chrome extension that achieves Helium 10 Xray feature parity (SERP-overlay product research table) and then beats it via deep BloomEngine integration: Save-to-Funnel, Add-as-Competitor to an open vetting, "Vet this market" bulk import, score chips on rows the user already touched, removal-candidate hints + market flags inline, PDP overlay (deferred to follow-up).

The extension replaces today's CSV-upload entry into vetting. By the end of Phase 5, the user can sit on any Amazon SERP and create a fully-vetted market in 2 clicks.

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
| **Keepa rate limit** | Dave on €58/mo (2×€29) plan, **claimed 60 tokens/min — TO VERIFY in Phase 5.1 probe** by reading the `X-RateLimit-*` response headers. If actual is lower, we either upgrade or batch-throttle in the service worker. |

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
1. SERP table — 22 cols, sortable, filterable, customizable, matches H10 visually
2. Aggregate strip — Total Revenue, Avg Price/BSR/Reviews, "X of top 10 over $5K", "X of top 10 under 75 reviews"
3. Filters — retail price, ratings, size tier, ASIN/parent revenue, weight, review count, fulfillment type, FBA fees, brand, title-keyword include/exclude, hide sponsored
4. Customize columns — persist to `profiles.preferences.extensionColumns`
5. CSV/XLSX export

### BloomEngine moat (Phase 5.6)
6. **Save to Funnel** per row → research stage
7. **Add as Competitor** per row → live-update an open vetting via Supabase realtime channel
8. **Score chip** per row — if the ASIN exists in any of the user's submissions, show its latest score
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

### 5.4 — `/api/extension/enrich` + auth
- Add the `app.bloomengine.com/extension-auth` page to this repo.
- Add `POST /api/extension/enrich` route to this repo. Reuses `keepaService.getCompetitorData` batch logic; transforms output into the 22-column Xray shape.
- Service worker auth flow: popup button → opens auth page → tokens posted via `externally_connectable` → stored in `chrome.storage.local`.
- Service worker fetches enrich, streams progress to side panel.
- Acceptance: Signed-in user opens panel on a SERP. All 22 columns populate within 3–8 seconds. "Fetching 23/60…" progress shown.

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

## Unknowns to verify in 5.1

1. **Actual Keepa rate limit on the €58/mo plan.** Probe will read `X-RateLimit-*` headers. If under 60 tok/min, we plan around it.
2. **`monthlySold` coverage rate.** Probe will measure. If <50% on a typical SERP, we lean harder on BSR-derived sales for the "Recent Purchases" column. (Already do this for vetting; reuse.)
3. **Keepa response time at 50–100 ASIN batch.** Affects whether we stream incremental results or just block the panel for 3–8 seconds.

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
