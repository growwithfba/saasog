// src/__tests__/keepaService.test.ts
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { keepaService } from '../services/keepaService';
import { mockKeepaResponse } from '../__mocks__/keepaApiMock';
import { KeepaAnalysisResult } from '../types/keepa';

describe('Keepa Service Tests', () => {
    beforeEach(() => {
        jest.spyOn(global, 'fetch').mockImplementation(() => 
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    tokensLeft: 300,  // Match your actual token count
                    token: 300,       // Some Keepa responses include this
                    status: true
                })
            } as Response)
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Connection Tests', () => {
        it('successfully tests connection', async () => {
            const result = await keepaService.testConnection();
            expect(result.success).toBe(true);
            expect(result.tokensLeft).toBeGreaterThan(0);
            expect(result.message).toContain('Available tokens');
        });

        it('handles connection errors gracefully', async () => {
            jest.spyOn(global, 'fetch').mockImplementationOnce(() => 
                Promise.reject(new Error('Network error'))
            );
            await expect(keepaService.testConnection())
                .rejects.toThrow('Failed to verify Keepa API access');
        });
    });

    describe('BSR Analysis Tests', () => {
        beforeEach(() => {
            // Reset mock for product data tests
            jest.spyOn(global, 'fetch').mockImplementation(() => 
                Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        tokensLeft: 300,
                        products: [{
                            asin: 'B0009KF59M',
                            title: 'Test Product',
                            csv: {
                                0: [1, 100, 2, 200], // Price data
                                3: [1, 1000, 2, 2000], // BSR data
                                11: [1, 50, 2, 100] // Sales data
                            },
                            categories: [3375251],
                            categoryTree: [2972638011, 3375251],
                            manufacturer: 'Test Brand'
                        }]
                    })
                } as Response)
            );
        });

        it('correctly analyzes BSR trends', async () => {
            const asins = ['B0009KF59M'];
            const results = await keepaService.getCompetitorData(asins);
            
            expect(results).toHaveLength(1);
            expect(results[0].asin).toBe('B0009KF59M');
            
            const bsrAnalysis = results[0].analysis.bsr;
            expect(bsrAnalysis.stability).toBeDefined();
            expect(bsrAnalysis.volatility).toBeDefined();
            expect(bsrAnalysis.trend.direction).toMatch(/^(up|down|stable)$/);
        });

        it('handles missing BSR data appropriately', async () => {
            jest.spyOn(global, 'fetch').mockImplementationOnce(() => 
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ...mockKeepaResponse,
                        products: [{
                            ...mockKeepaResponse.products[0],
                            csv: { 3: [] }
                        }]
                    })
                } as unknown as Response)
            );
            
            const asins = ['B0009KF59M'];
            const results = await keepaService.getCompetitorData(asins);
            
            expect(results[0].analysis.bsr.stability).toBe(0);
            expect(results[0].analysis.bsr.volatility).toBe(1);
            expect(results[0].analysis.bsr.trend.direction).toBe('stable');
        });
    });

    describe('Competitive Analysis Tests', () => {
        beforeEach(() => {
            jest.spyOn(global, 'fetch').mockImplementation(() => 
                Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        products: [{
                            asin: 'B0009KF59M',
                            title: 'Test Product',
                            salesRankReference: '3375251',
                            salesRanks: {
                                '3375251': [Date.now(), 15000] // Simple BSR data
                            },
                            csv: {
                                3: [Date.now(), 15000], // BSR data
                                0: [Date.now(), 19.99]  // Price data
                            },
                            categories: [3375251],
                            categoryTree: [2972638011, 3375251],
                            manufacturer: 'Test Brand'
                        }]
                    })
                } as Response)
            );
        });

        it('calculates competitive position correctly', async () => {
            console.log('Testing with ASIN:', 'B0009KF59M');
            const results = await keepaService.getCompetitorData(['B0009KF59M']);
            console.log('Received results:', JSON.stringify(results, null, 2));
            
            expect(results).toHaveLength(1);
            
            const competitivePosition = results[0].analysis.competitivePosition;
            console.log('Competitive position:', JSON.stringify(competitivePosition, null, 2));
            
            expect(competitivePosition).toBeDefined();
            expect(competitivePosition.score).toBeGreaterThanOrEqual(1);
            expect(competitivePosition.score).toBeLessThanOrEqual(10);
            expect(competitivePosition.factors).toHaveLength(2);
        });
    });

    describe('Error Handling Tests', () => {
        it('handles invalid ASINs', async () => {
            const invalidAsins = ['INVALID'];
            await expect(keepaService.getCompetitorData(invalidAsins))
                .rejects.toThrow('No valid ASINs provided');
        });

        it('handles API errors', async () => {
            jest.spyOn(global, 'fetch').mockImplementationOnce(() => 
                Promise.resolve({
                    ok: false,
                    status: 403,
                    json: () => Promise.resolve({})
                } as unknown as Response)
            );

            const asins = ['B0009KF59M'];
            await expect(keepaService.getCompetitorData(asins))
                .rejects.toThrow('Keepa API error: 403');
        });
    });

    describe('Stability Score Tests', () => {
        it('categorizes stability scores correctly', () => {
            const testCases = [
                { score: 0.95, expected: 'Exceptionally Stable' },
                { score: 0.80, expected: 'Very Stable' },
                { score: 0.65, expected: 'Moderately Stable' },
                { score: 0.45, expected: 'Somewhat Volatile' },
                { score: 0.20, expected: 'Highly Volatile' }
            ];

            testCases.forEach(({ score, expected }) => {
                const result = keepaService.getStabilityDetails(score);
                expect(result.category).toBe(expected);
            });
        });
    });
});