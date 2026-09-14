import type { ReactNode } from 'react';
import { SECTION_ACCENT, type SurfacePhase } from './surfaces';

/**
 * A heading for a group of controls inside a panel.
 *
 * The header's light rule in miniature: ONE full-width line that is lit in
 * the page's phase hue at the left and dims along its length, with a soft
 * bloom over the lit part. A single line, not a stub on top of a hairline,
 * so it never reads as two misaligned pieces. Thinner and quieter than the
 * page title's beam, which stays the loudest line on the page.
 */
export function SectionHeading({
  phase,
  children,
  className = '',
}: {
  phase: SurfacePhase;
  children: ReactNode;
  className?: string;
}) {
  const accent = SECTION_ACCENT[phase];
  return (
    <h3 className={`relative mb-5 pb-2.5 text-lg font-semibold text-slate-900 dark:text-white ${className}`}>
      {children}
      {/* The rule: bright at the left, fading to a faint tint at the right. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r ${accent.rule}`}
      />
      {/* The bloom over the lit part. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-[3px] translate-y-[1px] blur-[2px] bg-gradient-to-r ${accent.bloom}`}
      />
    </h3>
  );
}
