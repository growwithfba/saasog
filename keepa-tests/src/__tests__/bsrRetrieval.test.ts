// src/__tests__/bsrRetrieval.test.ts

import { describe, test, expect } from '@jest/globals';
import { processBSRData } from '../services/bsrProcessing';

const KEEPA_API_KEY = 'b041akkn9gb19isp49vlvpsqppslr9k2anq24mh0n41dstfgp6ve1tmq9ebhdnhj';
const KEEPA_BASE_URL = 'https://api.keepa.com';

interface BSRAnalysisResult {
    asin: string;
    title: string;
    mainCategory: string;
    bsr: {
        data: Array<{
            timestamp: number;
            date: string;
            rank: number;
        }>;
        stats: {
            current: number | null;
            min: number | null;
            max: number | null;
            median: number | null;
            average: number | null;
            volatility: number | null;
            trends: {
                segments: Array<{
                    period: string;
                    startDate: string;
                    endDate: string;
                    direction: 'up' | 'down' | 'stable';
                    changePercent: number;
                }>;
                overall: 'up' | 'down' | 'stable';
            };
            dataPoints: number;
            timeRange: {
                start: string | null;
                end: string | null;
                days: number;
            };
        } | null;
    };
}

async function fetchBSRData(asin: string): Promise<BSRAnalysisResult> {
    try {
        const url = `${KEEPA_BASE_URL}/product?key=${KEEPA_API_KEY}&domain=1&asin=${asin}&stats=525600`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        const product = data.products[0];

        // Get the main category ID
        const mainCategoryId = product.salesRankReference.toString();

        console.log('Product Info:', {
            asin: product.asin,
            title: product.title,
            mainCategoryId,
            hasMainCategoryData: !!product.salesRanks?.[mainCategoryId]
        });

        // Get BSR data for main category
        const bsrData = processBSRData(product.salesRanks[mainCategoryId]);
        
        return {
            asin: product.asin,
            title: product.title,
            mainCategory: mainCategoryId,
            bsr: bsrData
        };
    } catch (error) {
        console.error('Error fetching BSR data:', error);
        throw error;
    }
}

describe('BSR Data Retrieval', () => {
    test('Can fetch and analyze main category BSR data', async () => {
        const asin = 'B0009KF59M';
        const result = await fetchBSRData(asin);

        console.log('BSR Analysis Results:', {
            title: result.title,
            mainCategory: result.mainCategory,
            dataPoints: result.bsr.data.length,
            currentRank: result.bsr.stats?.current,
            volatility: result.bsr.stats?.volatility,
            trends: result.bsr.stats?.trends,
            timeRange: result.bsr.stats?.timeRange
        });

        // Verify data quality
        expect(result.bsr.data.length).toBeGreaterThan(0);
        expect(result.bsr.stats?.current).toBeGreaterThan(0);
        expect(result.bsr.stats?.timeRange.days).toBeLessThanOrEqual(730); // Updated to match new 2-year default
        expect(result.bsr.stats?.volatility).toBeDefined();
    });
});