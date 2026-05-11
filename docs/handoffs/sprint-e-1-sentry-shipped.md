# Sprint E.1 — Sentry wired into both surfaces (2026-05-09 EOD)

**Status:** App side merged to feature branch + PR open against `dev`. Extension side built + zipped. Both held pending external dependencies (Vercel preview validation; Web Store v0.5.10 approval).

**Sprint context:** Sprint E launch decisions locked earlier this same session. Open Web Store launch (decided over invite-only beta) made first-class error monitoring launch-blocking — couldn't ship to public users without aggregation, release tagging, and stack-trace symbolication. Sentry chosen over Vercel-logs-only because (a) public users won't tell you they hit an error, (b) BloomLens content-script errors in users' Amazon tabs are otherwise invisible to us. See `project_sprint_e_launch_decisions.md` for the full Sprint E plan.

---

## 1. What shipped

### App (bloomengine repo)

`@sentry/nextjs` v10.x via official wizard, then hardened beyond defaults. Verified end-to-end on Vercel preview at commit `72580df`: a deliberate throw via `/sentry-example-page` captured in Sentry within ~30s with a source-mapped stack trace pointing to the actual `.tsx` line, release tagged with the Vercel commit SHA, environment correctly identified as `preview`, and trace ID propagated through `layout.tsx generateMetadata`.

**Hardening applied beyond wizard output:**
- DSN moved from hardcoded literal in 3 source files → `process.env.NEXT_PUBLIC_SENTRY_DSN`
- `sendDefaultPii: false` (wizard default was `true`) — privacy-first, with a path to add `Sentry.setUser({ id })` selectively post-auth if attribution becomes useful
- `tracesSampleRate: 0` explicit (wizard left it undefined) — performance monitoring deferred
- `beforeSend` filters live in `instrumentation-client.ts` to protect the 5k/mo free-tier quota:
  - Drops `AbortError` (request cancelled by client navigation)
  - Drops `ResizeObserver loop limit exceeded` / `ResizeObserver loop completed with undelivered notifications` (browser quirk, harmless)
  - Drops stack frames originating from `chrome-extension://`, `moz-extension://`, `safari-web-extension://` (other extensions on the user's tab — not our code)
- `release.name = process.env.VERCEL_GIT_COMMIT_SHA` (Sentry's auto-detection on Vercel is under-documented per pre-implementation probe)
- `environment = VERCEL_ENV ?? NODE_ENV` so Production/Preview/Development bucket correctly
- `tunnelRoute: "/monitoring"` — bypasses ad-blockers (uBlock Origin / Brave shields commonly block direct `*.sentry.io` requests; without the tunnel we'd silently lose reports from a chunk of users)
- `Sentry.getTraceData()` snippet wired into `src/app/layout.tsx generateMetadata` for trace propagation between server-rendered pages and client errors
- Wizard-generated `sentry-example-page` + `/api/sentry-example-api` deleted in follow-up commit (the API route would have thrown on every public GET — bots hitting it would have burned Sentry quota)

**Branch:** `sprint-e/sentry-app` (2 commits)
- `72580df` — Sprint E.1: wire Sentry into Next.js app (sentry-example-page included)
- `896c6f2` — Remove Sentry example page + API route now that capture is verified

**PR:** [#48](https://github.com/growwithfba/saasog/pull/48) — `sprint-e/sentry-app → dev`

### Extension (bloom-lens-extension repo)

`@sentry/browser` v10.x with **background-only architecture**. SDK lives exclusively in the BG service worker. Content scripts and popup post errors via `chrome.runtime.sendMessage({ type: 'SENTRY_REPORT', ... })` to a `SENTRY_REPORT` case in the BG dispatcher. `lib/reportError.ts` is the bridge helper — content/popup callers MUST use it instead of importing `@sentry/browser` directly.

**Why background-only:** `@sentry/browser` is ~140 KB gzipped. Injecting it into every Amazon SERP via the content script would inflate startup and risk conflicts with Helium 10 and other research extensions on the same tab. Verified after build: BG bundle 8.24 KB → 86.58 KB (Sentry SDK now bundled there); content script bundle and popup chunk both unchanged (zero matches for Sentry strings).

**Architecture per Sentry's own browser-extension docs:**
- Manual `BrowserClient` + `Scope` (NOT `Sentry.init()`) — avoids global state pollution and lets us strip integrations
- Stripped integrations: `BrowserApiErrors`, `BrowserSession`, `Breadcrumbs`, `GlobalHandlers`, `FunctionToString` (they assume `window` / DOM APIs the SW context doesn't have, or pollute global state)
- Custom global error capture via `self.addEventListener('error' | 'unhandledrejection')` for errors thrown directly in BG context
- Lazy init — Sentry only spins up when the first error event arrives, so no DSN means no-op (dev builds without `.env.local` don't crash)

**Source maps via the modern Sentry debug-ID system:**
- `vite.build.sourcemap: 'hidden'` in `wxt.config.ts` emits `.map` files but no `//# sourceMappingURL=` comment in bundled JS
- `npm run sourcemaps:upload` → `dotenv-cli` reads `SENTRY_AUTH_TOKEN` from `.env.local` → `sentry-cli sourcemaps inject + upload` — debug IDs are baked into the built JS at upload time, so `chrome-extension://<random-extid>/...` paths resolve correctly regardless of install
- `npm run release` chains `build → sourcemaps:upload → zip` for one-shot Web Store packaging

**Verified end-to-end with v0.5.11 prod build loaded into Chrome:** BG SW console threw → Sentry captured with `release: 0.5.11`, `environment: production`, `handled: yes` (confirms our global handler caught it), trace ID propagated, "In App" frame classification.

**Dev-only test affordance:** `🧪 Test Sentry (dev only)` button at the bottom of the popup, gated by `import.meta.env.MODE === 'development'`. Tree-shaken from production builds. Useful if Sentry plumbing ever needs re-validation.

**Other changes bundled into v0.5.11:** version bump (`0.5.10 → 0.5.11`), `.gitignore` add for `.env*.local` (was missing — would have committed the DSN + auth token if not caught), `.env.example` for future devs.

**Branch:** `sprint-e/sentry-extension` (1 commit)
- `db7c6c8` — Sprint E.1: wire Sentry into BloomLens extension (background-only)

**Zip:** `bloom-lens-extension/.output/bloom-lens-extension-0.5.11-chrome.zip` (1.3 MB) — ready for Web Store push.

---

## 2. Files changed

### App (bloomengine — 13 files; +4,990 / −290; package-lock dominates)

Sentry-relevant only (handoff docs from earlier in the session are bundled in this branch's diff against main but are V9 iter2 carry-over, not Sentry):

| File | What |
|---|---|
| `src/instrumentation-client.ts` | NEW — browser SDK init with hardened `beforeSend` filters |
| `src/instrumentation.ts` | NEW — Next.js App Router register() + `onRequestError` |
| `sentry.server.config.ts` | NEW — Node runtime SDK init |
| `sentry.edge.config.ts` | NEW — Edge runtime SDK init |
| `src/app/global-error.tsx` | NEW — Client Component for App Router root errors |
| `src/app/layout.tsx` | Added `generateMetadata` with `Sentry.getTraceData()` for trace propagation |
| `next.config.js` | Wrapped with `withSentryConfig` (release.name from VERCEL_GIT_COMMIT_SHA, tunnelRoute, treeshake) |
| `.gitignore` | Added `.env.sentry-build-plugin` + `*.pdf` |
| `package.json` / `package-lock.json` | Added `@sentry/nextjs` |

### Extension (bloom-lens-extension — 10 files; +668 / −4)

| File | What |
|---|---|
| `lib/sentry.ts` | NEW — message contract types (`SENTRY_REPORT`, `SentryReportPayload`) |
| `lib/sentry-bg.ts` | NEW — background-only `BrowserClient` + `Scope` init, `captureForwardedReport`, `installBackgroundGlobalHandlers` |
| `lib/reportError.ts` | NEW — bridge helper for content/popup to forward errors via `chrome.runtime.sendMessage` |
| `entrypoints/background.ts` | Added `SENTRY_REPORT` case to message switch + `installBackgroundGlobalHandlers()` boot call |
| `entrypoints/popup/Popup.tsx` | Added dev-only `🧪 Test Sentry` button + `handleTestSentry` handler |
| `wxt.config.ts` | Added `vite.build.sourcemap: 'hidden'` + `import.meta.env.WXT_EXTENSION_VERSION` injection from package.json |
| `package.json` | Version bump `0.5.10 → 0.5.11`; added `sourcemaps:upload` + `release` scripts; added `@sentry/browser`, `@sentry/cli`, `dotenv-cli` |
| `.gitignore` | Added `.env`, `.env.local`, `.env.*.local` (was missing — caught before any commit) |
| `.env.example` | NEW — template for `WXT_SENTRY_DSN` + `SENTRY_AUTH_TOKEN` |

---

## 3. Verification artifacts

### App
- Vercel preview at commit `72580df` (preview URL: `https://saasogv6-d1d5nlfiu-growwithfba.vercel.app`)
- Sentry issue `JAVASCRIPT-NEXTJS-2` ("SentryExampleFrontendError") — release `72580df7f5ea`, environment `preview`, source-mapped to `src/app/sentry-example-page/page.tsx:85`, trace ID `c48e8a7757584c17a1752674489b2bdf`
- Build log shows `Successfully uploaded source maps` for Node, Edge, Client (after fixing wizard's bad token — see section 6)

### Extension
- Local prod build at `bloom-lens-extension/.output/chrome-mv3` (loaded into Chrome via Load unpacked)
- Sentry issue `BLOOM-LENS-EXTENSION-1` ("Error: BloomLens v0.5.11 — async test") — release `0.5.11`, environment `production`, `handled: yes`, browser Chrome 147.0.0
- Source-map upload report: 4 .js files + 4 .js.map files, debug IDs assigned, bundle ID `506df430-9f96-585f-b0a3-404a5508cc65`

---

## 4. What's blocked / open

### Blocked on external approval
- **PR #48 merge** — needs Dave's greenlight on the Vercel preview build of `sprint-e/sentry-app` after the `896c6f2` (example-files-deleted) push. After greenlight: merge to dev, validate dev preview, merge to main on his explicit OK.
- **v0.5.11 Web Store push** — holding for v0.5.10 to clear Google's Web Store approval queue. Stacking unapproved versions compounds risk. Zip is built and ready (`bloom-lens-extension/.output/bloom-lens-extension-0.5.11-chrome.zip`).

### Decisions deferred (low priority)
- **Sentry × Vercel marketplace integration** — Dave manually pasted the 4 env vars instead of using the official integration. The integration auto-injects all four on link and would let Sentry auto-create releases tied to Vercel deployments. Worth revisiting if release tagging ever drifts.
- **Auth token rotation** — the org auth token (`org:ci` scope) leaked into chat once during setup. Scope is write-only for source-map upload + release creation, can't read error data, so blast radius is low. Rotate post-launch via Sentry → Developer Settings → Organization Tokens.

### Pre-existing carry-overs (not Sentry-related, surfaced in build logs)
- `/api/offer/list`, `/api/sourcing/list`, `/api/stripe/get-session` emit "Dynamic server usage" warnings during static generation. They use `request.headers` / `nextUrl.searchParams` so Next.js correctly treats them as dynamic at runtime. Noisy but non-blocking. Separate cleanup item if we ever want to silence them.

---

## 5. Lessons captured to memory

1. **Sentry plumbing — both surfaces** (`project_sentry_plumbing.md`). Architecture decisions, env-var conventions, quota constraints, privacy posture, what was declined and why. Use whenever touching error handling, instrumentation, or build pipeline.
2. **Wizard auth tokens can fail silently with HTTP 401** — `.env.sentry-build-plugin`'s wizard-generated user token was rejected as "Invalid org token" during source-map upload. Fix was to generate a fresh **Organization Auth Token** (Sentry → Developer Settings → Organization Tokens, fixed `org:ci` scope). The wizard's path is fine for local dev; CI/CD wants org tokens.
3. **Vite tree-shakes Sentry from extension build if `WXT_SENTRY_DSN` is undefined at build time.** First build had `background.js` at 8.24 KB (no Sentry); after writing `.env.local`, rebuild produced 86.58 KB (Sentry bundled). The tree-shake is intentional — it means dev builds without `.env.local` don't crash — but means **the build MUST run with `.env.local` present to actually include the SDK**.
4. **Console-typed `throw` in BG SW DevTools may not propagate to `self.addEventListener('error')`.** Synchronous `throw new Error(...)` from console can run in V8's anonymous frame and bypass the global handler. Use `setTimeout(() => { throw new Error(...) }, 0)` for reliable testing — it goes through the event loop.
5. **`.env.local` was NOT gitignored in the extension repo.** Caught before any commit, but the secret was already on disk. Added `.env`, `.env.local`, `.env.*.local` patterns to the extension's `.gitignore`. Worth a one-time audit pass on any future repo: check `git check-ignore -v .env.local` BEFORE writing it.

---

## 6. Sprint E status (V9 launch readiness)

| Item | Status | Notes |
|---|---|---|
| Soft-launch shape — open Web Store launch | ✅ decided 2026-05-09 | Tightened all downstream items |
| Sentry monitoring (app + extension) | ✅ **shipped to dev / queued for Web Store** | This handoff |
| Email + BloomEngine-specific Skool community | 🟡 Dave to spin up new Skool space | His call when |
| Pricing page polish (yearly toggle, Helium 10 pattern) | 🔜 next code item | Already specced in `project_pricing_yearly_toggle.md` |
| Single landing page (hero + features + CTA) | 🔜 after pricing | Needs design direction first |
| Lightweight onboarding tour (driver.js / react-joyride) | 🔜 after landing page | Coordinates with Dave's Loom-button refresh |
| LEARN-button Loom videos for v9 | 🟡 Dave records + swaps URLs | Existing infra; just content swap |
| 90-120s demo video for Web Store + landing page | 🟡 Dave records | Web Store listings convert ~2x with video |

---

## 7. Next-session entry point

Use the kickoff prompt at `docs/handoffs/sprint-e-1-kickoff-prompt.md` (paired file).

Three immediate things to handle:
1. Check PR #48 status; if Vercel preview is green, ask Dave to validate, then drive the dev → main merge.
2. Check BloomLens v0.5.10 Web Store status. If approved, push v0.5.11 zip.
3. Pick the next Sprint E code item (recommend **pricing page polish** — smallest scoped, already specced, unblocks Web Store conversion math).

DON'T auto-merge PR #48. DON'T push v0.5.11 to Web Store without confirming v0.5.10 cleared first.

---

## 8. Standing rules (don't break)

1. PRs target `dev`, never `main` without explicit instruction.
2. Push to feature/dev branches without asking; only `main` requires explicit OK.
3. Don't punt the merge to Dave — push + PR + merge are mine to drive after greenlight.
4. Never combine commit + merge + push in one chained command.
5. One test link per testing round. Bundle multiple PRs onto dev or a single feature branch.
6. Verify Supabase schema before trusting persistence.
7. NO ROUND NUMBERS in displayed metrics (BSR-curve drives display).
8. No "Keepa" in user-facing copy.
9. "BloomLens" is one word.
10. No Stripe-hosted page redirects.
11. Tolerance-based numeric checks for AI / rounded values.
12. Production deploys from `main`. Dev = preview.
13. `effectiveTier` ≠ `tier` for display.
14. Adjustments and Expansions are separate concepts.
15. **BloomLens always hits production**, regardless of preview URL.
16. Some `/vetting/[asin]` matrix metrics are client-side derived from `competitors`, not from a persisted column. Recalc only changes score, AI briefing, BSR/Price stability.
17. Charm-pricing — Value/Competitive/Premium tiers snap to nearest `.99`.
18. Optional numeric schema fields land as `undefined`. Use `isFiniteNumber()` for value guards.
19. **NEW (2026-05-09): Sentry `beforeSend` filtering required on any new noisy error path** — 5k/mo free-tier quota. Add patterns to the filters in `instrumentation-client.ts` / `sentry.server.config.ts` whenever a new noisy error class emerges.
