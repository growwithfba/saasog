'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle,
  Rocket,
  Sparkles,
  Sprout,
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/layout/Footer';
import { ExtensionCTA } from '@/components/extension/ExtensionCTA';
import { CheckoutModal } from '@/components/checkout/CheckoutModal';
import { FeatureMatrix } from '@/components/pricing/FeatureMatrix';
import { FAQ } from '@/components/pricing/FAQ';
import { SocialProof } from '@/components/pricing/SocialProof';
import { CompetitorTable } from '@/components/pricing/CompetitorTable';
import { TrustBadges } from '@/components/pricing/TrustBadges';
import type { BillingInterval, Tier } from '@/lib/subscription/tiers';

// Tier display data — hardcoded to match the Stripe products + the
// pricing decisions locked in Sprint D Layer 1. The /api/stripe/embedded-
// checkout endpoint resolves these (tier, billingInterval) pairs back
// to live Stripe price IDs at request time, so this table only governs
// presentation, not billing.
const TIERS: Array<{
  id: Tier;
  name: string;
  tagline: string;
  monthly: number;
  yearly: number; // billed-yearly equivalent monthly
  yearlyTotal: number; // total yearly charge
  yearlySavings: number;
  features: string[];
  highlight: boolean;
  icon: typeof Sprout;
  iconBg: string;
  iconColor: string;
}> = [
  {
    id: 'core',
    name: 'BloomEngine Core',
    tagline: 'Advanced research & product development',
    monthly: 39,
    yearly: 32,
    yearlyTotal: 384,
    yearlySavings: 84,
    features: [
      '25 product vettings / month',
      '15 SSP (Offer) generations / month',
      'Unlimited Chrome Extension lens scans',
      'Unlimited supplier quote tracking',
      'Calibrated AI scoring across 18+ categories',
      '7-day free trial',
    ],
    highlight: false,
    icon: Sprout,
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
  },
  {
    id: 'pro',
    name: 'BloomEngine Pro',
    tagline: 'For serious brand builders',
    monthly: 99,
    yearly: 79,
    yearlyTotal: 948,
    yearlySavings: 240,
    features: [
      'Unlimited product vettings',
      'Unlimited SSP generations',
      'Unlimited Chrome Extension lens scans',
      'Unlimited supplier quote tracking',
      'Calibrated AI scoring across 18+ categories',
      'Priority support',
      '7-day free trial',
    ],
    highlight: true,
    icon: Rocket,
    iconBg: 'bg-emerald-500/20',
    iconColor: 'text-emerald-400',
  },
];

function PlansContent() {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('yearly');
  const [checkoutTier, setCheckoutTier] = useState<Tier | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const canceled = searchParams.get('canceled') === 'true';

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        router.replace('/subscription');
        return;
      }
      setCheckingAuth(false);
    };
    checkAuth();
  }, [router]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading plans...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden flex flex-col">
      {/* Background glow accents */}
      <div className="absolute inset-0 bg-slate-700 opacity-10 pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse delay-1000 pointer-events-none" />

      <div className="relative flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-10 pt-4">
            <Logo variant="horizontal" className="h-16 mb-6" alt="BloomEngine" priority />
            <h1 className="text-4xl font-bold text-white mb-3">Choose Your Plan</h1>
            <p className="text-slate-400 text-lg max-w-xl">
              Start with a{' '}
              <span className="text-emerald-400 font-semibold">7-day free trial</span>.
              No charges until your trial ends. Cancel anytime.
            </p>
          </div>

          {canceled && (
            <div className="mb-6 max-w-4xl mx-auto bg-amber-900/30 border border-amber-500/50 rounded-xl p-4 flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-amber-400 text-lg">↩</span>
              </div>
              <p className="text-amber-300 text-sm">
                You canceled the checkout. No worries — choose a plan whenever you&apos;re ready.
              </p>
            </div>
          )}

          {/* Monthly / Yearly toggle */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-900/60 border border-slate-700/50 rounded-full">
              <button
                type="button"
                onClick={() => setBillingInterval('monthly')}
                className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  billingInterval === 'monthly' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Pay monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingInterval('yearly')}
                className={`inline-flex items-center gap-2 px-5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  billingInterval === 'yearly'
                    ? 'bg-gradient-to-r from-blue-500 to-emerald-500 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Pay yearly
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    billingInterval === 'yearly'
                      ? 'bg-white/20'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  SAVE UP TO 20%
                </span>
              </button>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 max-w-4xl mx-auto">
            {TIERS.map((plan) => {
              const Icon = plan.icon;
              const displayPrice = billingInterval === 'yearly' ? plan.yearly : plan.monthly;
              const monthlyEquivalent = plan.monthly;

              return (
                <div
                  key={plan.id}
                  className={`relative bg-slate-800/60 backdrop-blur-xl rounded-2xl border-2 transition-all duration-300 shadow-lg ${
                    plan.highlight
                      ? 'border-emerald-500/60 shadow-emerald-500/20 md:scale-105'
                      : 'border-slate-700/50 hover:border-blue-500/50'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <div className="bg-gradient-to-r from-emerald-500 to-blue-500 text-white text-xs font-bold px-4 py-1 rounded-full shadow-md">
                        MOST POPULAR
                      </div>
                    </div>
                  )}

                  <div className="p-8">
                    {/* Plan Header */}
                    <div className="flex items-center gap-4 mb-6">
                      <div
                        className={`w-14 h-14 ${plan.iconBg} rounded-xl flex items-center justify-center shadow-md`}
                      >
                        <Icon className={`w-7 h-7 ${plan.iconColor}`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                        <p className="text-slate-400 text-sm">{plan.tagline}</p>
                      </div>
                    </div>

                    {/* Pricing */}
                    <div className="mb-4">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-4xl font-bold text-white">${displayPrice}</span>
                        <span className="text-slate-400">/ month</span>
                      </div>
                      {billingInterval === 'yearly' ? (
                        <div className="text-sm text-slate-400 space-y-0.5">
                          <p>
                            <span className="line-through text-slate-500">${monthlyEquivalent}/mo</span>{' '}
                            billed yearly (${plan.yearlyTotal}/yr)
                          </p>
                          <p className="font-medium text-emerald-400">
                            Save ${plan.yearlySavings} per year
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">Cancel anytime</p>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 mb-8 mt-6">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-300 text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button
                      type="button"
                      onClick={() => setCheckoutTier(plan.id)}
                      className={`w-full py-4 px-6 rounded-xl font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2 ${
                        plan.highlight
                          ? 'bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 shadow-lg hover:shadow-xl'
                          : 'bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 shadow-md hover:shadow-lg'
                      }`}
                    >
                      <Sparkles className="w-5 h-5" />
                      Start 7-Day Free Trial
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <p className="text-center text-xs text-slate-500 mt-3">
                      Then ${displayPrice}/mo after your 7-day free trial
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trust badges — payment security + cancellation reassurance */}
          <TrustBadges />

          {/* Feature comparison matrix */}
          <FeatureMatrix />

          {/* Competitor anchor table */}
          <CompetitorTable />

          {/* Social proof — testimonials */}
          <SocialProof />

          {/* Extension promo — included with every plan */}
          <div className="mb-12 max-w-5xl mx-auto">
            <ExtensionCTA
              variant="card"
              surface="pricing"
              headline="Free Chrome Extension included"
              body="Every BloomEngine plan ships with our Chrome Extension — analyze any product directly from Amazon search, save to your funnel, and run market analysis without leaving the page."
            />
          </div>

          {/* FAQ */}
          <FAQ />

          <p className="text-center text-slate-400 text-sm pb-6">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
              Sign in here
            </Link>
          </p>
        </div>
      </div>

      <Footer />

      {/* Embedded Checkout overlay */}
      <CheckoutModal
        isOpen={checkoutTier !== null}
        onClose={() => setCheckoutTier(null)}
        tier={checkoutTier}
        billingInterval={billingInterval}
      />
    </div>
  );
}

export default function PlansPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
          <div className="text-white">Loading plans...</div>
        </div>
      }
    >
      <PlansContent />
    </Suspense>
  );
}
