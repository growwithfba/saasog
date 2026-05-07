'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle,
  Clock,
  Loader2,
  Rocket,
  Sparkles,
  Sprout,
  X,
  Zap,
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { Footer } from '@/components/layout/Footer';
import { CheckoutModal } from '@/components/checkout/CheckoutModal';
import type { BillingInterval, Tier } from '@/lib/subscription/tiers';

interface CapDetail {
  used: number;
  limit: number | null;
  remaining: number | null;
}

interface UsagePayload {
  success: boolean;
  tier: Tier;
  effectiveTier: Tier;
  billingInterval: BillingInterval | null;
  isInTrial: boolean;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  caps: { vetting: CapDetail; ssp: CapDetail };
}

const TIER_DISPLAY: Record<Tier, { name: string; tagline: string; icon: typeof Sprout; color: string; iconBg: string; iconColor: string }> = {
  core: {
    name: 'BloomEngine Core',
    tagline: 'Advanced research & product development',
    icon: Sprout,
    color: 'from-blue-400 to-cyan-400',
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
  },
  pro: {
    name: 'BloomEngine Pro',
    tagline: 'For serious brand builders',
    icon: Rocket,
    color: 'from-emerald-400 to-blue-400',
    iconBg: 'bg-emerald-500/20',
    iconColor: 'text-emerald-400',
  },
};

function SubscriptionContent() {
  const router = useRouter();
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        router.push('/login');
        return;
      }
      const res = await fetch('/api/subscription/usage', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load subscription');
      }
      setUsage(data as UsagePayload);
    } catch (err) {
      setUsageError(err instanceof Error ? err.message : 'Failed to load subscription');
    } finally {
      setUsageLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const handleCancel = async () => {
    setCanceling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/stripe/cancel', {
        method: 'POST',
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Cancellation failed');
      }
      setCancelMessage({ kind: 'success', message: data.message });
      setShowCancelModal(false);
      await loadUsage();
    } catch (err) {
      setCancelMessage({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Cancellation failed',
      });
    } finally {
      setCanceling(false);
    }
  };

  const handleReactivate = async () => {
    setReactivating(true);
    setCancelMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/stripe/reactivate', {
        method: 'POST',
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not resume subscription');
      }
      setCancelMessage({ kind: 'success', message: data.message });
      await loadUsage();
    } catch (err) {
      setCancelMessage({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not resume subscription',
      });
    } finally {
      setReactivating(false);
    }
  };

  if (usageLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (usageError || !usage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-400 dark:border-red-500/50 rounded-xl p-6 max-w-md">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
            <div>
              <h3 className="text-red-700 dark:text-red-300 font-semibold mb-1">Couldn&apos;t load subscription</h3>
              <p className="text-red-600 dark:text-red-300 text-sm">{usageError ?? 'Unknown error'}</p>
              <button
                onClick={loadUsage}
                className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg text-red-300 text-sm transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tierDisplay = TIER_DISPLAY[usage.tier];
  const TierIcon = tierDisplay.icon;
  const trialDaysLeft = usage.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(usage.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex flex-col">
      <div className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <Link
            href="/profile"
            className="p-3 bg-white/80 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-xl transition-colors border border-gray-200 dark:border-slate-700/50"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Subscription</h1>
            <p className="text-gray-600 dark:text-slate-400">Your plan, usage, and billing</p>
          </div>
        </div>

        {cancelMessage && (
          <div
            className={`mb-6 rounded-xl p-4 flex items-start gap-3 ${
              cancelMessage.kind === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-400 dark:border-emerald-500/50'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-400 dark:border-red-500/50'
            }`}
          >
            {cancelMessage.kind === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            )}
            <p
              className={`text-sm ${
                cancelMessage.kind === 'success'
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-red-700 dark:text-red-300'
              }`}
            >
              {cancelMessage.message}
            </p>
          </div>
        )}

        {/* Plan Card */}
        <div className="bg-white/90 dark:bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-8 shadow-lg mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-6 mb-6">
            <div className={`w-16 h-16 ${tierDisplay.iconBg} rounded-2xl flex items-center justify-center shadow-md flex-shrink-0`}>
              <TierIcon className={`w-8 h-8 ${tierDisplay.iconColor}`} />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h2 className={`text-2xl font-bold bg-gradient-to-r ${tierDisplay.color} bg-clip-text text-transparent`}>
                  {tierDisplay.name}
                </h2>
                {usage.isInTrial && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold uppercase tracking-wider rounded-full">
                    <Sparkles className="w-3 h-3" />
                    Trial
                    {usage.tier === 'core' && (
                      <span className="font-semibold normal-case tracking-normal text-emerald-200/90">
                        · Pro features unlocked
                      </span>
                    )}
                  </span>
                )}
              </div>
              <p className="text-gray-600 dark:text-slate-400">{tierDisplay.tagline}</p>
              {usage.billingInterval && !usage.isInTrial && (
                <p className="text-sm text-gray-500 dark:text-slate-500 mt-1">
                  Billed {usage.billingInterval}
                </p>
              )}
            </div>

            {usage.tier === 'core' && (
              <button
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20 whitespace-nowrap"
              >
                <Zap className="w-4 h-4" />
                Upgrade to Pro
              </button>
            )}
          </div>

          {usage.isInTrial && trialDaysLeft !== null && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-emerald-300 mb-0.5">
                  {trialDaysLeft === 0
                    ? 'Trial ends today'
                    : trialDaysLeft === 1
                      ? '1 day left in your trial'
                      : `${trialDaysLeft} days left in your trial`}
                </p>
                <p className="text-emerald-200/80 text-xs">
                  We&apos;ll charge you for {usage.tier === 'pro' ? 'Pro' : 'Core'} when your trial ends. Cancel anytime before then for free.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Usage Card */}
        <div className="bg-white/90 dark:bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-8 shadow-lg mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">This period&apos;s usage</h3>
            {usage.currentPeriodStart && (
              <p className="text-xs text-gray-500 dark:text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Resets {nextResetLabel(usage.currentPeriodStart)}
              </p>
            )}
          </div>

          <div className="space-y-5">
            <UsageBar
              label="Product Vettings"
              used={usage.caps.vetting.used}
              limit={usage.caps.vetting.limit}
            />
            <UsageBar
              label="SSP Generations"
              used={usage.caps.ssp.used}
              limit={usage.caps.ssp.limit}
            />
          </div>

          {usage.tier === 'core' && (
            <p className="text-xs text-gray-500 dark:text-slate-500 mt-6">
              Need more?{' '}
              <button
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className="text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 font-medium underline-offset-2 hover:underline"
              >
                Upgrade to Pro
              </button>{' '}
              for unlimited everything.
            </p>
          )}
        </div>

        {/* Cancel / Resume zone */}
        {usage.cancelAtPeriodEnd ? (
          <div className="bg-amber-50 dark:bg-amber-500/5 backdrop-blur-xl rounded-2xl border border-amber-300 dark:border-amber-500/30 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
              <div className="flex items-start gap-3 flex-1">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                    Subscription ending {formatCancelDate(usage.cancelAt)}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-slate-400">
                    You&apos;ll keep full access until then. Change your mind? Resume anytime before that date.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleReactivate}
                disabled={reactivating}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20 whitespace-nowrap"
              >
                {reactivating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Resuming…
                  </>
                ) : (
                  <>
                    Resume subscription
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white/40 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/40 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="text-sm text-gray-600 dark:text-slate-400 flex-1">
                Need to cancel? You&apos;ll keep full access until your billing period ends — re-subscribe anytime.
              </p>
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-red-500/40 text-red-500 dark:text-red-400 hover:bg-red-500/10 hover:border-red-500/60 text-sm font-medium rounded-xl transition-colors whitespace-nowrap"
              >
                Cancel subscription
              </button>
            </div>
          </div>
        )}
      </div>

      <Footer />

      {/* Upgrade modal — only meaningful when user is on Core */}
      <CheckoutModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        tier="pro"
        billingInterval={usage.billingInterval ?? 'yearly'}
      />

      {/* Cancel confirm modal */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => !canceling && setShowCancelModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-slate-900 rounded-2xl border border-red-500/40 shadow-2xl max-w-md w-full p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => !canceling && setShowCancelModal(false)}
              disabled={canceling}
              className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center mb-5">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Cancel your subscription?</h3>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              You&apos;ll keep full access until the end of your current billing period. After that, your account
              loses access to vetting, SSP generation, and the Chrome Extension. You can re-subscribe anytime.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                disabled={canceling}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                Keep my subscription
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={canceling}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {canceling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Canceling…
                  </>
                ) : (
                  <>
                    Cancel subscription
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const isUnlimited = limit === null;
  const ratio = isUnlimited || limit === 0 ? 0 : Math.min(1, used / limit);
  const pct = ratio * 100;
  const tone =
    isUnlimited
      ? 'from-emerald-500 to-blue-500'
      : ratio >= 1
        ? 'from-red-500 to-red-400'
        : ratio >= 0.8
          ? 'from-amber-500 to-amber-400'
          : 'from-emerald-500 to-emerald-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{label}</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          {isUnlimited ? (
            <span className="inline-flex items-center gap-1 text-emerald-500 dark:text-emerald-400">
              <Zap className="w-3.5 h-3.5" />
              Unlimited
            </span>
          ) : (
            `${used} / ${limit}`
          )}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-200 dark:bg-slate-700/60 overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${tone} rounded-full transition-all`}
          style={{ width: `${isUnlimited ? 100 : pct}%` }}
        />
      </div>
    </div>
  );
}

function nextResetLabel(currentPeriodStart: string): string {
  // Period start + 30 days ≈ next reset (close enough for display; actual
  // reset comes via Stripe webhook on subscription renewal).
  const start = new Date(currentPeriodStart);
  const reset = new Date(start);
  reset.setMonth(reset.getMonth() + 1);
  return reset.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatCancelDate(iso: string | null): string {
  if (!iso) return 'soon';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        </div>
      }
    >
      <SubscriptionContent />
    </Suspense>
  );
}
