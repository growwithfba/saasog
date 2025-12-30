'use client';

import { useMemo } from 'react';
import { Calculator, DollarSign, Package } from 'lucide-react';
import type { ProfitCalculatorData } from '../types';
import { formatCurrency } from '@/utils/formatters';

interface ProfitCalculatorTabProps {
  productId: string;
  productData: any;
  data: ProfitCalculatorData | undefined;
  onChange: (data: ProfitCalculatorData) => void;
}

export function ProfitCalculatorTab({ productId, productData, data, onChange }: ProfitCalculatorTabProps) {
  const profitData = data || {
    sampleOrdered: false,
    sampleNotes: '',
    brandName: '',
    productName: '',
    category: '',
    sku: '',
    asin: '',
    upc: '',
    fnsku: '',
    amazonListingUrl: '',
    incoterms: '',
    freightForwarder: '',
    htsCode: '',
    htsLookupUrl: '',
    dutyRatePct: null,
    tariffPct: null,
    productWeightLb: null,
    productDimensionsIn: '',
    cartonWeightLb: null,
    cartonDimensionsIn: '',
    unitsPerCarton: null,
    salesPrice: null,
    orderQty: null,
    exwUnitCost: null,
    packagingCostTotal: null,
    inspectionCostTotal: null,
    freightCostTotal: null,
    dutyCostTotal: null,
    miscCostTotal: null,
    referralFeePct: null,
    fbaFeePerUnit: null,
    notes: ''
  };

  // Auto-fill from product data if available
  const handleFieldChange = (field: keyof ProfitCalculatorData, value: any) => {
    onChange({
      ...profitData,
      [field]: value
    });
  };

  // Calculate summary metrics
  const summary = useMemo(() => {
    const salesPrice = profitData.salesPrice || 0;
    const orderQty = profitData.orderQty || 0;
    const referralFeePct = profitData.referralFeePct ?? 0.15;
    const referralFee = salesPrice * referralFeePct;
    const fbaFeePerUnit = profitData.fbaFeePerUnit || 0;
    const totalFbaFeesPerUnit = referralFee + fbaFeePerUnit;

    const exwUnitCost = profitData.exwUnitCost || 0;
    const packagingCostTotal = profitData.packagingCostTotal || 0;
    const inspectionCostTotal = profitData.inspectionCostTotal || 0;
    const freightCostTotal = profitData.freightCostTotal || 0;
    const dutyCostTotal = profitData.dutyCostTotal || 0;
    const miscCostTotal = profitData.miscCostTotal || 0;

    const landedTotalCost = 
      (exwUnitCost * orderQty) +
      packagingCostTotal +
      inspectionCostTotal +
      freightCostTotal +
      dutyCostTotal +
      miscCostTotal;

    const landedUnitCost = orderQty > 0 ? landedTotalCost / orderQty : 0;
    const profitPerUnit = salesPrice - totalFbaFeesPerUnit - landedUnitCost;
    const roiPct = landedUnitCost > 0 ? (profitPerUnit / landedUnitCost) * 100 : null;
    const marginPct = salesPrice > 0 ? (profitPerUnit / salesPrice) * 100 : null;
    const grossProfit = profitPerUnit * orderQty;
    const totalInvestment = landedTotalCost;

    return {
      referralFee,
      totalFbaFeesPerUnit,
      landedTotalCost,
      landedUnitCost,
      profitPerUnit,
      roiPct,
      marginPct,
      grossProfit,
      totalInvestment
    };
  }, [profitData]);

  const formatValue = (value: number | null | undefined, isCurrency = false): string => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return isCurrency ? formatCurrency(value) : value.toFixed(2);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Inputs */}
      <div className="lg:col-span-2 space-y-6">
        {/* Product Identifiers */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            Product Identifiers
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Brand Name</label>
              <input
                type="text"
                value={profitData.brandName || productData?.brand || ''}
                onChange={(e) => handleFieldChange('brandName', e.target.value)}
                placeholder="Brand name"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Product Name</label>
              <input
                type="text"
                value={profitData.productName || productData?.title || ''}
                onChange={(e) => handleFieldChange('productName', e.target.value)}
                placeholder="Product name"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Category</label>
              <input
                type="text"
                value={profitData.category || productData?.category || ''}
                onChange={(e) => handleFieldChange('category', e.target.value)}
                placeholder="Category"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">SKU</label>
              <input
                type="text"
                value={profitData.sku}
                onChange={(e) => handleFieldChange('sku', e.target.value)}
                placeholder="SKU"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">ASIN</label>
              <input
                type="text"
                value={profitData.asin || productData?.asin || ''}
                onChange={(e) => handleFieldChange('asin', e.target.value)}
                placeholder="ASIN"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">UPC</label>
              <input
                type="text"
                value={profitData.upc}
                onChange={(e) => handleFieldChange('upc', e.target.value)}
                placeholder="UPC"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">FNSKU</label>
              <input
                type="text"
                value={profitData.fnsku}
                onChange={(e) => handleFieldChange('fnsku', e.target.value)}
                placeholder="FNSKU"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Amazon Listing URL</label>
              <input
                type="url"
                value={profitData.amazonListingUrl}
                onChange={(e) => handleFieldChange('amazonListingUrl', e.target.value)}
                placeholder="https://www.amazon.com/..."
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
        </div>

        {/* Sample Status */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Sample Status</h3>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={profitData.sampleOrdered}
                onChange={(e) => handleFieldChange('sampleOrdered', e.target.checked)}
                className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-white">Sample ordered</span>
            </label>
            {profitData.sampleOrdered && (
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Sample Order Date</label>
                <input
                  type="date"
                  value={profitData.sampleOrderDate || ''}
                  onChange={(e) => handleFieldChange('sampleOrderDate', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Sample Notes</label>
              <textarea
                value={profitData.sampleNotes}
                onChange={(e) => handleFieldChange('sampleNotes', e.target.value)}
                placeholder="Notes about the sample..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Order Inputs */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            Order & Cost Inputs
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Sales Price</label>
              <input
                type="number"
                step="0.01"
                value={profitData.salesPrice || ''}
                onChange={(e) => handleFieldChange('salesPrice', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Order Quantity</label>
              <input
                type="number"
                value={profitData.orderQty || ''}
                onChange={(e) => handleFieldChange('orderQty', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="0"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">EXW Unit Cost</label>
              <input
                type="number"
                step="0.01"
                value={profitData.exwUnitCost || ''}
                onChange={(e) => handleFieldChange('exwUnitCost', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
        </div>

        {/* Cost Totals */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Cost Totals</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Packaging Cost (Total)</label>
              <input
                type="number"
                step="0.01"
                value={profitData.packagingCostTotal || ''}
                onChange={(e) => handleFieldChange('packagingCostTotal', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Inspection Cost (Total)</label>
              <input
                type="number"
                step="0.01"
                value={profitData.inspectionCostTotal || ''}
                onChange={(e) => handleFieldChange('inspectionCostTotal', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Freight Cost (Total)</label>
              <input
                type="number"
                step="0.01"
                value={profitData.freightCostTotal || ''}
                onChange={(e) => handleFieldChange('freightCostTotal', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Duty Cost (Total)</label>
              <input
                type="number"
                step="0.01"
                value={profitData.dutyCostTotal || ''}
                onChange={(e) => handleFieldChange('dutyCostTotal', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Misc Cost (Total)</label>
              <input
                type="number"
                step="0.01"
                value={profitData.miscCostTotal || ''}
                onChange={(e) => handleFieldChange('miscCostTotal', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
        </div>

        {/* Fees */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Fees</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Referral Fee %</label>
              <input
                type="number"
                step="0.01"
                value={profitData.referralFeePct ?? 0.15}
                onChange={(e) => handleFieldChange('referralFeePct', e.target.value ? parseFloat(e.target.value) : 0.15)}
                placeholder="0.15"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">FBA Fee Per Unit</label>
              <input
                type="number"
                step="0.01"
                value={profitData.fbaFeePerUnit || ''}
                onChange={(e) => handleFieldChange('fbaFeePerUnit', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Notes</h3>
          <textarea
            value={profitData.notes}
            onChange={(e) => handleFieldChange('notes', e.target.value)}
            placeholder="Additional notes..."
            rows={4}
            className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 resize-none"
          />
        </div>
      </div>

      {/* Right Column - Summary Panel */}
      <div className="lg:col-span-1">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 sticky top-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-purple-400" />
            Profitability Summary
          </h3>
          <div className="space-y-4">
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">Landed Total Cost</div>
              <div className="text-xl font-bold text-white">
                {formatValue(summary.landedTotalCost, true)}
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">Landed Unit Cost</div>
              <div className="text-xl font-bold text-white">
                {formatValue(summary.landedUnitCost, true)}
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">Referral Fee Per Unit</div>
              <div className="text-xl font-bold text-white">
                {formatValue(summary.referralFee, true)}
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">Total FBA Fees Per Unit</div>
              <div className="text-xl font-bold text-white">
                {formatValue(summary.totalFbaFeesPerUnit, true)}
              </div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
              <div className="text-xs text-emerald-400 mb-1">Profit Per Unit</div>
              <div className="text-2xl font-bold text-emerald-400">
                {formatValue(summary.profitPerUnit, true)}
              </div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="text-xs text-blue-400 mb-1">ROI %</div>
              <div className="text-2xl font-bold text-blue-400">
                {formatValue(summary.roiPct, false)}
                {summary.roiPct !== null && !isNaN(summary.roiPct) ? '%' : ''}
              </div>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
              <div className="text-xs text-purple-400 mb-1">Margin %</div>
              <div className="text-2xl font-bold text-purple-400">
                {formatValue(summary.marginPct, false)}
                {summary.marginPct !== null && !isNaN(summary.marginPct) ? '%' : ''}
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">Total Investment</div>
              <div className="text-xl font-bold text-white">
                {formatValue(summary.totalInvestment, true)}
              </div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
              <div className="text-xs text-emerald-400 mb-1">Gross Profit</div>
              <div className="text-2xl font-bold text-emerald-400">
                {formatValue(summary.grossProfit, true)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

