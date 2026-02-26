'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, ExternalLink, Calculator, CheckCircle2, AlertCircle, Pencil, ChevronDown, ChevronUp, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { SupplierQuoteRow } from '../types';
import { formatCurrency } from '@/utils/formatters';
import { getDefaultSupplierQuote } from '../sourcingStorage';
import { getReferralFeePct } from '@/utils/referralFees';
import type { SourcingHubData } from '../types';
import { Checkbox } from '@/components/ui/Checkbox';

interface SupplierQuotesTabProps {
  productId: string;
  data: SupplierQuoteRow[];
  onChange: (quotes: SupplierQuoteRow[]) => void;
  productData?: any;
  hubData?: SourcingHubData;
  offerSsps?: Array<{ type: string; description: string }>;
}

type SupplierView = 'basic' | 'advanced';

// Calculate CBM per carton
const calculateCbmPerCarton = (quote: SupplierQuoteRow): number | null => {
  const { cartonLengthCm, cartonWidthCm, cartonHeightCm } = quote;
  if (cartonLengthCm && cartonWidthCm && cartonHeightCm) {
    return (cartonLengthCm * cartonWidthCm * cartonHeightCm) / 1_000_000;
  }
  return null;
};

// Calculate total CBM
const calculateTotalCbm = (quote: SupplierQuoteRow): number | null => {
  const cbmPerCarton = calculateCbmPerCarton(quote);
  if (!cbmPerCarton) return null;
  
  const moq = quote.moqShortTerm ?? quote.moq ?? null;
  const unitsPerCarton = quote.unitsPerCarton;
  
  if (moq && unitsPerCarton && unitsPerCarton > 0) {
    const totalCartons = Math.ceil(moq / unitsPerCarton);
    return cbmPerCarton * totalCartons;
  }
  
  return null;
};

// Calculate Supplier Grade based on ROI, Margin, Lead Time, and grading fields
const calculateSupplierGrade = (
  quote: SupplierQuoteRow,
  roiPct: number | null,
  marginPct: number | null,
  profitPerUnit: number | null
): { grade: 'A' | 'B' | 'C' | 'D' | 'F' | 'Pending'; score: number | null } => {
  // If ROI/Margin are not computable, return Pending
  if (roiPct === null || marginPct === null || profitPerUnit === null || 
      isNaN(roiPct) || isNaN(marginPct) || isNaN(profitPerUnit)) {
    return { grade: 'Pending', score: null };
  }

  let score = 0;

  // 1. Financial (60 points total)
  // ROI contribution (30 pts)
  if (roiPct < 0) {
    score += 0;
  } else if (roiPct < 50) {
    score += 10;
  } else if (roiPct < 75) {
    score += 18;
  } else if (roiPct < 90) {
    score += 24;
  } else {
    score += 30;
  }

  // Margin contribution (20 pts)
  if (marginPct < 0) {
    score += 0;
  } else if (marginPct < 10) {
    score += 6;
  } else if (marginPct < 20) {
    score += 12;
  } else if (marginPct < 28) {
    score += 16;
  } else {
    score += 20;
  }

  // Profit/Unit contribution (10 pts)
  if (profitPerUnit < 5) {
    score += 2;
  } else if (profitPerUnit < 10) {
    score += 6;
  } else {
    score += 10;
  }

  // 2. Supplier Signals (30 points total)
  // Openness to SSPs (0-8)
  switch (quote.opennessToSsps) {
    case 'No':
      score += 0;
      break;
    case 'Mold Required':
      score += 2;
      break;
    case 'Some':
      score += 5;
      break;
    case 'Yes':
      score += 8;
      break;
    default:
      break;
  }

  // Communication (0-8)
  switch (quote.communication) {
    case 'No Response':
      score += 0;
      break;
    case 'Slow':
      score += 3;
      break;
    case 'Moderate':
      score += 6;
      break;
    case 'Fast':
      score += 8;
      break;
    default:
      break;
  }

  // Sells on Amazon (0-6)
  switch (quote.sellsOnAmazon) {
    case 'Yes':
      score += 0; // Conflict of interest
      break;
    case 'Unclear':
      score += 3;
      break;
    case 'No':
      score += 6;
      break;
    default:
      break;
  }

  // Sampling (0-5)
  switch (quote.sampling) {
    case 'No SSPs Included':
      score += 0;
      break;
    case 'Some SSPs Included':
      score += 3;
      break;
    case 'All SSPs Included':
      score += 5;
      break;
    default:
      break;
  }

  // Trade Assurance (0-3)
  if (quote.alibabaTradeAssurance === 'Yes') {
    score += 3;
  }

  // 3. Lead Time (10 points total)
  const leadTimeStr = quote.leadTime || '';
  const leadTimeDays = extractLeadTimeDays(leadTimeStr);
  if (leadTimeDays === null) {
    score += 5; // Neutral if missing
  } else if (leadTimeDays <= 15) {
    score += 10;
  } else if (leadTimeDays <= 25) {
    score += 8;
  } else if (leadTimeDays <= 35) {
    score += 6;
  } else if (leadTimeDays <= 50) {
    score += 3;
  } else {
    score += 0;
  }

  // Map score to letter grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F' | 'Pending';
  if (score >= 85) {
    grade = 'A';
  } else if (score >= 70) {
    grade = 'B';
  } else if (score >= 55) {
    grade = 'C';
  } else if (score >= 40) {
    grade = 'D';
  } else {
    grade = 'F';
  }

  return { grade, score };
};

// Helper to extract days from lead time string (e.g., "30 days" -> 30)
const extractLeadTimeDays = (leadTime: string): number | null => {
  if (!leadTime) return null;
  const match = leadTime.match(/(\d+)\s*days?/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  // Try to parse as just a number
  const numMatch = leadTime.match(/(\d+)/);
  if (numMatch) {
    return parseInt(numMatch[1], 10);
  }
  return null;
};

// Calculate derived fields for a quote
// Note: This function is called with quote only, but we need hubData/productData for target sales price
// We'll handle that in the component where we have access to hubData/productData
export const calculateQuoteMetrics = (quote: SupplierQuoteRow, hubData?: SourcingHubData, productData?: any): SupplierQuoteRow => {
  // Get target sales price: hubData.targetSalesPrice ?? productData.price ?? quote.salesPrice
  const hub = hubData || { targetSalesPrice: null, categoryOverride: null, referralFeePct: null };
  const originalPrice = productData?.price || productData?.salesPrice || null;
  const targetSalesPrice = hub.targetSalesPrice ?? originalPrice ?? quote.salesPrice ?? 0;
  
  // Get category for referral fee calculation
  const originalCategory = productData?.category || '';
  const category = hub.categoryOverride || originalCategory || '';
  const referralFeePct = hub.referralFeePct !== null 
    ? hub.referralFeePct 
    : getReferralFeePct(category);
  const referralFee = targetSalesPrice > 0 && referralFeePct ? targetSalesPrice * referralFeePct : 0;
  const fbaFeePerUnit = quote.fbaFeePerUnit || 0;
  
  // Determine incoterms: Advanced incotermsAgreed overrides Basic incoterms
  const effectiveIncoterms = quote.incotermsAgreed || quote.incoterms || 'DDP';
  
  // Determine tier selection: use finalCalcTier if set, otherwise default to short-term
  const tier = quote.finalCalcTier || 'short';
  
  // Determine cost price and MOQ based on selected tier
  // let costPrice: number;
  // let moq: number;
  // const estimatedShipping = effectiveIncoterms === 'DDP' ? quote.ddpPrice ?? 0 : quote.freightDutyCost ?? 0;
  const costPrice = quote.costPerUnitShortTerm ?? quote.costPerUnitMediumTerm ?? quote.costPerUnitLongTerm ?? 0;
  const moq = quote.moqShortTerm ?? quote.moqMediumTerm ?? quote.moqLongTerm ?? quote.moq ?? 0;

  // if (tier === 'medium' && quote.costPerUnitMediumTerm !== null && quote.costPerUnitMediumTerm !== undefined) {
  //   costPrice = quote.costPerUnitMediumTerm;
  //   moq = quote.moqMediumTerm ?? quote.moqShortTerm ?? quote.moq ?? 0;
  // } else if (tier === 'long' && quote.costPerUnitLongTerm !== null && quote.costPerUnitLongTerm !== undefined) {
  //   costPrice = quote.costPerUnitLongTerm;
  //   moq = quote.moqLongTerm ?? quote.moqShortTerm ?? quote.moq ?? 0;
  // } else {
  //   // Short-term (default)
  //   // If DDP and ddpPrice provided, use ddpPrice; otherwise use costPerUnitShortTerm
  //   costPrice = (effectiveIncoterms === 'DDP' && quote.ddpPrice && quote.ddpPrice > 0)
  //     ? quote.ddpPrice
  //     : (quote.costPerUnitShortTerm ?? quote.exwUnitCost ?? 0);
  //   moq = quote.moqShortTerm ?? quote.moq ?? 0;
  // }
  
  // Determine shipping cost with precedence: Advanced freight/duty/tariff > Basic single field
  let shippingCost = 0;
  
  // Check if Advanced has detailed freight/duty/tariff values
  const hasAdvancedFreight = (quote.freightCostPerUnit ?? quote.ddpShippingPerUnit ?? 0) > 0;
  const hasAdvancedDuty = (quote.dutyCostPerUnit ?? 0) > 0;
  const hasAdvancedTariff = (quote.tariffCostPerUnit ?? 0) > 0;
  
  if (hasAdvancedFreight || hasAdvancedDuty || hasAdvancedTariff) {
    // Use Advanced detailed values
    shippingCost = (quote.freightCostPerUnit ?? quote.ddpShippingPerUnit ?? 0) +
                   (quote.dutyCostPerUnit ?? 0) +
                   (quote.tariffCostPerUnit ?? 0);
  } else {
    // Fallback to Basic single field based on incoterms
    if (effectiveIncoterms === 'DDP') {
      // DDP: use freightDutyCost if not included in sales price
      shippingCost = quote.freightDutyIncludedInSalesPrice 
        ? 0 
        : (quote.ddpPrice ?? 0);
    } else {
      // EXW/FOB: use freightDutyCost as estimated freight/duty
      shippingCost = quote.freightDutyCost ?? 0;
    }
  }
  const aditionalCosts = (quote.sspCostPerUnit ?? 0) + (quote.labellingCostPerUnit ?? 0) + (quote.packagingCostPerUnit ?? 0) + (quote.inspectionCostPerUnit ?? 0) + (quote.miscPerUnit ?? 0);
  
  // Calculate profit per unit: Target Sales Price - Cost Price - Shipping Cost - FBA Fee - Referral Fee
  const profitPerUnit = targetSalesPrice - costPrice - shippingCost - fbaFeePerUnit - referralFee - aditionalCosts;
  // For advanced calculations, still use landed unit cost (for display purposes)
  const freightPerUnit = quote.freightCostPerUnit ?? quote.ddpShippingPerUnit ?? 0;
  const packagingPerUnit = quote.packagingCostPerUnit ?? quote.packagingPerUnit ?? 0;
  const inspectionPerUnit = quote.inspectionCostPerUnit ?? quote.inspectionPerUnit ?? 0;
  const sspPerUnit = quote.sspCostPerUnit ?? 0;
  const labellingPerUnit = quote.labellingCostPerUnit ?? 0;
  const dutyPerUnit = quote.dutyCostPerUnit ?? 0;
  const tariffPerUnit = quote.tariffCostPerUnit ?? 0;
  const miscPerUnit = quote.miscPerUnit ?? 0;
  
  const landedUnitCost = costPrice + freightPerUnit + packagingPerUnit + inspectionPerUnit + 
                         sspPerUnit + labellingPerUnit + dutyPerUnit + tariffPerUnit + miscPerUnit;
  
  const roiPct = landedUnitCost > 0 ? (profitPerUnit / landedUnitCost) * 100 : null;
  const marginPct = targetSalesPrice > 0 ? (profitPerUnit / targetSalesPrice) * 100 : null;
  
  const totalInvestment = landedUnitCost * moq;
  const grossProfit = profitPerUnit * moq;
  
  // Calculate CBM (use the MOQ from selected tier for calculation)
  const cbmPerCarton = calculateCbmPerCarton(quote);
  const totalCbm = calculateTotalCbm(quote);
  
  // Calculate Supplier Grade
  const { grade: supplierGrade, score: supplierGradeScore } = calculateSupplierGrade(
    quote,
    roiPct,
    marginPct,
    profitPerUnit
  );

  return {
    ...quote,
    referralFee,
    totalFbaFeesPerUnit: referralFee + fbaFeePerUnit,
    landedUnitCost,
    profitPerUnit,
    roiPct,
    marginPct,
    totalInvestment,
    grossProfit,
    cbmPerCarton: cbmPerCarton ?? undefined,
    totalCbm: totalCbm ?? undefined,
    supplierGrade,
    supplierGradeScore,
  };
};

// Check if field is filled (non-null, non-empty, >0 for numeric)
const isFieldFilled = (value: any): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return !isNaN(value) && value >= 0; // Accept 0 as valid
  if (typeof value === 'boolean') return true;
  return false;
};

// Check Initial Profit Calculation Ready
export const isInitialReady = (quote: SupplierQuoteRow): boolean => {
  return (
    isFieldFilled(quote.costPerUnitShortTerm ?? quote.exwUnitCost) &&
    isFieldFilled(quote.incoterms) &&
    isFieldFilled(quote.moqShortTerm ?? quote.moq) &&
    isFieldFilled(quote.singleProductPackageLengthCm) &&
    isFieldFilled(quote.singleProductPackageWidthCm) &&
    isFieldFilled(quote.singleProductPackageHeightCm) &&
    isFieldFilled(quote.singleProductPackageWeightKg) &&
    isFieldFilled(quote.fbaFeePerUnit)
  );
};

// Check Advanced Profit Calculation Ready
export const isAdvancedReady = (quote: SupplierQuoteRow): boolean => {
  if (!isInitialReady(quote)) return false;
  
  return (
    isFieldFilled(quote.moqLongTerm) &&
    isFieldFilled(quote.costPerUnitLongTerm) &&
    isFieldFilled(quote.sspCostPerUnit) &&
    isFieldFilled(quote.labellingCostPerUnit) &&
    isFieldFilled(quote.packagingCostPerUnit ?? quote.packagingPerUnit) &&
    isFieldFilled(quote.inspectionCostPerUnit ?? quote.inspectionPerUnit) &&
    isFieldFilled(quote.unitsPerCarton) &&
    isFieldFilled(quote.cartonWeightKg) &&
    isFieldFilled(quote.cartonLengthCm) &&
    isFieldFilled(quote.cartonWidthCm) &&
    isFieldFilled(quote.cartonHeightCm) &&
    isFieldFilled(quote.freightCostPerUnit ?? quote.ddpShippingPerUnit) &&
    isFieldFilled(quote.dutyCostPerUnit) &&
    isFieldFilled(quote.tariffCostPerUnit) &&
    quote.cbmPerCarton !== null && !isNaN(quote.cbmPerCarton ?? NaN) &&
    quote.totalCbm !== null && !isNaN(quote.totalCbm ?? NaN)
  );
};

// Get Accuracy state with color progression
export type AccuracyState = {
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
};
export const getAccuracyState = (quote: SupplierQuoteRow): AccuracyState => {
  // Calculate progress
  const basicFields = [
    quote.costPerUnitShortTerm ?? quote.exwUnitCost,
    quote.incoterms,
    quote.moqShortTerm ?? quote.moq,
    quote.singleProductPackageLengthCm,
    quote.singleProductPackageWidthCm,
    quote.singleProductPackageHeightCm,
    quote.singleProductPackageWeightKg,
    quote.fbaFeePerUnit,
  ];
  const basicFilled = basicFields.filter(isFieldFilled).length;
  const basicTotal = basicFields.length;
  const basicProgress = basicTotal > 0 ? basicFilled / basicTotal : 0;

  const advancedFields = [
    quote.moqLongTerm,
    quote.costPerUnitLongTerm,
    quote.sspCostPerUnit,
    quote.labellingCostPerUnit,
    quote.packagingCostPerUnit ?? quote.packagingPerUnit,
    quote.inspectionCostPerUnit ?? quote.inspectionPerUnit,
    quote.unitsPerCarton,
    quote.cartonWeightKg,
    quote.cartonLengthCm,
    quote.cartonWidthCm,
    quote.cartonHeightCm,
    quote.freightCostPerUnit ?? quote.ddpShippingPerUnit,
    quote.dutyCostPerUnit,
    quote.tariffCostPerUnit,
  ];
  const advancedFilled = advancedFields.filter(isFieldFilled).length;
  const advancedTotal = advancedFields.length;
  const advancedProgress = advancedTotal > 0 ? advancedFilled / advancedTotal : 0;

  // Determine state and color
  if (basicProgress < 1.0) {
    // Incomplete - unique color (slate/grey)
    return {
      label: 'Incomplete',
      textColor: 'text-slate-400',
      bgColor: 'bg-slate-800/30',
      borderColor: 'border-slate-600/40',
    };
  } else if (basicProgress === 1.0 && advancedProgress === 0) {
    // Basic complete, no advanced - Orange
    return {
      label: 'Basic',
      textColor: 'text-orange-400',
      bgColor: 'bg-orange-900/30',
      borderColor: 'border-orange-600/50',
    };
  } else if (basicProgress === 1.0 && advancedProgress > 0 && advancedProgress < 1.0) {
    // Improving - interpolate color
    let textColor: string;
    let bgColor: string;
    let borderColor: string;
    
    if (advancedProgress < 0.5) {
      // Red to Yellow interpolation
      const ratio = advancedProgress / 0.5;
      if (ratio < 0.33) {
        textColor = 'text-red-400';
        bgColor = 'bg-red-900/30';
        borderColor = 'border-red-600/50';
      } else if (ratio < 0.67) {
        textColor = 'text-orange-400';
        bgColor = 'bg-orange-900/30';
        borderColor = 'border-orange-600/50';
      } else {
        textColor = 'text-yellow-400';
        bgColor = 'bg-yellow-900/30';
        borderColor = 'border-yellow-600/50';
      }
    } else {
      // Yellow to Green interpolation
      const ratio = (advancedProgress - 0.5) / 0.5;
      if (ratio < 0.5) {
        textColor = 'text-yellow-400';
        bgColor = 'bg-yellow-900/30';
        borderColor = 'border-yellow-600/50';
      } else {
        textColor = 'text-emerald-400';
        bgColor = 'bg-emerald-900/30';
        borderColor = 'border-emerald-600/50';
      }
    }
    
    return {
      label: 'Improving',
      textColor,
      bgColor,
      borderColor,
    };
  } else {
    // Very Accurate - Green
    return {
      label: 'Very Accurate',
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/20',
      borderColor: 'border-emerald-500/30',
    };
  }
};

// Get Supplier Accuracy Score with weighted completeness
export type SupplierAccuracyScore = {
  state: 'not_started' | 'scored';
  percent: number;
  label: string;
  tier: 'red' | 'orange' | 'yellow' | 'green' | 'neutral';
  colorClass: {
    bg: string;
    border: string;
    text: string;
  };
};

/**
 * Ring formula: 8 basic fields (50%) + 14 advanced fields (50%).
 * Same as calculateOrderReadiness uses per supplier.
 * Used when there's only 1 supplier so ring and Supplier Quotes accuracy match.
 */
export const calculateQuoteAccuracyForRing = (quote: SupplierQuoteRow): number => {
  const basicFields = [
    quote.costPerUnitShortTerm ?? quote.exwUnitCost,
    quote.incoterms,
    quote.moqShortTerm ?? quote.moq,
    quote.singleProductPackageLengthCm,
    quote.singleProductPackageWidthCm,
    quote.singleProductPackageHeightCm,
    quote.singleProductPackageWeightKg,
    quote.fbaFeePerUnit,
  ];
  const basicFieldsFilled = basicFields.filter(isFieldFilled).length;
  const basicScore = (basicFieldsFilled / 8) * 15;

  const cbmPerCarton = calculateCbmPerCarton(quote);
  const totalCbm = calculateTotalCbm(quote);
  const advancedFields = [
    quote.sspCostPerUnit,
    quote.labellingCostPerUnit,
    quote.packagingCostPerUnit ?? quote.packagingPerUnit,
    quote.inspectionCostPerUnit ?? quote.inspectionPerUnit,
    quote.unitsPerCarton,
    quote.cartonWeightKg,
    quote.cartonLengthCm,
    quote.cartonWidthCm,
    quote.cartonHeightCm,
    quote.freightCostPerUnit ?? quote.ddpShippingPerUnit,
    quote.dutyCostPerUnit,
    quote.tariffCostPerUnit,
    cbmPerCarton,
    totalCbm,
  ];
  const advancedFieldsFilled = advancedFields.filter(isFieldFilled).length;
  const advancedScore = (advancedFieldsFilled / 14) * 15;

  const percent = ((basicScore + advancedScore) / 30) * 100;
  return Math.min(Math.max(Math.round(percent), 0), 100);
};

export const getSupplierAccuracyScore = (quote: SupplierQuoteRow, options?: { supplierCount?: number }): SupplierAccuracyScore => {
  // Check if not started (no meaningful basic info)
  const hasAnyBasicInfo = (
    isFieldFilled(quote.costPerUnitShortTerm ?? quote.exwUnitCost) ||
    isFieldFilled(quote.incoterms) ||
    isFieldFilled(quote.moqShortTerm ?? quote.moq) ||
    isFieldFilled(quote.singleProductPackageLengthCm) ||
    isFieldFilled(quote.singleProductPackageWidthCm) ||
    isFieldFilled(quote.singleProductPackageHeightCm) ||
    isFieldFilled(quote.singleProductPackageWeightKg) ||
    isFieldFilled(quote.fbaFeePerUnit)
  );

  // Use ring formula for percent (8 basic + 14 advanced, 50/50) - consistent with anillo
  const percent = calculateQuoteAccuracyForRing(quote);

  // Only return "Not Started" if there is truly no data (0%)
  if (percent === 0) {
    return {
      state: 'not_started',
      percent: 0,
      label: '0%',
      tier: 'neutral',
      colorClass: {
        bg: 'bg-slate-800/50',
        border: 'border-slate-700/50',
        text: 'text-slate-400',
      },
    };
  }

  // Check basic required fields to track state (but don't gate the percentage display)
  const basicRequiredFields = [
    { value: quote.costPerUnitShortTerm ?? quote.exwUnitCost, name: 'Cost/Unit' },
    { value: quote.moqShortTerm ?? quote.moq, name: 'MOQ' },
    { value: quote.incoterms, name: 'Incoterms' },
    { value: quote.singleProductPackageLengthCm, name: 'Package Length' },
    { value: quote.singleProductPackageWidthCm, name: 'Package Width' },
    { value: quote.singleProductPackageHeightCm, name: 'Package Height' },
    { value: quote.singleProductPackageWeightKg, name: 'Package Weight' },
    { value: quote.fbaFeePerUnit, name: 'FBA Fee' },
  ];

  // If incoterms is DDP, also require DDP Shipping Price
  if (quote.incoterms === 'DDP') {
    basicRequiredFields.push({ value: quote.ddpPrice, name: 'DDP Shipping Price' });
  }

  const missingBasicFields = basicRequiredFields.filter(f => !isFieldFilled(f.value));
  const hasMissingBasicFields = missingBasicFields.length > 0;

  // Determine tier and color
  let tier: 'red' | 'orange' | 'yellow' | 'green';
  let colorClass: { bg: string; border: string; text: string };

  if (percent < 50) {
    tier = 'red';
    colorClass = {
      bg: 'bg-red-950/40',
      border: 'border-red-700/60',
      text: 'text-red-200',
    };
  } else if (percent < 75) {
    tier = 'yellow';
    colorClass = {
      bg: 'bg-yellow-900/30',
      border: 'border-yellow-600/50',
      text: 'text-yellow-400',
    };
  } else {
    tier = 'green';
    colorClass = {
      bg: 'bg-emerald-900/30',
      border: 'border-emerald-600/50',
      text: 'text-emerald-400',
    };
  }

  return {
    state: 'scored',
    percent,
    label: `${percent}%`,
    tier,
    colorClass,
  };
};

// Get ROI tier and styling
export type RoiTier = {
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
};
export const getRoiTier = (roiValue: number | null | undefined): RoiTier => {
  if (roiValue === null || roiValue === undefined || isNaN(roiValue)) {
    return {
      label: '—',
      textColor: 'text-slate-400',
      bgColor: 'bg-slate-800/50',
      borderColor: 'border-slate-700/50',
    };
  }

  // Normalize ROI: if it's a decimal (0-1), convert to percentage
  const roiPct = roiValue < 1 && roiValue > -1 ? roiValue * 100 : roiValue;

  if (roiPct < 0) {
    // Terrible - darker/more intense than red
    return {
      label: `${roiPct.toFixed(1)}%`,
      textColor: 'text-red-200',
      bgColor: 'bg-red-950/40',
      borderColor: 'border-red-700/60',
    };
  } else if (roiPct < 50) {
    // Very Poor
    return {
      label: `${roiPct.toFixed(1)}%`,
      textColor: 'text-red-400',
      bgColor: 'bg-red-900/30',
      borderColor: 'border-red-600/50',
    };
  } else if (roiPct < 75) {
    // Poor
    return {
      label: `${roiPct.toFixed(1)}%`,
      textColor: 'text-red-300',
      bgColor: 'bg-red-800/20',
      borderColor: 'border-red-500/40',
    };
  } else if (roiPct < 90) {
    // Decent
    return {
      label: `${roiPct.toFixed(1)}%`,
      textColor: 'text-yellow-400',
      bgColor: 'bg-yellow-900/30',
      borderColor: 'border-yellow-600/50',
    };
  } else {
    // Good
    return {
      label: `${roiPct.toFixed(1)}%`,
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-900/30',
      borderColor: 'border-emerald-600/50',
    };
  }
};

// Get Margin tier and styling
export type MarginTier = {
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
};
export const getMarginTier = (marginValue: number | null | undefined): MarginTier => {
  if (marginValue === null || marginValue === undefined || isNaN(marginValue)) {
    return {
      label: '—',
      textColor: 'text-slate-400',
      bgColor: 'bg-slate-800/50',
      borderColor: 'border-slate-700/50',
    };
  }

  // Normalize margin: if it's a decimal (0-1), convert to percentage
  const marginPct = marginValue < 1 && marginValue > -1 ? marginValue * 100 : marginValue;

  if (marginPct < 0) {
    // Terrible - darker/more intense than red
    return {
      label: `${marginPct.toFixed(1)}%`,
      textColor: 'text-red-200',
      bgColor: 'bg-red-950/40',
      borderColor: 'border-red-700/60',
    };
  } else if (marginPct < 10) {
    // Very Poor
    return {
      label: `${marginPct.toFixed(1)}%`,
      textColor: 'text-red-400',
      bgColor: 'bg-red-900/30',
      borderColor: 'border-red-600/50',
    };
  } else if (marginPct < 20) {
    // Poor
    return {
      label: `${marginPct.toFixed(1)}%`,
      textColor: 'text-red-300',
      bgColor: 'bg-red-800/20',
      borderColor: 'border-red-500/40',
    };
  } else if (marginPct < 28) {
    // Decent
    return {
      label: `${marginPct.toFixed(1)}%`,
      textColor: 'text-yellow-400',
      bgColor: 'bg-yellow-900/30',
      borderColor: 'border-yellow-600/50',
    };
  } else {
    // Good
    return {
      label: `${marginPct.toFixed(1)}%`,
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-900/30',
      borderColor: 'border-emerald-600/50',
    };
  }
};

// Get Profit per Unit tier and styling
export type ProfitPerUnitTier = {
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
};
export const getProfitPerUnitTier = (value: number | null | undefined): ProfitPerUnitTier => {
  if (value === null || value === undefined || isNaN(value)) {
    return {
      label: '—',
      textColor: 'text-slate-400',
      bgColor: 'bg-slate-800/50',
      borderColor: 'border-slate-700/50',
    };
  }

  if (value < 5) {
    // Red
    return {
      label: formatCurrency(value),
      textColor: 'text-red-400',
      bgColor: 'bg-red-900/30',
      borderColor: 'border-red-600/50',
    };
  } else if (value < 10) {
    // Yellow
    return {
      label: formatCurrency(value),
      textColor: 'text-yellow-400',
      bgColor: 'bg-yellow-900/30',
      borderColor: 'border-yellow-600/50',
    };
  } else {
    // Green
    return {
      label: formatCurrency(value),
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-900/30',
      borderColor: 'border-emerald-600/50',
    };
  }
};

// Get Total Gross Profit tier and styling
type TotalGrossProfitTier = {
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
};
const getTotalGrossProfitTier = (value: number | null | undefined): TotalGrossProfitTier => {
  if (value === null || value === undefined || isNaN(value)) {
    return {
      label: '—',
      textColor: 'text-slate-400',
      bgColor: 'bg-slate-800/50',
      borderColor: 'border-slate-700/50',
    };
  }

  if (value < 2000) {
    // Red
    return {
      label: formatCurrency(value),
      textColor: 'text-red-400',
      bgColor: 'bg-red-900/30',
      borderColor: 'border-red-600/50',
    };
  } else if (value < 4000) {
    // Yellow
    return {
      label: formatCurrency(value),
      textColor: 'text-yellow-400',
      bgColor: 'bg-yellow-900/30',
      borderColor: 'border-yellow-600/50',
    };
  } else {
    // Green
    return {
      label: formatCurrency(value),
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-900/30',
      borderColor: 'border-emerald-600/50',
    };
  }
};

// Get Total Order Investment tier and styling
type TotalOrderInvestmentTier = {
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
};
const getTotalOrderInvestmentTier = (value: number | null | undefined): TotalOrderInvestmentTier => {
  if (value === null || value === undefined || isNaN(value)) {
    return {
      label: '—',
      textColor: 'text-slate-400',
      bgColor: 'bg-slate-800/50',
      borderColor: 'border-slate-700/50',
    };
  }

  if (value < 4000) {
    // Green
    return {
      label: formatCurrency(value),
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-900/30',
      borderColor: 'border-emerald-600/50',
    };
  } else if (value < 7000) {
    // Yellow
    return {
      label: formatCurrency(value),
      textColor: 'text-yellow-400',
      bgColor: 'bg-yellow-900/30',
      borderColor: 'border-yellow-600/50',
    };
  } else {
    // Red
    return {
      label: formatCurrency(value),
      textColor: 'text-red-400',
        bgColor: 'bg-red-900/30',
      borderColor: 'border-red-600/50',
    };
  }
};

// Calculate completeness percentage
const calculateCompleteness = (quote: SupplierQuoteRow): { basic: number; advanced: number; overall: number } => {
  // Basic required fields
  const basicFields = [
    quote.costPerUnitShortTerm ?? quote.exwUnitCost,
    quote.incoterms,
    quote.moqShortTerm ?? quote.moq,
    quote.singleProductPackageLengthCm,
    quote.singleProductPackageWidthCm,
    quote.singleProductPackageHeightCm,
    quote.singleProductPackageWeightKg,
    quote.fbaFeePerUnit,
  ];
  const basicFilled = basicFields.filter(isFieldFilled).length;
  const basicTotal = basicFields.length;
  const basicPct = basicTotal > 0 ? (basicFilled / basicTotal) * 100 : 0;
  
  // Advanced required fields (excluding basic)
  const advancedFields = [
    quote.moqLongTerm,
    quote.costPerUnitLongTerm,
    quote.sspCostPerUnit,
    quote.labellingCostPerUnit,
    quote.packagingCostPerUnit ?? quote.packagingPerUnit,
    quote.inspectionCostPerUnit ?? quote.inspectionPerUnit,
    quote.unitsPerCarton,
    quote.cartonWeightKg,
    quote.cartonLengthCm,
    quote.cartonWidthCm,
    quote.cartonHeightCm,
    quote.freightCostPerUnit ?? quote.ddpShippingPerUnit,
    quote.dutyCostPerUnit,
    quote.tariffCostPerUnit,
  ];
  const advancedFilled = advancedFields.filter(isFieldFilled).length;
  const advancedTotal = advancedFields.length;
  const advancedPct = advancedTotal > 0 ? (advancedFilled / advancedTotal) * 100 : 0;
  
  // Overall (weighted: 40% basic + 60% advanced)
  const overallPct = (basicPct * 0.4) + (advancedPct * 0.6);
  
  return {
    basic: Math.round(basicPct),
    advanced: Math.round(advancedPct),
    overall: Math.round(overallPct),
  };
};

export function SupplierQuotesTab({ productId, data, onChange, productData, hubData, offerSsps = [] }: SupplierQuotesTabProps) {
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [activeViews, setActiveViews] = useState<Record<string, SupplierView>>({});
  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Record<string, boolean>>({});
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());
  const [editingUrls, setEditingUrls] = useState<Record<string, boolean>>({});
  const [supplierInfoExpanded, setSupplierInfoExpanded] = useState<Record<string, boolean>>({});
  const [sortConfig, setSortConfig] = useState<{ key: 'accuracy' | 'roi' | 'margin' | 'profitPerUnit' | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const titleInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  
  // SSP autocomplete state - track which SSP field is active and the search query
  const [sspAutocomplete, setSspAutocomplete] = useState<{
    quoteId: string;
    sspIndex: number;
    searchQuery: string;
    isOpen: boolean;
  } | null>(null);
  const sspInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Track quotes already seeded with locked offer SSPs to avoid re-seeding
  const seededQuotesRef = useRef<Set<string>>(new Set());

  // Pre-populate locked offer SSPs into every quote that has no SSPs yet.
  // Runs when offerSsps arrive AND whenever a new quote is added to data.
  useEffect(() => {
    if (offerSsps.length === 0) return;
    const quotesToSeed = data.filter(
      (q) => !q.ssps?.length && !seededQuotesRef.current.has(q.id)
    );
    if (quotesToSeed.length === 0) return;

    const defaultSsps = offerSsps.map((ssp) => ({ type: ssp.type, description: ssp.description }));
    const updated = data.map((q) => {
      if (!q.ssps?.length && !seededQuotesRef.current.has(q.id)) {
        seededQuotesRef.current.add(q.id);
        return { ...q, ssps: defaultSsps };
      }
      return q;
    });
    onChange(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerSsps, data.length]);

  // Calculate metrics for all quotes
  const quotesWithMetrics = useMemo(() => {
    return data.map(quote => calculateQuoteMetrics(quote, hubData, productData));
  }, [data, hubData, productData]);

  // Sort quotes based on sortConfig
  const sortedQuotes = useMemo(() => {
    if (!sortConfig.key) return quotesWithMetrics;
    
    const sorted = [...quotesWithMetrics].sort((a, b) => {
      let aValue: number | string | null = null;
      let bValue: number | string | null = null;
      
      if (sortConfig.key === 'accuracy') {
        // Use same logic as getSupplierAccuracyScore (ring formula for percent)
        const calculateAccuracy = (quote: typeof a): number => {
          const score = getSupplierAccuracyScore(quote, { supplierCount: data.length });
          // Return the percentage directly (0-100), as percent is always calculated now
          return score.percent;
        };
        aValue = calculateAccuracy(a);
        bValue = calculateAccuracy(b);
      } else if (sortConfig.key === 'roi') {
        // Only use real ROI value if accuracy is 100%, otherwise treat as 0
        const aAccuracy = getSupplierAccuracyScore(a, { supplierCount: data.length });
        const bAccuracy = getSupplierAccuracyScore(b, { supplierCount: data.length });
        aValue = aAccuracy.percent < 100 ? 0 : (a.roiPct ?? 0);
        bValue = bAccuracy.percent < 100 ? 0 : (b.roiPct ?? 0);
      } else if (sortConfig.key === 'margin') {
        // Only use real Margin value if accuracy is 100%, otherwise treat as 0
        const aAccuracy = getSupplierAccuracyScore(a, { supplierCount: data.length });
        const bAccuracy = getSupplierAccuracyScore(b, { supplierCount: data.length });
        aValue = aAccuracy.percent < 100 ? 0 : (a.marginPct ?? 0);
        bValue = bAccuracy.percent < 100 ? 0 : (b.marginPct ?? 0);
      } else if (sortConfig.key === 'profitPerUnit') {
        // Only use real Profit/Unit value if accuracy is 100%, otherwise treat as 0
        const aAccuracy = getSupplierAccuracyScore(a, { supplierCount: data.length });
        const bAccuracy = getSupplierAccuracyScore(b, { supplierCount: data.length });
        aValue = aAccuracy.percent < 100 ? 0 : (a.profitPerUnit ?? 0);
        bValue = bAccuracy.percent < 100 ? 0 : (b.profitPerUnit ?? 0);
      }
      
      if (aValue === null || aValue === -Infinity) return 1;
      if (bValue === null || bValue === -Infinity) return -1;
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
      return 0;
    });
    
    return sorted;
  }, [quotesWithMetrics, sortConfig]);

  const handleSort = (key: 'accuracy' | 'roi' | 'margin' | 'profitPerUnit') => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleAddSupplier = () => {
    const newQuote = getDefaultSupplierQuote(data.length);
    onChange([...data, newQuote]);
    setCollapsedSuppliers(prev => ({ ...prev, [newQuote.id]: true }));
    setSupplierInfoExpanded(prev => ({ ...prev, [newQuote.id]: true }));
  };

  const handleDeleteSupplier = (id: string) => {
    onChange(data.filter(q => q.id !== id));
    setShowDeleteModal(null);
    // Clean up view state
    const newViews = { ...activeViews };
    delete newViews[id];
    setActiveViews(newViews);
    // Clean up selection
    const newSelected = new Set(selectedSuppliers);
    newSelected.delete(id);
    setSelectedSuppliers(newSelected);
  };

  const handleBulkDelete = () => {
    onChange(data.filter(q => !selectedSuppliers.has(q.id)));
    setSelectedSuppliers(new Set());
    setShowDeleteModal(null);
  };

  const handleToggleSelection = (id: string) => {
    const newSelected = new Set(selectedSuppliers);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedSuppliers(newSelected);
  };

  const handleUpdateQuote = (id: string, updates: Partial<SupplierQuoteRow>) => {
    const updated = data.map(q => q.id === id ? { ...q, ...updates } : q);
    onChange(updated);
  };

  const getActiveView = (quoteId: string): SupplierView => {
    return activeViews[quoteId] || 'basic';
  };

  const setActiveView = (quoteId: string, view: SupplierView) => {
    setActiveViews(prev => ({ ...prev, [quoteId]: view }));
  };

  const toggleCollapse = (quoteId: string) => {
    setCollapsedSuppliers(prev => {
      const currentState = prev[quoteId] ?? true; // Get current state, default to collapsed
      return { ...prev, [quoteId]: !currentState };
    });
  };

  const isCollapsed = (quoteId: string): boolean => {
    return collapsedSuppliers[quoteId] ?? true; // Default to collapsed
  };

  const focusTitleInput = (quoteId: string) => {
    const input = titleInputRefs.current[quoteId];
    if (input) {
      input.focus();
      input.select();
    }
  };

  const formatValue = (value: number | null | undefined, isCurrency = false): string => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return isCurrency ? formatCurrency(value) : value.toFixed(2);
  };

  // Helper to get field container class (removed orange styling)
  const getFieldContainerClass = (): string => {
    return ''; // Neutral styling only
  };

  // Helper to check if a field is filled
  // For numeric values: 0 is considered filled (valid input)
  // Only null/undefined/NaN are considered empty
  const isFieldFilled = (value: number | string | null | undefined): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (typeof value === 'number') return !isNaN(value);
    return false;
  };

  // Mandatory field styling - subtle but noticeable
  const getRequiredFieldClass = (isFilled: boolean): string => {
    if (isFilled) {
      return 'border-slate-700/50 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20';
    }
    return 'border-amber-500/30 bg-amber-500/5 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20';
  };

  // Currency input handler - format on blur, show raw on focus
  const [currencyInputStates, setCurrencyInputStates] = useState<Record<string, { isFocused: boolean; displayValue: string }>>({});
  
  const handleCurrencyFocus = (id: string, field: string, value: number | null | undefined) => {
    setCurrencyInputStates(prev => ({
      ...prev,
      [`${id}-${field}`]: {
        isFocused: true,
        displayValue: value !== null && value !== undefined && !isNaN(value) ? value.toString() : '',
      },
    }));
  };

  const handleCurrencyBlur = (id: string, field: string, value: number | null | undefined) => {
    setCurrencyInputStates(prev => ({
      ...prev,
      [`${id}-${field}`]: {
        isFocused: false,
        displayValue: value !== null && value !== undefined && !isNaN(value) ? formatCurrency(value) : '',
      },
    }));
  };

  const handleCurrencyChange = (id: string, field: string, rawValue: string, onUpdate: (val: number | null) => void) => {
    // Update display value immediately while typing
    const numericValue = rawValue.replace(/[^0-9.]/g, '');
    setCurrencyInputStates(prev => ({
      ...prev,
      [`${id}-${field}`]: {
        isFocused: true,
        displayValue: numericValue,
      },
    }));
    // Update the actual value
    const val = numericValue ? parseFloat(numericValue) : null;
    onUpdate(val);
  };

  const getCurrencyDisplayValue = (id: string, field: string, value: number | null | undefined): string => {
    const state = currencyInputStates[`${id}-${field}`];
    if (state?.isFocused) {
      return state.displayValue;
    }
    if (value !== null && value !== undefined && !isNaN(value)) {
      return formatCurrency(value);
    }
    return '';
  };

  // Helper to normalize URL (add https:// if missing protocol)
  const normalizeUrl = (url: string | null | undefined): string | null => {
    if (!url || typeof url !== 'string' || url.trim() === '') return null;
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    // Handle www. or alibaba.com patterns
    if (trimmed.startsWith('www.') || trimmed.includes('.com') || trimmed.includes('.net') || trimmed.includes('.org')) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  // Helper to check if a string is a valid URL
  const isValidUrl = (url: string | null | undefined): boolean => {
    if (!url || typeof url !== 'string' || url.trim().length < 4) return false;
    const trimmed = url.trim();
    
    // Must start with http://, https://, or www., or contain a valid domain pattern
    const hasProtocol = trimmed.startsWith('http://') || trimmed.startsWith('https://');
    const hasWww = trimmed.startsWith('www.');
    const hasDomain = /[a-zA-Z0-9-]+\.(com|net|org|io|co|edu|gov)/.test(trimmed);
    
    if (!hasProtocol && !hasWww && !hasDomain) return false;
    
    const normalized = normalizeUrl(url);
    if (!normalized) return false;
    try {
      const parsed = new URL(normalized);
      // Check that it has a valid hostname with at least one dot
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && 
             parsed.hostname.includes('.') && 
             parsed.hostname.length > 3;
    } catch {
      return false;
    }
  };

  // Toggle URL editing state
  const toggleUrlEditing = (quoteId: string) => {
    setEditingUrls(prev => ({ ...prev, [quoteId]: !prev[quoteId] }));
  };

  // Toggle Supplier Info expanded state
  const toggleSupplierInfo = (quoteId: string) => {
    setSupplierInfoExpanded(prev => ({ ...prev, [quoteId]: !prev[quoteId] }));
  };

  const isSupplierInfoExpanded = (quoteId: string): boolean => {
    return supplierInfoExpanded[quoteId] ?? true; // Default to expanded
  };

  const getReferralFeeForQuote = (quote: SupplierQuoteRow) => {
    const hub = hubData || { targetSalesPrice: null, categoryOverride: null, referralFeePct: null };
    const originalPrice = productData?.price || productData?.salesPrice || null;
    const originalCategory = productData?.category || '';
    
    const targetSalesPrice = hub.targetSalesPrice ?? originalPrice ?? quote.salesPrice;
    const category = hub.categoryOverride || originalCategory || '';
    
    const referralFeePct = hub.referralFeePct !== null 
      ? hub.referralFeePct 
      : getReferralFeePct(category);
    
    if (!targetSalesPrice || !referralFeePct) return { amount: null, pct: null, category: category || null };
    
    return {
      amount: targetSalesPrice * referralFeePct,
      pct: referralFeePct,
      category: category || null,
    };
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Supplier Quotes Comparison</h3>
          <p className="text-sm text-slate-400 mt-1">
            Compare multiple supplier quotes side-by-side to find the best option
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedSuppliers.size > 0 && (
            <button
              onClick={() => setShowDeleteModal('bulk')}
              className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 hover:border-red-500/70 rounded-lg text-red-400 hover:text-red-300 transition-colors"
              title={`Remove ${selectedSuppliers.size} selected supplier${selectedSuppliers.size > 1 ? 's' : ''}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleAddSupplier}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Supplier
          </button>
        </div>
      </div>

      {quotesWithMetrics.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-700/50 mb-4">
            <Calculator className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Your Sourcing Hub Is Empty — Let's Fill It With Real Numbers 🧾</h3>
          <p className="text-slate-400 mb-6">
            Click Add Supplier to start tracking quotes and tracking real profit potenial.
          </p>
          <button
            onClick={handleAddSupplier}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 rounded-lg text-white font-medium transition-all transform hover:scale-105 inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Supplier
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Table-like structure with sortable headers */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            {/* Header Row */}
            <div className="grid grid-cols-[auto_1fr_120px_120px_120px_120px_auto] gap-3 p-3 border-b border-slate-700/50 bg-slate-800/30">
              {/* Checkbox column - empty header */}
              <div className="flex items-center">
                <Checkbox
                  size="sm"
                  checked={selectedSuppliers.size === sortedQuotes.length && sortedQuotes.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedSuppliers(new Set(sortedQuotes.map(q => q.id)));
                    } else {
                      setSelectedSuppliers(new Set());
                    }
                  }}
                  title="Select all"
                />
              </div>
              
              {/* Supplier Name column */}
              <div className="flex items-center text-xs uppercase tracking-wider text-slate-400 font-medium">
                Supplier Name
              </div>
              
              {/* Accuracy column - sortable */}
              <button
                onClick={() => handleSort('accuracy')}
                className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-400 font-medium hover:text-slate-300 transition-colors text-left"
              >
                Accuracy
                {sortConfig.key === 'accuracy' ? (
                  sortConfig.direction === 'asc' ? (
                    <ArrowUp className="w-3 h-3" />
                  ) : (
                    <ArrowDown className="w-3 h-3" />
                  )
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-50" />
                )}
              </button>
              
              {/* ROI column - sortable */}
              <button
                onClick={() => handleSort('roi')}
                className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-400 font-medium hover:text-slate-300 transition-colors text-left"
              >
                ROI
                {sortConfig.key === 'roi' ? (
                  sortConfig.direction === 'asc' ? (
                    <ArrowUp className="w-3 h-3" />
                  ) : (
                    <ArrowDown className="w-3 h-3" />
                  )
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-50" />
                )}
              </button>
              
              {/* Margin column - sortable */}
              <button
                onClick={() => handleSort('margin')}
                className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-400 font-medium hover:text-slate-300 transition-colors text-left"
              >
                Margin
                {sortConfig.key === 'margin' ? (
                  sortConfig.direction === 'asc' ? (
                    <ArrowUp className="w-3 h-3" />
                  ) : (
                    <ArrowDown className="w-3 h-3" />
                  )
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-50" />
                )}
              </button>
              
              {/* Profit/Unit column - sortable */}
              <button
                onClick={() => handleSort('profitPerUnit')}
                className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-400 font-medium hover:text-slate-300 transition-colors text-left"
              >
                Profit/Unit
                {sortConfig.key === 'profitPerUnit' ? (
                  sortConfig.direction === 'asc' ? (
                    <ArrowUp className="w-3 h-3" />
                  ) : (
                    <ArrowDown className="w-3 h-3" />
                  )
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-50" />
                )}
              </button>
              
              {/* Actions column - empty header */}
              <div></div>
            </div>
            
            {/* Supplier Rows */}
            {sortedQuotes.map((quote, index) => {
            const activeView = getActiveView(quote.id);
            const displayName = quote.displayName;
            const collapsed = isCollapsed(quote.id);
            const accuracyScore = getSupplierAccuracyScore(quote, { supplierCount: data.length });
            const roiTier = getRoiTier(quote.roiPct);
            const marginTier = getMarginTier(quote.marginPct);
            const profitPerUnitTier = getProfitPerUnitTier(quote.profitPerUnit);
            const totalGrossProfitTier = getTotalGrossProfitTier(quote.grossProfit);
            const totalOrderInvestmentTier = getTotalOrderInvestmentTier(quote.totalInvestment);
            const isSelected = selectedSuppliers.has(quote.id);
            const isMissingBasic = accuracyScore.percent < 50;

            return (
            <div
              key={quote.id}
              className={`border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors ${
                index % 2 === 0 ? 'bg-slate-500/20' : 'bg-slate-900/20'
              }`}
            >
              {/* Table Row */}
              <div 
                className="grid grid-cols-[auto_1fr_120px_120px_120px_120px_auto] gap-3 p-3 items-center"
              >
                {/* Checkbox column */}
                <div className="flex items-center">
                  <Checkbox
                    size="sm"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleToggleSelection(quote.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    title="Select supplier"
                  />
                </div>
                
                {/* Supplier Name column - expandable */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-shrink">
                    <input
                      ref={(el) => { titleInputRefs.current[quote.id] = el; }}
                      type="text"
                      value={displayName}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleUpdateQuote(quote.id, { displayName: e.target.value });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      onFocus={(e) => e.stopPropagation()}
                      className="text-base font-semibold text-white bg-transparent border-none outline-none focus:ring-1 focus:ring-blue-500/50 rounded px-1.5 py-0.5 -ml-1.5 min-w-[100px] w-auto"
                      size={Math.max(10, Math.min(displayName.length || 10, 30))}
                      placeholder={`Supplier ${index + 1}`}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        focusTitleInput(quote.id);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-300 hover:bg-slate-700/50 rounded transition-colors flex-shrink-0"
                      title="Edit supplier name"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                  {quote.companyName && (
                    <div className="text-xs text-slate-500 ml-1 truncate hidden sm:block">
                      {quote.companyName}
                    </div>
                  )}
                </div>
                
                {/* Accuracy column */}
                <div 
                  className={`px-2.5 py-1.5 rounded-md border ${accuracyScore.colorClass.bg} ${accuracyScore.colorClass.border}`}
                >
                  <div className={`text-sm font-semibold ${accuracyScore.colorClass.text}`}>
                    {accuracyScore.label}
                  </div>
                </div>
                
                {/* ROI column */}
                <div 
                  className={`px-2.5 py-1.5 rounded-md border ${isMissingBasic ? 'bg-slate-800/30 border-slate-700/30' : `${roiTier.bgColor} ${roiTier.borderColor}`}`}
                >
                  <div className={`text-sm font-semibold ${isMissingBasic ? 'text-slate-500' : roiTier.textColor}`}>
                    {isMissingBasic ? '—' : roiTier.label}
                  </div>
                </div>
                
                {/* Margin column */}
                <div 
                  className={`px-2.5 py-1.5 rounded-md border ${isMissingBasic ? 'bg-slate-800/30 border-slate-700/30' : `${marginTier.bgColor} ${marginTier.borderColor}`}`}
                >
                  <div className={`text-sm font-semibold ${isMissingBasic ? 'text-slate-500' : marginTier.textColor}`}>
                    {isMissingBasic ? '—' : marginTier.label}
                  </div>
                </div>
                
                {/* Profit/Unit column */}
                <div 
                  className={`px-2.5 py-1.5 rounded-md border ${isMissingBasic ? 'bg-slate-800/30 border-slate-700/30' : `${profitPerUnitTier.bgColor} ${profitPerUnitTier.borderColor}`}`}
                >
                  <div className={`text-sm font-semibold ${isMissingBasic ? 'text-slate-500' : profitPerUnitTier.textColor}`}>
                    {isMissingBasic ? '—' : profitPerUnitTier.label}
                  </div>
                </div>
                
                {/* Actions column */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(quote.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-300 hover:bg-slate-700/50 rounded transition-colors flex-shrink-0"
                    title={collapsed ? "Expand supplier" : "Collapse supplier"}
                  >
                    {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                  {isSelected && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteModal(quote.id);
                      }}
                      className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                      title="Remove supplier"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              
              {/* Expandable Content - Hidden when collapsed */}
              {!collapsed && (
                <div className="bg-slate-800/30 border-t border-slate-700/50">
                  {/* Basic/Advanced Tabs */}
                  <div className="flex border-b border-slate-700/50 bg-slate-800/30">
                    <button
                    onClick={() => setActiveView(quote.id, 'basic')}
                    className={`px-6 py-3 font-medium transition-all relative ${
                      activeView === 'basic'
                        ? 'text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                      Basic
                      {activeView === 'basic' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveView(quote.id, 'advanced')}
                      className={`px-6 py-3 font-medium transition-all relative ${
                        activeView === 'advanced'
                          ? 'text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Advanced
                      {activeView === 'advanced' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                      )}
                    </button>
                  </div>

                  {/* Content - Hidden when collapsed */}
                  <div className="p-4">
                  {activeView === 'basic' ? (
                    <div className="space-y-3">
                      {/* Supplier Info - Top Section (Collapsible) */}
                      <div className="bg-slate-900/30 rounded-lg border border-slate-700/30">
                        <button
                          type="button"
                          onClick={() => toggleSupplierInfo(quote.id)}
                          className="w-full flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors"
                        >
                          <h4 className="text-sm font-semibold text-slate-300">Supplier Info</h4>
                          {isSupplierInfoExpanded(quote.id) ? (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                        {isSupplierInfoExpanded(quote.id) ? (
                          <div className="px-4 pb-4 space-y-4">
                          {/* Contact Information */}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className={getFieldContainerClass()}>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Supplier Name</label>
                              <input
                                type="text"
                                value={quote.displayName || `Supplier ${index + 1}`}
                                readOnly
                                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 cursor-not-allowed"
                              />
                            </div>
                            <div className={getFieldContainerClass()}>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Company Name</label>
                              <input
                                type="text"
                                value={quote.companyName || ''}
                                onChange={(e) => handleUpdateQuote(quote.id, { companyName: e.target.value })}
                                placeholder="Company name"
                                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck="false"
                              />
                            </div>
                            <div className={getFieldContainerClass()}>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Alibaba URL</label>
                              {(() => {
                                const url = quote.alibabaUrl || '';
                                const normalizedUrl = normalizeUrl(url);
                                const hasValidUrl = isValidUrl(url);
                                
                                // Determine if we should be in editing mode
                                // If editingUrls[quote.id] is undefined, check if there's a valid URL
                                // If it's explicitly true or false, respect that state
                                const explicitlyEditing = editingUrls[quote.id];
                                const isEditing = explicitlyEditing === true || (explicitlyEditing === undefined && !hasValidUrl);
                                
                                if (isEditing) {
                                  return (
                                    <div className="relative">
                                      <input
                                        type="text"
                                        value={url}
                                        onChange={(e) => {
                                          // Set editing state to true when user starts typing
                                          if (editingUrls[quote.id] === undefined) {
                                            setEditingUrls(prev => ({ ...prev, [quote.id]: true }));
                                          }
                                          handleUpdateQuote(quote.id, { alibabaUrl: e.target.value });
                                        }}
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        spellCheck="false"
                                        onBlur={(e) => {
                                          const value = e.target.value;
                                          if (isValidUrl(value)) {
                                            const normalized = normalizeUrl(value);
                                            if (normalized) {
                                              handleUpdateQuote(quote.id, { alibabaUrl: normalized });
                                            }
                                            setEditingUrls(prev => ({ ...prev, [quote.id]: false }));
                                          } else if (!value.trim()) {
                                            // If field is empty, reset to show input next time
                                            setEditingUrls(prev => {
                                              const newState = { ...prev };
                                              delete newState[quote.id];
                                              return newState;
                                            });
                                          }
                                        }}
                                        placeholder="www.alibaba.com/... or https://..."
                                        className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(url))}`}
                                        autoFocus
                                      />
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div className="flex items-center gap-2">
                                      <a
                                        href={normalizedUrl || '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors border border-slate-700/50"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        Visit Supplier
                                      </a>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleUrlEditing(quote.id);
                                        }}
                                        className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 rounded-lg transition-colors"
                                        title="Edit URL"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  );
                                }
                              })()}
                            </div>
                            <div className={getFieldContainerClass()}>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Supplier Address</label>
                              <input
                                type="text"
                                value={quote.supplierAddress || ''}
                                onChange={(e) => handleUpdateQuote(quote.id, { supplierAddress: e.target.value })}
                                placeholder="Supplier address"
                                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck="false"
                              />
                            </div>
                            <div className={getFieldContainerClass()}>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Supplier Contact Number</label>
                              <input
                                type="text"
                                value={quote.supplierContactNumber || ''}
                                onChange={(e) => handleUpdateQuote(quote.id, { supplierContactNumber: e.target.value })}
                                placeholder="Contact number"
                                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck="false"
                              />
                            </div>
                            <div className={getFieldContainerClass()}>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Supplier Email</label>
                              <input
                                type="email"
                                value={quote.supplierEmail || ''}
                                onChange={(e) => handleUpdateQuote(quote.id, { supplierEmail: e.target.value })}
                                placeholder="Email address"
                                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck="false"
                              />
                            </div>
                          </div>

                          {/* Supplier Grading - Merged into Supplier Info */}
                          <div className="pt-3 border-t border-slate-700/30">
                            <h5 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Supplier Grading</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                              <div className={getFieldContainerClass()}>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Openness to SSPs</label>
                                <select
                                  value={quote.opennessToSsps || ''}
                                  onChange={(e) => handleUpdateQuote(quote.id, { opennessToSsps: e.target.value as 'No' | 'Some' | 'Yes' | 'Mold Required' | undefined })}
                                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                                  autoComplete="off"
                                >
                                  <option value="">Select...</option>
                                  <option value="No">No</option>
                                  <option value="Some">Some</option>
                                  <option value="Yes">Yes</option>
                                  <option value="Mold Required">Mold Required</option>
                                </select>
                              </div>
                              <div className={getFieldContainerClass()}>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Communication</label>
                                <select
                                  value={quote.communication || ''}
                                  onChange={(e) => handleUpdateQuote(quote.id, { communication: e.target.value as 'Slow' | 'Moderate' | 'Fast' | 'No Response' | undefined })}
                                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                                  autoComplete="off"
                                >
                                  <option value="">Select...</option>
                                  <option value="Slow">Slow</option>
                                  <option value="Moderate">Moderate</option>
                                  <option value="Fast">Fast</option>
                                  <option value="No Response">No Response</option>
                                </select>
                              </div>
                              <div className={getFieldContainerClass()}>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Sells On Amazon</label>
                                <select
                                  value={quote.sellsOnAmazon || ''}
                                  onChange={(e) => handleUpdateQuote(quote.id, { sellsOnAmazon: e.target.value as 'No' | 'Yes' | 'Unclear' | undefined })}
                                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                                  autoComplete="off"
                                >
                                  <option value="">Select...</option>
                                  <option value="No">No</option>
                                  <option value="Yes">Yes</option>
                                  <option value="Unclear">Unclear</option>
                                </select>
                              </div>
                              <div className={getFieldContainerClass()}>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Sampling</label>
                                <select
                                  value={quote.sampling || ''}
                                  onChange={(e) => handleUpdateQuote(quote.id, { sampling: e.target.value as 'All SSPs Included' | 'No SSPs Included' | 'Some SSPs Included' | undefined })}
                                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                                  autoComplete="off"
                                >
                                  <option value="">Select...</option>
                                  <option value="All SSPs Included">All SSPs Included</option>
                                  <option value="No SSPs Included">No SSPs Included</option>
                                  <option value="Some SSPs Included">Some SSPs Included</option>
                                </select>
                              </div>
                              <div className={getFieldContainerClass()}>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Alibaba Trade Assurance</label>
                                <select
                                  value={quote.alibabaTradeAssurance || ''}
                                  onChange={(e) => handleUpdateQuote(quote.id, { alibabaTradeAssurance: e.target.value as 'Yes' | 'No' | undefined })}
                                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                                  autoComplete="off"
                                >
                                  <option value="">Select...</option>
                                  <option value="Yes">Yes</option>
                                  <option value="No">No</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>
                        ) : (
                          <div className="px-4 pb-4">
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                              {quote.companyName && (
                                <span className="font-medium text-slate-300">{quote.companyName}</span>
                              )}
                              {normalizeUrl(quote.alibabaUrl) && (
                                <a
                                  href={normalizeUrl(quote.alibabaUrl) || '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Visit Supplier
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Pricing / Terms */}
                      <div className="bg-slate-500/20 rounded-lg p-3 border border-slate-700/30">
                        <h4 className="text-sm font-semibold text-slate-300 mb-2">Pricing / Terms</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Cost/Unit (USD)</label>
                            <input
                              type="text"
                              value={getCurrencyDisplayValue(quote.id, 'costPerUnitShortTerm', quote.costPerUnitShortTerm ?? quote.exwUnitCost)}
                              onFocus={() => handleCurrencyFocus(quote.id, 'costPerUnitShortTerm', quote.costPerUnitShortTerm ?? quote.exwUnitCost)}
                              onBlur={() => handleCurrencyBlur(quote.id, 'costPerUnitShortTerm', quote.costPerUnitShortTerm ?? quote.exwUnitCost)}
                              onChange={(e) => handleCurrencyChange(quote.id, 'costPerUnitShortTerm', e.target.value, (val) => {
                                handleUpdateQuote(quote.id, { 
                                  costPerUnitShortTerm: val,
                                  exwUnitCost: val, // Keep in sync
                                });
                              })}
                              placeholder="$0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.costPerUnitShortTerm ?? quote.exwUnitCost))}`}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">MOQ</label>
                            <input
                              type="number"
                              value={quote.moqShortTerm ?? quote.moq ?? ''}
                              onChange={(e) => {
                                const val = e.target.value ? parseFloat(e.target.value) : null;
                                handleUpdateQuote(quote.id, { 
                                  moqShortTerm: val,
                                  moq: val, // Keep in sync
                                });
                              }}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                              placeholder="0"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.moqShortTerm ?? quote.moq))}`}
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Incoterms</label>
                            <select
                              value={quote.incoterms || 'DDP'}
                              onChange={(e) => {
                                const newValue = e.target.value || 'DDP';
                                handleUpdateQuote(quote.id, { incoterms: newValue });
                              }}
                              onBlur={(e) => {
                                // Ensure DDP is saved if field was empty
                                if (!quote.incoterms) {
                                  handleUpdateQuote(quote.id, { incoterms: 'DDP' });
                                }
                              }}
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.incoterms))}`}
                            >
                              <option value="DDP">DDP</option>
                              <option value="EXW">EXW</option>
                              <option value="FOB">FOB</option>
                            </select>
                          </div>
                          {/* Conditional shipping field based on Incoterms */}
                          {(() => {
                            const effectiveIncoterms = quote.incoterms || 'DDP';
                            if (effectiveIncoterms === 'DDP') {
                              return (
                                <div className={getFieldContainerClass()}>
                                  <label className="block text-xs font-medium text-slate-400 mb-1">DDP Shipping Price (USD)</label>
                                  <input
                                    type="text"
                                    value={getCurrencyDisplayValue(quote.id, 'ddpPrice', quote.ddpPrice)}
                                    onFocus={() => handleCurrencyFocus(quote.id, 'ddpPrice', quote.ddpPrice)}
                                    onBlur={() => handleCurrencyBlur(quote.id, 'ddpPrice', quote.ddpPrice)}
                                    onChange={(e) => handleCurrencyChange(quote.id, 'ddpPrice', e.target.value, (val) => {
                                      handleUpdateQuote(quote.id, { ddpPrice: val });
                                    })}
                                    placeholder="$0.00"
                                    className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.ddpPrice))}`}
                                  />
                                </div>
                              );
                            } else {
                              // EXW or FOB
                              return (
                                <div className={getFieldContainerClass()}>
                                  <label className="block text-xs font-medium text-slate-400 mb-1">Estimated Freight/Duty (USD)</label>
                                  <input
                                    type="text"
                                    value={getCurrencyDisplayValue(quote.id, 'freightDutyCost', quote.freightDutyCost)}
                                    onFocus={() => handleCurrencyFocus(quote.id, 'freightDutyCost', quote.freightDutyCost)}
                                    onBlur={() => handleCurrencyBlur(quote.id, 'freightDutyCost', quote.freightDutyCost)}
                                    onChange={(e) => handleCurrencyChange(quote.id, 'freightDutyCost', e.target.value, (val) => {
                                      handleUpdateQuote(quote.id, { freightDutyCost: val });
                                    })}
                                    placeholder="$0.00"
                                    className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.freightDutyCost))}`}
                                  />
                                </div>
                              );
                            }
                          })()}
                        </div>
                      </div>

                      {/* Single Unit Package */}
                      <div className="bg-slate-900/30 rounded-lg p-3 border border-slate-700/30">
                        <h4 className="text-sm font-semibold text-slate-300 mb-2">Single Unit Package</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Length (cm)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={quote.singleProductPackageLengthCm ?? ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { singleProductPackageLengthCm: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.singleProductPackageLengthCm))}`}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Width (cm)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={quote.singleProductPackageWidthCm ?? ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { singleProductPackageWidthCm: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.singleProductPackageWidthCm))}`}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Height (cm)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={quote.singleProductPackageHeightCm ?? ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { singleProductPackageHeightCm: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.singleProductPackageHeightCm))}`}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Weight (kg)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={quote.singleProductPackageWeightKg ?? ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { singleProductPackageWeightKg: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.singleProductPackageWeightKg))}`}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                            />
                          </div>
                        </div>
                      </div>

                      {/* FBA Fees */}
                      <div className="bg-slate-500/20 rounded-lg p-3 border border-slate-700/30">
                        <h4 className="text-sm font-semibold text-slate-300 mb-2">FBA Fees</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-2">
                              FBA Fee
                              <a
                                href="https://sellercentral.amazon.com/fba/profitabilitycalculator/index.html"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
                                title="Open FBA fee calculator"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Calculator
                              </a>
                            </label>
                            <input
                              type="text"
                              value={getCurrencyDisplayValue(quote.id, 'fbaFeePerUnit', quote.fbaFeePerUnit)}
                              onFocus={() => handleCurrencyFocus(quote.id, 'fbaFeePerUnit', quote.fbaFeePerUnit)}
                              onBlur={() => handleCurrencyBlur(quote.id, 'fbaFeePerUnit', quote.fbaFeePerUnit)}
                              onChange={(e) => handleCurrencyChange(quote.id, 'fbaFeePerUnit', e.target.value, (val) => {
                                handleUpdateQuote(quote.id, { fbaFeePerUnit: val });
                              })}
                              placeholder="$0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.fbaFeePerUnit))}`}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Referral Fee</label>
                            {(() => {
                              const referralFee = getReferralFeeForQuote(quote);
                              return (
                                <div className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                                  <div className="text-white text-sm">
                                    {referralFee.amount !== null ? formatCurrency(referralFee.amount) : '—'}
                                  </div>
                                  {referralFee.pct !== null && (
                                    <div className="text-xs text-slate-400 mt-0.5">
                                      {(referralFee.pct * 100).toFixed(1)}%
                                      {referralFee.category && ` — ${referralFee.category}`}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Basic Summary (collapsed) - Section 0 */}
                      <div className="bg-slate-500/20 rounded-lg p-3 border border-slate-700/30">
                        <details className="cursor-pointer">
                          <summary className="text-sm font-semibold text-slate-300">Basic Information (Click to expand)</summary>
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-slate-400">
                            <div>Cost/Unit: {formatValue(quote.costPerUnitShortTerm ?? quote.exwUnitCost, true)}</div>
                            <div>Incoterms: {quote.incoterms || '-'}</div>
                            <div>MOQ: {formatValue(quote.moqShortTerm ?? quote.moq)}</div>
                            <div>Single Unit Package Dimensions: {quote.singleProductPackageLengthCm && quote.singleProductPackageWidthCm && quote.singleProductPackageHeightCm 
                              ? `${quote.singleProductPackageLengthCm} × ${quote.singleProductPackageWidthCm} × ${quote.singleProductPackageHeightCm} cm`
                              : '-'}</div>
                            <div>Single Unit Package Weight: {formatValue(quote.singleProductPackageWeightKg)} kg</div>
                            <div>FBA Fee: {formatValue(quote.fbaFeePerUnit, true)}</div>
                          </div>
                        </details>
                      </div>

                      {/* Single Unit Package (Advanced) - Section 1 */}
                      <div className="bg-slate-900/20 rounded-lg p-3 border border-slate-700/30">
                        <h4 className="text-sm font-semibold text-slate-300 mb-2">Single Unit Package</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Length (cm)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={quote.singleProductPackageLengthCm ?? ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { singleProductPackageLengthCm: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.singleProductPackageLengthCm))}`}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Width (cm)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={quote.singleProductPackageWidthCm ?? ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { singleProductPackageWidthCm: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.singleProductPackageWidthCm))}`}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Height (cm)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={quote.singleProductPackageHeightCm ?? ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { singleProductPackageHeightCm: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.singleProductPackageHeightCm))}`}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Weight (kg)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={quote.singleProductPackageWeightKg ?? ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { singleProductPackageWeightKg: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.singleProductPackageWeightKg))}`}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                            />
                          </div>
                        </div>
                      </div>

                      {/* FBA Fees (Advanced) - Section 2 */}
                      <div className="bg-slate-500/20 rounded-lg p-3 border border-slate-700/30">
                        <h4 className="text-sm font-semibold text-slate-300 mb-2">FBA Fees</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-2">
                              FBA Fee
                              <a
                                href="https://sellercentral.amazon.com/fba/profitabilitycalculator/index.html"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
                                title="Open FBA fee calculator"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Calculator
                              </a>
                            </label>
                            <input
                              type="text"
                              value={getCurrencyDisplayValue(quote.id, 'fbaFeePerUnit', quote.fbaFeePerUnit)}
                              onFocus={() => handleCurrencyFocus(quote.id, 'fbaFeePerUnit', quote.fbaFeePerUnit)}
                              onBlur={() => handleCurrencyBlur(quote.id, 'fbaFeePerUnit', quote.fbaFeePerUnit)}
                              onChange={(e) => handleCurrencyChange(quote.id, 'fbaFeePerUnit', e.target.value, (val) => {
                                handleUpdateQuote(quote.id, { fbaFeePerUnit: val });
                              })}
                              placeholder="$0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.fbaFeePerUnit))}`}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Referral Fee</label>
                            {(() => {
                              const referralFee = getReferralFeeForQuote(quote);
                              return (
                                <div className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                                  <div className="text-white text-sm">
                                    {referralFee.amount !== null ? formatCurrency(referralFee.amount) : '—'}
                                  </div>
                                  {referralFee.pct !== null && (
                                    <div className="text-xs text-slate-400 mt-0.5">
                                      {(referralFee.pct * 100).toFixed(1)}%
                                      {referralFee.category && ` — ${referralFee.category}`}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Pricing - MOQ Options - Section 3 */}
                      <div className="bg-slate-900/20 rounded-lg p-3 border border-slate-700/30">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-slate-300">Pricing</h4>
                          {(!quote.moqOptions || quote.moqOptions.length < 2) && (
                            <button
                              type="button"
                              onClick={() => {
                                const currentOptions = quote.moqOptions || [];
                                if (currentOptions.length < 2) {
                                  handleUpdateQuote(quote.id, { 
                                    moqOptions: [...currentOptions, { moq: 0, costPerUnit: 0 }] 
                                  });
                                }
                              }}
                              className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 hover:border-blue-500/70 rounded-lg text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-2 text-xs"
                            >
                              <Plus className="w-3 h-3" />
                              Add MOQ
                            </button>
                          )}
                        </div>
                        <div className="space-y-4">
                          {/* Base MOQ + Cost (always exists) */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className={getFieldContainerClass()}>
                              <label className="block text-xs font-medium text-slate-400 mb-1">MOQ</label>
                              <input
                                type="number"
                                value={quote.moqShortTerm ?? quote.moq ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value ? parseFloat(e.target.value) : null;
                                  handleUpdateQuote(quote.id, { 
                                    moqShortTerm: val,
                                    moq: val, // Keep in sync
                                  });
                                }}
                                placeholder="0"
                                className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.moqShortTerm ?? quote.moq))}`}
                              />
                            </div>
                            <div className={getFieldContainerClass()}>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Cost/Unit (USD)</label>
                              <input
                                type="text"
                                value={getCurrencyDisplayValue(quote.id, 'costPerUnitShortTerm', quote.costPerUnitShortTerm ?? quote.exwUnitCost)}
                                onFocus={() => handleCurrencyFocus(quote.id, 'costPerUnitShortTerm', quote.costPerUnitShortTerm ?? quote.exwUnitCost)}
                                onBlur={() => handleCurrencyBlur(quote.id, 'costPerUnitShortTerm', quote.costPerUnitShortTerm ?? quote.exwUnitCost)}
                                onChange={(e) => handleCurrencyChange(quote.id, 'costPerUnitShortTerm', e.target.value, (val) => {
                                  handleUpdateQuote(quote.id, { 
                                    costPerUnitShortTerm: val,
                                    exwUnitCost: val, // Keep in sync
                                  });
                                })}
                                placeholder="$0.00"
                                className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.costPerUnitShortTerm ?? quote.exwUnitCost))}`}
                              />
                            </div>
                          </div>

                          {/* MOQ Options (additional options, max 3 total) */}
                          {quote.moqOptions && quote.moqOptions.length > 0 && (
                            <div className="space-y-3 pt-3 border-t border-slate-700/30">
                              {quote.moqOptions.map((option, optIndex) => (
                                <div key={optIndex} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                                  <div className={getFieldContainerClass()}>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Option {optIndex + 2} - MOQ</label>
                                    <input
                                      type="number"
                                      value={option.moq || ''}
                                      onChange={(e) => {
                                        const newOptions = [...(quote.moqOptions || [])];
                                        newOptions[optIndex] = { ...option, moq: e.target.value ? parseFloat(e.target.value) : 0 };
                                        handleUpdateQuote(quote.id, { moqOptions: newOptions });
                                      }}
                                      placeholder="0"
                                      className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(option.moq))}`}
                                    />
                                  </div>
                                  <div className={getFieldContainerClass()}>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Cost/Unit (USD)</label>
                                    <input
                                      type="text"
                                      value={getCurrencyDisplayValue(quote.id, `moqOption${optIndex}Cost`, option.costPerUnit)}
                                      onFocus={() => handleCurrencyFocus(quote.id, `moqOption${optIndex}Cost`, option.costPerUnit)}
                                      onBlur={() => handleCurrencyBlur(quote.id, `moqOption${optIndex}Cost`, option.costPerUnit)}
                                      onChange={(e) => handleCurrencyChange(quote.id, `moqOption${optIndex}Cost`, e.target.value, (val) => {
                                        const newOptions = [...(quote.moqOptions || [])];
                                        newOptions[optIndex] = { ...option, costPerUnit: val || 0 };
                                        handleUpdateQuote(quote.id, { moqOptions: newOptions });
                                      })}
                                      placeholder="$0.00"
                                      className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(option.costPerUnit))}`}
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newOptions = quote.moqOptions?.filter((_, i) => i !== optIndex) || [];
                                        handleUpdateQuote(quote.id, { moqOptions: newOptions.length > 0 ? newOptions : undefined });
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                      title="Remove"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                        </div>
                      </div>

                      {/* Additional Costs - Section 4 */}
                      <div className="bg-slate-500/20 rounded-lg p-3 border border-slate-700/30">
                        <h4 className="text-sm font-semibold text-slate-300 mb-2">Additional Costs</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">SSP Cost/Unit (USD)</label>
                            <input
                              type="text"
                              value={getCurrencyDisplayValue(quote.id, 'sspCostPerUnit', quote.sspCostPerUnit)}
                              onFocus={() => handleCurrencyFocus(quote.id, 'sspCostPerUnit', quote.sspCostPerUnit)}
                              onBlur={() => handleCurrencyBlur(quote.id, 'sspCostPerUnit', quote.sspCostPerUnit)}
                              onChange={(e) => handleCurrencyChange(quote.id, 'sspCostPerUnit', e.target.value, (val) => {
                                handleUpdateQuote(quote.id, { sspCostPerUnit: val });
                              })}
                              placeholder="$0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.sspCostPerUnit))}`}
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Labelling Cost/Unit (USD)</label>
                            <input
                              type="text"
                              value={getCurrencyDisplayValue(quote.id, 'labellingCostPerUnit', quote.labellingCostPerUnit)}
                              onFocus={() => handleCurrencyFocus(quote.id, 'labellingCostPerUnit', quote.labellingCostPerUnit)}
                              onBlur={() => handleCurrencyBlur(quote.id, 'labellingCostPerUnit', quote.labellingCostPerUnit)}
                              onChange={(e) => handleCurrencyChange(quote.id, 'labellingCostPerUnit', e.target.value, (val) => {
                                handleUpdateQuote(quote.id, { labellingCostPerUnit: val });
                              })}
                              placeholder="$0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.labellingCostPerUnit))}`}
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Packaging Cost/Unit (USD)</label>
                            <input
                              type="text"
                              value={getCurrencyDisplayValue(quote.id, 'packagingCostPerUnit', quote.packagingCostPerUnit ?? quote.packagingPerUnit)}
                              onFocus={() => handleCurrencyFocus(quote.id, 'packagingCostPerUnit', quote.packagingCostPerUnit ?? quote.packagingPerUnit)}
                              onBlur={() => handleCurrencyBlur(quote.id, 'packagingCostPerUnit', quote.packagingCostPerUnit ?? quote.packagingPerUnit)}
                              onChange={(e) => handleCurrencyChange(quote.id, 'packagingCostPerUnit', e.target.value, (val) => {
                                handleUpdateQuote(quote.id, { 
                                  packagingCostPerUnit: val,
                                  packagingPerUnit: val, // Keep in sync
                                });
                              })}
                              placeholder="$0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.packagingCostPerUnit ?? quote.packagingPerUnit))}`}
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Misc Costs/Unit (USD)</label>
                            <input
                              type="text"
                              value={getCurrencyDisplayValue(quote.id, 'inspectionCostPerUnit', quote.inspectionCostPerUnit ?? quote.inspectionPerUnit)}
                              onFocus={() => handleCurrencyFocus(quote.id, 'inspectionCostPerUnit', quote.inspectionCostPerUnit ?? quote.inspectionPerUnit)}
                              onBlur={() => handleCurrencyBlur(quote.id, 'inspectionCostPerUnit', quote.inspectionCostPerUnit ?? quote.inspectionPerUnit)}
                              onChange={(e) => handleCurrencyChange(quote.id, 'inspectionCostPerUnit', e.target.value, (val) => {
                                handleUpdateQuote(quote.id, { 
                                  inspectionCostPerUnit: val,
                                  inspectionPerUnit: val, // Keep in sync
                                });
                              })}
                              placeholder="$0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.inspectionCostPerUnit ?? quote.inspectionPerUnit))}`}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Production / Terms - Section 5 */}
                      <div className="bg-slate-900/20 rounded-lg p-3 border border-slate-700/30">
                        <h4 className="text-sm font-semibold text-slate-300 mb-2">Production Terms</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Lead Time (Days)</label>
                            <div className="relative">
                              <input
                                type="number"
                                value={(() => {
                                  const leadTimeStr = quote.leadTime || '';
                                  const days = extractLeadTimeDays(leadTimeStr);
                                  return days !== null ? days : '';
                                })()}
                                onChange={(e) => {
                                  const days = e.target.value ? parseInt(e.target.value, 10) : null;
                                  handleUpdateQuote(quote.id, { leadTime: days !== null ? `${days} days` : '' });
                                }}
                                placeholder="30"
                                className="w-full px-3 py-2 pr-16 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Days</span>
                            </div>
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Payment Terms</label>
                            <select
                              value={quote.paymentTerms || ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { paymentTerms: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                            >
                              <option value="">Select...</option>
                              <option value="30/70">30/70</option>
                              <option value="100% Down">100% Down</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Carton / Logistics - Section 6 */}
                      <div className="bg-slate-500/20 rounded-lg p-3 border border-slate-700/30">
                        <h4 className="text-sm font-semibold text-slate-300 mb-2">Carton / Logistics</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Units/Carton</label>
                            <input
                              type="number"
                              value={quote.unitsPerCarton ?? ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { unitsPerCarton: e.target.value ? parseInt(e.target.value) : null })}
                              placeholder="0"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.unitsPerCarton))}`}
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Carton Weight (kg)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={quote.cartonWeightKg ?? ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { cartonWeightKg: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.cartonWeightKg))}`}
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Carton Length (cm)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={quote.cartonLengthCm ?? ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { cartonLengthCm: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.cartonLengthCm))}`}
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Carton Width (cm)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={quote.cartonWidthCm ?? ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { cartonWidthCm: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.cartonWidthCm))}`}
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Carton Height (cm)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={quote.cartonHeightCm ?? ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { cartonHeightCm: e.target.value ? parseFloat(e.target.value) : null })}
                              placeholder="0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.cartonHeightCm))}`}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/30">
                              <label className="block text-xs font-medium text-slate-400 mb-1">CBM/Carton</label>
                              <div className="text-sm font-semibold text-white">
                                {formatValue(quote.cbmPerCarton ?? null)}
                                {quote.cbmPerCarton !== null && !isNaN(quote.cbmPerCarton ?? NaN) ? ' m³' : ''}
                              </div>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/30">
                              <label className="block text-xs font-medium text-slate-400 mb-1">Total CBM</label>
                              <div className="text-sm font-semibold text-white">
                                {formatValue(quote.totalCbm ?? null)}
                                {quote.totalCbm !== null && !isNaN(quote.totalCbm ?? NaN) ? ' m³' : ''}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Freight/Compliance Costs - Section 7 */}
                      <div className="bg-slate-900/20 rounded-lg p-3 border border-slate-700/30">
                        <h4 className="text-sm font-semibold text-slate-300 mb-2">Freight & Compliance</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Incoterms Agreed</label>
                            <select
                              value={quote.incotermsAgreed || ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { incotermsAgreed: e.target.value || undefined })}
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.incotermsAgreed))}`}
                            >
                              <option value="">Select...</option>
                              <option value="EXW">EXW</option>
                              <option value="FOB">FOB</option>
                              <option value="DDP">DDP</option>
                            </select>
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Freight Cost/Unit (USD)</label>
                            <input
                              type="text"
                              value={getCurrencyDisplayValue(quote.id, 'freightCostPerUnit', quote.freightCostPerUnit ?? quote.ddpShippingPerUnit)}
                              onFocus={() => handleCurrencyFocus(quote.id, 'freightCostPerUnit', quote.freightCostPerUnit ?? quote.ddpShippingPerUnit)}
                              onBlur={() => handleCurrencyBlur(quote.id, 'freightCostPerUnit', quote.freightCostPerUnit ?? quote.ddpShippingPerUnit)}
                              onChange={(e) => handleCurrencyChange(quote.id, 'freightCostPerUnit', e.target.value, (val) => {
                                handleUpdateQuote(quote.id, { 
                                  freightCostPerUnit: val,
                                  ddpShippingPerUnit: val, // Keep in sync
                                });
                              })}
                              placeholder="$0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.freightCostPerUnit ?? quote.ddpShippingPerUnit))}`}
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Duty Cost/Unit (USD)</label>
                            <input
                              type="text"
                              value={getCurrencyDisplayValue(quote.id, 'dutyCostPerUnit', quote.dutyCostPerUnit)}
                              onFocus={() => handleCurrencyFocus(quote.id, 'dutyCostPerUnit', quote.dutyCostPerUnit)}
                              onBlur={() => handleCurrencyBlur(quote.id, 'dutyCostPerUnit', quote.dutyCostPerUnit)}
                              onChange={(e) => handleCurrencyChange(quote.id, 'dutyCostPerUnit', e.target.value, (val) => {
                                handleUpdateQuote(quote.id, { dutyCostPerUnit: val });
                              })}
                              placeholder="$0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.dutyCostPerUnit))}`}
                            />
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Tariff Cost/Unit (USD)</label>
                            <input
                              type="text"
                              value={getCurrencyDisplayValue(quote.id, 'tariffCostPerUnit', quote.tariffCostPerUnit)}
                              onFocus={() => handleCurrencyFocus(quote.id, 'tariffCostPerUnit', quote.tariffCostPerUnit)}
                              onBlur={() => handleCurrencyBlur(quote.id, 'tariffCostPerUnit', quote.tariffCostPerUnit)}
                              onChange={(e) => handleCurrencyChange(quote.id, 'tariffCostPerUnit', e.target.value, (val) => {
                                handleUpdateQuote(quote.id, { tariffCostPerUnit: val });
                              })}
                              placeholder="$0.00"
                              className={`w-full px-3 py-2 bg-slate-900/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none ${getRequiredFieldClass(isFieldFilled(quote.tariffCostPerUnit))}`}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Super Selling Points (SSPs) - Section 8 */}
                      <div className="bg-slate-500/20 rounded-lg p-3 border border-slate-700/30">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-slate-300">Super Selling Points (SSPs)</h4>
                          {/* <button
                            type="button"
                            onClick={() => {
                              const currentSsps = quote.ssps || [];
                              handleUpdateQuote(quote.id, { 
                                ssps: [...currentSsps, { type: '', description: '' }] 
                              });
                            }}
                            className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 hover:border-blue-500/70 rounded-lg text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-2 text-xs"
                          >
                            <Plus className="w-3 h-3" />
                            Add SSP
                          </button> */}
                        </div>

                        {quote.ssps && quote.ssps.length > 0 ? (
                          <div className="space-y-3">
                            {quote.ssps.map((ssp, sspIndex) => (
                              <div key={sspIndex} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                                <div className={getFieldContainerClass()}>
                                  <label className="block text-xs font-medium text-slate-400 mb-1">Type</label>
                                  <select
                                    value={ssp.type || ''}
                                    onChange={(e) => {
                                      const newSsps = [...(quote.ssps || [])];
                                      newSsps[sspIndex] = { ...ssp, type: e.target.value };
                                      handleUpdateQuote(quote.id, { ssps: newSsps });
                                    }}
                                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                                  >
                                    <option value="">Select...</option>
                                    <option value="Functional Change">Functional Change</option>
                                    <option value="Quality Change">Quality Change</option>
                                    <option value="Aesthetic Change">Aesthetic Change</option>
                                    <option value="Bundling Change">Bundling Change</option>
                                    <option value="Quantity Change">Quantity Change</option>
                                  </select>
                                </div>
                                <div className={`${getFieldContainerClass()} md:col-span-3 relative`}>
                                  <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                                  <input
                                    type="text"
                                    ref={(el) => { sspInputRefs.current[`${quote.id}-${sspIndex}`] = el; }}
                                    value={
                                      sspAutocomplete?.quoteId === quote.id && sspAutocomplete?.sspIndex === sspIndex
                                        ? sspAutocomplete.searchQuery
                                        : (ssp.description || '')
                                    }
                                    onChange={(e) => {
                                      setSspAutocomplete({
                                        quoteId: quote.id,
                                        sspIndex,
                                        searchQuery: e.target.value,
                                        isOpen: true,
                                      });
                                    }}
                                    onFocus={() => {
                                      setSspAutocomplete({
                                        quoteId: quote.id,
                                        sspIndex,
                                        searchQuery: ssp.description || '',
                                        isOpen: true,
                                      });
                                    }}
                                    onBlur={(e) => {
                                      // Delay closing to allow click on dropdown
                                      setTimeout(() => {
                                        if (sspAutocomplete?.quoteId === quote.id && sspAutocomplete?.sspIndex === sspIndex) {
                                          setSspAutocomplete(null);
                                        }
                                      }, 200);
                                    }}
                                    placeholder={ssp.type ? `Search ${ssp.type} improvements...` : 'Select a type first...'}
                                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                                  />
                                  {/* Autocomplete dropdown */}
                                  {sspAutocomplete?.quoteId === quote.id && sspAutocomplete?.sspIndex === sspIndex && sspAutocomplete.isOpen && (
                                    (() => {
                                      // Filter offerSsps by selected type and search query
                                      const selectedType = ssp.type || '';
                                      const filteredSsps = offerSsps.filter(offerSsp => {
                                        // Match by type
                                        if (selectedType && offerSsp.type !== selectedType) return false;
                                        // Match by search query
                                        if (sspAutocomplete.searchQuery) {
                                          return offerSsp.description.toLowerCase().includes(sspAutocomplete.searchQuery.toLowerCase());
                                        }
                                        return true;
                                      });
                                      
                                      if (filteredSsps.length === 0 && !selectedType) {
                                        return (
                                          <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                            <div className="px-3 py-2 text-slate-400 text-sm italic">
                                              Select a type to see available improvements
                                            </div>
                                          </div>
                                        );
                                      }
                                      
                                      if (filteredSsps.length === 0) {
                                        return (
                                          <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                            <div className="px-3 py-2 text-slate-400 text-sm italic">
                                              No improvements found for "{selectedType}"
                                            </div>
                                          </div>
                                        );
                                      }
                                      
                                      return (
                                        <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                          {filteredSsps.map((offerSsp, idx) => (
                                            <button
                                              key={idx}
                                              type="button"
                                              onMouseDown={(e) => {
                                                e.preventDefault();
                                                const newSsps = [...(quote.ssps || [])];
                                                newSsps[sspIndex] = { 
                                                  ...ssp, 
                                                  description: offerSsp.description,
                                                  // Auto-fill type if not set
                                                  type: ssp.type || offerSsp.type,
                                                };
                                                handleUpdateQuote(quote.id, { ssps: newSsps });
                                                setSspAutocomplete(null);
                                              }}
                                              className="w-full px-3 py-2 text-left text-white hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-b-0"
                                            >
                                              <div className="text-sm">{offerSsp.description}</div>
                                              <div className="text-xs text-slate-400">{offerSsp.type}</div>
                                            </button>
                                          ))}
                                        </div>
                                      );
                                    })()
                                  )}
                                </div>
                                <div className="flex items-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newSsps = quote.ssps?.filter((_, i) => i !== sspIndex) || [];
                                      handleUpdateQuote(quote.id, { ssps: newSsps.length > 0 ? newSsps : undefined });
                                    }}
                                    className="w-full px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 hover:border-red-500/70 rounded-lg text-red-400 hover:text-red-300 transition-colors flex items-center justify-center gap-2"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic">No SSPs added yet. Click "Add SSP" to create one.</p>
                        )}
                      </div>

                      {/* Sampling - Section 9 */}
                      <div className="bg-slate-900/20 rounded-lg p-3 border border-slate-700/30">
                        <h4 className="text-sm font-semibold text-slate-300 mb-2">Sampling</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Sample Ordered</label>
                            <select
                              value={typeof quote.sampleOrdered === 'boolean' 
                                ? (quote.sampleOrdered ? 'Yes' : 'No')
                                : (quote.sampleOrdered === 'Yes' ? 'Yes' : 'No')}
                              onChange={(e) => {
                                const newValue = e.target.value === 'Yes' ? 'Yes' as const : (e.target.value === 'No' ? 'No' as const : false);
                                // Clear sample notes if "No" is selected
                                if (newValue === 'No') {
                                  handleUpdateQuote(quote.id, { 
                                    sampleOrdered: newValue,
                                    sampleNotes: null
                                  });
                                } else {
                                  handleUpdateQuote(quote.id, { 
                                    sampleOrdered: newValue
                                  });
                                }
                              }}
                              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                            >
                              <option value="No">No</option>
                              <option value="Yes">Yes</option>
                            </select>
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">
                              Sample Quality: <span className={`font-semibold ${
                                !quote.sampleQualityScore ? 'text-slate-500' :
                                quote.sampleQualityScore >= 8 ? 'text-emerald-400' :
                                quote.sampleQualityScore >= 5 ? 'text-amber-400' :
                                'text-red-400'
                              }`}>{quote.sampleQualityScore ?? '—'}</span>
                            </label>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-slate-500">1</span>
                              <input
                                type="range"
                                min="1"
                                max="10"
                                step="1"
                                value={quote.sampleQualityScore ?? 5}
                                onChange={(e) => handleUpdateQuote(quote.id, { 
                                  sampleQualityScore: parseInt(e.target.value, 10)
                                })}
                                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                              />
                              <span className="text-xs text-slate-500">10</span>
                            </div>
                          </div>
                          <div className={getFieldContainerClass()}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Sample Refund Upon Order</label>
                            <select
                              value={quote.sampleRefundUponOrder === true ? 'Yes' : (quote.sampleRefundUponOrder === false ? 'No' : '')}
                              onChange={(e) => handleUpdateQuote(quote.id, { 
                                sampleRefundUponOrder: e.target.value === 'Yes' ? true : (e.target.value === 'No' ? false : null)
                              })}
                              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                            >
                              <option value="">Select...</option>
                              <option value="Yes">Yes</option>
                              <option value="No">No</option>
                            </select>
                          </div>
                        </div>
                        {((typeof quote.sampleOrdered === 'boolean' && quote.sampleOrdered === true) || quote.sampleOrdered === 'Yes') && (
                          <div className={`${getFieldContainerClass()} mt-3`}>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Sample Notes</label>
                            <textarea
                              value={quote.sampleNotes || ''}
                              onChange={(e) => handleUpdateQuote(quote.id, { sampleNotes: e.target.value })}
                              placeholder="Sample notes..."
                              rows={3}
                              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-none"
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck="false"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Calculated Outputs - Hidden when collapsed */}
                  {!collapsed && (
                  <div className="mt-6 bg-slate-900/30 rounded-lg p-4 border border-slate-700/30">
                    <h4 className="text-sm font-semibold text-slate-300 mb-4">Key Performance Indicators</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      {/* 1. ROI */}
                      <div className={`px-3 py-3 rounded-lg border ${isMissingBasic ? 'bg-slate-800/30 border-slate-700/30' : `${roiTier.bgColor} ${roiTier.borderColor}`}`}>
                        <div className="text-xs text-slate-400 mb-1">ROI</div>
                        <div className={`text-lg font-semibold ${isMissingBasic ? 'text-slate-500' : roiTier.textColor}`}>
                          {isMissingBasic ? '—' : roiTier.label}
                        </div>
                      </div>
                      {/* 2. Margin */}
                      <div className={`px-3 py-3 rounded-lg border ${isMissingBasic ? 'bg-slate-800/30 border-slate-700/30' : `${marginTier.bgColor} ${marginTier.borderColor}`}`}>
                        <div className="text-xs text-slate-400 mb-1">Margin</div>
                        <div className={`text-lg font-semibold ${isMissingBasic ? 'text-slate-500' : marginTier.textColor}`}>
                          {isMissingBasic ? '—' : marginTier.label}
                        </div>
                      </div>
                      {/* 3. Profit/Unit */}
                  <div className={`px-3 py-3 rounded-lg border ${isMissingBasic ? 'bg-slate-800/30 border-slate-700/30' : `${profitPerUnitTier.bgColor} ${profitPerUnitTier.borderColor}`}`}>
                    <div className="text-xs text-slate-400 mb-1">Profit/Unit</div>
                    <div className={`text-lg font-semibold ${isMissingBasic ? 'text-slate-500' : profitPerUnitTier.textColor}`}>
                      {isMissingBasic ? '—' : profitPerUnitTier.label}
                    </div>
                  </div>
                      {/* 4. Total Order Investment */}
                      <div className={`px-3 py-3 rounded-lg border ${totalOrderInvestmentTier.bgColor} ${totalOrderInvestmentTier.borderColor}`}>
                        <div className="text-xs text-slate-400 mb-1">Total Order Investment</div>
                    <div className={`text-lg font-semibold ${totalOrderInvestmentTier.textColor}`}>
                      {totalOrderInvestmentTier.label}
                    </div>
                  </div>
                      {/* 5. Total Gross Profit */}
                  <div className={`px-3 py-3 rounded-lg border ${totalGrossProfitTier.bgColor} ${totalGrossProfitTier.borderColor}`}>
                        <div className="text-xs text-slate-400 mb-1">Total Gross Profit</div>
                    <div className={`text-lg font-semibold ${totalGrossProfitTier.textColor}`}>
                      {totalGrossProfitTier.label}
                    </div>
                  </div>
                </div>
                    </div>
                  )}
                  </div>
                </div>
              )}
              </div>
            );
          })}
          </div>
        </div>
      )}

    </div>

    {/* Delete Confirmation Modal - rendered via portal to document.body to avoid overflow/transform clipping */}
    {showDeleteModal && typeof document !== 'undefined' && createPortal(
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
        <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">
                {showDeleteModal === 'bulk' 
                  ? `Remove ${selectedSuppliers.size} Supplier${selectedSuppliers.size > 1 ? 's' : ''}?`
                  : 'Remove Supplier Quote?'}
              </h3>
              <p className="text-slate-400 text-sm">This action cannot be undone</p>
            </div>
          </div>
          
          <p className="text-slate-300 mb-6">
            {showDeleteModal === 'bulk'
              ? `Are you sure you want to remove ${selectedSuppliers.size} selected supplier${selectedSuppliers.size > 1 ? 's' : ''}? All data for these suppliers will be lost.`
              : 'Are you sure you want to remove this supplier quote? All data for this supplier will be lost.'}
          </p>
          
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowDeleteModal(null)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (showDeleteModal === 'bulk') {
                  handleBulkDelete();
                } else {
                  handleDeleteSupplier(showDeleteModal);
                }
              }}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-white transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Remove
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
  </>
  );
}
