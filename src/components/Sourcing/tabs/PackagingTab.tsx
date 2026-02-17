'use client';

import { useMemo } from 'react';
import { Box, Ruler } from 'lucide-react';
import type { ProfitCalculatorData } from '../types';

interface PackagingTabProps {
  productId: string;
  data: ProfitCalculatorData | undefined;
  onChange: (data: ProfitCalculatorData) => void;
}

// Helper to parse dimensions and calculate cubic inches/feet
const parseDimensions = (dimensions: string): { length: number; width: number; height: number } | null => {
  if (!dimensions || !dimensions.trim()) return null;
  
  // Try to parse formats like "10x5x3" or "10 x 5 x 3" or "10\" x 5\" x 3\""
  const cleaned = dimensions.replace(/["']/g, '').trim();
  const parts = cleaned.split(/[xX×\s]+/).map(p => parseFloat(p.trim())).filter(n => !isNaN(n));
  
  if (parts.length >= 3) {
    return {
      length: parts[0],
      width: parts[1],
      height: parts[2]
    };
  }
  
  return null;
};

const calculateCubicInches = (dimensions: string): number | null => {
  const parsed = parseDimensions(dimensions);
  if (!parsed) return null;
  return parsed.length * parsed.width * parsed.height;
};

const cubicInchesToCubicFeet = (cubicInches: number): number => {
  return cubicInches / 1728;
};

export function PackagingTab({ productId, data, onChange }: PackagingTabProps) {
  const packagingData = data || {
    productWeightLb: null,
    productDimensionsIn: '',
    cartonWeightLb: null,
    cartonDimensionsIn: '',
    unitsPerCarton: null,
    notes: ''
  } as ProfitCalculatorData;

  const handleFieldChange = (field: keyof ProfitCalculatorData, value: any) => {
    onChange({
      ...packagingData,
      [field]: value
    });
  };

  // Calculate cubic measurements
  const productCubicInches = useMemo(() => {
    return calculateCubicInches(packagingData.productDimensionsIn || '');
  }, [packagingData.productDimensionsIn]);

  const cartonCubicInches = useMemo(() => {
    return calculateCubicInches(packagingData.cartonDimensionsIn || '');
  }, [packagingData.cartonDimensionsIn]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Box className="w-5 h-5 text-blue-400" />
          Product Specifications
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Product Weight (lbs)</label>
            <input
              type="number"
              step="0.01"
              value={packagingData.productWeightLb || ''}
              onChange={(e) => handleFieldChange('productWeightLb', e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1 flex items-center gap-2">
              <Ruler className="w-4 h-4" />
              Product Dimensions (inches)
            </label>
            <input
              type="text"
              value={packagingData.productDimensionsIn || ''}
              onChange={(e) => handleFieldChange('productDimensionsIn', e.target.value)}
              placeholder="e.g., 10 x 5 x 3"
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
            />
            {productCubicInches !== null && (
              <p className="text-xs text-slate-400 mt-1">
                {productCubicInches.toFixed(2)} cubic inches ({cubicInchesToCubicFeet(productCubicInches).toFixed(4)} cubic feet)
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Box className="w-5 h-5 text-purple-400" />
          Carton Specifications
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Carton Weight (lbs)</label>
            <input
              type="number"
              step="0.01"
              value={packagingData.cartonWeightLb || ''}
              onChange={(e) => handleFieldChange('cartonWeightLb', e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1 flex items-center gap-2">
              <Ruler className="w-4 h-4" />
              Carton Dimensions (inches)
            </label>
            <input
              type="text"
              value={packagingData.cartonDimensionsIn || ''}
              onChange={(e) => handleFieldChange('cartonDimensionsIn', e.target.value)}
              placeholder="e.g., 12 x 8 x 6"
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
            />
            {cartonCubicInches !== null && (
              <p className="text-xs text-slate-400 mt-1">
                {cartonCubicInches.toFixed(2)} cubic inches ({cubicInchesToCubicFeet(cartonCubicInches).toFixed(4)} cubic feet)
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Units Per Carton</label>
            <input
              type="number"
              value={packagingData.unitsPerCarton || ''}
              onChange={(e) => handleFieldChange('unitsPerCarton', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="0"
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
            />
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Notes</h3>
        <textarea
          value={packagingData.notes || ''}
          onChange={(e) => handleFieldChange('notes', e.target.value)}
          placeholder="Additional notes about packaging..."
          rows={4}
          className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 resize-none"
        />
      </div>

      {/* Summary Card */}
      {(productCubicInches !== null || cartonCubicInches !== null || packagingData.unitsPerCarton) && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Packaging Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {productCubicInches !== null && (
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-xs text-slate-400 mb-1">Product Volume</div>
                <div className="text-lg font-semibold text-white">
                  {productCubicInches.toFixed(2)} in³
                </div>
                <div className="text-sm text-slate-500">
                  {cubicInchesToCubicFeet(productCubicInches).toFixed(4)} ft³
                </div>
              </div>
            )}
            {cartonCubicInches !== null && (
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-xs text-slate-400 mb-1">Carton Volume</div>
                <div className="text-lg font-semibold text-white">
                  {cartonCubicInches.toFixed(2)} in³
                </div>
                <div className="text-sm text-slate-500">
                  {cubicInchesToCubicFeet(cartonCubicInches).toFixed(4)} ft³
                </div>
              </div>
            )}
            {packagingData.unitsPerCarton && cartonCubicInches !== null && (
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-xs text-slate-400 mb-1">Volume Per Unit</div>
                <div className="text-lg font-semibold text-white">
                  {(cartonCubicInches / packagingData.unitsPerCarton).toFixed(2)} in³
                </div>
                <div className="text-sm text-slate-500">
                  {cubicInchesToCubicFeet(cartonCubicInches / packagingData.unitsPerCarton).toFixed(4)} ft³
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

