'use client';

import { useEffect, useState } from 'react';
import { Chrome, X } from 'lucide-react';
import { useExtensionInstalled } from '@/hooks/useExtensionInstalled';

const EXTENSION_BASE_URL =
  'https://chromewebstore.google.com/detail/bloomengine/cighgincghljicihnhbhiehpngfpgbkg';

type Surface =
  | 'nav'
  | 'page-header'
  | 'vetting-empty'
  | 'research-empty'
  | 'pre-vetting-empty'
  | 'pricing'
  | 'landing'
  | 'settings'
  | 'csv-upload-vetting'
  | 'csv-upload-research';

type Variant = 'pill' | 'card' | 'inline-row' | 'banner';

interface Props {
  variant: Variant;
  surface: Surface;
  /** Allow the user to permanently dismiss this surface (localStorage). */
  dismissible?: boolean;
  /** Custom headline/copy override for card variants. */
  headline?: string;
  body?: string;
}

const dismissKey = (surface: Surface) =>
  `bloomengine.extensionCta.dismissed.${surface}`;

const buildHref = (surface: Surface) =>
  `${EXTENSION_BASE_URL}?utm_source=app&utm_medium=${surface}`;

/**
 * Single source of truth for any "Get the BloomEngine Chrome Extension"
 * CTA across the site. Auto-hides when the extension is installed (via
 * useExtensionInstalled) and supports per-surface dismissal so the user
 * can silence individual nags without affecting other surfaces.
 *
 * Variants:
 *   - 'pill'        — compact button for the top nav.
 *   - 'card'        — large card for empty states + pricing page.
 *   - 'inline-row'  — single row for sidebars (e.g., Profile > Connected Apps).
 */
export function ExtensionCTA({
  variant,
  surface,
  dismissible = false,
  headline,
  body,
}: Props) {
  const installed = useExtensionInstalled();
  const [dismissed, setDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!dismissible || typeof window === 'undefined') {
      setHydrated(true);
      return;
    }
    setDismissed(window.localStorage.getItem(dismissKey(surface)) === '1');
    setHydrated(true);
  }, [dismissible, surface]);

  if (!hydrated || installed || dismissed) return null;

  const href = buildHref(surface);

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(dismissKey(surface), '1');
    }
    setDismissed(true);
  };

  if (variant === 'pill') {
    // Sized to harmonize with the Learn button on PageTitleBlock
    // (px-4 py-2 rounded-lg). Blue tone visually distinguishes the
    // extension CTA from the gradient phase pills + the purple Learn.
    return (
      <div className="inline-flex items-center gap-1">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200 text-sm font-medium transition-colors"
          title="Install the BloomEngine Chrome Extension"
        >
          <Chrome className="w-4 h-4" />
          <span>Get Extension</span>
        </a>
        {dismissible && (
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
            title="Dismiss"
            aria-label="Dismiss extension prompt"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  if (variant === 'banner') {
    // Thin horizontal strip — sized to sit above/below a CSV dropzone
    // without competing visually for attention. Frames the extension
    // as the easier alternative to manual CSV upload.
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
        <Chrome className="w-5 h-5 text-blue-500 dark:text-blue-300 flex-shrink-0" />
        <div className="flex-1 min-w-0 text-sm">
          <span className="font-medium text-gray-900 dark:text-white">
            {headline ?? 'Skip the CSV — upload competitor data via the Chrome Extension'}
          </span>
          {body && (
            <p className="text-gray-600 dark:text-slate-400 mt-0.5">{body}</p>
          )}
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors flex-shrink-0"
        >
          <Chrome className="w-4 h-4" />
          Install Extension
        </a>
      </div>
    );
  }

  if (variant === 'inline-row') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between w-full px-4 py-3 bg-gray-100 dark:bg-slate-700/30 hover:bg-gray-200 dark:hover:bg-slate-700/50 rounded-lg text-gray-700 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white transition-colors group"
      >
        <span className="flex items-center gap-3">
          <Chrome className="w-4 h-4 text-blue-500 dark:text-blue-400" />
          <span className="text-sm font-medium">{headline ?? 'BloomEngine Chrome Extension'}</span>
        </span>
        <span className="text-xs font-medium text-blue-500 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300">
          Install
        </span>
      </a>
    );
  }

  // card
  return (
    <div className="relative bg-gradient-to-br from-blue-500/10 via-slate-800/40 to-emerald-500/10 backdrop-blur-xl rounded-2xl border border-blue-500/30 p-6 shadow-lg">
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
          title="Dismiss"
          aria-label="Dismiss extension prompt"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <div className="w-14 h-14 bg-gradient-to-br from-blue-500/30 to-emerald-500/30 rounded-2xl flex items-center justify-center shadow-md flex-shrink-0">
          <Chrome className="w-7 h-7 text-blue-300" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {headline ?? 'Get the BloomEngine Chrome Extension'}
          </h3>
          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
            {body ??
              'Vet products directly from Amazon search results — instant scoring, save to funnel, run market analysis without leaving the page.'}
          </p>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium rounded-xl transition-all shadow-md hover:shadow-lg whitespace-nowrap"
        >
          <Chrome className="w-4 h-4" />
          Install Extension
        </a>
      </div>
    </div>
  );
}
