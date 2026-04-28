'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';
import { formatCurrency } from '../../utils/formatters';
import { getStabilityCategory, calculateScore, getCompetitorStrength } from '../../utils/scoring';
import KeepaSignalsHub from '../Keepa/KeepaSignalsHub';

interface CompetitorData {
  asin: string;
  title: string;
  price: number;
  brand: string;
  monthlySales: number;
  monthlyRevenue: number;
  reviews?: number;
  marketShare?: number;
  dateFirstAvailable?: string;
  listingAgeMonths?: number;
  keepaAnalysis?: {
    analysis?: {
      bsr?: {
        trend: 'improving' | 'declining' | 'stable';
        stability: number;
        score: number;
        details?: {
          baseScore: number;
          meanBSR: number;
          stabilityBonus: number;
          trendBonus: number;
        };
      };
    };
  };
}

interface MarketVisualsProps {
  productId?: string;
  competitors: CompetitorData[];
  rawData: any[]; // Consider creating a specific type for this
  showGraph?: boolean;
  showHistorical?: boolean;
  removalCandidateAsins?: string[];
  removedAsins?: Set<string> | string[];
  imageUrlByAsin?: Map<string, string | null>;
}

const getPerformanceColor = (score: number): string => {
  if (!score || isNaN(score)) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-blue-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
};


const extractAsin = (hyperlink: string): string => {
  if (/^[A-Z0-9]{10}$/.test(hyperlink)) {
    return hyperlink;
  }
  
  if (hyperlink.includes('HYPERLINK')) {
    const match = hyperlink.match(/HYPERLINK\s*\(\s*"[^"]*"\s*,\s*"([A-Z0-9]{10})"\s*\)/i);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  const dpMatch = hyperlink.match(/\/dp\/([A-Z0-9]{10})/i);
  if (dpMatch && dpMatch[1]) {
    return dpMatch[1];
  }
  
  const asinMatch = hyperlink.match(/\b([A-Z0-9]{10})\b/);
  if (asinMatch && asinMatch[1]) {
    return asinMatch[1];
  }
  
  console.warn('Could not extract ASIN from:', hyperlink);
  return '';
};

const useIsDarkTheme = () => {
  const [isDarkTheme, setIsDarkTheme] = useState(true);

  useEffect(() => {
    const checkTheme = () => {
      setIsDarkTheme(document.documentElement.classList.contains('dark'));
    };
    
    checkTheme();
    
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);

  return isDarkTheme;
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const useMergedCompetitorData = (competitors: CompetitorData[], rawData: any[]) => {
  return useMemo(() => {
    if (!competitors?.length) return [];

    if (process.env.NODE_ENV !== 'production') {
      console.log('MarketVisuals - Raw data check:', {
        competitorsCount: competitors?.length || 0,
        rawDataExists: !!rawData,
        rawDataCount: rawData?.length || 0
      });
    }

    if (!rawData || rawData.length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('No Keepa data available for any competitors');
      }
      return competitors.map(competitor => {
        const extractedAsin = extractAsin(competitor.asin);
        return {
          ...competitor,
          brand: competitor.brand || 
                (competitor as any)?.Brand || 
                (competitor as any)?.['Brand Name'] || 
                (competitor as any)?.['Manufacturer'] || 
                (competitor as any)?.manufacturer || 
                'Unknown',
          asin: extractedAsin,
          keepaAnalysis: null,
          bsrStability: 0.5,
          priceStability: 0.5,
          threeMonthScore: 50,
          analysisDetails: {
            trend: { direction: 'stable', strength: 0, confidence: 0 },
            competitiveScore: 5,
            meanBSR: null,
            priceHistory: [],
            bsrHistory: [],
            bsrTrend: 'stable',
            bsrStrength: 0,
            priceTrend: 'stable',
            priceStrength: 0
          }
        };
      });
    }

    const result = competitors.map(competitor => {
      const extractedAsin = extractAsin(competitor.asin);
      
      if (extractedAsin) {
        console.log(`ASIN extracted: "${extractedAsin}" from original: "${competitor.asin}"`);
      } else {
        console.warn(`Failed to extract ASIN from: "${competitor.asin}"`);
      }
      
      const keepaAnalysis = rawData?.find(k => k.asin === extractedAsin);
      if (!keepaAnalysis && extractedAsin) {
        console.warn(`No matching Keepa data found for ASIN: ${extractedAsin}`);
        
        if (rawData?.length > 0) {
          console.log('Available Keepa ASINs:', rawData.map(k => k.asin).join(', '));
        }
      }
      
      const bsrAnalysis = keepaAnalysis?.analysis?.bsr || {
        stability: 0.5,
        trend: {
          direction: 'stable',
          strength: 0,
          confidence: 0
        }
      };

      const priceAnalysis = keepaAnalysis?.analysis?.price || {
        stability: 0.5,
        trend: {
          direction: 'stable',
          strength: 0
        }
      };

      const competitiveScore = keepaAnalysis?.analysis?.competitivePosition?.score || 5;

      return {
        ...competitor,
        brand: competitor.brand || 
               (competitor as any)?.Brand || 
               (competitor as any)?.['Brand Name'] || 
               (competitor as any)?.['Manufacturer'] || 
               (competitor as any)?.manufacturer || 
               'Unknown',
        asin: extractedAsin,
        keepaAnalysis,
        bsrStability: bsrAnalysis.stability,
        priceStability: priceAnalysis.stability,
        threeMonthScore: bsrAnalysis.stability * 100,
        analysisDetails: {
          trend: bsrAnalysis.trend,
          competitiveScore,
          meanBSR: keepaAnalysis?.productData?.bsr?.length > 0 
            ? Math.round(
                keepaAnalysis.productData.bsr.reduce((sum, point) => sum + point.value, 0) / 
                keepaAnalysis.productData.bsr.length
              )
            : null,
          priceHistory: keepaAnalysis?.productData?.prices || [],
          bsrHistory: keepaAnalysis?.productData?.bsr || [],
          bsrTrend: bsrAnalysis.trend.direction,
          bsrStrength: bsrAnalysis.trend.strength,
          priceTrend: priceAnalysis.trend.direction,
          priceStrength: priceAnalysis.trend.strength
        }
      };
    });
    
    return result;
  }, [competitors, rawData]);
};

type MetricKey =
  | 'price'
  | 'revenue'
  | 'sales'
  | 'reviews'
  | 'rating'
  | 'marketShare'
  | 'reviewShare'
  | 'listingAge';

type PrimaryMetricKey = MetricKey;
type SecondaryMetricKey = MetricKey;

const ALL_METRICS: MetricKey[] = [
  'price',
  'revenue',
  'sales',
  'reviews',
  'rating',
  'marketShare',
  'reviewShare',
  'listingAge'
];

export const CompetitorGraphTab: React.FC<MarketVisualsProps> = ({
  competitors,
  rawData = [],
  removalCandidateAsins = [],
  removedAsins,
  imageUrlByAsin
}) => {
  const isDarkTheme = useIsDarkTheme();
  const mergedCompetitorData = useMergedCompetitorData(competitors, rawData);
  const [competitorView, setCompetitorView] = useState<'all' | 'top5' | 'bottom5'>('all');
  const [aggregateByBrand, setAggregateByBrand] = useState(false);
  const [pinnedAsin, setPinnedAsin] = useState<string | null>(null);
  const [primaryMetric, setPrimaryMetric] = useState<MetricKey>('price');
  const [secondaryMetric, setSecondaryMetric] = useState<MetricKey | null>('revenue');

  const metricAvailability = useMemo(() => {
    const hasReviews = mergedCompetitorData.some(comp => parseNumber(comp.reviews) !== null);
    const hasRating = mergedCompetitorData.some(comp => parseNumber((comp as any)?.rating) !== null);
    return {
      reviews: hasReviews,
      rating: hasRating
    };
  }, [mergedCompetitorData]);

  const normalizeAsinValue = (asin?: string) => (asin ? extractAsin(asin).toUpperCase() : '');
  const userRemovedSet = useMemo(() => {
    if (!removedAsins) return new Set<string>();
    const values = Array.isArray(removedAsins) ? removedAsins : Array.from(removedAsins);
    return new Set(values.map((asin) => normalizeAsinValue(asin)).filter(Boolean));
  }, [removedAsins]);

  const formatCompactNumber = (value: number) => {
    const absValue = Math.abs(value);
    const fractionDigits = absValue >= 1000 ? 1 : 0;
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: fractionDigits
    }).format(value);
  };

  const formatCompactCurrency = (value: number) => `$${formatCompactNumber(value)}`;

  const now = useMemo(() => new Date(), []);
  const getListingAgeMonths = useCallback((competitor: CompetitorData) => {
    if (typeof competitor.listingAgeMonths === 'number' && Number.isFinite(competitor.listingAgeMonths)) {
      return Math.max(0, Math.floor(competitor.listingAgeMonths));
    }
    if (!competitor.dateFirstAvailable) return null;
    const parsed = new Date(competitor.dateFirstAvailable);
    if (Number.isNaN(parsed.getTime())) return null;
    const months =
      (now.getFullYear() - parsed.getFullYear()) * 12 +
      (now.getMonth() - parsed.getMonth());
    return Math.max(0, months);
  }, [now]);

  const metricMeta = useMemo(() => ({
    price: {
      label: 'Price',
      axisLabel: 'Price ($)',
      format: (value: number) => formatCompactCurrency(value)
    },
    revenue: {
      label: 'Revenue',
      axisLabel: 'Monthly Revenue ($)',
      format: (value: number) => formatCompactCurrency(value)
    },
    sales: {
      label: 'Sales (Units)',
      axisLabel: 'Monthly Sales (Units)',
      format: (value: number) => formatCompactNumber(value)
    },
    reviews: {
      label: 'Reviews',
      axisLabel: 'Reviews',
      format: (value: number) => formatCompactNumber(value)
    },
    rating: {
      label: 'Rating',
      axisLabel: 'Rating',
      format: (value: number) => value.toFixed(1)
    },
    marketShare: {
      label: 'Market Share %',
      axisLabel: 'Market Share (%)',
      format: (value: number) => `${Math.round(value * 100)}%`,
      isShare: true as const
    },
    reviewShare: {
      label: 'Review Share %',
      axisLabel: 'Review Share (%)',
      format: (value: number) => `${Math.round(value * 100)}%`,
      isShare: true as const
    },
    listingAge: {
      label: 'Listing Age (months)',
      axisLabel: 'Listing Age (months)',
      format: (value: number) => `${Math.round(value)} mo`,
      axisFormat: (value: number) => `${Math.round(value)}`
    }
  }), []);

  // Role-based palette: bars + line are always the same two complementary
  // colors regardless of which metric is picked. Avoids the "purple bars
  // on a purple line" problem when both pickers land on related metrics,
  // and keeps the chart legible on the dark theme at any bar height.
  const BAR_COLOR = '#14b8a6';   // teal
  const LINE_COLOR = '#fb7185';  // coral
  const NULL_COLOR = '#475569';  // slate (only used when Line = None swatch)

  const getRawMetricValue = (competitor: any, key: MetricKey): number | null => {
    switch (key) {
      case 'price':
        return parseNumber(competitor.price);
      case 'revenue':
        return parseNumber(competitor.monthlyRevenue);
      case 'sales':
        return parseNumber(competitor.monthlySales);
      case 'reviews':
        return parseNumber(competitor.reviews);
      case 'rating':
        return parseNumber(competitor.rating) ?? null;
      case 'marketShare':
        return parseNumber(competitor.monthlyRevenue);
      case 'reviewShare':
        return parseNumber(competitor.reviews);
      case 'listingAge':
        return getListingAgeMonths(competitor);
      default:
        return null;
    }
  };

  // If the user picks a metric that has no data in this market (e.g.
  // 'reviews' when reviews aren't pulled), reset to a safe default so
  // the chart doesn't render empty.
  useEffect(() => {
    if (primaryMetric === 'reviews' && !metricAvailability.reviews) {
      setPrimaryMetric('price');
    } else if (primaryMetric === 'rating' && !metricAvailability.rating) {
      setPrimaryMetric('price');
    }
    if ((secondaryMetric === 'reviews' || secondaryMetric === 'reviewShare') && !metricAvailability.reviews) {
      setSecondaryMetric('revenue');
    } else if (secondaryMetric === 'rating' && !metricAvailability.rating) {
      setSecondaryMetric('revenue');
    }
  }, [metricAvailability, primaryMetric, secondaryMetric]);

  const isMissingMetric = (value: number | null, metricKey: MetricKey) => {
    if (value === null || !Number.isFinite(value)) return true;
    if (metricKey === 'rating') return value <= 0 || value > 5;
    if (metricKey === 'listingAge') return value < 0;
    if (metricKey === 'marketShare' || metricKey === 'reviewShare') return value <= 0;
    return value <= 0;
  };

  const compareByPrimary = useCallback((a: CompetitorData, b: CompetitorData) => {
    const aPrimary = getRawMetricValue(a, primaryMetric) ?? 0;
    const bPrimary = getRawMetricValue(b, primaryMetric) ?? 0;
    if (bPrimary !== aPrimary) return bPrimary - aPrimary;
    const aReviews = parseNumber(a.reviews) ?? 0;
    const bReviews = parseNumber(b.reviews) ?? 0;
    if (bReviews !== aReviews) return bReviews - aReviews;
    const aName = (a.brand || a.title || '').toString();
    const bName = (b.brand || b.title || '').toString();
    return aName.localeCompare(bName);
  }, [primaryMetric]);

  const validCompetitors = useMemo(() => {
    return mergedCompetitorData.filter((competitor) => {
      if (userRemovedSet.has(normalizeAsinValue(competitor.asin))) return false;
      const primaryValue = getRawMetricValue(competitor, primaryMetric);
      if (isMissingMetric(primaryValue, primaryMetric)) return false;
      if (!secondaryMetric) return true;
      const secondaryValue = getRawMetricValue(competitor, secondaryMetric);
      if (secondaryMetric === 'rating') {
        return secondaryValue !== null && Number.isFinite(secondaryValue) && secondaryValue > 0 && secondaryValue <= 5;
      }
      if (secondaryMetric === 'reviews' || secondaryMetric === 'reviewShare') {
        return secondaryValue !== null && Number.isFinite(secondaryValue) && secondaryValue > 0;
      }
      if (secondaryMetric === 'marketShare' || secondaryMetric === 'revenue') {
        return secondaryValue !== null && Number.isFinite(secondaryValue) && secondaryValue > 0;
      }
      return true;
    });
  }, [mergedCompetitorData, primaryMetric, secondaryMetric, userRemovedSet]);

  const primarySortedDesc = useMemo(() => {
    return [...validCompetitors].sort(compareByPrimary);
  }, [validCompetitors, primaryMetric]);

  const primarySortedAsc = useMemo(() => {
    return [...primarySortedDesc].reverse();
  }, [primarySortedDesc]);

  const filteredCompetitors = useMemo(() => {
    const baseList = primarySortedDesc.filter(
      (competitor) => !userRemovedSet.has(normalizeAsinValue(competitor.asin))
    );
    if (competitorView === 'top5') {
      return baseList.slice(0, 5);
    }
    if (competitorView === 'bottom5') {
      const lowest = baseList.slice(-5);
      return [...lowest].sort(compareByPrimary);
    }
    return baseList.length > 50 ? baseList.slice(0, 50) : baseList;
  }, [competitorView, primarySortedDesc, compareByPrimary, userRemovedSet]);

  // When aggregateByBrand is on, collapse multiple listings from the
  // same brand into a single synthetic competitor. Sums for revenue /
  // sales / reviews; weighted average for price + rating; min for
  // listingAge (the brand's oldest listing reflects market presence).
  // Click-to-Amazon is suppressed for aggregated rows since the ASIN
  // is synthetic.
  const chartCompetitors = useMemo(() => {
    if (!aggregateByBrand) return filteredCompetitors;
    const groups = new Map<string, any[]>();
    for (const c of filteredCompetitors) {
      const brand = (c.brand || c.title || 'Unknown').toString().trim() || 'Unknown';
      if (!groups.has(brand)) groups.set(brand, []);
      groups.get(brand)!.push(c);
    }
    const aggregated = Array.from(groups.entries()).map(([brand, listings]) => {
      const sum = (key: string) =>
        listings.reduce((acc, c) => acc + (parseNumber((c as any)[key]) ?? 0), 0);
      const totalRev = sum('monthlyRevenue');
      const totalReviews = sum('reviews');
      const weightedAvg = (key: string, weightKey: string) => {
        let totalW = 0;
        let totalWX = 0;
        for (const c of listings) {
          const w = parseNumber((c as any)[weightKey]) ?? 0;
          const x = parseNumber((c as any)[key]);
          if (x === null) continue;
          if (w > 0) {
            totalW += w;
            totalWX += w * x;
          }
        }
        if (totalW > 0) return totalWX / totalW;
        const xs = listings.map((c) => parseNumber((c as any)[key])).filter((x): x is number => x !== null);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
      };
      const ages = listings
        .map((c) => getListingAgeMonths(c))
        .filter((v): v is number => v !== null);
      return {
        ...listings[0],
        asin: `BRAND_AGG_${brand}`,
        brand,
        title: `${brand} (${listings.length} listings)`,
        price: weightedAvg('price', 'monthlyRevenue'),
        monthlyRevenue: totalRev,
        monthlySales: sum('monthlySales'),
        reviews: totalReviews,
        rating: weightedAvg('rating', 'reviews'),
        dateFirstAvailable: undefined,
        listingAgeMonths: ages.length ? Math.min(...ages) : undefined,
        __isAggregated: true,
        __listingCount: listings.length
      };
    });
    return aggregated.sort(compareByPrimary);
  }, [aggregateByBrand, filteredCompetitors, compareByPrimary, getListingAgeMonths]);

  const shareTotals = useMemo(() => {
    const totalRevenue = chartCompetitors.reduce((sum, comp) => {
      const value = parseNumber(comp.monthlyRevenue);
      return sum + (Number.isFinite(value) ? (value as number) : 0);
    }, 0);
    const totalReviews = chartCompetitors.reduce((sum, comp) => {
      const value = parseNumber(comp.reviews);
      return sum + (Number.isFinite(value) ? (value as number) : 0);
    }, 0);
    return { totalRevenue, totalReviews };
  }, [chartCompetitors]);

  const chartData = useMemo(() => {
    const labelCounts = new Map<string, number>();
    const baseLabels = chartCompetitors.map((competitor) => {
      const base =
        (competitor.brand ||
          (competitor as any)?.seller ||
          (competitor as any)?.titleShort ||
          competitor.title ||
          'Unknown')
          .toString()
          .trim() || 'Unknown';
      labelCounts.set(base, (labelCounts.get(base) || 0) + 1);
      return base;
    });
    const labelIndex = new Map<string, number>();

    return chartCompetitors.map((competitor, index) => {
      const revenueValue = parseNumber(competitor.monthlyRevenue);
      const reviewsValue = parseNumber(competitor.reviews);
      const listingAgeMonths = getListingAgeMonths(competitor);
      const marketShareValue =
        shareTotals.totalRevenue > 0 && Number.isFinite(revenueValue)
          ? (revenueValue as number) / shareTotals.totalRevenue
          : null;
      const reviewShareValue =
        shareTotals.totalReviews > 0 && Number.isFinite(reviewsValue)
          ? (reviewsValue as number) / shareTotals.totalReviews
          : null;

      const primaryRaw = getRawMetricValue(competitor, primaryMetric);
      const primaryValue =
        primaryMetric === 'marketShare'
          ? marketShareValue
          : primaryMetric === 'listingAge'
            ? listingAgeMonths
          : primaryRaw ?? 0;

      const rawSecondaryValue = !secondaryMetric
        ? null
        : getRawMetricValue(competitor, secondaryMetric);
      const secondaryValue =
        secondaryMetric === 'reviewShare'
          ? reviewShareValue
          : secondaryMetric === 'marketShare'
            ? marketShareValue
            : secondaryMetric === 'revenue'
              ? revenueValue
          : secondaryMetric === 'rating' && rawSecondaryValue !== null && rawSecondaryValue <= 0
            ? null
            : rawSecondaryValue;
      const secondaryScaled = secondaryValue === null ? null : secondaryValue;

      const baseLabel = baseLabels[index] || 'Unknown';
      const duplicateCount = labelCounts.get(baseLabel) || 0;
      const nextIndex = (labelIndex.get(baseLabel) || 0) + 1;
      labelIndex.set(baseLabel, nextIndex);
      const disambiguated = duplicateCount > 1 ? `${baseLabel} (${nextIndex})` : baseLabel;
      const trimmedLabel =
        baseLabel.length > 12 ? `${baseLabel.slice(0, 9)}...` : baseLabel;
      const asinSuffix = competitor.asin ? competitor.asin.slice(-4) : `${index + 1}`;
      const chartKey = `${disambiguated}-${asinSuffix}`;

      return {
        ...competitor,
        chartKey,
        chartLabel: trimmedLabel,
        primaryValue,
        secondaryValue,
        secondaryScaled,
        marketShareValue,
        reviewShareValue,
        listingAgeMonths
      };
    });
  }, [chartCompetitors, primaryMetric, secondaryMetric, shareTotals, getListingAgeMonths]);

  const chartLabelLookup = useMemo(() => {
    return chartData.reduce<Record<string, string>>((acc, item) => {
      acc[item.chartKey] = item.chartLabel;
      return acc;
    }, {});
  }, [chartData]);

  const secondaryValues = useMemo(() => {
    if (!secondaryMetric) return [];
    return chartData
      .map((comp) => comp.secondaryScaled)
      .filter(value => value !== null && Number.isFinite(value) && (secondaryMetric !== 'rating' || value > 0)) as number[];
  }, [chartData, secondaryMetric]);

  const primaryMedian = useMemo(() => {
    const values = chartData
      .map((c) => c.primaryValue)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (values.length < 2) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length % 2 === 1
      ? sorted[Math.floor(sorted.length / 2)]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  }, [chartData]);

  const secondaryStats = useMemo(() => {
    if (secondaryValues.length === 0) {
      return { max: 0, median: 0, outlier: false };
    }
    const sorted = [...secondaryValues].sort((a, b) => a - b);
    const median = sorted.length % 2 === 1
      ? sorted[Math.floor(sorted.length / 2)]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const max = sorted[sorted.length - 1];
    const baseline = median > 0 ? median : Math.max(1, sorted.find(value => value > 0) || 1);
    const outlier = max / baseline >= 20;
    return { max, median, outlier };
  }, [secondaryValues]);

  useEffect(() => {
    if (!pinnedAsin) return;
    if (!chartCompetitors.some(comp => comp.asin === pinnedAsin)) {
      setPinnedAsin(null);
    }
  }, [chartCompetitors, pinnedAsin]);

  const formatMetricValue = (metricKey: PrimaryMetricKey | SecondaryMetricKey, value: number | null) => {
    if (value === null || !Number.isFinite(value)) return 'N/A';
    if (metricKey === 'marketShare' || metricKey === 'reviewShare') {
      return `${Math.round(value * 100)}%`;
    }
    const meta = metricMeta[metricKey as keyof typeof metricMeta];
    return meta.format(value);
  };

  const formatAxisValue = (metricKey: PrimaryMetricKey | SecondaryMetricKey, value: number) => {
    if (!Number.isFinite(value)) return '';
    if (metricKey === 'marketShare' || metricKey === 'reviewShare') {
      return `${Math.round(value * 100)}%`;
    }
    const meta = metricMeta[metricKey as keyof typeof metricMeta] as {
      format: (val: number) => string;
      axisFormat?: (val: number) => string;
    };
    return meta.axisFormat ? meta.axisFormat(value) : meta.format(value);
  };

  const shareAxisConfig = useMemo(() => {
    if (primaryMetric === 'marketShare' && secondaryMetric === 'reviewShare') {
      const maxShare = chartData.reduce((maxValue, item) => {
        const values = [item.marketShareValue, item.reviewShareValue].filter(
          (value): value is number => Number.isFinite(value)
        );
        if (values.length === 0) return maxValue;
        return Math.max(maxValue, ...values);
      }, 0);
      const computedMax = maxShare * 100 * 1.1;
      const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
      const niceCeil = (value: number) => {
        if (value <= 60) return Math.ceil(value / 5) * 5;
        return Math.ceil(value / 10) * 10;
      };
      const yMaxPercent = clamp(niceCeil(computedMax), 25, 100);
      const tickStep =
        yMaxPercent <= 60
          ? 10
          : yMaxPercent % 25 === 0
            ? 25
            : yMaxPercent % 20 === 0
              ? 20
              : 10;
      const ticks: number[] = [];
      for (let tick = 0; tick <= yMaxPercent; tick += tickStep) {
        ticks.push(tick);
      }
      if (ticks[ticks.length - 1] !== yMaxPercent) {
        ticks.push(yMaxPercent);
      }

      return {
        domain: [0, yMaxPercent / 100] as [number, number],
        ticks: ticks.map((tick) => tick / 100)
      };
    }

    if (secondaryMetric === 'marketShare') {
      const maxShare = chartData.reduce((maxValue, item) => {
        const value = item.marketShareValue;
        return Number.isFinite(value) ? Math.max(maxValue, value as number) : maxValue;
      }, 0);
      const computedMax = maxShare * 100 * 1.1;
      const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
      const niceCeil = (value: number) => {
        if (value <= 60) return Math.ceil(value / 5) * 5;
        return Math.ceil(value / 10) * 10;
      };
      const yMaxPercent = clamp(niceCeil(computedMax), 25, 100);
      const tickStep =
        yMaxPercent <= 60
          ? 10
          : yMaxPercent % 25 === 0
            ? 25
            : yMaxPercent % 20 === 0
              ? 20
              : 10;
      const ticks: number[] = [];
      for (let tick = 0; tick <= yMaxPercent; tick += tickStep) {
        ticks.push(tick);
      }
      if (ticks[ticks.length - 1] !== yMaxPercent) {
        ticks.push(yMaxPercent);
      }
      return {
        domain: [0, yMaxPercent / 100] as [number, number],
        ticks: ticks.map((tick) => tick / 100)
      };
    }

    return null;
  }, [chartData, primaryMetric, secondaryMetric]);

  const listingAgeAxisConfig = useMemo(() => {
    if (primaryMetric !== 'listingAge') return null;
    const maxAge = chartData.reduce((maxValue, item) => {
      const value = item.listingAgeMonths;
      return Number.isFinite(value) ? Math.max(maxValue, value as number) : maxValue;
    }, 0);
    const computedMax = maxAge * 1.1;
    const stepCandidates = [6, 12, 18, 24, 36, 48, 60, 72, 84, 96, 120];
    const step = stepCandidates.find((candidate) => computedMax / candidate <= 6) || 120;
    const yMax = Math.ceil(computedMax / step) * step;
    const ticks: number[] = [];
    for (let tick = 0; tick <= yMax; tick += step) {
      ticks.push(tick);
    }
    if (ticks[ticks.length - 1] !== yMax) {
      ticks.push(yMax);
    }
    return {
      domain: [0, yMax] as [number, number],
      ticks
    };
  }, [chartData, primaryMetric]);

  const revenueAxisConfig = useMemo(() => {
    if (secondaryMetric !== 'revenue') return null;
    const maxRevenue = chartData.reduce((maxValue, item) => {
      const value = item.secondaryScaled;
      return Number.isFinite(value) ? Math.max(maxValue, value as number) : maxValue;
    }, 0);
    const computedMax = maxRevenue * 1.1;
    if (!Number.isFinite(computedMax) || computedMax <= 0) {
      return { domain: [0, 1] as [number, number], ticks: [0, 1] };
    }
    const magnitude = Math.pow(10, Math.floor(Math.log10(computedMax)));
    const stepCandidates = [1, 2, 5, 10].map((factor) => (factor * magnitude) / 10);
    let step = stepCandidates.find((candidate) => computedMax / candidate <= 6) || stepCandidates[stepCandidates.length - 1];
    let yMax = Math.ceil(computedMax / step) * step;
    if (yMax / step > 6) {
      step = step * 2;
      yMax = Math.ceil(computedMax / step) * step;
    }
    const ticks: number[] = [];
    for (let tick = 0; tick <= yMax; tick += step) {
      ticks.push(tick);
    }
    if (ticks[ticks.length - 1] !== yMax) {
      ticks.push(yMax);
    }
    return {
      domain: [0, yMax] as [number, number],
      ticks
    };
  }, [chartData, secondaryMetric]);

  const getSecondaryAxisDomain = () => {
    if (!secondaryMetric) return [0, 1];
    if (secondaryMetric === 'rating') {
      const minObserved = secondaryValues.length ? Math.min(...secondaryValues) : 3;
      const maxObserved = secondaryValues.length ? Math.max(...secondaryValues) : 5;
      return [Math.min(3, minObserved), Math.max(5, maxObserved)];
    }
    if (secondaryMetric === 'reviewShare' || secondaryMetric === 'marketShare') {
      return [0, 1];
    }
    const max = secondaryStats.max;
    return [0, max * 1.1];
  };

  const formatSecondaryTick = (value: number) => {
    if (!secondaryMetric) return '';
    return formatAxisValue(secondaryMetric, value);
  };

  const openAmazon = (asin: string) => {
    if (!asin) return;
    window.open(`https://www.amazon.com/dp/${asin}`, '_blank', 'noopener,noreferrer');
  };

  // Hover-pin-open pattern: first click on a bar pins the tooltip /
  // highlights the bar (so the user can read details without the
  // floating tooltip vanishing on mouse-out). Second click on the
  // *same* bar opens Amazon. Click on a different bar re-pins.
  // Aggregated brand rows have synthetic ASINs — pin only, no Amazon.
  const handleSelectCompetitor = (asin: string, isAggregated: boolean) => {
    if (!asin) return;
    if (pinnedAsin === asin && !isAggregated) {
      openAmazon(asin);
      return;
    }
    setPinnedAsin(asin);
  };

  const renderOverlayLabel = () => {
    if (!secondaryMetric) return null;
    return metricMeta[secondaryMetric as keyof typeof metricMeta]?.label || 'Secondary';
  };

  const isPrimaryShare = primaryMetric === 'marketShare';
  const isSecondaryShare = secondaryMetric === 'reviewShare';

  return (
    <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-700/50">
      <div className="p-4 border-b border-slate-700/50 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="bg-slate-800/50 rounded-lg p-1 flex flex-nowrap">
            <button
              onClick={() => setCompetitorView('all')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                competitorView === 'all' 
                  ? 'bg-blue-500/30 text-blue-400' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              All Competitors
            </button>
            <button
              onClick={() => setCompetitorView('top5')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                competitorView === 'top5' 
                  ? 'bg-emerald-500/30 text-emerald-400' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              Top 5
            </button>
            <button
              onClick={() => setCompetitorView('bottom5')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                competitorView === 'bottom5' 
                  ? 'bg-amber-500/30 text-amber-400' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              Bottom 5
            </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {primaryMedian !== null && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[12px] font-medium tabular-nums">
                <span className="inline-block w-3 h-px border-t border-dashed border-amber-400" aria-hidden />
                Median {metricMeta[primaryMetric].label}: {formatAxisValue(primaryMetric, primaryMedian)}
              </span>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-300 select-none">
              <input
                type="checkbox"
                checked={aggregateByBrand}
                onChange={(e) => {
                  setAggregateByBrand(e.target.checked);
                  setPinnedAsin(null);
                }}
                className="accent-blue-500"
              />
              Aggregate by brand
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 px-1">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: BAR_COLOR }}
              aria-hidden
            />
            Bars
            <select
              value={primaryMetric}
              onChange={(e) => setPrimaryMetric(e.target.value as MetricKey)}
              className="bg-slate-800/70 border border-slate-600/60 rounded-md px-2 py-1 text-sm text-slate-100 hover:border-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-400/60"
            >
              {ALL_METRICS.filter((m) => m !== secondaryMetric).map((m) => (
                <option key={m} value={m}>{metricMeta[m].label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <span
              className="inline-block h-0.5 w-6"
              style={{ backgroundColor: secondaryMetric ? LINE_COLOR : NULL_COLOR }}
              aria-hidden
            />
            Line
            <select
              value={secondaryMetric ?? ''}
              onChange={(e) => setSecondaryMetric(e.target.value ? (e.target.value as MetricKey) : null)}
              className="bg-slate-800/70 border border-slate-600/60 rounded-md px-2 py-1 text-sm text-slate-100 hover:border-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-400/60"
            >
              <option value="">None</option>
              {ALL_METRICS.filter((m) => m !== primaryMetric).map((m) => (
                <option key={m} value={m}>{metricMeta[m].label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="p-4 pb-2">
        <ResponsiveContainer width="100%" height={560}>
          <ComposedChart
            data={chartData}
            margin={{ top: 12, right: 44, left: 36, bottom: 40 }}
            barGap={6}
            barSize={36}
          >
            <defs>
              <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="rgba(248,250,252,0.35)" />
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={isDarkTheme ? '#334155' : '#e5e7eb'} />
            <XAxis
              dataKey="chartKey"
              stroke={isDarkTheme ? '#94a3b8' : '#475569'}
              tickLine={false}
              axisLine={{ stroke: isDarkTheme ? '#334155' : '#e5e7eb' }}
              height={60}
              tick={{ fill: isDarkTheme ? '#e2e8f0' : '#1f2937', fontSize: 11, fontWeight: 600 }}
              angle={-20}
              textAnchor="end"
              interval={0}
              tickFormatter={(value) => chartLabelLookup[value] || value}
            />
            <YAxis
              yAxisId="left"
              stroke={isDarkTheme ? '#94a3b8' : '#475569'}
              tick={{ fill: isDarkTheme ? '#94a3b8' : '#475569' }}
              tickFormatter={(value) => formatAxisValue(primaryMetric, value)}
              domain={
                primaryMetric === 'listingAge' && listingAgeAxisConfig
                  ? listingAgeAxisConfig.domain
                  : (isPrimaryShare && shareAxisConfig
                      ? shareAxisConfig.domain
                      : (isPrimaryShare ? [0, 1] : [0, 'dataMax * 1.1']))
              }
              width={80}
              tickCount={6}
              ticks={
                primaryMetric === 'listingAge' && listingAgeAxisConfig
                  ? listingAgeAxisConfig.ticks
                  : (isPrimaryShare && shareAxisConfig
                      ? shareAxisConfig.ticks
                      : (isPrimaryShare ? [0, 0.25, 0.5, 0.75, 1] : undefined))
              }
              label={{
                value: metricMeta[primaryMetric].axisLabel,
                angle: -90,
                position: 'insideLeft',
                offset: -15,
                fill: isDarkTheme ? '#94a3b8' : '#475569',
                fontSize: 12
              }}
            />

            {secondaryMetric && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke={isDarkTheme ? '#94a3b8' : '#475569'}
                tick={{ fill: isDarkTheme ? '#94a3b8' : '#475569' }}
                tickFormatter={formatSecondaryTick}
                domain={
                  secondaryMetric === 'marketShare' && shareAxisConfig
                    ? shareAxisConfig.domain
                    : (secondaryMetric === 'revenue' && revenueAxisConfig
                        ? revenueAxisConfig.domain
                        : getSecondaryAxisDomain())
                }
                width={70}
                tickCount={6}
                ticks={
                  secondaryMetric === 'marketShare' && shareAxisConfig
                    ? shareAxisConfig.ticks
                    : (secondaryMetric === 'revenue' && revenueAxisConfig
                        ? revenueAxisConfig.ticks
                        : (isSecondaryShare ? [0, 0.25, 0.5, 0.75, 1] : undefined))
                }
                label={{
                  value: metricMeta[secondaryMetric as keyof typeof metricMeta]?.axisLabel || 'Secondary',
                  angle: 90,
                  position: 'insideRight',
                  offset: 16,
                  fill: isDarkTheme ? '#94a3b8' : '#475569',
                  fontSize: 12
                }}
              />
            )}

            <Legend
              verticalAlign="bottom"
              align="center"
              height={36}
              wrapperStyle={{ paddingTop: 6 }}
              content={() => (
                <div className="flex items-center justify-center gap-6 text-sm text-slate-300">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{ backgroundColor: BAR_COLOR }}
                    />
                    <span>{metricMeta[primaryMetric].label}</span>
                  </div>
                  {secondaryMetric && (
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-0.5 w-6"
                        style={{ backgroundColor: LINE_COLOR }}
                      />
                      <span>{metricMeta[secondaryMetric].label}</span>
                    </div>
                  )}
                </div>
              )}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '0.5rem',
                width: '360px',
                maxWidth: '360px',
                overflow: 'hidden',
                whiteSpace: 'normal'
              }}
              content={({ active, payload }) => {
                const data = payload && payload.length ? payload[0].payload : null;
                if (active && data) {
                  const showSecondaryValue = !!secondaryMetric;
                  const marketShare = Number.isFinite(data.marketShareValue) ? data.marketShareValue : null;
                  const reviewShare = Number.isFinite(data.reviewShareValue) ? data.reviewShareValue : null;
                  const showMarketShareRow =
                    marketShare !== null && primaryMetric !== 'marketShare' && secondaryMetric !== 'marketShare';
                  const showReviewShareRow =
                    reviewShare !== null && secondaryMetric !== 'reviewShare';

                  return (
                    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4 shadow-xl w-[360px] max-w-[360px] overflow-hidden whitespace-normal">
                      <div className="flex items-start gap-3">
                        {(() => {
                          const thumb = imageUrlByAsin?.get(String(data.asin || '').toUpperCase());
                          if (!thumb) return null;
                          return (
                            <img
                              src={thumb}
                              alt=""
                              className="w-12 h-12 object-contain rounded-md border border-slate-700/60 bg-slate-900/40 flex-shrink-0"
                              loading="lazy"
                            />
                          );
                        })()}
                        <div className="min-w-0">
                          <div className="text-blue-600 dark:text-blue-400 font-medium text-sm">
                            {data.brand || 'Unknown Brand'}
                          </div>
                          <p
                            className="text-gray-900 dark:text-white text-sm font-medium line-clamp-2 break-words overflow-hidden"
                            title={data.title}
                          >
                            {data.title || 'Unknown Product'}
                          </p>
                          <p className="text-xs text-slate-500 mt-1 break-all line-clamp-1" title={data.asin}>
                            ASIN: {data.asin || 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2 mt-3">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-slate-400 text-sm">
                            {metricMeta[primaryMetric].label}:
                          </span>
                          <span style={{ color: BAR_COLOR }}>
                            {formatMetricValue(primaryMetric, data.primaryValue)}
                          </span>
                        </div>

                        {showSecondaryValue && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-slate-400 text-sm">
                              {metricMeta[secondaryMetric as keyof typeof metricMeta]?.label}:
                            </span>
                            <span style={{ color: LINE_COLOR }}>
                              {secondaryMetric ? formatMetricValue(secondaryMetric, data.secondaryValue) : 'N/A'}
                            </span>
                          </div>
                        )}

                        {showMarketShareRow && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-slate-400 text-sm">Market Share:</span>
                            <span className="text-amber-400">{formatMetricValue('marketShare', marketShare)}</span>
                          </div>
                        )}
                        {showReviewShareRow && Number.isFinite(reviewShare) && reviewShare > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-slate-400 text-sm">Review Share:</span>
                            <span className="text-pink-400">{formatMetricValue('reviewShare', reviewShare)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-gray-300 dark:border-slate-700 pt-1 mt-1">
                          <span className="text-gray-600 dark:text-slate-400 text-sm">Competitor Score:</span>
                          <span className={`${
                            parseFloat(calculateScore(data)) >= 60 ? "text-red-400" :
                            parseFloat(calculateScore(data)) >= 45 ? "text-amber-400" :
                            "text-emerald-400"
                          }`}>
                            {parseFloat(calculateScore(data)).toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-slate-400 text-sm">Strength:</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            getCompetitorStrength(parseFloat(calculateScore(data))).color === 'red' ? 'bg-red-900/20 text-red-400' : 
                            getCompetitorStrength(parseFloat(calculateScore(data))).color === 'yellow' ? 'bg-amber-900/20 text-amber-400' :
                            'bg-emerald-900/20 text-emerald-400'
                          }`}>
                            {getCompetitorStrength(parseFloat(calculateScore(data))).label}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            {primaryMedian !== null && (
              <ReferenceLine
                yAxisId="left"
                y={primaryMedian}
                stroke="#fbbf24"
                strokeDasharray="6 4"
                strokeWidth={1.75}
                ifOverflow="extendDomain"
              />
            )}
            <Bar
              yAxisId="left"
              dataKey="primaryValue"
              name={metricMeta[primaryMetric].label}
              fill={BAR_COLOR}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
              fillOpacity={0.88}
              onClick={(data: any) => handleSelectCompetitor(data?.payload?.asin, !!data?.payload?.__isAggregated)}
              shape={(props: any) => {
                const { x, y, width, height, payload } = props;
                const isSelected = payload?.asin === pinnedAsin;
                return (
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={BAR_COLOR}
                    fillOpacity={0.88}
                    rx={4}
                    ry={4}
                    stroke={isSelected ? '#F8FAFC' : 'none'}
                    strokeWidth={isSelected ? 2 : 0}
                    style={{ cursor: 'pointer' }}
                  />
                );
              }}
            />

            {secondaryMetric && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="secondaryScaled"
                name={renderOverlayLabel() || 'Secondary'}
                stroke={LINE_COLOR}
                strokeWidth={3.25}
                filter="url(#lineGlow)"
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (cx === undefined || cy === undefined) return null;
                  const isSelected = payload?.asin === pinnedAsin;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 6 : 5}
                      fill={LINE_COLOR}
                      stroke={isSelected ? '#F8FAFC' : (LINE_COLOR)}
                      strokeWidth={isSelected ? 2 : 1}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleSelectCompetitor(payload?.asin, !!payload?.__isAggregated)}
                    />
                  );
                }}
                activeDot={{ r: 7 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        {pinnedAsin && (() => {
          const pinned = chartData.find((c) => c.asin === pinnedAsin);
          if (!pinned) return null;
          const isAggregated = !!(pinned as any).__isAggregated;
          const listingCount = (pinned as any).__listingCount as number | undefined;
          const score = parseFloat(calculateScore(pinned));
          const strength = getCompetitorStrength(score);
          const strengthClass =
            strength.color === 'red' ? 'bg-red-500/15 text-red-300 border-red-500/40'
              : strength.color === 'yellow' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
          const thumb = !isAggregated ? imageUrlByAsin?.get(String(pinned.asin || '').toUpperCase()) : null;
          return (
            <div className="mx-4 mb-4 rounded-xl border border-blue-500/30 bg-slate-800/70 p-4 flex items-start gap-4 shadow-[0_0_24px_rgba(59,130,246,0.18)]">
              {thumb ? (
                <img src={thumb} alt="" className="w-14 h-14 object-contain rounded-md border border-slate-700/60 bg-slate-900/40 flex-shrink-0" loading="lazy" />
              ) : (
                <div className="w-14 h-14 rounded-md border border-slate-700/60 bg-slate-900/40 flex-shrink-0" aria-hidden />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-blue-300 font-medium text-sm">{pinned.brand || 'Unknown Brand'}</span>
                  <span className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded border ${strengthClass}`}>{strength.label}</span>
                  {isAggregated && (
                    <span className="text-[11px] text-slate-400">{listingCount ?? '?'} listings</span>
                  )}
                </div>
                <p className="text-slate-200 text-sm font-medium truncate" title={pinned.title}>{pinned.title}</p>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[12px]">
                  <div>
                    <span className="text-slate-500">{metricMeta[primaryMetric].label}: </span>
                    <span style={{ color: BAR_COLOR }} className="font-medium">{formatMetricValue(primaryMetric, pinned.primaryValue)}</span>
                  </div>
                  {secondaryMetric && (
                    <div>
                      <span className="text-slate-500">{metricMeta[secondaryMetric as keyof typeof metricMeta]?.label}: </span>
                      <span style={{ color: LINE_COLOR }} className="font-medium">{formatMetricValue(secondaryMetric, pinned.secondaryValue)}</span>
                    </div>
                  )}
                  {Number.isFinite(pinned.marketShareValue) && pinned.marketShareValue !== null && (
                    <div>
                      <span className="text-slate-500">Market share: </span>
                      <span className="text-amber-300 font-medium">{formatMetricValue('marketShare', pinned.marketShareValue)}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-500">Score: </span>
                    <span className="text-slate-200 font-medium">{Number.isFinite(score) ? `${score.toFixed(1)}%` : '—'}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {!isAggregated && (
                  <button
                    type="button"
                    onClick={() => openAmazon(pinned.asin)}
                    className="px-3 py-1.5 rounded-md bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-200 text-xs font-medium transition-colors"
                  >
                    Open on Amazon
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPinnedAsin(null)}
                  className="text-slate-400 hover:text-slate-200 text-xs underline-offset-2 hover:underline"
                >
                  Unpin
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

const MarketVisuals: React.FC<MarketVisualsProps> = ({
  productId,
  competitors,
  rawData = [],
  showGraph = true,
  showHistorical = true,
  removalCandidateAsins = [],
  removedAsins
}) => {
  const mergedCompetitorData = useMergedCompetitorData(competitors, rawData);

  // Get top 5 competitors by monthly revenue
  const top5Competitors = useMemo(() => {
    return [...mergedCompetitorData]
      .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)
      .slice(0, 5);
  }, [mergedCompetitorData]);

  // Always use top 5 competitors for Historical Analysis
  const getHistoricalCompetitors = useMemo(() => {
    return top5Competitors;
  }, [top5Competitors]);

  return (
    <div className="space-y-8">
      {showGraph && (
        <CompetitorGraphTab
          competitors={competitors}
          rawData={rawData}
          removalCandidateAsins={removalCandidateAsins}
          removedAsins={removedAsins}
        />
      )}

      {/* Historical Analysis Section */}
      {showHistorical && (
        <KeepaSignalsHub
          productId={productId || 'unknown'}
          competitors={getHistoricalCompetitors as any}
          removedAsins={removedAsins}
        />
      )}
    </div>
  );
};

export default MarketVisuals;