'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, X, Zap } from 'lucide-react';

/**
 * Phase 5.4-M cap-reached modal.
 *
 * Renders when the user hits a hard cap on a gated action. The 402
 * response from the gated API endpoint includes the cap state, which
 * the caller passes in here as `cap`.
 *
 * Why a modal (vs a toast): hitting a cap is a flow-blocking event. The
 * user just clicked a primary action (Vet Product, Generate SSP) and
 * needs to make an upgrade decision before they can proceed. A toast
 * would be too easy to dismiss and re-trigger.
 */

export interface CapInfo {
  action: 'vetting' | 'ssp';
  used: number;
  limit: number;
  remaining: number;
  tier: 'core' | 'pro';
  effectiveTier: 'core' | 'pro';
}

interface CapReachedModalProps {
  isOpen: boolean;
  onClose: () => void;
  cap: CapInfo | null;
}

const ACTION_LABEL: Record<CapInfo['action'], string> = {
  vetting: 'Product Vettings',
  ssp: 'SSP Generations',
};

const ACTION_VERB: Record<CapInfo['action'], string> = {
  vetting: 'vet another product',
  ssp: 'generate another SSP',
};

export function CapReachedModal({ isOpen, onClose, cap }: CapReachedModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !cap) return null;

  const label = ACTION_LABEL[cap.action];
  const verb = ACTION_VERB[cap.action];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Plan limit reached"
    >
      <div
        className="bg-slate-900 rounded-2xl border border-blue-500/40 shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center mb-5 shadow-lg">
            <Sparkles className="w-7 h-7 text-white" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">
            You&apos;ve hit your monthly limit
          </h2>
          <p className="text-slate-400 leading-relaxed mb-6">
            You&apos;ve used <span className="font-semibold text-white">{cap.used} / {cap.limit}</span>{' '}
            {label.toLowerCase()} on the Core plan this period. Upgrade to Pro to {verb} (and unlock
            unlimited everything else).
          </p>

          {/* Mini comparison */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 overflow-hidden mb-6">
            <div className="grid grid-cols-2 divide-x divide-slate-700/60">
              <div className="p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Core (current)</p>
                <p className="text-sm font-semibold text-slate-300">25 vettings / mo</p>
                <p className="text-sm font-semibold text-slate-300">15 SSPs / mo</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-blue-500/10 to-emerald-500/10">
                <p className="text-[10px] uppercase tracking-wider text-blue-300 mb-1">Pro (upgrade)</p>
                <p className="text-sm font-semibold text-white flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  Unlimited vettings
                </p>
                <p className="text-sm font-semibold text-white flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  Unlimited SSPs
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Link
              href="/subscription"
              className="block w-full text-center px-6 py-3.5 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20 inline-flex items-center justify-center gap-2"
              onClick={onClose}
            >
              Upgrade to Pro
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="w-full text-center px-6 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
