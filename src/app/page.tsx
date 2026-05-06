'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import {
  ArrowRight,
  CheckCircle,
  Zap,
  Star,
  Tag,
  Eye,
  Lightbulb,
  Target,
  Chrome,
  Sparkles,
  TrendingUp,
  Users,
  BarChart3,
  Award,
} from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

function Page() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        router.push('/dashboard');
      } else {
        setLoading(false);
      }
    };
    checkUser();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Logo variant="horizontal" className="h-16" alt="BloomEngine" priority />
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="px-4 py-2 text-slate-300 hover:text-white transition-colors">
                Sign In
              </Link>
              <Link href="/plans" className="px-4 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium rounded-lg transition-all">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section — 2-col with product mockup on the right */}
      <section className="relative py-20 lg:py-28 overflow-hidden">
        {/* Background glow accents */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[28rem] h-[28rem] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: Copy + CTA */}
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full mb-6">
                <Zap className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-blue-400">AI-Powered Private Label Product Vetting</span>
              </div>

              <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6 leading-[1.1]">
                Stop guessing.
                <br />
                Start launching{' '}
                <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                  Amazon products that win.
                </span>
              </h1>

              <p className="text-xl text-slate-400 mb-8 leading-relaxed">
                Validate your private-label idea against real Amazon data — competitor strength,
                market velocity, profitability — before you spend a dollar on inventory. Built by
                a 7-figure seller.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/plans"
                  className="group px-8 py-4 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-500/20"
                >
                  <span className="flex flex-col items-center leading-tight">
                    <span>Validate My Product Idea</span>
                    <span className="text-sm italic font-medium text-emerald-100/90">(For Free!)</span>
                  </span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>

              {/* Inline trust mini-row */}
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  No credit card required
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  7-day free trial
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Cancel anytime
                </div>
              </div>
            </div>

            {/* Right: Product mockup */}
            <div className="relative">
              {/* Annotated callout — Data Dive style */}
              <div className="hidden lg:block absolute -top-4 -left-4 z-10">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded-full shadow-lg">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI-powered Market Score
                </div>
                <svg className="w-12 h-8 mt-1 ml-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 48 32">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2 2 Q 24 2 24 30" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 24 L 24 30 L 28 24" />
                </svg>
              </div>

              <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/60 shadow-2xl shadow-blue-500/10 p-6 sm:p-8">
                {/* Mockup header */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Vetting Result</p>
                    <p className="text-sm font-medium text-slate-300">Bamboo Cutting Board Set</p>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-full uppercase tracking-wider">
                    PASS
                  </span>
                </div>

                {/* Score */}
                <div className="text-center mb-6">
                  <div className="text-6xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                    87.3%
                  </div>
                  <p className="text-sm text-slate-400 mt-1">Market Opportunity Score</p>
                  {/* Progress bar */}
                  <div className="mt-4 h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full w-[87%] bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" />
                  </div>
                </div>

                {/* Mini metric grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Top 5 Concentration</p>
                    <p className="text-lg font-semibold text-white">42%</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Strong Competitors</p>
                    <p className="text-lg font-semibold text-white">2</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Market Size</p>
                    <p className="text-lg font-semibold text-emerald-400">Large</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Top 5 Avg Reviews</p>
                    <p className="text-lg font-semibold text-white">847</p>
                  </div>
                </div>

                {/* Footer mini-summary */}
                <div className="mt-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs text-blue-200/90 leading-relaxed">
                    <span className="font-semibold">AI briefing:</span> Fragmented market with weak top-5
                    concentration and modest review barriers — strong entry conditions for a new private label.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Strip */}
      <section className="py-10 border-y border-slate-700/40 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 text-center">
            {/* Avatar stack + sellers count */}
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {['from-blue-500 to-purple-500', 'from-emerald-500 to-teal-500', 'from-orange-500 to-red-500', 'from-yellow-500 to-orange-500', 'from-cyan-500 to-blue-500'].map((g, i) => (
                  <div
                    key={i}
                    className={`w-9 h-9 rounded-full bg-gradient-to-br ${g} border-2 border-slate-900`}
                  />
                ))}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">Trusted by 1,000+ Sellers</p>
                <p className="text-xs text-slate-400">Building winning Amazon brands</p>
              </div>
            </div>

            <div className="hidden md:block w-px h-10 bg-slate-700/50" />

            {/* Star rating */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">Highly Rated</p>
                <p className="text-xs text-slate-400">Chrome Web Store</p>
              </div>
            </div>

            <div className="hidden md:block w-px h-10 bg-slate-700/50" />

            {/* Products analyzed */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500/20 to-emerald-500/20 border border-blue-500/30 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">10,000+ Products Analyzed</p>
                <p className="text-xs text-slate-400">Across every Amazon category</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bold Metric Proof Points */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {[
              { number: '1,000+', label: 'Active Sellers', icon: Users, color: 'from-blue-400 to-cyan-400' },
              { number: '10,000+', label: 'Products Analyzed', icon: BarChart3, color: 'from-emerald-400 to-teal-400' },
              { number: '18', label: 'Categories Calibrated', icon: TrendingUp, color: 'from-purple-400 to-blue-400' },
              { number: '7-Figure', label: 'Seller Built', icon: Award, color: 'from-yellow-400 to-orange-400' },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="text-center">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.color} bg-opacity-20 mb-4`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className={`text-4xl sm:text-5xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent leading-none mb-2`}>
                    {stat.number}
                  </div>
                  <p className="text-sm text-slate-400">{stat.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 bg-slate-800/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Why Smart Sellers Choose
              <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent"> BloomEngine</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Transform your Amazon FBA journey with AI-powered insights that eliminate guesswork and maximize your success
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 lg:gap-8">
            {/* Private Label Ready */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
              <div className="relative bg-slate-900/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 lg:p-8 hover:border-blue-500/30 transition-all duration-300 h-full">
                <div className="w-12 h-12 lg:w-14 lg:h-14 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <Tag className="w-6 h-6 lg:w-7 lg:h-7 text-white" />
                </div>
                <h3 className="text-lg lg:text-xl font-semibold text-white mb-3">Private Label Ready</h3>
                <p className="text-sm lg:text-base text-slate-400 leading-relaxed">
                  Uncover product opportunities you can brand, improve, and own.
                </p>
              </div>
            </div>

            {/* Competitor Insights */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
              <div className="relative bg-slate-900/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 lg:p-8 hover:border-emerald-500/30 transition-all duration-300 h-full">
                <div className="w-12 h-12 lg:w-14 lg:h-14 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <Eye className="w-6 h-6 lg:w-7 lg:h-7 text-white" />
                </div>
                <h3 className="text-lg lg:text-xl font-semibold text-white mb-3">Competitor Insights</h3>
                <p className="text-sm lg:text-base text-slate-400 leading-relaxed">
                  Break down what others are doing and spot the gaps you can fill.
                </p>
              </div>
            </div>

            {/* Smart Decisions */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
              <div className="relative bg-slate-900/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 lg:p-8 hover:border-orange-500/30 transition-all duration-300 h-full">
                <div className="w-12 h-12 lg:w-14 lg:h-14 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <Target className="w-6 h-6 lg:w-7 lg:h-7 text-white" />
                </div>
                <h3 className="text-lg lg:text-xl font-semibold text-white mb-3">Smart, Confident Decisions</h3>
                <p className="text-sm lg:text-base text-slate-400 leading-relaxed">
                  Validate before you invest. Save time, money, and stress.
                </p>
              </div>
            </div>

            {/* Build Better Products */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
              <div className="relative bg-slate-900/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 lg:p-8 hover:border-yellow-500/30 transition-all duration-300 h-full">
                <div className="w-12 h-12 lg:w-14 lg:h-14 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <Lightbulb className="w-6 h-6 lg:w-7 lg:h-7 text-white" />
                </div>
                <h3 className="text-lg lg:text-xl font-semibold text-white mb-3">Build a Better Product</h3>
                <p className="text-sm lg:text-base text-slate-400 leading-relaxed">
                  Turn customer pain points into features that win the buy box.
                </p>
              </div>
            </div>

            {/* Chrome Extension — NEW */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
              <div className="relative bg-slate-900/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 lg:p-8 hover:border-cyan-500/30 transition-all duration-300 h-full">
                <div className="w-12 h-12 lg:w-14 lg:h-14 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <Chrome className="w-6 h-6 lg:w-7 lg:h-7 text-white" />
                </div>
                <h3 className="text-lg lg:text-xl font-semibold text-white mb-3">Chrome Extension Included</h3>
                <p className="text-sm lg:text-base text-slate-400 leading-relaxed">
                  Vet products directly on Amazon — no CSV upload required.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Page;
