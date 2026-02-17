import { ChartDataPoint } from '../interfaces/ChartTypes';
import type {
  KeepaSignalsMarket,
  KeepaSignalsProduct,
  KeepaSignalsResponse
} from '@/lib/keepa/keepaSignals';
import type { NormalizedKeepaSnapshot } from '@/lib/keepa/normalize';
import type { KeepaComputedAnalysis } from '@/lib/keepa/compute';

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

export type KeepaAnalysisResult = KeepaSignalsProduct;

export type KeepaSignalsMarketSummary = KeepaSignalsMarket;

export type KeepaSignalsApiResponse = KeepaSignalsResponse;

export interface KeepaAnalysisSnapshot {
  productId: string;
  updatedAt: string;
  staleAfter: string | null;
  windowMonths: number;
  competitorsAsins: string[];
  normalized?: NormalizedKeepaSnapshot | null;
  computed: KeepaComputedAnalysis;
}

export interface KeepaAnalysisApiResponse {
  analysis: KeepaAnalysisSnapshot | null;
  stale?: boolean;
  cached?: boolean;
  error?: { code: string; message: string } | null;
}

export interface KeepaState {
  results: KeepaAnalysisResult[];
  status: 'idle' | 'loading' | 'complete' | 'error';
  error: string | null;
  selectedAsin: string | null;
} 