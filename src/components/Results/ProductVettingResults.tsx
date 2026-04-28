'use client';

import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { 
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  ComposedChart,
  Line,
  ReferenceLine
} from 'recharts';
import { formatCurrency, formatNumber, formatWeight } from '../../utils/formatters';
import { calculateScore, calculateMarketScore, getCompetitorStrength, getCompetitionLevel, getDaysOnMarket } from '../../utils/scoring';
import MarketVisuals, { CompetitorGraphTab } from './MarketVisuals';
import { Tooltip as InfoTooltip } from '../Offer/components/Tooltip';
import PriceMap from './Charts/PriceMap';
import { getVettingInsights, type CompetitorRowInsight } from '@/lib/vetting/insights';
import { getPercentileThresholds } from '../../utils/metricBands';
import { KeepaAnalysisResult } from '../Keepa/KeepaTypes';
import {
  getCellSignalClass,
  getRecommendedRemovalType,
  getRowFulfillmentType,
  getRowAsin,
  getVariationLowerRevenueAsins,
  type CellSignal,
  type RemovalType
} from '@/utils/competitorMatrixSignals';
import type { AppDispatch } from '../../store';
import { TrendingUp, Users, Loader2, CheckCircle2, BarChart3, Calendar, Package, BarChart2, Info, X, ChevronDown, ChevronUp, SlidersHorizontal, FileText, CheckCircle, RotateCcw } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Checkbox } from '@/components/ui/Checkbox';
import { supabase } from '@/utils/supabaseClient';
import { ListingThumbnail } from '@/components/Product/ListingThumbnail';
import { useListingImages } from '@/hooks/useListingImages';

interface Competitor {
  asin: string;
  title: string;
  monthlyRevenue: number;
  monthlySales: number;
  reviews?: number | string;
  rating?: number | string;
  fulfillment?: 'FBA' | 'FBM' | 'Amazon';
  fulfillmentMethod?: string;
  fulfilledBy?: string;
  fulfillmentType?: string;
  marketShare: number;
  dateFirstAvailable?: string;
  // Add all new fields that might come from CSV
  brand?: string;
  brandName?: string;
  category?: string;
  price?: number;
  bsr?: number | string;
  variations?: number | string;
  imageCount?: number | string;
  parentLevelRevenue?: number | string;
  productType?: string;
  sellerCount?: number;
  grossProfit?: number;
  activeSellers?: number;
  productWeight?: string | number;
  sizeTier?: string;
  soldBy?: string;
}

type ColumnDefinition = {
  key: string;
  label: string;
  tooltip?: string;
};

const DEFAULT_COLUMN_KEYS = new Set([
  'brand',
  'asin',
  'monthlyRevenue',
  'marketShare',
  'reviewShare',
  'competitorScore',
  'strength'
]);

const COMPUTED_COLUMN_KEYS = new Set(['reviewShare', 'competitorScore', 'strength']);

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: 'asin', label: 'ASIN', tooltip: "Amazon's unique product ID. Click the ASIN to open the listing on Amazon." },
  { key: 'brand', label: 'Brand', tooltip: 'Brand name as shown on the Amazon listing.' },
  { key: 'title', label: 'Product Title', tooltip: 'Full product title from the Amazon listing.' },
  { key: 'category', label: 'Category', tooltip: "Amazon's top-level category for this product." },
  { key: 'price', label: 'Price', tooltip: 'Buy Box / listing price at the time of vetting. Snapshot value — does not auto-update.' },
  { key: 'bsr', label: 'BSR', tooltip: 'Best Sellers Rank within the category at the time of vetting. Lower is better — a BSR of 1 is the top seller in its category.' },
  { key: 'monthlySales', label: 'Monthly Sales', tooltip: 'Estimated units sold in the 30 days before this product was vetted.' },
  { key: 'monthlyRevenue', label: 'Monthly Revenue', tooltip: 'Estimated monthly revenue (price × units sold) at the time of vetting.' },
  { key: 'reviewShare', label: 'Review Share', tooltip: "This competitor's share of review count across all competitors in this vetting. High share means an entrenched listing." },
  { key: 'competitorScore', label: 'Competitor Score', tooltip: "A weighted 0–100 score blending this competitor's sales, reviews, revenue, BSR, rating, and market share. Higher = tougher to beat." },
  { key: 'strength', label: 'Strength', tooltip: 'Plain-language read on the Competitor Score: Weak, Average, or Strong.' },
  { key: 'rating', label: 'Rating', tooltip: 'Average star rating (0–5) at the time of vetting.' },
  { key: 'reviews', label: 'Reviews', tooltip: 'Total review count at the time of vetting. High counts signal an established product.' },
  { key: 'variations', label: 'Variations', tooltip: 'Number of size/color/style variations on the listing at the time of vetting.' },
  { key: 'fulfillment', label: 'Fulfilled By', tooltip: 'Who ships the product: FBA (Amazon), FBM (the seller), or AMZ (Amazon sells it directly).' },
  { key: 'marketShare', label: 'Market Share', tooltip: "This competitor's share of estimated monthly revenue across all competitors in this vetting." },
  { key: 'productType', label: 'Product Type', tooltip: 'Whether Amazon classifies this as a standard product or an add-on item.' },
  { key: 'sellerCount', label: 'Seller Count', tooltip: 'How many sellers have offered this exact ASIN, as of the vetting snapshot.' },
  { key: 'dateFirstAvailable', label: 'Date First Available', tooltip: 'The date this listing first went live on Amazon.' },
  { key: 'activeSellers', label: 'Active Sellers', tooltip: 'Sellers with inventory at the time of vetting.' },
  { key: 'productWeight', label: 'Product Weight', tooltip: 'Shipping weight in pounds. Affects FBA storage and fulfillment fees.' },
  { key: 'sizeTier', label: 'Size Tier', tooltip: "Amazon's size classification: Small Standard, Large Standard, or Oversize." },
  { key: 'soldBy', label: 'Sold By', tooltip: 'Seller winning the Buy Box at the time of vetting.' }
];

const COLUMN_TOOLTIPS: Record<string, string> = COLUMN_DEFINITIONS.reduce(
  (acc, col) => {
    if (col.tooltip) acc[col.key] = col.tooltip;
    return acc;
  },
  {} as Record<string, string>
);

interface ProductVettingResultsProps {
  productId?: string;
  competitors: Competitor[];
  distributions?: {
    age: {
      mature: number;
      established: number;
      growing: number;
      new: number;
      na?: number;
    };
    fulfillment: {
      fba: number;
      fbm: number;
      amazon: number;
      na?: number;
    };
  };
  // New props for auto-initialized Keepa analysis
  keepaResults?: KeepaAnalysisResult[];
  marketScore?: {
    score?: number;
    status: string;
  };
  analysisComplete?: boolean;
  productName?: string;
  alreadySaved?: boolean;  // Add this new prop to check if data was already saved
  onResetCalculation?: () => void;  // Add callback for reset calculation
  isRecalculating?: boolean;  // Add loading state for recalculation
}

// Add helper function for age calculation
const calculateAge = (dateStr: string): number => {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30)); // Age in months
};

const calculateDistributions = (competitors) => {
  const total = competitors.length || 1;
  
  // Initialize with default values
  const ageRanges = {
    new: 0,
    growing: 0,
    established: 0,
    mature: 0
  };

  // Fulfillment Methods
  const fulfillmentRanges = {
    fba: 0,
    fbm: 0,
    amazon: 0
  };

  
  // Now calculate actual counts if we have competitors
  if (competitors && competitors.length > 0) {
    // Market Age Distribution
    competitors.forEach(c => {
      if (!c.age && c.dateFirstAvailable) {
        c.age = calculateAge(c.dateFirstAvailable);
      }
      
      if (c.age <= 6) ageRanges.new++;
      else if (c.age > 6 && c.age <= 12) ageRanges.growing++;
      else if (c.age > 12 && c.age <= 18) ageRanges.established++;
      else if (c.age > 18) ageRanges.mature++;
    });

    // Fulfillment Methods
    competitors.forEach(c => {
      const method = (c.fulfillment || '').toLowerCase();
      if (method.includes('fba')) fulfillmentRanges.fba++;
      else if (method.includes('fbm')) fulfillmentRanges.fbm++;
      else if (method.includes('amazon')) fulfillmentRanges.amazon++;
    });

  }

  // Convert to percentages
  const calculatePercentages = (ranges, total = 1) => {
    return Object.entries(ranges).reduce((acc, [key, value]) => {
      return {
        ...acc,
        [key]: (Number(value) / total) * 100
      };
    }, {});
  };

  return {
    age: calculatePercentages(ageRanges, total),
    fulfillment: calculatePercentages(fulfillmentRanges, total)
  };
};

// Updated color constants with consistent definitions for all categories
const COLORS = {
  // Age distribution colors
  mature: '#10B981',     // Emerald
  established: '#3B82F6', // Blue
  growing: '#F59E0B',    // Amber
  new: '#EF4444',        // Red
  
  // Fulfillment colors
  fba: '#EF4444',        // Red
  fbm: '#10B981',        // Green
  amazon: '#F59E0B',     // Orange/Amber
  
  na: '#8B5CF6',           // Purple
  
  // Generic colors
  success: '#10B981',      // Emerald
  primary: '#3B82F6',      // Blue
  warning: '#F59E0B',      // Amber
  danger: '#EF4444',        // Red
  purple: '#8B5CF6'         // Purple
};

const calculateMarketMaturityScore = (competitors) => {
  if (!competitors?.length) return 0;
  const distributions = calculateDistributions(competitors);
  
  // Weight the score based on the distribution of ages
  return Math.round(
    (safeGet(distributions?.age, 'mature', 0) * 1.0 +
     safeGet(distributions?.age, 'established', 0) * 0.7 +
     safeGet(distributions?.age, 'growing', 0) * 0.4 + 
     safeGet(distributions?.age, 'new', 0) * 0.1)
  );
};

const getMarketAgeData = (competitors) => {
  return competitors.map(competitor => ({
    title: competitor.title.substring(0, 20) + '...',
    age: Math.round(Math.random() * 24) // Replace with actual age calculation
  }));
};

// Add these helper functions at the component level
const getDominantCategory = (distribution: Record<string, number>): string => {
  const sorted = Object.entries(distribution)
    .sort(([,a], [,b]) => b - a);
  return sorted[0]?.[0] || 'N/A';
};

// Helper function to safely parse numeric values
const safeParseNumber = (value: string | number | undefined): number => {
  if (typeof value === 'undefined') return 0;
  if (typeof value === 'number') return value;
  return parseFloat(value) || 0;
};

// Helper to safely access distribution properties
const safeGet = (obj: any, key: string, defaultValue: number = 0): number => {
  return typeof obj === 'object' && obj !== null && key in obj ? 
    obj[key] : defaultValue;
};

const calculateMaturity = (distribution: Record<string, number> = {}): number => {
  const mature = safeGet(distribution, 'mature', 0);
  const established = safeGet(distribution, 'established', 0);
  const growing = safeGet(distribution, 'growing', 0);
  const newPct = safeGet(distribution, 'new', 0);
  
  return Math.round(
    (mature * 1.0 +
     established * 0.7 +
     growing * 0.4 +
     newPct * 0.1)
  );
};

// Add this custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3 shadow-xl">
        <p className="text-gray-900 dark:text-slate-300 font-medium">{payload[0].name}</p>
        <p className="text-emerald-600 dark:text-emerald-400 font-semibold">
          {payload[0].value.toFixed(1)}%
        </p>
      </div>
    );
  }
  return null;
};

// Add these helper functions at the component level
const getPrimaryAge = (age = {}) => {
  if (!age) return 'Unknown';
  const sorted = Object.entries(age || {})
    .filter(([key]) => key !== 'na') // Exclude N/A from primary calculation
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  return sorted[0] ? sorted[0][0].charAt(0).toUpperCase() + sorted[0][0].slice(1).toLowerCase() : 'Unknown';
};

const getMaturityLevel = (age: Record<string, number> = {}) => {
  if (!age) return '0.0';
  return ((age.mature || 0) + (age.established || 0)).toFixed(1);
};

const getPrimaryMethod = (fulfillment: Record<string, number> = {}) => {
  if (!fulfillment) return 'Unknown';
  const sorted = Object.entries(fulfillment || {})
    .filter(([key]) => key !== 'na')
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  return sorted[0] ? sorted[0][0].toUpperCase() : 'Unknown';
};

const getQualityLevel = (quality = {}) => {
  if (!quality) return 'Unknown';
  const sorted = Object.entries(quality || {})
    .filter(([key]) => key !== 'na')
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  return sorted[0] ? sorted[0][0].charAt(0).toUpperCase() + sorted[0][0].slice(1).toLowerCase() : 'Unknown';
};

// Custom label renderer
const renderCustomLabel = ({
  cx,
  cy,
  midAngle,
  outerRadius,
  value,
  name
}: any) => {
  const radius = outerRadius * 1.2;
  const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
  const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));
  
  return (
    <text
      x={x}
      y={y}
      fill="#94a3b8"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-xs"
    >
      {`${name} (${value.toFixed(1)}%)`}
    </text>
  );
};

// Add a SubmissionData interface to define the shape of the object
interface SubmissionData {
  userId: string;
  id: string;
  title: string;
  score: number;
  status: string;
  productData: {
    competitors: Competitor[];
    distributions: any;
  };
  keepaResults: any[];
  marketScore: {
    score?: number;
    status: string;
  };
  metrics: any;
  marketInsights: string;
  fromSaveCalculation: boolean;
  updatedAt: string;
  createdAt?: string;
}

type AiSummaryShape = {
  headline?: string;
  narrative?: string;
  opportunityCategories?: string[];
  primaryRisks?: string[];
  generatedAt?: string;
  model?: string;
} | null;

const SSP_CATEGORY_CHIP_CLASS: Record<string, string> = {
  Quantity: 'bg-blue-500/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200 border-blue-500/30',
  Functionality: 'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200 border-indigo-500/30',
  Quality: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 border-emerald-500/30',
  Aesthetic: 'bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-200 border-fuchsia-500/30',
  Bundle: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200 border-amber-500/30',
};

/**
 * Clean key-value row for the spec-sheet cards that flank the verdict.
 * Label is small uppercase on the left, value is bold on the right.
 * Rows are intended to be separated by thin dividers, so no per-row
 * background or padding chrome.
 */
function SpecRow({
  label,
  value,
  accent = 'text-gray-900 dark:text-white',
  tooltip,
  size = 'md',
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  tooltip?: string;
  size?: 'md' | 'lg';
}) {
  // When the briefing is expanded the side cards stretch taller, so we
  // bump the type scale to use the extra room instead of leaving rows
  // floating in dead space.
  const rowPad = size === 'lg' ? 'py-3.5' : 'py-2.5';
  const labelText = size === 'lg' ? 'text-xs' : 'text-[11px]';
  const valueText = size === 'lg' ? 'text-base' : 'text-sm';
  return (
    <div className={`flex items-baseline justify-between ${rowPad} first:pt-0 last:pb-0`}>
      <dt className={`flex items-center gap-1 font-medium uppercase tracking-wider text-gray-500 dark:text-slate-500 ${labelText}`}>
        <span>{label}</span>
        {tooltip && <InfoTooltip content={tooltip} />}
      </dt>
      <dd className={`font-semibold ${valueText} ${accent}`}>{value}</dd>
    </div>
  );
}

function computeMarketSize(
  competitors: Competitor[]
): { sizeLabel: string; sizeIcon: string; sizeColor: string } {
  const totalRevenue = competitors.reduce((s, c) => s + (c.monthlyRevenue || 0), 0);
  const totalReviews = competitors.reduce(
    (s, c) => s + (c.reviews ? parseFloat(c.reviews.toString()) : 0),
    0
  );
  const count = competitors.length;
  const validBSRs = competitors.filter((c) => c.bsr && Number(c.bsr) < 1_000_000);
  const avgBSR = validBSRs.length
    ? validBSRs.reduce((s, c) => s + (Number(c.bsr) || 0), 0) / validBSRs.length
    : 1_000_000;

  const hitCount = (conds: boolean[]) => conds.filter(Boolean).length;

  if (
    hitCount([totalRevenue > 200000, totalReviews > 10000, count > 30, avgBSR < 5000]) >= 2
  )
    return { sizeLabel: 'Very Large', sizeIcon: '↑', sizeColor: 'text-red-400' };
  if (
    hitCount([totalRevenue > 100000, totalReviews > 5000, count > 20, avgBSR < 10000]) >= 2
  )
    return { sizeLabel: 'Large', sizeIcon: '↗', sizeColor: 'text-amber-400' };
  if (
    hitCount([
      totalRevenue > 75000 && totalRevenue <= 100000,
      totalReviews > 3000 && totalReviews <= 5000,
      count > 15 && count <= 20,
      avgBSR >= 10000 && avgBSR < 20000,
    ]) >= 2
  )
    return { sizeLabel: 'Average', sizeIcon: '→', sizeColor: 'text-blue-400' };
  if (hitCount([totalRevenue < 50000, totalReviews < 2000, count < 10, avgBSR > 30000]) >= 2)
    return { sizeLabel: 'Small', sizeIcon: '↘', sizeColor: 'text-emerald-400' };
  if (hitCount([totalRevenue < 20000, totalReviews < 500, count < 5, avgBSR > 75000]) >= 2)
    return { sizeLabel: 'Very Small', sizeIcon: '↓', sizeColor: 'text-emerald-400' };
  return { sizeLabel: 'Medium', sizeIcon: '→', sizeColor: 'text-yellow-400' };
}

function computeStabilityLabel(
  results: KeepaAnalysisResult[],
  kind: 'bsr' | 'price',
  priceMode = false
): { label: string; color: string } {
  const valid = (results || []).filter((r) =>
    kind === 'bsr'
      ? r?.analysis?.bsr?.stability !== undefined
      : r?.analysis?.price?.stability !== undefined
  );
  // Match legacy behavior: if Keepa stability isn't populated for this
  // submission, fall back to 0.5 (Moderate) rather than showing "No data".
  // Older submissions never stored it.
  const avg = valid.length
    ? valid.reduce(
        (s, r) =>
          s +
          (kind === 'bsr'
            ? r.analysis.bsr.stability || 0
            : r.analysis.price.stability || 0),
        0
      ) / valid.length
    : 0.5;

  // One-word labels to avoid awkward wrapping in the spec-sheet cards.
  // Greens all snap to emerald-400 so the palette matches the other
  // positive values (Weak Competitors, Top 5 Avg Rating, etc).
  if (avg >= 0.6) return { label: 'Stable', color: 'text-emerald-400' };
  if (avg >= 0.4) return { label: 'Moderate', color: 'text-amber-400' };
  return { label: priceMode ? 'Volatile' : 'Unstable', color: 'text-red-400' };
}

function renderAiBriefingInline(args: {
  aiSummary: AiSummaryShape;
  aiSummaryLoading: boolean;
  fallback: string;
}) {
  const { aiSummary, aiSummaryLoading, fallback } = args;

  if (aiSummary?.narrative || aiSummary?.headline) {
    const categories = (aiSummary.opportunityCategories || []).filter(
      (c) => c in SSP_CATEGORY_CHIP_CLASS
    );
    const risks = (aiSummary.primaryRisks || []).filter(Boolean);
    return (
      <div className="text-left">
        {/* Headline is rendered separately in the verdict card so it's always
            visible even when the briefing is collapsed — don't duplicate it here. */}
        {aiSummary.narrative && (
          <p className="text-gray-700 dark:text-slate-300 text-sm leading-relaxed mb-3">
            {aiSummary.narrative}
          </p>
        )}
        {/* Opportunity lanes: inline horizontal row — no column, no dead space */}
        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-slate-500 mr-1">
              Opportunity lanes
            </span>
            {categories.map((c) => (
              <span
                key={c}
                className={`px-2 py-0.5 text-xs font-medium rounded-full border ${SSP_CATEGORY_CHIP_CLASS[c]}`}
              >
                {c}
              </span>
            ))}
          </div>
        )}
        {/* Watch for: compact stacked list, not a column */}
        {risks.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-slate-500 mb-1.5">
              Watch for
            </div>
            <ul className="text-sm text-gray-700 dark:text-slate-300 space-y-1 list-disc pl-5">
              {risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (aiSummaryLoading) {
    return (
      <div className="text-left animate-pulse space-y-2">
        <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-3/5" />
        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-full" />
        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-11/12" />
        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-4/5" />
        <p className="text-xs text-gray-500 dark:text-slate-500 pt-1">
          Generating AI market briefing…
        </p>
      </div>
    );
  }

  return (
    <p className="text-gray-700 dark:text-slate-300 text-sm leading-relaxed text-left">
      {fallback}
    </p>
  );
}

export type SubmissionAdjustment = {
  removedAsins: string[];
  adjustedScore: number;
  adjustedAt: string;
};

export type SubmissionOriginalSnapshot = {
  productData?: any;
  keepaResults?: any[];
  marketScore?: { score: number; status: string };
  metrics?: any;
  score?: number;
  status?: string;
  snapshotAt?: string;
};

/**
 * Resolve a competitor's brand for display. Helium 10 / Cerebro CSVs
 * sometimes ship rows with missing or "N/A" brand values; if our Keepa
 * sidecar cache (populated by /api/keepa/listing-images) has a brand for
 * the same ASIN, fall back to it. Avoids the bare "N/A" rows that show up
 * when a competitor was originally added via the single-ASIN feature.
 */
const isMissingBrandValue = (raw: unknown): boolean => {
  if (typeof raw !== 'string') return true;
  const trimmed = raw.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return lower === 'n/a' || lower === 'na' || lower === 'unknown' || lower === 'unknown brand';
};

const resolveBrand = (competitor: any, brandByAsin: Map<string, string>): string => {
  const own = competitor?.brand;
  if (!isMissingBrandValue(own)) return String(own).trim();
  const asin = String(competitor?.asin || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (asin && brandByAsin.has(asin)) {
    const fallback = brandByAsin.get(asin);
    if (fallback && !isMissingBrandValue(fallback)) return fallback;
  }
  return '';
};

export const ProductVettingResults: React.FC<{
  productId?: string;
  onlyReadMode?: boolean;
  competitors: Competitor[];
  distributions?: any;
  keepaResults?: KeepaAnalysisResult[];
  marketScore: { score: number; status: string };
  analysisComplete?: boolean;
  productName?: string;
  alreadySaved?: boolean;
  onResetCalculation?: () => void;
  isRecalculating?: boolean;
  onCompetitorsUpdated?: (updatedCompetitors: Competitor[], removedAsins?: string[]) => void;
  aiSummary?: AiSummaryShape;
  aiSummaryLoading?: boolean;
  adjustment?: SubmissionAdjustment | null;
  originalSnapshot?: SubmissionOriginalSnapshot | null;
  onResetToOriginal?: () => void;
}> = ({
  productId,
  onlyReadMode = false,
  competitors = [],
  distributions: propDistributions,
  keepaResults = [],
  marketScore = { score: 0, status: 'Assessment Unavailable' },
  analysisComplete = false,
  productName = 'Untitled Analysis',
  alreadySaved = false,
  onResetCalculation,
  isRecalculating = false,
  onCompetitorsUpdated,
  aiSummary = null,
  aiSummaryLoading = false,
  adjustment = null,
  originalSnapshot = null,
  onResetToOriginal
}) => {
  // Phase 2.3: the AI briefing body starts collapsed — only the verdict,
  // score bar, and headline show on first load. Keeps the side cards from
  // having to stretch against a tall hero.
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  // Add state for competitor removal and local competitor management
  const [localCompetitors, setLocalCompetitors] = useState(competitors);
  const [removedCompetitors, setRemovedCompetitors] = useState<Set<string>>(new Set());
  // ASIN → Amazon CDN image URL + brand, sourced from useListingImages
  // (cached at the table level via /api/keepa/listing-images). Image URL
  // drives the thumbnail in the matrix's brand column; brand is used as
  // a fallback when the row's own brand is missing.
  const competitorAsins = useMemo(
    () => competitors.map((c) => c.asin || (c as any)['ASIN'] || ''),
    [competitors]
  );
  const { imageUrlByAsin, brandByAsin } = useListingImages(competitorAsins);
  const [selectedForRemoval, setSelectedForRemoval] = useState<Set<string>>(new Set());
  const [showRecalculatePrompt, setShowRecalculatePrompt] = useState(false);
  const [showResetToOriginalModal, setShowResetToOriginalModal] = useState(false);
  const [removalToast, setRemovalToast] = useState<{ count: number; asins: string[] } | null>(null);
  const prevScoreRef = useRef<number | null>(null);
  const prevSnapshotRef = useRef<{
    competitors: Competitor[];
    removedAsins?: Set<string> | string[];
    score?: number;
  } | null>(null);
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();

  const hydrateCompetitorRow = (competitor: Competitor) => {
    const parentLevelRevenue =
      competitor.parentLevelRevenue ??
      (competitor as any)['Parent Level Revenue'] ??
      (competitor as any).parentRevenue ??
      (competitor as any).parent_level_revenue;
    const imageCount =
      competitor.imageCount ??
      (competitor as any).image_count ??
      (competitor as any).images ??
      (competitor as any)['Image Count'];
    const brandName = competitor.brandName ?? competitor.brand;
    const fulfillmentType =
      competitor.fulfillmentType ??
      (competitor as any).fulfillmentType ??
      (competitor as any).fulfillment;
    const fulfilledBy =
      competitor.fulfilledBy ??
      (competitor as any).fulfilledBy ??
      (competitor as any).fulfillment;

    return {
      ...competitor,
      brandName,
      parentLevelRevenue,
      imageCount,
      fulfillmentType,
      fulfilledBy
    };
  };

  // Update local state when props change
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('ProductVettingResults: Competitors prop changed:', competitors.length, 'competitors');
    }
    setLocalCompetitors(competitors.map(hydrateCompetitorRow));
    // Reset removed competitors when new data comes in
    setRemovedCompetitors(new Set());
    setSelectedForRemoval(new Set());
  }, [competitors]);

  // Debugging useEffect to log the data
  useEffect(() => {
    if (competitors.length > 0 || keepaResults?.length > 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('ProductVettingResults - Data for MarketVisuals:', {
          competitorsCount: competitors.length,
          competitorSample: competitors.slice(0, 2),
          keepaResultsCount: keepaResults.length,
          keepaResultsSample: keepaResults.slice(0, 2)
        });
      }
    }
  }, [competitors, keepaResults]);


  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const primaryAsin = competitors?.[0]?.asin || keepaResults?.[0]?.asin || null;
    const hasLegacyKeys = keepaResults.some(result => result?.analysis || result?.productData);
    const hasNewKeys = keepaResults.some(result => result?.series || result?.signals);
    console.log('Vetting Keepa payload snapshot', {
      asin: primaryAsin,
      hasKeepaResults: Boolean(keepaResults.length),
      hasLegacyKeys,
      hasNewKeys
    });
  }, [competitors, keepaResults]);
  
  const [activeTab, setActiveTab] = useState('overview');
  const [isClient, setIsClient] = useState(false);
  
  // Add saving state
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  
  // Add sorting and column visibility state
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'ascending' | 'descending'}>({
    key: 'monthlyRevenue',
    direction: 'descending'
  });

  const [strengthFilter, setStrengthFilter] = useState<'all' | 'strong' | 'decent' | 'weak' | 'recommendedRemovals'>('all');
  const [showRemoved, setShowRemoved] = useState(false);
  
  // Function to toggle competitor selection for removal
  const handleToggleCompetitorSelection = (asin: string) => {
    const newSelectedForRemoval = new Set(selectedForRemoval);
    if (newSelectedForRemoval.has(asin)) {
      newSelectedForRemoval.delete(asin);
    } else {
      newSelectedForRemoval.add(asin);
    }
    setSelectedForRemoval(newSelectedForRemoval);
  };

  useEffect(() => {
    if (!removalToast) return;
    const timeout = window.setTimeout(() => setRemovalToast(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [removalToast]);

  const handleRemoveCompetitors = (asins: string[], options?: { showToast?: boolean }) => {
    const targetAsins = asins.map((asin) => normalizeAsin(asin)).filter(Boolean);
    if (!targetAsins.length) return;
    prevScoreRef.current = currentScoreValue;
    const newRemovedCompetitors = new Set([...removedCompetitors, ...targetAsins]);
    setRemovedCompetitors(newRemovedCompetitors);
    setSelectedForRemoval(new Set());
    setStrengthFilter('all');
    setShowRemoved(false);
    
    // Filter out removed competitors and call parent callback
    const nextActiveCompetitors = localCompetitors.filter(
      (comp) => !newRemovedCompetitors.has(normalizeAsin(comp.asin))
    );

    // Cumulative removedAsins must reflect the full diff against the
    // ORIGINAL competitor set, not just this session's removals. On reload
    // localCompetitors is the already-filtered canonical view and
    // removedCompetitors resets to empty, so without this we'd send the
    // server a shrunken list each subsequent adjustment and lose track
    // of prior-session removals.
    const activeAsinSet = new Set(
      nextActiveCompetitors.map((c) => normalizeAsin(c.asin)).filter(Boolean)
    );
    const baselineCompetitors: Array<{ asin?: string }> =
      originalSnapshot?.productData?.competitors || localCompetitors;
    const cumulativeRemovedAsins = Array.from(
      new Set(
        baselineCompetitors
          .map((c) => normalizeAsin(c.asin || ''))
          .filter((asin) => asin && !activeAsinSet.has(asin))
      )
    );

    console.log('ProductVettingResults: Removing competitors', {
      originalCount: localCompetitors.length,
      sessionRemovedCount: newRemovedCompetitors.size,
      cumulativeRemovedCount: cumulativeRemovedAsins.length,
      activeCount: nextActiveCompetitors.length,
      hasCallback: !!onCompetitorsUpdated
    });

    if (onCompetitorsUpdated) {
      // Let parent handle the full recalculation pipeline
      console.log('ProductVettingResults: Calling onCompetitorsUpdated with', nextActiveCompetitors.length, 'competitors');
      onCompetitorsUpdated(nextActiveCompetitors, cumulativeRemovedAsins);
    } else if (onResetCalculation) {
      // Fallback to reset calculation for submission pages
      console.log('ProductVettingResults: Calling onResetCalculation fallback');
      onResetCalculation();
    }
    
    setShowRecalculatePrompt(false);

    if (options?.showToast) {
      setRemovalToast({ count: targetAsins.length, asins: targetAsins });
    }
  };

  // Function to remove selected competitors and trigger recalculation
  const handleRemoveSelectedCompetitors = () => {
    handleRemoveCompetitors(Array.from(selectedForRemoval));
  };

  const handleRestoreCompetitors = (asins: string[]) => {
    if (!asins.length) return;
    setRemovedCompetitors((prev) => {
      const next = new Set(prev);
      asins.forEach((asin) => next.delete(normalizeAsin(asin)));
      if (next.size === 0) {
        setShowRecalculatePrompt(false);
        setShowRemoved(false);
      }
      return next;
    });
  };

  // Function to restore a removed competitor
  const handleRestoreCompetitor = (asin: string) => {
    handleRestoreCompetitors([asin]);
  };

  const handleSelectAllVisible = () => {
    if (!visibleCompetitorAsins.length) return;
    setSelectedForRemoval((prev) => {
      const next = new Set(prev);
      const allSelected = visibleCompetitorAsins.every((asin) => next.has(asin));
      visibleCompetitorAsins.forEach((asin) => {
        if (allSelected) {
          next.delete(asin);
        } else {
          next.add(asin);
        }
      });
      return next;
    });
  };



  // Function to handle reset calculation
  const handleResetCalculation = () => {
    if (onResetCalculation) {
      // Call the parent's reset callback to trigger recalculation
      onResetCalculation();
    } else {
      // Fallback: Navigate back to dashboard if no callback provided
      window.location.href = '/vetting';
    }
  };
  
  // Add sorting and column visibility state
  const [columnVisibility, setColumnVisibility] = useState<{[key: string]: boolean}>(() => {
    const initial: {[key: string]: boolean} = {};
    DEFAULT_COLUMN_KEYS.forEach((key) => {
      initial[key] = true;
    });
    return initial;
  });
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnFilter, setColumnFilter] = useState('');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const columnStorageKey = useMemo(() => {
    const submissionId = searchParams?.get('submissionId');
    const pathSegments = pathname?.split('/').filter(Boolean) || [];
    const lastSegment = pathSegments[pathSegments.length - 1];
    const isSubmissionRoute = pathSegments.includes('submission');
    const asinFromPath = lastSegment && /^[A-Z0-9]{10}$/i.test(lastSegment) ? lastSegment : null;
    const keySource = submissionId || (isSubmissionRoute ? lastSegment : null) || asinFromPath || 'default';
    return `vetting.columns.${keySource}`;
  }, [pathname, searchParams]);
  
  // Update distributions state to use props
  const [distributions, setDistributions] = useState(propDistributions || {
    age: { mature: 0, established: 0, growing: 0, new: 0, na: 0 },
    fulfillment: { fba: 0, fbm: 0, amazon: 0, na: 0 }
  });

  const availableColumnDefs = useMemo(() => {
    const keys = new Set<string>();
    localCompetitors.forEach((competitor) => {
      Object.keys(competitor || {}).forEach((key) => keys.add(key));
    });
    return COLUMN_DEFINITIONS.filter((column) => {
      if (column.key.toLowerCase().includes('listingscore')) {
        return false;
      }
      return keys.has(column.key) || COMPUTED_COLUMN_KEYS.has(column.key);
    });
  }, [localCompetitors]);

  const filteredColumnDefs = useMemo(() => {
    const filter = columnFilter.trim().toLowerCase();
    if (!filter) return availableColumnDefs;
    return availableColumnDefs.filter((column) => {
      return column.label.toLowerCase().includes(filter) || column.key.toLowerCase().includes(filter);
    });
  }, [availableColumnDefs, columnFilter]);

  useEffect(() => {
    setColumnVisibility((prev) => {
      const next = { ...prev };
      availableColumnDefs.forEach((column) => {
        if (!(column.key in next)) {
          next[column.key] = DEFAULT_COLUMN_KEYS.has(column.key);
        }
      });
      return next;
    });
  }, [availableColumnDefs]);

  useEffect(() => {
    if (!isClient) return;
    try {
      const stored = window.localStorage.getItem(columnStorageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') return;
      setColumnVisibility((prev) => {
        const next = { ...prev };
        availableColumnDefs.forEach((column) => {
          if (typeof parsed[column.key] === 'boolean') {
            next[column.key] = parsed[column.key];
          }
        });
        return next;
      });
    } catch (error) {
      console.warn('Failed to restore column settings:', error);
    }
  }, [availableColumnDefs, columnStorageKey, isClient]);

  useEffect(() => {
    if (!isClient) return;
    const payload = availableColumnDefs.reduce<Record<string, boolean>>((acc, column) => {
      acc[column.key] = Boolean(columnVisibility[column.key]);
      return acc;
    }, {});
    try {
      window.localStorage.setItem(columnStorageKey, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to persist column settings:', error);
    }
  }, [availableColumnDefs, columnStorageKey, columnVisibility, isClient]);
  
  const normalizeAsin = (asin: string) => (asin || '').trim();
  const effectiveKeepaResults = keepaResults || [];
  const removedAsinsKey = useMemo(() => {
    return Array.from(removedCompetitors)
      .map((asin) => normalizeAsin(asin))
      .sort()
      .join('|');
  }, [removedCompetitors]);
  const removedSet = useMemo(() => {
    return new Set(Array.from(removedCompetitors).map((asin) => normalizeAsin(asin)));
  }, [removedAsinsKey]);

  // Filter out removed competitors first - this is the main competitors array to use
  const activeCompetitors = useMemo(() => {
    return localCompetitors.filter((competitor) => !removedSet.has(normalizeAsin(competitor.asin)));
  }, [localCompetitors, removedSet]);

  const variationLowerRevenueAsins = useMemo(() => {
    return getVariationLowerRevenueAsins(activeCompetitors);
  }, [activeCompetitors]);

  const removalTypeByAsin = useMemo(() => {
    const map = new Map<string, RemovalType>();
    activeCompetitors.forEach((competitor) => {
      const asin = normalizeAsin(getRowAsin(competitor));
      if (!asin) return;
      const type = getRecommendedRemovalType(competitor, activeCompetitors, {
        variationLowerRevenueAsins
      });
      map.set(asin, type);
    });
    return map;
  }, [activeCompetitors, variationLowerRevenueAsins]);

  const variationLowerRevenueAsinsAll = useMemo(() => {
    return getVariationLowerRevenueAsins(localCompetitors);
  }, [localCompetitors]);

  const removalTypeByAsinAll = useMemo(() => {
    const map = new Map<string, RemovalType>();
    localCompetitors.forEach((competitor) => {
      const asin = normalizeAsin(getRowAsin(competitor));
      if (!asin) return;
      const type = getRecommendedRemovalType(competitor, localCompetitors, {
        variationLowerRevenueAsins: variationLowerRevenueAsinsAll
      });
      map.set(asin, type);
    });
    return map;
  }, [localCompetitors, variationLowerRevenueAsinsAll]);

  const keepaAnalysisKey = useMemo(() => {
    if (productId) return productId;
    const asins = activeCompetitors
      .map(competitor => normalizeAsin(competitor.asin))
      .filter(Boolean)
      .sort();
    return asins.length ? `asin-group:${asins.join('-')}` : 'unknown';
  }, [activeCompetitors, productId]);

  const derivedMarketScore = useMemo(() => {
    return calculateMarketScore(activeCompetitors, effectiveKeepaResults);
  }, [activeCompetitors, effectiveKeepaResults]);

  const currentScoreValue = Number.isFinite(derivedMarketScore?.score)
    ? Number(derivedMarketScore.score)
    : 0;

  // Define market entry UI status based on provided market score
  const marketEntryUIStatus = derivedMarketScore.status === 'PASS' ? 'PASS' : 
                              derivedMarketScore.status === 'RISKY' ? 'RISKY' : 
                              'FAIL';

  useEffect(() => {
    if (!activeCompetitors) return;
    prevSnapshotRef.current = {
      competitors: activeCompetitors,
      removedAsins: removedSet,
      score: currentScoreValue
    };
  }, [activeCompetitors, removedAsinsKey, currentScoreValue]);

  const { insights: vettingInsights, scoreDelta } = useMemo(() => {
    return getVettingInsights({
      competitors: activeCompetitors,
      removedAsins: removedSet,
      prevSnapshot: prevSnapshotRef.current || undefined,
      currentScore: currentScoreValue,
      prevScore: prevScoreRef.current ?? undefined
    });
  }, [activeCompetitors, removedAsinsKey, currentScoreValue]);
  void scoreDelta;

  const rowInsightsByAsin = vettingInsights.rowInsightsByAsin || {};
  const { insights: fullVettingInsights } = useMemo(() => {
    return getVettingInsights({
      competitors: localCompetitors,
      removedAsins: new Set(),
      prevSnapshot: undefined,
      currentScore: currentScoreValue,
      prevScore: undefined
    });
  }, [localCompetitors, currentScoreValue]);

  const removalCandidateAsins = useMemo(() => {
    const rowInsights = fullVettingInsights.rowInsightsByAsin || {};
    return Object.values(rowInsights)
      .filter((row) => row?.tags?.some((tag) => tag.type === 'removal_candidate'))
      .map((row) => normalizeAsin(row.asin))
      .filter(Boolean);
  }, [fullVettingInsights]);

  const reviewShareStats = useMemo(() => {
    const totalReviews = activeCompetitors.reduce((sum, comp) => {
      const reviewValue = typeof comp.reviews === 'string' ? parseFloat(comp.reviews) : (comp.reviews || 0);
      return sum + (Number.isFinite(reviewValue) ? reviewValue : 0);
    }, 0);
    const reviewShares = activeCompetitors
      .map((comp) => {
        const reviewValue = typeof comp.reviews === 'string' ? parseFloat(comp.reviews) : (comp.reviews || 0);
        if (!totalReviews || !Number.isFinite(reviewValue)) return undefined;
        return (reviewValue / totalReviews) * 100;
      })
      .filter((value): value is number => Number.isFinite(value));
    return {
      totalReviews,
      thresholds: getPercentileThresholds(reviewShares),
      extremes: getPercentileThresholds(reviewShares, { low: 0.1, high: 0.9 })
    };
  }, [activeCompetitors]);

  const strengthRank: Record<string, number> = {
    STRONG: 3,
    DECENT: 2,
    WEAK: 1
  };

  const getReviewShareValue = (competitor: Competitor) => {
    const reviewValue = typeof competitor.reviews === 'string'
      ? parseFloat(competitor.reviews)
      : (competitor.reviews || 0);
    if (!Number.isFinite(reviewValue)) return undefined;
    if (!reviewShareStats.totalReviews) return 0;
    return (reviewValue / reviewShareStats.totalReviews) * 100;
  };

  const getCompetitorScoreValue = (competitor: Competitor) => {
    const score = parseFloat(calculateScore(competitor));
    return Number.isFinite(score) ? score : undefined;
  };

  const getStrengthSortValue = (competitor: Competitor) => {
    const score = getCompetitorScoreValue(competitor);
    if (!Number.isFinite(score)) return undefined;
    const label = getCompetitorStrength(score).label;
    return strengthRank[label] ?? 0;
  };

  const getSortValue = (competitor: Competitor, key: string) => {
    if (key === 'reviewShare') return getReviewShareValue(competitor);
    if (key === 'competitorScore') return getCompetitorScoreValue(competitor);
    if (key === 'strength') return getStrengthSortValue(competitor);
    return (competitor as any)?.[key];
  };

  const sortCompetitorList = (competitorsToSort: Competitor[]) => {
    if (!sortConfig.key) return [...competitorsToSort];
    const numericFields = new Set([
      'price',
      'monthlySales',
      'monthlyRevenue',
      'rating',
      'reviews',
      'bsr',
      'marketShare',
      'variations',
      'sellerCount',
      'grossProfit',
      'activeSellers',
      'reviewShare',
      'competitorScore',
      'strength'
    ]);
    const dateFields = new Set(['dateFirstAvailable']);

    return [...competitorsToSort].sort((a, b) => {
      let aVal = getSortValue(a, sortConfig.key);
      let bVal = getSortValue(b, sortConfig.key);

      const aMissing = aVal === null || aVal === undefined || aVal === '' || Number.isNaN(aVal);
      const bMissing = bVal === null || bVal === undefined || bVal === '' || Number.isNaN(bVal);
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;

      if (numericFields.has(sortConfig.key)) {
        const aNum = typeof aVal === 'number' ? aVal : parseFloat(String(aVal));
        const bNum = typeof bVal === 'number' ? bVal : parseFloat(String(bVal));
        if (aNum < bNum) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aNum > bNum) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      }

      // Dates come from H10 as free-form strings (e.g. "Dec 15, 2024" or
      // "2024-12-15"). Alphabetical string sort gets these wrong — parse
      // as Date and compare timestamps. Unparseable values are treated
      // as "missing" and sink to the bottom regardless of direction.
      if (dateFields.has(sortConfig.key)) {
        const aTime = new Date(String(aVal)).getTime();
        const bTime = new Date(String(bVal)).getTime();
        const aBad = Number.isNaN(aTime);
        const bBad = Number.isNaN(bTime);
        if (aBad && bBad) return 0;
        if (aBad) return 1;
        if (bBad) return -1;
        if (aTime < bTime) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aTime > bTime) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return sortConfig.direction === 'ascending' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'ascending' ? 1 : -1;
      return 0;
    });
  };

  const getExtendedBand = (
    value: number | undefined | null,
    thresholds: { low: number; high: number },
    extremes: { low: number; high: number },
    overrides?: {
      lowOverride?: number;
      highOverride?: number;
      veryLowOverride?: number;
      veryHighOverride?: number;
    }
  ) => {
    if (value === undefined || value === null || !Number.isFinite(value)) {
      return 'low' as const;
    }
    const veryLow = overrides?.veryLowOverride ?? extremes.low;
    const low = overrides?.lowOverride ?? thresholds.low;
    const high = overrides?.highOverride ?? thresholds.high;
    const veryHigh = overrides?.veryHighOverride ?? extremes.high;

    if (Number.isFinite(veryHigh) && value >= veryHigh) return 'very_high' as const;
    if (Number.isFinite(high) && value >= high) return 'high' as const;
    if (Number.isFinite(veryLow) && value <= veryLow) return 'very_low' as const;
    if (Number.isFinite(low) && value <= low) return 'low' as const;
    return 'low' as const;
  };

  const getExtendedBandClasses = (
    band: 'very_low' | 'low' | 'high' | 'very_high',
    classes: {
      very_low: string;
      low: string;
      high: string;
      very_high: string;
    }
  ) => {
    if (band === 'very_high') return classes.very_high;
    if (band === 'high') return classes.high;
    if (band === 'very_low') return classes.very_low;
    return classes.low;
  };

  const sortedCompetitors = useMemo(() => {
    return sortCompetitorList(activeCompetitors);
  }, [activeCompetitors, sortConfig]);

  const revenueThresholds = useMemo(() => {
    const values = sortedCompetitors
      .map((comp) => parseFloat(String(comp.monthlyRevenue || 0)))
      .filter((value) => Number.isFinite(value) && value > 0);
    return getPercentileThresholds(values);
  }, [sortedCompetitors]);

  const revenueExtremes = useMemo(() => {
    const values = sortedCompetitors
      .map((comp) => parseFloat(String(comp.monthlyRevenue || 0)))
      .filter((value) => Number.isFinite(value) && value > 0);
    return getPercentileThresholds(values, { low: 0.1, high: 0.9 });
  }, [sortedCompetitors]);

  const marketShareThresholds = useMemo(() => {
    const values = sortedCompetitors
      .map((comp) => parseFloat(String(comp.marketShare || 0)))
      .filter((value) => Number.isFinite(value) && value > 0);
    return getPercentileThresholds(values);
  }, [sortedCompetitors]);

  const marketShareExtremes = useMemo(() => {
    const values = sortedCompetitors
      .map((comp) => parseFloat(String(comp.marketShare || 0)))
      .filter((value) => Number.isFinite(value) && value > 0);
    return getPercentileThresholds(values, { low: 0.1, high: 0.9 });
  }, [sortedCompetitors]);

  const filteredCompetitors = useMemo(() => {
    if (strengthFilter === 'all') return sortedCompetitors;
    if (strengthFilter === 'recommendedRemovals') {
      return sortedCompetitors.filter((competitor) => {
        const asin = normalizeAsin(getRowAsin(competitor));
        if (!asin) return false;
        return (removalTypeByAsin.get(asin) || 'none') !== 'none';
      });
    }
    return sortedCompetitors.filter((competitor) => {
      const score = getCompetitorScoreValue(competitor);
      if (!Number.isFinite(score)) return false;
      const label = getCompetitorStrength(score).label.toLowerCase();
      return label === strengthFilter;
    });
  }, [sortedCompetitors, strengthFilter, removalTypeByAsin, normalizeAsin]);

  const visibleCompetitorAsins = useMemo(
    () => filteredCompetitors.map((competitor) => competitor.asin).filter(Boolean),
    [filteredCompetitors]
  );

  useEffect(() => {
    if (!selectedForRemoval.size) return;
    const visibleSet = new Set(visibleCompetitorAsins);
    setSelectedForRemoval((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((asin) => {
        if (visibleSet.has(asin)) {
          next.add(asin);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [visibleCompetitorAsins, selectedForRemoval.size]);

  const removedCompetitorsList = useMemo(() => {
    if (!removedSet.size) return [];
    const removed = localCompetitors.filter((comp) => removedSet.has(normalizeAsin(comp.asin)));
    if (!removed.length) return [];
    const filtered = strengthFilter === 'all'
      ? removed
      : strengthFilter === 'recommendedRemovals'
        ? removed.filter((competitor) => {
            const asin = normalizeAsin(getRowAsin(competitor));
            if (!asin) return false;
            return (removalTypeByAsinAll.get(asin) || 'none') !== 'none';
          })
        : removed.filter((competitor) => {
            const score = getCompetitorScoreValue(competitor);
            if (!Number.isFinite(score)) return false;
            const label = getCompetitorStrength(score).label.toLowerCase();
            return label === strengthFilter;
          });
    return sortCompetitorList(filtered);
  }, [removedAsinsKey, localCompetitors, strengthFilter, sortConfig, reviewShareStats, removalTypeByAsinAll, normalizeAsin]);
  
  // Function to handle sorting when a column header is clicked
  const handleSort = (key: string) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'ascending' 
        ? 'descending' 
        : 'ascending'
    }));
  };

  const SortIndicator = ({ columnKey }: { columnKey: string }) => {
    const isActive = sortConfig.key === columnKey;
    const direction = isActive ? sortConfig.direction : 'ascending';
    const icon = direction === 'ascending'
      ? <ChevronUp className="w-3 h-3" />
      : <ChevronDown className="w-3 h-3" />;
    return (
      <span
        className={`ml-1 inline-flex items-center transition-opacity ${
          isActive ? 'opacity-100 text-slate-300' : 'opacity-0 group-hover:opacity-70 text-slate-500'
        }`}
      >
        {icon}
      </span>
    );
  };

  // Shared column header: label + sort indicator + info tooltip.
  // stopPropagation on the tooltip wrapper so hovering the info icon
  // doesn't trigger the th's sort onClick.
  const HeaderCell = ({ columnKey, label }: { columnKey: string; label: string }) => {
    const tooltip = COLUMN_TOOLTIPS[columnKey];
    return (
      <th
        className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white group"
        onClick={() => handleSort(columnKey)}
      >
        <span className="inline-flex items-center">
          {label}
          <SortIndicator columnKey={columnKey} />
          {tooltip && (
            <span
              className="ml-1 inline-flex"
              onClick={(e) => e.stopPropagation()}
            >
              <InfoTooltip content={tooltip} />
            </span>
          )}
        </span>
      </th>
    );
  };
  
  // Function to toggle column visibility
  const toggleColumnVisibility = (key: string) => {
    setColumnVisibility(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const formatColumnValue = (competitor: Competitor, key: string) => {
    const value = (competitor as any)?.[key];
    if (value === null || value === undefined || value === '') return '—';
    if (['price', 'monthlyRevenue', 'grossProfit'].includes(key)) {
      const amount = parseFloat(value);
      return Number.isFinite(amount) ? formatCurrency(amount) : '—';
    }
    if (
      ['monthlySales', 'bsr', 'reviews', 'variations', 'sellerCount', 'activeSellers'].includes(key)
    ) {
      const numeric = parseFloat(value);
      return Number.isFinite(numeric) ? formatNumber(numeric) : '—';
    }
    if (key === 'rating') {
      const numeric = parseFloat(value);
      return Number.isFinite(numeric) ? numeric.toFixed(2) : '—';
    }
    if (key === 'marketShare') {
      const numeric = parseFloat(value);
      return Number.isFinite(numeric) ? `${numeric.toFixed(2)}%` : '—';
    }
    if (key === 'fulfillment') {
      return competitor.fulfillment || competitor.fulfilledBy || value || '—';
    }
    if (key === 'productWeight') {
      return formatWeight(value);
    }
    return String(value);
  };

  const getRemovalClass = (type: RemovalType) => {
    if (type === 'darkRed') return 'removal-dark-red';
    if (type === 'orange') return 'removal-orange';
    if (type === 'lightRed') return 'removal-light-red';
    return '';
  };

  const getSignalBadgeClasses = (signal: CellSignal, isHighlighted: boolean) => {
    if (signal === 'good') {
      return isHighlighted
        ? 'text-emerald-200 bg-emerald-900/15 border-emerald-500/30'
        : 'text-emerald-300 bg-emerald-900/30 border-emerald-500/40';
    }
    if (signal === 'bad') {
      return isHighlighted
        ? 'text-rose-200 bg-rose-900/15 border-rose-500/30'
        : 'text-rose-300 bg-rose-900/30 border-rose-500/40';
    }
    return isHighlighted
      ? 'text-slate-300 bg-slate-800/30 border-slate-600/30'
      : 'text-slate-300 bg-slate-800/40 border-slate-600/40';
  };

  const renderSignalCell = (
    competitor: Competitor,
    columnKey: string,
    isHighlighted: boolean
  ) => {
    if (columnKey === 'reviews') {
      const reviewsValue = typeof competitor.reviews === 'string'
        ? parseFloat(competitor.reviews)
        : competitor.reviews;
      const signal = getCellSignalClass('reviews', reviewsValue);
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold border ${getSignalBadgeClasses(signal, isHighlighted)}`}>
          {Number.isFinite(reviewsValue as number) ? formatNumber(reviewsValue as number) : '—'}
        </span>
      );
    }
    if (columnKey === 'rating') {
      const ratingValue = typeof competitor.rating === 'string'
        ? parseFloat(competitor.rating)
        : competitor.rating;
      const signal = getCellSignalClass('rating', ratingValue);
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold border ${getSignalBadgeClasses(signal, isHighlighted)}`}>
          {Number.isFinite(ratingValue as number) ? (ratingValue as number).toFixed(2) : '—'}
        </span>
      );
    }
    if (columnKey === 'fulfillment') {
      const fulfillmentValue = getRowFulfillmentType(competitor) || competitor.fulfilledBy || competitor.fulfillment || '—';
      const signal = getCellSignalClass('fulfilledBy', fulfillmentValue);
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold border ${getSignalBadgeClasses(signal, isHighlighted)}`}>
          {fulfillmentValue || '—'}
        </span>
      );
    }
    if (columnKey === 'bsr') {
      const bsrValue = typeof competitor.bsr === 'string'
        ? parseFloat(competitor.bsr)
        : competitor.bsr;
      const signal = getCellSignalClass('bsr', bsrValue);
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold border ${getSignalBadgeClasses(signal, isHighlighted)}`}>
          {Number.isFinite(bsrValue as number) ? formatNumber(bsrValue as number) : '—'}
        </span>
      );
    }
    return formatColumnValue(competitor, columnKey);
  };

  // Set isClient to true after component mounts
  React.useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    setDistributions(calculateDistributions(activeCompetitors));
  }, [activeCompetitors]);

  // Helper functions for color selection
  const getCompetitorCountColor = (count: number): string => {
    if (count < 10) return 'text-emerald-400 border-emerald-500/50'; // Very Low - Great
    if (count < 15) return 'text-green-400 border-green-500/50'; // Low - Good
    if (count < 20) return 'text-amber-400 border-amber-500/50'; // Average - Decent
    if (count < 30) return 'text-amber-400 border-amber-500/50'; // High - Caution
    return 'text-red-400 border-red-500/50'; // Very High - Bad
  };
  
  const getCompetitorCountMessage = (count: number): string => {
    if (count < 10) return 'LOW'; // Great
    if (count < 15) return 'MODERATE'; // Good
    if (count < 20) return 'AVERAGE'; // Decent
    if (count < 30) return 'HIGH'; // Caution
    return 'VERY HIGH'; // Bad
  };
  
  const getRevenuePerCompetitorColor = (revenue: number): string => {
    if (revenue >= 12000) return 'text-emerald-400 border-emerald-500/50'; // Very High - Excellent
    if (revenue >= 8000) return 'text-green-400 border-green-500/50'; // High - Very Good
    if (revenue >= 5000) return 'text-amber-400 border-amber-500/50'; // Good - Decent
    if (revenue >= 4000) return 'text-yellow-400 border-yellow-500/50'; // Average - Acceptable
    if (revenue >= 3000) return 'text-amber-400 border-amber-500/50'; // Low - Concern
    return 'text-red-400 border-red-500/50'; // Very Low - Poor
  };
  
  const getRevenuePerCompetitorMessage = (revenue: number): string => {
    if (revenue >= 12000) return 'EXCELLENT'; // Very High 
    if (revenue >= 8000) return 'VERY GOOD'; // High
    if (revenue >= 5000) return 'GOOD'; // Good
    if (revenue >= 4000) return 'AVERAGE'; // Average
    if (revenue >= 3000) return 'LOW'; // Low
    return 'VERY LOW'; // Very Low
  };
  
  const getRevenueColor = (revenue: number): string => {
    if (revenue >= 12000) return 'text-emerald-400 border-emerald-500/50'; // Very High - Excellent
    if (revenue >= 8000) return 'text-green-400 border-green-500/50'; // High - Very Good
    if (revenue >= 5000) return 'text-amber-400 border-amber-500/50'; // Good - Decent
    if (revenue >= 4000) return 'text-yellow-400 border-yellow-500/50'; // Average - Acceptable
    if (revenue >= 3000) return 'text-amber-400 border-amber-500/50'; // Low - Concern
    return 'text-red-400 border-red-500/50'; // Very Low - Poor
  };
  
  const getRevenueMessage = (revenue: number): string => {
    if (revenue >= 12000) return 'EXCELLENT'; // Very High 
    if (revenue >= 8000) return 'VERY GOOD'; // High
    if (revenue >= 5000) return 'GOOD'; // Good
    if (revenue >= 4000) return 'AVERAGE'; // Average
    if (revenue >= 3000) return 'LOW'; // Low
    return 'VERY LOW'; // Very Low
  };

  const baseCardGlow =
    'shadow-[0_0_0_1px_rgba(148,163,184,0.12),0_0_18px_rgba(56,189,248,0.08)]';

  const getMetricGlowClasses = (tone: 'emerald' | 'green' | 'yellow' | 'amber' | 'red') => ({
    emerald: 'shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_0_18px_rgba(16,185,129,0.2)]',
    green: 'shadow-[0_0_0_1px_rgba(34,197,94,0.18),0_0_18px_rgba(34,197,94,0.2)]',
    yellow: 'shadow-[0_0_0_1px_rgba(234,179,8,0.18),0_0_18px_rgba(234,179,8,0.2)]',
    amber: 'shadow-[0_0_0_1px_rgba(245,158,11,0.18),0_0_18px_rgba(245,158,11,0.2)]',
    red: 'shadow-[0_0_0_1px_rgba(239,68,68,0.18),0_0_18px_rgba(239,68,68,0.2)]'
  }[tone]);

  const getRevenueTone = (revenue: number) => {
    if (revenue >= 12000) return 'emerald';
    if (revenue >= 8000) return 'green';
    if (revenue >= 5000) return 'amber';
    if (revenue >= 4000) return 'yellow';
    if (revenue >= 3000) return 'amber';
    return 'red';
  };

  const getCompetitorTone = (count: number) => {
    if (count < 10) return 'emerald';
    if (count < 15) return 'green';
    if (count < 30) return 'amber';
    return 'red';
  };

  // Helper functions for status styles
  const getBorderColorClass = (status: 'PASS' | 'FAIL' | 'RISKY') => ({
    PASS: 'border-emerald-500/50',
    RISKY: 'border-amber-500/50',
    FAIL: 'border-red-500/50'
  }[status]);

  const getVerdictGlowClasses = (status: 'PASS' | 'FAIL' | 'RISKY') => ({
    PASS: 'border-emerald-400/60 ring-1 ring-emerald-400/30 shadow-[0_0_0_1px_rgba(56,189,248,0.05),0_0_24px_rgba(56,189,248,0.06),0_0_26px_rgba(16,185,129,0.35)]',
    RISKY: 'border-amber-400/60 ring-1 ring-amber-400/30 shadow-[0_0_0_1px_rgba(56,189,248,0.05),0_0_24px_rgba(56,189,248,0.06),0_0_26px_rgba(245,158,11,0.35)]',
    FAIL: 'border-red-400/60 ring-1 ring-red-400/30 shadow-[0_0_0_1px_rgba(56,189,248,0.05),0_0_24px_rgba(56,189,248,0.06),0_0_26px_rgba(239,68,68,0.35)]'
  }[status]);

  const getVerdictGlowClassesThin = (status: 'PASS' | 'FAIL' | 'RISKY') => ({
    PASS: 'border-emerald-400/45 ring-1 ring-emerald-400/20 shadow-[0_0_0_1px_rgba(148,163,184,0.1),0_0_18px_rgba(56,189,248,0.06),0_0_18px_rgba(16,185,129,0.22)]',
    RISKY: 'border-amber-400/45 ring-1 ring-amber-400/20 shadow-[0_0_0_1px_rgba(148,163,184,0.1),0_0_18px_rgba(56,189,248,0.06),0_0_18px_rgba(245,158,11,0.22)]',
    FAIL: 'border-red-400/45 ring-1 ring-red-400/20 shadow-[0_0_0_1px_rgba(148,163,184,0.1),0_0_18px_rgba(56,189,248,0.06),0_0_18px_rgba(239,68,68,0.22)]'
  }[status]);

  const getTextColorClass = (status: 'PASS' | 'FAIL' | 'RISKY') => ({
    PASS: 'text-emerald-400',
    RISKY: 'text-amber-400',
    FAIL: 'text-red-400'
  }[status]);

  const getAssessmentSummary = (status: string): string => {
    switch (status) {
      case 'PASS':
        return 'Great Opportunity';
      case 'RISKY':
        return 'Proceed with Caution';
      case 'FAIL':
        return 'Not Recommended';
      default:
        return 'Assessment Unavailable';
    }
  };

  // Generate a comprehensive market assessment message based on key metrics
  const generateMarketAssessmentMessage = (): string => {
    // Calculate key metrics
    const totalMarketCap = activeCompetitors.reduce((sum, comp) => sum + (comp?.monthlyRevenue || 0), 0);
    const revenuePerCompetitor = activeCompetitors.length ? totalMarketCap / activeCompetitors.length : 0;
    const competitorCount = activeCompetitors.length;
    
    // Calculate total reviews
    const totalReviews = activeCompetitors.reduce((sum, comp) => 
      sum + (comp.reviews ? parseFloat(comp.reviews.toString()) : 0), 0);
    
    // Get stability metrics from Keepa data
    const validResults =
      effectiveKeepaResults.filter(result => result?.analysis?.bsr?.stability !== undefined) || [];
    const avgBSRStability = validResults.length 
      ? validResults.reduce((sum, result) => sum + (result.analysis.bsr.stability || 0), 0) / validResults.length
      : 0.5;
    
    const validPriceResults =
      effectiveKeepaResults.filter(result => result?.analysis?.price?.stability !== undefined) || [];
    const avgPriceStability = validPriceResults.length 
      ? validPriceResults.reduce((sum, result) => sum + (result.analysis.price.stability || 0), 0) / validPriceResults.length
      : 0.5;
    
    // Get top 5 competitors by revenue
    const top5 = [...activeCompetitors]
      .sort((a, b) => b.monthlySales - a.monthlySales)
      .slice(0, 5);
    
    // Calculate average reviews and rating for top 5
    const avgReviews = top5.reduce((sum, comp) => 
      sum + (comp.reviews ? parseFloat(comp.reviews.toString()) : 0), 0) / (top5.length || 1);
    
    const validRatings = top5.filter(comp => comp.rating);
    const avgRating = validRatings.length ? 
      validRatings.reduce((sum, comp) => sum + (comp.rating ? parseFloat(comp.rating.toString()) : 0), 0) / validRatings.length
      : 0;
      
    // Calculate average age of listings
    const competitorsWithAge = top5.filter(comp => comp.dateFirstAvailable);
    const avgAgeMonths = competitorsWithAge.length ? 
      competitorsWithAge.reduce((sum, comp) => sum + calculateAge(comp.dateFirstAvailable || ''), 0) / competitorsWithAge.length
      : 0;
      
    // Calculate competitor strength distribution
    const competitorStrengths = activeCompetitors.map(c => {
      const score = parseFloat(calculateScore(c));
      return getCompetitorStrength(score).label;
    });
    
    const strongCount = competitorStrengths.filter(s => s === 'STRONG').length;
    const decentCount = competitorStrengths.filter(s => s === 'DECENT').length;
    const weakCount = competitorStrengths.filter(s => s === 'WEAK').length;
    
    // Calculate market concentration
    const top5MarketShare = top5.reduce((sum, comp) => sum + (comp.marketShare || 0), 0);
    const top5ReviewShare = totalReviews > 0 ? 
      top5.reduce((sum, comp) => sum + (comp.reviews ? parseFloat(comp.reviews.toString()) : 0), 0) / totalReviews * 100 : 0;
    
    // Generate base message based on key factors
    let message = '';
    
    // Primary factors: Revenue per Competitor and Competitor Count
    if (revenuePerCompetitor >= 12000 && competitorCount < 10) {
      message = "Exceptional market with high revenue potential and manageable competition level. Opportunity to capture significant market share with the right product.";
    } else if (revenuePerCompetitor >= 8000 && competitorCount < 15) {
      message = "Strong market with good revenue potential. Competitive landscape is favorable for new entrants with quality offerings.";
    } else if (revenuePerCompetitor >= 5000 && competitorCount < 20) {
      message = "Solid market with balanced competition. Good opportunity with moderate barriers to entry.";
    } else if (revenuePerCompetitor < 3000 && competitorCount > 30) {
      message = "Challenging market with high competition density. Revenue potential may be limited by market saturation.";
    } else if (revenuePerCompetitor < 4000 && competitorCount > 20) {
      message = "Difficult market with below average revenue and significant competition. Consider differentiation strategies.";
    } else if (revenuePerCompetitor >= 5000 && competitorCount > 20) {
      message = "Mixed market with good revenue indicators but crowded competitive landscape. Product differentiation essential.";
    } else if (revenuePerCompetitor < 4000 && competitorCount < 15) {
      message = "Niche market with modest revenue potential but limited competition. May offer targeted opportunity.";
    } else {
      message = "Average market with moderate revenue potential and competition. Success will depend on execution quality.";
    }
    
    // Secondary factors: Add insights about other key metrics
    const secondaryInsights = [];
    
    // BSR Stability insight
    if (avgBSRStability >= 0.8) {
      secondaryInsights.push("BSR shows high stability");
    } else if (avgBSRStability <= 0.4) {
      secondaryInsights.push("BSR fluctuates significantly");
    }
    
    // Price stability insight  
    if (avgPriceStability >= 0.8) {
      secondaryInsights.push("pricing is consistently stable");
    } else if (avgPriceStability <= 0.4) {
      secondaryInsights.push("market has unpredictable pricing");
    }
    
    // Rating insight
    if (avgRating >= 4.7) {
      secondaryInsights.push("competitors maintain excellent ratings");
    } else if (avgRating < 4.0) {
      secondaryInsights.push("ratings show room for improvement");
    }
    
    // Listing age insight
    if (avgAgeMonths > 24) {
      secondaryInsights.push("listings are well-established");
    } else if (avgAgeMonths < 6) {
      secondaryInsights.push("market contains mostly new listings");
    }
    
    // Competitor quality insight
    if (strongCount > activeCompetitors.length * 0.5) {
      secondaryInsights.push("most competitors are high quality");
    } else if (weakCount > activeCompetitors.length * 0.5) {
      secondaryInsights.push("many competitors show weaknesses");
    }
    
    // Market concentration insight
    if (top5MarketShare > 80) {
      secondaryInsights.push("top 5 competitors dominate market share");
    } else if (top5ReviewShare > 80) {
      secondaryInsights.push("review presence is concentrated among leaders");
    }
    
    // Combine the message with secondary insights if available
    if (secondaryInsights.length > 0) {
      // Pick 1-2 insights that are most relevant/interesting to avoid overcrowding
      const selectedInsights = secondaryInsights.slice(0, Math.min(2, secondaryInsights.length));
      message += " " + selectedInsights.join(" and ") + ".";
    }
    
    return message;
  };

  // Safe calculation wrapper
  const safeCalculate = (calculation: () => number, defaultValue: number = 0): number => {
    try {
      return calculation();
    } catch (error) {
      console.error('Calculation error:', error);
      return defaultValue;
    }
  };
  
  // Define all the render helper functions
  
  const renderLoadingState = () => {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Loading Market Analysis
          </h3>
          <p className="text-gray-600 dark:text-slate-400">
            Retrieving data and calculating scores...
          </p>
        </div>
      </div>
    );
  };

  // Render header metrics section
  const renderHeaderMetrics = () => {
    const competitorColorClass = getCompetitorCountColor(activeCompetitors.length);
    const competitorTone = getCompetitorTone(activeCompetitors.length);
    const competitionLevel = getCompetitionLevel(activeCompetitors);
    
    // Calculate total market cap
    const totalMarketCap = activeCompetitors.reduce((sum, comp) => sum + (comp?.monthlyRevenue || 0), 0);
    
    // Calculate revenue per competitor
    const revenuePerCompetitor = activeCompetitors.length ? 
      totalMarketCap / activeCompetitors.length : 0;
    const revenueTone = getRevenueTone(revenuePerCompetitor);
    const marketCapTone = 'emerald';
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Market Cap Card */}
        <div className={`bg-white/90 dark:bg-slate-800/50 rounded-2xl ${baseCardGlow} ${getMetricGlowClasses(marketCapTone)} border-2 border-emerald-500/50 p-6`}>
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Market Cap</h2>
            <BarChart3 className="w-8 h-8 text-gray-600 dark:text-slate-400" strokeWidth={1.5} />
          </div>
          <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(totalMarketCap)}
          </div>
        </div>

        {/* Revenue per Competitor Card */}
        <div className={`bg-white/90 dark:bg-slate-800/50 rounded-2xl ${baseCardGlow} ${getMetricGlowClasses(revenueTone)} border-2 ${getRevenuePerCompetitorColor(revenuePerCompetitor)} p-6`}>
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Revenue per Competitor</h2>
            <TrendingUp className="w-8 h-8 text-gray-600 dark:text-slate-400" strokeWidth={1.5} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-3xl font-bold ${getRevenuePerCompetitorColor(revenuePerCompetitor)}`}>
              {formatCurrency(revenuePerCompetitor)}
            </span>
            <span className={`text-sm font-semibold rounded-md px-2 py-1 ${
              revenuePerCompetitor >= 8000 
                ? 'bg-emerald-900/30 text-emerald-400'
                : revenuePerCompetitor >= 5000
                ? 'bg-amber-900/30 text-amber-400'
                : revenuePerCompetitor >= 3000
                ? 'bg-amber-900/30 text-amber-400'
                : 'bg-red-900/30 text-red-400'
            }`}>
              {getRevenuePerCompetitorMessage(revenuePerCompetitor)}
            </span>
          </div>
        </div>

        {/* Total Competitors Card - Now includes competition level */}
        <div className={`bg-white/90 dark:bg-slate-800/50 rounded-2xl ${baseCardGlow} ${getMetricGlowClasses(competitorTone)} border-2 ${competitorColorClass} p-6`}>
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Total Competitors</h2>
            <Users className="w-8 h-8 text-gray-600 dark:text-slate-400" strokeWidth={1.5} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-3xl font-bold ${competitorColorClass}`}>
              {activeCompetitors.length}
            </span>
            <span className={`text-sm font-semibold rounded-md px-2 py-1 ${
              activeCompetitors.length < 10
                ? 'bg-emerald-900/30 text-emerald-400'
                : activeCompetitors.length < 15
                ? 'bg-green-900/30 text-green-400'
                : activeCompetitors.length < 20
                ? 'bg-amber-900/30 text-amber-400'
                : activeCompetitors.length < 30
                ? 'bg-amber-900/30 text-amber-400'
                : 'bg-red-900/30 text-red-400'
            }`}>
              {getCompetitorCountMessage(activeCompetitors.length)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Render market entry assessment section
  const renderMarketEntryAssessment = () => {
    // Get competition level to include in the market assessment
    const competitionLevel = getCompetitionLevel(activeCompetitors);

    // Generate comprehensive market message (fallback for the inline AI briefing)
    const marketAssessmentMessage = generateMarketAssessmentMessage();

    // ===== Derived metrics used by the Market Structure (LEFT) and Market Health (RIGHT) cards =====
    const top5 = [...activeCompetitors]
      .sort((a, b) => safeParseNumber(b?.monthlySales) - safeParseNumber(a?.monthlySales))
      .slice(0, 5);

    const avgTop5Reviews = top5.length
      ? top5.reduce((sum, c) => sum + safeParseNumber(c?.reviews), 0) / top5.length
      : 0;
    const top5ValidRatings = top5.filter((c) => safeParseNumber(c?.rating) > 0);
    const avgTop5Rating = top5ValidRatings.length
      ? top5ValidRatings.reduce((sum, c) => sum + safeParseNumber(c?.rating), 0) / top5ValidRatings.length
      : 0;
    const top5WithAge = top5.filter((c) => c?.dateFirstAvailable);
    const avgTop5AgeMonths = top5WithAge.length
      ? top5WithAge.reduce((sum, c) => sum + calculateAge(c.dateFirstAvailable || ''), 0) / top5WithAge.length
      : 0;

    // top5Share is stored as a 0-1 ratio by getVettingInsights; surface as %.
    const top5ConcentrationPct = Math.round((Number(vettingInsights?.concentration?.top5Share) || 0) * 100);

    const uniqueBrandCount = (() => {
      const set = new Set<string>();
      activeCompetitors.forEach((c) => {
        const raw = (c?.brand || c?.brandName || '').toString().trim().toLowerCase();
        if (raw) set.add(raw);
      });
      return set.size;
    })();

    const strengthCounts = (() => {
      const counts = { strong: 0, decent: 0, weak: 0 };
      activeCompetitors.forEach((c) => {
        const score = parseFloat(calculateScore(c));
        if (!Number.isFinite(score)) return;
        const label = getCompetitorStrength(score).label;
        if (label === 'STRONG') counts.strong++;
        else if (label === 'DECENT') counts.decent++;
        else counts.weak++;
      });
      return counts;
    })();
    const strengthTotal = strengthCounts.strong + strengthCounts.decent + strengthCounts.weak;
    const strengthPct = {
      strong: strengthTotal ? (strengthCounts.strong / strengthTotal) * 100 : 0,
      decent: strengthTotal ? (strengthCounts.decent / strengthTotal) * 100 : 0,
      weak: strengthTotal ? (strengthCounts.weak / strengthTotal) * 100 : 0,
    };

    const fulfillmentPct = {
      fba: Math.round(Number(distributions?.fulfillment?.fba) || 0),
      fbm: Math.round(Number(distributions?.fulfillment?.fbm) || 0),
      amazon: Math.round(Number(distributions?.fulfillment?.amazon) || 0),
    };
    const agePct = {
      new: Math.round(Number(distributions?.age?.new) || 0),
      growing: Math.round(Number(distributions?.age?.growing) || 0),
      established: Math.round(Number(distributions?.age?.established) || 0),
      mature: Math.round(Number(distributions?.age?.mature) || 0),
    };

    const redFlagCount = vettingInsights?.flags?.red?.length || 0;
    const greenFlagCount = vettingInsights?.flags?.green?.length || 0;

    const newestStrongAgeMonths = (() => {
      let min: number | null = null;
      activeCompetitors.forEach((c) => {
        const score = parseFloat(calculateScore(c));
        if (!Number.isFinite(score)) return;
        if (getCompetitorStrength(score).label !== 'STRONG') return;
        if (!c?.dateFirstAvailable) return;
        const age = calculateAge(c.dateFirstAvailable);
        if (age > 0) {
          min = min === null ? age : Math.min(min, age);
        }
      });
      return min;
    })();

    // Derived labels + colors for Market Health rows
    const reviewsVerdict =
      avgTop5Reviews > 1000
        ? { label: 'HIGH', color: 'text-red-400' }
        : avgTop5Reviews < 300
          ? { label: 'LOW', color: 'text-emerald-400' }
          : { label: 'DECENT', color: 'text-amber-400' };
    const ratingVerdict =
      avgTop5Rating >= 4.7
        ? { label: 'HIGH QUALITY', color: 'text-red-400' }
        : avgTop5Rating < 4.1
          ? { label: 'LOW QUALITY', color: 'text-emerald-400' }
          : { label: 'AVERAGE', color: 'text-amber-400' };
    const ageYears = avgTop5AgeMonths / 12;
    const ageColor =
      ageYears < 1 ? 'text-red-400' : ageYears < 3 ? 'text-amber-400' : 'text-emerald-400';
    const avgAgeDisplay = avgTop5AgeMonths > 0
      ? (() => {
          const y = Math.floor(avgTop5AgeMonths / 12);
          const m = Math.round(avgTop5AgeMonths % 12);
          return y > 0 ? `${y}y ${m}m` : `${m} months`;
        })()
      : 'No data';

    // Market Size — same weighting logic as the legacy card, collapsed into a label+color
    const { sizeLabel: marketSizeLabel, sizeIcon: marketSizeIcon, sizeColor: marketSizeColor } =
      computeMarketSize(activeCompetitors);

    const bsrStability = computeStabilityLabel(effectiveKeepaResults, 'bsr');
    const priceStability = computeStabilityLabel(effectiveKeepaResults, 'price', /* priceMode */ true);

    // Dominant-value summaries — one clean line each instead of 3+ labels that wrap.
    const fulfillmentFbaPct = fulfillmentPct.fba;
    const matureListingsPct = agePct.mature;

    // --- Color-coding for every spec row so each value carries heat ---
    // Higher concentration = harder entry for a new seller.
    const concentrationColor =
      top5ConcentrationPct >= 75
        ? 'text-red-400'
        : top5ConcentrationPct >= 50
          ? 'text-amber-400'
          : 'text-emerald-400';
    // More brand diversity (as a share of total competitors) = more fragmented = easier entry.
    const brandRatio = activeCompetitors.length
      ? uniqueBrandCount / activeCompetitors.length
      : 0;
    const uniqueBrandColor =
      brandRatio >= 0.5
        ? 'text-emerald-400'
        : brandRatio >= 0.25
          ? 'text-amber-400'
          : 'text-red-400';
    // Newest strong listing — lower months = market still open to new entrants = green.
    const newestStrongAgeColor =
      newestStrongAgeMonths === null
        ? 'text-emerald-400'
        : newestStrongAgeMonths < 12
          ? 'text-emerald-400'
          : newestStrongAgeMonths <= 24
            ? 'text-amber-400'
            : 'text-red-400';
    const newestStrongAgeDisplay =
      newestStrongAgeMonths === null
        ? 'None'
        : newestStrongAgeMonths >= 12
          ? `${Math.floor(newestStrongAgeMonths / 12)}y ${Math.round(newestStrongAgeMonths % 12)}m`
          : `${newestStrongAgeMonths}mo`;

    // When the briefing expands the hero grows, so the side cards stretch
    // Spec-row type scale stays constant regardless of briefing expansion
    // state — the expanded briefing now lives in its own sub-container
    // below the three-card row, so side columns don't need to scale up.
    const rowSize: 'md' | 'lg' = 'md';

    // True if there's anything to reveal under the headline (body content
    // for AI summaries, or a legacy mad-libs paragraph).
    const hasBriefingBody =
      !!(
        aiSummary?.narrative ||
        (aiSummary?.primaryRisks && aiSummary.primaryRisks.length > 0) ||
        (aiSummary?.opportunityCategories && aiSummary.opportunityCategories.length > 0) ||
        (!aiSummary && marketAssessmentMessage)
      );

    return (
      <div className="mt-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-stretch">
        {/* Market Structure Card - LEFT */}
        <div className={`bg-white/90 dark:bg-slate-800/50 rounded-2xl ${getVerdictGlowClassesThin(marketEntryUIStatus)} border-2 p-6 h-full flex flex-col`}>
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-4">
            Market Structure
          </h2>
          <dl className="flex-1 flex flex-col justify-around divide-y divide-gray-200/70 dark:divide-slate-700/50">
            <SpecRow
              size={rowSize}
              label="Top 5 Concentration"
              value={`${top5ConcentrationPct}%`}
              accent={concentrationColor}
              tooltip="Share of total monthly revenue held by the top 5 competitors. Higher numbers mean the market is top-heavy — harder to break in without a clear edge."
            />
            <SpecRow
              size={rowSize}
              label="Unique Brands"
              value={`${uniqueBrandCount} / ${activeCompetitors.length}`}
              accent={uniqueBrandColor}
              tooltip="How many distinct brands sit among your competitors. More unique brands = a fragmented market where no single brand has a durable moat."
            />
            <SpecRow
              size={rowSize}
              label="Strong Competitors"
              value={String(strengthCounts.strong)}
              accent="text-red-400"
              tooltip="Competitors scoring 60+ on the BloomEngine strength model — the listings you'd be fighting head-to-head with."
            />
            <SpecRow
              size={rowSize}
              label="Decent Competitors"
              value={String(strengthCounts.decent)}
              accent="text-amber-400"
              tooltip="Competitors scoring 45–59 — established enough to hold their ground but with clear weaknesses you can exploit."
            />
            <SpecRow
              size={rowSize}
              label="Weak Competitors"
              value={String(strengthCounts.weak)}
              accent="text-emerald-400"
              tooltip="Competitors scoring under 45. High weak counts are a green flag — revenue up for grabs."
            />
            <SpecRow
              size={rowSize}
              label="FBA Dominance"
              value={`${fulfillmentFbaPct}%`}
              accent={fulfillmentFbaPct >= 70 ? 'text-emerald-400' : fulfillmentFbaPct >= 40 ? 'text-amber-400' : 'text-red-400'}
              tooltip="Share of competitors using Fulfilled by Amazon. High FBA dominance = a market where sellers already play the FBA game well; low = opportunity for a cleanly-run FBA entry."
            />
            <SpecRow
              size={rowSize}
              label="Mature Listings"
              value={`${matureListingsPct}%`}
              accent={matureListingsPct >= 50 ? 'text-emerald-400' : matureListingsPct >= 25 ? 'text-amber-400' : 'text-red-400'}
              tooltip="Share of competitors with listings 2+ years old. Higher = established market with known players; lower = younger, more volatile market."
            />
          </dl>
        </div>

        {/* Main Assessment Card - CENTER (2 cols) */}
        <div className={`md:col-span-2 h-full bg-white/90 dark:bg-slate-800/50 rounded-2xl ${baseCardGlow} border-4 ${getVerdictGlowClasses(marketEntryUIStatus)}
            p-6 transform scale-105 flex flex-col`}>
          <div className="flex flex-col items-center text-center">
            <div className={`text-6xl font-bold mb-2 ${getTextColorClass(marketEntryUIStatus)}`}>
              {marketEntryUIStatus}
            </div>
            
            <div className="text-5xl font-bold text-gray-900 dark:text-white mb-2">
              {Number.isFinite(derivedMarketScore?.score) ? derivedMarketScore.score.toFixed(1) : '0.0'}%
            </div>
            {adjustment && (
              <div className="mb-3">
                <span className="inline-block text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-300 border border-amber-400/40 whitespace-nowrap">
                  Adjusted
                </span>
              </div>
            )}

            {!adjustment && removedSet.size > 0 && (
              <div className="mb-4">
                <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-600/60 bg-slate-900/40 px-3 py-1 text-xs text-slate-200 whitespace-nowrap">
                  <span className="truncate">
                    Adjusted view — {removedSet.size} competitor{removedSet.size === 1 ? '' : 's'} removed (recalculated market)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRestoreCompetitors(Array.from(removedSet))}
                    className="text-emerald-300 hover:text-emerald-200 transition-colors"
                  >
                    Restore all
                  </button>
                </div>
              </div>
            )}

            <div className={`text-xl font-medium mb-6 ${getTextColorClass(marketEntryUIStatus)}`}>
              {getAssessmentSummary(marketEntryUIStatus)}
            </div>

            {/* Progress bar — fill reflects status color so a PASS reads green
                across the whole bar, a RISKY reads amber, a FAIL reads red.
                Subtle dark→light gradient gives depth without muddying signal. */}
            <div className="w-full">
              <div className="relative h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-slate-700/40">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${
                    derivedMarketScore.status === 'PASS'
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                      : derivedMarketScore.status === 'RISKY'
                        ? 'bg-gradient-to-r from-amber-600 to-amber-400'
                        : 'bg-gradient-to-r from-red-600 to-red-400'
                  }`}
                  style={{ width: `${Number.isFinite(derivedMarketScore?.score) ? Math.max(0, Math.min(100, derivedMarketScore.score)) : 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* Collapsed-first AI briefing: headline always visible + centered, body + chevron toggle below */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-700/60">
            {aiSummaryLoading && !aiSummary?.headline && (
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating AI briefing…
                </div>
              </div>
            )}

            {aiSummary?.headline && (
              <p className="text-center text-lg md:text-xl font-semibold text-gray-900 dark:text-white leading-snug">
                {aiSummary.headline}
              </p>
            )}

            {/* Expanded body lives in a full-width sub-container below the
                three-card row — see further down. Only the headline + toggle
                stay inside the center card. */}

            {hasBriefingBody && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsSummaryExpanded((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {isSummaryExpanded ? 'Hide full briefing' : 'Read full briefing'}
                  {isSummaryExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Market Health Card - RIGHT */}
        <div className={`bg-white/90 dark:bg-slate-800/50 rounded-2xl ${getVerdictGlowClassesThin(marketEntryUIStatus)} border-2 p-6 h-full flex flex-col`}>
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-4">
            Market Health
          </h2>
          <dl className="flex-1 flex flex-col justify-around divide-y divide-gray-200/70 dark:divide-slate-700/50">
            <SpecRow
              size={rowSize}
              label="Market Size"
              value={<span>{marketSizeLabel} <span className="ml-0.5">{marketSizeIcon}</span></span>}
              accent={marketSizeColor}
              tooltip="BloomEngine's weighted size score based on total revenue, review volume, competitor count, and average BSR. Bigger markets = more revenue up for grabs, but more competition to win it."
            />
            <SpecRow
              size={rowSize}
              label="Top 5 Avg Reviews"
              value={avgTop5Reviews ? Math.round(avgTop5Reviews).toLocaleString() : 'N/A'}
              accent={reviewsVerdict.color}
              tooltip="Average review count across the top 5 competitors by monthly sales. High counts are a barrier — it takes time and spend to catch an incumbent with thousands of reviews."
            />
            <SpecRow
              size={rowSize}
              label="Top 5 Avg Rating"
              value={avgTop5Rating ? `${avgTop5Rating.toFixed(1)} ★` : 'N/A'}
              accent={ratingVerdict.color}
              tooltip="Average star rating of the top 5. Low ratings (<4.1) are a green flag — customers are unhappy and a better product wins share."
            />
            <SpecRow
              size={rowSize}
              label="Top 5 Avg Age"
              value={avgAgeDisplay}
              accent={ageColor}
              tooltip="Average listing age of the top 5 by monthly sales. Long-established listings are harder to displace because they compound ranking authority over time."
            />
            <SpecRow
              size={rowSize}
              label="BSR Stability"
              value={bsrStability.label}
              accent={bsrStability.color}
              tooltip="How consistent the top competitors' Best Seller Rank has been over time. Stable = reliable demand signal; volatile = promo wars or seasonal markets."
            />
            <SpecRow
              size={rowSize}
              label="Price Stability"
              value={priceStability.label}
              accent={priceStability.color}
              tooltip="How consistent competitor pricing has been over time. Stable pricing lets you forecast revenue; high volatility often signals promo wars or coupon-driven buying."
            />
            <SpecRow
              size={rowSize}
              label="Newest Strong Listing"
              value={newestStrongAgeDisplay}
              accent={newestStrongAgeColor}
              tooltip="Age of the youngest competitor that still scores as Strong. Low numbers mean the market is still accepting new entrants. High numbers mean only long-entrenched sellers win."
            />
          </dl>
        </div>
      </div>

      {/* Full-width expanded briefing sub-container. Renders below the
          three-card row only when the user expands the briefing. Two-column
          internal layout: narrative on the left (capped width for readable
          line length), opportunity lanes + watch-for list on the right. */}
      {isSummaryExpanded && (aiSummary?.narrative || aiSummary?.headline || aiSummaryLoading) && (
        <div className="mt-6">
          <div className={`bg-white/90 dark:bg-slate-800/50 rounded-2xl ${getVerdictGlowClassesThin(marketEntryUIStatus)} border-2 p-6 md:p-8`}>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-8 md:gap-12">
              {/* LEFT: narrative paragraph */}
              <div className="md:col-span-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-200 mb-4">
                  Full Briefing
                </h3>
                {aiSummaryLoading && !aiSummary?.narrative ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-full" />
                    <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-11/12" />
                    <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-10/12" />
                    <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-4/5" />
                  </div>
                ) : (
                  <p className="text-gray-700 dark:text-slate-300 text-base leading-relaxed">
                    {aiSummary?.narrative || marketAssessmentMessage}
                  </p>
                )}
              </div>
              {/* RIGHT: Opportunity Lanes + Watch For */}
              <div className="md:col-span-2 space-y-7">
                {(aiSummary?.opportunityCategories?.filter((c) => c in SSP_CATEGORY_CHIP_CLASS).length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-200 mb-3">
                      Opportunity Lanes
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {aiSummary!.opportunityCategories!
                        .filter((c) => c in SSP_CATEGORY_CHIP_CLASS)
                        .map((c) => (
                          <span
                            key={c}
                            className={`px-2.5 py-1 text-xs font-medium rounded-full border ${SSP_CATEGORY_CHIP_CLASS[c]}`}
                          >
                            {c}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
                {(aiSummary?.primaryRisks?.filter(Boolean).length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-200 mb-3">
                      Watch For
                    </h3>
                    <ul className="text-sm text-gray-700 dark:text-slate-300 space-y-2 list-disc pl-5 marker:text-gray-400 dark:marker:text-slate-500">
                      {aiSummary!.primaryRisks!.filter(Boolean).map((r, i) => (
                        <li key={i} className="leading-relaxed">{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700/60 flex justify-center">
              <button
                type="button"
                onClick={() => setIsSummaryExpanded(false)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Hide full briefing
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    );
  };

  // Render charts for competitor analysis
  const renderCharts = () => {
    // Server-side or initial render placeholder
    if (typeof window === 'undefined' || !isClient) {
      return (
        <div className="p-8">
          <div className="flex animate-pulse">
            <div className="w-2/5 h-64 bg-slate-800/30 rounded-xl"></div>
            <div className="w-3/5 h-64 ml-6 bg-slate-800/30 rounded-xl"></div>
          </div>
        </div>
      );
    }

    // Calculate total reviews for the review share column
    const totalReviews = activeCompetitors.reduce((sum, comp) => {
      const reviewValue = typeof comp.reviews === 'string' ? 
        parseFloat(comp.reviews) : (comp.reviews || 0);
      return sum + reviewValue;
    }, 0);

    const adjustedViewLabel = removedSet.size > 0
      ? `Adjusted view — ${removedSet.size} competitor${removedSet.size === 1 ? '' : 's'} removed`
      : undefined;

    // Process competitor data for the breakdown table
    const competitorBreakdown = (() => {
      if (activeTab === 'fulfillment') {
        return activeCompetitors.map(comp => ({
          name: comp.title?.length > 30 ? comp.title.substring(0, 30) + '...' : comp.title || 'Unknown Product',
          asin: comp.asin,
          value: comp.fulfillmentMethod || comp.fulfillment || comp.fulfilledBy || extractFulfillmentMethod(comp) || 'N/A'
        }));
      } else if (activeTab === 'age') {
        return activeCompetitors.map(comp => ({
          name: comp.title?.length > 30 ? comp.title.substring(0, 30) + '...' : comp.title || 'Unknown Product',
          asin: comp.asin,
          value: comp.dateFirstAvailable ? calculateAge(comp.dateFirstAvailable) : 'N/A',
          category: comp.dateFirstAvailable ? 
            (calculateAge(comp.dateFirstAvailable) >= 24 ? 'Mature' : 
              calculateAge(comp.dateFirstAvailable) >= 12 ? 'Established' :
              calculateAge(comp.dateFirstAvailable) >= 6 ? 'Growing' : 'New') : 'N/A'
        }));
      } else {
        return activeCompetitors.map(comp => ({
          name: comp.title?.length > 30 ? comp.title.substring(0, 30) + '...' : comp.title || 'Unknown Product',
          asin: comp.asin,
          value: 'N/A',
          category: 'N/A'
        }));
      }
    })();

    // Helper for category descriptions
    const getCategoryDescription = (category) => {
      if (activeTab === 'age') {
        return {
          'Mature': 'Products in market for 2+ years',
          'Established': 'Products in market for 1-2 years',
          'Growing': 'Products in market for 6-12 months',
          'New': 'Products in market for 0-6 months'
        }[category] || '';
      } else if (activeTab === 'fulfillment') {
        return {
          'FBA': 'Fulfilled by Amazon - Prime eligible',
          'FBM': 'Fulfilled by Merchant - Seller handles shipping',
          'Amazon': 'Sold & shipped by Amazon directly'
        }[category] || '';
      } else {
        return '';
      }
    };

    const getSummaryText = () => {
      if (activeTab === 'age') {
        const maturityLevel = getMaturityLevel(distributions.age);
        return parseFloat(maturityLevel) > 60 
          ? `${maturityLevel}% maturity indicates an established market with stable demand and potentially high barriers to entry.`
          : `${maturityLevel}% maturity suggests a growing market with opportunities for new entrants.`;
      } else if (activeTab === 'fulfillment') {
        return `${(distributions.fulfillment.fba || 0).toFixed(1)}% FBA indicates ${distributions.fulfillment.fba > 70 ? 'high' : 'moderate'} 
          competition for Prime customers.`;
      } else {
        return 'Market analysis data available.';
      }
    };

    const getPieChartData = () => {
      if (activeTab === 'age') {
        return [
          { name: 'Mature (2+ years)', shortName: 'Mature', value: distributions.age.mature || 0 },
          { name: 'Established (1-2 years)', shortName: 'Established', value: distributions.age.established || 0 },
          { name: 'Growing (6-12 months)', shortName: 'Growing', value: distributions.age.growing || 0 },
          { name: 'New (0-6 months)', shortName: 'New', value: distributions.age.new || 0 },
          { name: 'N/A', shortName: 'N/A', value: distributions.age.na || 0 }
        ].filter(item => item.value > 0);
      } else if (activeTab === 'fulfillment') {
        return [
          { name: 'FBA', shortName: 'FBA', value: distributions.fulfillment.fba || 0 },
          { name: 'FBM', shortName: 'FBM', value: distributions.fulfillment.fbm || 0 },
          { name: 'Amazon', shortName: 'Amazon', value: distributions.fulfillment.amazon || 0 },
          { name: 'N/A', shortName: 'N/A', value: distributions.fulfillment.na || 0 }
        ].filter(item => item.value > 0);
      } else {
        return [];
      }
    };

    const pieChartData = getPieChartData();

    return (
      <div className="p-8">
        {/* Remove buttons from here since they'll be moved to the top */}
        
        {/* Tab Navigation */}
        <div className="flex mb-6 border-b border-gray-200 dark:border-slate-700/50 overflow-x-auto">
          <button
            className={`px-6 py-3 flex items-center gap-2 text-sm font-medium rounded-t-lg transition-all ${
              activeTab === 'overview' 
                ? 'bg-gray-100 dark:bg-slate-700/30 text-emerald-400 border-b-2 border-emerald-400' 
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/20'
            }`}
            onClick={() => setActiveTab('overview')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Competitor Matrix
          </button>
          
          <button
            className={`px-6 py-3 flex items-center gap-2 text-sm font-medium rounded-t-lg transition-all ${
              activeTab === 'competitor_graph' 
                ? 'bg-gray-100 dark:bg-slate-700/30 text-emerald-400 border-b-2 border-emerald-400' 
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/20'
            }`}
            onClick={() => setActiveTab('competitor_graph')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Competitive Signals
          </button>
          
          <button
            className={`px-6 py-3 flex items-center gap-2 text-sm font-medium rounded-t-lg transition-all ${
              activeTab === 'opportunity'
                ? 'bg-gray-100 dark:bg-slate-700/30 text-emerald-400 border-b-2 border-emerald-400' 
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/20'
            }`}
            onClick={() => setActiveTab('opportunity')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 17l6-6 4 4 7-7M3 21h18" />
            </svg>
            Price Map
          </button>
          
        </div>
        
        {/* Competitor Matrix Tab Content */}
        {activeTab === 'overview' && renderCompetitorOverview()}

        {/* Competitive Signals Tab Content */}
        {activeTab === 'competitor_graph' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-white">Competitive Signals</h3>
              <p className="text-xs text-slate-400 mt-1">Quick visual comparison of active competitors.</p>
            </div>
            <CompetitorGraphTab
              competitors={activeCompetitors as any}
              rawData={effectiveKeepaResults}
              removalCandidateAsins={removalCandidateAsins}
              removedAsins={removedSet}
              imageUrlByAsin={imageUrlByAsin}
            />
          </div>
        )}

        {/* Price Map Tab Content */}
        {activeTab === 'opportunity' && (
          <div className="bg-slate-800/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-white">Price Map</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Competitors ranked from premium to value. Each row shows revenue (relative bar), reviews, rating, and competitive strength — click any row to open the listing on Amazon.
                </p>
              </div>
            </div>
            {adjustedViewLabel && (
              <div className="text-xs text-slate-400 mb-3">
                {adjustedViewLabel}
              </div>
            )}
            <PriceMap competitors={activeCompetitors} imageUrlByAsin={imageUrlByAsin} />
          </div>
        )}
        
      </div>
    );
  };


  // Now add the renderCompetitorOverview function
  const renderCompetitorOverview = () => {
    // Use sorted and active competitors for display
    const competitorsToShow = filteredCompetitors;
    const optionalColumns = availableColumnDefs.filter((column) => !DEFAULT_COLUMN_KEYS.has(column.key));
    const filteredDefaultColumns = filteredColumnDefs.filter((column) => DEFAULT_COLUMN_KEYS.has(column.key));
    const filteredOptionalColumns = filteredColumnDefs.filter((column) => !DEFAULT_COLUMN_KEYS.has(column.key));
    const allVisibleSelected = visibleCompetitorAsins.length > 0
      && visibleCompetitorAsins.every((asin) => selectedForRemoval.has(asin));
    const someVisibleSelected = visibleCompetitorAsins.some((asin) => selectedForRemoval.has(asin));
    
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <div>
              Showing <span className="text-slate-200 font-medium">
                {competitorsToShow.length + (showRemoved ? removedCompetitorsList.length : 0)}
              </span> competitors
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: 'all', label: 'All' },
                { key: 'strong', label: 'Strong' },
                { key: 'decent', label: 'Decent' },
                { key: 'weak', label: 'Weak' },
                { key: 'recommendedRemovals', label: 'Recommended Removals' }
              ].map((option) => {
                const isActive = strengthFilter === option.key;
                const toneClasses: Record<string, { active: string; inactive: string }> = {
                  all: {
                    active: 'bg-blue-500/20 text-blue-200 border-blue-500/60',
                    inactive: 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:bg-slate-700/40'
                  },
                  strong: {
                    active: 'bg-red-500/20 text-red-200 border-red-500/60',
                    inactive: 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:bg-slate-700/40'
                  },
                  decent: {
                    active: 'bg-amber-500/20 text-amber-200 border-amber-500/60',
                    inactive: 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:bg-slate-700/40'
                  },
                  weak: {
                    active: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/60',
                    inactive: 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:bg-slate-700/40'
                  },
                  recommendedRemovals: {
                    active: 'bg-red-500/15 text-red-200 border-red-500/70 border-dashed',
                    inactive: 'bg-slate-800/40 text-slate-400 border-red-500/50 border-dashed hover:text-slate-200 hover:bg-slate-700/40'
                  }
                };
                const tone = toneClasses[option.key];
                const extraInactive = option.key === 'recommendedRemovals' && !isActive ? 'border-red-500/50 border-dashed' : '';
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setStrengthFilter(option.key as 'all' | 'strong' | 'decent' | 'weak' | 'recommendedRemovals')}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                      isActive
                        ? (tone?.active || 'bg-slate-700/60 text-slate-100 border-slate-500/60')
                        : (tone?.inactive || 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:bg-slate-700/40')
                    } ${extraInactive}`}
                  >
                    {option.label}
                  </button>
                );
              })}
              {strengthFilter === 'recommendedRemovals' && (
                <span className="text-xs text-slate-500">
                  Marked by border (hover rows for criteria)
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {removedSet.size > 0 && [
                { key: 'hide', label: 'Hide removed', value: false },
                { key: 'show', label: 'Show removed', value: true }
              ].map((option) => {
                const isActive = showRemoved === option.value;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setShowRemoved(option.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                      isActive
                        ? 'bg-slate-700/60 text-slate-100 border-slate-500/60'
                        : 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:bg-slate-700/40'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedForRemoval.size > 0 && (
              <button
                type="button"
                onClick={() => handleRemoveSelectedCompetitors()}
                disabled={onlyReadMode}
                className="rounded-full px-3 py-1.5 text-xs font-medium border border-red-500/40 text-red-300 hover:text-red-200 hover:border-red-400/60 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Remove selected ({selectedForRemoval.size})
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumnPicker((prev) => !prev)}
                className="flex items-center gap-2 rounded-lg bg-slate-700/40 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700/60 transition-colors"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Columns
              </button>
              {showColumnPicker && (
                <div className="absolute right-0 mt-2 w-64 rounded-lg border border-slate-700 bg-slate-900/95 p-3 shadow-xl z-20">
                  <div className="text-xs font-semibold text-slate-200 mb-2">Choose columns</div>
                  <input
                    value={columnFilter}
                    onChange={(event) => setColumnFilter(event.target.value)}
                    placeholder="Search columns"
                    className="w-full rounded-md border border-slate-700 bg-slate-800/80 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
                  />
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                    {filteredDefaultColumns.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Default columns</div>
                        {filteredDefaultColumns.map((column) => (
                          <label key={column.key} className="flex items-center gap-2 text-xs text-slate-300">
                            <Checkbox
                              id={`column-${column.key}`}
                              checked={Boolean(columnVisibility[column.key])}
                              onChange={() => toggleColumnVisibility(column.key)}
                            />
                            <span>{column.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {filteredDefaultColumns.length > 0 && filteredOptionalColumns.length > 0 && (
                      <div className="border-t border-slate-700/60 my-2" />
                    )}
                    {filteredOptionalColumns.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Uploaded columns</div>
                        {filteredOptionalColumns.map((column) => (
                          <label key={column.key} className="flex items-center gap-2 text-xs text-slate-300">
                            <Checkbox
                              id={`column-${column.key}`}
                              checked={Boolean(columnVisibility[column.key])}
                              onChange={() => toggleColumnVisibility(column.key)}
                            />
                            <span>{column.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {!filteredDefaultColumns.length && !filteredOptionalColumns.length && (
                      <div className="text-xs text-slate-500">No matching columns.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="border-b border-slate-700/50 sticky top-0 bg-slate-800/90 z-10">
              <tr>
                <th className="p-3 text-sm text-slate-400 w-10 align-middle">
                  <Checkbox
                    disabled={onlyReadMode || !visibleCompetitorAsins.length}
                    checked={allVisibleSelected}
                    onChange={handleSelectAllVisible}
                    title="Select all visible competitors"
                    aria-label="Select all visible competitors"
                    aria-checked={someVisibleSelected && !allVisibleSelected ? 'mixed' : allVisibleSelected}
                  />
                </th>
                {columnVisibility.brand && <HeaderCell columnKey="brand" label="Brand" />}
                {columnVisibility.asin && <HeaderCell columnKey="asin" label="ASIN" />}
                {columnVisibility.monthlyRevenue && <HeaderCell columnKey="monthlyRevenue" label="Monthly Revenue" />}
                {columnVisibility.marketShare && <HeaderCell columnKey="marketShare" label="Market Share" />}
                {columnVisibility.reviewShare && <HeaderCell columnKey="reviewShare" label="Review Share" />}
                {columnVisibility.competitorScore && <HeaderCell columnKey="competitorScore" label="Competitor Score" />}
                {columnVisibility.strength && <HeaderCell columnKey="strength" label="Strength" />}
                {optionalColumns.map((column) =>
                  columnVisibility[column.key] ? (
                    <HeaderCell key={column.key} columnKey={column.key} label={column.label} />
                  ) : null
                )}
              </tr>
            </thead>
            <tbody>
              {/* Show active competitors */}
              {competitorsToShow.map((competitor, index) => {
                // Use the scoring calculation from scoring.ts
                const competitorScore = parseFloat(calculateScore(competitor));
                const strength = getCompetitorStrength(competitorScore);
                const reviewShare = getReviewShareValue(competitor);
                
                // Get clean ASIN from data
                let cleanAsin = competitor.asin;
                if (typeof cleanAsin === 'string' && cleanAsin.includes('amazon.com/dp/')) {
                  const match = cleanAsin.match(/dp\/([A-Z0-9]{10})/);
                  if (match && match[1]) {
                    cleanAsin = match[1];
                  }
                }
                
                const rowInsight = rowInsightsByAsin[competitor.asin] as CompetitorRowInsight | undefined;
                const removalType = removalTypeByAsin.get(normalizeAsin(getRowAsin(competitor))) || 'none';
                const removalClass = getRemovalClass(removalType);
                const rowHighlightClass = removalClass
                  || (rowInsight?.highlight ? `${rowInsight.highlight.accentClass} ${rowInsight.highlight.ringClass}` : '');
                const isRemovalHighlighted = removalType !== 'none';

                const revenueBand = getExtendedBand(
                  competitor.monthlyRevenue,
                  revenueThresholds,
                  revenueExtremes,
                  { lowOverride: 1000, highOverride: 10000, veryLowOverride: 750, veryHighOverride: 15000 }
                );
                const revenueClass = getExtendedBandClasses(revenueBand, {
                  very_low: 'text-emerald-300 bg-emerald-900/20',
                  low: 'text-slate-200',
                  high: 'text-amber-300 bg-amber-900/20',
                  very_high: 'text-red-300 bg-red-900/20'
                });

                const marketShareValue = Number(competitor.marketShare || 0);
                const marketShareBand = getExtendedBand(
                  marketShareValue,
                  marketShareThresholds,
                  marketShareExtremes,
                  { lowOverride: 3, highOverride: 15, veryLowOverride: 1.5, veryHighOverride: 25 }
                );
                const marketShareClass = getExtendedBandClasses(marketShareBand, {
                  very_low: 'text-emerald-300 bg-emerald-900/20',
                  low: 'text-slate-200',
                  high: 'text-amber-300 bg-amber-900/20',
                  very_high: 'text-red-300 bg-red-900/20'
                });

                const reviewShareBand = getExtendedBand(
                  typeof reviewShare === 'number' ? reviewShare : undefined,
                  reviewShareStats.thresholds,
                  reviewShareStats.extremes,
                  { lowOverride: 3, highOverride: 15, veryLowOverride: 1.5, veryHighOverride: 25 }
                );
                const reviewShareClass = getExtendedBandClasses(reviewShareBand, {
                  very_low: 'text-emerald-300 bg-emerald-900/20',
                  low: 'text-slate-200',
                  high: 'text-amber-300 bg-amber-900/20',
                  very_high: 'text-red-300 bg-red-900/20'
                });

                const scoreTone =
                  strength.color === 'red'
                    ? { text: 'text-red-300', badge: 'bg-red-900/20 text-red-300' }
                    : strength.color === 'yellow'
                      ? { text: 'text-amber-300', badge: 'bg-amber-900/20 text-amber-300' }
                      : { text: 'text-emerald-300', badge: 'bg-emerald-900/20 text-emerald-300' };

                return (
                  <tr
                    key={competitor.asin || index}
                    className={`group border-b border-slate-700/50 border-l-2 border-transparent hover:bg-slate-700/30 ${rowHighlightClass}`}
                  >
                    <td className="p-3 align-middle">
                      <Checkbox
                        disabled={onlyReadMode}
                        checked={selectedForRemoval.has(competitor.asin)}
                        onChange={() => handleToggleCompetitorSelection(competitor.asin)}
                        title="Select for removal"
                      />
                    </td>
                    {columnVisibility.brand && (
                      <td className="p-3 text-sm leading-5 text-white align-middle">
                        <div className="flex items-center gap-2 min-w-0">
                          <ListingThumbnail src={imageUrlByAsin.get(cleanAsin.toUpperCase()) ?? null} />
                          <span className="truncate">{resolveBrand(competitor, brandByAsin) || "Unknown Brand"}</span>
                        </div>
                      </td>
                    )}
                    {columnVisibility.asin && (
                      <td className="p-3 text-sm leading-5 align-middle">
                        <div className="flex flex-col items-start gap-0.5">
                          <a
                            href={`https://www.amazon.com/dp/${cleanAsin}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 hover:underline text-sm"
                          >
                            {cleanAsin}
                          </a>
                          {/* Chip only renders in the Recommended Removals filter
                              view. In the default view the orange accent bar +
                              Competitor Insight Snapshot popup already cover the
                              signal, and hiding the chip keeps row heights uniform. */}
                          {removalType === 'orange' && strengthFilter === 'recommendedRemovals' && (
                            <span
                              title="Likely variant of the same parent listing (lower revenue than sibling ASIN)"
                              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded bg-amber-400/25 text-amber-200 border border-amber-400/50 whitespace-nowrap leading-none"
                            >
                              Variant
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    {columnVisibility.monthlyRevenue && (
                      <td className="p-3 text-sm leading-5 align-middle">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold leading-4 ${revenueClass}`}>
                          {formatCurrency(competitor.monthlyRevenue)}
                        </span>
                      </td>
                    )}
                    {columnVisibility.marketShare && (
                      <td className="p-3 text-sm leading-5 align-middle">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold leading-4 ${marketShareClass}`}>
                          {marketShareValue.toFixed(2)}%
                        </span>
                      </td>
                    )}
                    {columnVisibility.reviewShare && (
                      <td className="p-3 text-sm leading-5 align-middle">
                        {typeof reviewShare === 'number' ? (
                          <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold leading-4 ${reviewShareClass}`}>
                            {reviewShare.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-sm text-slate-500">—</span>
                        )}
                      </td>
                    )}
                    {columnVisibility.competitorScore && (
                      <td className={`p-3 text-sm leading-5 align-middle ${scoreTone.text}`}>
                        <CompetitorScoreDetails
                          score={competitorScore.toFixed(2)}
                          competitor={competitor}
                          rowInsight={rowInsight}
                          toneClass={scoreTone.text}
                        />
                      </td>
                    )}
                    {columnVisibility.strength && (
                      <td className="p-3 text-sm leading-5 align-middle">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold leading-4 ${scoreTone.badge}`}>
                          {strength.label}
                        </span>
                      </td>
                    )}
                    {optionalColumns.map((column) => (
                      columnVisibility[column.key] ? (
                        <td
                          key={column.key}
                          className={`p-3 text-sm leading-5 text-white align-middle ${
                            column.key === 'title' ? 'truncate max-w-xs' : ''
                          } ${column.key === 'dateFirstAvailable' ? 'whitespace-nowrap' : ''}`}
                        >
                          {['reviews', 'rating', 'fulfillment', 'bsr'].includes(column.key)
                            ? renderSignalCell(competitor, column.key, isRemovalHighlighted)
                            : formatColumnValue(competitor, column.key)}
                        </td>
                      ) : null
                    ))}
                  </tr>
                );
              })}
              
              {/* Show removed competitors with struck-through styling */}
              {showRemoved && removedCompetitorsList.map((competitor) => {
                const competitorScore = parseFloat(calculateScore(competitor));
                const strength = getCompetitorStrength(competitorScore);
                const reviewShare = getReviewShareValue(competitor);
                const removedMarketShareValue = Number(competitor.marketShare || 0);

                const strengthColorClass =
                  strength.color === 'red' ? 'bg-red-900/20 text-red-400' :
                  strength.color === 'yellow' ? 'bg-amber-900/20 text-amber-400' :
                  'bg-emerald-900/20 text-emerald-400';

                let cleanAsin = competitor.asin;
                if (typeof cleanAsin === 'string' && cleanAsin.includes('amazon.com/dp/')) {
                  const match = cleanAsin.match(/dp\/([A-Z0-9]{10})/);
                  if (match && match[1]) {
                    cleanAsin = match[1];
                  }
                }

                return (
                  <tr key={`removed-${competitor.asin}`} className="border-b border-slate-700/50 border-l-2 border-transparent bg-slate-800/30 opacity-60">
                    <td className="p-3 align-middle">
                      <button
                        onClick={() => handleRestoreCompetitor(competitor.asin)}
                        className="p-1 hover:bg-emerald-500/20 rounded-lg text-emerald-400 hover:text-emerald-300 transition-colors"
                        title="Restore competitor"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    </td>
                    {columnVisibility.brand && (
                      <td className="p-3 text-sm leading-5 text-white align-middle">
                        <div className="flex items-center gap-2 min-w-0 line-through">
                          <ListingThumbnail src={imageUrlByAsin.get(cleanAsin.toUpperCase()) ?? null} dim />
                          <span className="truncate">{resolveBrand(competitor, brandByAsin) || "Unknown Brand"}</span>
                        </div>
                      </td>
                    )}
                    {columnVisibility.asin && (
                      <td className="p-3 text-sm leading-5 text-blue-400 line-through align-middle">{cleanAsin}</td>
                    )}
                    {columnVisibility.monthlyRevenue && (
                      <td className="p-3 text-sm leading-5 text-white align-middle">{formatCurrency(competitor.monthlyRevenue)}</td>
                    )}
                    {columnVisibility.marketShare && (
                      <td className="p-3 text-sm leading-5 text-white align-middle">{removedMarketShareValue.toFixed(2)}%</td>
                    )}
                    {columnVisibility.reviewShare && (
                      <td className="p-3 text-sm leading-5 text-white align-middle">
                        {typeof reviewShare === 'number' ? `${reviewShare.toFixed(2)}%` : '—'}
                      </td>
                    )}
                    {columnVisibility.competitorScore && (
                      <td className="p-3 text-sm leading-5 text-white align-middle">{competitorScore.toFixed(2)}%</td>
                    )}
                    {columnVisibility.strength && (
                      <td className="p-3 text-sm leading-5 align-middle">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold leading-4 ${strengthColorClass}`}>
                          {strength.label}
                        </span>
                      </td>
                    )}
                    {optionalColumns.map((column) => (
                      columnVisibility[column.key] ? (
                        <td
                          key={column.key}
                          className={`p-3 text-sm leading-5 text-white align-middle ${column.key === 'title' ? 'truncate max-w-xs' : ''}`}
                        >
                          {formatColumnValue(competitor, column.key)}
                        </td>
                      ) : null
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    );
  };
  
  // Modify the button UI for the save button to show loading and complete states
  const renderActionButtons = () => {
    // Removed floating buttons - no longer needed
    return null;
  };
  
  // Update the render function to use the new renderCompetitorOverview function
  const render = () => {
    // Safely check if we have enough data to render
    if (!competitors?.length || !isClient) {
      return renderLoadingState();
    }

    return (
      <div className="space-y-6">
        {/* Persisted-adjustment banner. Shown when the submission has been saved
            with removed competitors (submission_data.adjustment present). The
            original snapshot is preserved server-side; Reset restores it. */}
        {adjustment && (
          <div className="mx-6 mt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-50/70 dark:bg-amber-500/10 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-400/20 flex items-center justify-center">
                <SlidersHorizontal className="w-4 h-4 text-amber-700 dark:text-amber-300" />
              </div>
              <div className="text-sm text-gray-800 dark:text-amber-100/90 leading-relaxed">
                <span className="font-semibold text-amber-800 dark:text-amber-200">Adjusted view</span>
                {' — '}
                {adjustment.removedAsins.length} competitor{adjustment.removedAsins.length === 1 ? '' : 's'} removed.
                {originalSnapshot?.score != null && (
                  <>
                    {' Original score was '}
                    <span className="font-semibold">{originalSnapshot.score.toFixed(1)}%</span>
                    {'; adjusted is '}
                    <span className="font-semibold">{adjustment.adjustedScore.toFixed(1)}%</span>
                    {'.'}
                  </>
                )}
              </div>
            </div>
            {onResetToOriginal && !onlyReadMode && (
              <button
                type="button"
                onClick={() => setShowResetToOriginalModal(true)}
                disabled={isRecalculating}
                className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-400/60 bg-white dark:bg-slate-800/60 text-sm font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" />
                Reset to original
              </button>
            )}
          </div>
        )}

        {/* Header metrics and main assessment cards */}
        {renderHeaderMetrics()}
        {renderMarketEntryAssessment()}
        
        {/* Competitor Snapshot with Tabs */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
          <div className="px-6 pt-6">
            <h2 className="text-xl font-bold text-white">Competitor Snapshot</h2>
            <p className="text-slate-400 text-sm mt-1">
              Pricing, sales, and reviews across active competitors over the{' '}
              <span className="text-slate-100 font-semibold">last 30 days</span>.
            </p>
          </div>
          {renderCharts()}
        </div>
        
        
        {/* Market Visuals */}
        {activeCompetitors.length > 0 && (
          <div>
            <MarketVisuals
              productId={keepaAnalysisKey}
              competitors={activeCompetitors as any}
              rawData={effectiveKeepaResults}
              showGraph={false}
            />
          </div>
        )}
      </div>
    );
  };

  // Main return
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-900 py-6">
      {/* Market analysis content */}
      <div className="bg-white/90 dark:bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50">
        {/* Add buttons at the top */}
        <div className="flex justify-end items-center gap-3 p-4 border-b border-gray-200 dark:border-slate-700/50">
          {/* Buttons are now rendered by the renderActionButtons function */}
        </div>
        {render()}
      </div>
      
      {/* Render action buttons separately */}
      {renderActionButtons()}

      {removalToast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="bg-slate-900 text-white px-5 py-4 rounded-xl shadow-lg flex items-center gap-3 border border-slate-700/60">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div className="text-sm font-medium">
              Removed {removalToast.count} competitor{removalToast.count !== 1 ? 's' : ''}.
            </div>
            <button
              onClick={() => {
                handleRestoreCompetitors(removalToast.asins);
                setRemovalToast(null);
              }}
              className="ml-2 text-sm text-emerald-300 hover:text-emerald-200"
            >
              Undo
            </button>
          </div>
        </div>
      )}
      
      
      {/* Recalculate Prompt Modal — portaled to escape any backdrop-blur
          stacking context from parent containers. */}
      {showRecalculatePrompt && typeof document !== 'undefined' && createPortal(
        (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Recalculate Analysis</h3>
                <p className="text-gray-600 dark:text-slate-400 text-sm">Update your market score</p>
              </div>
            </div>
            
            <div className="bg-gray-100 dark:bg-slate-700/30 rounded-lg p-4 mb-6">
              <p className="text-gray-700 dark:text-slate-300 text-sm mb-2">
                You've removed {removedSet.size} weak competitor{removedSet.size !== 1 ? 's' : ''} from your analysis.
              </p>
              <p className="text-gray-900 dark:text-white font-medium">
                Recalculate to see your updated market score with the filtered competitor set.
              </p>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRecalculatePrompt(false);
                  // Restore all removed competitors
                  setRemovedCompetitors(new Set());
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRecalculatePrompt(false);
                  handleResetCalculation();
                }}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 rounded-lg text-white transition-colors flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                Recalculate
              </button>
            </div>
          </div>
        </div>
        ),
        document.body
      )}

      {/* Reset-to-original confirm modal */}
      {showResetToOriginalModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
                <RotateCcw className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Reset to original?</h3>
                <p className="text-gray-600 dark:text-slate-400 text-sm">Undo all competitor removals</p>
              </div>
            </div>

            <div className="bg-gray-100 dark:bg-slate-700/30 rounded-lg p-4 mb-6">
              <p className="text-gray-700 dark:text-slate-300 text-sm mb-1">
                This will restore the original competitor set
                {adjustment && (
                  <>
                    {' ('}
                    {adjustment.removedAsins.length} currently removed
                    {')'}
                  </>
                )}
                {' '}and revert to the original score
                {originalSnapshot?.score != null && (
                  <>
                    {' of '}
                    <span className="font-semibold">{originalSnapshot.score.toFixed(1)}%</span>
                  </>
                )}
                .
              </p>
              <p className="text-gray-600 dark:text-slate-400 text-xs mt-2">
                You can re-remove competitors at any time — the original baseline is kept on file.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetToOriginalModal(false)}
                disabled={isRecalculating}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowResetToOriginalModal(false);
                  onResetToOriginal?.();
                }}
                disabled={isRecalculating}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 rounded-lg text-white transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to extract fulfillment method
const extractFulfillmentMethod = (competitor: Competitor): string => {
  if (competitor?.fulfillment) {
    return competitor.fulfillment;
  }
  if (competitor?.fulfillmentMethod) {
    return competitor.fulfillmentMethod;
  }
  if (competitor?.fulfilledBy) {
    return competitor.fulfilledBy;
  }
  return 'Unknown';
};

const normalizeFulfillmentLabel = (competitor: Competitor): string => {
  const raw = (competitor.fulfillment || competitor.fulfillmentMethod || competitor.fulfilledBy || '').toString().toLowerCase();
  if (raw.includes('amazon')) return 'Amazon';
  if (raw.includes('fba')) return 'FBA';
  if (raw.includes('fbm')) return 'FBM';
  return 'Unknown';
};

type DriverTone = 'good' | 'bad' | 'neutral';
type DriverCandidate = {
  id: string;
  label: string;
  valueText: string;
  tone: DriverTone;
  rankScore: number;
};

type Insight = {
  id: string;
  title: string;
  body: string;
  tone: DriverTone;
};

const formatReviewCadence = (daysPerReview?: number | null): string => {
  if (!daysPerReview || !Number.isFinite(daysPerReview)) {
    return '.';
  }
  return ` (~1 review / ${Math.max(1, Math.round(daysPerReview))} days).`;
};

const formatRevenueTier = (value: number): string => {
  if (value >= 10000) return '$10k';
  if (value >= 6000) return '$6k';
  if (value >= 3000) return '$3k';
  if (value >= 1000) return '$1k';
  return '$1k';
};

const formatInsight = (driver: DriverCandidate, competitor: Competitor): Insight | null => {
  const reviewCount = typeof competitor.reviews === 'string'
    ? parseFloat(competitor.reviews)
    : (competitor.reviews || 0);
  const daysOnMarket = getDaysOnMarket(competitor);
  const daysPerReview = reviewCount > 0 && daysOnMarket && Number.isFinite(daysOnMarket)
    ? daysOnMarket / reviewCount
    : null;
  const ratingValue = typeof competitor.rating === 'string'
    ? parseFloat(competitor.rating)
    : competitor.rating;
  const revenueValue = competitor.monthlyRevenue !== undefined && competitor.monthlyRevenue !== null
    ? Number(competitor.monthlyRevenue) || 0
    : null;
  const bsrValue = competitor.bsr !== undefined && competitor.bsr !== null
    ? Number(competitor.bsr) || 0
    : null;
  const shareValue = competitor.marketShare !== undefined && competitor.marketShare !== null
    ? Number(competitor.marketShare) || 0
    : null;
  const fulfillment = normalizeFulfillmentLabel(competitor);

  switch (driver.id) {
    case 'reviewPace': {
      if (reviewCount === 0 && !daysPerReview) {
        return {
          id: driver.id,
          title: 'Slow review velocity',
          body: 'Weak traction — reviews are coming in slowly.',
          tone: 'bad'
        };
      }
      if (daysPerReview && daysPerReview <= 10) {
        return {
          id: driver.id,
          title: 'Fast review velocity',
          body: `Customers are buying and reviewing quickly${formatReviewCadence(daysPerReview)}`,
          tone: 'good'
        };
      }
      if (daysPerReview && daysPerReview > 20) {
        return {
          id: driver.id,
          title: 'Slow review velocity',
          body: `Weak traction — reviews are coming in slowly${formatReviewCadence(daysPerReview)}`,
          tone: 'bad'
        };
      }
      return {
        id: driver.id,
        title: 'Average review velocity',
        body: `This product is getting reviews at a normal pace${formatReviewCadence(daysPerReview)}`,
        tone: 'neutral'
      };
    }
    case 'starRating': {
      if (ratingValue === undefined || Number.isNaN(ratingValue)) return null;
      if (ratingValue >= 4.3) {
        return {
          id: driver.id,
          title: 'Strong customer satisfaction',
          body: 'High rating suggests customers are happy (looks like 4.5★).',
          tone: 'good'
        };
      }
      return {
        id: driver.id,
        title: 'Low customer satisfaction',
        body: 'Rating looks like 4★ or under — product may have issues.',
        tone: 'bad'
      };
    }
    case 'monthlyRevenue': {
      if (revenueValue === null) return null;
      if (revenueValue >= 6000) {
        return {
          id: driver.id,
          title: 'Strong demand',
          body: `Revenue indicates real buyer demand (>${formatRevenueTier(revenueValue)}/mo tier).`,
          tone: 'good'
        };
      }
      return {
        id: driver.id,
        title: 'Weak demand',
        body: `Low revenue suggests this competitor isn't converting well (<${formatRevenueTier(revenueValue)}/mo tier).`,
        tone: 'bad'
      };
    }
    case 'fulfillment': {
      if (fulfillment !== 'FBM' || revenueValue === null) return null;
      if (revenueValue < 2000) {
        return {
          id: driver.id,
          title: 'Not competing aggressively',
          body: 'FBM plus low revenue usually means a weak Prime position.',
          tone: 'bad'
        };
      }
      return {
        id: driver.id,
        title: 'Non-Prime but still selling',
        body: 'FBM listings can still be legitimate when demand is strong.',
        tone: 'neutral'
      };
    }
    case 'bsr': {
      if (!bsrValue) return null;
      if (bsrValue <= 20000) {
        return {
          id: driver.id,
          title: 'Consistent demand signal',
          body: 'BSR is strong vs the niche, indicating steady sales.',
          tone: 'good'
        };
      }
      return {
        id: driver.id,
        title: 'Weak demand signal',
        body: 'High BSR often indicates inconsistent sales.',
        tone: 'bad'
      };
    }
    case 'marketShare': {
      if (shareValue === null) return null;
      if (shareValue >= 15) {
        return {
          id: driver.id,
          title: 'Market leader presence',
          body: 'This competitor captures meaningful share — treat as a real threat.',
          tone: 'good'
        };
      }
      return {
        id: driver.id,
        title: 'Minimal presence',
        body: 'Tiny share suggests they’re not impacting the market.',
        tone: 'bad'
      };
    }
    default:
      return null;
  }
};

const buildCompetitorDrivers = (competitor: Competitor): DriverCandidate[] => {
  const candidates: DriverCandidate[] = [];
  const daysOnMarket = getDaysOnMarket(competitor);
  const reviewCount = typeof competitor.reviews === 'string'
    ? parseFloat(competitor.reviews)
    : (competitor.reviews || 0);

  if (daysOnMarket !== undefined && Number.isFinite(daysOnMarket)) {
    const daysPerReview = reviewCount > 0 ? daysOnMarket / reviewCount : Infinity;
    let tone: DriverTone = 'neutral';
    let interpretation = '(ok)';
    if (daysPerReview <= 10) {
      tone = 'good';
      interpretation = '(healthy)';
    } else if (daysPerReview > 20) {
      tone = 'bad';
      interpretation = '(slow)';
    }
    const valueText = reviewCount === 0
      ? 'No reviews yet'
      : `1 review / ${Math.round(daysPerReview)} days`;
    const rankScore = reviewCount === 0
      ? 20
      : daysPerReview > 20
        ? daysPerReview
        : Math.max(0, 30 - daysPerReview);
    candidates.push({
      id: 'reviewPace',
      label: 'Review pace',
      valueText: `${valueText} ${interpretation}`,
      tone,
      rankScore
    });
  } else if (reviewCount || reviewCount === 0) {
    candidates.push({
      id: 'reviewPace',
      label: 'Review pace',
      valueText: `${formatNumber(reviewCount)} reviews`,
      tone: 'neutral',
      rankScore: 2
    });
  }

  const ratingValue = typeof competitor.rating === 'string'
    ? parseFloat(competitor.rating)
    : competitor.rating;
  if (ratingValue !== undefined && !Number.isNaN(ratingValue)) {
    const looksLike = ratingValue >= 4.3 ? 'looks like 4.5★'
      : ratingValue >= 4.0 ? 'looks like 4★'
        : 'under 4★';
    const tone: DriverTone = ratingValue >= 4.3 ? 'good' : ratingValue >= 4.2 ? 'neutral' : 'bad';
    const rankScore = Math.abs(ratingValue - 4.2) * 10;
    candidates.push({
      id: 'starRating',
      label: 'Star rating',
      valueText: `${ratingValue.toFixed(1)} (${looksLike})`,
      tone,
      rankScore
    });
  }

  if (competitor.monthlyRevenue !== undefined && competitor.monthlyRevenue !== null) {
    const revenueValue = Number(competitor.monthlyRevenue) || 0;
    const tone: DriverTone = revenueValue >= 6000 ? 'good' : revenueValue >= 1000 ? 'neutral' : 'bad';
    const rankScore = revenueValue >= 6000
      ? (revenueValue - 6000) / 1000 + 5
      : revenueValue < 1000
        ? (1000 - revenueValue) / 500 + 5
        : 1;
    candidates.push({
      id: 'monthlyRevenue',
      label: 'Monthly revenue',
      valueText: `${formatCurrency(revenueValue)}/mo${revenueValue < 1000 ? ' (low)' : revenueValue >= 6000 ? ' (strong)' : ''}`,
      tone,
      rankScore
    });
  }

  if (competitor.monthlySales !== undefined && competitor.monthlySales !== null) {
    const salesValue = Number(competitor.monthlySales) || 0;
    const tone: DriverTone = salesValue >= 300 ? 'good' : salesValue >= 120 ? 'neutral' : 'bad';
    const rankScore = salesValue >= 300
      ? (salesValue - 300) / 100 + 4
      : salesValue < 120
        ? (120 - salesValue) / 40 + 4
        : 1;
    candidates.push({
      id: 'monthlySales',
      label: 'Monthly sales',
      valueText: `${formatNumber(salesValue)} units/mo`,
      tone,
      rankScore
    });
  }

  if (competitor.bsr !== undefined && competitor.bsr !== null && Number(competitor.bsr) > 0) {
    const bsrValue = Number(competitor.bsr) || 0;
    const tone: DriverTone = bsrValue <= 20000 ? 'good' : bsrValue <= 50000 ? 'neutral' : 'bad';
    const rankScore = bsrValue <= 20000
      ? (20000 - bsrValue) / 5000 + 3
      : bsrValue > 50000
        ? (bsrValue - 50000) / 10000 + 3
        : 1;
    candidates.push({
      id: 'bsr',
      label: 'BSR',
      valueText: `#${formatNumber(bsrValue)}`,
      tone,
      rankScore
    });
  }

  const fulfillment = normalizeFulfillmentLabel(competitor);
  if (fulfillment) {
    const revenueValue = Number(competitor.monthlyRevenue) || 0;
    const isFbm = fulfillment === 'FBM';
    const tone: DriverTone = fulfillment === 'Amazon' || fulfillment === 'FBA'
      ? 'good'
      : isFbm && revenueValue < 2000
        ? 'bad'
        : 'neutral';
    const valueText = fulfillment === 'Amazon'
      ? 'Amazon fulfilled'
      : fulfillment === 'FBA'
        ? 'Prime (FBA)'
        : fulfillment === 'FBM'
          ? 'FBM (non-Prime)'
          : 'Unknown';
    const rankScore = isFbm && revenueValue < 2000 ? 10 : fulfillment === 'Amazon' || fulfillment === 'FBA' ? 4 : 2;
    candidates.push({
      id: 'fulfillment',
      label: 'Fulfillment',
      valueText,
      tone,
      rankScore
    });
  }

  if (competitor.marketShare !== undefined && competitor.marketShare !== null) {
    const shareValue = Number(competitor.marketShare) || 0;
    const tone: DriverTone = shareValue >= 15 ? 'good' : shareValue >= 5 ? 'neutral' : 'bad';
    const rankScore = shareValue >= 15
      ? (shareValue - 15) / 5 + 3
      : shareValue < 5
        ? (5 - shareValue) + 3
        : 1;
    candidates.push({
      id: 'marketShare',
      label: 'Market share',
      valueText: `${shareValue.toFixed(2)}%`,
      tone,
      rankScore
    });
  }

  return candidates;
};

const CompetitorScorePopoverContent = ({
  competitor,
  scorePercent,
  strengthLabel,
  rowInsight,
  onClose
}: {
  competitor: Competitor;
  scorePercent: string;
  strengthLabel: string;
  rowInsight?: CompetitorRowInsight;
  onClose: () => void;
}) => {
  const driverCandidates = buildCompetitorDrivers(competitor);
  const sortedDrivers = [...driverCandidates].sort((a, b) => b.rankScore - a.rankScore);
  const insights = sortedDrivers
    .map((driver) => formatInsight(driver, competitor))
    .filter((insight): insight is Insight => Boolean(insight));

  const selectedInsights = (() => {
    let selected = insights.slice(0, 3);
    const hasTone = (tone: DriverTone) => selected.some((insight) => insight.tone === tone);

    if (strengthLabel === 'STRONG' && !hasTone('good')) {
      const positive = insights.find((insight) => insight.tone === 'good');
      if (positive) {
        selected = selected.length < 3
          ? [...selected, positive]
          : [...selected.slice(0, 2), positive];
      }
    }

    if (strengthLabel === 'WEAK' && !hasTone('bad')) {
      const negative = insights.find((insight) => insight.tone === 'bad');
      if (negative) {
        selected = selected.length < 3
          ? [...selected, negative]
          : [...selected.slice(0, 2), negative];
      }
    }

    const unique: Insight[] = [];
    const seen = new Set<string>();
    selected.forEach((insight) => {
      if (!seen.has(insight.id)) {
        unique.push(insight);
        seen.add(insight.id);
      }
    });

    return unique.slice(0, 3);
  })();

  const whatThisMeans = strengthLabel === 'STRONG'
    ? 'This competitor is a real threat - strong demand signals and solid customer trust.'
    : strengthLabel === 'DECENT'
      ? 'This competitor is legitimate, but not dominant - some strengths, some exploitable weaknesses.'
      : 'This competitor is not a major threat - weak demand signals or low traction.';

  const strengthPillClass = strengthLabel === 'STRONG'
    ? 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-700/40'
    : strengthLabel === 'DECENT'
      ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-700/40'
      : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-700/40';

  const scoreToneClass = strengthLabel === 'STRONG'
    ? 'text-red-600 dark:text-red-300'
    : strengthLabel === 'DECENT'
      ? 'text-amber-600 dark:text-amber-300'
      : 'text-emerald-600 dark:text-emerald-300';

  const duplicateInfo = rowInsight?.duplicateInfo;
  const duplicateRemovalLabel = duplicateInfo?.recommendedRemovalAsin
    ? (duplicateInfo.recommendedRemovalAsin === competitor.asin
        ? 'Recommended: remove this lower-revenue child ASIN.'
        : `Recommended: remove lower-revenue child ASIN ${duplicateInfo.recommendedRemovalAsin}.`)
    : '';

  const insightToneClasses = (tone: DriverTone) => {
    if (tone === 'good') {
      return {
        dot: 'bg-emerald-500',
        label: 'text-emerald-700 dark:text-emerald-300'
      };
    }
    if (tone === 'bad') {
      return {
        dot: 'bg-amber-500',
        label: 'text-amber-700 dark:text-amber-300'
      };
    }
    return {
      dot: 'bg-slate-400',
      label: 'text-slate-600 dark:text-slate-300'
    };
  };

  return (
    <div className="text-xs text-gray-600 dark:text-slate-400 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-gray-900 dark:text-white text-sm font-semibold">Competitor Insight Snapshot</h4>
          <div className="text-xs text-gray-600 dark:text-slate-400">Why this competitor is rated this way</div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300"
          aria-label="Close competitor insights"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Competitor score
          </div>
          <div className={`text-2xl font-semibold ${scoreToneClass}`}>{scorePercent}%</div>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${strengthPillClass}`}>
          {strengthLabel}
        </span>
      </div>

      {duplicateInfo && (
        <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-2 text-xs text-slate-600 dark:text-slate-300">
          <div className="font-semibold text-violet-600 dark:text-violet-300">Duplicate variation?</div>
          <div className="mt-1">
            Possible child variation of the same parent listing. Consider removing the weaker child ASIN.
          </div>
          {duplicateRemovalLabel && (
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {duplicateRemovalLabel}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
          Key insights
        </div>
        <div className="mt-2 space-y-2">
          {selectedInsights.map((insight) => {
            const toneClasses = insightToneClasses(insight.tone);
            return (
              <div key={insight.id} className="flex items-start gap-2">
                <span className={`mt-1 h-2 w-2 rounded-full ${toneClasses.dot}`} />
                <div className="text-xs text-gray-700 dark:text-slate-300">
                  <span className={`font-semibold ${toneClasses.label}`}>{insight.title}:</span> {insight.body}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
          What this means
        </div>
        <div className="mt-1 text-xs text-gray-600 dark:text-slate-400">
          {whatThisMeans}
        </div>
      </div>
    </div>
  );
};

// Add the CompetitorScoreDetails component definition
const CompetitorScoreDetails = ({
  score,
  competitor,
  rowInsight,
  toneClass
}: {
  score: string;
  competitor: Competitor;
  rowInsight?: CompetitorRowInsight;
  toneClass?: string;
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 60
  });
  
  if (!competitor) return null;
  const strengthLabel = getCompetitorStrength(parseFloat(score)).label;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;

    const padding = 12;
    const gap = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = triggerRect.bottom + gap;
    let left = triggerRect.left;

    if (left + popoverRect.width + padding > viewportWidth) {
      left = Math.max(padding, triggerRect.right - popoverRect.width);
    }
    if (left < padding) {
      left = padding;
    }

    if (top + popoverRect.height + padding > viewportHeight) {
      const aboveTop = triggerRect.top - popoverRect.height - gap;
      top = aboveTop >= padding ? aboveTop : Math.max(padding, viewportHeight - popoverRect.height - padding);
    }

    setPopoverStyle({
      position: 'fixed',
      top,
      left,
      zIndex: 60
    });
  }, []);

  useLayoutEffect(() => {
    if (!showDetails) return;
    updatePosition();
  }, [showDetails, updatePosition]);

  useEffect(() => {
    if (!showDetails) return;
    const handleUpdate = () => updatePosition();
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);
    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [showDetails, updatePosition]);

  useEffect(() => {
    if (!showDetails) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDetails(false);
      }
    };
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setShowDetails(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDetails]);

  return (
    <div className="inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setShowDetails((prev) => !prev)}
        className="inline-flex items-center gap-1 text-sm font-medium"
        aria-label="View competitor details"
        aria-haspopup="dialog"
        aria-expanded={showDetails}
      >
        <span className={toneClass || 'text-slate-200'}>{score}%</span>
        <Info className="w-3.5 h-3.5 text-slate-300/80" />
      </button>
      
      {showDetails && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              style={popoverStyle}
              className="w-80 max-h-[70vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-xl"
            >
              <CompetitorScorePopoverContent
                competitor={competitor}
                scorePercent={score}
                strengthLabel={strengthLabel}
                rowInsight={rowInsight}
                onClose={() => setShowDetails(false)}
              />
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

// Add a custom tooltip component for brand hover
const BrandTooltip = ({ title, isVisible, position }) => {
  if (!isVisible || !title) return null;
  
  return (
    <div 
      className="absolute z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3 shadow-xl max-w-md"
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y + 10}px`,
        transform: 'translateX(-50%)',
      }}
    >
      <p className="text-gray-700 dark:text-slate-300 text-sm">
        {title}
      </p>
    </div>
  );
};

export default ProductVettingResults;
