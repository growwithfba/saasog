/**
 * App-wide switches for features that are built but paused.
 *
 * LEARN_ENABLED — the Learn buttons, the Learning Hub links in both profile
 * menus, the landing-page footer link, the Learn modals and the /learn page
 * itself. Off while the Loom materials are redone (Dave, 2026-09-11); flip
 * to true to bring every entry point back at once.
 */
export const LEARN_ENABLED = false;

/**
 * THEME_TOGGLE_ENABLED — the Appearance card on /profile with the light /
 * dark switch. Light mode is not member-ready, so this stays off in
 * production; on locally while the light palette is being checked
 * (Dave, 2026-09-12). Members default to dark either way.
 */
export const THEME_TOGGLE_ENABLED = true;
