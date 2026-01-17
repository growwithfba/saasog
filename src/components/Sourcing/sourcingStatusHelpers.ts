/**
 * Helper functions for determining supplier status in the Sourcing list
 */

import type { SourcingData } from './types';

export type SupplierStatusLabel = 
  | 'Not Started' 
  | 'In Progress' 
  | 'Sample Ordered' 
  | 'Finalizing Order' 
  | 'Purchase Order Sent';

/**
 * Check if supplier has any meaningful data entered
 */
export function hasSupplierData(sourcing: SourcingData | null): boolean {
  if (!sourcing) return false;
  
  // Check if any supplier quotes exist with meaningful data
  if (sourcing.supplierQuotes.length === 0) return false;
  
  // Check if any supplier has at least one meaningful field filled
  return sourcing.supplierQuotes.some(quote => {
    return !!(
      quote.supplierName?.trim() ||
      quote.companyName?.trim() ||
      quote.alibabaUrl?.trim() ||
      quote.supplierAddress?.trim() ||
      quote.supplierContactNumber?.trim() ||
      quote.supplierEmail?.trim() ||
      quote.costPerUnitShortTerm !== null ||
      quote.moqShortTerm !== null ||
      quote.incoterms?.trim() ||
      quote.leadTime?.trim() ||
      quote.paymentTerms?.trim()
    );
  });
}

/**
 * Check if any supplier has sampleOrdered set to true
 */
export function hasSampleOrdered(sourcing: SourcingData | null): boolean {
  if (!sourcing) return false;
  
  // Check profitCalculator first (global sample ordered flag)
  if (sourcing.profitCalculator?.sampleOrdered === true) {
    return true;
  }
  
  // Check supplier quotes for sampleOrdered
  return sourcing.supplierQuotes.some(quote => {
    if (quote.sampleOrdered === true || quote.sampleOrdered === 'Yes') {
      return true;
    }
    return false;
  });
}

/**
 * Check if Place Order tab has been started
 * (user has selected a supplier AND entered at least one place-order field)
 */
export function hasStartedPlaceOrder(productId: string, sourcing: SourcingData | null): boolean {
  if (!sourcing) return false;
  
  // Check if there's a selected supplier in Place Order draft
  try {
    const placeOrderDraft = typeof window !== 'undefined' 
      ? localStorage.getItem(`placeOrderDraft_${productId}`)
      : null;
    
    if (placeOrderDraft) {
      const parsed = JSON.parse(placeOrderDraft);
      const hasSelectedSupplier = !!parsed.selectedSupplierId;
      
      // Check if any place order data exists
      const hasPlaceOrderData = !!(
        parsed.orderQuantity !== null ||
        parsed.finalTier !== null ||
        (parsed.confirmedItems && parsed.confirmedItems.length > 0) ||
        (parsed.overrides && Object.keys(parsed.overrides).length > 0) ||
        (parsed.notes && Object.values(parsed.notes).some((note: any) => note?.trim().length > 0))
      );
      
      return hasSelectedSupplier && hasPlaceOrderData;
    }
  } catch {
    // If we can't parse, assume not started
  }
  
  return false;
}

/**
 * Check if purchase order has been downloaded
 */
export function hasPurchaseOrderDownloaded(sourcing: SourcingData | null): boolean {
  if (!sourcing) return false;
  return sourcing.purchaseOrderDownloaded === true || !!sourcing.purchaseOrderDownloadedAt;
}

/**
 * Get the supplier status for a product based on priority order
 * Priority (highest wins):
 * 1. Purchase Order Sent
 * 2. Finalizing Order
 * 3. Sample Ordered
 * 4. In Progress
 * 5. Not Started
 */
export function getSupplierStatus(
  productId: string,
  sourcing: SourcingData | null
): SupplierStatusLabel {
  // Priority 1: Purchase Order Sent
  if (hasPurchaseOrderDownloaded(sourcing)) {
    return 'Purchase Order Sent';
  }
  
  // Priority 2: Finalizing Order
  if (hasStartedPlaceOrder(productId, sourcing)) {
    return 'Finalizing Order';
  }
  
  // Priority 3: Sample Ordered
  if (hasSampleOrdered(sourcing)) {
    return 'Sample Ordered';
  }
  
  // Priority 4: In Progress
  if (hasSupplierData(sourcing)) {
    return 'In Progress';
  }
  
  // Priority 5: Not Started (default)
  return 'Not Started';
}

/**
 * Get badge styling classes for a supplier status
 */
export function getSupplierStatusBadge(status: SupplierStatusLabel): string {
  switch (status) {
    case 'Purchase Order Sent':
      return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-200 dark:border-emerald-500/20';
    case 'Finalizing Order':
      return 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-500 border-purple-200 dark:border-purple-500/20';
    case 'Sample Ordered':
      return 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-500 border-cyan-200 dark:border-cyan-500/20';
    case 'In Progress':
      return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-200 dark:border-amber-500/20';
    case 'Not Started':
    default:
      return 'bg-gray-50 dark:bg-slate-500/10 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-500/20';
  }
}
