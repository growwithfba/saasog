// src/__mocks__/keepaApiMock.ts

import { jest } from '@jest/globals';

interface KeepaProduct {
    asin: string;
    title: string;
    salesRankReference: string;
    salesRanks: {
        [key: string]: number[];
    };
    categories: number[];
    categoryTree: number[];
    manufacturer: string;
    csv?: {
        [key: string]: number[];
    };
}

interface KeepaCategory {
    catId: number;
    name: string;
    parent: number;
}

interface KeepaApiResponse {
    products?: KeepaProduct[];
    categories?: {
        [key: string]: KeepaCategory;
    };
    error?: {
        message: string;
    };
}

// Helper function to generate timestamps (in Keepa minutes)
const generateKeepaTimestamps = (days: number, interval: number = 60): number[] => {
    const now = Math.floor(Date.now() / (60 * 1000)); // Current time in Keepa minutes
    const timestamps: number[] = [];
    
    for (let i = days; i >= 0; i--) {
        timestamps.push(now - (i * 24 * 60)); // Convert days to Keepa minutes
    }
    
    return timestamps;
};

export const mockKeepaResponse: KeepaApiResponse = {
    products: [{
        asin: 'B0009KF59M',
        title: 'Test Sports Product',
        salesRankReference: '3375251',
        salesRanks: {
            '3375251': generateKeepaTimestamps(90).flatMap(timestamp => [
                timestamp,
                Math.floor(15000 + (Math.random() * 2000 - 1000))
            ]),
            '3408281': generateKeepaTimestamps(90).slice(-30).flatMap(timestamp => [
                timestamp,
                Math.floor(25000 + (Math.random() * 2000 - 1000))
            ])
        },
        categories: [3375251, 3408281],
        categoryTree: [2972638011, 3375251],
        manufacturer: 'Test Brand'
    }],
    categories: {
        '3375251': {
            catId: 3375251,
            name: 'Sports & Outdoors',
            parent: 2972638011
        },
        '3408281': {
            catId: 3408281,
            name: 'Secondary Category',
            parent: 2972638011
        }
    }
};

export const mockFetchResponse = {
    ok: true,
    json: () => Promise.resolve(mockKeepaResponse)
} as Response;

export const validateMockData = () => {
    const product = mockKeepaResponse.products?.[0];
    if (!product) {
        return { isValid: false, dataPoints: 0 };
    }

    const bsrData = product.salesRanks[product.salesRankReference];
    
    return {
        isValid: bsrData.length > 0 && 
                 bsrData.every((v, i) => i % 2 === 0 ? v > 0 : v >= 100),
        dataPoints: bsrData.length / 2
    };
};