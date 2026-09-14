/**
 * Surface and control classes shared across the app — the one place that
 * decides how a panel, a field, a button or a chip looks, the way
 * DataTable/styles.ts does for tables.
 *
 * Three levels of depth so hierarchy reads at a glance instead of blending.
 * In dark mode depth goes DOWN, not up: lighter tones on this palette turn
 * grey, and grey is not the brand. So each level is a deeper navy than the
 * one above it, and the edges carry a blue tint rather than a grey line:
 *
 *   page   — slate-900 (MainTemplate / PageShell backgrounds)
 *   PANEL  — a step darker than the page, blue-tinted hairline, a lit edge
 *            along the top in the phase hue
 *   field  — darker still, sunk into the panel; border brightens toward the
 *            phase hue on hover, ring on focus
 *
 * Light mode is the ordinary way round: white panel on the grey page,
 * grey-50 wells.
 *
 * Buttons come in three ranks so "press me" is never ambiguous: primary is
 * solid in the page's phase hue, secondary is a tinted chip in the same hue
 * (the nav-pill treatment — never a grey fill, never an outline, which reads
 * as an empty field), tertiary is text.
 *
 * Every class string is a literal so Tailwind's scanner sees it; never build
 * these by interpolating a colour name.
 */

import type { PhaseType } from '@/utils/phaseStyles';

/** Which phase hue a surface speaks. Same names the nav pills use. */
export type SurfacePhase = PhaseType;

// ---------------------------------------------------------------------------
// Panels and popovers
// ---------------------------------------------------------------------------

export const PANEL =
  'rounded-2xl border border-slate-200 dark:border-sky-400/15 bg-white dark:bg-[#0b1324] ' +
  'shadow-sm dark:shadow-[inset_0_1px_0_0_rgba(56,189,248,0.2),0_12px_32px_-12px_rgba(0,0,0,0.8)]';

/** A panel with its standard inner padding. */
export const PANEL_PAD = `${PANEL} p-6`;

/** A floating menu above a panel: one step lighter than the panel, heavier shadow. */
export const POPOVER =
  'rounded-xl border border-slate-300 dark:border-sky-400/25 bg-white dark:bg-[#0e172d] shadow-2xl';

/**
 * Dark-mode panel tone as a literal, for anything that must be OPAQUE and sit
 * flush inside a panel — sticky table headers and pinned cells. Keep in step
 * with PANEL above.
 */
export const PANEL_TONE_DARK = '#0b1324';

/** The strip of tabs along the top of a panel. */
export const PANEL_TABS =
  'flex border-b border-slate-200 dark:border-sky-400/15 bg-gray-50 dark:bg-sky-400/[0.03]';

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

const FIELD_BASE =
  'rounded-lg border bg-gray-50 dark:bg-[#0a1226] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] ' +
  'text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 ' +
  'border-slate-300 hover:border-slate-400 focus:outline-none focus:ring-2 transition-colors';

/** Dark-mode edge tint per phase: quiet at rest, brighter on hover, lit on focus. */
const FIELD_FOCUS: Record<SurfacePhase, string> = {
  research:
    'dark:border-blue-400/25 dark:hover:border-blue-400/50 focus:border-blue-400 dark:focus:border-blue-400 focus:ring-blue-500/30',
  vetting:
    'dark:border-cyan-400/25 dark:hover:border-cyan-400/50 focus:border-cyan-400 dark:focus:border-cyan-400 focus:ring-cyan-500/30',
  offer:
    'dark:border-emerald-400/25 dark:hover:border-emerald-400/50 focus:border-emerald-400 dark:focus:border-emerald-400 focus:ring-emerald-500/30',
  sourcing:
    'dark:border-teal-400/25 dark:hover:border-teal-400/50 focus:border-teal-400 dark:focus:border-teal-400 focus:ring-teal-500/30',
};

const FIELD_SIZE = {
  md: 'px-4 py-3 text-[15px]',
  sm: 'px-3 py-2 text-sm',
} as const;

export type FieldSize = keyof typeof FIELD_SIZE;

/**
 * An input, select or picker trigger. `full` adds `w-full` (the default —
 * fields fill their grid cell); pass false for an inline control like a
 * rows-per-page select.
 */
export function field(phase: SurfacePhase, size: FieldSize = 'md', full = true): string {
  return `${full ? 'w-full ' : ''}${FIELD_BASE} ${FIELD_FOCUS[phase]} ${FIELD_SIZE[size]}`;
}

/**
 * A field-shaped BUTTON (a picker trigger). Same look, but the ring shows
 * only for keyboard focus — a mouse click must not leave it lit after the
 * menu closes, or it reads as "selected" at rest.
 */
export function fieldButton(phase: SurfacePhase, size: FieldSize = 'md'): string {
  return field(phase, size).replace(/\bfocus:/g, 'focus-visible:').replace(/\bdark:focus:/g, 'dark:focus-visible:');
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors ' +
  'disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2';

const BUTTON_SIZE = {
  md: 'px-5 py-2.5 text-sm',
  sm: 'px-4 py-2 text-sm',
} as const;

export type ButtonSize = keyof typeof BUTTON_SIZE;

const PRIMARY_PHASE: Record<SurfacePhase, string> = {
  research:
    'text-white bg-blue-600 hover:bg-blue-500 shadow-[0_6px_18px_-6px_rgba(59,130,246,0.6)] focus-visible:ring-blue-400/60',
  vetting:
    'text-white bg-cyan-600 hover:bg-cyan-500 shadow-[0_6px_18px_-6px_rgba(34,162,184,0.6)] focus-visible:ring-cyan-400/60',
  offer:
    'text-white bg-emerald-600 hover:bg-emerald-500 shadow-[0_6px_18px_-6px_rgba(24,183,154,0.6)] focus-visible:ring-emerald-400/60',
  sourcing:
    'text-white bg-teal-600 hover:bg-teal-500 shadow-[0_6px_18px_-6px_rgba(20,184,166,0.6)] focus-visible:ring-teal-400/60',
};

/** The one action on a panel that moves the user forward. Solid, phase-hued. */
export function primaryButton(phase: SurfacePhase, size: ButtonSize = 'md'): string {
  return `${BUTTON_BASE} ${BUTTON_SIZE[size]} ${PRIMARY_PHASE[phase]}`;
}

const SECONDARY_PHASE: Record<SurfacePhase, string> = {
  research:
    'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-100 hover:bg-blue-500/20 hover:border-blue-400/60 focus-visible:ring-blue-400/50',
  vetting:
    'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-100 hover:bg-cyan-500/20 hover:border-cyan-400/60 focus-visible:ring-cyan-400/50',
  offer:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100 hover:bg-emerald-500/20 hover:border-emerald-400/60 focus-visible:ring-emerald-400/50',
  sourcing:
    'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-100 hover:bg-teal-500/20 hover:border-teal-400/60 focus-visible:ring-teal-400/50',
};

/** Tinted in the phase hue — clearly a button, clearly not the main one. */
export function secondaryButton(phase: SurfacePhase, size: ButtonSize = 'md'): string {
  return `${BUTTON_BASE} ${BUTTON_SIZE[size]} font-medium border ${SECONDARY_PHASE[phase]}`;
}

/** Text only, for quiet actions like collapse / show more. */
export const TERTIARY_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ' +
  'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white ' +
  'hover:bg-slate-100 dark:hover:bg-sky-400/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40';

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

const CHIP_BASE =
  'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
  'focus:outline-none focus-visible:ring-2';

/**
 * A clickable chip in the phase hue — the same family as the nav pills, so it
 * reads as a button on sight rather than as an outlined field.
 */
export const CHIP: Record<SurfacePhase, string> = {
  research:
    `${CHIP_BASE} border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-200 ` +
    'hover:bg-blue-500/20 hover:border-blue-400/70 hover:shadow-[0_0_14px_rgba(59,130,246,0.3)] focus-visible:ring-blue-400/50',
  vetting:
    `${CHIP_BASE} border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200 ` +
    'hover:bg-cyan-500/20 hover:border-cyan-400/70 hover:shadow-[0_0_14px_rgba(34,162,184,0.3)] focus-visible:ring-cyan-400/50',
  offer:
    `${CHIP_BASE} border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 ` +
    'hover:bg-emerald-500/20 hover:border-emerald-400/70 hover:shadow-[0_0_14px_rgba(24,183,154,0.3)] focus-visible:ring-emerald-400/50',
  sourcing:
    `${CHIP_BASE} border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-200 ` +
    'hover:bg-teal-500/20 hover:border-teal-400/70 hover:shadow-[0_0_14px_rgba(20,184,166,0.3)] focus-visible:ring-teal-400/50',
};

// ---------------------------------------------------------------------------
// Section rule
// ---------------------------------------------------------------------------

/**
 * A section heading's rule: one full-width line, lit in the phase hue at the
 * left and dimming to a faint tint at the right, plus a soft bloom that
 * fades out over the lit part. Light mode uses the same hues at lower alpha.
 */
export const SECTION_ACCENT: Record<SurfacePhase, { rule: string; bloom: string }> = {
  research: {
    rule: 'from-blue-400/90 via-blue-400/35 to-blue-400/10',
    bloom: 'from-blue-400/60 via-blue-400/15 to-transparent',
  },
  vetting: {
    rule: 'from-cyan-400/90 via-cyan-400/35 to-cyan-400/10',
    bloom: 'from-cyan-400/60 via-cyan-400/15 to-transparent',
  },
  offer: {
    rule: 'from-emerald-400/90 via-emerald-400/35 to-emerald-400/10',
    bloom: 'from-emerald-400/60 via-emerald-400/15 to-transparent',
  },
  sourcing: {
    rule: 'from-teal-400/90 via-teal-400/35 to-teal-400/10',
    bloom: 'from-teal-400/60 via-teal-400/15 to-transparent',
  },
};
