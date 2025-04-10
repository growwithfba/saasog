export interface CompetitorMetrics {
  columns: {
    bsrMetrics: {
      title: 'BSR Analysis';
      subColumns: {
        score: number;
        trend: string;
        confidence: string;
      }
    };
    priceMetrics: {
      title: 'Price Analysis';
      subColumns: {
        stability: number;
        seasonal: boolean;
        riskLevel: string;
      }
    }
  }
}

export interface Competitor {
  asin: string;
  title: string;
  monthlyUnits: number;
  bsrMetrics?: {
    score: number;
    trend: string;
    confidence: string;
  };
  priceMetrics?: {
    stability: number;
    seasonal: boolean;
    riskLevel: string;
  };
} 