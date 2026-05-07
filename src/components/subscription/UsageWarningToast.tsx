'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, X } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

/**
 * Phase 5.4-M usage warning toast.
 *
 * Mounts on any authenticated page that wants to surface "you're running
 * low on Core caps" awareness. Polls /api/subscription/usage on mount,
 * shows a non-blocking toast for any action where used >= 80% of limit.
 *
 * Pro users + active trials never see it (effectiveTier === 'pro').
 *
 * Dismissing the toast persists in sessionStorage for the rest of the
 * tab session — re-shows on a fresh page load if usage is still >=80%.
 */

const WARN_THRESHOLD = 0.8;
const DISMISS_KEY = 'bloomengine.usageWarning.dismissed';

interface UsageResponse {
  success: boolean;
  effectiveTier: 'core' | 'pro';
  caps: {
    vetting: { used: number; limit: number | null };
    ssp: { used: number; limit: number | null };
  };
}

interface WarnState {
  action: 'vetting' | 'ssp';
  used: number;
  limit: number;
}

export function UsageWarningToast() {
  const [warn, setWarn] = useState<WarnState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const dismissedThisSession =
      typeof window !== 'undefined' && window.sessionStorage.getItem(DISMISS_KEY) === '1';
    if (dismissedThisSession) return;

    const probe = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/subscription/usage', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as UsageResponse;
        if (cancelled || !data.success || data.effectiveTier === 'pro') return;

        // Find the most-used action that's at or above the warn threshold.
        const candidates: WarnState[] = (['vetting', 'ssp'] as const)
          .map((action) => {
            const c = data.caps[action];
            if (c.limit === null) return null;
            const ratio = c.limit > 0 ? c.used / c.limit : 0;
            return ratio >= WARN_THRESHOLD ? { action, used: c.used, limit: c.limit } : null;
          })
          .filter((x): x is WarnState => x !== null)
          .sort((a, b) => b.used / b.limit - a.used / a.limit);

        if (candidates[0]) setWarn(candidates[0]);
      } catch {
        // Silent — toast is opportunistic, not critical.
      }
    };

    probe();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!warn) return null;

  const label = warn.action === 'vetting' ? 'product vettings' : 'SSP generations';
  const dismiss = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    }
    setWarn(null);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[90] max-w-sm">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 backdrop-blur-xl shadow-lg">
        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white mb-0.5">
            You&apos;ve used {warn.used} / {warn.limit} {label} this period
          </p>
          <p className="text-xs text-amber-200/90">
            <Link
              href="/subscription"
              className="font-medium text-amber-100 hover:text-white underline-offset-2 hover:underline"
            >
              Upgrade to Pro
            </Link>{' '}
            for unlimited.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 text-amber-300/80 hover:text-amber-100 transition-colors flex-shrink-0"
          aria-label="Dismiss usage warning"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
