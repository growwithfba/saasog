'use client';

import type { SourcingData } from './types';

export function getDefaultSourcingData(productId: string): SourcingData {
  return {
    productId,
    status: 'none',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    supplierQuotes: [],
    profitCalculator: {
      sampleOrdered: false,
      sampleNotes: '',
      brandName: '',
      productName: '',
      category: '',
      sku: '',
      asin: '',
      upc: '',
      fnsku: '',
      amazonListingUrl: '',
      incoterms: '',
      freightForwarder: '',
      htsCode: '',
      htsLookupUrl: '',
      dutyRatePct: null,
      tariffPct: null,
      productWeightLb: null,
      productDimensionsIn: '',
      cartonWeightLb: null,
      cartonDimensionsIn: '',
      unitsPerCarton: null,
      salesPrice: null,
      orderQty: null,
      exwUnitCost: null,
      packagingCostTotal: null,
      inspectionCostTotal: null,
      freightCostTotal: null,
      dutyCostTotal: null,
      miscCostTotal: null,
      referralFeePct: null,
      fbaFeePerUnit: null,
      notes: '',
    },
  };
}

export function loadSourcingData(productId: string): SourcingData {
  try {
    const stored = localStorage.getItem(`sourcing_${productId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      parsed.productId = productId;
      return parsed as SourcingData;
    }
  } catch {
    // ignore
  }
  return getDefaultSourcingData(productId);
}

export function saveSourcingData(productId: string, data: SourcingData) {
  try {
    localStorage.setItem(`sourcing_${productId}`, JSON.stringify(data));
  } catch {
    // ignore
  }
}


