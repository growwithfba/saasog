import { getAllFields } from '@/components/Sourcing/tabs/placeOrder/placeOrderSchema';

export interface PlaceOrderProgressResult {
  percent: number;
  status: 'ALL CONFIRMED' | 'IN PROGRESS' | 'NOT STARTED';
  colorClass: {
    ring: string;
    glow: string;
    text: string;
    bg: string;
  };
  totalRequired: number;
  confirmedRequired: number;
  message: string;
}

/**
 * Calculate Place Order confirmation progress for a specific supplier
 * Tracks how many required fields from Place Order have been confirmed
 */
export function calculatePlaceOrderProgress(
  fieldsConfirmed: Record<string, Record<string, boolean>>,
  supplierId: string | null
): PlaceOrderProgressResult {
  // Get all required fields from schema
  const allFields = getAllFields();
  const requiredFields = allFields.filter(field => field.required);
  const totalRequired = requiredFields.length;

  // Get confirmations for this specific supplier
  const supplierConfirmations = supplierId && fieldsConfirmed[supplierId] ? fieldsConfirmed[supplierId] : {};

  // Count how many required fields are confirmed
  let confirmedRequired = 0;
  requiredFields.forEach(field => {
    if (supplierConfirmations[field.key] === true) {
      confirmedRequired++;
    }
  });

  // Calculate percentage
  const percent = totalRequired > 0 
    ? Math.round((confirmedRequired / totalRequired) * 100) 
    : 0;

  // Determine status and colors
  let status: PlaceOrderProgressResult['status'];
  let colorClass: PlaceOrderProgressResult['colorClass'];
  let message: string;

  if (percent === 100) {
    status = 'ALL CONFIRMED';
    colorClass = {
      ring: 'stroke-emerald-500',
      glow: 'drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]',
      text: 'text-emerald-400',
      bg: 'bg-emerald-900/20',
    };
    message = 'All required fields confirmed. Ready to generate Purchase Order.';
  } else if (percent >= 50) {
    status = 'IN PROGRESS';
    colorClass = {
      ring: 'stroke-blue-500',
      glow: 'drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]',
      text: 'text-blue-400',
      bg: 'bg-blue-900/20',
    };
    message = `${totalRequired - confirmedRequired} required field${totalRequired - confirmedRequired !== 1 ? 's' : ''} left to confirm.`;
  } else if (percent > 0) {
    status = 'IN PROGRESS';
    colorClass = {
      ring: 'stroke-yellow-500',
      glow: 'drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]',
      text: 'text-yellow-400',
      bg: 'bg-yellow-900/20',
    };
    message = `${totalRequired - confirmedRequired} required field${totalRequired - confirmedRequired !== 1 ? 's' : ''} left to confirm.`;
  } else {
    status = 'NOT STARTED';
    colorClass = {
      ring: 'stroke-slate-500',
      glow: 'drop-shadow-[0_0_8px_rgba(100,116,139,0.5)]',
      text: 'text-slate-400',
      bg: 'bg-slate-900/20',
    };
    message = 'Start confirming required fields in Place Order tab.';
  }

  return {
    percent,
    status,
    colorClass,
    totalRequired,
    confirmedRequired,
    message,
  };
}
