'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Which columns show, in what order, at what width — remembered on this
 * device under `${storageKey}.visible` / `.order` / `.widths`.
 *
 * Reads happen after mount so server and first client render agree (the
 * server has no localStorage). Unknown ids from an older save are dropped, and
 * ids added to the registry since are appended so a new column appears rather
 * than silently never rendering.
 */
export function useColumnPrefs(
  storageKey: string,
  allIds: readonly string[],
  defaultVisible: readonly string[],
) {
  const [visible, setVisibleState] = useState<string[]>([...defaultVisible]);
  const [order, setOrderState] = useState<string[]>([...allIds]);
  const [widths, setWidthsState] = useState<Record<string, number>>({});

  const known = allIds.join('|');

  useEffect(() => {
    const all = known.split('|').filter(Boolean);
    const knownSet = new Set(all);
    try {
      const v = JSON.parse(localStorage.getItem(`${storageKey}.visible`) ?? 'null');
      if (Array.isArray(v)) {
        const kept = v.filter((id): id is string => typeof id === 'string' && knownSet.has(id));
        if (kept.length > 0) setVisibleState(kept);
      }
    } catch { /* privacy mode or corrupt value */ }
    try {
      const o = JSON.parse(localStorage.getItem(`${storageKey}.order`) ?? 'null');
      if (Array.isArray(o)) {
        const kept = o.filter((id): id is string => typeof id === 'string' && knownSet.has(id));
        setOrderState([...kept, ...all.filter((id) => !kept.includes(id))]);
      } else {
        setOrderState(all);
      }
    } catch { setOrderState(all); }
    try {
      const w = JSON.parse(localStorage.getItem(`${storageKey}.widths`) ?? 'null');
      if (w && typeof w === 'object' && !Array.isArray(w)) setWidthsState(w);
    } catch { /* ignore */ }
  }, [storageKey, known]);

  const persist = (suffix: string, value: unknown) => {
    try {
      localStorage.setItem(`${storageKey}.${suffix}`, JSON.stringify(value));
    } catch { /* privacy mode or quota — the choice just won't persist */ }
  };

  const setVisible = useCallback((ids: string[]) => {
    setVisibleState(ids);
    persist('visible', ids);
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const setOrder = useCallback((ids: string[]) => {
    setOrderState(ids);
    persist('order', ids);
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const setWidths = useCallback((w: Record<string, number>) => {
    setWidthsState(w);
    persist('widths', w);
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { visible, setVisible, order, setOrder, widths, setWidths };
}
