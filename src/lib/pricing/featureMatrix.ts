import type { Tier } from '@/lib/subscription/tiers';

export type MatrixValue = string | boolean;

export interface FeatureMatrixRow {
  feature: string;
  description?: string;
  values: Record<Tier, MatrixValue>;
}

export interface FeatureMatrixGroup {
  group: string;
  rows: FeatureMatrixRow[];
}

export const FEATURE_MATRIX: FeatureMatrixGroup[] = [
  {
    group: 'Research & Vetting',
    rows: [
      {
        feature: 'Product vettings per month',
        description: 'Full Market Climate + AI scoring analysis on a single ASIN',
        values: { core: '25', pro: 'Unlimited' },
      },
      {
        feature: 'SSP (Source-Sell-Profit) generations per month',
        description: 'Offer-ready spec sheets with manufacturer briefs and unit-economics modeling',
        values: { core: '15', pro: 'Unlimited' },
      },
      {
        feature: 'Calibrated AI scoring',
        description: 'Category-tuned scoring engine across 18+ Amazon categories',
        values: { core: true, pro: true },
      },
      {
        feature: 'Market Climate analysis',
        description: 'BSR stability, price stability, competitor depth, structure breakdown',
        values: { core: true, pro: true },
      },
      {
        feature: 'Market Expansions',
        description: 'Add competitors after initial vetting and recalc score in-place',
        values: { core: true, pro: true },
      },
      {
        feature: 'Multi-point BSR sampling',
        description: 'Rolling 30-day BSR averages instead of single-snapshot reads',
        values: { core: true, pro: true },
      },
    ],
  },
  {
    group: 'Chrome Extension (BloomLens)',
    rows: [
      {
        feature: 'In-context Amazon SERP scanning',
        description: 'Score every search result without leaving the page',
        values: { core: 'Unlimited', pro: 'Unlimited' },
      },
      {
        feature: 'Save markets directly to your funnel',
        description: 'One-click handoff from extension to your BloomEngine dashboard',
        values: { core: true, pro: true },
      },
      {
        feature: 'Analyze Market handoff',
        description: 'Open any BloomLens market in the full web app for deep analysis',
        values: { core: true, pro: true },
      },
    ],
  },
  {
    group: 'Sourcing & Offer',
    rows: [
      {
        feature: 'Supplier quote tracking',
        description: 'Track DDP, FOB, and landed-cost quotes per ASIN over time',
        values: { core: 'Unlimited', pro: 'Unlimited' },
      },
      {
        feature: 'Profit Matrix calculator',
        description: 'Charm-priced Value / Competitive / Premium tier modeling',
        values: { core: true, pro: true },
      },
      {
        feature: 'PO PDF generation',
        description: 'Manufacturer-ready purchase orders with custom branding',
        values: { core: true, pro: true },
      },
    ],
  },
  {
    group: 'Support & Account',
    rows: [
      {
        feature: '7-day free trial',
        values: { core: true, pro: true },
      },
      {
        feature: 'Cancel anytime',
        values: { core: true, pro: true },
      },
      {
        feature: 'Switch tiers (prorated)',
        values: { core: true, pro: true },
      },
      {
        feature: 'Priority support',
        description: 'Faster response times via support@bloomengine.ai',
        values: { core: false, pro: true },
      },
    ],
  },
];
