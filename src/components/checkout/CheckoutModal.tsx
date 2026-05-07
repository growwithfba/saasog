'use client';

import { useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import type { BillingInterval, Tier } from '@/lib/subscription/tiers';
import { StripeEmbeddedCheckout } from './StripeEmbeddedCheckout';

/**
 * Phase 5.4-M Checkout modal.
 *
 * Hosts the Stripe Embedded Checkout iframe in a centered overlay so the
 * user never leaves /plans. Closing via backdrop click, X button, or ESC.
 *
 * The fetcher closure regenerates per-render based on (tier, billingInterval)
 * so the modal can reopen for a different tier without stale state. Stripe
 * caches the session by client_secret, so a fresh fetch per modal open is
 * the right contract.
 */

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  tier: Tier | null;
  billingInterval: BillingInterval;
}

export function CheckoutModal({ isOpen, onClose, tier, billingInterval }: CheckoutModalProps) {
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
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch('/api/stripe/embedded-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, billingInterval }),
    });
    const data = await res.json();
    if (!res.ok || !data?.success || !data?.clientSecret) {
      throw new Error(data?.error || 'Failed to start checkout');
    }
    return data.clientSecret as string;
  }, [tier, billingInterval]);

  if (!isOpen || !tier) return null;

  const tierLabel = tier === 'core' ? 'Core' : 'Pro';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
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
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close checkout"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <StripeEmbeddedCheckout fetchClientSecret={fetchClientSecret} />
        </div>
      </div>
    </div>
  );
}
