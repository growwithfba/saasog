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
  onDirtyChange?: (isDirty: boolean) => void;
  onPurchaseOrderDownloaded?: () => void;
  onChange?: (quotes: SupplierQuoteRow[]) => void; // For updating supplier quotes
}

interface PlaceOrderDraft {
  selectedSupplierId: string | null;
  orderQuantity: number | null;
  finalTier: 'short' | 'medium' | 'long' | null;
  confirmedFields: Set<string>; // fieldKey -> confirmed
  overrides: Record<string, string>; // fieldKey -> overridden value
  editingField: string | null; // fieldKey currently being edited
}

export function PlaceOrderTab({
  productId,
  productData,
  supplierQuotes,
  hubData,
  onDirtyChange,
  onPurchaseOrderDownloaded,
  onChange,
}: PlaceOrderTabProps) {
  const [draft, setDraft] = useState<PlaceOrderDraft>(() => {
    const saved = typeof window !== 'undefined' 
      ? localStorage.getItem(`placeOrderDraft_${productId}`)
      : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          confirmedFields: new Set(parsed.confirmedFields || []),
          overrides: parsed.overrides || {},
        };
      } catch {
        // Fallback to default
      }
    }
    return {
      selectedSupplierId: null,
      orderQuantity: null,
      finalTier: null,
      confirmedFields: new Set<string>(),
      overrides: {},
      editingField: null,
    };
  });

  const [isDirty, setIsDirty] = useState(false);

  // Save draft to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const toSave = {
        ...draft,
        confirmedFields: Array.from(draft.confirmedFields),
      };
      localStorage.setItem(`placeOrderDraft_${productId}`, JSON.stringify(toSave));
    }
  }, [draft, productId]);

  // Track dirty state - only dirty if user has made actual changes
  useEffect(() => {
    const hasChanges = 
      draft.confirmedFields.size > 0 ||
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

  // Handle supplier quote updates (for write-back)
  const handleUpdateSupplierQuote = useCallback((quoteId: string, updates: Partial<SupplierQuoteRow>) => {
    if (!onChange) return;
    const updated = supplierQuotes.map(q => q.id === quoteId ? { ...q, ...updates } : q);
    onChange(updated);
    setIsDirty(true);
  }, [onChange, supplierQuotes]);

  // Handle field confirmation
  const handleConfirm = useCallback((fieldKey: string) => {
    setDraft(prev => {
      const newConfirmed = new Set(prev.confirmedFields);
      newConfirmed.add(fieldKey);
      return { ...prev, confirmedFields: newConfirmed };
    });
    setIsDirty(true);
  }, []);

  const handleUnconfirm = useCallback((fieldKey: string) => {
    setDraft(prev => {
      const newConfirmed = new Set(prev.confirmedFields);
      newConfirmed.delete(fieldKey);
      return { ...prev, confirmedFields: newConfirmed };
    });
    setIsDirty(true);
  }, []);

  // Handle edit
  const handleStartEdit = useCallback((fieldKey: string) => {
    setDraft(prev => ({ ...prev, editingField: fieldKey }));
  }, []);

  const handleSaveEdit = useCallback((fieldKey: string, value: string) => {
    setDraft(prev => ({
      ...prev,
      overrides: {
        ...prev.overrides,
        [fieldKey]: value,
      },
      editingField: null,
    }));
    setIsDirty(true);
  }, []);

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
 
