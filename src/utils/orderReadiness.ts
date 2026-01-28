import type { SupplierQuoteRow } from '@/components/Sourcing/types';
import { isInitialReady, isAdvancedReady } from '@/components/Sourcing/tabs/SupplierQuotesTab';

export interface OrderReadinessResult {
  percent: number;
  status: 'ORDER READY' | 'ALMOST READY' | 'NEEDS ATTENTION' | 'NOT READY';
  colorClass: {
    ring: string;
    glow: string;
    text: string;
    bg: string;
  };
  message: string;
  nextActions: string[];
  missingSections: string[];
  navigationTarget?: {
    tab: 'quotes' | 'placeOrder';
    section?: string;
    supplierId?: string;
  };
}

interface PlaceOrderState {
  confirmedItems: Set<string>;
  checklistItems: Array<{
    id: string;
    section: string;
    required: boolean;
    finalAgreedValue: string | null;
  }>;
}

/**
 * Calculate order readiness score based on:
 * - Basic mandatory fields (15 points per supplier)
 * - Advanced mandatory fields (15 points per supplier)
 * - Place Order sections (10 points each, only sections with required fields count)
 * 
 * Strategy: Calculate average progress across ALL suppliers
 */
export function calculateOrderReadiness(
  supplierQuotes: SupplierQuoteRow[],
  placeOrderState?: PlaceOrderState
): OrderReadinessResult {
  // If no suppliers at all, return 0% progress
  if (!supplierQuotes || supplierQuotes.length === 0) {
    return {
      percent: 0,
      status: 'NOT READY',
      colorClass: {
        ring: 'stroke-red-500',
        glow: 'drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]',
        text: 'text-red-400',
        bg: 'bg-red-900/20',
      },
      message: 'Add at least one supplier to begin',
      nextActions: ['Add a supplier to get started'],
      missingSections: ['Basic Mandatory Fields', 'Advanced Mandatory Fields'],
    };
  }

  // Helper to check if a field is filled
  const isFieldFilled = (value: any): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return !isNaN(value) && value >= 0;
    if (typeof value === 'boolean') return true;
    return false;
  };

  // Calculate CBM per carton (same logic as in SupplierQuotesTab)
  const calculateCbmPerCarton = (quote: SupplierQuoteRow): number | null => {
    const { cartonLengthCm, cartonWidthCm, cartonHeightCm } = quote;
    if (cartonLengthCm && cartonWidthCm && cartonHeightCm) {
      return (cartonLengthCm * cartonWidthCm * cartonHeightCm) / 1_000_000;
    }
    return null;
  };

  // Calculate total CBM (same logic as in SupplierQuotesTab)
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

  // Count individual fields filled for granular progress
  let totalBasicScore = 0;
  let totalAdvancedScore = 0;
  const suppliersWithBasic: string[] = [];
  const suppliersWithAdvanced: string[] = [];
  
  console.log('[OrderReadiness] Evaluating suppliers:', supplierQuotes.length);
  
  supplierQuotes.forEach((supplier, index) => {
    // Count basic fields (8 total)
    const basicFields = [
      supplier.costPerUnitShortTerm ?? supplier.exwUnitCost,
      supplier.incoterms,
      supplier.moqShortTerm ?? supplier.moq,
      supplier.singleProductPackageLengthCm,
      supplier.singleProductPackageWidthCm,
      supplier.singleProductPackageHeightCm,
      supplier.singleProductPackageWeightKg,
      supplier.fbaFeePerUnit,
    ];
    const basicFieldsFilled = basicFields.filter(isFieldFilled).length;
    const basicFieldsTotal = basicFields.length; // 8
    const basicScore = (basicFieldsFilled / basicFieldsTotal) * 15; // Proportional score out of 15
    
    // Calculate CBM values (they're not stored, they're calculated)
    const cbmPerCarton = calculateCbmPerCarton(supplier);
    const totalCbm = calculateTotalCbm(supplier);
    
    // Count advanced fields (14 total - excluding moqLongTerm and costPerUnitLongTerm which are not in UI)
    const advancedFields = [
      supplier.sspCostPerUnit,
      supplier.labellingCostPerUnit,
      supplier.packagingCostPerUnit ?? supplier.packagingPerUnit,
      supplier.inspectionCostPerUnit ?? supplier.inspectionPerUnit,
      supplier.unitsPerCarton,
      supplier.cartonWeightKg,
      supplier.cartonLengthCm,
      supplier.cartonWidthCm,
      supplier.cartonHeightCm,
      supplier.freightCostPerUnit ?? supplier.ddpShippingPerUnit,
      supplier.dutyCostPerUnit,
      supplier.tariffCostPerUnit,
      cbmPerCarton, // Use calculated value
      totalCbm, // Use calculated value
    ];
    const advancedFieldsFilled = advancedFields.filter(isFieldFilled).length;
    const advancedFieldsTotal = advancedFields.length; // 14
    const advancedScore = (advancedFieldsFilled / advancedFieldsTotal) * 15; // Proportional score out of 15
    
    // Detailed field status for debugging
    const advancedFieldsStatus = {
      sspCostPerUnit: { value: supplier.sspCostPerUnit, filled: isFieldFilled(supplier.sspCostPerUnit) },
      labellingCostPerUnit: { value: supplier.labellingCostPerUnit, filled: isFieldFilled(supplier.labellingCostPerUnit) },
      packagingCostPerUnit: { value: supplier.packagingCostPerUnit ?? supplier.packagingPerUnit, filled: isFieldFilled(supplier.packagingCostPerUnit ?? supplier.packagingPerUnit) },
      inspectionCostPerUnit: { value: supplier.inspectionCostPerUnit ?? supplier.inspectionPerUnit, filled: isFieldFilled(supplier.inspectionCostPerUnit ?? supplier.inspectionPerUnit) },
      unitsPerCarton: { value: supplier.unitsPerCarton, filled: isFieldFilled(supplier.unitsPerCarton) },
      cartonWeightKg: { value: supplier.cartonWeightKg, filled: isFieldFilled(supplier.cartonWeightKg) },
      cartonLengthCm: { value: supplier.cartonLengthCm, filled: isFieldFilled(supplier.cartonLengthCm) },
      cartonWidthCm: { value: supplier.cartonWidthCm, filled: isFieldFilled(supplier.cartonWidthCm) },
      cartonHeightCm: { value: supplier.cartonHeightCm, filled: isFieldFilled(supplier.cartonHeightCm) },
      freightCostPerUnit: { value: supplier.freightCostPerUnit ?? supplier.ddpShippingPerUnit, filled: isFieldFilled(supplier.freightCostPerUnit ?? supplier.ddpShippingPerUnit) },
      dutyCostPerUnit: { value: supplier.dutyCostPerUnit, filled: isFieldFilled(supplier.dutyCostPerUnit) },
      tariffCostPerUnit: { value: supplier.tariffCostPerUnit, filled: isFieldFilled(supplier.tariffCostPerUnit) },
      cbmPerCarton: { value: cbmPerCarton, filled: isFieldFilled(cbmPerCarton), calculated: true },
      totalCbm: { value: totalCbm, filled: isFieldFilled(totalCbm), calculated: true },
    };
    
    console.log(`[OrderReadiness] Supplier ${index + 1} (${supplier.displayName || 'Unnamed'}):`, {
      basicFieldsFilled,
      basicFieldsTotal,
      basicScore,
      advancedFieldsFilled,
      advancedFieldsTotal,
      advancedScore,
      totalScore: basicScore + advancedScore,
      ADVANCED_DETAILS: advancedFieldsStatus,
    });
    
    totalBasicScore += basicScore;
    totalAdvancedScore += advancedScore;
    
    if (basicFieldsFilled === basicFieldsTotal) {
      suppliersWithBasic.push(supplier.displayName || supplier.supplierName || 'Unnamed');
    }
    if (advancedFieldsFilled === advancedFieldsTotal) {
      suppliersWithAdvanced.push(supplier.displayName || supplier.supplierName || 'Unnamed');
    }
  });

  // Average scores across all suppliers
  const avgBasicScore = totalBasicScore / supplierQuotes.length;
  const avgAdvancedScore = totalAdvancedScore / supplierQuotes.length;
  
  console.log('[OrderReadiness] Scores:', {
    totalSuppliers: supplierQuotes.length,
    suppliersWithBasic: suppliersWithBasic.length,
    suppliersWithAdvanced: suppliersWithAdvanced.length,
    avgBasicScore,
    avgAdvancedScore,
    totalScore: avgBasicScore + avgAdvancedScore,
    maxScore: 30,
  });

  // Find best supplier for Place Order checklist (used for navigation)
  let bestSupplier: SupplierQuoteRow | null = null;
  let bestSupplierScore = -1;
  
  supplierQuotes.forEach(supplier => {
    let supplierScore = 0;
    if (isInitialReady(supplier)) supplierScore += 15;
    if (isAdvancedReady(supplier)) supplierScore += 15;
    
    if (supplierScore > bestSupplierScore) {
      bestSupplierScore = supplierScore;
      bestSupplier = supplier;
    }
  });

  let score = 0;
  let maxScore = 0;
  const missingSections: string[] = [];
  const nextActions: string[] = [];

  // Milestone 1: Basic mandatory fields (averaged across all suppliers)
  maxScore += 15;
  score += avgBasicScore;
  
  if (avgBasicScore < 15) {
    const completedCount = suppliersWithBasic.length;
    const totalCount = supplierQuotes.length;
    missingSections.push(`Basic Fields (${completedCount}/${totalCount} suppliers)`);
    if (!nextActions.some(a => a.includes('MOQ') || a.includes('cost'))) {
      nextActions.push(`Complete basic fields for ${totalCount - completedCount} supplier${totalCount - completedCount > 1 ? 's' : ''}`);
    }
  }

  // Milestone 2: Advanced mandatory fields (averaged across all suppliers)
  maxScore += 15;
  score += avgAdvancedScore;
  
  if (avgAdvancedScore < 15) {
    const completedCount = suppliersWithAdvanced.length;
    const totalCount = supplierQuotes.length;
    missingSections.push(`Advanced Fields (${completedCount}/${totalCount} suppliers)`);
    if (!nextActions.some(a => a.includes('advanced'))) {
      nextActions.push(`Complete advanced fields for ${totalCount - completedCount} supplier${totalCount - completedCount > 1 ? 's' : ''}`);
    }
  }

  // Place Order sections are NOT included in base progress
  // Only basic and advanced fields count towards 100%
  // Place Order sections would be additional/optional tracking

  // Calculate percentage based on actual max score
  const percent = maxScore > 0 
    ? Math.min(Math.max(Math.round((score / maxScore) * 100), 0), 100)
    : 0;

  // Determine status and colors
  let status: OrderReadinessResult['status'];
  let colorClass: OrderReadinessResult['colorClass'];

  if (percent >= 90) {
    status = 'ORDER READY';
    colorClass = {
      ring: 'stroke-emerald-500',
      glow: 'drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]',
      text: 'text-emerald-400',
      bg: 'bg-emerald-900/20',
    };
  } else if (percent >= 70) {
    status = 'ALMOST READY';
    colorClass = {
      ring: 'stroke-yellow-500',
      glow: 'drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]',
      text: 'text-yellow-400',
      bg: 'bg-yellow-900/20',
    };
  } else if (percent >= 40) {
    status = 'NEEDS ATTENTION';
    colorClass = {
      ring: 'stroke-amber-500',
      glow: 'drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]',
      text: 'text-amber-400',
      bg: 'bg-amber-900/20',
    };
  } else {
    status = 'NOT READY';
    colorClass = {
      ring: 'stroke-red-500',
      glow: 'drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]',
      text: 'text-red-400',
      bg: 'bg-red-900/20',
    };
  }

  // Get dynamic message
  const message = getDynamicMessage(percent, missingSections, bestSupplier);

  // Limit next actions to 3
  const limitedNextActions = nextActions.slice(0, 3);

  // Determine navigation target (use best supplier for navigation)
  let navigationTarget: OrderReadinessResult['navigationTarget'];
  if (!bestSupplier || !isInitialReady(bestSupplier)) {
    navigationTarget = {
      tab: 'quotes',
      section: 'basic',
      supplierId: bestSupplier?.id,
    };
  } else if (bestSupplier && !isAdvancedReady(bestSupplier)) {
    navigationTarget = {
      tab: 'quotes',
      section: 'advanced',
      supplierId: bestSupplier?.id,
    };
  } else {
    navigationTarget = {
      tab: 'placeOrder',
      supplierId: bestSupplier?.id,
    };
  }

  return {
    percent,
    status,
    colorClass,
    message,
    nextActions: limitedNextActions,
    missingSections,
    navigationTarget,
  };
}

/**
 * Get dynamic message based on percent, missing sections, and supplier state
 */
function getDynamicMessage(
  percent: number,
  missingSections: string[],
  selectedSupplier: SupplierQuoteRow | null
): string {
  const messages: string[] = [];

  if (percent >= 90) {
    messages.push(
      'Order-ready suppliers detected - you\'re good to go.',
      'You\'re ready to place an order. Nice work.',
      'Everything\'s confirmed - generate your purchase order when you\'re ready.',
      'All set. If anything changes, update the checklist and re-export.'
    );
  } else if (percent >= 70) {
    messages.push(
      'Just a few details left.',
      'You\'re closer than you think.',
      'Almost there - finalize logistics.',
      'You\'re nearly order-ready - confirm the last details below.',
      'Strong progress - confirm the remaining items and you\'re done.'
    );
  } else if (percent >= 40) {
    messages.push(
      'Good start - now confirm the essentials.',
      'You\'re making progress. Next up: lock in your supplier terms.',
      'Action needed - confirm packaging and freight details.',
      'You\'re halfway there. Let\'s finalize the order basics.'
    );
  } else {
    messages.push(
      'Critical details still need attention - fix before ordering.',
      'Let\'s set the foundation first - confirm basic supplier terms.',
      'Hold up - key fields need confirmation before you can place an order.',
      'Start here: complete the required supplier details, then move to logistics.'
    );
  }

  // Select message based on hash of missing sections for variety
  const hash = missingSections.join(',').length;
  return messages[hash % messages.length];
}

