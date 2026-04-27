'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';

// Read/write a single column-visibility preference key from
// profiles.preferences via /api/profiles/preferences. Falls back to
// localStorage when the user isn't logged in or the network call fails
// — so picker selections survive a refresh on the share view too.
//
// `initial` is the default visibility map. The hook does NOT replace
// the caller's setState — it returns a wrapped setter that mirrors
// changes back to the API + localStorage. The caller continues to own
// the column-visibility state itself.

type VisibilityMap = Record<string, boolean>;

const STORAGE_PREFIX = 'bloomengine.columnPrefs.';
// Debounce writes — column toggles tend to come in bursts when the user
// fiddles with the picker.
const PERSIST_DELAY_MS = 400;

export function useColumnPreferences(
  preferenceKey: string,
  initial: VisibilityMap
): {
  visibleColumns: VisibilityMap;
  setVisibleColumns: (next: VisibilityMap | ((prev: VisibilityMap) => VisibilityMap)) => void;
  hydrated: boolean;
} {
  const [visibleColumns, setLocal] = useState<VisibilityMap>(initial);
  const [hydrated, setHydrated] = useState(false);
  const persistTimer = useRef<number | null>(null);
  const localKey = `${STORAGE_PREFIX}${preferenceKey}`;

  // Hydrate on mount: prefer server preferences; fall back to local.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Try localStorage first so the picker doesn't flash defaults.
      try {
        const cached = typeof window !== 'undefined' ? window.localStorage.getItem(localKey) : null;
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === 'object') {
            setLocal((prev) => ({ ...prev, ...parsed }));
          }
        }
      } catch {
        // Ignore localStorage errors.
      }

      // 2. Then ask the server — overrides local if they disagree.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) setHydrated(true);
          return;
        }
        const res = await fetch('/api/profiles/preferences', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) setHydrated(true);
          return;
        }
        const payload = await res.json().catch(() => null);
        const remote = payload?.preferences?.[preferenceKey];
        if (remote && typeof remote === 'object' && !cancelled) {
          setLocal((prev) => ({ ...prev, ...(remote as VisibilityMap) }));
        }
      } catch {
        // Best-effort; defaults already applied.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // preferenceKey is the only stable dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferenceKey]);

  const setVisibleColumns = useCallback<typeof setLocal>(
    (next) => {
      setLocal((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: VisibilityMap) => VisibilityMap)(prev) : next;
        // Local cache write — synchronous, survives refresh while the API write is pending.
        try {
          window.localStorage.setItem(localKey, JSON.stringify(resolved));
        } catch {
          // Quota or private mode — ignore.
        }
        // Debounced API write.
        if (persistTimer.current) window.clearTimeout(persistTimer.current);
        persistTimer.current = window.setTimeout(async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return;
            await fetch('/api/profiles/preferences', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ preferences: { [preferenceKey]: resolved } }),
            });
          } catch {
            // Local cache still has it; next session will re-sync.
          }
        }, PERSIST_DELAY_MS);
        return resolved;
      });
    },
    [localKey, preferenceKey]
  );

  // Flush pending write on unmount so a quick toggle right before
  // navigation isn't lost.
  useEffect(() => {
    return () => {
      if (persistTimer.current) {
        window.clearTimeout(persistTimer.current);
        persistTimer.current = null;
      }
    };
  }, []);

  return { visibleColumns, setVisibleColumns, hydrated };
}
