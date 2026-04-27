'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import {
  ArrowRight,
  Calculator,
  Hash,
  Leaf,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { useProductFunnelStats } from '@/hooks/useProductFunnelStats';
import ResearchIcon from '@/components/Icons/ResearchIcon';
import VettedIcon from '@/components/Icons/VettedIcon';
import OfferIcon from '@/components/Icons/OfferIcon';
import SourcedIcon from '@/components/Icons/SourcedIcon';

type Stage = 'research' | 'vetting' | 'offer' | 'sourcing';

const STAGE_COLORS: Record<
  Stage,
  { hex: string; soft: string; text: string; labelText: string; glow: string; accent: string }
> = {
  research: {
    hex: '#3b82f6',
    soft: 'rgba(59, 130, 246, 0.18)',
    text: 'text-blue-300',
    labelText: 'text-blue-400/80',
    glow: 'shadow-blue-500/20',
    accent: 'border-blue-500/40 hover:border-blue-500/80',
  },
  vetting: {
    hex: '#06b6d4',
    soft: 'rgba(6, 182, 212, 0.18)',
    text: 'text-cyan-300',
    labelText: 'text-cyan-400/80',
    glow: 'shadow-cyan-500/20',
    accent: 'border-cyan-500/40 hover:border-cyan-500/80',
  },
  offer: {
    hex: '#10b981',
    soft: 'rgba(16, 185, 129, 0.18)',
    text: 'text-emerald-300',
    labelText: 'text-emerald-400/80',
    glow: 'shadow-emerald-500/20',
    accent: 'border-emerald-500/40 hover:border-emerald-500/80',
  },
  sourcing: {
    hex: '#14b8a6',
    soft: 'rgba(20, 184, 166, 0.18)',
    text: 'text-teal-300',
    labelText: 'text-teal-400/80',
    glow: 'shadow-teal-500/20',
    accent: 'border-teal-500/40 hover:border-teal-500/80',
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
  const [displayName, setDisplayName] = useState<string | null>(null);

  const totalProducts = products?.length ?? 0;

  // Resolve the greeting name with the freshest source available:
  //   1. auth.users.user_metadata.full_name (updated by Profile Settings)
  //   2. public.profiles.full_name          (set by the same save flow)
  //   3. email prefix (last-resort fallback)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (cancelled || !authUser) return;
      const metaName: string | undefined =
        authUser.user_metadata?.full_name || authUser.user_metadata?.name;
      if (metaName) {
        setDisplayName(metaName);
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', authUser.id)
        .maybeSingle();
      if (!cancelled) {
        const profileName =
          profile?.full_name || profile?.username || authUser.email?.split('@')[0] || null;
        setDisplayName(profileName || null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
          Welcome back{displayName ? `, ${displayName}` : ''}
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
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-white tracking-tight">Your Brand Funnel</h2>
            <p className="mt-1 text-sm text-slate-400">
              How many products have moved through each stage.
            </p>
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

          {/* Quick actions — title + description card-style buttons, one
              per phase. The previous icon-only pills hid which stage
              each action belonged to. */}
          <div className="mt-7 pt-5 border-t border-slate-700/60">
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">
              Quick actions
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <QuickAction
                icon={<Plus className="h-5 w-5" />}
                label="Add an ASIN"
                description="Drop in an Amazon ID to start tracking it."
                tone="blue"
                onClick={() => router.push('/research?tab=new')}
              />
              <QuickAction
                icon={<Leaf className="h-5 w-5" />}
                label="Vet a Product"
                description="Score a market against the competitive matrix."
                tone="cyan"
                onClick={() => router.push('/vetting?tab=new')}
              />
              <QuickAction
                icon={<Sparkles className="h-5 w-5" />}
                label="Build an Offer"
                description="Turn a vetted product into super selling points."
                tone="emerald"
                onClick={() => router.push('/offer?tab=build')}
              />
              <QuickAction
                icon={<Calculator className="h-5 w-5" />}
                label="Calculate Profits"
                description="Test costs and margins before sourcing."
                tone="teal"
                onClick={() => router.push('/sourcing?tab=sandbox')}
              />
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm p-6 flex flex-col">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white tracking-tight">Recent Activity</h2>
            <p className="mt-1 text-sm text-slate-400">
              Your 5 most recently-updated products.
            </p>
          </div>
          {recent == null ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Nothing yet. Add an ASIN or upload a CSV to start.
            </p>
          ) : (
            <ul className="-mx-2 divide-y divide-slate-800/60">
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
                      className="w-full flex items-start gap-3 rounded-lg px-2 py-3 hover:bg-slate-800/60 transition-colors text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate leading-snug">
                          {p.title || p.asin || 'Untitled'}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${colors.text} ${colors.accent}`}
                            style={{ background: colors.soft }}
                          >
                            {STAGE_LABELS[stage]}
                          </span>
                          <span className="text-xs text-slate-500">
                            {timeAgo(p.updated_at)}
                          </span>
                        </div>
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

// ---- Quick action card ----

type QuickActionTone = 'blue' | 'cyan' | 'emerald' | 'teal';

const QUICK_ACTION_STYLES: Record<QuickActionTone, {
  border: string;
  bg: string;
  iconBg: string;
  iconText: string;
  hoverShadow: string;
  ring: string;
}> = {
  blue: {
    border: 'border-blue-500/40 hover:border-blue-400/80',
    bg: 'bg-slate-900/60 hover:bg-blue-500/10',
    iconBg: 'bg-blue-500/15 border border-blue-500/40',
    iconText: 'text-blue-300',
    hoverShadow: 'hover:shadow-[0_0_22px_rgba(59,130,246,0.22)]',
    ring: 'focus-visible:ring-blue-400/40',
  },
  cyan: {
    border: 'border-cyan-500/40 hover:border-cyan-400/80',
    bg: 'bg-slate-900/60 hover:bg-cyan-500/10',
    iconBg: 'bg-cyan-500/15 border border-cyan-500/40',
    iconText: 'text-cyan-300',
    hoverShadow: 'hover:shadow-[0_0_22px_rgba(6,182,212,0.22)]',
    ring: 'focus-visible:ring-cyan-400/40',
  },
  emerald: {
    border: 'border-emerald-500/40 hover:border-emerald-400/80',
    bg: 'bg-slate-900/60 hover:bg-emerald-500/10',
    iconBg: 'bg-emerald-500/15 border border-emerald-500/40',
    iconText: 'text-emerald-300',
    hoverShadow: 'hover:shadow-[0_0_22px_rgba(16,185,129,0.22)]',
    ring: 'focus-visible:ring-emerald-400/40',
  },
  teal: {
    border: 'border-teal-500/40 hover:border-teal-400/80',
    bg: 'bg-slate-900/60 hover:bg-teal-500/10',
    iconBg: 'bg-teal-500/15 border border-teal-500/40',
    iconText: 'text-teal-300',
    hoverShadow: 'hover:shadow-[0_0_22px_rgba(20,184,166,0.22)]',
    ring: 'focus-visible:ring-teal-400/40',
  },
};

function QuickAction({
  icon,
  label,
  description,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  tone: QuickActionTone;
  onClick: () => void;
}) {
  const styles = QUICK_ACTION_STYLES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-xl border ${styles.border} ${styles.bg} ${styles.hoverShadow} ${styles.ring} px-4 py-3 text-left transition-all focus:outline-none focus-visible:ring-2`}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${styles.iconBg} ${styles.iconText}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{label}</span>
        <span className="block mt-0.5 text-xs text-slate-400 leading-snug">
          {description}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-slate-200 transition-colors shrink-0" />
    </button>
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

// ---- Funnel chart ----
//
// Horizontal bars instead of a stacked-trapezoid shape. With the typical
// shape of a brand funnel (lots at top, very few at bottom), a tapered
// SVG funnel just produced a wide top band and a row of identical-looking
// blobs below. Bars solve that — the eye reads counts directly, large
// gaps between stages don't break the chart, and there's room for a
// per-stage conversion rate off the previous stage.
//
// Width formula: lerp(FUNNEL_MIN_RATIO, 1, count / max(counts)). Any
// non-zero stage gets at least FUNNEL_MIN_RATIO of the track so it's
// still visible / clickable.
//
// Bar widths animate over ~600ms via useTweenedRatios.

const FUNNEL_MIN_RATIO = 0.04;
const FUNNEL_TWEEN_MS = 600;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function useTweenedRatios(target: number[], durationMs = FUNNEL_TWEEN_MS) {
  const [current, setCurrent] = useState<number[]>(target);
  const fromRef = useRef<number[]>(target);
  const startedAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      target.length === fromRef.current.length &&
      target.every((v, i) => Math.abs(v - fromRef.current[i]) < 0.001)
    ) {
      return;
    }
    const from = current.slice();
    fromRef.current = from;
    startedAtRef.current = null;

    const step = (now: number) => {
      if (startedAtRef.current == null) startedAtRef.current = now;
      const t = Math.min(1, (now - startedAtRef.current) / durationMs);
      const eased = easeOutCubic(t);
      const next = from.map((v, i) => v + (target[i] - v) * eased);
      setCurrent(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.join('|'), durationMs]);

  return current;
}

function formatConversion(num: number, denom: number): string | null {
  if (!Number.isFinite(num) || !Number.isFinite(denom) || denom <= 0) return null;
  const pct = (num / denom) * 100;
  if (pct >= 100) return '100%';
  if (pct >= 10) return `${pct.toFixed(0)}%`;
  // Sub-10% conversions need one decimal so you can tell 3% from 6%.
  return `${pct.toFixed(1)}%`;
}

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
  const stages: Array<{
    key: Stage;
    label: string;
    count: number;
    icon: React.ReactNode;
  }> = [
    {
      key: 'research',
      label: 'In Funnel',
      count: total,
      icon: <ResearchIcon shape="rounded" />,
    },
    {
      key: 'vetting',
      label: 'Vetted',
      count: vetted,
      icon: <VettedIcon isDisabled={vetted === 0} shape="rounded" />,
    },
    {
      key: 'offer',
      label: 'Offerings',
      count: offered,
      icon: <OfferIcon isDisabled={offered === 0} shape="rounded" />,
    },
    {
      key: 'sourcing',
      label: 'Sourced',
      count: sourced,
      icon: <SourcedIcon isDisabled={sourced === 0} shape="rounded" />,
    },
  ];

  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  const targetRatios = useMemo(
    () =>
      stages.map((s) => {
        if (s.count <= 0) return 0;
        return FUNNEL_MIN_RATIO + (1 - FUNNEL_MIN_RATIO) * Math.min(1, s.count / maxCount);
      }),
    // stages identity churns every render; track the numeric inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [total, vetted, offered, sourced, maxCount]
  );
  const ratios = useTweenedRatios(targetRatios);

  return (
    <div className="space-y-3" role="list" aria-label="Funnel breakdown">
      {stages.map((stage, i) => {
        const ratio = ratios[i] ?? 0;
        const widthPct = `${Math.max(0, Math.min(100, ratio * 100)).toFixed(2)}%`;
        const colors = STAGE_COLORS[stage.key];
        const prev = i > 0 ? stages[i - 1] : null;
        const conversion = prev ? formatConversion(stage.count, prev.count) : null;

        return (
          <button
            key={stage.key}
            type="button"
            role="listitem"
            onClick={() => onClickStage(stage.key)}
            className="group w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600/60"
          >
            {/* Icon column */}
            <span className="flex h-8 w-8 items-center justify-center shrink-0">
              {stage.icon}
            </span>

            {/* Label column — fixed width so bars line up across rows. */}
            <span className={`text-sm font-medium w-24 shrink-0 ${colors.labelText}`}>
              {stage.label}
            </span>

            {/* Bar track + filled bar. */}
            <div className="relative flex-1 h-9 rounded-lg bg-slate-800/40 border border-slate-700/40 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-lg"
                style={{
                  width: widthPct,
                  background: `linear-gradient(90deg, ${colors.hex}25 0%, ${colors.hex}55 100%)`,
                  borderRight: `2px solid ${colors.hex}`,
                  transition: 'box-shadow 200ms',
                  boxShadow: `inset 0 0 12px 0 ${colors.soft}`,
                }}
              />
            </div>

            {/* Count + conversion. */}
            <div className="flex flex-col items-end shrink-0 w-24 text-right">
              <span className={`text-xl font-bold tabular-nums ${colors.text}`}>
                {stage.count}
              </span>
              {conversion ? (
                <span className="text-[10px] uppercase tracking-wider text-slate-500 leading-tight">
                  {conversion} of {prev?.label.toLowerCase()}
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wider text-slate-600 leading-tight">
                  total
                </span>
              )}
            </div>
          </button>
        );
      })}
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
      <div className="absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />

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
