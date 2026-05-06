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
  Search,
  Package,
  Truck,
  X as XIcon,
  Quote,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Logo } from '@/components/Logo';

// ----------------------------------------------------------------------------
// Static content for tabs / versus / cases / pricing — kept inline so the
// landing page is fully self-contained and easy for non-engineers to edit.
// ----------------------------------------------------------------------------

const PHASE_TABS = [
  {
    key: 'research',
    label: 'Research',
    icon: Search,
    color: 'from-blue-500 to-cyan-500',
    headline: 'Find products worth vetting.',
    body: 'Pull candidates from Amazon search and your funnel — filter by category, BSR band, review barriers — without manual spreadsheet wrangling.',
    bullets: [
      'Pull from Helium 10 CSV or directly via the Chrome Extension',
      'Filter by BSR, review count, price range, age',
      'Send candidates straight to Vetting',
    ],
  },
  {
    key: 'vetting',
    label: 'Vetting',
    icon: CheckCircle,
    color: 'from-cyan-500 to-emerald-500',
    headline: 'Validate before you launch.',
    body: 'AI-powered scoring against real Amazon data — competitor strength, market velocity, profitability, review barriers. Get a verdict in minutes, not weeks.',
    bullets: [
      'Calibrated scoring across 18+ Amazon categories',
      'PASS / RISKY / FAIL verdict with full reasoning',
      'Side-by-side competitor breakdown',
    ],
  },
  {
    key: 'offer',
    label: 'Offer',
    icon: Package,
    color: 'from-emerald-500 to-teal-500',
    headline: 'Build a listing that converts.',
    body: 'Turn your validated idea into a market-ready offering — listing copy direction, image themes, keyword targeting, and the unique angles that beat the competition.',
    bullets: [
      'Listing copy + image direction tailored to the niche',
      'Keyword strategy from real search data',
      'Differentiation analysis vs the top 5 listings',
    ],
  },
  {
    key: 'sourcing',
    label: 'Sourcing',
    icon: Truck,
    color: 'from-teal-500 to-blue-500',
    headline: 'Negotiate the right deal.',
    body: 'Compare suppliers, model unit economics with real FBA fees, and walk into PO conversations knowing the numbers cold.',
    bullets: [
      'Side-by-side supplier comparison',
      'Unit economics with FBA fees baked in',
      'PO contract templates + checklist',
    ],
  },
] as const;

const VERSUS_COLUMNS = [
  {
    name: 'Manual Spreadsheets',
    subtitle: 'The slow, subjective way',
    tone: 'bad' as const,
    points: [
      'Hours per ASIN — every research session feels like starting from scratch',
      'Subjective scoring rules that drift across products',
      'No way to know which signals actually matter',
      'You miss seasonal + tail markets entirely',
    ],
  },
  {
    name: 'Generic AI Tools',
    subtitle: 'ChatGPT, Gemini, Deepseek',
    tone: 'bad' as const,
    points: [
      'Confidently invents numbers it has no source for',
      'No live Amazon data — answers based on training-set staleness',
      'Hallucinated competitor analysis you cannot trust',
      'Same generic answer every other seller is also getting',
    ],
  },
  {
    name: 'BloomEngine',
    subtitle: 'Built by a 7-figure seller',
    tone: 'good' as const,
    points: [
      'Live competitor data pulled at request time',
      'AI scoring calibrated against thousands of real Amazon ASINs',
      'PASS / RISKY / FAIL verdict with full reasoning',
      'Validation in minutes, not days',
    ],
  },
];

// PLACEHOLDER case studies — Dave to replace quotes + headshots when
// the real testimonials come in. Pravatar URLs render different stock
// photos per `u=` seed and are stable.
const CASE_STUDIES = [
  {
    name: 'Barbara K.',
    revenue: '$3M+ / yr',
    role: '8-figure brand owner',
    quote:
      'BloomEngine cut my product research from days to minutes. I have launched four winners using it — would not go back.',
    avatarSeed: 'barbara-bloomengine',
  },
  {
    name: 'Art M.',
    revenue: '$2.5M / yr',
    role: 'Multi-brand seller',
    quote:
      'The AI scoring is the closest thing I have seen to having a 7-figure mentor sanity-check every idea before I commit inventory.',
    avatarSeed: 'art-bloomengine',
  },
  {
    name: 'Will T.',
    revenue: '$250K / yr',
    role: 'Year-2 seller',
    quote:
      'My first BloomEngine-validated launch hit $20K/month within 90 days. The competitor analysis caught a barrier I would have totally missed.',
    avatarSeed: 'will-bloomengine',
  },
  {
    name: 'James R.',
    revenue: '$250K / yr',
    role: 'New seller',
    quote:
      'Sold by month two. The vetting score has saved me from at least three bad launches I was emotionally attached to.',
    avatarSeed: 'james-bloomengine',
  },
];

// ----------------------------------------------------------------------------

function Page() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<typeof PHASE_TABS[number]['key']>('vetting');
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly');
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

  const activeTabContent = PHASE_TABS.find((t) => t.key === activeTab) ?? PHASE_TABS[0];
  const ActiveTabIcon = activeTabContent.icon;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-40">
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
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[28rem] h-[28rem] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
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
              <div className="hidden lg:block absolute -top-4 -left-4 z-10">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded-full shadow-lg">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI-powered Market Score
                </div>
              </div>

              <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/60 shadow-2xl shadow-blue-500/10 p-6 sm:p-8">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Vetting Result</p>
                    <p className="text-sm font-medium text-slate-300">Bamboo Cutting Board Set</p>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-full uppercase tracking-wider">
                    PASS
                  </span>
                </div>

                <div className="text-center mb-6">
                  <div className="text-6xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                    87.3%
                  </div>
                  <p className="text-sm text-slate-400 mt-1">Market Opportunity Score</p>
                  <div className="mt-4 h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full w-[87%] bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" />
                  </div>
                </div>

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

      {/* Section 5 — Tabbed Feature Reveal */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Every step from idea to launch — in one place
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              The full Amazon private-label workflow, instrumented end to end.
            </p>
          </div>

          {/* Tab buttons */}
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-12">
            {PHASE_TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all border ${
                    isActive
                      ? `bg-gradient-to-r ${tab.color} text-white border-transparent shadow-lg`
                      : 'bg-slate-900/40 text-slate-300 border-slate-700/50 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <TabIcon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content — 2-col */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${activeTabContent.color} mb-5`}>
                <ActiveTabIcon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-3xl font-bold text-white mb-4">{activeTabContent.headline}</h3>
              <p className="text-lg text-slate-400 mb-6 leading-relaxed">{activeTabContent.body}</p>
              <ul className="space-y-3 mb-8">
                {activeTabContent.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-3 text-slate-300">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/plans"
                className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                Try it free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Stylized phase visual */}
            <div className="relative">
              <div className={`absolute inset-0 bg-gradient-to-br ${activeTabContent.color} opacity-20 blur-3xl rounded-full`} />
              <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/60 shadow-2xl p-10 min-h-[320px] flex flex-col items-center justify-center">
                <div className={`w-24 h-24 rounded-3xl bg-gradient-to-br ${activeTabContent.color} flex items-center justify-center shadow-2xl mb-6`}>
                  <ActiveTabIcon className="w-12 h-12 text-white" />
                </div>
                <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Phase</p>
                <p className="text-2xl font-bold text-white mb-6">{activeTabContent.label}</p>
                <div className="grid grid-cols-3 gap-3 w-full max-w-md">
                  {activeTabContent.bullets.map((_, i) => (
                    <div
                      key={i}
                      className="h-1.5 rounded-full bg-slate-800 overflow-hidden"
                    >
                      <div
                        className={`h-full bg-gradient-to-r ${activeTabContent.color} rounded-full`}
                        style={{ width: `${[60, 85, 100][i]}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6 — Versus Comparison */}
      <section className="py-24 bg-slate-800/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Why BloomEngine beats the alternatives
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              The product-research market is crowded with the wrong tools. Here is what actually changes when you switch.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {VERSUS_COLUMNS.map((col) => {
              const isGood = col.tone === 'good';
              return (
                <div
                  key={col.name}
                  className={`relative rounded-3xl p-8 transition-all ${
                    isGood
                      ? 'bg-gradient-to-br from-blue-500/15 via-slate-900/60 to-emerald-500/15 border-2 border-blue-500/40 shadow-xl shadow-blue-500/10 lg:scale-105'
                      : 'bg-slate-900/50 border border-slate-700/50'
                  }`}
                >
                  {isGood && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="inline-block px-3 py-1 bg-gradient-to-r from-blue-500 to-emerald-500 text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-lg">
                        The Right Way
                      </span>
                    </div>
                  )}
                  <div className="mb-6">
                    <h3 className={`text-xl font-bold mb-1 ${isGood ? 'text-white' : 'text-slate-200'}`}>
                      {col.name}
                    </h3>
                    <p className={`text-sm ${isGood ? 'text-blue-200' : 'text-slate-500'}`}>{col.subtitle}</p>
                  </div>
                  <ul className="space-y-3">
                    {col.points.map((p) => (
                      <li key={p} className="flex items-start gap-3">
                        {isGood ? (
                          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        )}
                        <span className={`text-sm leading-relaxed ${isGood ? 'text-slate-200' : 'text-slate-400'}`}>
                          {p}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 7 — Case Studies */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Real sellers, real results
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              From first-launch newcomers to 8-figure brand owners — BloomEngine fits every stage.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {CASE_STUDIES.map((c) => (
              <div
                key={c.name}
                className="relative bg-slate-900/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 hover:border-blue-500/30 transition-all"
              >
                <Quote className="absolute top-4 right-4 w-6 h-6 text-blue-500/30" />
                <div className="flex items-center gap-3 mb-4">
                  {/* Pravatar placeholder — Dave to replace with real headshot */}
                  <Image
                    src={`https://i.pravatar.cc/120?u=${c.avatarSeed}`}
                    alt={`${c.name} placeholder portrait`}
                    width={56}
                    height={56}
                    unoptimized
                    className="w-14 h-14 rounded-full object-cover border-2 border-slate-700"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.role}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed mb-4 italic">
                  &ldquo;{c.quote}&rdquo;
                </p>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-300">{c.revenue}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-slate-600 mt-6 italic">
            Quotes drafted as placeholders pending owner verification. Photos generated for layout demonstration.
          </p>
        </div>
      </section>

      {/* Section 9 — Pricing Preview */}
      <section className="py-24 bg-slate-800/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
              Start with a 7-day free trial. No charges until your trial ends. Cancel anytime.
            </p>

            {/* Monthly / Yearly toggle */}
            <div className="inline-flex items-center gap-1 p-1 bg-slate-900/60 border border-slate-700/50 rounded-full">
              <button
                type="button"
                onClick={() => setBillingInterval('monthly')}
                className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all ${
                  billingInterval === 'monthly'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
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
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  billingInterval === 'yearly' ? 'bg-white/20' : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  SAVE ~20%
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Tier card — Monthly Plan */}
            <div className="relative bg-slate-900/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-white mb-1">BloomEngine</h3>
              <p className="text-sm text-slate-400 mb-6">Full access. No tiers.</p>
              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-white">
                    {billingInterval === 'yearly' ? '$39' : '$49'}
                  </span>
                  <span className="text-slate-400">/ month</span>
                </div>
                {billingInterval === 'yearly' && (
                  <p className="text-xs text-emerald-400 mt-1 font-medium">Billed yearly — save $120/yr</p>
                )}
              </div>
              <ul className="space-y-3 mb-8 text-sm text-slate-300">
                {[
                  'Unlimited product vetting',
                  'AI scoring across 18+ categories',
                  'Chrome Extension included',
                  'Competitor analysis + market scoring',
                  '7-day free trial',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/plans"
                className="block w-full text-center px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium rounded-xl transition-all"
              >
                Start Free Trial
              </Link>
            </div>

            {/* Tier card — Most popular (preview of Pro tier when Sprint D ships) */}
            <div className="relative bg-gradient-to-br from-blue-500/10 via-slate-900/60 to-emerald-500/10 border-2 border-blue-500/40 rounded-2xl p-8 shadow-xl shadow-blue-500/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-block px-3 py-1 bg-gradient-to-r from-blue-500 to-emerald-500 text-white text-xs font-bold uppercase tracking-wider rounded-full shadow">
                  Coming Soon
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Pro</h3>
              <p className="text-sm text-slate-400 mb-6">Higher limits + priority support.</p>
              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">TBA</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Pricing finalizing for launch</p>
              </div>
              <ul className="space-y-3 mb-8 text-sm text-slate-300">
                {[
                  'Everything in BloomEngine',
                  'Higher monthly vetting limits',
                  'Priority support',
                  'Early access to new features',
                  'Quarterly strategy session',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/plans"
                className="block w-full text-center px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-500/20"
              >
                Get Notified
              </Link>
            </div>
          </div>

          <p className="text-center mt-8">
            <Link
              href="/plans"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
              See full pricing
              <ArrowRight className="w-4 h-4" />
            </Link>
          </p>
        </div>
      </section>

      {/* Section 10 — Final CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full mb-6">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-amber-300">Most FBA launches fail in their first 90 days.</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6 leading-tight">
            Yours doesn&apos;t have to.
          </h2>
          <p className="text-xl text-slate-400 mb-10 leading-relaxed">
            Validate your next product idea against real Amazon data — for free, in minutes.
          </p>
          <Link
            href="/plans"
            className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20"
          >
            <span className="flex flex-col items-center leading-tight">
              <span>Validate My Product Idea</span>
              <span className="text-sm italic font-medium text-emerald-100/90">(For Free!)</span>
            </span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700/40 bg-slate-900/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><Link href="/plans" className="hover:text-white transition-colors">Pricing</Link></li>
                <li>
                  <a
                    href="https://chromewebstore.google.com/detail/bloomengine/cighgincghljicihnhbhiehpngfpgbkg?utm_source=footer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    Chrome Extension
                  </a>
                </li>
                <li><Link href="/login" className="hover:text-white transition-colors">Sign In</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><Link href="/learn" className="hover:text-white transition-colors">Learning Hub</Link></li>
                <li><Link href="/support" className="hover:text-white transition-colors">Support</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <a href="mailto:support@bloomengine.ai" className="hover:text-white transition-colors">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-8 border-t border-slate-700/40">
            <Logo variant="horizontal" className="h-10" alt="BloomEngine" />
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} BloomEngine. Built by a 7-figure seller, for sellers.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default Page;
