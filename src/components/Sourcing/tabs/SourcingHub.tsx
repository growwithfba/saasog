'use client';

import { useMemo, useEffect, useState } from 'react';
import { ShoppingCart, Rocket, TrendingUp, DollarSign, BarChart3 } from 'lucide-react';
import type { SourcingHubData, SupplierQuoteRow } from '../types';
import { getAllCategories } from '@/utils/referralFees';
import { formatCurrency } from '@/utils/formatters';
import { calculateQuoteMetrics, getSupplierAccuracyScore, isInitialReady, getMarginTier, getRoiTier, getProfitPerUnitTier } from './SupplierQuotesTab';
import { calculateOrderReadiness, type OrderReadinessResult } from '@/utils/orderReadiness';

// Circular Gauge Component
interface CircularGaugeProps {
  percent: number;
  status: OrderReadinessResult['status'];
  colorClass: OrderReadinessResult['colorClass'];
  message: string;
  nextActions: string[];
  onClick?: () => void;
}

function CircularGauge({ percent, status, colorClass, message, nextActions, onClick }: CircularGaugeProps) {
  const size = 200; // Diameter in pixels (responsive: scales down on smaller screens)
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  // Get glow color based on status
  const glowColor = percent >= 90 ? 'rgba(16, 185, 129, 0.5)' :
                    percent >= 70 ? 'rgba(234, 179, 8, 0.5)' :
                    percent >= 40 ? 'rgba(245, 158, 11, 0.5)' :
                    'rgba(239, 68, 68, 0.5)';

  return (
    <div 
      className={`flex flex-col items-center ${onClick ? 'cursor-pointer transition-opacity hover:opacity-90' : ''}`}
      onClick={onClick}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          {/* Glow effect using a filter */}
          <defs>
            <filter id={`glow-${percent}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-700/50"
            strokeLinecap="round"
          />
          {/* Progress circle with glow */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={`${colorClass.ring} transition-all duration-500 ease-out`}
            strokeLinecap="round"
            style={{ 
              filter: `drop-shadow(0 0 8px ${glowColor})`,
            }}
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* Rocket icon */}
          <Rocket className={`w-8 h-8 ${colorClass.text} mb-2`} strokeWidth={2} />
          <div className={`text-4xl font-bold ${colorClass.text} mb-1`}>
            {percent}%
          </div>
          <div className={`text-xs font-semibold uppercase tracking-wider ${colorClass.text}`}>
            {status}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Best Supplier Ranking & Launch Readiness Logic
 * 
 * ELIGIBILITY RULES:
 * A supplier is eligible if:
 * - Has computed ROI and Margin (not null/NaN)
 * - Supplier Grade is not "Pending/Ungraded"
 * - Accuracy is at least "Basic/Rough" (basic required fields are complete)
 * 
 * RANKING SCORE:
 * Score = (normalized ROI) * 0.45 + (normalized Margin) * 0.35 + (normalized GradeScore) * 0.20
 * 
 * Where:
 * - normalized ROI: clamp ROI% to [0, 150] then divide by 150
 * - normalized Margin: clamp Margin% to [0, 40] then divide by 40
 * - normalized GradeScore: use existing grading score (0–100) / 100
 * - If ROI or Margin is negative, supplier score = 0
 * 
 * TIE-BREAKERS (in order):
 * 1. Higher Grade
 * 2. Higher Margin
 * 3. Higher ROI
 * 
 * LAUNCH READINESS:
 * - Not Ready: No eligible supplier OR Accuracy is "Incomplete" OR Margin < 0 OR ROI < 0
 * - Almost Ready: Grade is C AND Margin ≥ 20% AND ROI ≥ 75%
 * - Ready: Grade is A or B AND Margin ≥ 28% AND ROI ≥ 90%
 */
interface BestSupplierResult {
  supplier: SupplierQuoteRow;
  roi: number;
  margin: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
}

function getBestSupplier(quotes: SupplierQuoteRow[]): BestSupplierResult | null {
  // Filter eligible suppliers
  const eligible = quotes.filter(quote => {
    // Must have computed ROI and Margin
    if (quote.roiPct === null || quote.marginPct === null || 
        isNaN(quote.roiPct) || isNaN(quote.marginPct)) {
      return false;
    }
    
    // Must have a grade (not Pending)
    if (!quote.supplierGrade || quote.supplierGrade === 'Pending') {
      return false;
    }
    
    // Must have at least Basic accuracy (basic fields complete)
    const accuracyScore = getSupplierAccuracyScore(quote);
    if (accuracyScore.state === 'not_started' || accuracyScore.state === 'missing_basic') {
      return false;
    }
    
    return true;
  });
  
  if (eligible.length === 0) {
    return null;
  }
  
  // Calculate score for each eligible supplier
  const scored = eligible.map(quote => {
    const roi = quote.roiPct!;
    const margin = quote.marginPct!;
    const gradeScore = quote.supplierGradeScore ?? 0;
    
    // If negative, score is 0
    if (roi < 0 || margin < 0) {
      return { quote, score: 0, roi, margin, grade: quote.supplierGrade! };
    }
    
    // Normalize values
    const normalizedRoi = Math.min(Math.max(roi, 0), 150) / 150;
    const normalizedMargin = Math.min(Math.max(margin, 0), 40) / 40;
    const normalizedGrade = gradeScore / 100;
    
    // Calculate weighted score
    const score = (normalizedRoi * 0.45) + (normalizedMargin * 0.35) + (normalizedGrade * 0.20);
    
    return { quote, score, roi, margin, grade: quote.supplierGrade! };
  });
  
  // Sort by score (descending), then by tie-breakers
  scored.sort((a, b) => {
    // Primary: score
    if (Math.abs(a.score - b.score) > 0.0001) {
      return b.score - a.score;
    }
    
    // Tie-breaker 1: Higher Grade (A > B > C > D > F)
    const gradeOrder: Record<string, number> = { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'F': 1 };
    if (gradeOrder[a.grade] !== gradeOrder[b.grade]) {
      return gradeOrder[b.grade] - gradeOrder[a.grade];
    }
    
    // Tie-breaker 2: Higher Margin
    if (Math.abs(a.margin - b.margin) > 0.0001) {
      return b.margin - a.margin;
    }
    
    // Tie-breaker 3: Higher ROI
    return b.roi - a.roi;
  });
  
  const best = scored[0];
  return {
    supplier: best.quote,
    roi: best.roi,
    margin: best.margin,
    grade: best.grade,
    score: best.score,
  };
}


interface SourcingHubProps {
  productId: string;
  productData: any; // Original product data from research
  hubData: SourcingHubData | undefined;
  supplierQuotes: SupplierQuoteRow[];
  onChange: (hubData: SourcingHubData) => void;
  onNavigateToTab?: (tab: 'quotes' | 'placeOrder', section?: string, supplierId?: string) => void;
}

export function SourcingHub({ 
  productId, 
  productData, 
  hubData, 
  supplierQuotes,
  onChange,
  onNavigateToTab
}: SourcingHubProps) {
  const hub = hubData || {
    targetSalesPrice: null,
    categoryOverride: null,
    referralFeePct: null,
  };

  // Get original product values
  const originalPrice = productData?.price || productData?.salesPrice || null;
  const originalCategory = productData?.category || '';
  const productName = productData?.display_title || productData?.title || 'Untitled Product';

  // Use overrides if available, otherwise use original values
  const targetSalesPrice = hub.targetSalesPrice ?? originalPrice;
  const category = hub.categoryOverride || originalCategory || '';
  
  // Note: Referral fee calculation logic is still used in SupplierQuotesTab
  // We keep referralFeePct in hubData for that purpose, but don't display it in the hub UI

  // Calculate metrics for all suppliers
  const quotesWithMetrics = useMemo(() => {
    return supplierQuotes.map(quote => calculateQuoteMetrics(quote, hubData, productData));
  }, [supplierQuotes, hubData, productData]);


  // Get Place Order state from localStorage
  const [placeOrderState, setPlaceOrderState] = useState<any>(null);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`placeOrderDraft_${productId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setPlaceOrderState({
            selectedSupplierId: parsed.selectedSupplierId || null,
            confirmedItems: new Set(parsed.confirmedItems || []),
            requiredConfirmations: new Set(parsed.requiredConfirmations || []),
            overrides: parsed.overrides || {},
            orderQuantity: parsed.orderQuantity || null,
            finalTier: parsed.finalTier || null,
          });
        } catch {
          setPlaceOrderState(null);
        }
      } else {
        setPlaceOrderState(null);
      }
    }
  }, [productId]);

  // Reconstruct checklist items for Place Order (simplified version)
  const placeOrderChecklistItems = useMemo(() => {
    if (!placeOrderState?.selectedSupplierId) return [];
    
    const selectedSupplier = supplierQuotes.find(q => q.id === placeOrderState.selectedSupplierId);
    if (!selectedSupplier) return [];

    // Build a simplified checklist based on Place Order sections
    // This mirrors the structure in PlaceOrderTab
    const items: Array<{ id: string; section: string; required: boolean; finalAgreedValue: string | null }> = [];
    
    // Section A: Supplier & Order Basics
    items.push(
      { id: 'incoterms_agreed', section: 'A', required: true, finalAgreedValue: selectedSupplier.incotermsAgreed || selectedSupplier.incoterms || null },
      { id: 'payment_terms', section: 'A', required: false, finalAgreedValue: selectedSupplier.paymentTerms || null },
      { id: 'lead_time', section: 'A', required: false, finalAgreedValue: selectedSupplier.leadTime || null },
    );

    // Section B: Pricing & Quantities
    const effectiveTier = placeOrderState.finalTier || selectedSupplier.finalCalcTier || 'short';
    let costPerUnit: number | null = null;
    let moq: number | null = null;
    
    if (effectiveTier === 'medium' && selectedSupplier.costPerUnitMediumTerm !== null) {
      costPerUnit = selectedSupplier.costPerUnitMediumTerm;
      moq = selectedSupplier.moqMediumTerm ?? selectedSupplier.moqShortTerm ?? selectedSupplier.moq ?? null;
    } else if (effectiveTier === 'long' && selectedSupplier.costPerUnitLongTerm !== null) {
      costPerUnit = selectedSupplier.costPerUnitLongTerm;
      moq = selectedSupplier.moqLongTerm ?? selectedSupplier.moqShortTerm ?? selectedSupplier.moq ?? null;
    } else {
      const effectiveIncoterms = selectedSupplier.incotermsAgreed || selectedSupplier.incoterms || 'DDP';
      costPerUnit = (effectiveIncoterms === 'DDP' && selectedSupplier.ddpPrice && selectedSupplier.ddpPrice > 0)
        ? selectedSupplier.ddpPrice
        : (selectedSupplier.costPerUnitShortTerm ?? selectedSupplier.exwUnitCost ?? null);
      moq = selectedSupplier.moqShortTerm ?? selectedSupplier.moq ?? null;
    }

    const orderQuantity = placeOrderState.orderQuantity ?? moq;
    
    items.push(
      { id: 'final_moq', section: 'B', required: true, finalAgreedValue: moq?.toString() || null },
      { id: 'order_quantity', section: 'B', required: true, finalAgreedValue: orderQuantity?.toString() || null },
      { id: 'cost_per_unit', section: 'B', required: true, finalAgreedValue: costPerUnit ? formatCurrency(costPerUnit) : null },
    );

    // Section C: Unit Packaging
    const unitDims = (selectedSupplier.singleProductPackageLengthCm && selectedSupplier.singleProductPackageWidthCm && selectedSupplier.singleProductPackageHeightCm)
      ? `${selectedSupplier.singleProductPackageLengthCm}×${selectedSupplier.singleProductPackageWidthCm}×${selectedSupplier.singleProductPackageHeightCm} cm`
      : null;
    
    items.push(
      { id: 'unit_package_dims', section: 'C', required: true, finalAgreedValue: unitDims },
      { id: 'unit_package_weight', section: 'C', required: true, finalAgreedValue: selectedSupplier.singleProductPackageWeightKg ? `${selectedSupplier.singleProductPackageWeightKg} kg` : null },
    );

    // Section D: Carton Information
    const cartonDims = (selectedSupplier.cartonLengthCm && selectedSupplier.cartonWidthCm && selectedSupplier.cartonHeightCm)
      ? `${selectedSupplier.cartonLengthCm}×${selectedSupplier.cartonWidthCm}×${selectedSupplier.cartonHeightCm} cm`
      : null;
    
    items.push(
      { id: 'units_per_carton', section: 'D', required: false, finalAgreedValue: selectedSupplier.unitsPerCarton?.toString() || null },
      { id: 'carton_dims', section: 'D', required: false, finalAgreedValue: cartonDims },
      { id: 'carton_weight', section: 'D', required: false, finalAgreedValue: selectedSupplier.cartonWeightKg ? `${selectedSupplier.cartonWeightKg} kg` : null },
    );

    // Section E: Freight & Compliance
    const effectiveIncoterms = selectedSupplier.incotermsAgreed || selectedSupplier.incoterms || 'DDP';
    const hasAdvancedFreight = (selectedSupplier.freightCostPerUnit ?? selectedSupplier.ddpShippingPerUnit ?? 0) > 0;
    let freightDisplay: string | null = null;
    if (hasAdvancedFreight) {
      freightDisplay = formatCurrency(selectedSupplier.freightCostPerUnit ?? selectedSupplier.ddpShippingPerUnit ?? 0);
    } else if (selectedSupplier.freightDutyCost) {
      freightDisplay = formatCurrency(selectedSupplier.freightDutyCost);
    } else if (effectiveIncoterms === 'DDP' && selectedSupplier.ddpPrice) {
      freightDisplay = 'Included in DDP price';
    }
    
    items.push(
      { id: 'freight_cost', section: 'E', required: false, finalAgreedValue: freightDisplay },
      { id: 'duty_cost', section: 'E', required: false, finalAgreedValue: selectedSupplier.dutyCostPerUnit ? formatCurrency(selectedSupplier.dutyCostPerUnit) : null },
    );

    // Section F: Super Selling Points
    items.push(
      { id: 'ssps_included', section: 'F', required: false, finalAgreedValue: selectedSupplier.sspsDiscussed || (selectedSupplier.ssps && selectedSupplier.ssps.length > 0 ? 'Yes' : null) },
    );

    return items;
  }, [placeOrderState, supplierQuotes, hubData, productData]);

  // Calculate order readiness using the new utility
  const orderReadiness = useMemo(() => {
    const placeOrderStateForCalc = placeOrderState ? {
      selectedSupplierId: placeOrderState.selectedSupplierId,
      confirmedItems: placeOrderState.confirmedItems,
      checklistItems: placeOrderChecklistItems,
    } : undefined;

    return calculateOrderReadiness(supplierQuotes, placeOrderStateForCalc);
  }, [supplierQuotes, placeOrderState, placeOrderChecklistItems]);

  // Calculate Top Supplier Snapshots (Best Margin, Best Profit/Unit, Best ROI)
  const topSupplierSnapshots = useMemo(() => {
    // Filter quotes with valid computable values
    const validQuotes = quotesWithMetrics.filter(q => {
      const hasMargin = q.marginPct !== null && !isNaN(q.marginPct);
      const hasProfit = q.profitPerUnit !== null && !isNaN(q.profitPerUnit);
      const hasRoi = q.roiPct !== null && !isNaN(q.roiPct);
      return hasMargin || hasProfit || hasRoi;
    });

    if (validQuotes.length === 0) {
      return {
        bestMargin: null,
        bestProfit: null,
        bestRoi: null,
      };
    }

    // Find best margin
    const bestMargin = validQuotes.reduce((best, current) => {
      if (!best) return current.marginPct !== null && !isNaN(current.marginPct) ? current : null;
      if (current.marginPct === null || isNaN(current.marginPct)) return best;
      const bestVal = best.marginPct ?? -Infinity;
      const currentVal = current.marginPct ?? -Infinity;
      return currentVal > bestVal ? current : best;
    }, null as SupplierQuoteRow | null);

    // Find best profit per unit
    const bestProfit = validQuotes.reduce((best, current) => {
      if (!best) return current.profitPerUnit !== null && !isNaN(current.profitPerUnit) ? current : null;
      if (current.profitPerUnit === null || isNaN(current.profitPerUnit)) return best;
      const bestVal = best.profitPerUnit ?? -Infinity;
      const currentVal = current.profitPerUnit ?? -Infinity;
      return currentVal > bestVal ? current : best;
    }, null as SupplierQuoteRow | null);

    // Find best ROI
    const bestRoi = validQuotes.reduce((best, current) => {
      if (!best) return current.roiPct !== null && !isNaN(current.roiPct) ? current : null;
      if (current.roiPct === null || isNaN(current.roiPct)) return best;
      const bestVal = best.roiPct ?? -Infinity;
      const currentVal = current.roiPct ?? -Infinity;
      return currentVal > bestVal ? current : best;
    }, null as SupplierQuoteRow | null);

    return {
      bestMargin: bestMargin && bestMargin.marginPct !== null ? {
        quote: bestMargin,
        value: bestMargin.marginPct,
        tier: getMarginTier(bestMargin.marginPct)
      } : null,
      bestProfit: bestProfit && bestProfit.profitPerUnit !== null ? {
        quote: bestProfit,
        value: bestProfit.profitPerUnit,
        tier: getProfitPerUnitTier(bestProfit.profitPerUnit)
      } : null,
      bestRoi: bestRoi && bestRoi.roiPct !== null ? {
        quote: bestRoi,
        value: bestRoi.roiPct,
        tier: getRoiTier(bestRoi.roiPct)
      } : null,
    };
  }, [quotesWithMetrics]);

  const handleTargetSalesPriceChange = (value: number | null) => {
    onChange({
      ...hub,
      targetSalesPrice: value,
    });
  };

  const handleCategoryChange = (category: string) => {
    const newCategory = category || null;
    onChange({
      ...hub,
      categoryOverride: newCategory,
      referralFeePct: null, // Reset manual override when category changes (still used in Supplier Quotes)
    });
  };

  const allCategories = getAllCategories();

  // Navigation callback handler
  const handleReadinessClick = () => {
    if (orderReadiness.navigationTarget) {
      // This will be handled by parent component
      if (onNavigateToTab) {
        onNavigateToTab(orderReadiness.navigationTarget.tab, orderReadiness.navigationTarget.section, orderReadiness.navigationTarget.supplierId);
      }
    }
  };

  return (
    <div className="bg-gradient-to-br from-purple-900/20 via-indigo-900/15 to-slate-800/40 rounded-2xl border-2 border-purple-500/50 shadow-2xl shadow-purple-500/10 p-4 relative overflow-hidden">
      {/* Decorative background elements - toned down */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl"></div>
      
      {/* Header */}
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/50">
            <ShoppingCart className="w-5 h-5 text-white" strokeWidth={2.5} fill="white" />
          </div>
          <div>
            <h3 className="text-3xl font-extrabold bg-gradient-to-r from-purple-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent tracking-tight">
              Sourcing Hub
            </h3>
            <p className="text-slate-300 text-sm mt-1 font-medium">Set assumptions and track order readiness</p>
          </div>
        </div>
      </div>
      
      {/* Compact 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 relative z-10">
        {/* Left Column: Inputs */}
        <div className="flex flex-col gap-2">
          {/* Product Name (read-only) */}
          <div className="px-3 py-2.5 bg-slate-800/40 border border-slate-700/50 rounded-lg">
            <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
              <ShoppingCart className="w-3 h-3" />
              Product
            </div>
            <div className="text-sm font-medium text-white">
              {productName}
            </div>
          </div>

          {/* Target Sales Price */}
          <div className="px-3 py-2.5 bg-slate-800/40 border border-emerald-500/20 rounded-lg">
            <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
              <DollarSign className="w-3 h-3" />
              Target Sales Price
            </div>
            <div className="relative">
              <span className="absolute left-0 top-1/2 -translate-y-1/2 text-emerald-400 font-semibold text-sm z-10">$</span>
              <input
                type="number"
                step="0.01"
                value={targetSalesPrice ?? ''}
                onChange={(e) => handleTargetSalesPriceChange(e.target.value ? parseFloat(e.target.value) : null)}
                onBlur={(e) => {
                  if (e.target.value) {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      e.target.value = val.toFixed(2);
                    }
                  }
                }}
                onFocus={(e) => {
                  if (e.target.value) {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      e.target.value = val.toString();
                    }
                  }
                }}
                placeholder={originalPrice ? formatCurrency(originalPrice) : '0.00'}
                className="w-full pl-5 pr-10 py-0 bg-transparent border-0 text-white placeholder-slate-500 focus:outline-none text-sm font-medium"
              />
              <span className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-xs z-10">USD</span>
            </div>
          </div>

          {/* Product Category */}
          <div className="px-3 py-2.5 bg-slate-800/40 border border-blue-500/20 rounded-lg">
            <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
              <BarChart3 className="w-3 h-3" />
              Product Category
            </div>
            <select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full bg-transparent border-0 text-white focus:outline-none text-sm font-medium cursor-pointer"
            >
              <option value="" className="bg-slate-800">Select category...</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat} className="bg-slate-800">
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Center Column: Order Readiness Circular Gauge */}
        <div className="flex flex-col items-center justify-center">
          <label className="block text-sm font-bold text-slate-300 mb-4 tracking-tight">Order Readiness</label>
          <CircularGauge
            percent={orderReadiness.percent}
            status={orderReadiness.status}
            colorClass={orderReadiness.colorClass}
            message={orderReadiness.message}
            nextActions={orderReadiness.nextActions}
            onClick={handleReadinessClick}
          />
        </div>

        {/* Right Column: Top Supplier Snapshot */}
        <div className="flex flex-col gap-2">
          {/* Best Margin */}
          <div className={`px-3 py-2.5 rounded-lg border ${topSupplierSnapshots.bestMargin ? `${topSupplierSnapshots.bestMargin.tier.bgColor} ${topSupplierSnapshots.bestMargin.tier.borderColor}` : 'bg-slate-800/40 border-slate-700/50'}`}>
            <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3" />
              Best Margin
            </div>
            {topSupplierSnapshots.bestMargin ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white truncate mr-2">
                  {topSupplierSnapshots.bestMargin.quote.displayName || topSupplierSnapshots.bestMargin.quote.supplierName || 'Unnamed'}
                </span>
                <span className={`text-sm font-semibold ${topSupplierSnapshots.bestMargin.tier.textColor} whitespace-nowrap`}>
                  {topSupplierSnapshots.bestMargin.value.toFixed(1)}%
                </span>
              </div>
            ) : (
              <div className="text-sm text-slate-500">—</div>
            )}
          </div>

          {/* Best Profit/Unit */}
          <div className={`px-3 py-2.5 rounded-lg border ${topSupplierSnapshots.bestProfit ? `${topSupplierSnapshots.bestProfit.tier.bgColor} ${topSupplierSnapshots.bestProfit.tier.borderColor}` : 'bg-slate-800/40 border-slate-700/50'}`}>
            <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
              <DollarSign className="w-3 h-3" />
              Best Profit/Unit
            </div>
            {topSupplierSnapshots.bestProfit ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white truncate mr-2">
                  {topSupplierSnapshots.bestProfit.quote.displayName || topSupplierSnapshots.bestProfit.quote.supplierName || 'Unnamed'}
                </span>
                <span className={`text-sm font-semibold ${topSupplierSnapshots.bestProfit.tier.textColor} whitespace-nowrap`}>
                  {topSupplierSnapshots.bestProfit.tier.label}
                </span>
              </div>
            ) : (
              <div className="text-sm text-slate-500">—</div>
            )}
          </div>

          {/* Best ROI */}
          <div className={`px-3 py-2.5 rounded-lg border ${topSupplierSnapshots.bestRoi ? `${topSupplierSnapshots.bestRoi.tier.bgColor} ${topSupplierSnapshots.bestRoi.tier.borderColor}` : 'bg-slate-800/40 border-slate-700/50'}`}>
            <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
              <BarChart3 className="w-3 h-3" />
              Best ROI
            </div>
            {topSupplierSnapshots.bestRoi ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white truncate mr-2">
                  {topSupplierSnapshots.bestRoi.quote.displayName || topSupplierSnapshots.bestRoi.quote.supplierName || 'Unnamed'}
                </span>
                <span className={`text-sm font-semibold ${topSupplierSnapshots.bestRoi.tier.textColor} whitespace-nowrap`}>
                  {topSupplierSnapshots.bestRoi.value.toFixed(1)}%
                </span>
              </div>
            ) : (
              <div className="text-sm text-slate-500">—</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
