'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Pencil, X, Save, CheckCircle2 } from 'lucide-react';
import { PLACE_ORDER_SCHEMA, type PlaceOrderField, type PlaceOrderSection } from './placeOrderSchema';
import { getFieldValue, type ValueMapperContext } from './valueMapper';
import type { SupplierQuoteRow, SourcingHubData } from '../../types';

interface PlaceOrderChecklistProps {
  selectedSupplier: SupplierQuoteRow | null;
  supplierWithMetrics: SupplierQuoteRow | null;
  productData: any;
  hubData?: SourcingHubData;
  orderQuantity: number | null;
  effectiveTier: 'short' | 'medium' | 'long';
  localOverrides: Record<string, string>;
  confirmedFields: Set<string>;
  editingField: string | null;
  onConfirm: (fieldKey: string) => void;
  onUnconfirm: (fieldKey: string) => void;
  onStartEdit: (fieldKey: string) => void;
  onSaveEdit: (fieldKey: string, value: string) => void;
  onCancelEdit: () => void;
  onUpdateSupplierQuote?: (quoteId: string, updates: Partial<SupplierQuoteRow>) => void;
}

interface SectionState {
  expanded: boolean;
  optionalExpanded: boolean;
}

export function PlaceOrderChecklist({
  selectedSupplier,
  supplierWithMetrics,
  productData,
  hubData,
  orderQuantity,
  effectiveTier,
  localOverrides,
  confirmedFields,
  editingField,
  onConfirm,
  onUnconfirm,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onUpdateSupplierQuote,
}: PlaceOrderChecklistProps) {
  // Section expand/collapse state
  const [sectionStates, setSectionStates] = useState<Record<string, SectionState>>(() => {
    const states: Record<string, SectionState> = {};
    PLACE_ORDER_SCHEMA.forEach((section, index) => {
      states[section.key] = {
        expanded: index === 0, // First section expanded by default
        optionalExpanded: false,
      };
    });
    return states;
  });

  // Global filter state
  const [showOnlyConfirmed, setShowOnlyConfirmed] = useState(false);
  const [showOnlyUnconfirmed, setShowOnlyUnconfirmed] = useState(false);

  // Value mapper context
  const valueContext: ValueMapperContext = useMemo(() => ({
    selectedSupplier,
    supplierWithMetrics,
    productData,
    hubData,
    orderQuantity,
    effectiveTier,
    localOverrides,
  }), [selectedSupplier, supplierWithMetrics, productData, hubData, orderQuantity, effectiveTier, localOverrides]);

  // Calculate progress
  const progress = useMemo(() => {
    const allFields = PLACE_ORDER_SCHEMA.flatMap(s => s.fields);
    const requiredFields = allFields.filter(f => f.required);
    const requiredConfirmed = requiredFields.filter(f => {
      const valueSource = getFieldValue(f, valueContext);
      return confirmedFields.has(f.key) && valueSource.value !== null;
    });
    return {
      confirmed: requiredConfirmed.length,
      total: requiredFields.length,
    };
  }, [confirmedFields, valueContext]);

  // Section progress
  const sectionProgress = useMemo(() => {
    const progress: Record<string, { confirmed: number; total: number }> = {};
    PLACE_ORDER_SCHEMA.forEach(section => {
      const requiredFields = section.fields.filter(f => f.required);
      const confirmed = requiredFields.filter(f => {
        const valueSource = getFieldValue(f, valueContext);
        return confirmedFields.has(f.key) && valueSource.value !== null;
      });
      progress[section.key] = {
        confirmed: confirmed.length,
        total: requiredFields.length,
      };
    });
    return progress;
  }, [confirmedFields, valueContext]);

  // Toggle section expand/collapse
  const toggleSection = useCallback((sectionKey: string) => {
    setSectionStates(prev => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        expanded: !prev[sectionKey].expanded,
      },
    }));
  }, []);

  // Toggle optional subsection
  const toggleOptional = useCallback((sectionKey: string) => {
    setSectionStates(prev => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        optionalExpanded: !prev[sectionKey].optionalExpanded,
      },
    }));
  }, []);

  // Expand all / Collapse all
  const expandAll = useCallback(() => {
    setSectionStates(prev => {
      const newStates: Record<string, SectionState> = {};
      Object.keys(prev).forEach(key => {
        newStates[key] = { ...prev[key], expanded: true };
      });
      return newStates;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setSectionStates(prev => {
      const newStates: Record<string, SectionState> = {};
      Object.keys(prev).forEach(key => {
        newStates[key] = { ...prev[key], expanded: false };
      });
      return newStates;
    });
  }, []);

  // Handle field confirmation
  const handleConfirm = useCallback((fieldKey: string) => {
    const field = PLACE_ORDER_SCHEMA.flatMap(s => s.fields).find(f => f.key === fieldKey);
    if (!field) return;

    const valueSource = getFieldValue(field, valueContext);
    // Required fields must have a value
    if (field.required && !valueSource.value) {
      return; // Don't confirm if required and no value
    }

    if (confirmedFields.has(fieldKey)) {
      onUnconfirm(fieldKey);
    } else {
      onConfirm(fieldKey);
    }
  }, [confirmedFields, valueContext, onConfirm, onUnconfirm]);

  // Handle edit save with write-back
  const handleSaveEdit = useCallback((field: PlaceOrderField, value: string) => {
    onSaveEdit(field.key, value);

    // Write back to supplier quote (both mapped and non-mapped fields)
    if (selectedSupplier && onUpdateSupplierQuote) {
      const updates = getWriteBackUpdates(field, value, selectedSupplier, effectiveTier);
      if (Object.keys(updates).length > 0) {
        // If updates contain placeOrderFields, merge with existing
        if (updates.placeOrderFields) {
          const mergedUpdates = {
            ...updates,
            placeOrderFields: {
              ...(selectedSupplier.placeOrderFields || {}),
              ...updates.placeOrderFields,
            },
          };
          console.log('[PlaceOrderChecklist] Updating supplier with placeOrderFields:', {
            fieldKey: field.key,
            value,
            existingFields: selectedSupplier.placeOrderFields,
            newFields: updates.placeOrderFields,
            mergedFields: mergedUpdates.placeOrderFields
          });
          onUpdateSupplierQuote(selectedSupplier.id, mergedUpdates);
        } else {
          console.log('[PlaceOrderChecklist] Updating supplier (mapped field):', {
            fieldKey: field.key,
            updates
          });
          onUpdateSupplierQuote(selectedSupplier.id, updates);
        }
      }
    }
  }, [selectedSupplier, effectiveTier, onSaveEdit, onUpdateSupplierQuote]);

  // Filter fields based on showOnlyConfirmed / showOnlyUnconfirmed
  const getFilteredFields = useCallback((fields: PlaceOrderField[]) => {
    if (showOnlyConfirmed) {
      return fields.filter(f => confirmedFields.has(f.key));
    }
    if (showOnlyUnconfirmed) {
      return fields.filter(f => !confirmedFields.has(f.key));
    }
    return fields;
  }, [showOnlyConfirmed, showOnlyUnconfirmed, confirmedFields]);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-white">Purchase Order Checklist</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">
                {progress.confirmed}/{progress.total} Required Confirmed
              </span>
              <div className="w-32 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.confirmed / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Collapse All
            </button>
            <button
              onClick={() => {
                setShowOnlyConfirmed(!showOnlyConfirmed);
                setShowOnlyUnconfirmed(false);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                showOnlyConfirmed
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-700'
              }`}
            >
              Show Agreed
            </button>
            <button
              onClick={() => {
                setShowOnlyUnconfirmed(!showOnlyUnconfirmed);
                setShowOnlyConfirmed(false);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                showOnlyUnconfirmed
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : 'text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-700'
              }`}
            >
              Show Unconfirmed
            </button>
          </div>
        </div>
      </div>

      {/* Checklist Content */}
      <div className="overflow-y-auto max-h-[calc(100vh-400px)]">
        <div className="p-6 space-y-6">
          {PLACE_ORDER_SCHEMA.map(section => {
            const sectionState = sectionStates[section.key] || { expanded: false, optionalExpanded: false };
            const progress = sectionProgress[section.key] || { confirmed: 0, total: 0 };
            const requiredFields = section.fields.filter(f => f.required);
            const optionalFields = section.fields.filter(f => !f.required);
            const hasFilledOptionals = optionalFields.some(f => {
              const valueSource = getFieldValue(f, valueContext);
              return valueSource.value !== null;
            });

            // Filter fields
            const filteredRequired = getFilteredFields(requiredFields);
            const filteredOptional = getFilteredFields(optionalFields);

            return (
              <div
                key={section.key}
                className="border border-slate-700/50 rounded-lg overflow-hidden bg-slate-900/30"
              >
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(section.key)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {sectionState.expanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    )}
                    <h4 className="text-sm font-semibold text-white">{section.title}</h4>
                    <span className="text-xs text-slate-400">
                      {progress.confirmed}/{progress.total} Required Fields Confirmed
                    </span>
                    <div className="w-24 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500/50 transition-all duration-300"
                        style={{ width: `${progress.total > 0 ? (progress.confirmed / progress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </button>

                {/* Section Content */}
                {sectionState.expanded && (
                  <div className="border-t border-slate-700/50">
                    {/* Required Fields */}
                    {filteredRequired.length > 0 && (
                      <div className="px-4 py-2 bg-slate-800/30">
                        <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                          Required
                        </h5>
                        <ChecklistTable
                          fields={filteredRequired}
                          valueContext={valueContext}
                          confirmedFields={confirmedFields}
                          editingField={editingField}
                          onConfirm={handleConfirm}
                          onStartEdit={onStartEdit}
                          onSaveEdit={(field, value) => handleSaveEdit(field, value)}
                          onCancelEdit={onCancelEdit}
                        />
                      </div>
                    )}

                    {/* Optional Fields */}
                    {optionalFields.length > 0 && (
                      <div className="px-4 py-2">
                        <button
                          onClick={() => toggleOptional(section.key)}
                          className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-300 mb-3"
                        >
                          {sectionState.optionalExpanded ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronUp className="w-3 h-3" />
                          )}
                          {hasFilledOptionals && !sectionState.optionalExpanded && (
                            <span className="text-emerald-400">(Filled)</span>
                          )}
                          <span>+ Add Optional</span>
                        </button>
                        {(sectionState.optionalExpanded || hasFilledOptionals) && (
                          <div className="mt-2">
                            <ChecklistTable
                              fields={sectionState.optionalExpanded ? filteredOptional : filteredOptional.filter(f => {
                                const valueSource = getFieldValue(f, valueContext);
                                return valueSource.value !== null;
                              })}
                              valueContext={valueContext}
                              confirmedFields={confirmedFields}
                              editingField={editingField}
                              onConfirm={handleConfirm}
                              onStartEdit={onStartEdit}
                              onSaveEdit={(field, value) => handleSaveEdit(field, value)}
                              onCancelEdit={onCancelEdit}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Checklist Table Component
interface ChecklistTableProps {
  fields: PlaceOrderField[];
  valueContext: ValueMapperContext;
  confirmedFields: Set<string>;
  editingField: string | null;
  onConfirm: (fieldKey: string) => void;
  onStartEdit: (fieldKey: string) => void;
  onSaveEdit: (field: PlaceOrderField, value: string) => void;
  onCancelEdit: () => void;
}

function ChecklistTable({
  fields,
  valueContext,
  confirmedFields,
  editingField,
  onConfirm,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: ChecklistTableProps) {
  return (
    <table className="w-full table-fixed">
      <colgroup>
        <col className="w-[40%]" />
        <col className="w-[45%]" />
        <col className="w-[15%]" />
      </colgroup>
      <thead>
        <tr className="border-b border-slate-700/30">
          <th className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Item
          </th>
          <th className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Current
          </th>
          <th className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Confirm
          </th>
        </tr>
      </thead>
      <tbody>
        {fields.map(field => {
          const valueSource = getFieldValue(field, valueContext);
          const isConfirmed = confirmedFields.has(field.key);
          const isEditing = editingField === field.key;

          return (
            <ChecklistRow
              key={field.key}
              field={field}
              valueSource={valueSource}
              isConfirmed={isConfirmed}
              isEditing={isEditing}
              onConfirm={() => onConfirm(field.key)}
              onStartEdit={() => onStartEdit(field.key)}
              onSaveEdit={(value) => onSaveEdit(field, value)}
              onCancelEdit={onCancelEdit}
            />
          );
        })}
      </tbody>
    </table>
  );
}

// Checklist Row Component
interface ChecklistRowProps {
  field: PlaceOrderField;
  valueSource: { value: string | null; source: string; isMapped: boolean };
  isConfirmed: boolean;
  isEditing: boolean;
  onConfirm: () => void;
  onStartEdit: () => void;
  onSaveEdit: (value: string) => void;
  onCancelEdit: () => void;
}

function ChecklistRow({
  field,
  valueSource,
  isConfirmed,
  isEditing,
  onConfirm,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: ChecklistRowProps) {
  const [editValue, setEditValue] = useState(valueSource.value || '');

  useEffect(() => {
    if (isEditing) {
      setEditValue(valueSource.value || '');
    }
  }, [isEditing, valueSource.value]);

  const handleSave = () => {
    onSaveEdit(editValue.trim());
  };

  const canConfirm = valueSource.value !== null && valueSource.value.trim() !== '';

  return (
    <tr
      className={`border-b border-slate-700/20 transition-colors ${
        isConfirmed ? 'bg-emerald-500/5' : ''
      }`}
    >
      <td className="py-3 px-3 overflow-hidden">
        <span className="text-sm text-white font-medium truncate block">{field.label}</span>
      </td>
      <td className="py-3 px-3 overflow-hidden">
        {isEditing ? (
          <div className="space-y-1">
            <p className="text-xs text-slate-400">Confirm change?</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 px-2 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSave();
                  } else if (e.key === 'Escape') {
                    onCancelEdit();
                  }
                }}
              />
              <button
                onClick={handleSave}
                className="p-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                title="Save"
              >
                <Save className="w-4 h-4" />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-1.5 text-slate-400 hover:text-slate-300 transition-colors"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className={`text-sm ${
                valueSource.value ? 'text-slate-300' : 'text-slate-500 italic'
              }`}
            >
              {valueSource.value || '—'}
            </span>
            {valueSource.isMapped && valueSource.value && (
              <span className="text-xs px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded">
                Mapped
              </span>
            )}
          </div>
        )}
      </td>
      <td className="py-3 px-3">
        <div className="flex items-center gap-2 justify-start">
          {!isEditing && (
            <button
              onClick={onStartEdit}
              className="p-1.5 text-slate-400 hover:text-slate-300 transition-colors flex-shrink-0"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              isConfirmed
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : canConfirm
                ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/50'
                : 'bg-slate-800/50 text-slate-500 border border-slate-700/50 cursor-not-allowed'
            }`}
            title={!canConfirm ? 'Value required' : isConfirmed ? 'Unconfirm' : 'Confirm'}
          >
            {isConfirmed ? 'CONFIRMED' : 'Confirm'}
          </button>
        </div>
      </td>
    </tr>
  );
}

// Write-back helper: maps field edits to SupplierQuoteRow updates
function getWriteBackUpdates(
  field: PlaceOrderField,
  value: string,
  quote: SupplierQuoteRow,
  tier: 'short' | 'medium' | 'long'
): Partial<SupplierQuoteRow> {
  const updates: Partial<SupplierQuoteRow> = {};

  // Parse value based on field type
  const numValue = parseFloat(value.replace(/[^0-9.-]/g, ''));
  const isNumeric = !isNaN(numValue) && value.match(/[\d.,]/);

  switch (field.key) {
    // User Company Information fields (write back to supplier fields)
    case 'your_name':
      updates.displayName = value;
      updates.supplierName = value;
      break;
    case 'company_name':
      updates.companyName = value;
      break;
    
    case 'supplier_name':
      updates.displayName = value;
      updates.supplierName = value;
      break;
    case 'supplier_company_name':
      updates.companyName = value;
      break;
    case 'supplier_address':
      updates.supplierAddress = value;
      break;
    case 'supplier_contact_number':
      updates.supplierContactNumber = value;
      break;
    case 'supplier_email':
      updates.supplierEmail = value;
      break;
    case 'lead_time':
      updates.leadTime = value;
      break;
    case 'payment_terms':
      updates.paymentTerms = value as any;
      break;
    case 'incoterms':
    case 'incoterms_freight':
      updates.incotermsAgreed = value;
      break;
    case 'moq':
      if (isNumeric) {
        if (tier === 'medium') {
          updates.moqMediumTerm = numValue;
        } else if (tier === 'long') {
          updates.moqLongTerm = numValue;
        } else {
          updates.moqShortTerm = numValue;
        }
      }
      break;
    case 'cost_price':
      if (isNumeric) {
        if (tier === 'medium') {
          updates.costPerUnitMediumTerm = numValue;
        } else if (tier === 'long') {
          updates.costPerUnitLongTerm = numValue;
        } else {
          updates.costPerUnitShortTerm = numValue;
        }
      }
      break;
    case 'freight_cost_per_unit':
      if (isNumeric) {
        updates.freightCostPerUnit = numValue;
      }
      break;
    case 'duty_cost_per_unit':
      if (isNumeric) {
        updates.dutyCostPerUnit = numValue;
      }
      break;
    case 'tariff_cost_per_unit':
      if (isNumeric) {
        updates.tariffCostPerUnit = numValue;
      }
      break;
    case 'packaging_cost':
      if (isNumeric) {
        updates.packagingCostPerUnit = numValue;
      }
      break;
    case 'labelling_cost':
      if (isNumeric) {
        updates.labellingCostPerUnit = numValue;
      }
      break;
    case 'units_per_carton':
      if (isNumeric) {
        updates.unitsPerCarton = Math.round(numValue);
      }
      break;
    case 'carton_weight':
      // Extract numeric value from "X kg" format
      const weightMatch = value.match(/([\d.]+)/);
      if (weightMatch) {
        updates.cartonWeightKg = parseFloat(weightMatch[1]);
      }
      break;
    case 'unit_package_weight':
      const unitWeightMatch = value.match(/([\d.]+)/);
      if (unitWeightMatch) {
        updates.singleProductPackageWeightKg = parseFloat(unitWeightMatch[1]);
      }
      break;
      
    // Non-mapped fields - store in placeOrderFields
    // case 'your_name':
    //   updates.placeOrderFields = { yourName: value };
    //   break;
    // case 'company_name':
    //   updates.placeOrderFields = { companyName: value };
    //   break;
    case 'brand_name':
      updates.placeOrderFields = { brandName: value };
      break;
    case 'company_address':
      updates.placeOrderFields = { companyAddress: value };
      break;
    case 'company_phone_number':
      updates.placeOrderFields = { companyPhoneNumber: value };
      break;
    case 'purchase_order_number':
      updates.placeOrderFields = { purchaseOrderNumber: value };
      break;
    case 'product_sku':
      updates.placeOrderFields = { productSku: value };
      break;
    case 'product_size':
      updates.placeOrderFields = { productSize: value };
      break;
    case 'color':
      updates.placeOrderFields = { color: value };
      break;
    case 'material_used':
      updates.placeOrderFields = { materialUsed: value };
      break;
    case 'brand_name_product':
      updates.placeOrderFields = { brandNameProduct: value };
      break;
    case 'brand_logo':
      updates.placeOrderFields = { brandLogo: value };
      break;
    case 'brand_logo_sent':
      updates.placeOrderFields = { brandLogoSent: value };
      break;
    case 'upc_fnsku':
      updates.placeOrderFields = { upcFnsku: value };
      break;
    case 'additional_details':
      updates.placeOrderFields = { additionalDetails: value };
      break;
    case 'sample_refund_agreed':
      updates.placeOrderFields = { sampleRefundAgreed: value };
      break;
    case 'inspection_agreed':
      updates.placeOrderFields = { inspectionAgreed: value };
      break;
    case 'product_label_agreed':
      updates.placeOrderFields = { productLabelAgreed: value };
      break;
    case 'packaging_type':
      updates.placeOrderFields = { packagingType: value };
      break;
    case 'package_design':
      updates.placeOrderFields = { packageDesign: value };
      break;
    case 'units_per_package':
      updates.placeOrderFields = { unitsPerPackage: value };
      break;
    case 'product_label_sent':
      updates.placeOrderFields = { productLabelSent: value };
      break;
    case 'freight_forwarder':
      updates.placeOrderFields = { freightForwarder: value };
      break;
    case 'shipping_time':
      updates.placeOrderFields = { shippingTime: value };
      break;
    case 'hts_code':
      updates.placeOrderFields = { htsCode: value };
      break;
    case 'duty_rate':
      updates.placeOrderFields = { dutyRate: value };
      break;
    case 'tariff_code':
      updates.placeOrderFields = { tariffCode: value };
      break;
    case 'additional_customs_documents':
      updates.placeOrderFields = { additionalCustomsDocuments: value };
      break;
    case 'additional_notes_for_supplier':
      updates.placeOrderFields = { additionalNotesForSupplier: value };
      break;
  }

  return updates;
}
