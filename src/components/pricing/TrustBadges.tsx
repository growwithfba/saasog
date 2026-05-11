'use client';

import { CreditCard, Lock, RefreshCw, ShieldCheck } from 'lucide-react';

const BADGES = [
  {
    icon: Lock,
    label: 'Stripe-secured checkout',
    detail: 'Bank-grade encryption · PCI compliant',
  },
  {
    icon: CreditCard,
    label: 'No charge during trial',
    detail: "We don't run your card until day 8",
  },
  {
    icon: RefreshCw,
    label: 'Cancel anytime',
    detail: 'One click, no retention agents',
  },
  {
    icon: ShieldCheck,
    label: 'Switch plans freely',
    detail: 'Up or down, prorated automatically',
  },
] as const;

export function TrustBadges() {
  return (
    <section className="mb-12 max-w-5xl mx-auto">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {BADGES.map(({ icon: Icon, label, detail }) => (
          <div
            key={label}
            className="bg-slate-800/30 backdrop-blur-xl rounded-xl border border-slate-700/50 p-4 flex items-start gap-3"
          >
            <div className="w-9 h-9 bg-slate-700/50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="text-white text-sm font-medium leading-tight">{label}</div>
              <div className="text-slate-400 text-xs mt-0.5 leading-snug">{detail}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
