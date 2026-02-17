/**
 * Utility function to determine color classes for product metrics based on thresholds
 * Returns color classes for text, icon, and optional border
 */

export type MetricType = 
  | 'price' 
  | 'monthlyRevenue' 
  | 'monthlySales' 
  | 'rating' 
  | 'bsr' 
  | 'listingAge'
  | 'competitorRank'
  | 'competitorScore'
  | 'marketShare'
  | 'reviewShare'
  | 'marketCap'
  | 'totalCompetitors'
  | 'revenuePerCompetitor'
  | 'averageReviews'
  | 'averageRating'
  | 'averageListingAge'
  | 'chinaSellers';

export interface MetricColorResult {
  text: string;      // Color class for primary value text
  icon: string;      // Color class for icon
  border?: string;   // Optional border color class
}

/**
 * Get color classes for a metric based on its type and value
 * 
 * @param metricType - Type of metric (price, monthlyRevenue, etc.)
 * @param value - Numeric value of the metric (null/undefined for N/A)
 * @returns Color classes for text, icon, and optional border
 */
export function getMetricColor(metricType: MetricType, value: number | null | undefined): MetricColorResult {
  // Handle null/undefined values - return neutral color
  if (value === null || value === undefined || isNaN(value)) {
    return {
      text: 'text-slate-400',
      icon: 'text-slate-400',
    };
  }

  switch (metricType) {
    case 'price':
      // Always neutral blue
      return {
        text: 'text-blue-400',
        icon: 'text-blue-400',
      };

    case 'monthlyRevenue':
      // Red if < $1,000, Yellow if $1,000-$5,000, Green if > $5,000
      if (value < 1000) {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      } else if (value >= 1000 && value <= 5000) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      }

    case 'monthlySales':
      // Red if < 30 units, Yellow if 30-100 units, Green if > 100 units
      if (value < 30) {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      } else if (value >= 30 && value <= 100) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      }

    case 'rating':
      // Red if < 4.0, Yellow if 4.0-4.4, Green if >= 4.5
      if (value < 4.0) {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      } else if (value >= 4.0 && value < 4.5) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      }

    case 'bsr':
      // Lower is better: Green if < 20,000, Yellow if 20,000-80,000, Red if > 80,000
      if (value < 20000) {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      } else if (value >= 20000 && value <= 80000) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      }

    case 'listingAge':
      // Green if < 6 months, Yellow if 6-18 months, Red if > 18 months
      if (value < 6) {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      } else if (value >= 6 && value <= 18) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      }

    case 'competitorRank':
      // Lower rank is better: Green if rank 1-3, Yellow if 4-10, Red if > 10
      if (value <= 3) {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      } else if (value <= 10) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      }

    case 'competitorScore':
      // Higher score is worse (competitor strength): Red if >= 60, Yellow if 45-60, Green if < 45
      if (value >= 60) {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      } else if (value >= 45) {
        return {
          text: 'text-amber-400',
          icon: 'text-amber-400',
        };
      } else {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      }

    case 'marketShare':
      // Higher share is better: Green if > 20%, Yellow if 10-20%, Red if < 10%
      if (value > 20) {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      } else if (value >= 10) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      }

    case 'reviewShare':
      // Higher share is better: Green if > 20%, Yellow if 10-20%, Red if < 10%
      if (value > 20) {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      } else if (value >= 10) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      }

    case 'marketCap':
      // Higher is better: Green if >= $100k, Blue if $50k-$100k, Yellow if $20k-$50k, Red if < $20k
      if (value >= 100000) {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      } else if (value >= 50000) {
        return {
          text: 'text-blue-400',
          icon: 'text-blue-400',
        };
      } else if (value >= 20000) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      }

    case 'totalCompetitors':
      // Lower is better: Green if < 10, Yellow if 10-20, Red if > 20
      if (value < 10) {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      } else if (value <= 20) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      }

    case 'revenuePerCompetitor':
      // Higher is better: Green if >= $12k, Yellow if $8k-$12k, Blue if $5k-$8k, Amber if $4k-$5k, Red if < $4k
      if (value >= 12000) {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      } else if (value >= 8000) {
        return {
          text: 'text-green-400',
          icon: 'text-green-400',
        };
      } else if (value >= 5000) {
        return {
          text: 'text-blue-400',
          icon: 'text-blue-400',
        };
      } else if (value >= 4000) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else if (value >= 3000) {
        return {
          text: 'text-amber-400',
          icon: 'text-amber-400',
        };
      } else {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      }

    case 'averageReviews':
      // Lower is better (less competition): Green if < 300, Yellow if 300-1000, Red if > 1000
      if (value < 300) {
        return {
          text: 'text-green-400',
          icon: 'text-green-400',
        };
      } else if (value <= 1000) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      }

    case 'averageRating':
      // Lower is better (less competition): Green if < 4.1, Yellow if 4.1-4.7, Red if >= 4.7
      if (value < 4.1) {
        return {
          text: 'text-green-400',
          icon: 'text-green-400',
        };
      } else if (value < 4.7) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      }

    case 'averageListingAge':
      // Higher is better (mature market): Green if >= 24 months, Yellow if 12-24 months, Red if < 12 months
      if (value >= 24) {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      } else if (value >= 12) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      }

    case 'chinaSellers':
      // Lower is better: Green if < 30%, Yellow if 30-60%, Red if > 60%
      if (value < 30) {
        return {
          text: 'text-emerald-400',
          icon: 'text-emerald-400',
        };
      } else if (value <= 60) {
        return {
          text: 'text-yellow-400',
          icon: 'text-yellow-400',
        };
      } else {
        return {
          text: 'text-red-400',
          icon: 'text-red-400',
        };
      }

    default:
      return {
        text: 'text-slate-400',
        icon: 'text-slate-400',
      };
  }
}

