import { ChartDataPoint } from '../Results/interfaces/ChartTypes';

export interface KeepaAnalysisProps {
  asins: string[];
  onAnalysisComplete?: (results: KeepaAnalysisResult[]) => void;
  onError?: (error: string) => void;
}

export interface KeepaDataPoint extends ChartDataPoint {
  timestamp: number;
  value: number;
}

export interface ProductData {
  title: string;
  bsr: KeepaDataPoint[];
  prices: KeepaDataPoint[];
  salesEstimates: KeepaDataPoint[];
}

export interface KeepaAnalysisResult {
  asin: string;
  productData: ProductData;
  analysis: {
    bsr: {
      trend: {
        direction: 'up' | 'down' | 'stable';
        strength: number;
        confidence: number;
      };
      stability: number;
      volatility: number;
      details: any | null;
    };
    price: {
      trend: {
        direction: 'up' | 'down' | 'stable';
        strength: number;
      };
      stability: number;
    };
    competitivePosition: {
      score: number;
      factors: string[];
    };
  };
  status: 'loading' | 'complete' | 'error';
  error?: string;
}

export interface KeepaState {
  results: KeepaAnalysisResult[];
  status: 'idle' | 'loading' | 'complete' | 'error';
  error: string | null;
  selectedAsin: string | null;
} 