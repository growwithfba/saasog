/**
 * The one table look shared by Discovery, the research funnel and the vetting
 * competitor matrix. Ported from the Bloom Lens drawer and settled on
 * Discovery (the version Dave signed off on 2026-09-11): 11px uppercase
 * headers with an always-visible sort chevron, 15px body text, thin column
 * rules, a header that stays put, and identity columns pinned to the left.
 *
 * Anything table-wide lives here so the three surfaces cannot drift apart
 * again. Per-cell content (pills, badges, links) stays with each table.
 */

/** Wrapper that scrolls in both directions; the header and pinned columns
 *  stick inside it. Height follows the window rather than a fixed cap. */
export const TABLE_SCROLL = 'overflow-auto max-h-[calc(100vh-13rem)]';

/** Fixed layout so a dragged width is honoured exactly; minWidth keeps a
 *  narrow column set from floating in half the card. Pass as `style`. */
export const TABLE_STYLE = { tableLayout: 'fixed', minWidth: '100%' } as const;

export const TABLE = 'text-[15px]';

/** Header row: the bottom rule under every header cell. */
export const HEAD_ROW = 'border-b border-gray-200 dark:border-sky-400/15';

/** Every header cell, pinned or not. Sticky to the top of the scroll box. */
export const HEAD_CELL =
  'sticky top-0 z-20 bg-white dark:bg-[#0b1324] select-none py-3 text-left align-middle font-semibold uppercase tracking-wide text-[11px] leading-tight text-gray-500 dark:text-slate-400';

/** A header cell pinned to the left edge as well: above the header row (z-20)
 *  and above the pinned body cells (z-10). Add `left-*` per column. */
export const HEAD_CELL_PINNED = `${HEAD_CELL} left-0 z-30`;

/** Body row. `group/row` lets pinned cells follow the row's hover tint. */
export const ROW = 'group/row border-b border-gray-100 dark:border-sky-400/[0.08] transition-colors';

export const rowTint = (selected: boolean) =>
  selected
    ? 'bg-blue-500/5 dark:bg-blue-500/10 hover:bg-blue-500/10 dark:hover:bg-blue-500/[0.14]'
    : 'hover:bg-slate-50 dark:hover:bg-sky-400/[0.05]';

/** Body cell with the thin column rule on its right. */
export const CELL =
  'px-3 py-3 align-middle border-r border-gray-100 dark:border-sky-400/[0.07] text-gray-700 dark:text-slate-300';

/** The rule between the pinned block and the scrolling columns is a touch
 *  stronger so the boundary reads while scrolling. */
export const CELL_PINNED_EDGE = 'border-r border-gray-200 dark:border-sky-400/20';

/**
 * Opaque background for a left-pinned body cell. The row's own tints are
 * translucent, which is fine for cells that scroll with it but would let the
 * scrolled columns show through a sticky one — so these are the same tints
 * flattened onto the card: white / the panel navy, the blue-500 selection wash, and
 * the slate hover wash.
 */
export const pinnedBg = (selected: boolean) =>
  selected
    ? 'bg-[#f3f7fe] group-hover/row:bg-[#e9f0fd] dark:bg-[#13223e] dark:group-hover/row:bg-[#152746]'
    : 'bg-white group-hover/row:bg-slate-50 dark:bg-[#0b1324] dark:group-hover/row:bg-[#111c33]';

/** A body cell pinned to the left edge. Add `left-*` and a width per column. */
export const pinnedCell = (selected: boolean) =>
  `sticky z-10 align-middle transition-colors ${pinnedBg(selected)}`;

/** Widths of the standard pinned columns, so offsets line up everywhere.
 *  Checkbox 40px, then an optional 32px action gutter, then a 96px image
 *  (80px thumbnail + 8px either side). */
export const PINNED = {
  checkbox: { className: 'w-10 px-2', left: 'left-0', width: 40 },
  action: { className: 'w-8 px-1', left: 'left-10', width: 32 },
  /** Image directly after the checkbox. */
  imageAfterCheckbox: { className: 'w-[96px] px-2', left: 'left-10', width: 96 },
  /** Image after checkbox + action gutter. */
  imageAfterAction: { className: 'w-[96px] px-2', left: 'left-[72px]', width: 96 },
} as const;

/** Narrower than this and a header label has nowhere to go. */
export const MIN_COLUMN_WIDTH = 96;
