'use client';

import type { SourcingData, SupplierQuoteRow } from './types';

/**
 * Migrates old supplier quote format to new format
 * Handles backward compatibility by mapping legacy fields to new fields
 */
function migrateSupplierQuote(quote: any, index: number): SupplierQuoteRow {
  const migrated: SupplierQuoteRow = {
    id: quote.id || `quote_${Date.now()}_${index}`,
    displayName: quote.displayName || `Supplier ${index + 1}`,
    supplierName: quote.supplierName || '',
    
    // Map legacy fields to new fields
    costPerUnitShortTerm: quote.costPerUnitShortTerm ?? quote.exwUnitCost ?? null,
    moqShortTerm: quote.moqShortTerm ?? quote.moq ?? null,
    packagingCostPerUnit: quote.packagingCostPerUnit ?? quote.packagingPerUnit ?? null,
    inspectionCostPerUnit: quote.inspectionCostPerUnit ?? quote.inspectionPerUnit ?? null,
    
    // Keep legacy fields for backward compat
    exwUnitCost: quote.exwUnitCost ?? quote.costPerUnitShortTerm ?? null,
    moq: quote.moq ?? quote.moqShortTerm ?? null,
    packagingPerUnit: quote.packagingPerUnit ?? quote.packagingCostPerUnit ?? null,
    inspectionPerUnit: quote.inspectionPerUnit ?? quote.inspectionCostPerUnit ?? null,
    
    // Map notes
    communicationNotes: quote.communicationNotes ?? quote.notes ?? '',
    notes: quote.notes ?? quote.communicationNotes ?? '',
    
    // Copy all other fields
    companyName: quote.companyName,
    alibabaUrl: quote.alibabaUrl,
    incoterms: quote.incoterms,
    ddpPrice: quote.ddpPrice,
    freightDutyCost: quote.freightDutyCost,
    freightDutyIncludedInSalesPrice: quote.freightDutyIncludedInSalesPrice ?? false,
    moqLongTerm: quote.moqLongTerm,
    costPerUnitLongTerm: quote.costPerUnitLongTerm,
    sspCostPerUnit: quote.sspCostPerUnit,
    labellingCostPerUnit: quote.labellingCostPerUnit,
    miscPerUnit: quote.miscPerUnit,
    leadTime: quote.leadTime,
    paymentTerms: quote.paymentTerms,
    singleProductPackageLengthCm: quote.singleProductPackageLengthCm,
    singleProductPackageWidthCm: quote.singleProductPackageWidthCm,
    singleProductPackageHeightCm: quote.singleProductPackageHeightCm,
    singleProductPackageWeightKg: quote.singleProductPackageWeightKg,
    unitsPerCarton: quote.unitsPerCarton,
    cartonWeightKg: quote.cartonWeightKg,
    cartonLengthCm: quote.cartonLengthCm,
    cartonWidthCm: quote.cartonWidthCm,
    cartonHeightCm: quote.cartonHeightCm,
    cbmPerCarton: quote.cbmPerCarton,
    totalCbm: quote.totalCbm,
    freightCostPerUnit: quote.freightCostPerUnit ?? quote.ddpShippingPerUnit,
    dutyCostPerUnit: quote.dutyCostPerUnit,
    tariffCostPerUnit: quote.tariffCostPerUnit,
    ddpShippingPerUnit: quote.ddpShippingPerUnit ?? quote.freightCostPerUnit,
    referralFeePct: quote.referralFeePct ?? 0.15,
    fbaFeePerUnit: quote.fbaFeePerUnit,
    sampleOrdered: quote.sampleOrdered,
    sampleNotes: quote.sampleNotes,
    sspsDiscussed: quote.sspsDiscussed,
    salesPrice: quote.salesPrice,
    
    // Derived fields
    referralFee: quote.referralFee,
    totalFbaFeesPerUnit: quote.totalFbaFeesPerUnit,
    landedUnitCost: quote.landedUnitCost,
    profitPerUnit: quote.profitPerUnit,
    roiPct: quote.roiPct,
    marginPct: quote.marginPct,
    totalInvestment: quote.totalInvestment,
    grossProfit: quote.grossProfit,
  };
  
  return migrated;
}

/**
 * Migrates old SourcingData format to new format
 */
function migrateSourcingData(data: any): SourcingData {
  const migrated: SourcingData = {
    productId: data.productId,
    status: data.status || 'none',
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
    supplierQuotes: (data.supplierQuotes || []).map((quote: any, index: number) => 
      migrateSupplierQuote(quote, index)
    ),
    sourcingHub: data.sourcingHub || {
      targetSalesPrice: null,
      categoryOverride: null,
      referralFeePct: null,
    },
    profitCalculator: data.profitCalculator || {
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
  
  return migrated;
}

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
    sourcingHub: {
      targetSalesPrice: null,
      categoryOverride: null,
      referralFeePct: null,
    },
    fieldsConfirmed: {},
  };
}

export function loadSourcingData(productId: string): SourcingData {
  try {
    const stored = localStorage.getItem(`sourcing_${productId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      parsed.productId = productId;
      // Migrate old data format to new format
      return migrateSourcingData(parsed);
    }
  } catch {
    // ignore
  }
  return getDefaultSourcingData(productId);
}

export function getDefaultSupplierQuote(index: number): SupplierQuoteRow {
  return {
    id: `quote_${Date.now()}_${index}`,
    displayName: `Supplier ${index + 1}`,
    supplierName: '',
    costPerUnitShortTerm: null,
    exwUnitCost: null,
    incoterms: 'DDP', // Default to DDP
    ddpPrice: null,
    moqShortTerm: null,
    moq: null,
    salesPrice: null,
    referralFeePct: 0.15,
    fbaFeePerUnit: null,
    freightDutyCost: null,
    freightDutyIncludedInSalesPrice: false,
    communicationNotes: '',
    notes: '',
  };
}

export function saveSourcingData(productId: string, data: SourcingData) {
  try {
    localStorage.setItem(`sourcing_${productId}`, JSON.stringify(data));
  } catch {
    // ignore
  }
}


