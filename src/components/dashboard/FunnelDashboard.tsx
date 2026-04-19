'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import {
  ArrowRight,
  Calculator,
  Hash,
  Leaf,
  Loader2,
  Plus,
  Sprout,
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { useProductFunnelStats } from '@/hooks/useProductFunnelStats';
import ResearchIcon from '@/components/Icons/ResearchIcon';
import VettedIcon from '@/components/Icons/VettedIcon';
import OfferIcon from '@/components/Icons/OfferIcon';
import SourcedIcon from '@/components/Icons/SourcedIcon';

type Stage = 'research' | 'vetting' | 'offer' | 'sourcing';

const STAGE_COLORS: Record<Stage, { hex: string; soft: string; text: string; glow: string; accent: string }> = {
  research: {
    hex: '#3b82f6',
    soft: 'rgba(59, 130, 246, 0.18)',
    text: 'text-blue-300',
    glow: 'shadow-blue-500/20',
    accent: 'border-blue-500/40 hover:border-blue-500/80',
  },
  vetting: {
    hex: '#06b6d4',
    soft: 'rgba(6, 182, 212, 0.18)',
    text: 'text-cyan-300',
    glow: 'shadow-cyan-500/20',
    accent: 'border-cyan-500/40 hover:border-cyan-500/80',
  },
  offer: {
    hex: '#10b981',
    soft: 'rgba(16, 185, 129, 0.18)',
    text: 'text-emerald-300',
    glow: 'shadow-emerald-500/20',
    accent: 'border-emerald-500/40 hover:border-emerald-500/80',
  },
  sourcing: {
    hex: '#84cc16',
    soft: 'rgba(132, 204, 22, 0.18)',
    text: 'text-lime-300',
    glow: 'shadow-lime-500/20',
    accent: 'border-lime-500/40 hover:border-lime-500/80',
  },
};

interface RecentProduct {
  id: string;
  asin: string | null;
  title: string | null;
  is_vetted: boolean;
  is_offered: boolean;
  is_sourced: boolean;
  updated_at: string;
}

function currentStage(p: RecentProduct): Stage {
  if (p.is_sourced) return 'sourcing';
  if (p.is_offered) return 'offer';
  if (p.is_vetted) return 'vetting';
  return 'research';
}

const STAGE_LABELS: Record<Stage, string> = {
  research: 'Research',
  vetting: 'Vetting',
  offer: 'Offering',
  sourcing: 'Sourcing',
};

/**
 * A short, on-theme motivational line for the funnel header. We pick
 * deterministically based on the day so the message is stable across
 * a session but varies day to day.
 */
function funnelTagline(totalProducts: number): string {
  if (totalProducts === 0) {
    return 'Every great brand starts with a single seed.';
  }
  const lines = [
    'Keep planting — every product you plant is a step closer to bloom.',
    'Water it daily. Brands grow one product at a time.',
    'From seed to bloom — every product is on its journey.',
    'Tend the funnel. The harvest comes to those who keep planting.',
    'Every stage you clear moves the whole brand forward.',
  ];
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return lines[day % lines.length];
}

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

export function FunnelDashboard() {
  const router = useRouter();
  const { user } = useSelector((state: RootState) => state.auth);
  const {
    products,
    productsVetted,
    productsOffered,
    productsSourced,
    loading: statsLoading,
  } = useProductFunnelStats();

  const [recent, setRecent] = useState<RecentProduct[] | null>(null);

  const totalProducts = products?.length ?? 0;

  // Pull the 5 most recently-updated products for the activity strip.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('research_products')
        .select('id, asin, title, is_vetted, is_offered, is_sourced, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(5);
      if (!cancelled) setRecent((data as RecentProduct[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const stageCards = useMemo(
    () => [
      {
        stage: 'research' as Stage,
        title: 'In Funnel',
        count: totalProducts,
        description: 'Total products you are tracking',
        icon: <ResearchIcon shape="rounded" />,
        href: '/research',
      },
      {
        stage: 'vetting' as Stage,
        title: 'Vetted',
        count: productsVetted,
        description: 'Markets you have analyzed',
        icon: <VettedIcon isDisabled={productsVetted === 0} shape="rounded" />,
        href: '/vetting',
      },
      {
        stage: 'offer' as Stage,
        title: 'Offerings Built',
        count: productsOffered,
        description: 'Products with an offer strategy',
        icon: <OfferIcon isDisabled={productsOffered === 0} shape="rounded" />,
        href: '/offer',
      },
      {
        stage: 'sourcing' as Stage,
        title: 'Sourced',
        count: productsSourced,
        description: 'Suppliers lined up',
        icon: <SourcedIcon isDisabled={productsSourced === 0} shape="rounded" />,
        href: '/sourcing',
      },
    ],
    [totalProducts, productsVetted, productsOffered, productsSourced]
  );

  const isEmpty = !statsLoading && totalProducts === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Your brand funnel at a glance — every product plant the team is tending.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stageCards.map(({ stage, title, count, description, icon, href }) => {
          const colors = STAGE_COLORS[stage];
          return (
            <button
              key={stage}
              type="button"
              onClick={() => router.push(href)}
              className={`group rounded-2xl border bg-slate-900/60 backdrop-blur-sm p-5 text-left transition-all hover:bg-slate-900/80 hover:scale-[1.01] ${colors.accent} shadow-lg ${colors.glow}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center">{icon}</div>
                <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-slate-200 transition-colors" />
              </div>
              <div className="mt-4">
                <p className={`text-4xl font-bold ${colors.text}`}>
                  {statsLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : count}
                </p>
                <p className="mt-1 text-sm font-medium text-white">{title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{description}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Funnel viz + quick actions */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-white">Your Brand Funnel</h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300/90 text-right">
              <Sprout className="h-3.5 w-3.5 shrink-0" />
              {funnelTagline(totalProducts)}
            </span>
          </div>

          {isEmpty ? (
            <EmptyFunnelCTA onAddAsin={() => router.push('/research?tab=new')} />
          ) : (
            <FunnelSvg
              total={totalProducts}
              vetted={productsVetted}
              offered={productsOffered}
              sourced={productsSourced}
              onClickStage={(stage) => {
                const card = stageCards.find((c) => c.stage === stage);
                if (card) router.push(card.href);
              }}
            />
          )}

          {/* Quick actions row */}
          <div className="mt-6 flex flex-wrap gap-3 pt-5 border-t border-slate-700/60">
            <button
              type="button"
              onClick={() => router.push('/research?tab=new')}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 hover:bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add an ASIN
            </button>
            <button
              type="button"
              onClick={() => router.push('/vetting?tab=new')}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              <Leaf className="h-4 w-4" />
              Vet a Product
            </button>
            <button
              type="button"
              onClick={() => router.push('/sourcing?tab=sandbox')}
              className="inline-flex items-center gap-2 rounded-lg bg-lime-500 hover:bg-lime-600 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              <Calculator className="h-4 w-4" />
              Calculate Profits
            </button>
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm p-6 flex flex-col">
          <h2 className="text-lg font-semibold text-white mb-1">Recent Activity</h2>
          <p className="text-xs text-slate-500 mb-4">Your 5 most recently-updated products.</p>
          {recent == null ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Nothing yet. Add an ASIN or upload a CSV to start.
            </p>
          ) : (
            <ul className="space-y-2">
              {recent.map((p) => {
                const stage = currentStage(p);
                const colors = STAGE_COLORS[stage];
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() =>
                        p.asin
                          ? router.push(`/research/${p.asin}`)
                          : router.push('/research')
                      }
                      className="w-full flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-800/60 transition-colors text-left"
                    >
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: colors.hex }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">
                          {p.title || p.asin || 'Untitled'}
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          <span className={colors.text}>{STAGE_LABELS[stage]}</span>
                          <span>·</span>
                          <span>{timeAgo(p.updated_at)}</span>
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Skool community banner */}
      <SkoolBanner />
    </div>
  );
}

// ---- Empty state ----

function EmptyFunnelCTA({ onAddAsin }: { onAddAsin: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500/20 to-emerald-500/20 border border-slate-700/60 mb-4">
        <Hash className="h-7 w-7 text-slate-300" />
      </div>
      <h3 className="text-lg font-semibold text-white">No products yet</h3>
      <p className="text-sm text-slate-400 mt-1 max-w-sm">
        Plant the first seed of your brand. Add an ASIN or upload a CSV to see your funnel come alive.
      </p>
      <button
        type="button"
        onClick={onAddAsin}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-500 hover:bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add your first ASIN
      </button>
    </div>
  );
}

// ---- Funnel SVG ----

function FunnelSvg({
  total,
  vetted,
  offered,
  sourced,
  onClickStage,
}: {
  total: number;
  vetted: number;
  offered: number;
  sourced: number;
  onClickStage: (stage: Stage) => void;
}) {
  const stages: Array<{ key: Stage; label: string; count: number; colorHex: string }> = [
    { key: 'research', label: 'In Funnel', count: total, colorHex: STAGE_COLORS.research.hex },
    { key: 'vetting', label: 'Vetted', count: vetted, colorHex: STAGE_COLORS.vetting.hex },
    { key: 'offer', label: 'Offerings', count: offered, colorHex: STAGE_COLORS.offer.hex },
    { key: 'sourcing', label: 'Sourced', count: sourced, colorHex: STAGE_COLORS.sourcing.hex },
  ];

  const maxCount = Math.max(total, 1);
  const minRatio = 0.28;
  const WIDTH = 720;
  const HEIGHT = 280;
  const BAND_HEIGHT = HEIGHT / stages.length;
  const GAP = 10;
  const CORNER = 14;

  const ratioFor = (count: number) => {
    if (maxCount === 0) return minRatio;
    return Math.max(minRatio, count / maxCount);
  };

  // Build a rounded-corner trapezoid via an SVG path so the bands read
  // as soft capsules instead of hard 4-point polygons.
  const buildBandPath = (
    topLeft: [number, number],
    topRight: [number, number],
    bottomRight: [number, number],
    bottomLeft: [number, number],
    r = CORNER
  ) => {
    const [tlX, tlY] = topLeft;
    const [trX, trY] = topRight;
    const [brX, brY] = bottomRight;
    const [blX, blY] = bottomLeft;
    return [
      `M ${tlX + r} ${tlY}`,
      `L ${trX - r} ${trY}`,
      `Q ${trX} ${trY} ${trX - r * 0.2} ${trY + r}`,
      `L ${brX + r * 0.2} ${brY - r}`,
      `Q ${brX} ${brY} ${brX - r} ${brY}`,
      `L ${blX + r} ${blY}`,
      `Q ${blX} ${blY} ${blX + r * 0.2} ${blY - r}`,
      `L ${tlX - r * 0.2} ${tlY + r}`,
      `Q ${tlX} ${tlY} ${tlX + r} ${tlY}`,
      'Z',
    ].join(' ');
  };

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="Funnel visualization of products across stages"
      >
        <defs>
          {stages.map((stage) => (
            <linearGradient
              key={`grad-${stage.key}`}
              id={`funnel-grad-${stage.key}`}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor={stage.colorHex} stopOpacity="0.35" />
              <stop offset="100%" stopColor={stage.colorHex} stopOpacity="0.15" />
            </linearGradient>
          ))}
        </defs>

        {stages.map((stage, i) => {
          const top = i * BAND_HEIGHT + GAP / 2;
          const bottom = (i + 1) * BAND_HEIGHT - GAP / 2;
          const nextRatio = i + 1 < stages.length ? ratioFor(stages[i + 1].count) : ratioFor(stage.count) * 0.9;
          const thisRatio = ratioFor(stage.count);
          const topHalfWidth = (WIDTH * thisRatio) / 2;
          const bottomHalfWidth = (WIDTH * nextRatio) / 2;
          const cx = WIDTH / 2;
          const labelY = top + BAND_HEIGHT / 2 - GAP / 2;

          const path = buildBandPath(
            [cx - topHalfWidth, top],
            [cx + topHalfWidth, top],
            [cx + bottomHalfWidth, bottom],
            [cx - bottomHalfWidth, bottom]
          );

          return (
            <g
              key={stage.key}
              onClick={() => onClickStage(stage.key)}
              style={{ cursor: 'pointer' }}
              className="transition-opacity hover:opacity-95"
            >
              <path
                d={path}
                fill={`url(#funnel-grad-${stage.key})`}
                stroke={stage.colorHex}
                strokeOpacity={0.55}
                strokeWidth={1.25}
                strokeLinejoin="round"
              />
              <text
                x={cx}
                y={labelY - 5}
                fill={stage.colorHex}
                fontSize="13"
                fontWeight="600"
                textAnchor="middle"
                style={{ userSelect: 'none', letterSpacing: '0.02em' }}
              >
                {stage.label}
              </text>
              <text
                x={cx}
                y={labelY + 15}
                fill="#f1f5f9"
                fontSize="20"
                fontWeight="700"
                textAnchor="middle"
                style={{ userSelect: 'none' }}
              >
                {stage.count}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---- Skool community banner ----

function SkoolBanner() {
  return (
    <a
      href="https://www.skool.com/growwithfba/about"
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-slate-800/40 p-5 hover:border-emerald-500/60 hover:from-emerald-500/20 transition-all"
    >
      {/* Decorative glow */}
      <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl group-hover:bg-emerald-500/30 transition-colors" />
      <div className="absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-lime-500/10 blur-3xl" />

      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-2xl shrink-0">
            🌱
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-white">
              Join the Grow With FBA community
            </p>
            <p className="text-sm text-emerald-200/80">
              Connect with sellers planting their own brands. Weekly calls, wins, and insider tips. 🚀
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors">
          Visit Skool
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </a>
  );
}
