'use client';

// =============================================================================
// MetaPixelTracker — fires PageView on every Next.js App Router navigation
// =============================================================================
// The base Pixel snippet in layout.tsx fires PageView ONCE on initial page
// load. But Next.js App Router uses client-side navigation — subsequent route
// changes don't reload the page, so Meta would miss them.
//
// This component listens to `usePathname()` changes and manually fires
// PageView on each navigation. Mounted once at the layout root.
// =============================================================================

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { generateEventId } from '@/lib/meta';

export default function MetaPixelTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fbq = (window as any).fbq;
    if (typeof fbq !== 'function') return;

    const eventId = generateEventId();
    const url = pathname + (searchParams?.toString() ? `?${searchParams}` : '');

    // Browser Pixel — fires PageView with a unique event_id for dedup
    try {
      fbq('track', 'PageView', {}, { eventID: eventId });
    } catch {
      // Silent — Pixel failures shouldn't crash the app
    }

    // Server CAPI — mirror the PageView so we capture ad-blocked visitors too
    try {
      void fetch('/api/meta/capi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: 'PageView',
          event_id: eventId,
          event_source_url: window.location.origin + url,
        }),
        keepalive: true,
      });
    } catch {
      // Silent
    }
  }, [pathname, searchParams]);

  return null;
}
