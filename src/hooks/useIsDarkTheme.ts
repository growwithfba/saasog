'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the page is currently in dark mode — for code that has to pick a
 * colour in JS rather than in a class (Recharts props, inline gradients).
 * Reads the `dark` class on <html> and follows the Appearance toggle live.
 * Class-based styling should use `dark:` variants instead; reach for this
 * only where a class cannot do the job.
 */
export function useIsDarkTheme(): boolean {
  const [isDarkTheme, setIsDarkTheme] = useState(true);

  useEffect(() => {
    const checkTheme = () => {
      setIsDarkTheme(document.documentElement.classList.contains('dark'));
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDarkTheme;
}
