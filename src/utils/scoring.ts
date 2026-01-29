// Remove the problematic import and define the interfaces locally
// import { HistoricalData, AnalysisResult, TrendResult } from '../components/Keepa/KeepaTypes';

// Types for historical data
interface HistoricalData {
  timestamps: number[];
  values: number[];
}

interface AnalysisResult {
  score: number | null;
  warning: string | null;
}

interface TrendResult {
  trend: number | null;
  warning: string | null;
}

const isDev = process.env.NODE_ENV !== 'production';

// Updated MetricScoring based on V4 formulas
export const MetricScoring = {
  price: (value: number): number => {
    if (value < 20 || value > 75) return 1;
    return 10;
  },
  bsr: (value: number): number => {
    if (value < 1000) return 10;
    if (value <= 5000) return 9;
    if (value <= 10000) return 8;
    if (value <= 20000) return 7;
    if (value <= 30000) return 6;
    if (value <= 50000) return 5;
    if (value <= 75000) return 4;
    if (value <= 100000) return 3;
    if (value <= 150000) return 2;
    return 1;
  },
  monthlySales: (value: number): number => {
    if (value <= 30) return 1;
    if (value <= 60) return 2;
    if (value <= 120) return 3;
    if (value <= 180) return 4;
    if (value <= 240) return 5;
    if (value <= 300) return 6;
    if (value <= 400) return 7;
    if (value <= 500) return 8;
    if (value <= 600) return 9;
    return 10;
  },
  monthlyRevenue: (value: number): number => {
    if (value >= 10000) return 10;
    if (value >= 9000) return 9;
    if (value >= 7500) return 8;
    if (value >= 6000) return 7;
    if (value >= 5000) return 6;
    if (value >= 4000) return 5;
    if (value >= 3000) return 4;
    if (value >= 2500) return 3;
    if (value >= 1000) return 2;
    return 1;
  },
  rating: (value: number): number => {
    if (value >= 4.8) return 10;
    if (value >= 4.6) return 9;
    if (value >= 4.5) return 8;
    if (value >= 4.3) return 7;
    if (value >= 4.2) return 5;
    if (value >= 4.0) return 4;
    if (value >= 3.8) return 3;
    return value >= 3.6 ? 2 : 1;
  },
  reviews: (value: number): number => {
    if (value === 0) return 1;
    if (value < 10) return 2;
    if (value < 50) return 3;
    if (value < 100) return 4;
    if (value < 200) return 5;
    if (value < 300) return 6;
    if (value < 400) return 7;
    if (value < 500) return 8;
    return 10;
  },
  reviewVelocity: (daysOnMarket: number, reviews: number): number => {
    const safeDays = Math.max(daysOnMarket, 1);
    const daysPerReview = reviews > 0 ? safeDays / reviews : Infinity;
    if (daysPerReview <= 10) return 10;
    if (daysPerReview <= 15) return 7;
    if (daysPerReview <= 20) return 5;
    if (daysPerReview <= 30) return 2;
    return 1;
  },
  fulfillment: (value: string, monthlyRevenue?: number): number => {
    if (value === "FBA") return 8;
    if (value === "Amazon") return 10;
    if (value === "FBM") {
      if (monthlyRevenue !== undefined && monthlyRevenue >= 2000) return 6;
      return 2;
    }
    return 0;
  }
};

// Updated weight distribution based on new model - V5 with revenue focus
export const ScoringWeights = {
  // Core metrics (60%)
  monthlyRevenue: 0.25, // Increased from 0.15
  monthlySales: 0.15, // Decreased from 0.20
  bsr: 0.10, // Decreased from 0.13
  marketShare: 0.15, // Unchanged
  reviews: 0.15, // Decreased from 0.18
  reviewShare: 0.10, // Decreased from 0.13
  rating: 0.10, // Decreased from 0.13
  fulfilledBy: 0.08, // Unchanged
  price: 0.08, // Decreased from 0.10
  
  // Stability & quality metrics (40%)
  bsrConsistency: 0.20, // Decreased from 0.22
  priceConsistency: 0.12, // Decreased from 0.14
  revenuePerCompetitor: 0.15, // NEW direct weighting
  listingAge: 0.04 // Unchanged
};

/**
 * Calculates BSR Stability based on the last 12 months of data.
 */
export function calculateBSRStability(bsrHistory: number[], timestamps: number[]): AnalysisResult {
    if (bsrHistory.length < 12) {
        return { score: null, warning: "Insufficient BSR data (less than 12 months)." };
    }
    
    const lastYearBSR = bsrHistory.slice(-12);
    const meanBSR = lastYearBSR.reduce((a, b) => a + b, 0) / lastYearBSR.length;
    const stdDev = Math.sqrt(lastYearBSR.map(x => (x - meanBSR) ** 2).reduce((a, b) => a + b, 0) / lastYearBSR.length);
    
    return { score: Math.max(0, 1 - (stdDev / meanBSR)), warning: null };
}

/**
 * Calculates BSR Trend percentage change over the last 12 months.
 */
export function calculateBSRTrend(bsrHistory: any[]): TrendResult {
  if (!bsrHistory?.length || bsrHistory.length < 2) {
    return { trend: null, warning: "Insufficient BSR data" };
  }
  
  const cleanHistory = bsrHistory
    .filter(point => point?.value != null)
    .map(point => point.value);
    
  if (cleanHistory.length < 2) {
    return { trend: null, warning: "Invalid BSR data points" };
  }

  const firstBSR = cleanHistory[0];
  const lastBSR = cleanHistory[cleanHistory.length - 1];
  
  return { 
    trend: ((firstBSR - lastBSR) / firstBSR) * 100, 
    warning: null 
  };
}

/**
 * Calculates Price Stability based on the last 12 months of data.
 */
export function calculatePriceStability(priceHistory: any[]): AnalysisResult {
  if (!priceHistory?.length) {
    return { score: null, warning: "No price data available" };
  }

  const prices = priceHistory
    .filter(point => point?.value != null)
    .map(point => point.value);
  
  if (prices.length < 2) {
    return { score: null, warning: "Insufficient price data points" };
  }

  const meanPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const stdDev = Math.sqrt(
    prices.map(x => Math.pow(x - meanPrice, 2))
          .reduce((a, b) => a + b, 0) / prices.length
  );
  
  return { 
    score: Math.max(0, 1 - (stdDev / meanPrice)), 
    warning: null 
  };
}

/**
 * Calculates Price Trend percentage change over the last 12 months.
 */
export function calculatePriceTrend(priceHistory: number[], timestamps: number[]): TrendResult {
    if (priceHistory.length < 12) {
        return { trend: null, warning: "Insufficient Price data (less than 12 months)." };
    }
    
    const firstPrice = priceHistory[priceHistory.length - 12];
    const lastPrice = priceHistory[priceHistory.length - 1];
    
    return { trend: ((firstPrice - lastPrice) / firstPrice) * 100, warning: null };
}

// Helper functions for basic metric scoring using V4 formulas
const getMetricScore = (metric: string, value: number | null): number => {
  switch(metric) {
    case 'price':
      return MetricScoring.price(value as number);
    case 'bsr':
      return MetricScoring.bsr(value as number);
    case 'monthlySales':
      return MetricScoring.monthlySales(value as number);
    case 'monthlyRevenue':
      return MetricScoring.monthlyRevenue(value as number);
    case 'rating':
      return MetricScoring.rating(value as number);
    case 'reviews':
      return MetricScoring.reviews(value as number);
    default:
      return 0;
  }
};

export const getStabilityCategory = (stability: number): string => {
  if (!stability && stability !== 0) return 'Unknown';
  const score = stability * 100;
  
  if (score >= 80) return 'Very Stable';
  if (score >= 60) return 'Moderate';
  if (score >= 40) return 'Somewhat Stable';
  if (score >= 20) return 'Unstable';
  return 'Poor';
};

export const qualityScore = (quality: 'Exceptional' | 'Decent' | 'Poor' | 'No A+'): number => {
  switch (quality) {
    case 'Exceptional': return 1;
    case 'Decent': return 0.6;
    case 'Poor': return 0.2;
    case 'No A+': return 0;
    default: return 0;
  }
};

const normalizeReviews = (reviews: string | number): number => {
  const reviewCount = safeParseNumber(reviews);
  if (reviewCount >= 1000) return 1;
  if (reviewCount >= 500) return 0.8;
  if (reviewCount >= 100) return 0.6;
  if (reviewCount >= 50) return 0.4;
  return 0.2;
};

const normalizeRevenue = (revenue: string | number): number => {
  const revenueValue = safeParseNumber(revenue);
  if (revenueValue >= 20000) return 1.0;
  if (revenueValue >= 10000) return 0.8;
  if (revenueValue >= 5000) return 0.6;
  if (revenueValue >= 1000) return 0.4;
  return 0.2;
};

// New helper functions for added metrics
const normalizeMarketShare = (share: number | string): number => {
  const shareValue = safeParseNumber(share);
  if (shareValue >= 50) return 1.0;
  if (shareValue >= 30) return 0.8;
  if (shareValue >= 15) return 0.6;
  if (shareValue >= 5) return 0.4;
  return 0.2;
};

const normalizeReviewShare = (share: number | string): number => {
  const shareValue = safeParseNumber(share);
  if (shareValue >= 50) return 1.0;
  if (shareValue >= 30) return 0.8;
  if (shareValue >= 15) return 0.6;
  if (shareValue >= 5) return 0.4;
  return 0.2;
};

const normalizeListingAge = (dateStr?: string): number => {
  if (!dateStr) return 0.2;
  
  const date = new Date(dateStr);
  const now = new Date();
  const ageInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (ageInDays >= 730) return 1.0; // 2+ years
  if (ageInDays >= 365) return 0.8; // 1-2 years
  if (ageInDays >= 180) return 0.6; // 6mo-1yr
  if (ageInDays >= 90) return 0.4;  // 3-6mo
  return 0.2; // <3mo
};

export const getDaysOnMarket = (competitor: any): number | undefined => {
  if (!competitor?.dateFirstAvailable) return undefined;
  const parsedDate = new Date(competitor.dateFirstAvailable);
  if (Number.isNaN(parsedDate.getTime())) return undefined;
  const now = new Date();
  const diffMs = now.getTime() - parsedDate.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
};

/**
 * Get fulfillment score based on method
 */
export const getFulfillmentScore = (method: string): number => {
  const normalizedMethod = method?.toLowerCase() || '';
  if (normalizedMethod.includes('fba')) return 1.0; // FBA is best
  if (normalizedMethod.includes('amazon')) return 0.8; // Amazon fulfillment
  if (normalizedMethod.includes('fbm')) return 0.6; // FBM
  return 0.4; // Unknown or other
};

/**
 * Helper function to normalize price trends
 */
export const normalizePriceTrend = (trend: any): number => {
  if (!trend) return 0;
  
  const { direction, strength } = trend;
  const baseImpact = strength || 0.5;
  
  // Stable prices are good
  if (direction === 'stable') return baseImpact;
  
  // Small upward trends (increased prices) are good for sellers
  if (direction === 'up') return baseImpact * 0.8;
  
  // Downward trends (decreasing prices) are concerning
  return baseImpact * 0.4;
};

/**
 * Helper function to normalize BSR trends
 */
const normalizeTrendImpact = (trend: any): number => {
  if (!trend) return 0;
  
  const { direction, strength, confidence } = trend;
  const baseImpact = (strength || 0.5) * (confidence || 0.8);
  
  switch (direction) {
    case 'up':
      return baseImpact * 0.5; // Penalize upward BSR trend
    case 'down':
      return baseImpact; // Reward downward BSR trend
    case 'stable':
      return baseImpact * 0.75; // Moderate reward for stability
    default:
      return 0;
  }
};

/**
 * Calculate individual competitor score using the V4 methodology with custom weights
 * Each metric is scored from 1-10 points based on predefined ranges
 * Then a weighting factor is applied based on importance
 */
export const calculateScore = (competitor: any, keepaData?: any) => {
  // Skip scoring if no competitor data
  if (!competitor) return "0.00";
  
  // Define weighting factors based on impact levels
  const weights = {
    // HIGHEST IMPACT
    monthlySales: 2.0,
    reviews: 1.8,
    
    // MEDIUM IMPACT
    marketShare: 1.5,
    monthlyRevenue: 1.5,
    bsr: 1.3,
    rating: 1.3,
    reviewShare: 1.3,
    
    // LOWEST IMPACT
    price: 1.0,
    fulfillment: 0.8
  };

  let weightedPoints = 0;
  let totalWeightPossible = 0;
  
  // Price score (1-10 points)
  const priceScore = MetricScoring.price(safeParseNumber(competitor.price || 0));
  weightedPoints += priceScore * weights.price;
  totalWeightPossible += 10 * weights.price;
  
  // BSR score (1-10 points)
  const bsrScore = MetricScoring.bsr(safeParseNumber(competitor.bsr || 999999));
  weightedPoints += bsrScore * weights.bsr;
  totalWeightPossible += 10 * weights.bsr;
  
  // Monthly sales score (1-10 points)
  const salesScore = MetricScoring.monthlySales(safeParseNumber(competitor.monthlySales || 0));
  weightedPoints += salesScore * weights.monthlySales;
  totalWeightPossible += 10 * weights.monthlySales;
  
  // Monthly revenue score (1-10 points)
  const revenueScore = MetricScoring.monthlyRevenue(safeParseNumber(competitor.monthlyRevenue || 0));
  weightedPoints += revenueScore * weights.monthlyRevenue;
  totalWeightPossible += 10 * weights.monthlyRevenue;
  
  // Rating score (1-10 points)
  const ratingScore = MetricScoring.rating(safeParseNumber(competitor.rating || 0));
  weightedPoints += ratingScore * weights.rating;
  totalWeightPossible += 10 * weights.rating;
  
  // Review velocity score (1-10 points)
  const daysOnMarket = getDaysOnMarket(competitor);
  const reviewCount = safeParseNumber(competitor.reviews || 0);
  const reviewsScore = daysOnMarket !== undefined
    ? MetricScoring.reviewVelocity(daysOnMarket, reviewCount)
    : MetricScoring.reviews(reviewCount);
  weightedPoints += reviewsScore * weights.reviews;
  totalWeightPossible += 10 * weights.reviews;
  
  // Market share (if available)
  if (competitor.marketShare !== undefined && competitor.marketShare !== null) {
    // Score market share on a scale of 1-10
    const marketShareValue = safeParseNumber(competitor.marketShare || 0);
    const marketShareScore = Math.min(10, Math.max(1, Math.ceil(marketShareValue / 3)));
    weightedPoints += marketShareScore * weights.marketShare;
    totalWeightPossible += 10 * weights.marketShare;
  }
  
  // Review share (if available)
  if (competitor.reviewShare !== undefined && competitor.reviewShare !== null) {
    // Score review share on a scale of 1-10
    const reviewShareValue = safeParseNumber(competitor.reviewShare || 0);
    const reviewShareScore = Math.min(10, Math.max(1, Math.ceil(reviewShareValue / 3)));
    weightedPoints += reviewShareScore * weights.reviewShare;
    totalWeightPossible += 10 * weights.reviewShare;
  }
  
  // Fulfillment score (0-10 points)
  const fulfillmentMethod = 
    (competitor.fulfillment || competitor.fulfillmentMethod || competitor.fulfilledBy || '').toString();
  const fulfillmentScore = MetricScoring.fulfillment(
    fulfillmentMethod,
    safeParseNumber(competitor.monthlyRevenue || 0)
  );
  weightedPoints += fulfillmentScore * weights.fulfillment;
  totalWeightPossible += 10 * weights.fulfillment;
  
  // Calculate percentage score (adjust for any skipped metrics)
  const percentageScore = (weightedPoints / totalWeightPossible) * 100;
  
  return percentageScore.toFixed(2);
};

/**
 * Get competitor strength rating based on V4 scoring thresholds
 * 
 * Score calculation breakdown:
 * Each metric is scored from 1-10 points based on predefined ranges
 * - Price (1-10 points)
 * - BSR (1-10 points)
 * - Monthly Sales (1-10 points)
 * - Monthly Revenue (1-10 points)
 * - Rating (1-10 points)
 * - Review Velocity (1-10 points)
 * - Fulfillment Method (0-10 points)
 * 
 * The total score is calculated as a percentage of possible points.
 * 
 * Strength thresholds:
 * - STRONG: Score ≥ 60% - Indicates a well-established competitor with strong market presence
 * - DECENT: Score ≥ 45% - Indicates a moderately competitive product
 * - WEAK: Score < 45% - Indicates a competitor with limited market presence or new entry
 */
export const getCompetitorStrength = (score: number): {
  label: 'STRONG' | 'DECENT' | 'WEAK';
  color: string;
} => {
  if (score >= 60) {
    return { label: 'STRONG', color: 'red' };
  } else if (score >= 45) {
    return { label: 'DECENT', color: 'yellow' };
  } else {
    return { label: 'WEAK', color: 'green' };
  }
};

/**
 * Helper to safely parse a number from a potential string or number value
 */
export const safeParseNumber = (value: string | number | undefined): number => {
  if (typeof value === 'undefined') return 0;
  if (typeof value === 'number') return value;
  return parseFloat(value) || 0;
};

/**
 * Get competition level assessment for the market
 */
export const getCompetitionLevel = (competitors: any[]): {
  level: 'LOW' | 'MODERATE' | 'HIGH' | 'SATURATED';
  color: string;
} => {
  const totalCompetitors = competitors.length;
  const totalReviews = competitors.reduce((sum, comp) => sum + safeParseNumber(comp.reviews), 0);
  
  // Use safe method to find top competitor reviews
  const topCompetitorReviews = competitors.length === 0 ? 0 : 
    Math.max(...competitors.map(comp => safeParseNumber(comp.reviews)));
  
  // Define saturation thresholds
  if (totalCompetitors > 30 || 
      totalReviews > 10000 || 
      topCompetitorReviews > 5000) {
    return { level: 'SATURATED', color: 'red' };
  } else if (totalCompetitors > 20 || totalReviews > 5000) {
    return { level: 'HIGH', color: 'red' };
  } else if (totalCompetitors > 15 || totalReviews > 2000) {
    return { level: 'MODERATE', color: 'yellow' };
  } else {
    return { level: 'LOW', color: 'green' };
  }
};

/**
 * Helper function to extract ASIN from hyperlink or direct ASIN
 */
export const extractAsin = (hyperlink: string): string => {
  if (!hyperlink) return '';
  const match = hyperlink.match(/dp\/([A-Z0-9]{10})/);
  return match ? match[1] : hyperlink.slice(0, 10); // Fallback to first 10 chars
};

/**
 * Calculate market maturity based on competitor ages
 */
export const calculateMarketMaturity = (competitors: any[]): number => {
  const competitorsWithDates = competitors.filter(comp => comp.dateFirstAvailable);
  if (!competitorsWithDates.length) return 50; // Default to middle score
  
  const calculateAge = (dateStr: string): number => {
    if (!dateStr) return 0;
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30)); // Age in months
  };
  
  const ages = competitorsWithDates.map(comp => calculateAge(comp.dateFirstAvailable));
  
  // Count competitors in each age category
  const mature = ages.filter(age => age > 18).length;
  const established = ages.filter(age => age > 12 && age <= 18).length;
  const growing = ages.filter(age => age > 6 && age <= 12).length;
  const newProducts = ages.filter(age => age <= 6).length;
  
  // Calculate weighted score (higher = more mature market)
  const totalProducts = competitorsWithDates.length;
  const weightedScore = (
    (mature / totalProducts) * 100 +
    (established / totalProducts) * 70 +
    (growing / totalProducts) * 40 +
    (newProducts / totalProducts) * 10
  );
  
  return weightedScore;
};

/**
 * Calculate comprehensive market score with market-level modifiers
 */
export const calculateMarketScore = (competitors: any[], keepaResults: any[]): { score: number; status: 'PASS' | 'RISKY' | 'FAIL' } => {
  if (isDev) {
    console.log('Market Score Calculation Debug:', {
      competitorCount: competitors.length,
      keepaResultsCount: keepaResults.length,
      hasKeepaData: keepaResults.length > 0
    });
  }

  // 1. Check auto-fail conditions first
  if (competitors.length > 35) {
    // Auto-fail: excessive competition
    const baseScore = calculateBaseMarketScore(competitors, keepaResults);
    if (isDev) {
      console.log('Auto-fail: Too many competitors (>35)');
    }
    return { score: Math.min(39, baseScore), status: 'FAIL' };
  }

  // Get top 5 competitors by monthly sales
  const top5Competitors = [...competitors]
    .sort((a, b) => safeParseNumber(b.monthlySales) - safeParseNumber(a.monthlySales))
    .slice(0, 5);

  // Calculate average BSR and price stability for top 5 competitors only
  const avgBSRStability = calculateTopCompetitorStability(top5Competitors, keepaResults, 'bsr');
  const avgPriceStability = calculateTopCompetitorStability(top5Competitors, keepaResults, 'price');
  
  if (isDev) {
    console.log('Stability Analysis:', {
      avgBSRStability,
      avgPriceStability,
      bsrFailThreshold: 0.3,
      priceFailThreshold: 0.35
    });
  }
  
  // Auto-fail: BSR volatility > 70% - BUT only if we have Keepa data
  if (keepaResults.length > 0 && avgBSRStability < 0.3) {
    const baseScore = calculateBaseMarketScore(competitors, keepaResults);
    if (isDev) {
      console.log('Auto-fail: BSR too volatile (<0.3 stability)');
    }
    return { score: Math.min(39, baseScore), status: 'FAIL' };
  }
  
  // Auto-fail: Price volatility > 65% - BUT only if we have Keepa data
  if (keepaResults.length > 0 && avgPriceStability < 0.35) {
    const baseScore = calculateBaseMarketScore(competitors, keepaResults);
    if (isDev) {
      console.log('Auto-fail: Price too volatile (<0.35 stability)');
    }
    return { score: Math.min(39, baseScore), status: 'FAIL' };
  }

  // 2. Calculate base score from competitor data
  let marketScore = calculateBaseMarketScore(competitors, keepaResults);
  
  // 3. Apply market-level modifiers
  
  // 3a. Revenue per Competitor modifier - ENHANCED
  const avgRevenue = competitors.reduce((sum, comp) => sum + safeParseNumber(comp.monthlyRevenue), 0) / 
    (competitors.length || 1);
  
  // Enhanced revenue bonus structure
  let revenueModifier = 0;
  if (avgRevenue >= 12000) {
    revenueModifier = 15; // Increased bonus for excellent revenue
  } else if (avgRevenue >= 8000) {
    revenueModifier = 10; // Good bonus for very good revenue
  } else if (avgRevenue >= 5000) {
    revenueModifier = 5; // Small bonus for decent revenue
  } else if (avgRevenue < 3000) {
    revenueModifier = -10; // Significant penalty for very low revenue
  } else if (avgRevenue < 4000) {
    revenueModifier = -5; // Moderate penalty for low revenue
  }
  
  marketScore += revenueModifier;
  
  if (isDev) {
    console.log('Revenue Modifier:', {
      avgRevenue: avgRevenue.toFixed(2),
      modifier: revenueModifier
    });
  }
  
  // 3b. Competitor count modifier - ENHANCED
  if (competitors.length <= 10) {
    marketScore += 15; // Great market with few competitors
  } else if (competitors.length <= 15) {
    marketScore += 8; // Decent market with moderate competition
  } else if (competitors.length <= 20) {
    marketScore += 0; // Neutral - no bonus
  } else if (competitors.length <= 30) {
    marketScore -= 5; // Reduced penalty - was too harsh at -8
  }
  // 30+ competitors is already an auto-fail
  
  if (isDev) {
    console.log('Competitor Count Modifier:', {
      competitorCount: competitors.length,
      modifier: competitors.length <= 10 ? 15 : 
                competitors.length <= 15 ? 8 :
                competitors.length <= 20 ? 0 : -5
    });
  }
  
  // 3c. Market maturity modifier
  const maturityScore = calculateMarketMaturity(competitors);
  marketScore += (maturityScore - 50) * 0.05; // 5% impact from market maturity (centered at 50)
  
  // 3d. Market concentration (dominant player) modifier
  const marketShares = competitors.map(comp => safeParseNumber(comp.marketShare) || 0);
  const maxMarketShare = Math.max(...marketShares);
  if (maxMarketShare > 60) {
    marketScore -= 15; // Severe penalty for dominant market leader
  } else if (maxMarketShare > 40) {
    marketScore -= 5; // Moderate penalty for strong market leader
  }
  
  // 4. BSR Trend penalty
  const bsrTrends = keepaResults
    .map(result => result?.analysis?.bsr?.trend)
    .filter(trend => trend?.direction === 'up' && trend?.strength > 0.5);
  
  if (bsrTrends.length > keepaResults.length / 2) {
    marketScore -= 15; // Penalty for majority upward BSR trend (worse ranking)
  }
  
  // 5. Determine final score and status
  const finalScore = Math.max(0, Math.min(100, marketScore));
  const status = finalScore >= 70 ? 'PASS' : finalScore >= 40 ? 'RISKY' : 'FAIL';
  
  if (isDev) {
    console.log('Final Market Score Calculation:', {
      baseScore: calculateBaseMarketScore(competitors, keepaResults),
      avgRevenue: competitors.reduce((sum, comp) => sum + safeParseNumber(comp.monthlyRevenue), 0) / (competitors.length || 1),
      competitorCount: competitors.length,
      rawMarketScore: marketScore,
      finalScore,
      status
    });
  }
  
  return { score: finalScore, status };
};

/**
 * Helper function to calculate the average stability (BSR or price) 
 * for the top competitors only
 */
function calculateTopCompetitorStability(
  topCompetitors: any[], 
  keepaResults: any[], 
  metricType: 'bsr' | 'price'
): number {
  const stabilityScores = topCompetitors
    .map(comp => {
      const keepaData = keepaResults?.find(k => k.asin === extractAsin(comp.asin));
      const stability = keepaData?.analysis?.[metricType]?.stability || 0.5;
      return stability;
    });
  
  const avgStability = stabilityScores.reduce((sum, score) => sum + score, 0) / 
    (stabilityScores.length || 1);
    
  if (isDev) {
    console.log(`${metricType} Stability Calculation:`, {
      topCompetitors: topCompetitors.length,
      keepaResults: keepaResults.length,
      stabilityScores,
      avgStability
    });
  }
    
  return avgStability;
}

/**
 * Helper function to calculate the base market score
 * from individual competitor scores
 */
function calculateBaseMarketScore(competitors: any[], keepaResults: any[]): number {
  const competitorScores = competitors.map((competitor) => {
    const keepaData = keepaResults?.find(k => k.asin === extractAsin(competitor.asin));
    const score = parseFloat(calculateScore(competitor, keepaData));
    return score;
  });
  
  // Calculate revenue per competitor impact directly
  const avgRevenue = competitors.reduce((sum, comp) => sum + safeParseNumber(comp.monthlyRevenue), 0) / 
    (competitors.length || 1);
  
  // Revenue per competitor score (0-10)
  const revenuePerCompScore = Math.min(10, Math.max(1, avgRevenue / 1500));
  
  // Add direct revenue per competitor impact (15% weight)
  const baseScore = competitorScores.reduce((sum, score) => sum + score, 0) / 
    (competitorScores.length || 1);
  
  // Apply the revenue per competitor influence
  const finalBaseScore = (baseScore * 0.85) + (revenuePerCompScore * ScoringWeights.revenuePerCompetitor * 10);
  
  if (isDev) {
    console.log('Base Score Calculation Debug:', {
      competitorScores: competitorScores.slice(0, 5), // Show first 5
      avgCompetitorScore: baseScore,
      avgRevenue,
      revenuePerCompScore,
      revenueWeight: ScoringWeights.revenuePerCompetitor,
      finalBaseScore
    });
  }
  
  return finalBaseScore;
}