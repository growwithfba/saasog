/** The classic five-point star, as a path so a half-filled one can be clipped. */
const STAR_PATH =
  'M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.31l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.94L12 2.5z';

function Row({ className, style }: { className: string; style?: React.CSSProperties }) {
  return (
    <span className={`flex items-center gap-px ${className}`} style={style} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className="w-3 h-3 shrink-0" fill="currentColor">
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

/**
 * A rating as five stars plus the number, matching the Lens drawer.
 *
 * Two stacked rows with the filled one clipped to a percentage width, rather
 * than five individually-filled glyphs: a 4.3 then renders as four stars and
 * three tenths of a fifth, instead of rounding to a half star it isn't.
 *
 * The stars are amber because that is what a star is, not because of the value
 * — no tier colouring here, per the decision to leave value colours out.
 */
export function StarRating({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value / 5)) * 100;
  return (
    <span className="inline-flex items-center gap-1.5" title={`${value.toFixed(1)} out of 5`}>
      <span className="relative inline-flex shrink-0">
        <Row className="text-gray-300 dark:text-slate-700" />
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${pct}%` }}
        >
          <Row className="text-amber-500 dark:text-amber-400" />
        </span>
      </span>
      <span className="text-xs font-semibold tabular-nums">{value.toFixed(1)}</span>
    </span>
  );
}
