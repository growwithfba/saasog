import type { DerivedFilterInput } from './derivedFilters';
import type { DiscoveryFilters } from './types';

export interface DiscoveryPreset {
  id: string;
  name: string;
  description: string;
  filters: DiscoveryFilters;
  derived?: DerivedFilterInput;
}

/**
 * Thresholds come from the course, Module 02.4 "Winning Product Criteria":
 * price $20-70, BSR under 50,000, reviews under 1,000, 100+ units/month at
 * $5K-$15K revenue, and the bonus signal that 3-4 star competitors mean
 * unhappy customers and room to improve. Do not change these numbers
 * without changing the lesson.
 */
export const PRESETS: DiscoveryPreset[] = [
  {
    id: 'winning-product-criteria',
    name: 'Winning Product Criteria',
    description: '$20–$70 · BSR under 50k · under 1,000 reviews · 100+ units/mo at $5K–$15K',
    filters: {
      price: { min: 20, max: 70 },
      bsr: { min: 1, max: 50000 },
      reviewCount: { max: 1000 },
      monthlyUnits: { min: 100 },
    },
    derived: { revenueMin: 5000, revenueMax: 15000, priceMin: 20, priceMax: 70 },
  },
  {
    id: 'weak-competition',
    name: 'Weak Competition',
    description: 'Winning criteria, narrowed to markets where the competition is rated 3–4 stars',
    filters: {
      price: { min: 20, max: 70 },
      bsr: { min: 1, max: 50000 },
      reviewCount: { max: 1000 },
      monthlyUnits: { min: 100 },
      rating: { min: 3, max: 4 },
    },
    derived: { revenueMin: 5000, revenueMax: 15000, priceMin: 20, priceMax: 70 },
  },
  {
    id: 'coding',
    name: 'Coding',
    description:
      '$20–$30 · BSR under 50k · under 300 reviews · rated 4.2 or lower · 100–600 units/mo · single-variation · FBA or FBM',
    filters: {
      price: { min: 20, max: 30 },
      bsr: { max: 50000 },
      reviewCount: { max: 300 },
      // A ceiling, not a floor: the point is competitors customers are
      // unhappy with, which is the course's "bad ratings = gold" signal.
      rating: { max: 4.2 },
      monthlyUnits: { min: 100, max: 600 },
      // Single-variation listings only — no sprawling colour/size families.
      variationCount: { max: 1 },
      // Third-party sellers only; Amazon-sold listings are not an opening.
      fulfillment: ['FBA', 'FBM'],
    },
  },
  {
    id: 'low-review-openings',
    name: 'Low-Review Openings',
    description: '$20–$70 · BSR under 50k · under 200 reviews — room to rank',
    filters: {
      price: { min: 20, max: 70 },
      bsr: { min: 1, max: 50000 },
      reviewCount: { max: 200 },
    },
  },
];
