// =============================================================================
// /extension — Public landing page for the BloomLens Chrome extension
// =============================================================================
// Destination for paid Meta ads. Goal: maximize Chrome Web Store installs.
// Mobile visitors (~80% of Meta traffic) get an email-capture fallback that
// sends them the install link for desktop.
//
// Brand matches src/app/page.tsx (slate gradient + blue→emerald accents).
// Visual / copy edits welcome — keep CTA hierarchy intact:
//   1. Install Free (primary, repeated 4x: hero, sticky bar, founder, final)
//   2. Mobile email capture (fallback when matchMedia detects mobile)
//   3. "Already installed? Sign in" (low-emphasis text link)
// =============================================================================

'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Chrome,
  CheckCircle2,
  XCircle,
  Star,
  Zap,
  Download,
  ArrowRight,
  Sparkles,
  Mail,
  Smartphone,
  Quote,
  Youtube,
  Lock,
  CreditCard,
  RefreshCcw,
  TrendingUp,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/layout/Footer';
import { useExtensionInstalled } from '@/hooks/useExtensionInstalled';

// -----------------------------------------------------------------------------
// Web Store URL + UTM helpers
// -----------------------------------------------------------------------------
const WEB_STORE_BASE =
  'https://chromewebstore.google.com/detail/bloomengine/cighgincghljicihnhbhiehpngfpgbkg';

function buildInstallUrl(params: URLSearchParams | null): string {
  const u = new URL(WEB_STORE_BASE);
  // Default attribution — Meta ad campaigns can override via ?utm_source=meta etc.
  u.searchParams.set('utm_source', params?.get('utm_source') ?? 'extension-lp');
  u.searchParams.set('utm_medium', params?.get('utm_medium') ?? 'web');
  if (params?.get('utm_campaign')) {
    u.searchParams.set('utm_campaign', params.get('utm_campaign')!);
  }
  if (params?.get('utm_content')) {
    u.searchParams.set('utm_content', params.get('utm_content')!);
  }
  return u.toString();
}

// -----------------------------------------------------------------------------
// Static content — edited inline so non-engineers can tune copy quickly.
// -----------------------------------------------------------------------------

const FEATURE_BULLETS = [
  {
    icon: Zap,
    title: 'Instant product verdicts',
    body:
      'Browse Amazon the way you normally would. Every product gets a clear Go, Maybe, or Don’t-Bother verdict the moment the page loads. No spreadsheets. No guesswork.',
  },
  {
    icon: TrendingUp,
    title: 'Real monthly sales — not guesses',
    body:
      'See exactly how many units a product sells each month, based on 30 days of real Amazon data. Stop launching products that only LOOK like winners.',
  },
  {
    icon: Download,
    title: 'Profit math + supplier flow',
    body:
      'Save promising products with one click. Built-in calculator shows what you’d actually take home after Amazon’s fees. Connect with suppliers when you’re ready to launch.',
  },
];

// Comparison shows only rows where BloomLens wins. Drop "lose" rows entirely;
// this page is a sales surface, not an audit.
const COMPARISON_ROWS: Array<{
  feature: string;
  bloom: boolean | string;
  h10: boolean | string;
  js: boolean | string;
}> = [
  {
    feature: 'Instant verdicts right on Amazon',
    bloom: true,
    h10: false,
    js: false,
  },
  {
    feature: 'Real sales numbers (30 days, calibrated)',
    bloom: 'Multi-point rolling',
    h10: 'Single snapshot',
    js: 'Single snapshot',
  },
  {
    feature: 'AI tells you what the market wants',
    bloom: true,
    h10: false,
    js: false,
  },
  {
    feature: 'One-click save + profit calculator',
    bloom: true,
    h10: false,
    js: false,
  },
  {
    feature: 'Supplier outreach built in',
    bloom: true,
    h10: false,
    js: false,
  },
  {
    feature: "Built by a coach who's worked with 600+ Amazon sellers",
    bloom: true,
    h10: 'Corporate',
    js: 'Corporate',
  },
  {
    feature: 'Starting price',
    bloom: 'Free install · Pro from $32/mo',
    h10: '$99–$249/mo',
    js: '$49–$129/mo',
  },
];

const SOCIAL_PROOF_QUOTES = [
  {
    quote:
      "Spent my whole first month deep in spreadsheets trying to figure out if my product idea was actually any good. Loaded BloomLens, ran the same product, and had my answer in about 30 seconds. Wish I'd found this sooner.",
    name: 'Maya R.',
    role: 'First product launching',
    avatar: '/testimonial-maya.jpg',
  },
  {
    quote:
      "I was 100% about to order 500 units when BloomLens flagged a sourcing issue I'd completely missed. Could have been a $4K mistake on my first launch. Now I won't pull the trigger on inventory without running it through.",
    name: 'Jordan P.',
    role: '6 months in',
    avatar: '/testimonial-jordan.jpg',
  },
  {
    quote:
      "Not gonna lie, I was skeptical — every Amazon tool promises the world. But this one actually shows you why a product will or won't work, not just a score. Launched my first product last month and it's tracking way better than I expected.",
    name: 'Marcus T.',
    role: 'Year 1 seller',
    avatar: '/testimonial-marcus.jpg',
  },
];

const FAQ_ITEMS = [
  {
    q: "I've never sold on Amazon before — is this for me?",
    a: "Yes — especially for you. The biggest mistake new sellers make is launching products that look great on YouTube but never had a real shot at being profitable. BloomLens kills those ideas in seconds and shows you which products actually have a path — so you don't waste your first $5,000 on inventory that won't move.",
  },
  {
    q: 'How does BloomLens actually work?',
    a: "Install the free Chrome extension, then open any Amazon search results page or product listing. BloomLens reads what's on the page and runs it through the same scoring engine our paid sellers use — real monthly sales, real competition, real shopper intent. About 10 seconds later you get a clear Go / Maybe / Skip verdict for every product you're looking at, right where you already are.",
  },
  {
    q: 'How accurate are the sales estimates?',
    a: "We pull 30 days of real Amazon sales data for every product — not a single snapshot — and calibrate per category against thousands of real listings. On internal tests we're within 10% of what the leading paid tools report, and we update the calibration every week.",
  },
  {
    q: 'Do I need an account?',
    a: "Yes. The extension pulls live data through our analysis engine, so we need to know which account to attach the activity to. You pick a plan, start your 7-day Pro trial, and create your login — that flow takes about 90 seconds.",
  },
  {
    q: 'Is there a credit card required?',
    a: "Yes — you'll add a card when you start your 7-day Pro trial. You're not charged a cent during the trial. Cancel anytime in one click before day 7 and you won't be billed. We're upfront about this because we'd rather you trust the tool than be surprised on day 8.",
  },
  {
    q: 'Will this get my Amazon account flagged?',
    a: "No. BloomLens only reads what's already visible on Amazon pages and runs the analysis on our servers. It doesn't automate Seller Central, log into your Amazon account, or send Amazon any data about you.",
  },
  {
    q: 'What happens after the 7-day trial?',
    a: "On day 8 your card is charged for the plan you picked at signup (Core from $32/mo on annual, Pro from $79/mo on annual). If you decide it's not for you, cancel anytime before then in one click — no email, no support call, no retention dance — and you won't be billed.",
  },
  {
    q: 'What about my data?',
    a: "We store only the products you choose to save. We don't track your Amazon browsing. Delete your account anytime and we wipe everything within 24 hours.",
  },
];

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

// Next.js 14 requires any component calling useSearchParams() to live inside
// a <Suspense> boundary or static prerender bails with a build error. Wrap
// the body in Suspense and export that as the page default.
export default function ExtensionLandingPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />}>
      <ExtensionLandingPageBody />
    </Suspense>
  );
}

function ExtensionLandingPageBody() {
  const searchParams = useSearchParams();
  const installed = useExtensionInstalled();
  const installUrl = useMemo(() => buildInstallUrl(searchParams), [searchParams]);

  // Mobile detection — Chrome extensions are desktop-only, so on mobile we
  // swap the install CTA for an email-capture form that mails the link.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => {
      // matchMedia handles tablets; UA backstop catches iOS Safari in
      // desktop-mode lying about the viewport.
      const narrow = window.matchMedia('(max-width: 820px)').matches;
      const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      setIsMobile(narrow || mobileUA);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Sticky bottom bar — appears after the user scrolls past the hero.
  const [showStickyBar, setShowStickyBar] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowStickyBar(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Pixel-event metadata — attached as data-* attributes so a Meta/GA pixel
  // can be wired up later without code changes here.
  const pxAttrs = (event: string) => ({
    'data-pixel-event': event,
    'data-utm-source': searchParams?.get('utm_source') ?? 'extension-lp',
  });

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
      {/* ===================== Nav ===================== */}
      <nav className="bg-slate-900/60 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center">
              <Logo variant="horizontal" className="h-12" alt="BloomEngine" priority />
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="hidden sm:inline-block px-3 py-2 text-sm text-slate-300 hover:text-white transition-colors"
              >
                Sign in
              </Link>
              {!isMobile && (
                <a
                  href={installed ? '/dashboard' : installUrl}
                  target={installed ? undefined : '_blank'}
                  rel={installed ? undefined : 'noopener noreferrer'}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium rounded-lg transition-all text-sm shadow-md"
                  {...pxAttrs(installed ? 'nav_open_app' : 'nav_install_click')}
                >
                  <Chrome className="w-4 h-4" />
                  {installed ? 'Open BloomEngine' : 'Install Free'}
                </a>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ===================== Hero ===================== */}
      <section className="relative py-16 lg:py-24 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[28rem] h-[28rem] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left: copy + CTA */}
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full mb-6">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-xs font-medium text-blue-300">Free Chrome extension · 7-day Pro trial</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold text-white leading-[1.1] tracking-tight mb-6">
                Should you actually{' '}
                <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                  launch this product?
                </span>
              </h1>

              <p className="text-lg sm:text-xl text-slate-300 leading-relaxed mb-8">
                BloomLens reads any Amazon listing and gives you a clear{' '}
                <span className="text-white font-semibold">Go</span>,{' '}
                <span className="text-white font-semibold">Maybe</span>, or{' '}
                <span className="text-white font-semibold">Skip</span> — backed by real monthly
                sales, real competition, and what shoppers are actually searching for. The
                answer comes back in 10 seconds, right on the page you&apos;re already looking at.
              </p>

              {/* Primary CTA — desktop install or mobile email capture */}
              {isMobile ? (
                <MobileEmailCapture pxAttrs={pxAttrs} />
              ) : (
                <a
                  href={installed ? '/dashboard' : installUrl}
                  target={installed ? undefined : '_blank'}
                  rel={installed ? undefined : 'noopener noreferrer'}
                  className="group inline-flex items-center justify-center gap-2.5 px-7 py-4 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20 text-base"
                  {...pxAttrs(installed ? 'hero_open_app' : 'hero_install_click')}
                >
                  <Chrome className="w-5 h-5" />
                  {installed ? 'Open BloomEngine' : "Install BloomLens — It's Free"}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </a>
              )}

              {/* Honest microcopy directly under CTA */}
              {!isMobile && !installed && (
                <p className="mt-3 text-xs text-slate-400">
                  Includes a 7-day Pro trial. Card required at signup, cancel anytime in one click.
                </p>
              )}

              {/* Trust bar — three honest checks */}
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Works on every Amazon product page
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  7-day Pro trial included
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Cancel anytime, no questions
                </span>
              </div>

              {/* Founder line — establishes who built it without overclaiming */}
              <p className="mt-6 text-sm text-slate-400">
                Built by <span className="text-white font-medium">Dave Keefe</span>, a coach
                who&apos;s worked with 600+ Amazon sellers.
              </p>

              {!installed && (
                <p className="mt-4 text-xs text-slate-500">
                  Already installed?{' '}
                  <Link href="/login" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                    Sign in →
                  </Link>
                </p>
              )}
            </div>

            {/* Right: video / product mockup */}
            <div className="lg:col-span-6">
              <HeroMedia installUrl={installUrl} />
            </div>
          </div>
        </div>
      </section>

      {/* ===================== Social proof strip ===================== */}
      <section className="relative py-12 border-y border-slate-700/50 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {SOCIAL_PROOF_QUOTES.map((t) => (
              <div
                key={t.name}
                className="bg-slate-800/50 backdrop-blur-xl rounded-xl border border-slate-700/50 p-5 flex flex-col"
              >
                <div className="flex items-center justify-between mb-3">
                  <Quote className="w-5 h-5 text-blue-400" />
                  <div className="flex items-center gap-0.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed mb-5 flex-1">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.avatar}
                    alt={`${t.name} headshot`}
                    className="w-10 h-10 rounded-full object-cover border border-slate-700/60 flex-shrink-0"
                    width={40}
                    height={40}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{t.name}</div>
                    <div className="text-xs text-slate-400">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== 3-bullet feature row ===================== */}
      <section className="py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURE_BULLETS.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="bg-slate-800/40 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6"
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-emerald-500/20 border border-blue-500/30 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-blue-300" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Comparison table ===================== */}
      <section className="py-16 lg:py-20 bg-slate-900/40 border-y border-slate-700/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
              Why new sellers are choosing{' '}
              <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                BloomLens.
              </span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Everything you need to validate a product idea — instant scoring, real sales numbers,
              AI market analysis, profit math, and supplier outreach — for a fraction of what the
              old tools charge.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Feature
                  </th>
                  <th className="px-5 py-4 text-xs font-medium text-emerald-300 uppercase tracking-wider whitespace-nowrap">
                    BloomLens
                  </th>
                  <th className="px-5 py-4 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    Helium 10
                  </th>
                  <th className="px-5 py-4 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    Jungle Scout
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, idx) => (
                  <tr
                    key={row.feature}
                    className={idx % 2 === 0 ? 'bg-slate-800/20' : ''}
                  >
                    <td className="px-5 py-3.5 text-slate-200 font-medium">{row.feature}</td>
                    <td className="px-5 py-3.5 text-center">
                      <Cell value={row.bloom} accent />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <Cell value={row.h10} />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <Cell value={row.js} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ===================== Founder strip ===================== */}
      <section className="py-16 lg:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-blue-500/10 via-slate-800/40 to-emerald-500/10 backdrop-blur-xl rounded-3xl border border-blue-500/20 p-8 lg:p-10">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
              {/* Placeholder avatar — replace /public/founder-dave.jpg when ready */}
              <div className="flex-shrink-0">
                <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-blue-500/30 to-emerald-500/30 border border-blue-500/40 flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/founder-dave.jpg"
                    alt="Dave Keefe, founder of BloomEngine"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Graceful fallback — initials block if the photo isn't deployed yet.
                      const target = e.currentTarget as HTMLImageElement;
                      target.style.display = 'none';
                      target.parentElement!.innerHTML =
                        '<span class="text-3xl font-bold text-white">DK</span>';
                    }}
                  />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-wider text-blue-300 font-semibold mb-2">
                  From the founder
                </div>
                <p className="text-lg text-slate-200 leading-relaxed mb-4">
                  &ldquo;After selling my Amazon brand and coaching 600+ sellers through their own
                  launches, I kept seeing the same thing happen over and over — smart, hardworking
                  people picking products that never had a real shot, because the research tools
                  they trusted were quietly feeding them bad data. BloomLens is the tool I built to
                  fix that. It&apos;s what I now use with every client, and what I wish I&apos;d had on day
                  one. Real answers in seconds, so you can launch with confidence instead of
                  crossing your fingers.&rdquo;
                </p>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="text-slate-300 font-semibold">— Dave Keefe</span>
                  <a
                    href="https://www.youtube.com/@growwithfba"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-red-400 hover:text-red-300 transition-colors"
                  >
                    <Youtube className="w-4 h-4" />
                    @growwithfba
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== Risk reversal ===================== */}
      <section className="py-12 lg:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <RiskTile icon={CreditCard} title="No charges during trial" body="Card on file, but zero charges for 7 full days. We're upfront about it." />
            <RiskTile icon={RefreshCcw} title="Cancel in 2 clicks" body="No call, no email, no retention dance — and you keep access through day 7." />
            <RiskTile icon={Lock} title="Your data, your control" body="Delete your account anytime and we wipe everything within 24 hours." />
          </div>
        </div>
      </section>

      {/* ===================== FAQ ===================== */}
      <section className="py-16 lg:py-20 bg-slate-900/40 border-y border-slate-700/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-10">
            Questions worth answering
          </h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <details
                key={item.q}
                className="group bg-slate-800/50 backdrop-blur-xl rounded-xl border border-slate-700/50 overflow-hidden"
              >
                <summary className="flex items-center justify-between cursor-pointer list-none px-5 py-4 hover:bg-slate-800/70 transition-colors">
                  <span className="text-base font-medium text-white pr-4">{item.q}</span>
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-700/60 flex items-center justify-center text-slate-300 group-open:rotate-45 transition-transform">
                    <span className="text-lg leading-none">+</span>
                  </span>
                </summary>
                <div className="px-5 pb-5 pt-1 text-sm text-slate-300 leading-relaxed">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Final CTA ===================== */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Find your next winning product. In under a minute.
          </h2>
          <p className="text-lg text-slate-400 mb-8">
            Free Chrome extension. 7-day Pro trial included. Card required at signup, cancel
            anytime in one click.
          </p>

          {isMobile ? (
            <MobileEmailCapture pxAttrs={pxAttrs} compact />
          ) : (
            <a
              href={installed ? '/dashboard' : installUrl}
              target={installed ? undefined : '_blank'}
              rel={installed ? undefined : 'noopener noreferrer'}
              className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20 text-base"
              {...pxAttrs(installed ? 'final_open_app' : 'final_install_click')}
            >
              <Chrome className="w-5 h-5" />
              {installed ? 'Open BloomEngine' : 'Install Free Chrome Extension'}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
          )}
        </div>
      </section>

      <Footer />

      {/* ===================== Sticky bottom install bar ===================== */}
      {showStickyBar && !installed && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-xl border-t border-slate-700/60 shadow-2xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden sm:flex w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/30 to-emerald-500/30 border border-blue-500/40 items-center justify-center flex-shrink-0">
                <Chrome className="w-4 h-4 text-blue-300" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  BloomLens — free to install
                </div>
                <div className="text-xs text-slate-400 hidden sm:block">
                  7-day Pro trial · cancel anytime
                </div>
              </div>
            </div>
            {isMobile ? (
              <a
                href="#mobile-capture"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 text-white font-medium rounded-lg text-sm flex-shrink-0"
                {...pxAttrs('sticky_mobile_email')}
              >
                <Mail className="w-4 h-4" />
                Email me the link
              </a>
            ) : (
              <a
                href={installUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium rounded-lg text-sm flex-shrink-0"
                {...pxAttrs('sticky_install_click')}
              >
                <Chrome className="w-4 h-4" />
                Install Free
              </a>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function Cell({ value, accent = false }: { value: boolean | string; accent?: boolean }) {
  if (value === true) {
    return (
      <CheckCircle2
        className={`w-5 h-5 mx-auto ${accent ? 'text-emerald-400' : 'text-slate-400'}`}
      />
    );
  }
  if (value === false) {
    return <XCircle className="w-5 h-5 mx-auto text-slate-600" />;
  }
  return (
    <span className={`text-xs ${accent ? 'text-emerald-300 font-medium' : 'text-slate-400'}`}>
      {value}
    </span>
  );
}

function RiskTile({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-slate-800/40 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-5 text-center">
      <div className="inline-flex w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 items-center justify-center mb-3">
        <Icon className="w-4.5 h-4.5 text-emerald-300" />
      </div>
      <div className="text-sm font-semibold text-white mb-1">{title}</div>
      <div className="text-xs text-slate-400">{body}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// HeroMedia — real screenshot of the BloomLens drawer running on Amazon.
// Replaces an earlier mocked-up component (Dave preferred the actual product
// shot — it shows real metrics, the verdict color rail, and the drawer
// chrome a visitor will see post-install). Drop in a <video> later if a
// demo recording lands: autoplay muted loop playsinline.
// -----------------------------------------------------------------------------
function HeroMedia({ installUrl }: { installUrl: string }) {
  return (
    <div className="relative">
      <div className="absolute -top-3 -left-3 z-10">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded-full shadow-lg">
          <Sparkles className="w-3.5 h-3.5" />
          Live on Amazon
        </div>
      </div>

      <a
        href={installUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative rounded-2xl overflow-hidden border border-slate-700/60 shadow-2xl shadow-blue-500/10 bg-slate-900/80 hover:border-blue-500/40 transition-colors group"
        aria-label="See BloomLens running live — install free from the Chrome Web Store"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bloomlens-hero.jpg"
          alt="BloomLens drawer showing live Amazon market data — 70 basketball-training products scored with market cap, competitor count, monthly revenue, BSR, and individual verdicts."
          className="w-full h-auto block group-hover:scale-[1.01] transition-transform duration-500"
          width={1400}
          height={976}
        />
      </a>
    </div>
  );
}

// -----------------------------------------------------------------------------
// MobileEmailCapture — replaces install CTA on mobile devices since Chrome
// extensions cannot be installed on phones. POSTs to /api/extension/install-link
// which emails the visitor + BCCs support@bloomengine.ai for lead capture.
// -----------------------------------------------------------------------------
function MobileEmailCapture({
  pxAttrs,
  compact = false,
}: {
  pxAttrs: (e: string) => Record<string, string>;
  compact?: boolean;
}) {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    const utm = {
      utm_source: searchParams?.get('utm_source') ?? null,
      utm_medium: searchParams?.get('utm_medium') ?? null,
      utm_campaign: searchParams?.get('utm_campaign') ?? null,
      utm_content: searchParams?.get('utm_content') ?? null,
      referrer: typeof document !== 'undefined' ? document.referrer : null,
    };

    try {
      const res = await fetch('/api/extension/install-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, utm }),
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !data?.success) {
        setStatus('error');
        setErrorMsg(data?.error || 'Could not send. Try again.');
        return;
      }
      setStatus('sent');
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Try again.');
    }
  };

  if (status === 'sent') {
    return (
      <div
        id="mobile-capture"
        className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-left"
      >
        <div className="flex items-center gap-2 text-emerald-300 font-semibold mb-1">
          <CheckCircle2 className="w-5 h-5" />
          Check your inbox
        </div>
        <p className="text-sm text-slate-300">
          Sent <strong>{email}</strong> a link. Open it on your desktop computer to install BloomLens
          from the Chrome Web Store.
        </p>
      </div>
    );
  }

  return (
    <form
      id="mobile-capture"
      onSubmit={onSubmit}
      className={`${compact ? '' : 'mt-1'} space-y-2.5 text-left`}
      {...pxAttrs('mobile_email_submit')}
    >
      <div className="flex items-center gap-2 text-xs text-amber-300/90">
        <Smartphone className="w-3.5 h-3.5" />
        <span>Chrome extensions install on desktop — we&apos;ll email you the link</span>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="flex-1 px-4 py-3 rounded-xl bg-slate-800/70 border border-slate-700/60 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30 transition"
          disabled={status === 'submitting'}
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 disabled:opacity-60 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20"
        >
          <Mail className="w-4 h-4" />
          {status === 'submitting' ? 'Sending…' : 'Email me the link'}
        </button>
      </div>
      {status === 'error' && (
        <p className="text-xs text-rose-300">{errorMsg}</p>
      )}
    </form>
  );
}
