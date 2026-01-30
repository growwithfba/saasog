'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Download,
  FileText,
} from 'lucide-react';
import type { SupplierQuoteRow, SourcingHubData } from '../types';
import { calculateQuoteMetrics } from './SupplierQuotesTab';
import { formatCurrency } from '@/utils/formatters';
import { getReferralFeePct } from '@/utils/referralFees';
import { generatePurchaseOrderPDF } from './placeOrder/pdf';
import { PlaceOrderChecklist } from './placeOrder/PlaceOrderChecklist';
import { PLACE_ORDER_SCHEMA, getAllFields } from './placeOrder/placeOrderSchema';
import { getFieldValue, type ValueMapperContext } from './placeOrder/valueMapper';

interface PlaceOrderTabProps {
  productId: string;
  productData: any;
  supplierQuotes: SupplierQuoteRow[];
  hubData?: SourcingHubData;
  fieldsConfirmed?: Record<string, Record<string, boolean>>; // Field confirmations from DB per supplier
  onDirtyChange?: (isDirty: boolean) => void;
  onPurchaseOrderDownloaded?: () => void;
  onChange?: (quotes: SupplierQuoteRow[]) => void; // For updating supplier quotes
  onFieldsConfirmedChange?: (fieldsConfirmed: Record<string, Record<string, boolean>>) => void; // For updating field confirmations
  onSelectedSupplierChange?: (supplierId: string | null) => void; // Notify parent of selected supplier change
}

interface PlaceOrderDraft {
  selectedSupplierId: string | null;
  orderQuantity: number | null;
  finalTier: 'short' | 'medium' | 'long' | null;
  confirmedFields: Set<string>; // fieldKey -> confirmed
  overrides: Record<string, string>; // fieldKey -> overridden value
  editingField: string | null; // fieldKey currently being edited
}

/**
 * Map Place Order field key back to Supplier Quote properties
 * Returns updates object to apply to supplier quote
 */
function mapFieldToSupplierQuote(
  fieldKey: string,
  value: string,
  tier: 'short' | 'medium' | 'long',
  salesPrice?: number | null
): Partial<SupplierQuoteRow> | null {
  const trimmedValue = value.trim();
  
  // Helper to parse currency values
  const parseCurrency = (val: string): number | null => {
    const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? null : num;
  };
  
  // Helper to parse dimensions (e.g., "30×40×50")
  const parseDimensions = (val: string): { length: number; width: number; height: number } | null => {
    const parts = val.split(/[×x,\s]+/).map(p => parseFloat(p.trim())).filter(n => !isNaN(n));
    if (parts.length >= 3) {
      return { length: parts[0], width: parts[1], height: parts[2] };
    }
    return null;
  };
  
  // Helper to parse weight (e.g., "2.5 kg" -> 2.5)
  const parseWeight = (val: string): number | null => {
    const num = parseFloat(val.replace(/[^0-9.]/g, ''));
    return isNaN(num) ? null : num;
  };
  
  switch (fieldKey) {
    // Supplier Information
    case 'supplier_name':
      return { displayName: trimmedValue || null, supplierName: trimmedValue || null };
    case 'supplier_company_name':
      return { companyName: trimmedValue || null };
    case 'supplier_address':
      return { supplierAddress: trimmedValue || null };
    case 'supplier_contact_number':
      return { supplierContactNumber: trimmedValue || null };
    case 'supplier_email':
      return { supplierEmail: trimmedValue || null };
    
    // Order Basics
    case 'moq': {
      const moq = parseInt(trimmedValue);
      if (isNaN(moq)) return null;
      if (tier === 'medium') {
        return { moqMediumTerm: moq };
      } else if (tier === 'long') {
        return { moqLongTerm: moq };
      } else {
        return { moqShortTerm: moq, moq: moq };
      }
    }
    case 'cost_price': {
      const cost = parseCurrency(trimmedValue);
      if (cost === null) return null;
      if (tier === 'medium') {
        return { costPerUnitMediumTerm: cost };
      } else if (tier === 'long') {
        return { costPerUnitLongTerm: cost };
      } else {
        return { costPerUnitShortTerm: cost, exwUnitCost: cost };
      }
    }
    case 'lead_time':
      return { leadTime: trimmedValue || null };
    case 'payment_terms':
      return { paymentTerms: trimmedValue || null };
    case 'incoterms':
    case 'incoterms_freight':
      return { incotermsAgreed: trimmedValue || null };
    
    // Product Package Information
    case 'unit_package_dimensions': {
      const dims = parseDimensions(trimmedValue);
      if (!dims) return null;
      return {
        singleProductPackageLengthCm: dims.length,
        singleProductPackageWidthCm: dims.width,
        singleProductPackageHeightCm: dims.height,
      };
    }
    case 'unit_package_weight': {
      const weight = parseWeight(trimmedValue);
      return weight !== null ? { singleProductPackageWeightKg: weight } : null;
    }
    case 'packaging_cost': {
      const cost = parseCurrency(trimmedValue);
      return cost !== null ? { packagingCostPerUnit: cost } : null;
    }
    case 'labelling_cost': {
      const cost = parseCurrency(trimmedValue);
      return cost !== null ? { labellingCostPerUnit: cost } : null;
    }
    
    // Carton Information
    case 'carton_dimensions': {
      const dims = parseDimensions(trimmedValue);
      if (!dims) return null;
      return {
        cartonLengthCm: dims.length,
        cartonWidthCm: dims.width,
        cartonHeightCm: dims.height,
      };
    }
    case 'carton_weight': {
      const weight = parseWeight(trimmedValue);
      return weight !== null ? { cartonWeightKg: weight } : null;
    }
    case 'units_per_carton': {
      const units = parseInt(trimmedValue);
      return !isNaN(units) ? { unitsPerCarton: units } : null;
    }
    
    // Freight & Compliance
    case 'freight_cost_per_unit': {
      const cost = parseCurrency(trimmedValue);
      return cost !== null ? { freightCostPerUnit: cost } : null;
    }
    case 'duty_cost_per_unit': {
      const cost = parseCurrency(trimmedValue);
      return cost !== null ? { dutyCostPerUnit: cost } : null;
    }
    case 'tariff_cost_per_unit': {
      const cost = parseCurrency(trimmedValue);
      return cost !== null ? { tariffCostPerUnit: cost } : null;
    }
    
    // FBA Fees
    case 'fba_fee': {
      const cost = parseCurrency(trimmedValue);
      return cost !== null ? { fbaFeePerUnit: cost } : null;
    }
    case 'referral_fee': {
      // User edits the dollar amount, but we need to save it as a percentage
      const feeAmount = parseCurrency(trimmedValue);
      if (feeAmount === null || !salesPrice || salesPrice === 0) {
        console.log('[mapFieldToSupplierQuote] referral_fee: Invalid values', { feeAmount, salesPrice });
        return null;
      }
      const feePct = feeAmount / salesPrice;
      console.log('[mapFieldToSupplierQuote] referral_fee calculated:', { 
        feeAmount, 
        salesPrice, 
        feePct,
        feeAmountRaw: trimmedValue 
      });
      return { referralFeePct: feePct };
    }
    
    // Place Order specific fields (non-mapped)
    case 'your_name':
      return { placeOrderFields: { yourName: trimmedValue || undefined } };
    case 'company_name':
      return { placeOrderFields: { companyName: trimmedValue || undefined } };
    case 'brand_name':
      return { placeOrderFields: { brandName: trimmedValue || undefined } };
    case 'company_address':
      return { placeOrderFields: { companyAddress: trimmedValue || undefined } };
    case 'company_phone_number':
      return { placeOrderFields: { companyPhoneNumber: trimmedValue || undefined } };
    case 'purchase_order_number':
      return { placeOrderFields: { purchaseOrderNumber: trimmedValue || undefined } };
    
    case 'product_sku':
      return { placeOrderFields: { productSku: trimmedValue || undefined } };
    case 'product_size':
      return { placeOrderFields: { productSize: trimmedValue || undefined } };
    case 'color':
      return { placeOrderFields: { color: trimmedValue || undefined } };
    case 'material_used':
      return { placeOrderFields: { materialUsed: trimmedValue || undefined } };
    case 'brand_name_product':
      return { placeOrderFields: { brandNameProduct: trimmedValue || undefined } };
    case 'brand_logo':
      return { placeOrderFields: { brandLogo: trimmedValue || undefined } };
    case 'brand_logo_sent':
      return { placeOrderFields: { brandLogoSent: trimmedValue || undefined } };
    case 'upc_fnsku':
      return { placeOrderFields: { upcFnsku: trimmedValue || undefined } };
    case 'additional_details':
      return { placeOrderFields: { additionalDetails: trimmedValue || undefined } };
    
    case 'sample_refund_agreed':
      return { placeOrderFields: { sampleRefundAgreed: trimmedValue || undefined } };
    case 'inspection_agreed':
      return { placeOrderFields: { inspectionAgreed: trimmedValue || undefined } };
    
    case 'product_label_agreed':
      return { placeOrderFields: { productLabelAgreed: trimmedValue || undefined } };
    case 'packaging_type':
      return { placeOrderFields: { packagingType: trimmedValue || undefined } };
    case 'package_design':
      return { placeOrderFields: { packageDesign: trimmedValue || undefined } };
    case 'units_per_package':
      return { placeOrderFields: { unitsPerPackage: trimmedValue || undefined } };
    case 'product_label_sent':
      return { placeOrderFields: { productLabelSent: trimmedValue || undefined } };
    
    case 'freight_forwarder':
      return { placeOrderFields: { freightForwarder: trimmedValue || undefined } };
    case 'shipping_time':
      return { placeOrderFields: { shippingTime: trimmedValue || undefined } };
    case 'hts_code':
      return { placeOrderFields: { htsCode: trimmedValue || undefined } };
    case 'duty_rate':
      return { placeOrderFields: { dutyRate: trimmedValue || undefined } };
    case 'tariff_code':
      return { placeOrderFields: { tariffCode: trimmedValue || undefined } };
    case 'additional_customs_documents':
      return { placeOrderFields: { additionalCustomsDocuments: trimmedValue || undefined } };
    case 'additional_notes_for_supplier':
      return { placeOrderFields: { additionalNotesForSupplier: trimmedValue || undefined } };
    
    default:
      // Field not mapped or not editable from supplier quote side
      return null;
  }
}

export function PlaceOrderTab({
  productId,
  productData,
  supplierQuotes,
  hubData,
  fieldsConfirmed = {},
  onDirtyChange,
  onPurchaseOrderDownloaded,
  onChange,
  onFieldsConfirmedChange,
  onSelectedSupplierChange,
}: PlaceOrderTabProps) {
  const [draft, setDraft] = useState<PlaceOrderDraft>({
    selectedSupplierId: null,
    orderQuantity: null,
    finalTier: null,
    confirmedFields: new Set<string>(),
    overrides: {},
    editingField: null,
  });

  const [isDirty, setIsDirty] = useState(false);

  // Get confirmations for currently selected supplier
  const confirmedFieldsSet = useMemo(() => {
    const set = new Set<string>();
    if (draft.selectedSupplierId && fieldsConfirmed[draft.selectedSupplierId]) {
      Object.entries(fieldsConfirmed[draft.selectedSupplierId]).forEach(([key, value]) => {
        if (value) set.add(key);
      });
    }
    return set;
  }, [fieldsConfirmed, draft.selectedSupplierId]);

  // Sync confirmedFields with prop when it changes from outside (e.g., loaded from DB)
  useEffect(() => {
    setDraft(prev => ({ ...prev, confirmedFields: confirmedFieldsSet }));
  }, [confirmedFieldsSet]);

  // Notify parent when selected supplier changes
  useEffect(() => {
    onSelectedSupplierChange?.(draft.selectedSupplierId);
  }, [draft.selectedSupplierId, onSelectedSupplierChange]);

  // Track dirty state - only dirty if user has made actual changes (excluding field confirmations which auto-save)
  useEffect(() => {
    const hasChanges = 
      draft.orderQuantity !== null || 
      draft.finalTier !== null ||
      Object.keys(draft.overrides).length > 0;
    setIsDirty(hasChanges);
  }, [draft]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Warn before leaving page with unsaved changes
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  // Get selected supplier
  const selectedSupplier = useMemo(() => {
    if (!draft.selectedSupplierId) return null;
    return supplierQuotes.find(q => q.id === draft.selectedSupplierId) || null;
  }, [draft.selectedSupplierId, supplierQuotes]);

  // Calculate metrics for selected supplier
  const supplierWithMetrics = useMemo(() => {
    if (!selectedSupplier) return null;
    return calculateQuoteMetrics(selectedSupplier, hubData, productData);
  }, [selectedSupplier, hubData, productData]);

  // Determine effective tier
  const effectiveTier = useMemo(() => {
    if (draft.finalTier) return draft.finalTier;
    if (selectedSupplier?.finalCalcTier) return selectedSupplier.finalCalcTier;
    return 'short';
  }, [draft.finalTier, selectedSupplier]);

  // Get tier-based values
  const tierValues = useMemo(() => {
    if (!selectedSupplier) return null;
    
    const tier = effectiveTier;
    let costPerUnit: number | null = null;
    let moq: number | null = null;

    if (tier === 'medium' && selectedSupplier.costPerUnitMediumTerm !== null && selectedSupplier.costPerUnitMediumTerm !== undefined) {
      costPerUnit = selectedSupplier.costPerUnitMediumTerm;
      moq = selectedSupplier.moqMediumTerm ?? selectedSupplier.moqShortTerm ?? selectedSupplier.moq ?? null;
    } else if (tier === 'long' && selectedSupplier.costPerUnitLongTerm !== null && selectedSupplier.costPerUnitLongTerm !== undefined) {
      costPerUnit = selectedSupplier.costPerUnitLongTerm;
      moq = selectedSupplier.moqLongTerm ?? selectedSupplier.moqShortTerm ?? selectedSupplier.moq ?? null;
    } else {
      const effectiveIncoterms = selectedSupplier.incotermsAgreed || selectedSupplier.incoterms || 'DDP';
      costPerUnit = (effectiveIncoterms === 'DDP' && selectedSupplier.ddpPrice && selectedSupplier.ddpPrice > 0)
        ? selectedSupplier.ddpPrice
        : (selectedSupplier.costPerUnitShortTerm ?? selectedSupplier.exwUnitCost ?? null);
      moq = selectedSupplier.moqShortTerm ?? selectedSupplier.moq ?? null;
    }

    return { costPerUnit, moq, tier };
  }, [selectedSupplier, effectiveTier]);

  // Order quantity (editable override, defaults to MOQ)
  const orderQuantity = draft.orderQuantity ?? tierValues?.moq ?? null;

  // Calculate sales price (for referral fee percentage calculation)
  const salesPrice = useMemo(() => {
    const hub = hubData || { targetSalesPrice: null, categoryOverride: null, referralFeePct: null };
    const originalPrice = productData?.price || productData?.salesPrice || null;
    return hub.targetSalesPrice ?? originalPrice ?? selectedSupplier?.salesPrice ?? null;
  }, [hubData, productData, selectedSupplier]);

  // Handle supplier quote updates (for write-back)
  const handleUpdateSupplierQuote = useCallback((quoteId: string, updates: Partial<SupplierQuoteRow>) => {
    if (!onChange) {
      console.log('[PlaceOrderTab] handleUpdateSupplierQuote: No onChange callback');
      return;
    }
    const updated = supplierQuotes.map(q => q.id === quoteId ? { ...q, ...updates } : q);
    const updatedQuote = updated.find(q => q.id === quoteId);
    console.log('[PlaceOrderTab] handleUpdateSupplierQuote calling onChange:', {
      quoteId,
      updates,
      updatedQuote: {
        id: updatedQuote?.id,
        referralFeePct: updatedQuote?.referralFeePct,
        displayName: updatedQuote?.displayName
      }
    });
    onChange(updated);
    console.log('[PlaceOrderTab] onChange called successfully');
  }, [onChange, supplierQuotes]);

  // Handle field confirmation
  const handleConfirm = useCallback((fieldKey: string) => {
    if (!draft.selectedSupplierId) return;
    
    setDraft(prev => {
      const newConfirmed = new Set(prev.confirmedFields);
      newConfirmed.add(fieldKey);
      return { ...prev, confirmedFields: newConfirmed };
    });
    setIsDirty(true);
    
    // Update fieldsConfirmed in DB (per supplier)
    if (onFieldsConfirmedChange && draft.selectedSupplierId) {
      const supplierConfirmations = fieldsConfirmed[draft.selectedSupplierId] || {};
      const updatedConfirmed = {
        ...fieldsConfirmed,
        [draft.selectedSupplierId]: {
          ...supplierConfirmations,
          [fieldKey]: true,
        },
      };
      console.log('[PlaceOrderTab] Confirming field:', { 
        supplierId: draft.selectedSupplierId,
        fieldKey, 
        updatedConfirmed 
      });
      onFieldsConfirmedChange(updatedConfirmed);
    }
  }, [draft.selectedSupplierId, fieldsConfirmed, onFieldsConfirmedChange]);

  const handleUnconfirm = useCallback((fieldKey: string) => {
    if (!draft.selectedSupplierId) return;
    
    setDraft(prev => {
      const newConfirmed = new Set(prev.confirmedFields);
      newConfirmed.delete(fieldKey);
      return { ...prev, confirmedFields: newConfirmed };
    });
    setIsDirty(true);
    
    // Update fieldsConfirmed in DB (per supplier)
    if (onFieldsConfirmedChange && draft.selectedSupplierId) {
      const supplierConfirmations = fieldsConfirmed[draft.selectedSupplierId] || {};
      const updatedConfirmed = {
        ...fieldsConfirmed,
        [draft.selectedSupplierId]: {
          ...supplierConfirmations,
          [fieldKey]: false,
        },
      };
      console.log('[PlaceOrderTab] Unconfirming field:', { 
        supplierId: draft.selectedSupplierId,
        fieldKey, 
        updatedConfirmed 
      });
      onFieldsConfirmedChange(updatedConfirmed);
    }
  }, [draft.selectedSupplierId, fieldsConfirmed, onFieldsConfirmedChange]);

  // Handle edit
  const handleStartEdit = useCallback((fieldKey: string) => {
    setDraft(prev => ({ ...prev, editingField: fieldKey }));
  }, []);

  const handleSaveEdit = useCallback((fieldKey: string, value: string) => {
    console.log('[PlaceOrderTab] handleSaveEdit called:', { 
      fieldKey, 
      value, 
      effectiveTier,
      salesPrice,
      selectedSupplierId: selectedSupplier?.id 
    });
    
    // Save to local overrides
    setDraft(prev => ({
      ...prev,
      overrides: {
        ...prev.overrides,
        [fieldKey]: value,
      },
      editingField: null,
    }));
    
    // Also sync back to supplier quote (both mapped and non-mapped fields)
    if (selectedSupplier && onChange) {
      const updates = mapFieldToSupplierQuote(fieldKey, value, effectiveTier, salesPrice);
      console.log('[PlaceOrderTab] mapFieldToSupplierQuote result:', { fieldKey, updates });
      if (updates && Object.keys(updates).length > 0) {
        // If updates contain placeOrderFields, merge them with existing placeOrderFields
        if (updates.placeOrderFields) {
          const mergedUpdates = {
            ...updates,
            placeOrderFields: {
              ...(selectedSupplier.placeOrderFields || {}),
              ...updates.placeOrderFields,
            },
          };
          console.log('[PlaceOrderTab] Updating supplier quote with placeOrderFields:', {
            supplierId: selectedSupplier.id,
            fieldKey,
            value,
            mergedUpdates
          });
          handleUpdateSupplierQuote(selectedSupplier.id, mergedUpdates);
        } else {
          console.log('[PlaceOrderTab] Updating supplier quote (mapped fields):', {
            supplierId: selectedSupplier.id,
            fieldKey,
            updates
          });
          handleUpdateSupplierQuote(selectedSupplier.id, updates);
        }
      }
    }
  }, [selectedSupplier, onChange, effectiveTier, salesPrice, handleUpdateSupplierQuote]);

  const handleCancelEdit = useCallback(() => {
    setDraft(prev => ({ ...prev, editingField: null }));
  }, []);

  // Check if all required fields are confirmed (for PDF generation)
  const allRequiredConfirmed = useMemo(() => {
    if (!selectedSupplier || !supplierWithMetrics) return false;
    
    const valueContext: ValueMapperContext = {
      selectedSupplier,
      supplierWithMetrics,
      productData,
      hubData,
      orderQuantity,
      effectiveTier,
      localOverrides: draft.overrides,
    };

    const requiredFields = getAllFields().filter(f => f.required);
    return requiredFields.every(field => {
      const valueSource = getFieldValue(field, valueContext);
      return draft.confirmedFields.has(field.key) && valueSource.value !== null;
    });
  }, [selectedSupplier, supplierWithMetrics, productData, hubData, orderQuantity, effectiveTier, draft.overrides, draft.confirmedFields]);

  // Handle supplier selection
  const handleSupplierChange = (supplierId: string) => {
    setDraft(prev => ({
      ...prev,
      selectedSupplierId: supplierId,
      orderQuantity: null,
      editingField: null,
    }));
  };

  // Handle PDF download
  const handleDownloadPDF = () => {
    if (!selectedSupplier || !supplierWithMetrics || !allRequiredConfirmed) return;

    const hub = hubData || { targetSalesPrice: null, categoryOverride: null, referralFeePct: null };
    const originalPrice = productData?.price || productData?.salesPrice || null;
    const targetSalesPrice = hub.targetSalesPrice ?? originalPrice ?? selectedSupplier.salesPrice ?? null;
    const originalCategory = productData?.category || '';
    const category = hub.categoryOverride || originalCategory || '';
    const referralFeePct = hub.referralFeePct !== null 
      ? hub.referralFeePct 
      : getReferralFeePct(category);

    // Build checklist items for PDF from schema
    const valueContext: ValueMapperContext = {
      selectedSupplier,
      supplierWithMetrics,
      productData,
      hubData,
      orderQuantity,
      effectiveTier,
      localOverrides: draft.overrides,
    };

    const pdfChecklistItems = getAllFields().map(field => {
      const valueSource = getFieldValue(field, valueContext);
      const section = PLACE_ORDER_SCHEMA.find(s => s.fields.includes(field));
      return {
        id: field.key,
        label: field.label,
        value: valueSource.value || null,
        required: field.required,
        section: section?.key || '',
      };
    });

    generatePurchaseOrderPDF({
      productId,
      productName: productData?.display_title || productData?.title || 'Untitled Product',
      supplier: selectedSupplier,
      supplierWithMetrics,
      checklistItems: pdfChecklistItems,
      confirmedItems: draft.confirmedFields,
      orderQuantity: orderQuantity || tierValues?.moq || 0,
      tier: effectiveTier,
      targetSalesPrice,
      referralFeePct,
      inspectionNotes: '', // Notes removed per requirements
    });

    onPurchaseOrderDownloaded?.();
  };

  return (
    <div className="space-y-6">
      {/* Supplier Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Select Supplier to Place Order With
        </label>
        {supplierQuotes.length === 0 ? (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 text-center text-slate-400">
            Add suppliers in Supplier Quotes to begin.
          </div>
        ) : (
          <select
            value={draft.selectedSupplierId || ''}
            onChange={(e) => handleSupplierChange(e.target.value)}
            className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Select Supplier --</option>
            {supplierQuotes.map(quote => (
              <option key={quote.id} value={quote.id}>
                {quote.displayName || quote.supplierName || `Supplier ${quote.id}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedSupplier && supplierWithMetrics && (
        <>
          {/* Agreed Order Summary Card */}
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-2 border-slate-700/50 rounded-lg p-6 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <FileText className="w-6 h-6" />
                Agreed Order Summary
              </h3>
              {selectedSupplier.supplierGrade && (
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  selectedSupplier.supplierGrade === 'A' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  selectedSupplier.supplierGrade === 'B' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                  selectedSupplier.supplierGrade === 'C' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                  'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                }`}>
                  Grade {selectedSupplier.supplierGrade}
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wider">Supplier</span>
                <p className="text-white font-semibold mt-1">{selectedSupplier.supplierName || '—'}</p>
                {selectedSupplier.companyName && (
                  <p className="text-sm text-slate-400 mt-0.5">{selectedSupplier.companyName}</p>
                )}
              </div>
              
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wider">Final MOQ</span>
                <p className="text-white font-semibold mt-1">{tierValues?.moq || '—'}</p>
              </div>
              
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wider">Cost per Unit</span>
                <p className="text-white font-semibold mt-1">
                  {tierValues?.costPerUnit ? formatCurrency(tierValues.costPerUnit) : '—'}
                </p>
              </div>
              
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wider">Pro Forma Invoice Total</span>
                <p className="text-white font-semibold mt-1">
                  {orderQuantity && tierValues?.costPerUnit 
                    ? formatCurrency(orderQuantity * tierValues.costPerUnit) 
                    : '—'}
                </p>
              </div>
              
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wider">Incoterms</span>
                <p className="text-white font-semibold mt-1">
                  {selectedSupplier.incotermsAgreed || selectedSupplier.incoterms || '—'}
                </p>
              </div>
              
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wider">Lead Time</span>
                <p className="text-white font-semibold mt-1">{selectedSupplier.leadTime || '—'}</p>
              </div>
              
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wider">Payment Terms</span>
                <p className="text-white font-semibold mt-1">{selectedSupplier.paymentTerms || '—'}</p>
              </div>
              
              {supplierWithMetrics.profitPerUnit !== null && (
                <>
                  <div>
                    <span className="text-xs text-slate-400 uppercase tracking-wider">Profit/Unit</span>
                    <p className="text-emerald-400 font-semibold mt-1">
                      {formatCurrency(supplierWithMetrics.profitPerUnit)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 uppercase tracking-wider">Margin %</span>
                    <p className="text-white font-semibold mt-1">
                      {supplierWithMetrics.marginPct !== null 
                        ? `${supplierWithMetrics.marginPct.toFixed(1)}%`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 uppercase tracking-wider">ROI %</span>
                    <p className="text-white font-semibold mt-1">
                      {supplierWithMetrics.roiPct !== null 
                        ? `${supplierWithMetrics.roiPct.toFixed(1)}%`
                        : '—'}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* New Schema-Driven Checklist */}
          <PlaceOrderChecklist
            selectedSupplier={selectedSupplier}
            supplierWithMetrics={supplierWithMetrics}
            productData={productData}
            hubData={hubData}
            orderQuantity={orderQuantity}
            effectiveTier={effectiveTier}
            localOverrides={draft.overrides}
            confirmedFields={draft.confirmedFields}
            editingField={draft.editingField}
            onConfirm={handleConfirm}
            onUnconfirm={handleUnconfirm}
            onStartEdit={handleStartEdit}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onUpdateSupplierQuote={handleUpdateSupplierQuote}
          />

          {/* Download PDF Button */}
          <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Purchase Order</h3>
              <p className="text-sm text-slate-400">
                {allRequiredConfirmed 
                  ? 'All required fields confirmed. Ready to generate PDF.'
                  : 'Please confirm all required fields above to generate PDF.'}
              </p>
            </div>
            <button
              onClick={handleDownloadPDF}
              disabled={!allRequiredConfirmed || !selectedSupplier}
              className={`px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                allRequiredConfirmed && selectedSupplier
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Download className="w-5 h-5" />
              Download Purchase Order (PDF)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
 
