'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  CheckCircle, 
  Sparkles,
  Zap,
  Crown,
  Shield,
  Clock,
  CreditCard,
  Calendar
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import StripeStatus from '@/components/StripeStatus';

type PlanType = 'monthly' | 'annual' | null;

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
  id: string;
  stripeProductId: string;
  name: string;
  price: string;
  period: string;
  originalPrice: string | null;
  savings: string | null;
  description: string;
  features: string[];
  popular: boolean;
  icon: typeof Zap;
  iconColor: string;
  iconBg: string;
}

export default function SubscriptionPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [subscriptionType, setSubscriptionType] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const router = useRouter();

  // Lookup keys for monthly and annual subscriptions
  const MONTHLY_LOOKUP_KEY = 'grow_with_fba_ai_monthly_subscription';
  const ANNUAL_LOOKUP_KEY = 'grow_with_fba_ai_yearly_membership';

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user: supabaseUser }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !supabaseUser) {
        router.push('/login');
        return;
      }
      
      setUser(supabaseUser);
      setLoading(false);

      // Fetch user profile to get subscription status and type
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('subscription_status, subscription_type')
        .eq('id', supabaseUser.id)
        .single();

      if (!profileError && profile) {
        setSubscriptionStatus(profile.subscription_status);
        setSubscriptionType(profile.subscription_type);
      }
      
      setProfileLoading(false);
    };
    
    checkUser();
  }, [router]);

  // Fetch products from Stripe
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch('/api/stripe/products');
        const result = await response.json();
        
        if (!result.success || !result.data) {
          console.error('Failed to fetch products:', result.error);
          setProductsLoading(false);
          return;
        }

        // Find the specific products by lookup_key
        const allProducts: StripeProduct[] = result.data;
        const monthlyProduct = allProducts.find(p => p.default_price?.lookup_key === MONTHLY_LOOKUP_KEY);
        const annualProduct = allProducts.find(p => p.default_price?.lookup_key === ANNUAL_LOOKUP_KEY);

        if (!monthlyProduct || !annualProduct) {
          console.error('Required products not found in Stripe');
          setProductsLoading(false);
          return;
        }

        // Format price helper
        const formatPrice = (amount: number, currency: string = 'usd') => {
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(amount / 100);
        };

        // Get prices
        const monthlyPrice = monthlyProduct.default_price?.unit_amount || 0;
        const annualPrice = annualProduct.default_price?.unit_amount || 0;

        // Build plans array
        const formattedPlans: Plan[] = [
          {
            id: 'monthly',
            stripeProductId: monthlyProduct.id,
            name: monthlyProduct.name || 'Monthly Plan',
            price: formatPrice(monthlyPrice),
            period: 'per month',
            originalPrice: null,
            savings: null,
            description: monthlyProduct.description || 'Perfect for testing the waters',
            features: [
              'Unlimited product research',
              'Advanced market analysis',
              'Competitor insights',
              'BSR trend tracking',
              'Price analysis charts',
              'Email support',
              '7-day free trial'
            ],
            popular: false,
            icon: Zap,
            iconColor: 'text-blue-400',
            iconBg: 'bg-blue-500/20'
          },
          {
            id: 'annual',
            stripeProductId: annualProduct.id,
            name: annualProduct.name || 'Annual Plan',
            price: formatPrice(annualPrice),
            period: 'per year',
            originalPrice: null,
            savings: null,
            description: annualProduct.description || 'Best value for serious sellers',
            features: [
              'Everything in Monthly',
              'Priority support',
              'Advanced analytics',
              'Early access to new features',
              'Custom reporting',
              'Dedicated account manager',
              '7-day free trial'
            ],
            popular: true,
            icon: Crown,
            iconColor: 'text-emerald-400',
            iconBg: 'bg-emerald-500/20'
          }
        ];

        setPlans(formattedPlans);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setProductsLoading(false);
      }
    };

    if (!loading && user) {
      fetchProducts();
    }
  }, [loading, user]);

  // Determine which buttons should be shown based on subscription status
  const shouldShowButton = (planId: 'monthly' | 'annual'): boolean => {
    // If subscription_status is null or CANCELED, show both buttons
    const isCanceled = !subscriptionStatus || subscriptionStatus === 'CANCELED';
    
    if (isCanceled) {
      return true;
    }

    // If subscription_status is TRIALING or ACTIVE
    if (subscriptionStatus === 'TRIALING' || subscriptionStatus === 'ACTIVE') {
      // If subscription_type is MONTHLY, only show yearly button
      if (subscriptionType === 'MONTHLY') {
        return planId === 'annual';
      }
      
      // If subscription_type is YEARLY, show neither button
      if (subscriptionType === 'YEARLY') {
        return false;
      }
    }

    // Default: show both buttons
    return true;
  };

  const handleSubscribe = async (planType: 'monthly' | 'annual') => {
    if (!user) {
      router.push('/login');
      return;
    }

    const plan = plans.find(p => p.id === planType);
    if (!plan) {
      alert('Plan not found. Please refresh the page.');
      return;
    }

    setIsProcessing(true);
    setSelectedPlan(planType);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: plan.stripeProductId,
          userId: user.id,
          userEmail: user.email,
        }),
      });

      const result = await response.json();

      if (!result.success || !result.url) {
        throw new Error(result.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe checkout
      window.location.href = result.url;
      
    } catch (error: any) {
      console.error('Subscription error:', error);
      alert(error.message || 'Failed to start subscription. Please try again.');
      setIsProcessing(false);
      setSelectedPlan(null);
    }
  };

  if (loading || productsLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
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
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-slate-700 opacity-10"></div>
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>

      <div className="relative min-h-screen p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link 
              href="/dashboard" 
              className="p-3 bg-slate-800/50 hover:bg-slate-700/50 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-white">Choose Your Plan</h1>
              <p className="text-slate-400">Start with a 7-day free trial. Cancel anytime.</p>
            </div>
          </div>

          {/* Free Trial Banner */}
          <div className="mb-8 bg-gradient-to-r from-emerald-900/30 to-blue-900/30 border border-emerald-500/50 rounded-2xl p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-1">7-Day Free Trial</h3>
                <p className="text-slate-300 text-sm">
                  Try all features risk-free.
                </p>
              </div>
              <div className="flex items-center gap-2 text-emerald-400">
                <Shield className="w-5 h-5" />
                <span className="font-medium">Cancel Anytime</span>
              </div>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            {plans.map((plan) => {
              const Icon = plan.icon;
              // Calculate monthly equivalent for annual plan
              const monthlyPrice = plan.id === 'annual' 
                ? (parseFloat(plan.price.replace(/[^0-9.]/g, '')) / 12).toFixed(0)
                : plan.price.replace(/[^0-9.]/g, '');

              // Check if this button should be shown
              const showButton = shouldShowButton(plan.id as 'monthly' | 'annual');

              return (
                <div
                  key={plan.id}
                  className={`relative bg-slate-800/50 backdrop-blur-xl rounded-2xl border-2 transition-all duration-300 ${
                    plan.popular
                      ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/20 scale-105'
                      : 'border-slate-700/50 hover:border-blue-500/50'
                  }`}
                >
                  {/* Popular Badge */}
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <div className="bg-gradient-to-r from-emerald-500 to-blue-500 text-white text-xs font-bold px-4 py-1 rounded-full">
                        MOST POPULAR
                      </div>
                    </div>
                  )}

                  <div className="p-8">
                    {/* Plan Header */}
                    <div className="flex items-center gap-4 mb-6">
                      <div className={`w-14 h-14 ${plan.iconBg} rounded-xl flex items-center justify-center`}>
                        <Icon className={`w-7 h-7 ${plan.iconColor}`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                        <p className="text-slate-400 text-sm">{plan.description}</p>
                      </div>
                    </div>

                    {/* Pricing */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-4xl font-bold text-white">{plan.price}</span>
                        <span className="text-slate-400">{plan.period}</span>
                      </div>
                      {plan.id === 'annual' && (
                        <p className="text-sm text-slate-400">
                          Just ${monthlyPrice}/month billed annually
                        </p>
                      )}
                    </div>

                    {/* Features List */}
                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-300">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA Button - Only show if shouldShowButton returns true */}
                    {showButton && (
                      <>
                        <button
                          onClick={() => handleSubscribe(plan.id as 'monthly' | 'annual')}
                          disabled={isProcessing}
                          className={`w-full py-4 px-6 rounded-xl font-semibold text-white transition-all duration-200 ${
                            plan.popular
                              ? 'bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 shadow-lg shadow-emerald-500/25'
                              : 'bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600'
                          } disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                        >
                          {isProcessing && selectedPlan === plan.id ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <CreditCard className="w-5 h-5" />
                              Start Free Trial
                            </>
                          )}
                        </button>

                        {/* Trial Info */}
                        <p className="text-center text-xs text-slate-500 mt-4">
                          <Clock className="w-3 h-3 inline mr-1" />
                          7-day free trial, then {plan.price} {plan.period}
                        </p>
                      </>
                    )}

                    {/* Message when button is hidden */}
                    {!showButton && (
                      <div className="w-full py-4 px-6 rounded-xl bg-slate-700/50 border border-slate-600/50">
                        <p className="text-center text-slate-400 text-sm">
                          You already have an active {subscriptionType?.toLowerCase()} subscription
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Additional Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="bg-slate-800/30 backdrop-blur-xl rounded-xl border border-slate-700/50 p-6">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-blue-400" />
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">No Risk</h4>
              <p className="text-slate-400 text-sm">
                Cancel anytime during your free trial. No charges until the trial ends.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-800/30 backdrop-blur-xl rounded-xl border border-slate-700/50 p-6">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-emerald-400" />
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">Instant Access</h4>
              <p className="text-slate-400 text-sm">
                Get immediate access to all features as soon as you start your trial.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-800/30 backdrop-blur-xl rounded-xl border border-slate-700/50 p-6">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
                <Calendar className="w-6 h-6 text-purple-400" />
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">Flexible Billing</h4>
              <p className="text-slate-400 text-sm">
                Switch between monthly and annual plans at any time. No long-term commitment.
              </p>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mt-12 bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8">
            <h2 className="text-2xl font-bold text-white mb-6">Frequently Asked Questions</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  How does the 7-day free trial work?
                </h3>
                <p className="text-slate-400">
                  You get full access to all features for 7 days at no cost. If you don't cancel before the trial ends, 
                  you'll be automatically charged based on your selected plan. You can cancel anytime during the trial period.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Can I switch plans later?
                </h3>
                <p className="text-slate-400">
                  Yes! You can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  What payment methods do you accept?
                </h3>
                <p className="text-slate-400">
                  We accept all major credit cards, debit cards, and PayPal. All payments are processed securely.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  What happens if I cancel?
                </h3>
                <p className="text-slate-400">
                  You'll continue to have access until the end of your current billing period. After that, your account will be downgraded to the free tier.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <StripeStatus />
      </Suspense>
    </div>
  );
}

