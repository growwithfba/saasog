'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';

interface SaveStatusPillProps {
  isSaving: boolean;
  lastSavedAt: number | null;
  isDirty: boolean;
}

function formatRelative(ms: number, now: number) {
  const diff = Math.max(0, now - ms);
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export function SaveStatusPill({ isSaving, lastSavedAt, isDirty }: SaveStatusPillProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lastSavedAt) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  if (isSaving) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[12px]">
        <Loader2 className="w-3 h-3 animate-spin" />
        Saving…
      </div>
    );
  }

  if (lastSavedAt && !isDirty) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[12px]">
        <CheckCircle className="w-3 h-3" />
        Saved · {formatRelative(lastSavedAt, now)}
      </div>
    );
  }

  return null;
}
