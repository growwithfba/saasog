'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children into document.body via a React portal.
 *
 * Why we need this: many of our app's containers use `backdrop-blur-*`
 * which establishes a CSS containing block for `position: fixed`
 * children (per the CSS spec on `filter` / `backdrop-filter`). That
 * silently traps modals inside the blurred parent — the modal renders
 * relative to the parent's box instead of the viewport, so a "centered"
 * modal can end up offset down the page.
 *
 * Wrapping the modal in <Portal> renders it as a child of <body>, which
 * has no transform / filter / backdrop-filter, so `fixed inset-0` works
 * the way the modal's author intended.
 *
 * SSR-safe: returns null on the first server render and on the first
 * client render before useEffect runs, then mounts into document.body.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
