/**
 * Value Mapper - Maps Place Order schema fields to actual data sources
 * 
 * Handles:
 * - Mapped fields: values from Supplier Quotes / Profit Overview
 * - Non-mapped fields: values from local state (Place Order draft)
 * - Auto-calculated fields: computed values
 */

import type { SupplierQuoteRow, SourcingHubData } from '../../types';
import type { PlaceOrderField } from './placeOrderSchema';
import { formatCurrency } from '@/utils/formatters';
import { calculateQuoteMetrics } from '../SupplierQuotesTab';

export interface ValueSource {
  value: string | null;
  source: 'supplier_quote' | 'profit_overview' | 'product_data' | 'local' | 'calculated';
  isMapped: boolean;
}

export interface ValueMapperContext {
  selectedSupplier: SupplierQuoteRow | null;
  supplierWithMetrics: SupplierQuoteRow | null;
  productData: any;
  hubData?: SourcingHubData;
  orderQuantity: number | null;
  effectiveTier: 'short' | 'medium' | 'long';
  localOverrides: Record<string, string>; // fieldKey -> value
}

/**
 * Get the current value for a field
 */
export function getFieldValue(
  field: PlaceOrderField,
  context: ValueMapperContext
): ValueSource {
  // Check for local override first
  if (context.localOverrides[field.key] !== undefined) {
    return {
      value: context.localOverrides[field.key] || null,
      source: 'local',
      isMapped: false,
    };
  }

  // Handle auto-calculated fields
  if (field.autoCalculated) {
    const calculated = calculateAutoField(field, context);
    return {
      value: calculated,
      source: 'calculated',
      isMapped: false,
    };
  }

  // Handle mapped fields
  if (field.mapped) {
    const mapped = getMappedValue(field, context);
    return {
      value: mapped.value,
      source: mapped.source,
      isMapped: true,
    };
  }

  // Non-mapped fields - check if stored in placeOrderFields
  const storedValue = getPlaceOrderFieldValue(field, context);
  if (storedValue !== null) {
    return {
      value: storedValue,
      source: 'supplier_quote',
      isMapped: false,
    };
  }

  // Non-mapped fields return null (user must enter)
  return {
    value: null,
    source: 'local',
    isMapped: false,
  };
}

/**
 * Get value from placeOrderFields object in supplier quote
 */
function getPlaceOrderFieldValue(
  field: PlaceOrderField,
  context: ValueMapperContext
): string | null {
  const { selectedSupplier } = context;
  
  if (!selectedSupplier?.placeOrderFields) {
    return null;
  }
  
  const fieldMap: Record<string, keyof NonNullable<typeof selectedSupplier.placeOrderFields>> = {
    'brand_name': 'brandName',
    'company_address': 'companyAddress',
    'company_phone_number': 'companyPhoneNumber',
    'purchase_order_number': 'purchaseOrderNumber',
    'product_sku': 'productSku',
    'product_size': 'productSize',
    'color': 'color',
    'material_used': 'materialUsed',
    'brand_name_product': 'brandNameProduct',
    'brand_logo': 'brandLogo',
    'brand_logo_sent': 'brandLogoSent',
    'upc_fnsku': 'upcFnsku',
    'additional_details': 'additionalDetails',
    'sample_refund_agreed': 'sampleRefundAgreed',
    'inspection_agreed': 'inspectionAgreed',
    'product_label_agreed': 'productLabelAgreed',
    'packaging_type': 'packagingType',
    'package_design': 'packageDesign',
    'units_per_package': 'unitsPerPackage',
    'product_label_sent': 'productLabelSent',
    'freight_forwarder': 'freightForwarder',
    'shipping_time': 'shippingTime',
    'hts_code': 'htsCode',
    'duty_rate': 'dutyRate',
    'tariff_code': 'tariffCode',
    'additional_customs_documents': 'additionalCustomsDocuments',
    'additional_notes_for_supplier': 'additionalNotesForSupplier',
  };
  
  const mappedKey = fieldMap[field.key];
  if (mappedKey) {
    return selectedSupplier.placeOrderFields[mappedKey] || null;
  }
  
  return null;
}

/**
 * Get mapped value from Supplier Quotes / Profit Overview
 */
function getMappedValue(
  field: PlaceOrderField,
  context: ValueMapperContext
): { value: string | null; source: ValueSource['source'] } {
  const { selectedSupplier, supplierWithMetrics, productData, hubData, orderQuantity, effectiveTier } = context;

  if (!selectedSupplier) {
    return { value: null, source: 'supplier_quote' };
  }

  // Map field keys to supplier quote / product data fields
  switch (field.key) {
    // User Company Information (mapped from supplier)
    case 'your_name':
      return { value: selectedSupplier.displayName || selectedSupplier.supplierName || null, source: 'supplier_quote' };
    case 'company_name':
      return { value: selectedSupplier.companyName || null, source: 'supplier_quote' };
    
    // Supplier Information
    case 'supplier_name':
      return { value: selectedSupplier.displayName || selectedSupplier.supplierName || null, source: 'supplier_quote' };
    case 'supplier_company_name':
      return { value: selectedSupplier.companyName || null, source: 'supplier_quote' };
    case 'supplier_address':
      return { value: selectedSupplier.supplierAddress || null, source: 'supplier_quote' };
    case 'supplier_contact_number':
      return { value: selectedSupplier.supplierContactNumber || null, source: 'supplier_quote' };
    case 'supplier_email':
      return { value: selectedSupplier.supplierEmail || null, source: 'supplier_quote' };

    // Product Information
    case 'product_name':
      return { value: productData?.display_title || productData?.title || null, source: 'product_data' };

    // FBA Fees
    case 'fba_fee':
      return { 
        value: selectedSupplier.fbaFeePerUnit !== null 
          ? formatCurrency(selectedSupplier.fbaFeePerUnit) 
          : null, 
        source: 'supplier_quote' 
      };
    case 'referral_fee':
      const category = hubData?.categoryOverride || productData?.category || '';
      // Priority: 1. selectedSupplier (user edited), 2. hubData, 3. productData
      const referralFeePct = selectedSupplier.referralFeePct ?? hubData?.referralFeePct ?? (productData?.referralFeePct ?? null);
      const salesPrice = hubData?.targetSalesPrice ?? productData?.price ?? productData?.salesPrice ?? selectedSupplier.salesPrice ?? null;
      if (salesPrice && referralFeePct !== null) {
        return { value: formatCurrency(salesPrice * referralFeePct), source: 'supplier_quote' };
      }
      return { value: null, source: 'profit_overview' };

    // Order Basics
    case 'moq': {
      let moq: number | null = null;
      if (effectiveTier === 'medium' && selectedSupplier.moqMediumTerm !== null) {
        moq = selectedSupplier.moqMediumTerm;
      } else if (effectiveTier === 'long' && selectedSupplier.moqLongTerm !== null) {
        moq = selectedSupplier.moqLongTerm;
      } else {
        moq = selectedSupplier.moqShortTerm ?? selectedSupplier.moq ?? null;
      }
      return { value: moq?.toString() || null, source: 'supplier_quote' };
    }
    case 'cost_price': {
      let costPerUnit: number | null = null;
      if (effectiveTier === 'medium' && selectedSupplier.costPerUnitMediumTerm !== null) {
        costPerUnit = selectedSupplier.costPerUnitMediumTerm;
      } else if (effectiveTier === 'long' && selectedSupplier.costPerUnitLongTerm !== null) {
        costPerUnit = selectedSupplier.costPerUnitLongTerm;
      } else {
        const effectiveIncoterms = selectedSupplier.incotermsAgreed || selectedSupplier.incoterms || 'DDP';
        costPerUnit = (effectiveIncoterms === 'DDP' && selectedSupplier.ddpPrice && selectedSupplier.ddpPrice > 0)
          ? selectedSupplier.ddpPrice
          : (selectedSupplier.costPerUnitShortTerm ?? selectedSupplier.exwUnitCost ?? null);
      }
      return { value: costPerUnit ? formatCurrency(costPerUnit) : null, source: 'supplier_quote' };
    }
    case 'total_price': {
      const costPerUnit = getCostPerUnit(selectedSupplier, effectiveTier);
      const qty = orderQuantity ?? getMOQ(selectedSupplier, effectiveTier);
      if (costPerUnit && qty) {
        return { value: formatCurrency(costPerUnit * qty), source: 'supplier_quote' };
      }
      return { value: null, source: 'supplier_quote' };
    }
    case 'lead_time':
      return { value: selectedSupplier.leadTime || null, source: 'supplier_quote' };
    case 'payment_terms':
      return { value: selectedSupplier.paymentTerms || null, source: 'supplier_quote' };
    case 'incoterms':
      return { 
        value: selectedSupplier.incotermsAgreed || selectedSupplier.incoterms || null, 
        source: 'supplier_quote' 
      };

    // Product Package Information
    case 'unit_package_dimensions': {
      const { singleProductPackageLengthCm, singleProductPackageWidthCm, singleProductPackageHeightCm } = selectedSupplier;
      if (singleProductPackageLengthCm && singleProductPackageWidthCm && singleProductPackageHeightCm) {
        return { 
          value: `${singleProductPackageLengthCm}×${singleProductPackageWidthCm}×${singleProductPackageHeightCm}`, 
          source: 'supplier_quote' 
        };
      }
      return { value: null, source: 'supplier_quote' };
    }
    case 'unit_package_weight':
      return { 
        value: selectedSupplier.singleProductPackageWeightKg 
          ? `${selectedSupplier.singleProductPackageWeightKg} kg` 
          : null, 
        source: 'supplier_quote' 
      };
    case 'packaging_cost':
      return { 
        value: selectedSupplier.packagingCostPerUnit !== null 
          ? formatCurrency(selectedSupplier.packagingCostPerUnit) 
          : null, 
        source: 'supplier_quote' 
      };
    case 'labelling_cost':
      return { 
        value: selectedSupplier.labellingCostPerUnit !== null 
          ? formatCurrency(selectedSupplier.labellingCostPerUnit) 
          : null, 
        source: 'supplier_quote' 
      };

    // Super Selling Points
    case 'functional_changes':
    case 'quality_changes':
    case 'aesthetic_changes':
    case 'bundling_changes':
    case 'quantity_changes': {
      // Extract from ssps array or sspsDiscussed
      const ssps = selectedSupplier.ssps || [];
      const sspType = field.key.replace('_changes', '').replace('functional', 'Functional').replace('quality', 'Quality').replace('aesthetic', 'Aesthetic').replace('bundling', 'Bundling').replace('quantity', 'Quantity');
      const matchingSsp = ssps.find((s: any) => s.type === sspType);
      return { value: matchingSsp?.description || null, source: 'supplier_quote' };
    }

    // Carton Information
    case 'carton_dimensions': {
      const { cartonLengthCm, cartonWidthCm, cartonHeightCm } = selectedSupplier;
      if (cartonLengthCm && cartonWidthCm && cartonHeightCm) {
        return { 
          value: `${cartonLengthCm}×${cartonWidthCm}×${cartonHeightCm}`, 
          source: 'supplier_quote' 
        };
      }
      return { value: null, source: 'supplier_quote' };
    }
    case 'carton_weight':
      return { 
        value: selectedSupplier.cartonWeightKg 
          ? `${selectedSupplier.cartonWeightKg} kg` 
          : null, 
        source: 'supplier_quote' 
      };
    case 'units_per_carton':
      return { 
        value: selectedSupplier.unitsPerCarton?.toString() || null, 
        source: 'supplier_quote' 
      };

    // Freight & Compliance
    case 'incoterms_freight':
      return { 
        value: selectedSupplier.incotermsAgreed || selectedSupplier.incoterms || null, 
        source: 'supplier_quote' 
      };
    case 'freight_cost_per_unit':
      return { 
        value: selectedSupplier.freightCostPerUnit !== null 
          ? formatCurrency(selectedSupplier.freightCostPerUnit) 
          : (selectedSupplier.ddpShippingPerUnit !== null 
            ? formatCurrency(selectedSupplier.ddpShippingPerUnit) 
            : null), 
        source: 'supplier_quote' 
      };
    case 'duty_cost_per_unit':
      return { 
        value: selectedSupplier.dutyCostPerUnit !== null 
          ? formatCurrency(selectedSupplier.dutyCostPerUnit) 
          : null, 
        source: 'supplier_quote' 
      };
    case 'tariff_cost_per_unit':
      return { 
        value: selectedSupplier.tariffCostPerUnit !== null 
          ? formatCurrency(selectedSupplier.tariffCostPerUnit) 
          : null, 
        source: 'supplier_quote' 
      };

    default:
      return { value: null, source: 'supplier_quote' };
  }
}

/**
 * Calculate auto-calculated fields
 */
function calculateAutoField(
  field: PlaceOrderField,
  context: ValueMapperContext
): string | null {
  const { selectedSupplier, orderQuantity, effectiveTier } = context;

  if (!selectedSupplier) return null;

  switch (field.key) {
    case 'proforma_invoice_total': {
      const costPerUnit = getCostPerUnit(selectedSupplier, effectiveTier);
      const qty = orderQuantity ?? getMOQ(selectedSupplier, effectiveTier);
      if (costPerUnit && qty) {
        return formatCurrency(costPerUnit * qty);
      }
      return null;
    }
    case 'total_cartons': {
      const qty = orderQuantity ?? getMOQ(selectedSupplier, effectiveTier);
      const unitsPerCarton = selectedSupplier.unitsPerCarton;
      if (qty && unitsPerCarton && unitsPerCarton > 0) {
        return Math.ceil(qty / unitsPerCarton).toString();
      }
      return null;
    }
    case 'cbm_per_carton': {
      const { cartonLengthCm, cartonWidthCm, cartonHeightCm } = selectedSupplier;
      if (cartonLengthCm && cartonWidthCm && cartonHeightCm) {
        const cbm = (cartonLengthCm * cartonWidthCm * cartonHeightCm) / 1_000_000;
        return cbm.toFixed(4);
      }
      return null;
    }
    case 'total_cbm': {
      const qty = orderQuantity ?? getMOQ(selectedSupplier, effectiveTier);
      const unitsPerCarton = selectedSupplier.unitsPerCarton;
      const { cartonLengthCm, cartonWidthCm, cartonHeightCm } = selectedSupplier;
      if (qty && unitsPerCarton && cartonLengthCm && cartonWidthCm && cartonHeightCm) {
        const cbmPerCarton = (cartonLengthCm * cartonWidthCm * cartonHeightCm) / 1_000_000;
        const totalCartons = Math.ceil(qty / unitsPerCarton);
        return (cbmPerCarton * totalCartons).toFixed(4);
      }
      return null;
    }
    default:
      return null;
  }
}

// Helper functions
function getCostPerUnit(quote: SupplierQuoteRow, tier: 'short' | 'medium' | 'long'): number | null {
  if (tier === 'medium' && quote.costPerUnitMediumTerm !== null) {
    return quote.costPerUnitMediumTerm;
  }
  if (tier === 'long' && quote.costPerUnitLongTerm !== null) {
    return quote.costPerUnitLongTerm;
  }
  const effectiveIncoterms = quote.incotermsAgreed || quote.incoterms || 'DDP';
  if (effectiveIncoterms === 'DDP' && quote.ddpPrice && quote.ddpPrice > 0) {
    return quote.ddpPrice;
  }
  return quote.costPerUnitShortTerm ?? quote.exwUnitCost ?? null;
}

function getMOQ(quote: SupplierQuoteRow, tier: 'short' | 'medium' | 'long'): number | null {
  if (tier === 'medium' && quote.moqMediumTerm !== null) {
    return quote.moqMediumTerm;
  }
  if (tier === 'long' && quote.moqLongTerm !== null) {
    return quote.moqLongTerm;
  }
  return quote.moqShortTerm ?? quote.moq ?? null;
}
