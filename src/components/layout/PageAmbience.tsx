/**
 * The soft light behind every app page — the same two glows the login page
 * has: blue drifting in from the top-left, green from the bottom-right, the
 * two ends of the brand's spectrum. Fixed to the viewport so a long page keeps
 * its atmosphere while scrolling. Dark mode only; light mode's page gradient
 * already has enough separation from a white panel.
 *
 * Render as the first child of a `relative isolate` wrapper so the glows sit
 * above the wrapper's background but below everything else.
 */
export function PageAmbience() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-40 -left-40 -z-10 hidden dark:block h-[560px] w-[560px] rounded-full bg-blue-500/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-40 -right-40 -z-10 hidden dark:block h-[560px] w-[560px] rounded-full bg-emerald-500/10 blur-3xl"
      />
    </>
  );
}
