import React, { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { formatNumber } from '@/utils/formatters';
import { safeParseNumber } from '@/utils/scoring';

type MomentumQuadrantsProps = {
  competitors: any[];
  removedAsins?: Set<string> | string[];
};

type RatingTier = 'A' | 'B' | 'C' | 'D' | 'NA';

type QuadrantKey = 'breakouts' | 'newQuiet' | 'proven' | 'stagnant';

type CompetitorWithDerived = {
  asin: string;
  label: string;
  ageMonths: number;
  reviews: number;
  reviewsPerMonth: number;
  rating: number | null;
  ratingTier: RatingTier;
  ratingLabel: string;
};

const AGE_SPLIT_MONTHS = 18;
const MOMENTUM_SPLIT_RPM = 6;

const ratingTierStyles: Record<RatingTier, { label: string; pillClass: string }> = {
  A: {
    label: '4.5+',
    pillClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
  },
  B: {
    label: '4.0–4.4',
    pillClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40'
  },
  C: {
    label: '<4.0',
    pillClass: 'bg-red-500/20 text-red-300 border-red-500/40'
  },
  D: {
    label: '<4.0',
    pillClass: 'bg-red-500/20 text-red-300 border-red-500/40'
  },
  NA: {
    label: 'N/A',
    pillClass: 'bg-slate-500/20 text-slate-300 border-slate-500/40'
  }
};

const MS_PER_DAY = 86400000;
const DAYS_PER_MONTH = 30.4375;

const calcAgeMonths = (value?: string | null): number | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffDays = (Date.now() - date.getTime()) / MS_PER_DAY;
  if (diffDays < 0) return null;
  return Math.floor(diffDays / DAYS_PER_MONTH);
};

const formatAge = (months: number): string => {
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years <= 0) return `${remainingMonths} mo`;
  return remainingMonths === 0 ? `${years}y` : `${years}y ${remainingMonths}mo`;
};

const getRatingTier = (rating: number | null): RatingTier => {
  if (!Number.isFinite(rating as number)) return 'NA';
  const value = rating as number;
  if (value >= 4.5) return 'A';
  if (value >= 4.0) return 'B';
  return 'C';
};

const openAmazonListing = (asin?: string) => {
  if (!asin) return;
  window.open(`https://www.amazon.com/dp/${asin}`, '_blank', 'noopener,noreferrer');
};

const getAgeBand = (ageMonths: number): 'new' | 'mid' | 'old' => {
  if (ageMonths < 12) return 'new';
  if (ageMonths < 24) return 'mid';
  return 'old';
};

const getAgePill = (ageMonths: number): { label: string; className: string } => {
  const ageBand = getAgeBand(ageMonths);
  if (ageBand === 'new') {
    return { label: 'New', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' };
  }
  if (ageBand === 'mid') {
    return { label: '1–2y', className: 'bg-blue-500/10 text-blue-300 border-blue-500/30' };
  }
  return { label: '2y+', className: 'bg-slate-500/20 text-slate-300 border-slate-500/40' };
};

const formatReviewsPerMonth = (value: number): string => {
  if (!Number.isFinite(value)) return '0.0/mo';
  return `${value.toFixed(1)}/mo`;
};

const getAgeLabel = (months: number): string => {
  if (months >= 24) return '2y+';
  return formatAge(months);
};

const MomentumQuadrants: React.FC<MomentumQuadrantsProps> = ({ competitors, removedAsins }) => {
  const [ratingFilter, setRatingFilter] = useState<'all' | '4.5+' | '4.0-4.4' | '<4.0'>('all');

  const removedSet = useMemo(() => {
    if (!removedAsins) return new Set<string>();
    if (removedAsins instanceof Set) return new Set(Array.from(removedAsins));
    return new Set(removedAsins);
  }, [removedAsins]);

  const filteredCompetitors = useMemo<CompetitorWithDerived[]>(() => {
    return (competitors || [])
      .filter((competitor) => !removedSet.has(competitor?.asin))
      .map((competitor) => {
        const ageMonths = calcAgeMonths(competitor?.dateFirstAvailable);
        if (ageMonths === null) return null;
        if (ageMonths < 0) return null;
        const reviews = safeParseNumber(competitor?.reviews);
        if (!Number.isFinite(reviews)) return null;
        const ratingValue = competitor?.rating !== undefined ? safeParseNumber(competitor?.rating) : null;
        const rating = Number.isFinite(ratingValue as number) ? (ratingValue as number) : null;
        if (ratingFilter === '4.5+' && (rating === null || rating < 4.5)) return null;
        if (ratingFilter === '4.0-4.4' && (rating === null || rating < 4.0 || rating >= 4.5)) return null;
        if (ratingFilter === '<4.0' && (rating === null || rating >= 4.0)) return null;
        const reviewsPerMonth = reviews / Math.max(ageMonths, 1);
        return {
          asin: competitor?.asin || '',
          label: competitor?.brand || competitor?.title || 'Unknown',
          ageMonths,
          reviews,
          reviewsPerMonth,
          rating,
          ratingTier: getRatingTier(rating),
          ratingLabel: rating !== null ? rating.toFixed(2) : '—'
        };
      })
      .filter((item): item is CompetitorWithDerived => Boolean(item));
  }, [competitors, ratingFilter, removedSet]);

  const highVelocityThreshold = useMemo(() => {
    const values = filteredCompetitors
      .map((item) => item.reviewsPerMonth)
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    if (!values.length) return 100;
    const index = Math.floor(0.95 * (values.length - 1));
    const p95 = values[index];
    return Math.max(p95, 100);
  }, [filteredCompetitors]);

  const quadrants = useMemo(() => {
    const grouped: Record<QuadrantKey, CompetitorWithDerived[]> = {
      breakouts: [],
      newQuiet: [],
      proven: [],
      stagnant: []
    };

    filteredCompetitors.forEach((competitor) => {
      const isNew = competitor.ageMonths <= AGE_SPLIT_MONTHS;
      const isFast = competitor.reviewsPerMonth >= MOMENTUM_SPLIT_RPM;
      if (isNew && isFast) grouped.breakouts.push(competitor);
      else if (isNew) grouped.newQuiet.push(competitor);
      else if (isFast) grouped.proven.push(competitor);
      else grouped.stagnant.push(competitor);
    });

    Object.values(grouped).forEach((items) => {
      items.sort((a, b) => {
        if (b.reviewsPerMonth !== a.reviewsPerMonth) return b.reviewsPerMonth - a.reviewsPerMonth;
        if (b.reviews !== a.reviews) return b.reviews - a.reviews;
        return (b.rating ?? -1) - (a.rating ?? -1);
      });
    });

    return grouped;
  }, [filteredCompetitors]);

  const quadrantMeta = [
    {
      key: 'breakouts' as QuadrantKey,
      title: 'Rising Fast (New)',
      description: 'Newer listings gaining reviews quickly.',
      rule: 'Up to ~18 months old • 6+ reviews/month'
    },
    {
      key: 'newQuiet' as QuadrantKey,
      title: 'New, Low Traction',
      description: "Newer listings that aren’t picking up reviews yet.",
      rule: 'Up to ~18 months old • under 6 reviews/month'
    },
    {
      key: 'proven' as QuadrantKey,
      title: 'Established Winners',
      description: 'Older listings still gaining reviews steadily.',
      rule: 'Over ~18 months old • 6+ reviews/month'
    },
    {
      key: 'stagnant' as QuadrantKey,
      title: 'Established, Slow Growth',
      description: 'Older listings with slow review growth.',
      rule: 'Over ~18 months old • under 6 reviews/month'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <div>
          <h3 className="text-lg font-medium text-white">Momentum Quadrants</h3>
          <p className="text-xs text-slate-400 mt-1">
            See who’s gaining reviews fast vs slow, split by newer vs established listings.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            New is up to ~18 months. Fast is 6+ reviews/month. (Reviews/month = total reviews / listing age.)
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Rating</span>
            <div className="bg-slate-800/50 rounded-lg p-1 flex">
              {[
                { key: 'all', label: 'All' },
                { key: '4.5+', label: '4.5+' },
                { key: '4.0-4.4', label: '4.0–4.4' },
                { key: '<4.0', label: '<4.0' }
              ].map((option) => {
                const isActive = ratingFilter === option.key;
                const ratingClasses: Record<string, string> = {
                  all: 'bg-blue-500/20 text-blue-200 border-blue-500/60',
                  '4.5+': 'bg-emerald-500/20 text-emerald-200 border-emerald-500/60',
                  '4.0-4.4': 'bg-amber-500/20 text-amber-200 border-amber-500/60',
                  '<4.0': 'bg-red-500/20 text-red-200 border-red-500/60'
                };
                return (
                  <button
                    key={`rating-${option.key}`}
                    type="button"
                    onClick={() => setRatingFilter(option.key as 'all' | '4.5+' | '4.0-4.4' | '<4.0')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                      isActive
                        ? (ratingClasses[option.key] || 'bg-slate-700/60 text-slate-100 border-slate-500/60')
                        : 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:bg-slate-700/40'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {quadrantMeta.map((quadrant) => {
          const items = quadrants[quadrant.key];
          const count = items.length;
          return (
            <div
              key={quadrant.key}
              className="bg-slate-900/40 border border-slate-700/40 rounded-xl p-4 flex flex-col min-h-[320px]"
            >
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-semibold text-white">{quadrant.title}</h4>
                <span className="text-xs text-slate-300 bg-slate-800/60 border border-slate-700/60 rounded-full px-2 py-0.5">
                  {count} {count === 1 ? 'listing' : 'listings'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mb-1">{quadrant.rule}</div>
              <p className="text-xs text-slate-400 mb-3">{quadrant.description}</p>
              {items.length === 0 ? (
                <div className="text-sm text-slate-400 flex-1">No listings match this bucket.</div>
              ) : (
                <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                  {items.slice(0, 6).map((item) => {
                    const tier = ratingTierStyles[item.ratingTier];
                    const agePill = getAgePill(item.ageMonths);
                    const velocityLabel = formatReviewsPerMonth(item.reviewsPerMonth);
                    const isHighVelocity =
                      item.reviewsPerMonth >= highVelocityThreshold ||
                      (item.ageMonths < 3 && item.reviews > 200);
                    return (
                      <div
                        key={`${quadrant.key}-${item.asin}`}
                        className="w-full text-left flex items-center justify-between gap-2 rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-sm text-slate-100 font-semibold truncate">{item.label}</div>
                            <span className={`text-[10px] border rounded-full px-1.5 py-0.5 ${agePill.className}`}>
                              {agePill.label}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {getAgeLabel(item.ageMonths)} · {formatNumber(item.reviews)} reviews · {velocityLabel}
                            {isHighVelocity && (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300/80">
                                High velocity
                              </span>
                            )}
                          </div>
                          {isHighVelocity && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              High review velocity can be caused by merged reviews or listing variations — verify on Amazon.
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium border rounded-full px-2 py-0.5 ${tier.pillClass}`}>
                            {item.ratingLabel}
                          </span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openAmazonListing(item.asin);
                            }}
                            className="text-slate-400 hover:text-slate-200"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MomentumQuadrants;
