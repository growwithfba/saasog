'use client';

import { Package, DollarSign, TrendingUp, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';

interface OverviewTabProps {
  productData: any;
  sourcingData: any;
}

export function OverviewTab({ productData, sourcingData }: OverviewTabProps) {
  const status = sourcingData?.status || 'none';
  const supplierQuotes = sourcingData?.supplierQuotes || [];
  const profitCalculator = sourcingData?.profitCalculator;

  const getStatusInfo = () => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          label: 'Sourcing Complete'
        };
      case 'working':
        return {
          icon: Clock,
          color: 'text-blue-400',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
          label: 'In Progress'
        };
      default:
        return {
          icon: AlertCircle,
          color: 'text-slate-400',
          bg: 'bg-slate-500/10',
          border: 'border-slate-500/30',
          label: 'Not Started'
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  // Calculate summary stats
  const totalSuppliers = supplierQuotes.length;
  const bestQuote = supplierQuotes.length > 0 
    ? supplierQuotes.reduce((best: any, quote: any) => {
        if (!best) return quote;
        const bestROI = best.roiPct || 0;
        const quoteROI = quote.roiPct || 0;
        return quoteROI > bestROI ? quote : best;
      }, null)
    : null;

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className={`bg-slate-800/50 rounded-xl border ${statusInfo.border} p-6`}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 ${statusInfo.bg} rounded-xl flex items-center justify-center`}>
            <StatusIcon className={`w-6 h-6 ${statusInfo.color}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{statusInfo.label}</h3>
            <p className="text-sm text-slate-400">
              {status === 'completed' 
                ? 'This product is ready for order placement'
                : status === 'working'
                ? 'Sourcing information is being collected'
                : 'Start adding supplier quotes and cost information'}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-5 h-5 text-blue-400" />
            <h4 className="text-sm font-medium text-slate-400">Suppliers</h4>
          </div>
          <p className="text-2xl font-bold text-white">{totalSuppliers}</p>
          <p className="text-xs text-slate-500 mt-1">Quotes received</p>
        </div>

        {bestQuote && (
          <>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <h4 className="text-sm font-medium text-slate-400">Best ROI</h4>
              </div>
              <p className="text-2xl font-bold text-emerald-400">
                {bestQuote.roiPct !== null && !isNaN(bestQuote.roiPct) 
                  ? `${bestQuote.roiPct.toFixed(1)}%`
                  : '-'}
              </p>
              <p className="text-xs text-slate-500 mt-1">{bestQuote.supplierName || 'N/A'}</p>
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
              <div className="flex items-center gap-3 mb-2">
                <DollarSign className="w-5 h-5 text-purple-400" />
                <h4 className="text-sm font-medium text-slate-400">Best Profit/Unit</h4>
              </div>
              <p className="text-2xl font-bold text-purple-400">
                {bestQuote.profitPerUnit !== null && !isNaN(bestQuote.profitPerUnit)
                  ? formatCurrency(bestQuote.profitPerUnit)
                  : '-'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Per unit profit</p>
            </div>
          </>
        )}
      </div>

      {/* Product Info Summary */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Product Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-slate-400 mb-1">ASIN</p>
            <p className="text-white font-medium">{productData?.asin || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-slate-400 mb-1">Title</p>
            <p className="text-white font-medium">{productData?.title || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-slate-400 mb-1">Brand</p>
            <p className="text-white font-medium">{productData?.brand || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-slate-400 mb-1">Category</p>
            <p className="text-white font-medium">{productData?.category || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Next Steps</h3>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              totalSuppliers > 0 ? 'bg-emerald-500/20' : 'bg-slate-700/50'
            }`}>
              {totalSuppliers > 0 ? (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              ) : (
                <div className="w-2 h-2 bg-slate-500 rounded-full" />
              )}
            </div>
            <div>
              <p className="text-white font-medium">Add Supplier Quotes</p>
              <p className="text-sm text-slate-400">Compare multiple supplier quotes in the Supplier Quotes tab</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              profitCalculator?.salesPrice && profitCalculator?.exwUnitCost ? 'bg-emerald-500/20' : 'bg-slate-700/50'
            }`}>
              {profitCalculator?.salesPrice && profitCalculator?.exwUnitCost ? (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              ) : (
                <div className="w-2 h-2 bg-slate-500 rounded-full" />
              )}
            </div>
            <div>
              <p className="text-white font-medium">Calculate Detailed Profitability</p>
              <p className="text-sm text-slate-400">Use the Profit Calculator tab to get accurate profit projections</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              profitCalculator?.htsCode ? 'bg-emerald-500/20' : 'bg-slate-700/50'
            }`}>
              {profitCalculator?.htsCode ? (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              ) : (
                <div className="w-2 h-2 bg-slate-500 rounded-full" />
              )}
            </div>
            <div>
              <p className="text-white font-medium">Complete Freight & Compliance</p>
              <p className="text-sm text-slate-400">Add HTS codes, incoterms, and freight forwarder information</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              profitCalculator?.cartonDimensionsIn ? 'bg-emerald-500/20' : 'bg-slate-700/50'
            }`}>
              {profitCalculator?.cartonDimensionsIn ? (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              ) : (
                <div className="w-2 h-2 bg-slate-500 rounded-full" />
              )}
            </div>
            <div>
              <p className="text-white font-medium">Add Packaging Specs</p>
              <p className="text-sm text-slate-400">Enter product and carton dimensions and weights</p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}

