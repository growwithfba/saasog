# Light-mode contract — BloomEngine (written 2026-09-12; the rules every light-mode pass follows)

You are adding LIGHT MODE to components that were written dark-only. Tailwind
uses `darkMode: 'class'` (`dark:` prefix). Members default to dark; dark is
signed off and must render pixel-identical after your change.

## The one rule
Every class that only makes sense on a dark background gets a light default,
and the existing dark value keeps rendering under `dark:`.
  `bg-slate-800/50 text-white border-slate-700/50`
  → `bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white border-[#1e3a8a]/[0.12] dark:border-slate-700/50`
Never delete or alter what dark renders. Never change copy, layout, spacing,
casing or behaviour. Colour only.

## Tokens — import from '@/components/ui/surfaces' (read that file first)
- PANEL / PANEL_PAD — a card. POPOVER — a floating menu. PANEL_TABS — tab strip.
- HAIRLINE = 'border-[#1e3a8a]/[0.12] dark:border-sky-400/15' — the standard rule.
- HAIRLINE_SOFT — rows inside a list. WELL_LIGHT = '#f5f8fd' — light well tone.
- field(phase, 'sm'|'md', full) — inputs/selects. fieldButton(...) — picker triggers.
- primaryButton(phase), secondaryButton(phase), TERTIARY_BUTTON, CHIP[phase].
- SectionHeading (ui/SectionHeading.tsx) — a heading with the phase rule.
Phase for everything on the vetting pages is 'vetting' (cyan). The "Build
Offering" forward action is 'offer' (emerald). Use the helpers when a thing IS
a panel/field/button/chip; otherwise use the literal light values below.

## Light palette (literal values; use these, not gray-*)
- page: cool off-white (already set by the shell). panel: `bg-white`.
- well / sunk area / table header: `bg-[#f5f8fd]`. hover wash: `bg-[#f3f6fc]`.
- rule: `border-[#1e3a8a]/[0.12]`; stronger rule `border-[#1e3a8a]/20`; softer `/[0.08]`.
- text: heading `text-slate-900`, body `text-slate-700`, secondary `text-slate-500`,
  disabled/placeholder `text-slate-400`. NEVER text-white / slate-100/200/300
  without `dark:`.
- Never `bg-gray-*`, `border-gray-*`, `bg-slate-100/200` — grey is not the brand.

## Colour discipline in light
- Hue lives in icons, bars, chips, links and the ACTIVE state. Not in text.
- Big numbers and metric values are ink (`text-slate-900 dark:<existing>`).
- Semantic verdicts (PASS/RISKY/FAIL, STRONG/DECENT/WEAK, GOOD/HIGH etc.) are
  allowed as small BADGES: `bg-emerald-50 text-emerald-800 border-emerald-200`
  (amber-50/800/200, red-50/800/200, sky-50/800/200) + `dark:` keeps the old.
  A verdict WORD that is the hero of a card (e.g. the big "RISKY") may keep its
  hue; its bar keeps its hue. Everything else near it is ink.
- A metric that today is coloured text (e.g. "73%" in orange, "13 / 23" in
  green, "Moderate" in amber) becomes ink text with a 6px coloured dot before it
  (`<span class="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />`) in
  light. In dark, keep the coloured text: make the dot `dark:hidden` and the
  text `text-slate-900 dark:text-amber-400` (whatever it was).
- Heat-tinted table cells (value on a pink/amber/green pill): light = the
  badge recipe above, value text 800-weight so it is readable. Dimmed rows
  (recommended removals): light = `bg-red-50/70` row wash, text NOT dimmed
  below slate-600. Faint values (slate-300/400 on white) → slate-500 minimum.
- Coloured panel BORDERS (border-emerald-500/40 etc.) → light `border-[#1e3a8a]/[0.12]`
  and `dark:` keeps the colour. A 2px coloured TOP edge is fine if it exists.

## Glows and shadows
- Every glow is dark-only: `shadow-[0_0_...]`, `drop-shadow(...)`, blur halos,
  `shadow-<hue>-500/20` → prefix `dark:`. Inline `boxShadow`/`filter` glows:
  move the colour into a CSS variable and apply via a `dark:` class (see
  utils/phaseStyles.ts PROGRESS_BADGE_GLOW_CLASS for the pattern).
- Light panel shadow is already in PANEL; do not add others.

## Controls
- Segmented controls / range pills / filter chips: light rest =
  `bg-white border-[#1e3a8a]/15 text-slate-700 hover:bg-[#f3f6fc]`; active =
  `bg-cyan-500/[0.12] border-cyan-600/60 text-cyan-800`. dark: keeps existing.
- Selects & inputs: `field('vetting','sm', false)` (or 'md'). Checkbox labels ink.
- Links (ASINs etc.): `text-blue-700 dark:text-blue-400`.
- Tab strips: active tab in light = `text-cyan-800 border-cyan-600`, resting
  `text-slate-600`; dark keeps existing.
- Buttons: primary → primaryButton('vetting'); secondary/back → secondaryButton('vetting').
- Modals: overlay `bg-slate-900/60`; dialog `bg-white dark:bg-[#0e172d] border ${HAIRLINE}`.

## Charts (Recharts / SVG)
- There is a hook `useIsDarkTheme` (grep src/hooks). Light values:
  grid `#dbe3f0`, axis line `#94a3b8`, tick text `#475569`, reference lines
  `#64748b`, tooltip `bg-white border-[#1e3a8a]/20 text-slate-900`.
  Series colours (bars/lines) stay as they are. Bar/line HOVER strokes that
  are white (`#F8FAFC`) → `#0f172a` in light.
- Chart container: `bg-white dark:<existing>`, `${HAIRLINE}` border.

## Process
1. Read the whole file first. Work top to bottom.
2. Class strings must stay literal (Tailwind scans source). Don't build class
   names by interpolation of a colour name.
3. When done, run from repo root:
   `npx tsc --noEmit -p . 2>&1 | grep -v '^keepa-tests/'` — must print nothing.
   Then grep your files for leftovers:
   `grep -nE "(^|[^:a-z-])(bg-slate-(7|8|9)00|bg-gray-(7|8|9)00|text-white|text-slate-(1|2|3)00|text-gray-(1|2|3)00|border-slate-(6|7|8)00|border-white|bg-white/[0-9])" <file>`
   Every remaining hit must be either preceded by `dark:` on the same token or
   a deliberate always-dark element (say which).
4. Do NOT run `npm run build`, `git add/commit/stash`, or touch files outside
   your list. Do not reformat unrelated lines.
5. Report: files changed, what each region became, anything you left and why.
