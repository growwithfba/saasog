/**
 * Sourcing Data Model
 * 
 * This interface defines the structure for Sourcing data that will eventually
 * be stored in Supabase. For now, it's stored in localStorage.
 */

export type SourcingStatus = 'none' | 'working' | 'completed';

export interface SupplierQuoteRow {
  id: string; // uuid or timestamp string
  
  // Display
  displayName?: string; // Editable supplier title (defaults to "Supplier 1", "Supplier 2", etc.)
  
  // Supplier Info (Basic)
  supplierName: string;
  companyName?: string;
  alibabaUrl?: string;
  supplierAddress?: string;
  supplierContactNumber?: string;
  supplierEmail?: string;
  
  // Pricing / Terms (Basic)
  costPerUnitShortTerm: number | null; // Also stored as exwUnitCost for backward compat
  exwUnitCost?: number | null; // Legacy field, maps to costPerUnitShortTerm
  incoterms?: string; // EXW, FOB, DDP
  ddpPrice?: number | null; // DDP Price (USD) - delivered-to-door cost if supplier provided DDP pricing
  moqShortTerm: number | null; // Also stored as moq for backward compat
  moq?: number | null; // Legacy field, maps to moqShortTerm
  freightDutyCost?: number | null; // Basic-level Freight/Duty (USD)
  freightDutyIncludedInSalesPrice?: boolean; // If true, freight/duty is included in sales price and not subtracted from profit
  
  // MOQ Options (Advanced) - Flexible MOQ pricing (replaces medium/long term)
  moqOptions?: Array<{ moq: number; costPerUnit: number }>; // Max 3 options, base is always moqShortTerm/costPerUnitShortTerm
  
  // Legacy fields (kept for backward compatibility)
  moqMediumTerm?: number | null;
  costPerUnitMediumTerm?: number | null;
  moqLongTerm?: number | null;
  costPerUnitLongTerm?: number | null;
  finalCalcTier?: 'short' | 'medium' | 'long'; // Deprecated - kept for backward compat
  
  // Per-unit Adders (Advanced)
  sspCostPerUnit?: number | null;
  labellingCostPerUnit?: number | null;
  packagingCostPerUnit?: number | null; // Also stored as packagingPerUnit for backward compat
  packagingPerUnit?: number | null; // Legacy field, maps to packagingCostPerUnit
  inspectionCostPerUnit?: number | null; // Also stored as inspectionPerUnit for backward compat
  inspectionPerUnit?: number | null; // Legacy field, maps to inspectionCostPerUnit
  miscPerUnit?: number | null;
  
  // Production / Terms (Advanced)
  leadTime?: string;
  paymentTerms?: '30/70' | '100% Down' | string;
  
  // Single Product Package (Basic) - in cm and kg
  singleProductPackageLengthCm?: number | null;
  singleProductPackageWidthCm?: number | null;
  singleProductPackageHeightCm?: number | null;
  singleProductPackageWeightKg?: number | null;
  
  // Carton / Logistics (Advanced) - in cm and kg
  unitsPerCarton?: number | null;
  cartonWeightKg?: number | null;
  cartonLengthCm?: number | null;
  cartonWidthCm?: number | null;
  cartonHeightCm?: number | null;
  cbmPerCarton?: number | null; // Calculated: (L * W * H) / 1,000,000
  totalCbm?: number | null; // Calculated: CBM/Carton * Total Cartons
  
  // Freight/Compliance Costs (Advanced)
  freightCostPerUnit?: number | null;
  dutyCostPerUnit?: number | null;
  tariffCostPerUnit?: number | null;
  ddpShippingPerUnit?: number | null; // Legacy field, may map to freightCostPerUnit
  incotermsAgreed?: string; // EXW, FOB, DDP (Advanced override for incoterms)
  
  // FBA (Basic)
  referralFeePct: number | null; // default can be 0.15 if empty
  fbaFeePerUnit: number | null;
  
  // Sampling (Advanced)
  sampleOrdered?: 'Yes' | 'No' | boolean;
  sampleQualityScore?: number | null; // 1-10 numeric score
  sampleRefundUponOrder?: boolean | null; // Yes/No
  sampleNotes?: string;
  
  // Super Selling Points (SSPs) (Advanced)
  ssps?: Array<{ type: string; description: string }>; // SSP builder entries
  
  // Notes (Basic) - Legacy fields, kept for backward compatibility
  sspsDiscussed?: string;
  communicationNotes?: string;
  notes?: string; // Legacy field, maps to communicationNotes
  
  // Supplier Grading (Basic)
  opennessToSsps?: 'No' | 'Some' | 'Yes' | 'Mold Required';
  communication?: 'Slow' | 'Moderate' | 'Fast' | 'No Response';
  sellsOnAmazon?: 'No' | 'Yes' | 'Unclear';
  sampling?: 'All SSPs Included' | 'No SSPs Included' | 'Some SSPs Included';
  alibabaTradeAssurance?: 'Yes' | 'No';
  
  // Sales Price (for calculations)
  salesPrice: number | null;

  // Derived fields (store or compute on render, your choice)
  referralFee?: number | null;
  totalFbaFeesPerUnit?: number | null;
  landedUnitCost?: number | null;
  profitPerUnit?: number | null;
  roiPct?: number | null;
  marginPct?: number | null;
  totalInvestment?: number | null;
  grossProfit?: number | null;
  supplierGrade?: 'A' | 'B' | 'C' | 'D' | 'F' | 'Pending'; // Computed supplier grade
  supplierGradeScore?: number | null; // 0-100 score for grade calculation
  
  // Place Order specific fields (non-mapped fields from Place Order tab)
  placeOrderFields?: {
    // Users Company Info
    yourName?: string;
    companyName?: string;
    brandName?: string;
    companyAddress?: string;
    companyPhoneNumber?: string;
    purchaseOrderNumber?: string;
    
    // Product Information
    productSku?: string;
    productSize?: string;
    color?: string;
    materialUsed?: string;
    brandNameProduct?: string;
    brandLogo?: string;
    brandLogoSent?: string;
    upcFnsku?: string;
    additionalDetails?: string;
    
    // Order Basics
    sampleRefundAgreed?: string;
    inspectionAgreed?: string;
    
    // Product Package Information
    productLabelAgreed?: string;
    packagingType?: string;
    packageDesign?: string;
    unitsPerPackage?: string;
    productLabelSent?: string;
    
    // Freight & Compliance
    freightForwarder?: string;
    shippingTime?: string;
    htsCode?: string;
    dutyRate?: string;
    tariffCode?: string;
    additionalCustomsDocuments?: string;
    additionalNotesForSupplier?: string;
  };
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

export interface SourcingHubData {
  // Page-only overrides (do not affect canonical product data)
  targetSalesPrice: number | null; // Override sales price for this page
  categoryOverride: string | null; // Override category for this page
  referralFeePct: number | null; // Calculated from category, but can be manually overridden
}

export interface SourcingData {
  productId: string;
  status: SourcingStatus;
  createdAt: string;
  updatedAt: string;

  supplierQuotes: SupplierQuoteRow[];
  profitCalculator: ProfitCalculatorData;
  sourcingHub?: SourcingHubData; // Page-only overrides

  // Purchase order tracking
  purchaseOrderDownloaded?: boolean;
  purchaseOrderDownloadedAt?: string;
  
  // Place Order field confirmations
  // Key: field key from placeOrderSchema, Value: true (confirmed) / false (not confirmed)
  fieldsConfirmed?: Record<string, boolean>;
}

