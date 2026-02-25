'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle,
  Sparkles,
  Sprout,
  Zap,
  Shield,
  Clock,
  CreditCard,
  Calendar,
  Rocket,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/layout/Footer';

const MONTHLY_LOOKUP_KEY = 'grow_with_fba_ai_monthly_subscription';
const ANNUAL_LOOKUP_KEY = 'grow_with_fba_ai_yearly_membership';

interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  default_price: {
    id: string;
    unit_amount: number;
    currency: string;
    lookup_key: string | null;
    recurring: {
      interval: string;
      interval_count: number;
    } | null;
  } | null;
}

interface Plan {
  id: 'monthly' | 'annual';
  stripeProductId: string;
  name: string;
  price: string;
  rawPrice: number;
  period: string;
  description: string;
  features: string[];
  popular: boolean;
  icon: typeof Zap;
  iconColor: string;
  iconBg: string;
}

function PlansContent() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
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

  useEffect(() => {
    if (checkingAuth) return;

    const fetchProducts = async () => {
      try {
        const response = await fetch('/api/stripe/products');
        const result = await response.json();

        if (!result.success || !result.data) {
          setLoading(false);
          return;
        }

        const allProducts: StripeProduct[] = result.data;
        const monthlyProduct = allProducts.find(
          (p) => p.default_price?.lookup_key === MONTHLY_LOOKUP_KEY
        );
        const annualProduct = allProducts.find(
          (p) => p.default_price?.lookup_key === ANNUAL_LOOKUP_KEY
        );

        if (!monthlyProduct || !annualProduct) {
          setLoading(false);
          return;
        }

        const formatPrice = (amount: number, currency: string = 'usd') =>
          new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(amount / 100);

        const monthlyPrice = monthlyProduct.default_price?.unit_amount || 0;
        const annualPrice = annualProduct.default_price?.unit_amount || 0;

        const formattedPlans: Plan[] = [
          {
            id: 'monthly',
            stripeProductId: monthlyProduct.id,
            name: monthlyProduct.name || 'Monthly Plan',
            price: formatPrice(monthlyPrice),
            rawPrice: monthlyPrice,
            period: 'per month',
            description: monthlyProduct.description || 'Perfect for testing the waters',
            features: [
              'Unlimited product research searches',
              'Advanced market opportunity scoring',
              'AI-powered competitor breakdowns',
              'Seasonality & trend analysis',
              'Profitability insights & validation tools',
              'Standard AI usage included',
              'Email support',
              '7-day free trial',
            ],
            popular: false,
            icon: Sprout,
            iconColor: 'text-blue-400',
            iconBg: 'bg-blue-500/20',
          },
          {
            id: 'annual',
            stripeProductId: annualProduct.id,
            name: annualProduct.name || 'Annual Plan',
            price: formatPrice(annualPrice),
            rawPrice: annualPrice,
            period: 'per year',
            description: annualProduct.description || 'Best value for serious sellers',
            features: [
              '2 months free (vs monthly)',
              'Unlimited AI usage',
              'Priority support',
              'Early access to new features',
              'Exclusive training updates & strategy drops',
              'Locked-in annual savings',
              '7-day free trial',
            ],
            popular: true,
            icon: Rocket,
            iconColor: 'text-emerald-400',
            iconBg: 'bg-emerald-500/20',
          },
        ];

        setPlans(formattedPlans);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [checkingAuth]);

  const handleSelectPlan = async (plan: Plan) => {
    setProcessingPlan(plan.id);
    try {
      const response = await fetch('/api/stripe/anonymous-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: plan.stripeProductId }),
      });
      const result = await response.json();
      if (!result.success || !result.url) {
        throw new Error(result.error || 'Failed to start checkout');
      }
      window.location.href = result.url;
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Something went wrong. Please try again.');
      setProcessingPlan(null);
    }
  };

  if (checkingAuth || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading plans...</div>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <p className="mb-4">Unable to load subscription plans.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden flex flex-col">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-slate-700 opacity-10 pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse delay-1000 pointer-events-none" />

      <div className="relative flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-10 pt-4">
            <Logo variant="horizontal" className="h-16 mb-6" alt="BloomEngine" priority />
            <h1 className="text-4xl font-bold text-white mb-3">
              Choose Your Plan
            </h1>
            <p className="text-slate-400 text-lg max-w-xl">
              Start with a{' '}
              <span className="text-emerald-400 font-semibold">7-day free trial</span>.
              No charges until your trial ends. Cancel anytime.
            </p>
          </div>

          {/* Canceled Banner */}
          {canceled && (
            <div className="mb-6 bg-amber-900/30 border border-amber-500/50 rounded-xl p-4 flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-amber-400 text-lg">↩</span>
              </div>
              <p className="text-amber-300 text-sm">
                You canceled the checkout. No worries — choose a plan whenever you&apos;re ready.
              </p>
            </div>
          )}

          {/* Trial Banner */}
          <div className="mb-8 bg-gradient-to-r from-emerald-900/40 to-blue-900/40 border border-emerald-500/50 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-1">
                  7-Day Free Trial — Risk Free
                </h3>
                <p className="text-slate-300 text-sm">
                  Get full access to all features for 7 days at no cost. Your card won't be charged until the trial ends.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-emerald-400 flex-shrink-0">
                <Shield className="w-5 h-5" />
                <span className="font-medium text-sm">Cancel Anytime</span>
              </div>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            {plans.map((plan) => {
              const Icon = plan.icon;
              const monthlyEquivalent =
                plan.id === 'annual'
                  ? (plan.rawPrice / 100 / 12).toFixed(0)
                  : (plan.rawPrice / 100).toFixed(0);

              return (
                <div
                  key={plan.id}
                  className={`relative bg-slate-800/60 backdrop-blur-xl rounded-2xl border-2 transition-all duration-300 shadow-lg ${
                    plan.popular
                      ? 'border-emerald-500/60 shadow-emerald-500/20 scale-105'
                      : 'border-slate-700/50 hover:border-blue-500/50'
                  }`}
                >
                  {plan.popular && (
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
                        <p className="text-slate-400 text-sm">{plan.description}</p>
                      </div>
                    </div>

                    {/* Pricing */}
                    <div className="mb-4">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-4xl font-bold text-white">{plan.price}</span>
                        <span className="text-slate-400">{plan.period}</span>
                      </div>
                    </div>

                    {/* Plan taglines */}
                    {plan.id === 'annual' && (
                      <div className="mb-6 text-sm text-slate-400 space-y-1">
                        <p>Only ${monthlyEquivalent}/month billed annually</p>
                        <p className="font-medium text-emerald-400">Save $94 per year</p>
                        <p className="pt-2 text-slate-300 font-medium">
                          Built for serious sellers scaling their brand.
                        </p>
                        <p className="pt-3 font-medium text-slate-200">Everything in Core, plus:</p>
                      </div>
                    )}
                    {plan.id === 'monthly' && (
                      <div className="mb-6 text-sm text-slate-400 space-y-1">
                        <p>Flexible access. Cancel anytime.</p>
                        <p className="pt-2 text-slate-300 font-medium">
                          Best for new and growing sellers testing ideas.
                        </p>
                      </div>
                    )}

                    {/* Features */}
                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-300">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button
                      onClick={() => handleSelectPlan(plan)}
                      disabled={processingPlan !== null}
                      className={`w-full py-4 px-6 rounded-xl font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                        plan.popular
                          ? 'bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 shadow-lg hover:shadow-xl'
                          : 'bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 shadow-md hover:shadow-lg'
                      }`}
                    >
                      {processingPlan === plan.id ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Redirecting to checkout...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-5 h-5" />
                          Get Started — Free Trial
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <p className="text-center text-xs text-slate-500 mt-4">
                      <Clock className="w-3 h-3 inline mr-1" />
                      7-day free trial, then {plan.price} {plan.period}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Feature highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-slate-800/30 backdrop-blur-xl rounded-xl border border-slate-700/50 p-6 shadow-md">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-blue-400" />
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">No Risk</h4>
              <p className="text-slate-400 text-sm">
                Cancel anytime during your free trial. No charges until the trial ends.
              </p>
            </div>
            <div className="bg-slate-800/30 backdrop-blur-xl rounded-xl border border-slate-700/50 p-6 shadow-md">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-emerald-400" />
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">Instant Access</h4>
              <p className="text-slate-400 text-sm">
                Get immediate access to all features as soon as your account is created.
              </p>
            </div>
            <div className="bg-slate-800/30 backdrop-blur-xl rounded-xl border border-slate-700/50 p-6 shadow-md">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
                <Calendar className="w-6 h-6 text-purple-400" />
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">Flexible Billing</h4>
              <p className="text-slate-400 text-sm">
                Switch between monthly and annual plans at any time.
              </p>
            </div>
          </div>

          {/* Sign in link */}
          <p className="text-center text-slate-400 text-sm pb-6">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
              Sign in here
            </Link>
          </p>
        </div>
      </div>
      <Footer />
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
