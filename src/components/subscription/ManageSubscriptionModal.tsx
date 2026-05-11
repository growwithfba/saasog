'use client';

import { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Sprout,
  X,
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import {
  CANCELLATION_REASONS,
  pickSaveOffer,
  type CancellationReason,
  type SaveOfferSpec,
} from '@/lib/subscription/cancellation';
import type { BillingInterval, Tier } from '@/lib/subscription/tiers';

type Step =
  | 'menu'
  | 'downgrade-confirm'
  | 'cancel-reason'
  | 'cancel-save'
  | 'cancel-confirm'
  | 'success';

interface ManageSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscriptionChanged: () => Promise<void> | void;
  tier: Tier;
  billingInterval: BillingInterval | null;
}

export function ManageSubscriptionModal({
  isOpen,
  onClose,
  onSubscriptionChanged,
  tier,
  billingInterval,
}: ManageSubscriptionModalProps) {
  const [step, setStep] = useState<Step>('menu');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');

  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [freeText, setFreeText] = useState('');
  const [saveOffer, setSaveOffer] = useState<SaveOfferSpec | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    if (submitting) return;
    setStep('menu');
    setReason(null);
    setFreeText('');
    setSaveOffer(null);
    setError(null);
    setSuccessMessage('');
    onClose();
  };

  const goBack = () => {
    setError(null);
    if (step === 'downgrade-confirm') setStep('menu');
    else if (step === 'cancel-reason') setStep('menu');
    else if (step === 'cancel-save') setStep('cancel-reason');
    else if (step === 'cancel-confirm') setStep(saveOffer?.kind === 'no_offer' ? 'cancel-reason' : 'cancel-save');
  };

  const handleDowngrade = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/stripe/change-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ tier: 'core' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Downgrade failed');
      }
      setSuccessMessage(
        "You've been downgraded to Core. Your billing is prorated automatically and the change takes effect immediately.",
      );
      setStep('success');
      await onSubscriptionChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Downgrade failed');
    } finally {
      setSubmitting(false);
    }
  };

  const advanceToSaveOffer = () => {
    if (!reason) return;
    const offer = pickSaveOffer(reason, tier);
    setSaveOffer(offer);
    if (offer.kind === 'no_offer') {
      setStep('cancel-confirm');
    } else {
      setStep('cancel-save');
    }
  };

  const handleSaveOfferAccept = async () => {
    if (!saveOffer || !reason || saveOffer.kind !== 'downgrade') return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/stripe/change-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ tier: 'core' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Downgrade failed');
      }
      setSuccessMessage(
        "You've been moved to Core instead of cancelling. Welcome back to the plan that fits.",
      );
      setStep('success');
      await onSubscriptionChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Downgrade failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/stripe/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({
          reason,
          free_text: freeText.trim() || undefined,
          attempted_save_offer: saveOffer?.kind ?? 'no_offer',
          accepted_save_offer: false,
          tier,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Cancellation failed');
      }
      setSuccessMessage(
        data.message ?? 'Your subscription is set to cancel at the end of the current period.',
      );
      setStep('success');
      await onSubscriptionChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancellation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-slate-900 rounded-2xl border border-slate-700/50 shadow-2xl max-w-lg w-full p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={submitting}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {step !== 'menu' && step !== 'success' && (
          <button
            type="button"
            onClick={goBack}
            disabled={submitting}
            className="absolute top-4 left-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {error && (
          <div className="mb-5 mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {step === 'menu' && (
          <>
            <h3 className="text-xl font-bold text-white mb-2 mt-2">Manage your subscription</h3>
            <p className="text-slate-400 text-sm mb-6">
              You can switch plans or cancel here. Cancellations take effect at the end of your current
              billing period.
            </p>
            <div className="space-y-3">
              {tier === 'pro' && (
                <button
                  type="button"
                  onClick={() => setStep('downgrade-confirm')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-700 hover:border-blue-500/60 bg-slate-800/40 hover:bg-slate-800/70 transition-all text-left"
                >
                  <div className="w-11 h-11 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <Sprout className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-semibold text-sm">Downgrade to Core</div>
                    <div className="text-slate-400 text-xs mt-0.5">
                      Keep BloomEngine at $39/mo (or $32/mo yearly). 25 analyses + 15 USPs per month.
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setStep('cancel-reason')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-red-500/30 hover:border-red-500/60 bg-red-500/5 hover:bg-red-500/10 transition-all text-left"
              >
                <div className="w-11 h-11 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <CalendarClock className="w-5 h-5 text-red-400" />
                </div>
                <div className="flex-1">
                  <div className="text-white font-semibold text-sm">Cancel subscription</div>
                  <div className="text-slate-400 text-xs mt-0.5">
                    Keep access until your current billing period ends, then your subscription ends.
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
              </button>
            </div>
          </>
        )}

        {step === 'downgrade-confirm' && (
          <>
            <h3 className="text-xl font-bold text-white mb-2 mt-2">Downgrade to Core?</h3>
            <p className="text-slate-400 text-sm mb-5 leading-relaxed">
              Your subscription switches to Core immediately. Stripe automatically prorates your billing —
              you&apos;ll get a credit for the unused portion of Pro applied to your next invoice.
            </p>
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Pro {billingInterval === 'yearly' ? '(yearly)' : '(monthly)'}</span>
                <span className="text-slate-500 line-through">${billingInterval === 'yearly' ? '79' : '99'}/mo</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2 pt-3 border-t border-slate-700/50">
                <span className="text-white font-semibold">Core {billingInterval === 'yearly' ? '(yearly)' : '(monthly)'}</span>
                <span className="text-emerald-400 font-semibold">${billingInterval === 'yearly' ? '32' : '39'}/mo</span>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={goBack}
                disabled={submitting}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                Keep Pro
              </button>
              <button
                type="button"
                onClick={handleDowngrade}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Downgrading…
                  </>
                ) : (
                  <>
                    Confirm downgrade
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {step === 'cancel-reason' && (
          <>
            <h3 className="text-xl font-bold text-white mb-2 mt-2">Why are you cancelling?</h3>
            <p className="text-slate-400 text-sm mb-5">
              Your answer goes straight to BloomEngine&apos;s founder — it shapes what we build next.
            </p>
            <div className="space-y-2 mb-4">
              {CANCELLATION_REASONS.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    reason === opt.id
                      ? 'border-blue-500/60 bg-blue-500/10'
                      : 'border-slate-700 hover:border-slate-600 bg-slate-800/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="cancellation-reason"
                    value={opt.id}
                    checked={reason === opt.id}
                    onChange={() => setReason(opt.id)}
                    className="sr-only"
                  />
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                      reason === opt.id
                        ? 'border-blue-400 bg-blue-400'
                        : 'border-slate-500'
                    }`}
                    aria-hidden
                  />
                  <span className="text-white text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Anything specific? (optional)"
              rows={3}
              className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:border-blue-500/60 focus:outline-none resize-none"
            />
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end mt-5">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Keep my subscription
              </button>
              <button
                type="button"
                onClick={advanceToSaveOffer}
                disabled={!reason}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-red-500/90 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {step === 'cancel-save' && saveOffer && (
          <>
            <h3 className="text-xl font-bold text-white mb-2 mt-2">{saveOffer.headline}</h3>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">{saveOffer.body}</p>
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => setStep('cancel-confirm')}
                disabled={submitting}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                {saveOffer.secondaryCta ?? 'Continue cancelling'}
              </button>
              {saveOffer.primaryCta && (
                <button
                  type="button"
                  onClick={handleSaveOfferAccept}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Working…
                    </>
                  ) : (
                    <>
                      {saveOffer.primaryCta}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        )}

        {step === 'cancel-confirm' && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center mb-5 mt-4">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Cancel your subscription?</h3>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              You&apos;ll keep full access until the end of your current billing period. After that, your
              account loses access to AI Market Analyses, AI Unique Selling Points, and the BloomLens
              Chrome Extension. You can re-subscribe anytime.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                Keep my subscription
              </button>
              <button
                type="button"
                onClick={handleCancelConfirm}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cancelling…
                  </>
                ) : (
                  <>
                    Yes, cancel subscription
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-5 mt-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">All set</h3>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">{successMessage}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white text-sm font-semibold rounded-xl transition-all"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
