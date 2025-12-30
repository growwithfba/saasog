/**
 * Sourcing Data Model
 * 
 * This interface defines the structure for Sourcing data that will eventually
 * be stored in Supabase. For now, it's stored in localStorage.
 */

export type SourcingStatus = 'none' | 'working' | 'completed';

export interface SupplierQuoteRow {
  id: string; // uuid or timestamp string
  supplierName: string;
  moq: number | null;
  salesPrice: number | null;

  exwUnitCost: number | null;
  ddpShippingPerUnit: number | null;

  referralFeePct: number | null; // default can be 0.15 if empty
  fbaFeePerUnit: number | null;

  // Optional extra per-unit costs
  packagingPerUnit: number | null;
  inspectionPerUnit: number | null;
  miscPerUnit: number | null;

  notes: string;

  // Derived fields (store or compute on render, your choice)
  referralFee: number | null;
  totalFbaFeesPerUnit: number | null;
  landedUnitCost: number | null;
  profitPerUnit: number | null;
  roiPct: number | null;
  marginPct: number | null;
  totalInvestment: number | null;
  grossProfit: number | null;
}

export interface ProfitCalculatorData {
  sampleOrdered: boolean;
  sampleOrderDate?: string;
  sampleNotes: string;

  brandName: string;
  productName: string;
  category: string;
  sku: string;
  asin: string;
  upc: string;
  fnsku: string;
  amazonListingUrl: string;

  incoterms: string;
  freightForwarder: string;
  htsCode: string;
  htsLookupUrl: string;
  dutyRatePct: number | null;
  tariffPct: number | null;

  productWeightLb: number | null;
  productDimensionsIn: string;

  cartonWeightLb: number | null;
  cartonDimensionsIn: string;
  unitsPerCarton: number | null;

  // Order and cost inputs
  salesPrice: number | null;
  orderQty: number | null;

  exwUnitCost: number | null;
  packagingCostTotal: number | null;
  inspectionCostTotal: number | null;
  freightCostTotal: number | null;
  dutyCostTotal: number | null;
  miscCostTotal: number | null;

  referralFeePct: number | null;
  fbaFeePerUnit: number | null;

  notes: string;
}

export interface SourcingData {
  productId: string;
  status: SourcingStatus;
  createdAt: string;
  updatedAt: string;

  supplierQuotes: SupplierQuoteRow[];
  profitCalculator: ProfitCalculatorData;
}

