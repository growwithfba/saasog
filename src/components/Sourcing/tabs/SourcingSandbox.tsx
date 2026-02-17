'use client';

import { useMemo, useState } from 'react';
import { Calculator, ExternalLink, DollarSign, Package, TrendingUp } from 'lucide-react';
import { getAllCategories, getReferralFeePct } from '@/utils/referralFees';
import { formatCurrency } from '@/utils/formatters';
import { getRoiTier, getMarginTier } from './SupplierQuotesTab';

interface SandboxState {
  // Pricing / Terms
  costPerUnit: number | null;
  moq: number | null;
  incoterms: string;
  estimatedFreightDuty: number | null; // Used for both DDP Shipping Price and Estimated Freight/Duty
  
  // Single Unit Package
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightKg: number | null;
  
  // FBA Fees
  fbaFee: number | null;
  
  // Target Sales Price + Product Category
  targetSalesPrice: number | null;
  productCategory: string;
}

// Currency input state for formatting
interface CurrencyInputState {
  isFocused: boolean;
  displayValue: string;
}

interface SandboxKPIs {
  roi: number | null;
  margin: number | null;
  profitPerUnit: number | null;
  totalOrderInvestment: number | null;
  totalGrossProfit: number | null;
}

const DEFAULT_STATE: SandboxState = {
  costPerUnit: null,
  moq: null,
  incoterms: 'DDP',
  estimatedFreightDuty: null,
  lengthCm: null,
  widthCm: null,
  heightCm: null,
  weightKg: null,
  fbaFee: null,
  targetSalesPrice: null,
  productCategory: '',
};

// Get Total Order Investment tier (local version, matching SupplierQuotesTab logic)
type TotalOrderInvestmentTier = {
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
};

const getTotalOrderInvestmentTier = (value: number | null | undefined): TotalOrderInvestmentTier => {
  if (value === null || value === undefined || isNaN(value)) {
    return {
      label: '—',
      textColor: 'text-slate-400',
      bgColor: 'bg-slate-800/50',
      borderColor: 'border-slate-700/50',
    };
  }

  if (value < 4000) {
    // Green
    return {
      label: formatCurrency(value),
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-900/30',
      borderColor: 'border-emerald-600/50',
    };
  } else if (value < 7000) {
    // Yellow
    return {
      label: formatCurrency(value),
      textColor: 'text-yellow-400',
      bgColor: 'bg-yellow-900/30',
      borderColor: 'border-yellow-600/50',
    };
  } else {
    // Red
    return {
      label: formatCurrency(value),
      textColor: 'text-red-400',
      bgColor: 'bg-red-900/30',
      borderColor: 'border-red-600/50',
    };
  }
};

function calculateSandboxKPIs(state: SandboxState): SandboxKPIs {
  const {
    costPerUnit,
    moq,
    incoterms,
    estimatedFreightDuty,
    fbaFee,
    targetSalesPrice,
    productCategory,
  } = state;

  // Validate required inputs
  if (
    costPerUnit === null ||
    moq === null ||
    targetSalesPrice === null ||
    targetSalesPrice <= 0 ||
    costPerUnit <= 0 ||
    moq <= 0
  ) {
    return {
      roi: null,
      margin: null,
      profitPerUnit: null,
      totalOrderInvestment: null,
      totalGrossProfit: null,
    };
  }

  // Calculate shipping cost (works for DDP, FOB, EXW)
  const shippingCostPerUnit = estimatedFreightDuty || 0;

  // Calculate referral fee
  const referralFeePct = getReferralFeePct(productCategory);
  const referralFee = targetSalesPrice * referralFeePct;

  // Calculate FBA fee
  const fbaFeeValue = fbaFee || 0;

  // Calculate profit per unit
  const profitPerUnit = targetSalesPrice - costPerUnit - shippingCostPerUnit - fbaFeeValue - referralFee;

  // Calculate landed unit cost (simplified - just cost + shipping for sandbox)
  const landedUnitCost = costPerUnit + shippingCostPerUnit;

  // Calculate ROI
  const roi = landedUnitCost > 0 ? (profitPerUnit / landedUnitCost) * 100 : null;

  // Calculate Margin
  const margin = targetSalesPrice > 0 ? (profitPerUnit / targetSalesPrice) * 100 : null;

  // Calculate totals
  const totalOrderInvestment = landedUnitCost * moq;
  const totalGrossProfit = profitPerUnit * moq;

  return {
    roi,
    margin,
    profitPerUnit,
    totalOrderInvestment,
    totalGrossProfit,
  };
}

export function SourcingSandbox() {
  const [state, setState] = useState<SandboxState>(DEFAULT_STATE);
  const [currencyInputStates, setCurrencyInputStates] = useState<Record<string, CurrencyInputState>>({});

  const kpis = useMemo(() => calculateSandboxKPIs(state), [state]);
  const roiTier = useMemo(() => getRoiTier(kpis.roi), [kpis.roi]);
  const marginTier = useMemo(() => getMarginTier(kpis.margin), [kpis.margin]);
  const investmentTier = useMemo(() => getTotalOrderInvestmentTier(kpis.totalOrderInvestment), [kpis.totalOrderInvestment]);

  const allCategories = getAllCategories();
  const referralFeePct = getReferralFeePct(state.productCategory);
  const referralFeeDisplay = state.productCategory
    ? `${(referralFeePct * 100).toFixed(1)}% — ${state.productCategory}`
    : '—';

  const updateField = <K extends keyof SandboxState>(field: K, value: SandboxState[K]) => {
    setState(prev => ({ ...prev, [field]: value }));
  };

  const handleNumberInput = (field: keyof SandboxState, value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    if (numValue === null || (!isNaN(numValue) && numValue >= 0)) {
      updateField(field, numValue);
    }
  };

  // Currency input handlers
  const handleCurrencyFocus = (field: string, value: number | null | undefined) => {
    setCurrencyInputStates(prev => ({
      ...prev,
      [field]: {
        isFocused: true,
        displayValue: value !== null && value !== undefined && !isNaN(value) ? value.toString() : '',
      },
    }));
  };

  const handleCurrencyBlur = (field: string, value: number | null | undefined) => {
    setCurrencyInputStates(prev => ({
      ...prev,
      [field]: {
        isFocused: false,
        displayValue: value !== null && value !== undefined && !isNaN(value) ? formatCurrency(value) : '',
      },
    }));
  };

  const handleCurrencyChange = (field: keyof SandboxState, rawValue: string) => {
    // Strip non-numeric characters except decimal point
    const numericValue = rawValue.replace(/[^0-9.]/g, '');
    setCurrencyInputStates(prev => ({
      ...prev,
      [field]: {
        isFocused: true,
        displayValue: numericValue,
      },
    }));
    // Update the actual value
    const val = numericValue ? parseFloat(numericValue) : null;
    if (val === null || (!isNaN(val) && val >= 0)) {
      updateField(field, val);
    }
  };

  const getCurrencyDisplayValue = (field: string, value: number | null | undefined): string => {
    const state = currencyInputStates[field];
    if (state?.isFocused) {
      return state.displayValue;
    }
    if (value !== null && value !== undefined && !isNaN(value)) {
      return formatCurrency(value);
    }
    return '';
  };

  const isDDP = state.incoterms === 'DDP';
  const shippingFieldLabel = isDDP ? 'DDP Shipping Price (USD)' : 'Estimated Freight/Duty (USD)';

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Sourcing Sandbox</h2>
        <p className="text-sm text-slate-400">
          Sourcing Sandbox is for quick what-if calculations. Changes aren't saved - so play around in here and have some fun.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Inputs */}
        <div className="space-y-6">
          {/* Target Sales Price + Product Category */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Target Sales Price + Product Category
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Target Sales Price (USD)
                </label>
                <div className="relative">
                  {state.targetSalesPrice !== null && !isNaN(state.targetSalesPrice) && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-semibold text-sm z-10">$</span>
                  )}
                  <input
                    type="text"
                    value={getCurrencyDisplayValue('targetSalesPrice', state.targetSalesPrice)}
                    onChange={(e) => handleCurrencyChange('targetSalesPrice', e.target.value)}
                    onFocus={() => handleCurrencyFocus('targetSalesPrice', state.targetSalesPrice)}
                    onBlur={() => handleCurrencyBlur('targetSalesPrice', state.targetSalesPrice)}
                    placeholder="0.00"
                    className={`w-full ${state.targetSalesPrice !== null && !isNaN(state.targetSalesPrice) ? 'pl-7' : 'pl-3'} pr-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Product Category
                </label>
                <select
                  value={state.productCategory}
                  onChange={(e) => updateField('productCategory', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500/50"
                >
                  <option value="">Select category...</option>
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Pricing / Terms */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              Pricing / Terms
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Cost/Unit (USD)
                </label>
                <div className="relative">
                  {state.costPerUnit !== null && !isNaN(state.costPerUnit) && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-semibold text-sm z-10">$</span>
                  )}
                  <input
                    type="text"
                    value={getCurrencyDisplayValue('costPerUnit', state.costPerUnit)}
                    onChange={(e) => handleCurrencyChange('costPerUnit', e.target.value)}
                    onFocus={() => handleCurrencyFocus('costPerUnit', state.costPerUnit)}
                    onBlur={() => handleCurrencyBlur('costPerUnit', state.costPerUnit)}
                    placeholder="0.00"
                    className={`w-full ${state.costPerUnit !== null && !isNaN(state.costPerUnit) ? 'pl-7' : 'pl-3'} pr-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  MOQ
                </label>
                <input
                  type="number"
                  step="1"
                  value={state.moq ?? ''}
                  onChange={(e) => handleNumberInput('moq', e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Incoterms
                </label>
                <select
                  value={state.incoterms}
                  onChange={(e) => updateField('incoterms', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500/50"
                >
                  <option value="DDP">DDP</option>
                  <option value="FOB">FOB</option>
                  <option value="EXW">EXW</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  {shippingFieldLabel}
                </label>
                <div className="relative">
                  {state.estimatedFreightDuty !== null && !isNaN(state.estimatedFreightDuty) && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-semibold text-sm z-10">$</span>
                  )}
                  <input
                    type="text"
                    value={getCurrencyDisplayValue('estimatedFreightDuty', state.estimatedFreightDuty)}
                    onChange={(e) => handleCurrencyChange('estimatedFreightDuty', e.target.value)}
                    onFocus={() => handleCurrencyFocus('estimatedFreightDuty', state.estimatedFreightDuty)}
                    onBlur={() => handleCurrencyBlur('estimatedFreightDuty', state.estimatedFreightDuty)}
                    placeholder="0.00"
                    className={`w-full ${state.estimatedFreightDuty !== null && !isNaN(state.estimatedFreightDuty) ? 'pl-7' : 'pl-3'} pr-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Single Unit Package */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-400" />
              Single Unit Package
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Length (cm)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={state.lengthCm ?? ''}
                  onChange={(e) => handleNumberInput('lengthCm', e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Width (cm)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={state.widthCm ?? ''}
                  onChange={(e) => handleNumberInput('widthCm', e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Height (cm)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={state.heightCm ?? ''}
                  onChange={(e) => handleNumberInput('heightCm', e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={state.weightKg ?? ''}
                  onChange={(e) => handleNumberInput('weightKg', e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                />
              </div>
            </div>
          </div>

          {/* FBA Fees */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-purple-400" />
              FBA Fees
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1 flex items-center gap-2">
                  FBA Fee
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
                <div className="relative">
                  {state.fbaFee !== null && !isNaN(state.fbaFee) && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-semibold text-sm z-10">$</span>
                  )}
                  <input
                    type="text"
                    value={getCurrencyDisplayValue('fbaFee', state.fbaFee)}
                    onChange={(e) => handleCurrencyChange('fbaFee', e.target.value)}
                    onFocus={() => handleCurrencyFocus('fbaFee', state.fbaFee)}
                    onBlur={() => handleCurrencyBlur('fbaFee', state.fbaFee)}
                    placeholder="0.00"
                    className={`w-full ${state.fbaFee !== null && !isNaN(state.fbaFee) ? 'pl-7' : 'pl-3'} pr-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Referral Fee
                </label>
                <div className="px-3 py-2 bg-slate-900/30 border border-slate-700/30 rounded-lg text-white text-sm">
                  {referralFeeDisplay}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: KPI Output Cards */}
        <div className="space-y-6">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Key Performance Indicators</h3>
            <div className="grid grid-cols-1 gap-4">
              {/* ROI */}
              <div className={`rounded-lg p-4 border ${roiTier.bgColor} ${roiTier.borderColor}`}>
                <div className="text-sm font-medium text-slate-400 mb-1">ROI</div>
                <div className={`text-2xl font-bold ${roiTier.textColor}`}>
                  {roiTier.label}
                </div>
              </div>

              {/* Margin */}
              <div className={`rounded-lg p-4 border ${marginTier.bgColor} ${marginTier.borderColor}`}>
                <div className="text-sm font-medium text-slate-400 mb-1">Margin</div>
                <div className={`text-2xl font-bold ${marginTier.textColor}`}>
                  {marginTier.label}
                </div>
              </div>

              {/* Profit/Unit */}
              <div className="bg-slate-900/50 rounded-lg p-4 border border-emerald-500/30">
                <div className="text-sm font-medium text-slate-400 mb-1">Profit/Unit</div>
                <div className="text-2xl font-bold text-emerald-400">
                  {kpis.profitPerUnit !== null && !isNaN(kpis.profitPerUnit)
                    ? formatCurrency(kpis.profitPerUnit)
                    : '—'}
                </div>
              </div>

              {/* Total Order Investment */}
              <div className={`rounded-lg p-4 border ${investmentTier.bgColor} ${investmentTier.borderColor}`}>
                <div className="text-sm font-medium text-slate-400 mb-1">Total Order Investment</div>
                <div className={`text-2xl font-bold ${investmentTier.textColor}`}>
                  {investmentTier.label}
                </div>
              </div>

              {/* Total Gross Profit */}
              <div className="bg-slate-900/50 rounded-lg p-4 border border-emerald-500/30">
                <div className="text-sm font-medium text-slate-400 mb-1">Total Gross Profit</div>
                <div className="text-2xl font-bold text-emerald-400">
                  {kpis.totalGrossProfit !== null && !isNaN(kpis.totalGrossProfit)
                    ? formatCurrency(kpis.totalGrossProfit)
                    : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
