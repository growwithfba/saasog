// src/services/keepaService.ts

import {
    KeepaConnectionResult,
    KeepaDataPoint,
    BSRTrend,
    BSRAnalysis,
    KeepaAnalysisResult,
    BSRAnalysisDetails,
    CompetitivePosition,
    BSRTimelineScore,
    BSRTimelineScoreRanges
} from '../types/keepa';

class KeepaService {
    private readonly KEEPA_API_KEY = process.env.KEEPA_API_KEY || 'b041akkn9gb19isp49vlvpsqppslr9k2anq24mh0n41dstfgp6ve1tmq9ebhdnhj';
    private readonly KEEPA_BASE_URL = 'https://api.keepa.com';
    private readonly KEEPA_EPOCH = new Date('2011-01-01').getTime();

    async testConnection(): Promise<KeepaConnectionResult> {
        try {
            console.log('Starting Keepa connection test...'); // Debug log 1
            
            const response = await fetch(`${this.KEEPA_BASE_URL}/token?key=${this.KEEPA_API_KEY}`);
            console.log('Response status:', response.status); // Debug log 2
            
            if (!response.ok) {
                console.log('Response not OK:', response.status, response.statusText); // Debug log 3
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Keepa API Response:', data); // Debug log 4
            
            const tokensLeft = data.tokensLeft || 0;
            console.log('Tokens remaining:', tokensLeft); // Debug log 5
            
            return {
                success: tokensLeft > 0,
                tokensLeft,
                message: `Available tokens: ${tokensLeft}`
            };
        } catch (error) {
            console.error('Token check error details:', error); // Debug log 6
            throw new Error('Failed to verify Keepa API access');
        }
    }

    async getCompetitorData(asins: string[]): Promise<KeepaAnalysisResult[]> {
        console.log('Received ASINs:', asins);
        
        if (!asins?.length) {
            throw new Error('No valid ASINs provided');
        }
        
        try {
            // Clean ASINs and validate
            const validAsins = asins
                .map(asin => asin.replace(/[^A-Z0-9]/g, ''))
                .filter(asin => asin.length === 10);
                
            console.log('Validated ASINs:', validAsins);

            if (!validAsins.length) {
                throw new Error('No valid ASINs provided');
            }

            // Build the URL with proper parameters
            const url = `${this.KEEPA_BASE_URL}/product?key=${this.KEEPA_API_KEY}&domain=1&asin=${validAsins.join(',')}&stats=180`;
            console.log('Requesting URL:', url);

            const response = await fetch(url);
            console.log('Response status:', response.status);
            
            if (!response.ok) {
                let errorText = '';
                try {
                    // Some errors return JSON
                    const errorData = await response.json();
                    errorText = JSON.stringify(errorData);
                } catch {
                    // Others might be plain text
                    errorText = await response.text?.() || `Status: ${response.status}`;
                }
                console.error('Error response details:', errorText);
                throw new Error(`Keepa API error: ${response.status}\nDetails: ${errorText}`);
            }

            const data = await response.json();
            console.log('API Response Data:', JSON.stringify(data, null, 2));

            if (!data.products?.length) {
                throw new Error('No product data received');
            }

            return this.transformKeepaData(data.products);
        } catch (error) {
            console.error('Keepa analysis error:', error);
            throw error;
        }
    }

    private normalizeTimeSeries(data: number[]): KeepaDataPoint[] {
        if (!data?.length) return [];
        
        const points: KeepaDataPoint[] = [];
        
        for (let i = 0; i < data.length; i += 2) {
            const timestamp = data[i];
            const value = data[i + 1];
            
            if (timestamp > 0 && value > 0) {
                points.push({
                    timestamp: this.KEEPA_EPOCH + (timestamp * 60000),
                    value
                });
            }
        }
        
        return points;
    }

    private calculateVolatility(values: number[]): number {
        if (values.length < 2) return 0;
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        
        // Return coefficient of variation (standardized measure of dispersion)
        return Math.min(stdDev / mean, 1);
    }

    private calculateTrend(values: number[]): BSRTrend {
        if (values.length < 2) {
            return {
                direction: 'stable',
                strength: 0,
                confidence: 0
            };
        }

        const first = values.slice(0, Math.floor(values.length / 2));
        const second = values.slice(Math.floor(values.length / 2));

        const avgFirst = first.reduce((sum, val) => sum + val, 0) / first.length;
        const avgSecond = second.reduce((sum, val) => sum + val, 0) / second.length;

        const change = (avgSecond - avgFirst) / avgFirst;
        const strength = Math.min(Math.abs(change), 1);

        return {
            direction: change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'stable',
            strength,
            confidence: 0.8
        };
    }

    private calculateBSRTimelineScore(history: KeepaDataPoint[]): BSRTimelineScore {
        if (history.length < 10) {
            return {
                score: 0,
                timeInRanges: {
                    under10k: 0,
                    under25k: 0,
                    under50k: 0,
                    under100k: 0,
                    under250k: 0,
                    above250k: 0
                },
                volatilityPenalty: 0,
                finalScore: 0
            };
        }

        // Calculate time in different ranges
        const times = {
            under10k: 0,
            under25k: 0,
            under50k: 0,
            under100k: 0,
            under250k: 0,
            above250k: 0
        };
        let totalTime = 0;

        const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);

        for (let i = 1; i < sortedHistory.length; i++) {
            const timeDiff = Math.max(0, sortedHistory[i].timestamp - sortedHistory[i-1].timestamp);
            if (timeDiff > 30 * 24 * 60 * 60 * 1000) continue; // Skip gaps > 30 days
            
            const avgBSR = (sortedHistory[i].value + sortedHistory[i-1].value) / 2;

            if (avgBSR < 10000) times.under10k += timeDiff;
            else if (avgBSR < 25000) times.under25k += timeDiff;
            else if (avgBSR < 50000) times.under50k += timeDiff;
            else if (avgBSR < 100000) times.under100k += timeDiff;
            else if (avgBSR < 250000) times.under250k += timeDiff;
            else times.above250k += timeDiff;

            totalTime += timeDiff;
        }

        // Convert to percentages
        const timeInRanges = {
            under10k: (times.under10k / totalTime) * 100,
            under25k: (times.under25k / totalTime) * 100,
            under50k: (times.under50k / totalTime) * 100,
            under100k: (times.under100k / totalTime) * 100,
            under250k: (times.under250k / totalTime) * 100,
            above250k: (times.above250k / totalTime) * 100
        };

        // Calculate base score
        let score = 0;
        score += Math.min(timeInRanges.under10k, 100) * 0.9;  // Up to 90 points
        score += Math.min(timeInRanges.under25k, 100) * 0.75; // Up to 75 points
        score += Math.min(timeInRanges.under50k, 100) * 0.6;  // Up to 60 points

        // Apply penalties
        score -= timeInRanges.under100k * 0.2;   // Moderate penalty
        score -= timeInRanges.under250k * 0.4;   // Heavy penalty
        score -= timeInRanges.above250k * 0.6;   // Severe penalty

        // Calculate volatility penalty
        const volatilityPenalty = this.calculateVolatilityPenalty(sortedHistory);

        return {
            score: Math.max(0, Math.min(100, score)),
            timeInRanges,
            volatilityPenalty,
            finalScore: Math.max(0, Math.min(100, score - volatilityPenalty))
        };
    }

    private calculateVolatilityPenalty(history: KeepaDataPoint[]): number {
        let largeSwings = 0;
        
        for (let i = 1; i < history.length; i++) {
            const percentChange = Math.abs(
                (history[i].value - history[i-1].value) / history[i-1].value
            );
            if (percentChange > 0.5) largeSwings++;
        }

        return Math.min(10, largeSwings * 2);
    }

    private transformKeepaData(products: any[]): KeepaAnalysisResult[] {
        return products.map(product => {
            // Extract time series data
            const bsrHistory = this.normalizeTimeSeries(product.csv?.[3]);
            const priceHistory = this.normalizeTimeSeries(product.csv?.[0]);
            const salesHistory = this.normalizeTimeSeries(product.csv?.[11]);

            // Calculate analyses
            const bsrAnalysis = this.analyzeBSRTrend(bsrHistory);
            const priceAnalysis = this.analyzePriceTrend(priceHistory);
            const competitiveAnalysis = this.analyzeCompetitivePosition(product, bsrHistory);

            return {
                asin: product.asin,
                status: 'complete',
                productData: {
                    title: product.title,
                    bsr: bsrHistory,
                    prices: priceHistory,
                    salesEstimates: salesHistory
                },
                analysis: {
                    bsr: bsrAnalysis,
                    price: priceAnalysis,
                    competitivePosition: competitiveAnalysis
                }
            };
        });
    }

    private analyzeBSRTrend(history: KeepaDataPoint[]): BSRAnalysis {
        if (history.length < 2) {
            return {
                trend: { direction: 'stable', strength: 0, confidence: 0 },
                stability: 0,
                volatility: 1,
                details: null
            };
        }

        const now = Date.now();
        const threeMonthsAgo = now - (90 * 24 * 60 * 60 * 1000);
        const sixMonthsAgo = now - (180 * 24 * 60 * 60 * 1000);
        const twelveMonthsAgo = now - (365 * 24 * 60 * 60 * 1000);

        // Calculate scores for different time periods
        const threeMonthData = history.filter(p => p.timestamp >= threeMonthsAgo);
        const sixMonthData = history.filter(p => p.timestamp >= sixMonthsAgo);
        const twelveMonthData = history.filter(p => p.timestamp >= twelveMonthsAgo);

        const details = {
            threeMonth: this.calculateBSRTimelineScore(threeMonthData),
            sixMonth: this.calculateBSRTimelineScore(sixMonthData),
            twelveMonth: this.calculateBSRTimelineScore(twelveMonthData),
            performanceSummary: 'Inconsistent' // Will be updated
        };

        // Update performance summary
        details.performanceSummary = this.getPerformanceSummary(details);

        const values = history.map(point => point.value);
        const trend = this.calculateTrend(values);
        const volatility = this.calculateVolatility(values);

        return {
            trend,
            stability: 1 - volatility,
            volatility,
            details
        };
    }

    private analyzePriceTrend(history: KeepaDataPoint[]) {
        if (history.length < 2) {
            return {
                trend: {
                    direction: 'stable',
                    strength: 0
                },
                stability: 1
            };
        }

        const values = history.map(point => point.value);
        const trend = this.calculateTrend(values);
        const volatility = this.calculateVolatility(values);

        return {
            trend: {
                direction: trend.direction,
                strength: trend.strength
            },
            stability: 1 - volatility
        };
    }

    private analyzeCompetitivePosition(product: any, bsrHistory: KeepaDataPoint[]): CompetitivePosition {
        const avgBSR = bsrHistory.reduce((sum, point) => sum + point.value, 0) / bsrHistory.length;
        const score = Math.max(1, Math.min(10, 10 - Math.log10(avgBSR)));

        return {
            score,
            factors: [
                `Average BSR: ${Math.round(avgBSR).toLocaleString()}`,
                `Score based on BSR performance`
            ]
        };
    }

    private getPerformanceSummary(analysis: BSRAnalysisDetails): string {
        const recent = analysis.threeMonth.finalScore;
        const mid = analysis.sixMonth.finalScore;
        const long = analysis.twelveMonth.finalScore;
        
        if (recent >= 90 && mid >= 85 && long >= 80) return 'Exceptional';
        if (recent >= 80 && mid >= 75 && long >= 70) return 'Highly Consistent';
        if (recent >= 70 && mid >= 65 && long >= 60) return 'Consistent';
        if (recent >= 60 && mid >= 55 && long >= 50) return 'Moderately Consistent';
        if (recent >= 50 && mid >= 45 && long >= 40) return 'Inconsistent';
        if (recent < 40 || mid < 35 || long < 30) return 'Highly Volatile';
        if (recent < long && mid < long) return 'Declining';
        return 'Extremely Volatile';
    }

    getStabilityDetails(stabilityScore: number): { category: string; color: string } {
        const score = stabilityScore * 100; // Convert to percentage
        
        if (score >= 90) return { 
            category: 'Exceptionally Stable',
            color: 'text-emerald-500'
        };
        if (score >= 75) return { 
            category: 'Very Stable',
            color: 'text-green-500'
        };
        if (score >= 60) return { 
            category: 'Moderately Stable',
            color: 'text-yellow-500'
        };
        if (score >= 40) return { 
            category: 'Somewhat Volatile',
            color: 'text-orange-500'
        };
        return { 
            category: 'Highly Volatile',
            color: 'text-red-500'
        };
    }
}

// Export a singleton instance
export const keepaService = new KeepaService();