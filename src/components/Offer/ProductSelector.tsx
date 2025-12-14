'use client';

import { Package, CheckCircle, Clock, XCircle } from 'lucide-react';
import type { OfferData } from './types';

interface ProductSelectorProps {
  products: any[];
  activeProductId: string | null;
  offerData: Record<string, OfferData>;
  onProductSelect: (productId: string) => void;
}

export function ProductSelector({ products, activeProductId, offerData, onProductSelect }: ProductSelectorProps) {
  const getOfferStatus = (productId: string): 'none' | 'working' | 'completed' => {
    return offerData[productId]?.status || 'none';
  };

  const getStatusBadge = (status: 'none' | 'working' | 'completed') => {
    switch (status) {
      case 'completed':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle className="w-3 h-3 inline mr-1" />
            Completed
          </span>
        );
      case 'working':
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-500/10 text-orange-500 border border-orange-500/20">
            <Clock className="w-3 h-3 inline mr-1" />
            Working
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <XCircle className="w-3 h-3 inline mr-1" />
            No Offer
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white mb-2">Select Product to Build an Offer</h3>
        <p className="text-sm text-slate-400">Choose a vetted product to start building your offer</p>
      </div>

      {/* Dropdown Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Select product to build an offer
        </label>
        <select
          value={activeProductId || ''}
          onChange={(e) => onProductSelect(e.target.value)}
          className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50"
        >
          <option value="">-- Select a product --</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.title || product.asin} ({product.asin})
            </option>
          ))}
        </select>
      </div>

      {/* Product Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product) => {
          const status = getOfferStatus(product.id);
          const isActive = activeProductId === product.id;

          return (
            <div
              key={product.id}
              className={`p-4 rounded-lg border transition-all cursor-pointer ${
                isActive
                  ? 'bg-orange-500/10 border-orange-500/50 ring-2 ring-orange-500/30'
                  : 'bg-slate-700/30 border-slate-700/50 hover:border-slate-600/50'
              }`}
              onClick={() => onProductSelect(product.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-mono text-slate-400">{product.asin}</span>
                </div>
                {getStatusBadge(status)}
              </div>
              <h4 className="text-sm font-medium text-white mb-2 line-clamp-2">
                {product.title || 'Untitled Product'}
              </h4>
              {status === 'none' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onProductSelect(product.id);
                  }}
                  className="w-full mt-2 px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 rounded-lg text-orange-400 text-xs font-medium transition-colors"
                >
                  Build Offer
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

