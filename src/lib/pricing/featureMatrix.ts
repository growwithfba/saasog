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
    group: 'AI Analysis',
    rows: [
      {
        feature: 'AI Market Analyses per month',
        description: 'Deep AI breakdown of any Amazon product — demand, competition, pricing, and a clear go/no-go score',
        values: { core: '25', pro: 'Unlimited' },
      },
      {
        feature: 'AI Unique Selling Points per month',
        description: 'Auto-generated USPs for your product listing — bullet points, hooks, and angles to outperform competitors',
        values: { core: '15', pro: 'Unlimited' },
      },
      {
        feature: 'AI scoring across 18+ Amazon categories',
        description: 'Scoring tuned to the rules of each category, not one generic formula',
        values: { core: true, pro: true },
      },
      {
        feature: '30-day demand & competition trends',
        description: 'See how a product market is trending over the past month — not just a single-day snapshot',
        values: { core: true, pro: true },
      },
      {
        feature: 'Refine analysis with additional competitors',
        description: "Add more competitor products to any analysis and BloomEngine will recalculate the score in place",
        values: { core: true, pro: true },
      },
    ],
  },
  {
    group: 'Chrome Extension (BloomLens)',
    rows: [
      {
        feature: 'Score any Amazon product with one click',
        description: 'Browse Amazon normally — BloomLens shows a calibrated score on every product so you know what to dig into',
        values: { core: 'Unlimited', pro: 'Unlimited' },
      },
      {
        feature: 'Save winning products to your dashboard',
        description: 'One-click save from the extension into your BloomEngine account for deeper analysis',
        values: { core: true, pro: true },
      },
    ],
  },
  {
    group: 'Sourcing & Profit Modeling',
    rows: [
      {
        feature: 'Supplier quote tracking',
        description: 'Track quotes from manufacturers (DDP, FOB, landed cost) so you always know your real margins',
        values: { core: '10 active', pro: 'Unlimited' },
      },
      {
        feature: 'Profit calculator with charm pricing',
        description: 'Model your Value / Competitive / Premium pricing tiers with one click',
        values: { core: true, pro: true },
      },
      {
        feature: 'Custom PO PDF generation',
        description: 'Manufacturer-ready purchase orders branded to your business',
        values: { core: '5 / month', pro: 'Unlimited' },
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
        feature: 'Email support',
        values: { core: true, pro: true },
      },
      {
        feature: 'Priority support response',
        description: 'Faster reply times via support@bloomengine.ai',
        values: { core: false, pro: true },
      },
    ],
  },
];
