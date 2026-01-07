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
  selectedSupplierId: string | null;
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
 * - Basic mandatory fields (15 points)
 * - Advanced mandatory fields (15 points)
 * - Place Order sections (10 points each for 7 sections = 70 points)
 */
export function calculateOrderReadiness(
  supplierQuotes: SupplierQuoteRow[],
  placeOrderState?: PlaceOrderState
): OrderReadinessResult {
  const selectedSupplierId = placeOrderState?.selectedSupplierId;
  const selectedSupplier = selectedSupplierId 
    ? supplierQuotes.find(q => q.id === selectedSupplierId)
    : null;

  let score = 0;
  const missingSections: string[] = [];
  const nextActions: string[] = [];

  // Milestone 1: Basic mandatory fields (15 points)
  if (selectedSupplier) {
    if (isInitialReady(selectedSupplier)) {
      score += 15;
    } else {
      missingSections.push('Basic Mandatory Fields');
      if (!nextActions.some(a => a.includes('MOQ') || a.includes('cost'))) {
        nextActions.push('Confirm MOQ + cost per unit');
      }
    }
  } else {
    missingSections.push('Basic Mandatory Fields');
    if (!nextActions.some(a => a.includes('supplier'))) {
      nextActions.push('Select a supplier and confirm basic terms');
    }
  }

  // Milestone 2: Advanced mandatory fields (15 points)
  if (selectedSupplier) {
    if (isAdvancedReady(selectedSupplier)) {
      score += 15;
    } else {
      if (isInitialReady(selectedSupplier)) {
        missingSections.push('Advanced Mandatory Fields');
        if (!nextActions.some(a => a.includes('advanced'))) {
          nextActions.push('Complete advanced supplier details');
        }
      }
    }
  } else {
    // No supplier selected, so can't complete advanced
    missingSections.push('Advanced Mandatory Fields');
  }

  // Place Order sections (10 points each)
  if (placeOrderState && selectedSupplier) {
    const checklistItems = placeOrderState.checklistItems || [];
    const confirmedItems = placeOrderState.confirmedItems || new Set<string>();

    // Section A: Supplier & Order Basics (10 points)
    const sectionAItems = checklistItems.filter(item => item.section === 'A');
    const sectionARequired = sectionAItems.filter(item => item.required);
    const sectionAConfirmed = sectionARequired.filter(item => 
      confirmedItems.has(item.id) || item.finalAgreedValue !== null
    );
    const sectionAScore = sectionARequired.length > 0 
      ? (sectionAConfirmed.length / sectionARequired.length) * 10 
      : 10; // If no required items, give full points
    score += sectionAScore;
    if (sectionAScore < 10) {
      missingSections.push('Supplier & Order Basics');
      if (!nextActions.some(a => a.includes('incoterms'))) {
        nextActions.push('Confirm incoterms and supplier terms');
      }
    }

    // Section B: Pricing & Quantities (10 points)
    const sectionBItems = checklistItems.filter(item => item.section === 'B');
    const sectionBRequired = sectionBItems.filter(item => item.required);
    const sectionBConfirmed = sectionBRequired.filter(item => 
      confirmedItems.has(item.id) || item.finalAgreedValue !== null
    );
    const sectionBScore = sectionBRequired.length > 0 
      ? (sectionBConfirmed.length / sectionBRequired.length) * 10 
      : 10;
    score += sectionBScore;
    if (sectionBScore < 10) {
      missingSections.push('Pricing & Quantities');
      if (!nextActions.some(a => a.includes('MOQ') || a.includes('cost'))) {
        nextActions.push('Confirm order quantity and pricing');
      }
    }

    // Section C: Unit Packaging (10 points)
    const sectionCItems = checklistItems.filter(item => item.section === 'C');
    const sectionCRequired = sectionCItems.filter(item => item.required);
    const sectionCConfirmed = sectionCRequired.filter(item => 
      confirmedItems.has(item.id) || item.finalAgreedValue !== null
    );
    const sectionCScore = sectionCRequired.length > 0 
      ? (sectionCConfirmed.length / sectionCRequired.length) * 10 
      : 10;
    score += sectionCScore;
    if (sectionCScore < 10) {
      missingSections.push('Product Package Information');
      if (!nextActions.some(a => a.includes('package') || a.includes('dimensions'))) {
        nextActions.push('Confirm packaging dimensions + weight');
      }
    }

    // Section D: Carton Information (10 points)
    const sectionDItems = checklistItems.filter(item => item.section === 'D');
    const sectionDRequired = sectionDItems.filter(item => item.required);
    const sectionDConfirmed = sectionDRequired.filter(item => 
      confirmedItems.has(item.id) || item.finalAgreedValue !== null
    );
    const sectionDScore = sectionDRequired.length > 0 
      ? (sectionDConfirmed.length / sectionDRequired.length) * 10 
      : 10;
    score += sectionDScore;
    if (sectionDScore < 10) {
      missingSections.push('Carton Information');
      if (!nextActions.some(a => a.includes('carton'))) {
        nextActions.push('Add carton dimensions + units/carton');
      }
    }

    // Section E: Freight & Compliance (10 points)
    const sectionEItems = checklistItems.filter(item => item.section === 'E');
    const sectionERequired = sectionEItems.filter(item => item.required);
    const sectionEConfirmed = sectionERequired.filter(item => 
      confirmedItems.has(item.id) || item.finalAgreedValue !== null
    );
    const sectionEScore = sectionERequired.length > 0 
      ? (sectionEConfirmed.length / sectionERequired.length) * 10 
      : 10;
    score += sectionEScore;
    if (sectionEScore < 10) {
      missingSections.push('Freight & Compliance');
      if (!nextActions.some(a => a.includes('freight') || a.includes('incoterms'))) {
        nextActions.push('Confirm incoterms and freight costs');
      }
    }

    // Section F: Super Selling Points (10 points)
    const sectionFItems = checklistItems.filter(item => item.section === 'F');
    const sectionFRequired = sectionFItems.filter(item => item.required);
    const sectionFConfirmed = sectionFRequired.filter(item => 
      confirmedItems.has(item.id) || item.finalAgreedValue !== null
    );
    const sectionFScore = sectionFRequired.length > 0 
      ? (sectionFConfirmed.length / sectionFRequired.length) * 10 
      : 10;
    score += sectionFScore;
    if (sectionFScore < 10 && selectedSupplier.ssps && selectedSupplier.ssps.length === 0) {
      missingSections.push('Super Selling Points');
      if (!nextActions.some(a => a.includes('SSP'))) {
        nextActions.push('Add SSPs (at least 1)');
      }
    }

    // FBA Fees (10 points) - Check if FBA fee is confirmed
    const fbaFeeConfirmed = selectedSupplier.fbaFeePerUnit !== null && 
      selectedSupplier.fbaFeePerUnit !== undefined &&
      !isNaN(selectedSupplier.fbaFeePerUnit);
    const fbaScore = fbaFeeConfirmed ? 10 : 0;
    score += fbaScore;
    if (!fbaFeeConfirmed) {
      missingSections.push('FBA Fees');
      if (!nextActions.some(a => a.includes('FBA'))) {
        nextActions.push('Confirm FBA fees');
      }
    }
  } else {
    // No Place Order state - missing all sections
    missingSections.push('Place Order Checklist');
    if (!selectedSupplier) {
      nextActions.push('Select a supplier to begin');
    } else {
      nextActions.push('Complete Place Order checklist');
    }
  }

  // Clamp score to 0-100
  const percent = Math.min(Math.max(Math.round(score), 0), 100);

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
  const message = getDynamicMessage(percent, missingSections, selectedSupplier);

  // Limit next actions to 3
  const limitedNextActions = nextActions.slice(0, 3);

  // Determine navigation target
  let navigationTarget: OrderReadinessResult['navigationTarget'];
  if (!selectedSupplier || !isInitialReady(selectedSupplier)) {
    navigationTarget = {
      tab: 'quotes',
      section: 'basic',
      supplierId: selectedSupplierId || undefined,
    };
  } else if (selectedSupplier && !isAdvancedReady(selectedSupplier)) {
    navigationTarget = {
      tab: 'quotes',
      section: 'advanced',
      supplierId: selectedSupplierId || undefined,
    };
  } else {
    navigationTarget = {
      tab: 'placeOrder',
      supplierId: selectedSupplierId || undefined,
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

