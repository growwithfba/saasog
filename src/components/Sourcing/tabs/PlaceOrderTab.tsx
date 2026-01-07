'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  ShoppingCart, 
  ChevronDown, 
  CheckCircle2, 
  AlertCircle, 
  Download,
  ExternalLink,
  FileText,
  Pencil,
  X,
  Save
} from 'lucide-react';
import type { SupplierQuoteRow, SourcingHubData } from '../types';
import { calculateQuoteMetrics } from './SupplierQuotesTab';
import { formatCurrency } from '@/utils/formatters';
import { getReferralFeePct } from '@/utils/referralFees';
import { generatePurchaseOrderPDF } from './placeOrder/pdf';

interface PlaceOrderTabProps {
  productId: string;
  productData: any;
  supplierQuotes: SupplierQuoteRow[];
  hubData?: SourcingHubData;
  onDirtyChange?: (isDirty: boolean) => void;
}

interface PlaceOrderDraft {
  selectedSupplierId: string | null;
  orderQuantity: number | null;
  finalTier: 'short' | 'medium' | 'long' | null;
  confirmedItems: Set<string>;
  requiredConfirmations: Set<string>;
  overrides: Record<string, string>; // fieldId -> overridden value
  notes: Record<string, string>; // fieldId -> notes
  editingField: string | null; // fieldId currently being edited
}

interface ChecklistItem {
  id: string;
  label: string;
  importedValue: string | null;
  finalAgreedValue: string | null;
  isOverridden: boolean;
  required: boolean;
  section: string;
  fieldType?: 'text' | 'number' | 'checkbox' | 'textarea';
}

export function PlaceOrderTab({
  productId,
  productData,
  supplierQuotes,
  hubData,
  onDirtyChange
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
          confirmedItems: new Set(parsed.confirmedItems || []),
          requiredConfirmations: new Set(parsed.requiredConfirmations || []),
          overrides: parsed.overrides || {},
          notes: parsed.notes || {},
        };
      } catch {
        // Fallback to default
      }
    }
    return {
      selectedSupplierId: null,
      orderQuantity: null,
      finalTier: null,
      confirmedItems: new Set<string>(),
      requiredConfirmations: new Set<string>(),
      overrides: {},
      notes: {},
      editingField: null,
    };
  });

  const [isDirty, setIsDirty] = useState(false);

  // Save draft to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const toSave = {
        ...draft,
        confirmedItems: Array.from(draft.confirmedItems),
        requiredConfirmations: Array.from(draft.requiredConfirmations),
      };
      localStorage.setItem(`placeOrderDraft_${productId}`, JSON.stringify(toSave));
    }
  }, [draft, productId]);

  // Track dirty state - only dirty if user has made actual changes
  useEffect(() => {
    const hasChanges = 
      draft.confirmedItems.size > 0 || 
      draft.requiredConfirmations.size > 0 ||
      draft.orderQuantity !== null || 
      draft.finalTier !== null ||
      Object.keys(draft.overrides).length > 0 ||
      Object.values(draft.notes).some(note => note.trim().length > 0);
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

  // Build checklist items
  const checklistItems = useMemo((): ChecklistItem[] => {
    if (!selectedSupplier || !supplierWithMetrics) return [];

    const items: ChecklistItem[] = [];
    const effectiveIncoterms = selectedSupplier.incotermsAgreed || selectedSupplier.incoterms || 'DDP';
    const tierLabel = effectiveTier === 'medium' ? 'Medium' : effectiveTier === 'long' ? 'Long' : 'Short';

    // Helper to get final agreed value (override if exists, otherwise imported)
    const getFinalAgreedValue = (fieldId: string, importedValue: string | null): string | null => {
      // Special handling for order_quantity
      if (fieldId === 'order_quantity') {
        if (draft.orderQuantity !== null) {
          return draft.orderQuantity.toString();
        }
        return importedValue;
      }
      
      if (draft.overrides[fieldId] !== undefined) {
        return draft.overrides[fieldId] || null;
      }
      return importedValue;
    };

    // A) Supplier & Order Basics
    items.push(
      { 
        id: 'payment_terms', 
        label: 'Payment terms', 
        importedValue: selectedSupplier.paymentTerms || null,
        finalAgreedValue: getFinalAgreedValue('payment_terms', selectedSupplier.paymentTerms || null),
        isOverridden: draft.overrides['payment_terms'] !== undefined,
        required: false, 
        section: 'A',
        fieldType: 'text'
      },
      { 
        id: 'lead_time', 
        label: 'Lead time (days)', 
        importedValue: selectedSupplier.leadTime || null,
        finalAgreedValue: getFinalAgreedValue('lead_time', selectedSupplier.leadTime || null),
        isOverridden: draft.overrides['lead_time'] !== undefined,
        required: false, 
        section: 'A',
        fieldType: 'text'
      },
      { 
        id: 'incoterms_agreed', 
        label: 'Incoterms agreed', 
        importedValue: effectiveIncoterms,
        finalAgreedValue: getFinalAgreedValue('incoterms_agreed', effectiveIncoterms),
        isOverridden: draft.overrides['incoterms_agreed'] !== undefined,
        required: true, 
        section: 'A',
        fieldType: 'text'
      },
      { 
        id: 'inspection_required', 
        label: 'Inspection required', 
        importedValue: null, // This is a yes/no question
        finalAgreedValue: getFinalAgreedValue('inspection_required', null),
        isOverridden: draft.overrides['inspection_required'] !== undefined,
        required: false, 
        section: 'A',
        fieldType: 'checkbox'
      },
      { 
        id: 'inspection_company', 
        label: 'Inspection company', 
        importedValue: null,
        finalAgreedValue: getFinalAgreedValue('inspection_company', null),
        isOverridden: draft.overrides['inspection_company'] !== undefined,
        required: false, 
        section: 'A',
        fieldType: 'text'
      },
    );

    // B) Pricing & Quantities
    const totalProductCost = (orderQuantity && tierValues?.costPerUnit) 
      ? orderQuantity * tierValues.costPerUnit 
      : null;
    const proFormaInvoiceTotal = totalProductCost; // Same as total product cost for now

    items.push(
      { 
        id: 'final_moq', 
        label: 'Final MOQ', 
        importedValue: tierValues?.moq?.toString() || null,
        finalAgreedValue: getFinalAgreedValue('final_moq', tierValues?.moq?.toString() || null),
        isOverridden: draft.overrides['final_moq'] !== undefined,
        required: true, 
        section: 'B',
        fieldType: 'number'
      },
      { 
        id: 'order_quantity', 
        label: 'Order Quantity', 
        importedValue: tierValues?.moq?.toString() || null,
        finalAgreedValue: getFinalAgreedValue('order_quantity', orderQuantity?.toString() || tierValues?.moq?.toString() || null),
        isOverridden: draft.overrides['order_quantity'] !== undefined || draft.orderQuantity !== null,
        required: true, 
        section: 'B',
        fieldType: 'number'
      },
      { 
        id: 'cost_per_unit', 
        label: 'Cost per unit', 
        importedValue: tierValues?.costPerUnit ? formatCurrency(tierValues.costPerUnit) : null,
        finalAgreedValue: getFinalAgreedValue('cost_per_unit', tierValues?.costPerUnit ? formatCurrency(tierValues.costPerUnit) : null),
        isOverridden: draft.overrides['cost_per_unit'] !== undefined,
        required: true, 
        section: 'B',
        fieldType: 'text'
      },
      { 
        id: 'total_product_cost', 
        label: 'Total product cost', 
        importedValue: totalProductCost ? formatCurrency(totalProductCost) : null,
        finalAgreedValue: getFinalAgreedValue('total_product_cost', totalProductCost ? formatCurrency(totalProductCost) : null),
        isOverridden: draft.overrides['total_product_cost'] !== undefined,
        required: false, 
        section: 'B',
        fieldType: 'text'
      },
      { 
        id: 'pro_forma_invoice_total', 
        label: 'Pro Forma Invoice Total', 
        importedValue: proFormaInvoiceTotal ? formatCurrency(proFormaInvoiceTotal) : null,
        finalAgreedValue: getFinalAgreedValue('pro_forma_invoice_total', proFormaInvoiceTotal ? formatCurrency(proFormaInvoiceTotal) : null),
        isOverridden: draft.overrides['pro_forma_invoice_total'] !== undefined,
        required: false, 
        section: 'B',
        fieldType: 'text'
      },
    );

    // C) Unit Packaging
    const unitDims = (selectedSupplier.singleProductPackageLengthCm && selectedSupplier.singleProductPackageWidthCm && selectedSupplier.singleProductPackageHeightCm)
      ? `${selectedSupplier.singleProductPackageLengthCm}×${selectedSupplier.singleProductPackageWidthCm}×${selectedSupplier.singleProductPackageHeightCm} cm`
      : null;

    items.push(
      { 
        id: 'unit_package_dims', 
        label: 'Unit package dimensions (L×W×H cm)', 
        importedValue: unitDims,
        finalAgreedValue: getFinalAgreedValue('unit_package_dims', unitDims),
        isOverridden: draft.overrides['unit_package_dims'] !== undefined,
        required: true, 
        section: 'C',
        fieldType: 'text'
      },
      { 
        id: 'unit_package_weight', 
        label: 'Unit package weight (kg)', 
        importedValue: selectedSupplier.singleProductPackageWeightKg 
          ? `${selectedSupplier.singleProductPackageWeightKg} kg`
          : null,
        finalAgreedValue: getFinalAgreedValue('unit_package_weight', selectedSupplier.singleProductPackageWeightKg 
          ? `${selectedSupplier.singleProductPackageWeightKg} kg`
          : null),
        isOverridden: draft.overrides['unit_package_weight'] !== undefined,
        required: true, 
        section: 'C',
        fieldType: 'text'
      },
      { 
        id: 'fba_label_placement', 
        label: 'FBA label placement agreed', 
        importedValue: null,
        finalAgreedValue: getFinalAgreedValue('fba_label_placement', null),
        isOverridden: draft.overrides['fba_label_placement'] !== undefined,
        required: false, 
        section: 'C',
        fieldType: 'checkbox'
      },
      { 
        id: 'shipping_marks', 
        label: 'Shipping marks agreed', 
        importedValue: null,
        finalAgreedValue: getFinalAgreedValue('shipping_marks', null),
        isOverridden: draft.overrides['shipping_marks'] !== undefined,
        required: false, 
        section: 'C',
        fieldType: 'checkbox'
      },
      { 
        id: 'insert_bundle', 
        label: 'Insert / bundle confirmed', 
        importedValue: null,
        finalAgreedValue: getFinalAgreedValue('insert_bundle', null),
        isOverridden: draft.overrides['insert_bundle'] !== undefined,
        required: false, 
        section: 'C',
        fieldType: 'checkbox'
      },
    );

    // D) Carton Information
    const cartonDims = (selectedSupplier.cartonLengthCm && selectedSupplier.cartonWidthCm && selectedSupplier.cartonHeightCm)
      ? `${selectedSupplier.cartonLengthCm}×${selectedSupplier.cartonWidthCm}×${selectedSupplier.cartonHeightCm} cm`
      : null;
    const totalCartons = (orderQuantity && selectedSupplier.unitsPerCarton && selectedSupplier.unitsPerCarton > 0)
      ? Math.ceil(orderQuantity / selectedSupplier.unitsPerCarton).toString()
      : null;

    items.push(
      { 
        id: 'units_per_carton', 
        label: 'Units per carton', 
        importedValue: selectedSupplier.unitsPerCarton?.toString() || null,
        finalAgreedValue: getFinalAgreedValue('units_per_carton', selectedSupplier.unitsPerCarton?.toString() || null),
        isOverridden: draft.overrides['units_per_carton'] !== undefined,
        required: false, 
        section: 'D',
        fieldType: 'number'
      },
      { 
        id: 'carton_dims', 
        label: 'Carton dimensions (L×W×H cm)', 
        importedValue: cartonDims,
        finalAgreedValue: getFinalAgreedValue('carton_dims', cartonDims),
        isOverridden: draft.overrides['carton_dims'] !== undefined,
        required: false, 
        section: 'D',
        fieldType: 'text'
      },
      { 
        id: 'carton_weight', 
        label: 'Carton weight (kg)', 
        importedValue: selectedSupplier.cartonWeightKg 
          ? `${selectedSupplier.cartonWeightKg} kg`
          : null,
        finalAgreedValue: getFinalAgreedValue('carton_weight', selectedSupplier.cartonWeightKg 
          ? `${selectedSupplier.cartonWeightKg} kg`
          : null),
        isOverridden: draft.overrides['carton_weight'] !== undefined,
        required: false, 
        section: 'D',
        fieldType: 'text'
      },
      { 
        id: 'total_cartons', 
        label: 'Total cartons', 
        importedValue: totalCartons,
        finalAgreedValue: getFinalAgreedValue('total_cartons', totalCartons),
        isOverridden: draft.overrides['total_cartons'] !== undefined,
        required: false, 
        section: 'D',
        fieldType: 'text'
      },
    );

    // E) Freight & Compliance
    const hasAdvancedFreight = (selectedSupplier.freightCostPerUnit ?? selectedSupplier.ddpShippingPerUnit ?? 0) > 0;
    const hasAdvancedDuty = (selectedSupplier.dutyCostPerUnit ?? 0) > 0;
    const hasAdvancedTariff = (selectedSupplier.tariffCostPerUnit ?? 0) > 0;
    
    let freightDisplay: string | null = null;
    if (hasAdvancedFreight) {
      freightDisplay = formatCurrency(selectedSupplier.freightCostPerUnit ?? selectedSupplier.ddpShippingPerUnit ?? 0);
    } else if (selectedSupplier.freightDutyCost) {
      freightDisplay = formatCurrency(selectedSupplier.freightDutyCost);
    } else if (effectiveIncoterms === 'DDP' && selectedSupplier.ddpPrice) {
      freightDisplay = 'Included in DDP price';
    }

    items.push(
      { 
        id: 'freight_cost', 
        label: 'Freight cost/unit (if applicable)', 
        importedValue: freightDisplay,
        finalAgreedValue: getFinalAgreedValue('freight_cost', freightDisplay),
        isOverridden: draft.overrides['freight_cost'] !== undefined,
        required: false, 
        section: 'E',
        fieldType: 'text'
      },
      { 
        id: 'duty_cost', 
        label: 'Duty cost/unit (if applicable)', 
        importedValue: hasAdvancedDuty && selectedSupplier.dutyCostPerUnit 
          ? formatCurrency(selectedSupplier.dutyCostPerUnit) 
          : null,
        finalAgreedValue: getFinalAgreedValue('duty_cost', hasAdvancedDuty && selectedSupplier.dutyCostPerUnit 
          ? formatCurrency(selectedSupplier.dutyCostPerUnit) 
          : null),
        isOverridden: draft.overrides['duty_cost'] !== undefined,
        required: false, 
        section: 'E',
        fieldType: 'text'
      },
      { 
        id: 'tariff_cost', 
        label: 'Tariff cost/unit (if applicable)', 
        importedValue: hasAdvancedTariff && selectedSupplier.tariffCostPerUnit 
          ? formatCurrency(selectedSupplier.tariffCostPerUnit) 
          : null,
        finalAgreedValue: getFinalAgreedValue('tariff_cost', hasAdvancedTariff && selectedSupplier.tariffCostPerUnit 
          ? formatCurrency(selectedSupplier.tariffCostPerUnit) 
          : null),
        isOverridden: draft.overrides['tariff_cost'] !== undefined,
        required: false, 
        section: 'E',
        fieldType: 'text'
      },
      { 
        id: 'export_docs', 
        label: 'Export documents responsibility', 
        importedValue: null,
        finalAgreedValue: getFinalAgreedValue('export_docs', null),
        isOverridden: draft.overrides['export_docs'] !== undefined,
        required: false, 
        section: 'E',
        fieldType: 'text'
      },
    );

    // F) Super Selling Points (SSPs)
    const sspsDiscussed = selectedSupplier.sspsDiscussed || null;
    const sspCost = selectedSupplier.sspCostPerUnit ? formatCurrency(selectedSupplier.sspCostPerUnit) : null;

    items.push(
      { 
        id: 'ssps_included', 
        label: 'SSPs included', 
        importedValue: sspsDiscussed,
        finalAgreedValue: getFinalAgreedValue('ssps_included', sspsDiscussed),
        isOverridden: draft.overrides['ssps_included'] !== undefined,
        required: false, 
        section: 'F',
        fieldType: 'textarea'
      },
      { 
        id: 'ssp_included_in_price', 
        label: 'Included in unit price', 
        importedValue: sspCost ? 'Yes' : 'No',
        finalAgreedValue: getFinalAgreedValue('ssp_included_in_price', sspCost ? 'Yes' : 'No'),
        isOverridden: draft.overrides['ssp_included_in_price'] !== undefined,
        required: false, 
        section: 'F',
        fieldType: 'checkbox'
      },
      { 
        id: 'mold_required', 
        label: 'Mold required', 
        importedValue: selectedSupplier.opennessToSsps === 'Mold Required' ? 'Yes' : 'No',
        finalAgreedValue: getFinalAgreedValue('mold_required', selectedSupplier.opennessToSsps === 'Mold Required' ? 'Yes' : 'No'),
        isOverridden: draft.overrides['mold_required'] !== undefined,
        required: false, 
        section: 'F',
        fieldType: 'checkbox'
      },
      { 
        id: 'mold_ownership', 
        label: 'Mold ownership confirmed', 
        importedValue: null,
        finalAgreedValue: getFinalAgreedValue('mold_ownership', null),
        isOverridden: draft.overrides['mold_ownership'] !== undefined,
        required: false, 
        section: 'F',
        fieldType: 'checkbox'
      },
      { 
        id: 'exclusivity', 
        label: 'Exclusivity confirmed (if applicable)', 
        importedValue: null,
        finalAgreedValue: getFinalAgreedValue('exclusivity', null),
        isOverridden: draft.overrides['exclusivity'] !== undefined,
        required: false, 
        section: 'F',
        fieldType: 'checkbox'
      },
    );

    // G) Inspection & Quality
    items.push(
      { 
        id: 'inspection_required_g', 
        label: 'Inspection required', 
        importedValue: null,
        finalAgreedValue: getFinalAgreedValue('inspection_required_g', null),
        isOverridden: draft.overrides['inspection_required_g'] !== undefined,
        required: false, 
        section: 'G',
        fieldType: 'checkbox'
      },
      { 
        id: 'inspection_timing', 
        label: 'Inspection timing', 
        importedValue: null,
        finalAgreedValue: getFinalAgreedValue('inspection_timing', null),
        isOverridden: draft.overrides['inspection_timing'] !== undefined,
        required: false, 
        section: 'G',
        fieldType: 'text'
      },
      { 
        id: 'inspection_scope', 
        label: 'Inspection scope', 
        importedValue: null,
        finalAgreedValue: getFinalAgreedValue('inspection_scope', null),
        isOverridden: draft.overrides['inspection_scope'] !== undefined,
        required: false, 
        section: 'G',
        fieldType: 'textarea'
      },
      { 
        id: 'reinspection_responsibility', 
        label: 'Reinspection responsibility', 
        importedValue: null,
        finalAgreedValue: getFinalAgreedValue('reinspection_responsibility', null),
        isOverridden: draft.overrides['reinspection_responsibility'] !== undefined,
        required: false, 
        section: 'G',
        fieldType: 'text'
      },
    );

    return items;
  }, [selectedSupplier, supplierWithMetrics, hubData, productData, effectiveTier, tierValues, orderQuantity, draft.overrides]);

  // Required confirmations (separate from checklist items)
  const requiredConfirmations = [
    { id: 'pricing_confirmed', label: 'All pricing confirmed with supplier' },
    { id: 'packaging_confirmed', label: 'Packaging specs confirmed' },
    { id: 'inspection_confirmed', label: 'Inspection requirements confirmed' },
    { id: 'production_schedule_confirmed', label: 'Production schedule confirmed' },
    { id: 'defect_policy_acknowledged', label: 'Defect policy acknowledged' },
  ];

  const allRequiredConfirmationsChecked = requiredConfirmations.every(
    conf => draft.requiredConfirmations.has(conf.id)
  );

  // Handle supplier selection
  const handleSupplierChange = (supplierId: string) => {
    setDraft(prev => ({
      ...prev,
      selectedSupplierId: supplierId,
      // Reset order quantity to MOQ when supplier changes
      orderQuantity: null,
      // Clear editing state
      editingField: null,
    }));
  };

  // Handle checkbox toggle for checklist items
  const handleToggleConfirm = (itemId: string) => {
    setDraft(prev => {
      const newConfirmed = new Set(prev.confirmedItems);
      if (newConfirmed.has(itemId)) {
        newConfirmed.delete(itemId);
      } else {
        newConfirmed.add(itemId);
      }
      return { ...prev, confirmedItems: newConfirmed };
    });
  };

  // Handle required confirmations toggle
  const handleToggleRequiredConfirmation = (confId: string) => {
    setDraft(prev => {
      const newConfirmed = new Set(prev.requiredConfirmations);
      if (newConfirmed.has(confId)) {
        newConfirmed.delete(confId);
      } else {
        newConfirmed.add(confId);
      }
      return { ...prev, requiredConfirmations: newConfirmed };
    });
  };

  // Handle order quantity change
  const handleOrderQuantityChange = (value: number | null) => {
    setDraft(prev => ({ ...prev, orderQuantity: value }));
  };

  // Handle tier selection
  const handleTierChange = (tier: 'short' | 'medium' | 'long') => {
    setDraft(prev => ({ ...prev, finalTier: tier }));
  };

  // Handle edit field
  const handleStartEdit = (fieldId: string) => {
    setDraft(prev => ({ ...prev, editingField: fieldId }));
  };

  // Handle save override
  const handleSaveOverride = (fieldId: string, value: string) => {
    setDraft(prev => {
      // Special handling for order_quantity
      if (fieldId === 'order_quantity') {
        const numValue = value.trim() === '' ? null : parseInt(value, 10);
        return {
          ...prev,
          orderQuantity: isNaN(numValue as number) ? null : numValue,
          editingField: null,
        };
      }

      const newOverrides = { ...prev.overrides };
      if (value.trim() === '') {
        delete newOverrides[fieldId];
      } else {
        newOverrides[fieldId] = value.trim();
      }
      return { 
        ...prev, 
        overrides: newOverrides,
        editingField: null 
      };
    });
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setDraft(prev => ({ ...prev, editingField: null }));
  };

  // Handle notes change
  const handleNotesChange = (fieldId: string, notes: string) => {
    setDraft(prev => ({
      ...prev,
      notes: {
        ...prev.notes,
        [fieldId]: notes,
      },
    }));
  };

  // Handle PDF download
  const handleDownloadPDF = () => {
    if (!selectedSupplier || !supplierWithMetrics || !allRequiredConfirmationsChecked) return;

    const hub = hubData || { targetSalesPrice: null, categoryOverride: null, referralFeePct: null };
    const originalPrice = productData?.price || productData?.salesPrice || null;
    const targetSalesPrice = hub.targetSalesPrice ?? originalPrice ?? selectedSupplier.salesPrice ?? null;
    const originalCategory = productData?.category || '';
    const category = hub.categoryOverride || originalCategory || '';
    const referralFeePct = hub.referralFeePct !== null 
      ? hub.referralFeePct 
      : getReferralFeePct(category);

    // Convert new checklist format to old format for PDF generation
    const pdfChecklistItems = checklistItems.map(item => ({
      id: item.id,
      label: item.label,
      value: item.finalAgreedValue || item.importedValue,
      required: item.required,
      section: item.section,
    }));

    // Prepare purchase order data shape (for future use)
    const purchaseOrder = {
      supplierId: selectedSupplier.id,
      confirmedFields: Array.from(draft.confirmedItems),
      overrides: draft.overrides,
      notes: draft.notes,
    };

    generatePurchaseOrderPDF({
      productId,
      productName: productData?.display_title || productData?.title || 'Untitled Product',
      supplier: selectedSupplier,
      supplierWithMetrics,
      checklistItems: pdfChecklistItems,
      confirmedItems: draft.confirmedItems,
      orderQuantity: orderQuantity || tierValues?.moq || 0,
      tier: effectiveTier,
      targetSalesPrice,
      referralFeePct,
      inspectionNotes: Object.values(draft.notes).join('\n'),
    });
  };

  const sections = [
    { id: 'A', title: 'Supplier & Order Basics' },
    { id: 'B', title: 'Pricing & Quantities' },
    { id: 'C', title: 'Unit Packaging' },
    { id: 'D', title: 'Carton Information' },
    { id: 'E', title: 'Freight & Compliance' },
    { id: 'F', title: 'Super Selling Points (SSPs)' },
    { id: 'G', title: 'Inspection & Quality' },
  ];

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

          {/* Checklist Table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Purchase Order Checklist</h3>
            </div>

            <div className="space-y-8">
              {sections.map(section => {
                const sectionItems = checklistItems.filter(item => item.section === section.id);
                if (sectionItems.length === 0) return null;

                return (
                  <div key={section.id} className="border-b border-slate-700/50 pb-6 last:border-b-0 last:pb-0">
                    <h4 className="text-sm font-semibold text-slate-300 mb-4">
                      {section.id}) {section.title}
                    </h4>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-700/50">
                            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Item</th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Imported from Quotes</th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Final Agreed</th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionItems.map(item => {
                            const isConfirmed = draft.confirmedItems.has(item.id);
                            const isMissing = item.required && !item.importedValue;
                            const isEditing = draft.editingField === item.id;
                            const finalValue = item.finalAgreedValue || item.importedValue;

                            return (
                              <tr 
                                key={item.id}
                                className={`border-b border-slate-700/30 ${
                                  isConfirmed ? 'bg-emerald-500/5' : ''
                                }`}
                              >
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-white font-medium">{item.label}</span>
                                    {item.required && (
                                      <span className="text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">
                                        *
                                      </span>
                                    )}
                                    {isMissing && (
                                      <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">
                                        Missing
                                      </span>
                                    )}
                                  </div>
                                </td>
                                
                                <td className="py-3 px-4">
                                  <span className={`text-sm ${
                                    item.importedValue ? 'text-slate-300' : 'text-slate-500 italic'
                                  }`}>
                                    {item.importedValue || '—'}
                                  </span>
                                </td>
                                
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    {isEditing ? (
                                      <div className="flex items-center gap-2 flex-1">
                                        <input
                                          type={item.fieldType === 'number' ? 'number' : 'text'}
                                          defaultValue={finalValue || ''}
                                          data-field={item.id}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              handleSaveOverride(item.id, (e.target as HTMLInputElement).value);
                                            } else if (e.key === 'Escape') {
                                              handleCancelEdit();
                                            }
                                          }}
                                          className="flex-1 px-2 py-1 bg-slate-700/50 border border-slate-600/50 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          autoFocus
                                        />
                                        <button
                                          onClick={() => {
                                            const input = document.querySelector(`input[data-field="${item.id}"]`) as HTMLInputElement;
                                            if (input) handleSaveOverride(item.id, input.value);
                                          }}
                                          className="p-1 text-emerald-400 hover:text-emerald-300"
                                        >
                                          <Save className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={handleCancelEdit}
                                          className="p-1 text-slate-400 hover:text-slate-300"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ) : (
                                      <>
                                        <span className={`text-sm flex-1 ${
                                          item.isOverridden 
                                            ? 'text-blue-400 font-medium' 
                                            : finalValue 
                                              ? 'text-slate-300' 
                                              : 'text-slate-500 italic'
                                        }`}>
                                          {finalValue || '—'}
                                        </span>
                                        {item.isOverridden && (
                                          <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                            Overridden
                                          </span>
                                        )}
                                        <button
                                          onClick={() => handleStartEdit(item.id)}
                                          className="p-1 text-slate-400 hover:text-slate-300"
                                          title="Edit"
                                        >
                                          <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleToggleConfirm(item.id)}
                                          className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                            isConfirmed
                                              ? 'bg-emerald-500 border-emerald-500 text-white'
                                              : 'border-slate-500 hover:border-slate-400'
                                          }`}
                                          disabled={item.required && !finalValue}
                                          title={isConfirmed ? 'Unconfirm' : 'Confirm'}
                                        >
                                          {isConfirmed && <CheckCircle2 className="w-3 h-3" />}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                                
                                <td className="py-3 px-4">
                                  <input
                                    type="text"
                                    value={draft.notes[item.id] || ''}
                                    onChange={(e) => handleNotesChange(item.id, e.target.value)}
                                    placeholder="Optional notes..."
                                    className="w-full px-2 py-1 bg-slate-700/30 border border-slate-600/30 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Required Confirmations */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Final Confirmations</h3>
            <p className="text-sm text-slate-400 mb-4">
              Please confirm all items below before generating the purchase order.
            </p>
            <div className="space-y-3">
              {requiredConfirmations.map(conf => {
                const isChecked = draft.requiredConfirmations.has(conf.id);
                return (
                  <label
                    key={conf.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-emerald-500/10 border border-emerald-500/20'
                        : 'bg-slate-700/30 border border-slate-700/50 hover:bg-slate-700/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleRequiredConfirmation(conf.id)}
                      className="w-5 h-5 rounded border-2 border-slate-500 text-emerald-500 focus:ring-2 focus:ring-emerald-500/50"
                    />
                    <span className="text-sm text-white font-medium">{conf.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Download PDF Button */}
          <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Purchase Order</h3>
              <p className="text-sm text-slate-400">
                {allRequiredConfirmationsChecked 
                  ? 'All required confirmations completed. Ready to generate PDF.'
                  : `Please confirm all ${requiredConfirmations.length} required items above to generate PDF.`}
              </p>
            </div>
            <button
              onClick={handleDownloadPDF}
              disabled={!allRequiredConfirmationsChecked || !selectedSupplier}
              className={`px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                allRequiredConfirmationsChecked && selectedSupplier
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

