'use client';

import { useState, useMemo } from 'react';
import { Plus, Trash2, ExternalLink, Calculator } from 'lucide-react';
import type { SupplierQuoteRow } from '../types';
import { formatCurrency } from '@/utils/formatters';

interface SupplierQuotesTabProps {
  productId: string;
  data: SupplierQuoteRow[];
  onChange: (quotes: SupplierQuoteRow[]) => void;
}

// Calculate derived fields for a quote
const calculateQuoteMetrics = (quote: SupplierQuoteRow): SupplierQuoteRow => {
  const salesPrice = quote.salesPrice || 0;
  const referralFeePct = quote.referralFeePct ?? 0.15;
  const referralFee = salesPrice * referralFeePct;
  const fbaFeePerUnit = quote.fbaFeePerUnit || 0;
  const totalFbaFeesPerUnit = referralFee + fbaFeePerUnit;
  
  const exwUnitCost = quote.exwUnitCost || 0;
  const ddpShippingPerUnit = quote.ddpShippingPerUnit || 0;
  const packagingPerUnit = quote.packagingPerUnit || 0;
  const inspectionPerUnit = quote.inspectionPerUnit || 0;
  const miscPerUnit = quote.miscPerUnit || 0;
  
  const landedUnitCost = exwUnitCost + ddpShippingPerUnit + packagingPerUnit + inspectionPerUnit + miscPerUnit;
  const profitPerUnit = salesPrice - totalFbaFeesPerUnit - landedUnitCost;
  
  const roiPct = landedUnitCost > 0 ? (profitPerUnit / landedUnitCost) * 100 : null;
  const marginPct = salesPrice > 0 ? (profitPerUnit / salesPrice) * 100 : null;
  
  const moq = quote.moq || 0;
  const totalInvestment = landedUnitCost * moq;
  const grossProfit = profitPerUnit * moq;

  return {
    ...quote,
    referralFee,
    totalFbaFeesPerUnit,
    landedUnitCost,
    profitPerUnit,
    roiPct,
    marginPct,
    totalInvestment,
    grossProfit
  };
};

export function SupplierQuotesTab({ productId, data, onChange }: SupplierQuotesTabProps) {
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);

  // Calculate metrics for all quotes
  const quotesWithMetrics = useMemo(() => {
    return data.map(calculateQuoteMetrics);
  }, [data]);

  const handleAddSupplier = () => {
    const newQuote: SupplierQuoteRow = {
      id: `quote_${Date.now()}`,
      supplierName: '',
      moq: null,
      salesPrice: null,
      exwUnitCost: null,
      ddpShippingPerUnit: null,
      referralFeePct: 0.15,
      fbaFeePerUnit: null,
      packagingPerUnit: null,
      inspectionPerUnit: null,
      miscPerUnit: null,
      notes: '',
      referralFee: null,
      totalFbaFeesPerUnit: null,
      landedUnitCost: null,
      profitPerUnit: null,
      roiPct: null,
      marginPct: null,
      totalInvestment: null,
      grossProfit: null
    };
    onChange([...data, newQuote]);
  };

  const handleDeleteSupplier = (id: string) => {
    onChange(data.filter(q => q.id !== id));
    setShowDeleteModal(null);
  };

  const handleUpdateQuote = (id: string, updates: Partial<SupplierQuoteRow>) => {
    onChange(data.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const formatValue = (value: number | null | undefined, isCurrency = false): string => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return isCurrency ? formatCurrency(value) : value.toFixed(2);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Supplier Quotes Comparison</h3>
          <p className="text-sm text-slate-400 mt-1">
            Compare multiple supplier quotes side-by-side to find the best option
          </p>
        </div>
        <button
          onClick={handleAddSupplier}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Supplier
        </button>
      </div>

      {quotesWithMetrics.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-12 text-center">
          <Calculator className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-400 mb-2">No supplier quotes yet</p>
          <p className="text-sm text-slate-500 mb-4">Add your first supplier quote to start comparing profitability</p>
          <button
            onClick={handleAddSupplier}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-medium transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add First Supplier
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {quotesWithMetrics.map((quote, index) => (
            <div
              key={quote.id}
              className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h4 className="text-lg font-semibold text-white">
                    Supplier {index + 1}
                  </h4>
                  {quote.supplierName && (
                    <span className="text-slate-400">- {quote.supplierName}</span>
                  )}
                </div>
                <button
                  onClick={() => setShowDeleteModal(quote.id)}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Remove supplier"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Input Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                      Supplier Name
                    </label>
                    <input
                      type="text"
                      value={quote.supplierName}
                      onChange={(e) => handleUpdateQuote(quote.id, { supplierName: e.target.value })}
                      placeholder="Supplier name"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                      MOQ
                    </label>
                    <input
                      type="number"
                      value={quote.moq || ''}
                      onChange={(e) => handleUpdateQuote(quote.id, { moq: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="Minimum order quantity"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                      Sales Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={quote.salesPrice || ''}
                      onChange={(e) => handleUpdateQuote(quote.id, { salesPrice: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                      EXW Unit Cost
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={quote.exwUnitCost || ''}
                      onChange={(e) => handleUpdateQuote(quote.id, { exwUnitCost: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                      DDP Shipping/Unit
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={quote.ddpShippingPerUnit || ''}
                      onChange={(e) => handleUpdateQuote(quote.id, { ddpShippingPerUnit: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                      Referral Fee %
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={quote.referralFeePct ?? 0.15}
                      onChange={(e) => handleUpdateQuote(quote.id, { referralFeePct: e.target.value ? parseFloat(e.target.value) : 0.15 })}
                      placeholder="0.15"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1 flex items-center gap-2">
                      FBA Fee/Unit
                      <a
                        href="https://sellercentral.amazon.com/fba/profitabilitycalculator/index.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
                        title="Open FBA fee calculator"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Calculator
                      </a>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={quote.fbaFeePerUnit || ''}
                      onChange={(e) => handleUpdateQuote(quote.id, { fbaFeePerUnit: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                      Packaging/Unit
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={quote.packagingPerUnit || ''}
                      onChange={(e) => handleUpdateQuote(quote.id, { packagingPerUnit: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                      Inspection/Unit
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={quote.inspectionPerUnit || ''}
                      onChange={(e) => handleUpdateQuote(quote.id, { inspectionPerUnit: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                      Misc/Unit
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={quote.miscPerUnit || ''}
                      onChange={(e) => handleUpdateQuote(quote.id, { miscPerUnit: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={quote.notes}
                      onChange={(e) => handleUpdateQuote(quote.id, { notes: e.target.value })}
                      placeholder="Additional notes..."
                      rows={3}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 resize-none"
                    />
                  </div>
                </div>

                {/* Calculated Outputs */}
                <div className="space-y-4">
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <div className="text-xs text-slate-400 mb-1">Referral Fee</div>
                    <div className="text-lg font-semibold text-white">
                      {formatValue(quote.referralFee, true)}
                    </div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <div className="text-xs text-slate-400 mb-1">Total FBA Fees/Unit</div>
                    <div className="text-lg font-semibold text-white">
                      {formatValue(quote.totalFbaFeesPerUnit, true)}
                    </div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <div className="text-xs text-slate-400 mb-1">Landed Unit Cost</div>
                    <div className="text-lg font-semibold text-white">
                      {formatValue(quote.landedUnitCost, true)}
                    </div>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                    <div className="text-xs text-emerald-400 mb-1">Profit/Unit</div>
                    <div className="text-lg font-semibold text-emerald-400">
                      {formatValue(quote.profitPerUnit, true)}
                    </div>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <div className="text-xs text-blue-400 mb-1">ROI %</div>
                    <div className="text-lg font-semibold text-blue-400">
                      {formatValue(quote.roiPct, false)}
                      {quote.roiPct !== null && !isNaN(quote.roiPct) ? '%' : ''}
                    </div>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                    <div className="text-xs text-purple-400 mb-1">Margin %</div>
                    <div className="text-lg font-semibold text-purple-400">
                      {formatValue(quote.marginPct, false)}
                      {quote.marginPct !== null && !isNaN(quote.marginPct) ? '%' : ''}
                    </div>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <div className="text-xs text-slate-400 mb-1">Total Investment</div>
                    <div className="text-lg font-semibold text-white">
                      {formatValue(quote.totalInvestment, true)}
                    </div>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                    <div className="text-xs text-emerald-400 mb-1">Gross Profit</div>
                    <div className="text-lg font-semibold text-emerald-400">
                      {formatValue(quote.grossProfit, true)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Remove Supplier Quote?</h3>
                <p className="text-slate-400 text-sm">This action cannot be undone</p>
              </div>
            </div>
            
            <p className="text-slate-300 mb-6">
              Are you sure you want to remove this supplier quote? All data for this supplier will be lost.
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteSupplier(showDeleteModal)}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-white transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

