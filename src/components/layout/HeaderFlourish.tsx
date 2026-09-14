/**
 * The two decorative pieces of the cohort lockup, carried into the app
 * header: a thin light rule along the bottom edge that sweeps blue → cyan →
 * green → lime, and faint flow lines curving in from the far left (blue) and
 * far right (green). Both are purely decorative and sit behind the nav's
 * content. Render inside a `relative` nav — the clipping happens in here, in
 * an inset layer, so the nav itself can let a dropdown menu hang below it.
 */
/** Each cluster fades to nothing toward the centre, so the lines read as
 *  light drifting in from the edges rather than a strip that stops. */
const FADE_RIGHT = 'linear-gradient(to right, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0) 100%)';
const FADE_LEFT = 'linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0) 100%)';

export function HeaderFlourish() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Flow lines. Hidden below lg — on a narrow header they would run
          under the pills. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 hidden lg:block h-full w-[26rem] text-blue-600 dark:text-blue-500 opacity-[0.18] dark:opacity-45"
        style={{ maskImage: FADE_RIGHT, WebkitMaskImage: FADE_RIGHT }}
        viewBox="0 0 352 64"
        preserveAspectRatio="none"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.6"
      >
        <path d="M-10 4 C 70 2, 110 30, 190 26 S 300 6, 362 2" />
        <path d="M-10 14 C 60 16, 140 44, 220 36 S 330 14, 362 10" />
        <path d="M-10 26 C 90 22, 120 56, 200 50 S 320 26, 362 22" />
        <path d="M-10 40 C 50 46, 160 70, 240 60 S 340 38, 362 34" />
        <path d="M-10 54 C 100 50, 130 74, 210 68 S 350 52, 362 48" />
      </svg>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden lg:block h-full w-[26rem] text-emerald-600 dark:text-emerald-500 opacity-[0.18] dark:opacity-45"
        style={{ maskImage: FADE_LEFT, WebkitMaskImage: FADE_LEFT }}
        viewBox="0 0 352 64"
        preserveAspectRatio="none"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.6"
      >
        <path d="M362 4 C 282 2, 242 30, 162 26 S 52 6, -10 2" />
        <path d="M362 14 C 292 16, 212 44, 132 36 S 22 14, -10 10" />
        <path d="M362 26 C 262 22, 232 56, 152 50 S 32 26, -10 22" />
        <path d="M362 40 C 302 46, 192 70, 112 60 S 12 38, -10 34" />
        <path d="M362 54 C 252 50, 222 74, 142 68 S 2 52, -10 48" />
      </svg>

      {/* The light rule. A hairline the full width, with a brighter glow
          concentrated toward the middle so it reads as light rather than a
          painted stripe. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-sky-600/50 via-emerald-500 to-lime-500/60 dark:from-sky-400/30 dark:via-cyan-300 dark:to-lime-400/30"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 h-[3px] w-[38rem] max-w-[80%] -translate-x-1/2 translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-cyan-500 dark:via-cyan-300 to-transparent blur-[3px] opacity-60 dark:opacity-80"
      />
    </div>
  );
}
