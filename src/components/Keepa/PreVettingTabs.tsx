'use client';

import React, { useMemo, useState } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import {
  ChevronDown,
  ChevronRight,
  Rocket,
  DollarSign,
  TrendingUp,
  Check,
  Flag,
  Activity,
  Zap
} from 'lucide-react';
import type { KeepaAnalysisSnapshot } from './KeepaTypes';
import type {
  CompetitorProfile,
  CompetitorProfileSet
} from '@/lib/marketClimate/competitorProfile';
import type {
  PreVettingNarration,
  PreVettingCompetitorNarrative
} from '@/services/marketClimateNarration';
import type {
  KeepaPoint,
  NormalizedKeepaCompetitor
} from '@/lib/keepa/normalize';

interface PreVettingTabsProps {
  analysis: KeepaAnalysisSnapshot;
  removedAsins?: Set<string> | string[];
}

type LensId = 'launch' | 'price-supply' | 'rank';

const TABS: Array<{
  id: LensId;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'launch', label: 'Launches', Icon: Rocket },
  { id: 'price-supply', label: 'Price & Supply', Icon: DollarSign },
  { id: 'rank', label: 'Rank', Icon: TrendingUp }
];

const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}`;
};

const formatBsr = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `#${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `#${(value / 1_000).toFixed(0)}K`;
  return `#${Math.round(value)}`;
};

const formatDays = (days: number | null | undefined): string => {
  if (days === null || days === undefined || !Number.isFinite(days)) return '—';
  if (days >= 365) return `${(days / 365).toFixed(1)}y`;
  if (days >= 30) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days)}d`;
};

const formatLaunchDate = (timestamp: number | null | undefined): string => {
  if (!timestamp || !Number.isFinite(timestamp)) return '—';
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const normalizeAsinSet = (raw: PreVettingTabsProps['removedAsins']): Set<string> => {
  if (!raw) return new Set();
  const values = Array.isArray(raw) ? raw : Array.from(raw);
  return new Set(values.map(a => a.toUpperCase()));
};

/* ----------------------------------------------------------------------------
 * Badge system — per-lens chips with green / sky / amber / rose tones,
 * matching the rest of the page.
 * --------------------------------------------------------------------------*/

type BadgeTone = 'emerald' | 'sky' | 'amber' | 'rose' | 'slate' | 'violet';

interface Badge {
  label: string;
  tone: BadgeTone;
  icon?: 'check' | 'flag' | 'activity' | 'zap';
  tooltip?: string;
}

const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
  sky:     'bg-sky-500/15 text-sky-200 border-sky-500/40',
  amber:   'bg-amber-500/15 text-amber-200 border-amber-500/40',
  rose:    'bg-rose-500/15 text-rose-200 border-rose-500/40',
  slate:   'bg-slate-700/30 text-slate-300 border-slate-600/50',
  violet:  'bg-violet-500/15 text-violet-200 border-violet-500/40'
};

const BADGE_ICON: Record<NonNullable<Badge['icon']>, React.ComponentType<{ className?: string }>> = {
  check: Check,
  flag: Flag,
  activity: Activity,
  zap: Zap
};

const BADGE_LINE_COLOR: Record<BadgeTone, string> = {
  emerald: '#34d399',
  sky: '#38bdf8',
  amber: '#f59e0b',
  rose: '#fb7185',
  slate: '#94a3b8',
  violet: '#a78bfa'
};

const launchBadges = (c: CompetitorProfile): Badge[] => {
  const badges: Badge[] = [];
  const days = c.launch.daysOnMarket;
  if (days !== null && days < 365) {
    badges.push({
      label: 'Recent launch',
      tone: 'sky',
      tooltip: 'Less than a year on the market — newer entrant'
    });
  } else if (days !== null && days >= 730) {
    badges.push({
      label: 'Established',
      tone: 'slate',
      tooltip: 'On the market for 2+ years'
    });
  }
  if (c.launch.launchedOnSale) {
    badges.push({
      label: 'Launched on sale',
      tone: 'amber',
      icon: 'activity',
      tooltip: `Came in with a list-price-vs-buy-box discount of about ${c.launch.launchDiscountPct ?? '?'}%`
    });
  }
  if (c.launch.daysToTraction !== null) {
    if (c.launch.daysToTraction <= 60) {
      badges.push({
        label: 'Quick traction',
        tone: 'emerald',
        icon: 'check',
        tooltip: 'Hit category-median rank within ~2 months of launch'
      });
    } else if (c.launch.daysToTraction >= 180) {
      badges.push({
        label: 'Slow ramp',
        tone: 'amber',
        tooltip: 'Took 6+ months to gain traction — the bar to break in is high here'
      });
    }
  }
  return badges;
};

const priceSupplyBadges = (c: CompetitorProfile): Badge[] => {
  const badges: Badge[] = [];

  // Stockouts — always shown (zero is a positive signal worth surfacing).
  if (c.priceSupply.stockoutCount === 0) {
    badges.push({
      label: 'No stockouts',
      tone: 'emerald',
      icon: 'check',
      tooltip: 'Steady supply discipline — no Buy Box gaps in the analysis window'
    });
  } else if (c.priceSupply.stockoutCount >= 3 || (c.priceSupply.longestStockoutDays ?? 0) > 30) {
    badges.push({
      label: `${c.priceSupply.stockoutCount} stockout${c.priceSupply.stockoutCount > 1 ? 's' : ''}`,
      tone: 'rose',
      icon: 'flag',
      tooltip: `Longest stockout: ~${c.priceSupply.longestStockoutDays ?? 0} days. Supply risk is real for this competitor.`
    });
  } else {
    badges.push({
      label: `${c.priceSupply.stockoutCount} stockout${c.priceSupply.stockoutCount > 1 ? 's' : ''}`,
      tone: 'amber',
      tooltip: 'Some supply disruption in the window'
    });
  }

  // Price activity — from the new seller's perspective: active = harder to compete
  // because they will undercut you fast. Lazy = you have room.
  if (c.priceSupply.priceActivityLevel === 'active') {
    badges.push({
      label: 'Active pricer',
      tone: 'amber',
      icon: 'activity',
      tooltip: 'Adjusts price often — expect frequent undercutting if you compete here'
    });
  } else if (c.priceSupply.priceActivityLevel === 'lazy') {
    badges.push({
      label: 'Lazy pricer',
      tone: 'emerald',
      tooltip: "Hasn't moved price often — slower to react to your moves"
    });
  }

  return badges;
};

const rankBadges = (c: CompetitorProfile): Badge[] => {
  const badges: Badge[] = [];
  const yearAvg = c.rank.bsrAvg365d;

  if (yearAvg !== null && Number.isFinite(yearAvg)) {
    if (yearAvg < 30_000) {
      badges.push({
        label: 'Strong year avg',
        tone: 'emerald',
        icon: 'check',
        tooltip: `Year-average BSR around ${formatBsr(yearAvg)} — actually selling consistently`
      });
    } else if (yearAvg < 100_000) {
      badges.push({
        label: 'Decent year avg',
        tone: 'sky',
        tooltip: `Year-average BSR around ${formatBsr(yearAvg)}`
      });
    } else {
      badges.push({
        label: 'Weak year avg',
        tone: 'rose',
        icon: 'flag',
        tooltip: `Year-average BSR around ${formatBsr(yearAvg)} — recent good months may be misleading`
      });
    }
  }

  if (
    c.rank.currentVsYearAverage === 'much-better-than-average' ||
    c.rank.currentVsYearAverage === 'better-than-average'
  ) {
    badges.push({
      label: 'Above their avg',
      tone: 'sky',
      icon: 'zap',
      tooltip: 'Currently selling better than their year-long average'
    });
  } else if (
    c.rank.currentVsYearAverage === 'worse-than-average' ||
    c.rank.currentVsYearAverage === 'much-worse-than-average'
  ) {
    badges.push({
      label: 'Below their avg',
      tone: 'amber',
      tooltip: 'Currently selling worse than their year-long average'
    });
  }

  if (c.rank.volatilityPct !== null) {
    if (c.rank.volatilityPct >= 60) {
      badges.push({
        label: 'Volatile',
        tone: 'amber',
        tooltip: `Rank swings a lot — coefficient of variation ~${c.rank.volatilityPct}%`
      });
    } else if (c.rank.volatilityPct < 30) {
      badges.push({
        label: 'Steady',
        tone: 'emerald',
        tooltip: 'Rank holds relatively flat — predictable demand'
      });
    }
  }

  return badges;
};

const badgesForLens = (lens: LensId, c: CompetitorProfile): Badge[] => {
  if (lens === 'launch') return launchBadges(c);
  if (lens === 'price-supply') return priceSupplyBadges(c);
  return rankBadges(c);
};

/* ----------------------------------------------------------------------------
 * Color tone for stat values in the row strip
 * --------------------------------------------------------------------------*/

const statToneClass: Record<BadgeTone, string> = {
  emerald: 'text-emerald-300',
  sky: 'text-sky-300',
  amber: 'text-amber-300',
  rose: 'text-rose-300',
  slate: 'text-slate-200',
  violet: 'text-violet-300'
};

const toneForBsr = (bsr: number | null | undefined): BadgeTone => {
  if (bsr === null || bsr === undefined || !Number.isFinite(bsr)) return 'slate';
  if (bsr < 30_000) return 'emerald';
  if (bsr < 100_000) return 'sky';
  return 'rose';
};

const toneForStockoutCount = (count: number): BadgeTone => {
  if (count === 0) return 'emerald';
  if (count >= 3) return 'rose';
  return 'amber';
};

/* ----------------------------------------------------------------------------
 * Sparkline — small, no axes, color = lens-specific tone
 * --------------------------------------------------------------------------*/

const Sparkline: React.FC<{
  points: KeepaPoint[];
  tone: BadgeTone;
  invert?: boolean;
}> = ({ points, tone, invert }) => {
  const data = useMemo(() => {
    const valid = points
      .filter(p => typeof p.value === 'number' && Number.isFinite(p.value))
      .map(p => ({ t: p.timestamp, v: p.value as number }));
    if (!invert || !valid.length) return valid;
    const max = Math.max(...valid.map(p => p.v));
    return valid.map(p => ({ ...p, v: max - p.v }));
  }, [points, invert]);

  if (data.length < 2) {
    return <div className="h-6 w-20" />;
  }
  return (
    <div className="h-6 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={BADGE_LINE_COLOR[tone]}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Component
 * --------------------------------------------------------------------------*/

const PreVettingTabs: React.FC<PreVettingTabsProps> = ({ analysis, removedAsins }) => {
  const [activeTab, setActiveTab] = useState<LensId>('launch');
  const [expandedAsins, setExpandedAsins] = useState<Set<string>>(new Set());

  const profileSet = analysis?.computed?.competitorProfiles as CompetitorProfileSet | undefined;
  const narration = analysis?.computed?.narration?.preVetting as PreVettingNarration | undefined;
  const removedSet = useMemo(() => normalizeAsinSet(removedAsins), [removedAsins]);

  // Look up the daily series per competitor so we can render sparklines.
  // analysis.normalized is null for old cached rows pre-2.8b — sparklines
  // gracefully no-op in that case.
  const seriesByAsin = useMemo(() => {
    const map = new Map<string, NormalizedKeepaCompetitor>();
    const competitors = analysis?.normalized?.competitors;
    if (Array.isArray(competitors)) {
      for (const competitor of competitors) {
        if (competitor?.asin) map.set(competitor.asin, competitor);
      }
    }
    return map;
  }, [analysis]);

  if (!profileSet || !profileSet.competitors.length) return null;

  const competitors = profileSet.competitors.filter(
    c => !removedSet.has(c.asin.toUpperCase())
  );

  const narrativeByAsin = new Map<string, PreVettingCompetitorNarrative>();
  if (narration?.competitors) {
    for (const entry of narration.competitors) narrativeByAsin.set(entry.asin, entry);
  }

  const toggleAsin = (asin: string) => {
    setExpandedAsins(prev => {
      const next = new Set(prev);
      if (next.has(asin)) next.delete(asin);
      else next.add(asin);
      return next;
    });
  };

  return (
    <div className="mb-6">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
        Pre-Vetting Reports
      </div>

      {/* Tab strip */}
      <div className="flex gap-2 mb-4">
        {TABS.map(tab => {
          const TabIcon = tab.Icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-sky-500/60 bg-sky-500/10 text-sky-200'
                  : 'border-slate-700/60 bg-slate-900/40 text-slate-300 hover:border-slate-500/60'
              }`}
            >
              <TabIcon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Per-competitor cards */}
      <div className="space-y-2 mb-4">
        {competitors.map(competitor => {
          const narrative = narrativeByAsin.get(competitor.asin);
          const expanded = expandedAsins.has(competitor.asin);
          return (
            <CompetitorCard
              key={competitor.asin}
              activeTab={activeTab}
              competitor={competitor}
              narrative={narrative}
              series={seriesByAsin.get(competitor.asin)}
              expanded={expanded}
              onToggle={() => toggleAsin(competitor.asin)}
            />
          );
        })}
      </div>

      {/* Big-picture synthesis */}
      <BigPictureBox
        activeTab={activeTab}
        profileSet={profileSet}
        narration={narration}
      />
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Per-competitor card — collapsed by default
 * --------------------------------------------------------------------------*/

const CompetitorCard: React.FC<{
  activeTab: LensId;
  competitor: CompetitorProfile;
  narrative?: PreVettingCompetitorNarrative;
  series?: NormalizedKeepaCompetitor;
  expanded: boolean;
  onToggle: () => void;
}> = ({ activeTab, competitor, narrative, series, expanded, onToggle }) => {
  const headline = narrative?.headline || buildFallbackHeadline(competitor, activeTab);
  const longText = expandedNarrative(activeTab, competitor, narrative);
  const stats = lensStats(activeTab, competitor);
  const badges = badgesForLens(activeTab, competitor);
  const spark = sparkForLens(activeTab, competitor, series);

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-900/60 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <div className="text-sm text-slate-100 font-semibold">
                {competitor.brand || competitor.asin}
              </div>
              {badges.map((badge, i) => (
                <BadgePill key={i} badge={badge} />
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 shrink-0">
              {spark && (
                <Sparkline points={spark.points} tone={spark.tone} invert={spark.invert} />
              )}
              {stats.map((stat, i) => (
                <span key={i}>
                  <span className="text-slate-500">{stat.label}:</span>{' '}
                  <span className={`font-medium ${statToneClass[stat.tone ?? 'slate']}`}>
                    {stat.value}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="text-xs text-slate-300 mt-1 leading-relaxed">{headline}</div>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-700/40">
          <p className="text-sm text-slate-200 leading-relaxed">{longText}</p>
        </div>
      )}
    </div>
  );
};

const BadgePill: React.FC<{ badge: Badge }> = ({ badge }) => {
  const Icon = badge.icon ? BADGE_ICON[badge.icon] : null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE_TONE_CLASS[badge.tone]}`}
      title={badge.tooltip ?? badge.label}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {badge.label}
    </span>
  );
};

/* ----------------------------------------------------------------------------
 * Big-picture synthesis box
 * --------------------------------------------------------------------------*/

const BigPictureBox: React.FC<{
  activeTab: LensId;
  profileSet: CompetitorProfileSet;
  narration?: PreVettingNarration;
}> = ({ activeTab, profileSet, narration }) => {
  const aiText =
    activeTab === 'launch'
      ? narration?.bigPicture.launchPicture
      : activeTab === 'price-supply'
      ? narration?.bigPicture.pricePicture
      : narration?.bigPicture.rankPicture;

  const fallbackText =
    activeTab === 'launch'
      ? buildLaunchBigPictureFallback(profileSet)
      : activeTab === 'price-supply'
      ? buildPriceBigPictureFallback(profileSet)
      : buildRankBigPictureFallback(profileSet);

  const text = aiText || fallbackText;
  if (!text) return null;

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-sky-300/80 mb-1">
        Big picture
      </div>
      <p className="text-sm text-slate-200 leading-relaxed">{text}</p>
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Fallback narratives (used when AI narration is missing)
 * --------------------------------------------------------------------------*/

const buildFallbackHeadline = (competitor: CompetitorProfile, lens: LensId): string => {
  if (lens === 'launch') {
    if (competitor.launch.isWithinAnalysisWindow && competitor.launch.daysOnMarket !== null) {
      return `Launched ${formatDays(competitor.launch.daysOnMarket)} ago${
        competitor.launch.launchedOnSale ? ' — came in advertising a launch sale.' : '.'
      }`;
    }
    return `Established seller, on the market for ${formatDays(competitor.launch.daysOnMarket)}.`;
  }
  if (lens === 'price-supply') {
    const stockoutTxt =
      competitor.priceSupply.stockoutCount > 0
        ? `${competitor.priceSupply.stockoutCount} stockout${competitor.priceSupply.stockoutCount > 1 ? 's' : ''}`
        : 'No stockouts';
    return `Buy Box ${formatCurrency(competitor.priceSupply.currentBuyBox)}; ${stockoutTxt} in the window.`;
  }
  // rank
  const yearAvg = competitor.rank.bsrAvg365d;
  const current = competitor.rank.bsrCurrent;
  const cmp = competitor.rank.currentVsYearAverage;
  const cmpStr =
    cmp === 'much-better-than-average'
      ? 'doing much better than usual'
      : cmp === 'better-than-average'
      ? 'doing better than usual'
      : cmp === 'about-average'
      ? 'about average for them'
      : cmp === 'worse-than-average'
      ? 'worse than usual'
      : cmp === 'much-worse-than-average'
      ? 'much worse than usual'
      : 'unknown';
  return `Year-average BSR ${formatBsr(yearAvg)}, current ${formatBsr(current)} (${cmpStr}).`;
};

const expandedNarrative = (
  lens: LensId,
  competitor: CompetitorProfile,
  narrative?: PreVettingCompetitorNarrative
): string => {
  if (narrative) {
    if (lens === 'launch' && narrative.launchNarrative) return narrative.launchNarrative;
    if (lens === 'price-supply' && narrative.priceSupplyNarrative) return narrative.priceSupplyNarrative;
    if (lens === 'rank' && narrative.rankNarrative) return narrative.rankNarrative;
  }
  return buildFactsOnlyNarrative(lens, competitor);
};

const buildFactsOnlyNarrative = (lens: LensId, c: CompetitorProfile): string => {
  if (lens === 'launch') {
    const parts: string[] = [];
    if (c.launch.daysOnMarket !== null)
      parts.push(`On the market for ${formatDays(c.launch.daysOnMarket)}.`);
    if (c.launch.launchedOnSale && c.launch.launchListPrice && c.launch.launchBuyBoxPrice)
      parts.push(
        `Launched at ${formatCurrency(c.launch.launchBuyBoxPrice)} with a ${formatCurrency(
          c.launch.launchListPrice
        )} list price (advertised launch sale).`
      );
    if (c.launch.daysToTraction !== null)
      parts.push(`Took roughly ${formatDays(c.launch.daysToTraction)} to gain traction.`);
    return parts.length ? parts.join(' ') : 'Limited launch data available.';
  }
  if (lens === 'price-supply') {
    const parts: string[] = [];
    if (c.priceSupply.priceFloor && c.priceSupply.priceCeiling)
      parts.push(
        `Price floor ~${formatCurrency(c.priceSupply.priceFloor)}, ceiling ~${formatCurrency(c.priceSupply.priceCeiling)}.`
      );
    if (c.priceSupply.priceActivityLevel === 'active')
      parts.push('Active seller — adjusts price often, expect frequent undercutting.');
    if (c.priceSupply.priceActivityLevel === 'lazy')
      parts.push("Lazy seller — hasn't moved price often. Slower to react to your moves.");
    if (c.priceSupply.stockoutCount === 0)
      parts.push('Solid supply discipline — no stockouts in the window.');
    else
      parts.push(
        `${c.priceSupply.stockoutCount} stockout${c.priceSupply.stockoutCount > 1 ? 's' : ''} totaling ~${c.priceSupply.totalStockoutDays} days.`
      );
    return parts.join(' ');
  }
  // rank
  const parts: string[] = [];
  if (c.rank.bsrAvg365d !== null) parts.push(`Year-average BSR ${formatBsr(c.rank.bsrAvg365d)}.`);
  if (c.rank.bsrFloor !== null && c.rank.bsrCeiling !== null)
    parts.push(`Best ${formatBsr(c.rank.bsrFloor)}, worst ${formatBsr(c.rank.bsrCeiling)}.`);
  if (c.rank.currentVsYearAverage !== 'unknown')
    parts.push(`Current rank is ${c.rank.currentVsYearAverage.replace(/-/g, ' ')}.`);
  return parts.length ? parts.join(' ') : 'Limited rank data available.';
};

const lensStats = (
  lens: LensId,
  c: CompetitorProfile
): Array<{ label: string; value: string; tone?: BadgeTone }> => {
  if (lens === 'launch') {
    const tractionDays = c.launch.daysToTraction;
    let tractionTone: BadgeTone = 'slate';
    if (tractionDays !== null) {
      if (tractionDays <= 60) tractionTone = 'emerald';
      else if (tractionDays >= 180) tractionTone = 'amber';
    }
    return [
      { label: 'Launched', value: formatLaunchDate(c.launch.launchDate) },
      { label: 'Time to traction', value: formatDays(c.launch.daysToTraction), tone: tractionTone }
    ];
  }
  if (lens === 'price-supply') {
    return [
      { label: 'Buy Box', value: formatCurrency(c.priceSupply.currentBuyBox) },
      {
        label: 'Stockouts',
        value: String(c.priceSupply.stockoutCount),
        tone: toneForStockoutCount(c.priceSupply.stockoutCount)
      }
    ];
  }
  return [
    {
      label: 'Year avg',
      value: formatBsr(c.rank.bsrAvg365d),
      tone: toneForBsr(c.rank.bsrAvg365d)
    },
    {
      label: 'Current',
      value: formatBsr(c.rank.bsrCurrent),
      tone: toneForBsr(c.rank.bsrCurrent)
    }
  ];
};

/**
 * Per-lens sparkline data + tone. Returns null when the source series is
 * empty so the row collapses cleanly.
 */
const sparkForLens = (
  lens: LensId,
  c: CompetitorProfile,
  series?: NormalizedKeepaCompetitor
): { points: KeepaPoint[]; tone: BadgeTone; invert?: boolean } | null => {
  if (!series) return null;
  if (lens === 'launch') {
    // Show the BSR ramp from launch through ~90 days post-launch when we have
    // a launch date, otherwise full BSR. Inverted so up = better rank.
    const launchTs = c.launch.launchDate;
    const cutoffTs = launchTs ? launchTs + 120 * 24 * 60 * 60 * 1000 : null;
    const points = launchTs && cutoffTs
      ? series.series.bsr.filter(p => p.timestamp >= launchTs && p.timestamp <= cutoffTs)
      : series.series.bsr;
    if (!points.length) return null;
    return { points, tone: 'sky', invert: true };
  }
  if (lens === 'price-supply') {
    return {
      points: series.series.buyBoxShipping.length >= 5 ? series.series.buyBoxShipping : series.series.price,
      tone: 'amber'
    };
  }
  // rank — full BSR, inverted so up = better rank
  return {
    points: series.series.bsr,
    tone: toneForBsr(c.rank.bsrAvg365d),
    invert: true
  };
};

const buildLaunchBigPictureFallback = (set: CompetitorProfileSet): string => {
  const bp = set.bigPicture.launch;
  if (bp.countOver12mo >= 2) {
    return `${bp.countOver12mo} of the top ${set.competitors.length} launched within the past 12 months — this market is open to newcomers.`;
  }
  if (bp.countOver12mo === 1) {
    return `Only 1 of the top ${set.competitors.length} launched in the past 12 months — newcomers can break in but it's harder.`;
  }
  return `No top-${set.competitors.length} competitor has launched in the past 12 months — the leaders here are well-established.`;
};

const buildPriceBigPictureFallback = (set: CompetitorProfileSet): string => {
  const bp = set.bigPicture.priceSupply;
  const stockoutsText =
    bp.totalStockoutEvents === 0
      ? 'No stockouts across the top competitors — supply has been steady.'
      : `${bp.totalStockoutEvents} stockout event${bp.totalStockoutEvents > 1 ? 's' : ''} totaling ~${bp.totalStockoutDays} days across all competitors.`;
  const activityText =
    bp.activeSellerCount > 0
      ? `${bp.activeSellerCount} of ${set.competitors.length} competitors actively manage price; expect frequent undercutting.`
      : `Pricing has been quiet — competitors aren't adjusting often.`;
  return `${activityText} ${stockoutsText}`;
};

const buildRankBigPictureFallback = (set: CompetitorProfileSet): string => {
  const bp = set.bigPicture.rank;
  if (bp.avgYearlyBsr === null) return 'Limited rank data across competitors.';
  return `The top competitors average ${formatBsr(
    bp.avgYearlyBsr
  )} BSR over the year — the strongest sustained rank seen was ${formatBsr(
    bp.bestYearlyBsr
  )}, the worst ${formatBsr(bp.worstYearlyBsr)}. Demand is ${bp.bsrConsistency.replace(/-/g, ' ')}.`;
};

export default PreVettingTabs;
