'use client';

import { useEffect, useState } from 'react';

/**
 * Detect whether the BloomEngine Chrome Extension is installed in the
 * current browser.
 *
 * Detection contract: the extension's content script (running on
 * https://*.bloomengine.ai/*) sets
 * `document.documentElement.dataset.bloomengineExtension = 'installed'`
 * on inject, and dispatches a `bloomengine:extension-detected` event on
 * window so React can react synchronously even if the dataset was set
 * before this hook mounted.
 *
 * Used to gate every "Get Extension" CTA on the marketing + app surfaces
 * — installed users never see promo, brand-new users see it everywhere
 * it matters.
 */
export function useExtensionInstalled(): boolean {
  const [installed, setInstalled] = useState(false);

  // TEMP (2026-05-06): detection disabled while Dave audits placements
  // from his own browser (which has the extension installed). Re-enable
  // by deleting this early-return after Web Store v0.5.8 is approved
  // and the bloomengine-flag.content.ts script is live in users' Chrome.
  // Until then, every "Get Extension" CTA renders for everyone.
  return false;

  // eslint-disable-next-line no-unreachable
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const check = () =>
      document.documentElement.dataset.bloomengineExtension === 'installed';

    if (check()) {
      setInstalled(true);
      return;
    }

    const onDetected = () => setInstalled(true);
    window.addEventListener('bloomengine:extension-detected', onDetected);

    // Belt-and-suspenders: re-check on a short interval to cover the race
    // where the extension injects after this effect runs but before
    // dispatching the event (e.g., older builds).
    const poll = window.setInterval(() => {
      if (check()) {
        setInstalled(true);
        window.clearInterval(poll);
      }
    }, 400);
    const stop = window.setTimeout(() => window.clearInterval(poll), 3000);

    return () => {
      window.removeEventListener('bloomengine:extension-detected', onDetected);
      window.clearInterval(poll);
      window.clearTimeout(stop);
    };
  }, []);

  return installed;
}
