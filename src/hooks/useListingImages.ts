'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, ensureAnonymousSession } from '@/utils/supabaseClient';

// Resolve a list of ASINs to their Amazon CDN image URLs (and the brand
// Keepa returned alongside) via the cached /api/keepa/listing-images
// endpoint. Cache is keyed by ASIN with a 30-day TTL — repeat calls
// across pages share the same cache row.
//
// Lifted from ProductVettingResults.tsx (commit 7b8db0d) so the same
// data flow can power dashboards, list rows, and the product header.
//
// `ensureAnonymousSession` is awaited as a fallback so the share view
// (public, unauthenticated) can also resolve thumbnails.
//
// Returns Maps keyed by upper-cased ASIN. Soft-fails silently to empty
// maps on network/parse errors — callers should treat the data as
// optional and fall back to a placeholder when an ASIN isn't present.

type ListingImagesPayload = {
  listings?: Record<string, { imageUrl: string | null; brand: string | null } | null>;
};

// /api/keepa/listing-images caps the response at 100 ASINs (its own
// MAX_ASINS_PER_REQUEST). Big funnels (200+ products) need chunking
// or alphabetically-late ASINs silently fall out of the response even
// when their cache row exists.
const REQUEST_CHUNK_SIZE = 100;

const sanitizeAsin = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return cleaned.length === 10 ? cleaned : null;
};

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function useListingImages(asins: Array<string | null | undefined>): {
  imageUrlByAsin: Map<string, string>;
  brandByAsin: Map<string, string>;
  loading: boolean;
} {
  const [imageUrlByAsin, setImageUrlByAsin] = useState<Map<string, string>>(new Map());
  const [brandByAsin, setBrandByAsin] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);

  // Stable, sorted, de-duplicated, uppercased ASIN list — drives the
  // effect's dependency check so we don't re-fetch on every render
  // when the caller hands us a freshly-mapped array each time.
  const normalizedKey = useMemo(() => {
    const set = new Set<string>();
    for (const a of asins) {
      const clean = sanitizeAsin(a);
      if (clean) set.add(clean);
    }
    return Array.from(set).sort().join(',');
  }, [asins]);

  useEffect(() => {
    const list = normalizedKey ? normalizedKey.split(',') : [];
    if (list.length === 0) {
      setImageUrlByAsin(new Map());
      setBrandByAsin(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        let token = data.session?.access_token;
        if (!token) {
          await ensureAnonymousSession();
          const refreshed = await supabase.auth.getSession();
          token = refreshed.data.session?.access_token;
        }
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        // Fan out chunks in parallel — endpoint is cache-first so most
        // chunks hit Supabase only, no Keepa cost.
        const chunks = chunk(list, REQUEST_CHUNK_SIZE);
        const responses: Array<ListingImagesPayload | null> = await Promise.all(
          chunks.map(async (batch): Promise<ListingImagesPayload | null> => {
            try {
              const res = await fetch('/api/keepa/listing-images', {
                method: 'POST',
                headers,
                cache: 'no-store',
                body: JSON.stringify({ asins: batch }),
              });
              if (!res.ok) return null;
              return (await res.json().catch(() => null)) as ListingImagesPayload | null;
            } catch {
              return null;
            }
          })
        );

        const imgMap = new Map<string, string>();
        const brandMap = new Map<string, string>();
        for (const payload of responses) {
          const listings = payload?.listings;
          if (!listings) continue;
          for (const [asin, entry] of Object.entries(listings)) {
            const e = entry as { imageUrl?: string | null; brand?: string | null } | null;
            if (e?.imageUrl && typeof e.imageUrl === 'string') {
              imgMap.set(asin, e.imageUrl);
            }
            if (e?.brand && typeof e.brand === 'string') {
              brandMap.set(asin, e.brand);
            }
          }
        }
        if (!cancelled) {
          setImageUrlByAsin(imgMap);
          setBrandByAsin(brandMap);
        }
      } catch {
        // Best-effort — surfaces fall back to placeholder rendering.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [normalizedKey]);

  return { imageUrlByAsin, brandByAsin, loading };
}
