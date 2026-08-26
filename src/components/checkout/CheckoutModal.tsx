'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import type { BillingInterval, Tier } from '@/lib/subscription/tiers';
import { StripeEmbeddedCheckout } from './StripeEmbeddedCheckout';

/**
 * Phase 5.4-M Checkout modal.
 *
 * Hosts the Stripe Embedded Checkout iframe in a centered overlay so the
 * user never leaves /plans. Closing via backdrop click, X button, or ESC.
 *
 * The fetcher closure regenerates per-render based on (tier, billingInterval,
 * appliedCode) so the modal can reopen for a different tier without stale
 * state. Stripe caches the session by client_secret, so a fresh fetch per
 * modal open is the right contract.
 *
 * Promo codes are entered HERE rather than inside Stripe's iframe. Two
 * reasons, both learned the hard way during the 2026-08 cohort launch:
 * we can't enforce "cohort codes are monthly-only" on a code Stripe
 * collects for us, and we can't correct the "7-day free trial" header
 * when the customer is actually getting six months. Owning the field
 * fixes both — the summary below reflects the real offer.
 */

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  tier: Tier | null;
  billingInterval: BillingInterval;
}

export function CheckoutModal({ isOpen, onClose, tier, billingInterval }: CheckoutModalProps) {
  const [codeInput, setCodeInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [promoSummary, setPromoSummary] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
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

  // Switching tier or interval invalidates an applied code — a cohort
  // code valid on monthly is not valid on yearly, so silently carrying it
  // across a toggle would resurrect the exact bug this field prevents.
  useEffect(() => {
    setAppliedCode(null);
    setPromoSummary(null);
    setPromoError(null);
    setCodeInput('');
  }, [tier, billingInterval]);

  const applyCode = useCallback(async () => {
    const code = codeInput.trim();
    if (!code || !tier) return;
    setCheckingCode(true);
    setPromoError(null);
    try {
      const res = await fetch('/api/stripe/validate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, tier, billingInterval }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setPromoError(data?.error || 'Could not apply that code.');
        setAppliedCode(null);
        setPromoSummary(null);
        return;
      }
      setAppliedCode(code);
      setPromoSummary(data.summary as string);
    } catch {
      setPromoError('Could not check that code. Please try again.');
    } finally {
      setCheckingCode(false);
    }
  }, [codeInput, tier, billingInterval]);

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch('/api/stripe/embedded-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier,
        billingInterval,
        ...(appliedCode ? { promotionCode: appliedCode } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data?.success || !data?.clientSecret) {
      throw new Error(data?.error || 'Failed to start checkout');
    }
    return data.clientSecret as string;
  }, [tier, billingInterval, appliedCode]);

  if (!isOpen || !tier) return null;

  const tierLabel = tier === 'core' ? 'Core' : 'Pro';
  // With a full-comp code applied there is no 7-day trial — the coupon is
  // the free period. Say what the customer is actually getting.
  const offerLabel = promoSummary ?? '7-day free trial';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Start BloomEngine ${tierLabel} — ${offerLabel}`}
    >
      <div
        className="bg-slate-900 rounded-2xl border border-slate-700/60 shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
          <div>
            <p
              className={`text-xs uppercase tracking-wider mb-0.5 ${
                promoSummary ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              {offerLabel}
            </p>
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

        <div className="px-6 py-3 border-b border-slate-700/60">
          {appliedCode ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-emerald-400 flex items-center gap-2 min-w-0">
                <Check className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  <span className="font-semibold">{appliedCode}</span> applied — {promoSummary}
                </span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setAppliedCode(null);
                  setPromoSummary(null);
                  setCodeInput('');
                }}
                className="text-xs text-slate-400 hover:text-white underline shrink-0"
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value);
                    setPromoError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void applyCode();
                    }
                  }}
                  placeholder="Promo code (optional)"
                  aria-label="Promo code"
                  autoCapitalize="characters"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 uppercase"
                />
                <button
                  type="button"
                  onClick={() => void applyCode()}
                  disabled={!codeInput.trim() || checkingCode}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {checkingCode && <Loader2 className="w-4 h-4 animate-spin" />}
                  Apply
                </button>
              </div>
              {promoError && (
                <p className="mt-2 text-sm text-red-400" role="alert">
                  {promoError}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Keyed on the applied code so changing it rebuilds the Stripe
              session — the discount is baked into the session at creation. */}
          <StripeEmbeddedCheckout
            key={appliedCode ?? 'no-code'}
            fetchClientSecret={fetchClientSecret}
          />
        </div>
      </div>
    </div>
  );
}
