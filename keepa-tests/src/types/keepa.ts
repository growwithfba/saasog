// src/types/keepa.ts

export interface KeepaDataPoint {
    timestamp: number;
    value: number;
}

export interface BSRTrend {
    direction: 'up' | 'down' | 'stable';
    strength: number;
    confidence: number;
}

export interface BSRAnalysis {
    trend: BSRTrend;
    stability: number;
    volatility: number;
    details: BSRAnalysisDetails | null;
}

export interface BSRAnalysisDetails {
    threeMonth: BSRTimelineScore;
    sixMonth: BSRTimelineScore;
    twelveMonth: BSRTimelineScore;
    performanceSummary: string;
}

export interface BSRTimelineScore {
    score: number;
    timeInRanges: BSRTimelineScoreRanges;
    volatilityPenalty: number;
    finalScore: number;
}

export interface BSRTimelineScoreRanges {
    under10k: number;
    under25k: number;
    under50k: number;
    under100k: number;
    under250k: number;
    above250k: number;
}

export interface KeepaAnalysisResult {
    asin: string;
    status: 'complete' | 'loading' | 'error';
    productData: {
        title: string;
        bsr: KeepaDataPoint[];
        prices: KeepaDataPoint[];
        salesEstimates: KeepaDataPoint[];
    };
    analysis: KeepaProductAnalysis;
    error?: string;
}

export interface KeepaProductAnalysis {
    bsr: BSRAnalysis;
    price: {
        trend: {
            direction: string;
            strength: number;
        };
        stability: number;
        seasonality?: {
            detected: boolean;
            confidence: number;
        };
    };
    competitivePosition: CompetitivePosition;
}

export interface CompetitivePosition {
    score: number;
    factors: string[];
}

export interface KeepaConnectionResult {
    success: boolean;
    tokensLeft: number;
    message: string;
}