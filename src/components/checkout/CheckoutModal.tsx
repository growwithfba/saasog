'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { BillingInterval, Tier } from '@/lib/subscription/tiers';
import { StripeEmbeddedCheckout } from './StripeEmbeddedCheckout';

/**
 * Phase 5.4-M Checkout modal.
 *
 * Hosts the Stripe Embedded Checkout iframe in a centered overlay so the
 * user never leaves /plans. Closing via backdrop click, X button, or ESC.
 *
 * Collect the optional code before creating the session. A failed redemption
 * stays on this form, so the customer cannot unknowingly continue at full price.
 */

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  tier: Tier | null;
  billingInterval: BillingInterval;
}

export function CheckoutModal({ isOpen, onClose, tier, billingInterval }: CheckoutModalProps) {
  const [promotionCode, setPromotionCode] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedPromotionCode, setAppliedPromotionCode] = useState<string | null>(null);
  const pendingRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    setClientSecret(null);
    setError(null);
    setAppliedPromotionCode(null);
    setStarting(false);
    // Preserve the entered code across modal/plan changes, but validate it again.
    return () => {
      pendingRequest.current?.abort();
      pendingRequest.current = null;
    };
  }, [isOpen, tier, billingInterval]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !starting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, starting]);

  const startCheckout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pendingRequest.current) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/embedded-checkout', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, billingInterval, promotionCode }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.clientSecret) {
        throw new Error(data?.error || 'Failed to start checkout');
      }
      if (controller.signal.aborted) return;
      setAppliedPromotionCode(data.appliedPromotionCode ?? null);
      setClientSecret(data.clientSecret);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      if (pendingRequest.current === controller) {
        pendingRequest.current = null;
        setStarting(false);
      }
    }
  };
  const fetchClientSecret = useCallback(async () => clientSecret!, [clientSecret]);

  if (!isOpen || !tier) return null;

  const tierLabel = tier === 'core' ? 'Core' : 'Pro';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={starting ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Start your 7-day free trial"
    >
      <div
        className="bg-slate-900 rounded-2xl border border-slate-700/60 shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-0.5">7-day free trial</p>
            <h2 className="text-lg font-semibold text-white">
              Starting BloomEngine {tierLabel} ({billingInterval})
            </h2>
          </div>
          <button
            type="button"
            onClick={starting ? undefined : onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close checkout"
            disabled={starting}
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {clientSecret ? (
            <>
              {appliedPromotionCode && (
                <p className="mb-3 text-sm text-emerald-300">
                  Code {appliedPromotionCode} applied. Review the discount and renewal terms below before subscribing.
                </p>
              )}
              <StripeEmbeddedCheckout fetchClientSecret={fetchClientSecret} />
            </>
          ) : (
            <form onSubmit={startCheckout} className="space-y-4 p-2">
              <label htmlFor="checkout-promotion-code" className="block text-sm text-slate-200">
                Promotion code (optional)
              </label>
              <input
                id="checkout-promotion-code"
                value={promotionCode}
                onChange={(event) => setPromotionCode(event.target.value)}
                disabled={starting}
                autoComplete="off"
                className="w-full rounded-lg border border-slate-600 bg-slate-800 p-3 text-white"
              />
              <p className="text-sm text-slate-400">
                If your membership includes free months, enter your code here before continuing.
                The 7-day trial alone does not include those free months.
              </p>
              {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
              <button type="submit" disabled={starting}
                className="w-full rounded-lg bg-emerald-600 p-3 font-semibold text-white disabled:opacity-50">
                {starting ? 'Checking…' : promotionCode.trim() ? 'Apply code and continue' : 'Continue without a code'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
