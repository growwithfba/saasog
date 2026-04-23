# Market Signals Redesign — Proposal

**Author:** Claude (paired with Dave)
**Date:** 2026-04-23
**Status:** Draft — for review before implementation

## Why this exists

Dave's feedback: the current Market Signals tab is confusing and not pulling the power out of the Keepa API. The user-facing numbers ("Price Stability %", "Demand Stability %", "Promo Frequency %") are opaque — most users don't understand what they mean or how to act on them. The Competitors tab under Market Signals is unclear; promos/stockouts is a good concept but broken. The Helium 10 / X-Ray data in **Detailed Competitor Analysis** covers the last 30 days; Market Signals should cover the longer timeframe (12+ months) that Keepa is actually good at.

## Framing

Two separate concerns, kept as two separate sections:

| Section | Question it answers | Data source |
|---|---|---|
| Detailed Competitor Analysis (existing) | Who are my competitors RIGHT NOW and how strong is each one? | H10 X-Ray (30-day snapshot) |
| **Market History** (replaces Market Signals) | Is this market **healthy over time**, and what do the trends say? | Keepa (12–24 months) |

Market History should be readable top-to-bottom by a first-time seller in under a minute and walk away with a clear answer to: *"would I rather enter this market now, or avoid it?"*

## Proposed structure — four sections

### 1. The Big Picture Chart (top, full-width)

A single overlaid line chart showing all top-5 competitors over the selected timeframe (12 months default, 24-month toggle).

- Toggle between **BSR**, **Price**, and **Both** (dual-axis)
- One color per competitor, legend labeled with brand + short title
- Monthly market-wide average as a dashed reference line
- Season-aware X-axis (months labeled, quarters shaded subtly)
- Hover shows exact values for all visible series at that date

This is the "recreate Keepa charts for all top 5" piece from Dave's notes, in one chart instead of five.

### 2. At a Glance (three compact cards, side-by-side)

Replaces the current Price Stability % / Demand Stability % / Promo Freq % columns. Numbers alone don't help users — a verdict + sparkline does.

**Card A — Price Climate.** Mini sparkline of median price across top 5 + plain-English verdict:
- "Stable" / "Climbing" / "Declining" / "Volatile"
- One-sentence explanation: *"Prices have drifted up ~8% over the last year — a market that's accepting higher price points."*

**Card B — Demand Climate.** Same pattern for BSR volatility:
- "Steady demand" / "Seasonal swings" / "Slowing" / "Growing"
- Explainer: *"BSR has been steady with a 20% lift each November — modest seasonality."*

**Card C — Seasonal Peak.** Inferred peak months + lift magnitude:
- *"Peaks in Oct–Dec — expect roughly 2× normal demand during the holiday window."*
- If no clear seasonality: *"No strong seasonal pattern — demand is roughly year-round."*

On hover, a tooltip can reveal the underlying numeric stability % for users who want it — but the verdict is the primary signal.

### 3. Promos & Stockouts (annotations on the main chart)

Instead of a separate broken view, overlay events on the Big Picture Chart:

- **Promo events**: vertical markers when Keepa detected sustained discounts across any top-5 competitor. Marker color = how many competitors discounted at once.
- **Stockouts**: red gaps in a competitor's line when Keepa shows it was out of stock for ≥2 days.
- Below the chart, a short summary: *"4 major promo events in the last 12 months, mostly in Q4. Two of the top 5 had meaningful stockouts, suggesting supply-chain variance."*

### 4. AI Market Insights (bottom, single paragraph)

A 3–5 sentence AI-generated briefing of what the Keepa data says about this market, long-term. Uses the same voice as the Phase 2.7 vetting summary (plain English, banned-phrase list applied). Example output:

> *"This market has been remarkably stable on price, with the top 5 holding median prices within 5% of each other for a year. Demand has a clear Q4 peak — November and December run about 2× normal volume — so a launch in August or September gives you time to rank before the surge. The main risk: all five top competitors have run promos simultaneously at least twice, suggesting the category is promo-sensitive and new entrants may feel pressure to discount early."*

Same pattern as vetting summary: cached in a new `market_history_summary` column on submissions, only regenerated when the underlying Keepa data meaningfully changes.

## What to drop

- The "Price Stability %", "Demand Stability %", "Promo Freq %" numeric columns as primary display. Keep as hover-tooltip detail.
- The separate **Moat & Concentration** tab (per Dave's note). Any useful signal there can be folded into Card A/B/C as a one-liner if needed.

## What to link across sections

Small cross-referential affordances:

- Click a competitor's brand chip in Detailed Competitor Analysis → scrolls to their line in the Big Picture Chart, highlighting it.
- "Adjusted view" state from Phase 2.7 → hide removed competitors from the Big Picture Chart (or gray them out with a toggle). Default: hide.

## Open design questions for Dave

1. **Default timeframe** — 12 or 24 months? More history = more signal but also more API load. My lean: **12 months default, 24-month toggle**.
2. **Stability verdicts hover details** — show exact stability % on hover, or just the verdict? My lean: **show the % on hover** so power users can dig in.
3. **AI insights generation** — auto-run like vetting summary, or click-to-generate? Vetting summary is auto; for consistency, auto here too. But this doubles Anthropic cost per submission. My lean: **auto on initial view, cache aggressively**.
4. **Removed competitors in Market History** — hide them, gray them out, or always show? My lean: **hide by default, with a "show all" toggle**.

## Technical notes (for when we build it)

- Keepa API already returns 12-24 months of BSR + price history per ASIN — the data is there.
- Cache the processed history in a new `submission_data.marketHistory` JSONB field so we're not re-calling Keepa on every view.
- Use `recharts` (already in the codebase) for the Big Picture Chart — same patterns as existing KeepaTrendsTab.
- AI insights prompt follows Phase 2.7 `vettingSummary.ts` pattern: role prompt + banned jargon list + tool schema + plain-English examples.
- New column/JSONB for cached insights — analogous to how we added `originalSnapshot` + `adjustment` in Phase 2.7.

## Rough sequencing when we build this

Small enough to phase, not all at once:

1. **Phase 2.8a** — Big Picture Chart (replaces Market Signals primary view). Keep existing sub-tabs reachable via a "legacy view" link until 2.8b+ ship.
2. **Phase 2.8b** — At-a-Glance cards (Price/Demand/Seasonal).
3. **Phase 2.8c** — Promo/stockout annotations + summary line.
4. **Phase 2.8d** — AI insights paragraph.
5. **Phase 2.8e** — Cross-linking with Detailed Competitor Analysis; drop legacy view.

Each can ship on its own branch and merge independently.
