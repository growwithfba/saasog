// src/services/bsrProcessing.ts

interface ProcessedDataPoint {
    timestamp: number;
    date: string;
    rank: number;
}

interface TimeRanges {
    under10k: number;
    under25k: number;
    under50k: number;
    under100k: number;
    under250k: number;
    above250k: number;
}

interface BSRStats {
    current: number | null;
    min: number | null;
    max: number | null;
    median: number | null;
    average: number | null;
    volatility: number | null;
    trends: TrendAnalysis;
    dataPoints: number;
    timeRange: {
        start: string | null;
        end: string | null;
        days: number;
    };
}

interface TrendAnalysis {
    segments: TrendSegment[];
    overall: 'up' | 'down' | 'stable';
}

interface TrendSegment {
    period: string;
    startDate: string;
    endDate: string;
    direction: 'up' | 'down' | 'stable';
    changePercent: number;
}

interface ProcessingOptions {
    timeRange?: number;
    smoothing?: boolean;
    minDataPoints?: number;
}

interface ProcessedBSRData {
    data: ProcessedDataPoint[];
    stats: BSRStats | null;
}

const KEEPA_EPOCH = new Date('2011-01-01').getTime();

export function processBSRData(
    rankData: number[], 
    options: ProcessingOptions = {}
): ProcessedBSRData {
    const {
        timeRange = 730, // Default to 2 years of data
        smoothing = true,
        minDataPoints = 10
    } = options;

    if (!Array.isArray(rankData) || rankData.length < minDataPoints) {
        console.warn('Insufficient BSR data points:', {
            received: rankData?.length || 0,
            minimum: minDataPoints
        });
        return { data: [], stats: null };
    }

    const processedData: ProcessedDataPoint[] = [];
    const now = Date.now();
    const cutoffDate = now - (timeRange * 24 * 60 * 60 * 1000);

    // Debug raw data
    console.log('Processing BSR Data:', {
        totalPoints: rankData.length / 2,
        samplePoints: rankData.slice(0, 10),
        timeRange: {
            now: new Date(now).toISOString(),
            cutoff: new Date(cutoffDate).toISOString()
        }
    });

    // Process timestamp-rank pairs
    for (let i = 0; i < rankData.length; i += 2) {
        const keepaMinutes = rankData[i];
        const rank = rankData[i + 1];
        
        // Skip invalid or missing data points
        if (!keepaMinutes || rank === undefined || rank === -1) {
            continue;
        }

        // Convert Keepa minutes to timestamp
        const timestamp = KEEPA_EPOCH + (keepaMinutes * 60 * 1000);
        
        if (timestamp >= cutoffDate) {
            processedData.push({
                timestamp,
                date: new Date(timestamp).toISOString(),
                rank
            });
        }
    }

    // Sort chronologically
    processedData.sort((a, b) => a.timestamp - b.timestamp);

    // Apply optional smoothing to reduce noise
    const finalData = smoothing ? smoothData(processedData) : processedData;

    // Calculate statistics
    const stats = calculateStats(finalData);

    return {
        data: finalData,
        stats
    };
}

function smoothData(data: ProcessedDataPoint[], windowSize: number = 5): ProcessedDataPoint[] {
    if (data.length < windowSize) {
        return data;
    }

    return data.map((point, index) => {
        if (index < windowSize - 1 || index > data.length - windowSize) {
            return point;
        }

        const window = data.slice(index - (windowSize - 1), index + 1);
        const avgRank = window.reduce((sum, p) => sum + p.rank, 0) / window.length;

        return {
            ...point,
            rank: Math.round(avgRank)
        };
    });
}

function calculateStats(data: ProcessedDataPoint[]): BSRStats {
    if (!data.length) {
        return {
            current: null,
            min: null,
            max: null,
            median: null,
            average: null,
            volatility: null,
            trends: { segments: [], overall: 'stable' },
            dataPoints: 0,
            timeRange: { 
                start: null, 
                end: null, 
                days: 0 
            }
        };
    }

    const ranks = data.map(d => d.rank);
    const sorted = [...ranks].sort((a, b) => a - b);

    // Calculate trend analysis
    const trendAnalysis = analyzeTrend(data);

    // Calculate volatility
    const volatility = calculateVolatility(ranks);

    return {
        current: ranks[ranks.length - 1],
        min: sorted[0],
        max: sorted[sorted.length - 1],
        median: sorted[Math.floor(sorted.length / 2)],
        average: Math.round(ranks.reduce((a, b) => a + b) / ranks.length),
        volatility,
        trends: trendAnalysis,
        dataPoints: data.length,
        timeRange: {
            start: data[0].date,
            end: data[data.length - 1].date,
            days: Math.round((data[data.length - 1].timestamp - data[0].timestamp) / (1000 * 60 * 60 * 24))
        }
    };
}

function analyzeTrend(data: ProcessedDataPoint[]): TrendAnalysis {
    const segments = Math.min(4, Math.floor(data.length / 30)); // Split into up to 4 segments
    const segmentSize = Math.floor(data.length / segments);
    
    const trends: TrendSegment[] = [];
    
    for (let i = 0; i < segments; i++) {
        const start = i * segmentSize;
        const end = i === segments - 1 ? data.length : (i + 1) * segmentSize;
        const segment = data.slice(start, end);
        
        const firstAvg = segment.slice(0, 5).reduce((sum, p) => sum + p.rank, 0) / 5;
        const lastAvg = segment.slice(-5).reduce((sum, p) => sum + p.rank, 0) / 5;
        
        const change = ((lastAvg - firstAvg) / firstAvg) * 100;
        
        trends.push({
            period: `Q${i + 1}`,
            startDate: segment[0].date,
            endDate: segment[segment.length - 1].date,
            direction: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
            changePercent: Math.round(change)
        });
    }
    
    return {
        segments: trends,
        overall: trends[trends.length - 1].direction
    };
}

function calculateVolatility(ranks: number[]): number {
    if (ranks.length < 2) return 0;
    
    const mean = ranks.reduce((sum, val) => sum + val, 0) / ranks.length;
    const squaredDiffs = ranks.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / ranks.length;
    const stdDev = Math.sqrt(variance);
    
    // Return coefficient of variation (standardized measure of dispersion)
    return Math.round((stdDev / mean) * 100) / 100;
}

export default {
    processBSRData,
    smoothData,
    calculateStats,
    analyzeTrend,
    calculateVolatility
};