'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { 
  Calculator, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle, 
  TrendingUp,
  BarChart3,
  Trophy,
  AlertTriangle,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  X,
  Check,
  Lock
} from 'lucide-react';
import type { SupplierQuoteRow, SourcingHubData } from '../types';
import { 
  calculateQuoteMetrics, 
  getAccuracyState, 
  getRoiTier, 
  getMarginTier,
  type AccuracyState
} from './SupplierQuotesTab';
import { formatCurrency } from '@/utils/formatters';
import { getReferralFeePct } from '@/utils/referralFees';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ProfitCalculatorTabProps {
  productId: string;
  productData: any;
  supplierQuotes: SupplierQuoteRow[];
  hubData?: SourcingHubData;
  onChange?: (supplierQuotes: SupplierQuoteRow[]) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  enableMissingInfoFilter?: boolean; // When true, enables "Missing Info Only" filter
}

type CompareMetric = 'profitPerUnit' | 'margin' | 'roi' | 'totalGrossProfit' | 'totalInvestment';
type ViewMode = 'matrix' | 'ranked';

// Helper to calculate metrics (always uses each supplier's selected tier)
// CRITICAL: Always preserves all original quote fields, only overlays computed metrics
const calculateQuoteMetricsWithTier = (
  quote: SupplierQuoteRow,
  hubData?: SourcingHubData,
  productData?: any
): SupplierQuoteRow => {
  // CRITICAL: Create a proper copy of the original quote to preserve ALL fields
  // Using object spread with explicit field preservation to ensure nothing is lost
  const baseQuote: SupplierQuoteRow = { ...quote };
  
  // Always use each supplier's selected tier (finalCalcTier or default to 'short')
  const selectedTier = quote.finalCalcTier || 'short';
  const quoteWithTier = { ...baseQuote, finalCalcTier: selectedTier as 'short' | 'medium' | 'long' };
  
  // Calculate metrics using the supplier's selected tier
  // calculateQuoteMetrics returns { ...quote, ...computedMetrics }
  // We need to preserve ALL original fields from baseQuote, then overlay ONLY computed metrics
  const resultWithMetrics = calculateQuoteMetrics(quoteWithTier, hubData, productData);
  
  // DEV: Debug logging to see what's in baseQuote and resultWithMetrics
  if (process.env.NODE_ENV === 'development') {
    console.log('[calculateQuoteMetricsWithTier] baseQuote has costPerUnitShortTerm:', baseQuote.costPerUnitShortTerm);
    console.log('[calculateQuoteMetricsWithTier] baseQuote has fbaFeePerUnit:', baseQuote.fbaFeePerUnit);
    console.log('[calculateQuoteMetricsWithTier] baseQuote has moqShortTerm:', baseQuote.moqShortTerm);
    console.log('[calculateQuoteMetricsWithTier] resultWithMetrics has costPerUnitShortTerm:', resultWithMetrics.costPerUnitShortTerm);
    console.log('[calculateQuoteMetricsWithTier] resultWithMetrics has fbaFeePerUnit:', resultWithMetrics.fbaFeePerUnit);
    console.log('[calculateQuoteMetricsWithTier] resultWithMetrics has moqShortTerm:', resultWithMetrics.moqShortTerm);
  }
  
  // CRITICAL: The issue is that resultWithMetrics contains { ...quoteWithTier, ...metrics }
  // But we want to preserve baseQuote (original quote) and only add computed metrics
  // So we extract ONLY the computed fields from resultWithMetrics, not the quote fields
  const computedOnly = {
    referralFee: resultWithMetrics.referralFee,
    totalFbaFeesPerUnit: resultWithMetrics.totalFbaFeesPerUnit,
    landedUnitCost: resultWithMetrics.landedUnitCost,
    profitPerUnit: resultWithMetrics.profitPerUnit,
    roiPct: resultWithMetrics.roiPct,
    marginPct: resultWithMetrics.marginPct,
    totalInvestment: resultWithMetrics.totalInvestment,
    grossProfit: resultWithMetrics.grossProfit,
    cbmPerCarton: resultWithMetrics.cbmPerCarton,
    totalCbm: resultWithMetrics.totalCbm,
    supplierGrade: resultWithMetrics.supplierGrade,
    supplierGradeScore: resultWithMetrics.supplierGradeScore,
  };
  
  // Return: ALL original fields from baseQuote, then overlay ONLY computed metrics
  // This ensures costPerUnitShortTerm, fbaFeePerUnit, moqShortTerm, etc. are preserved
  const finalResult = {
    ...baseQuote,  // ALL original quote fields preserved
    ...computedOnly,  // Only computed metrics overlaid
  };
  
  // DEV: Debug logging to verify final result
  if (process.env.NODE_ENV === 'development') {
    console.log('[calculateQuoteMetricsWithTier] finalResult has costPerUnitShortTerm:', finalResult.costPerUnitShortTerm);
    console.log('[calculateQuoteMetricsWithTier] finalResult has fbaFeePerUnit:', finalResult.fbaFeePerUnit);
    console.log('[calculateQuoteMetricsWithTier] finalResult has moqShortTerm:', finalResult.moqShortTerm);
  }
  
  return finalResult;
};

// Get tier display name
const getTierDisplayName = (tier: 'short' | 'medium' | 'long' | undefined): string => {
  if (!tier) return 'Short';
  const tierMap: Record<string, string> = {
    'short': 'Short',
    'medium': 'Medium',
    'long': 'Long'
  };
  return tierMap[tier] || 'Short';
};

// Helper to sanitize numeric values
// IMPORTANT: Returns null only for truly missing values, NOT for legitimate 0
const toNumberOrNull = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    // 0 is a valid number, only NaN is invalid
    return isNaN(value) ? null : value;
  }
  const num = parseFloat(String(value));
  // 0 is valid, only NaN is invalid
  return isNaN(num) ? null : num;
};

// Check if a value is missing
const isMissing = (value: any): boolean => {
  return value === null || value === undefined || (typeof value === 'number' && isNaN(value)) || value === '';
};

// Get cell styling for missing values (two-level: absolute + relative)
const getMissingCellStyle = (isMissing: boolean, hasRelativeData: boolean): string => {
  if (!isMissing) return '';
  if (hasRelativeData) {
    // Attention missing: at least one supplier has data, this one is missing
    return 'bg-red-950/30 border border-dashed border-red-700/50 text-red-300';
  }
  // Neutral missing: all suppliers are missing this field
  return 'bg-slate-800/30 border border-dashed border-slate-700/50 text-slate-500';
};

export function ProfitCalculatorTab({ 
  productId, 
  productData, 
  supplierQuotes,
  hubData,
  onChange,
  onDirtyChange,
  enableMissingInfoFilter
}: ProfitCalculatorTabProps) {
  // DEV: Log incoming props
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ProfitCalculatorTab] Component props received:', {
        supplierQuotesCount: supplierQuotes?.length || 0,
        supplierQuotes: supplierQuotes,
        hubData: hubData,
        productId: productId,
      });
      if (supplierQuotes && supplierQuotes.length > 0) {
        console.log('[ProfitCalculatorTab] First supplier quote keys:', Object.keys(supplierQuotes[0]));
      }
    }
  }, [supplierQuotes, hubData, productId]);

  const [viewMode, setViewMode] = useState<ViewMode>('matrix');
  const [compareMetric, setCompareMetric] = useState<CompareMetric>('profitPerUnit');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [hideIncomplete, setHideIncomplete] = useState(false);
  const [hidePending, setHidePending] = useState(false);
  const [showOnlySampled, setShowOnlySampled] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  
  // Matrix-specific state
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [hiddenSuppliers, setHiddenSuppliers] = useState<Set<string>>(new Set());
  const [supplierOrder, setSupplierOrder] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [editingCell, setEditingCell] = useState<{ quoteId: string; rowKey: string } | null>(null);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const matrixRef = useRef<HTMLDivElement>(null);
  
  // Initialize supplier order from quotes
  useEffect(() => {
    if (supplierOrder.length === 0 && supplierQuotes.length > 0) {
      setSupplierOrder(supplierQuotes.map(q => q.id));
    } else {
      // Sync order with new quotes (add new ones at end)
      const currentIds = new Set(supplierOrder);
      const newQuotes = supplierQuotes.filter(q => !currentIds.has(q.id));
      if (newQuotes.length > 0) {
        setSupplierOrder(prev => [...prev, ...newQuotes.map(q => q.id)]);
      }
    }
  }, [supplierQuotes]);

  // Handle enableMissingInfoFilter prop - enable filter and scroll to matrix
  useEffect(() => {
    if (enableMissingInfoFilter) {
      setShowMissingOnly(true);
      // Ensure we're in matrix view
      setViewMode('matrix');
      // Scroll to matrix section after a short delay to allow render
      setTimeout(() => {
        if (matrixRef.current) {
          matrixRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
    }
  }, [enableMissingInfoFilter]);
  
  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Handle drag end for column reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = supplierOrder.indexOf(active.id as string);
      const newIndex = supplierOrder.indexOf(over.id as string);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(supplierOrder, oldIndex, newIndex);
        setSupplierOrder(newOrder);
      }
    }
  };
  
  // Track dirty state
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  
  // Unsaved changes warning
  useEffect(() => {
    if (!isDirty) return;
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Update quote handler (same as Supplier Quotes uses)
  const handleUpdateQuote = (quoteId: string, updates: Partial<SupplierQuoteRow>) => {
    if (!onChange) return;
    const updated = supplierQuotes.map(q => q.id === quoteId ? { ...q, ...updates } : q);
    onChange(updated);
    setIsDirty(true);
  };

  // Data mapping helpers for tier-based fields
  const getQuoteFieldValue = (
    quote: SupplierQuoteRow,
    fieldKey: MatrixRowKey,
    tierUsed: 'short' | 'medium' | 'long'
  ): any => {
    switch (fieldKey) {
      case 'moq':
        if (tierUsed === 'medium') return quote.moqMediumTerm ?? null;
        if (tierUsed === 'long') return quote.moqLongTerm ?? null;
        return quote.moqShortTerm ?? quote.moq ?? null;
      case 'costPerUnit':
        if (tierUsed === 'medium') return quote.costPerUnitMediumTerm ?? null;
        if (tierUsed === 'long') return quote.costPerUnitLongTerm ?? null;
        const effectiveIncoterms = quote.incotermsAgreed || quote.incoterms || 'DDP';
        if (effectiveIncoterms === 'DDP' && quote.ddpPrice && quote.ddpPrice > 0) {
          return quote.ddpPrice;
        }
        return quote.costPerUnitShortTerm ?? quote.exwUnitCost ?? null;
      default:
        // For non-tier fields, use getMatrixCellValue
        const cell = getMatrixCellValue(quote, fieldKey, tierUsed);
        return cell.value;
    }
  };

  const setQuoteFieldValue = (
    quoteId: string,
    fieldKey: MatrixRowKey,
    tierUsed: 'short' | 'medium' | 'long',
    value: any
  ) => {
    handleCellUpdate(quoteId, fieldKey, value, tierUsed);
  };

  // Calculate metrics for all quotes with tier forcing
  const quotesWithMetrics = useMemo(() => {
    // DEV: Log raw input for ALL suppliers
    if (process.env.NODE_ENV === 'development' && supplierQuotes.length > 0) {
      console.log('[ProfitCalculatorTab] BEFORE - Raw supplierQuotes:', supplierQuotes.length, 'suppliers');
      supplierQuotes.forEach((quote, idx) => {
        console.log(`[ProfitCalculatorTab] BEFORE - Supplier ${idx + 1} (${quote.displayName || quote.supplierName || 'Unnamed'}):`, {
          id: quote.id,
          supplierName: quote.supplierName,
          displayName: quote.displayName,
          leadTime: quote.leadTime,
          supplierGrade: quote.supplierGrade,
          unitsPerCarton: quote.unitsPerCarton,
          cartonWeightKg: quote.cartonWeightKg,
          singleProductPackageLengthCm: quote.singleProductPackageLengthCm,
          singleProductPackageWidthCm: quote.singleProductPackageWidthCm,
          singleProductPackageHeightCm: quote.singleProductPackageHeightCm,
          singleProductPackageWeightKg: quote.singleProductPackageWeightKg,
          freightCostPerUnit: quote.freightCostPerUnit,
          dutyCostPerUnit: quote.dutyCostPerUnit,
          tariffCostPerUnit: quote.tariffCostPerUnit,
          incotermsAgreed: quote.incotermsAgreed,
          costPerUnitShortTerm: quote.costPerUnitShortTerm,
          moqShortTerm: quote.moqShortTerm,
          fbaFeePerUnit: quote.fbaFeePerUnit,
        });
      });
    }
    
    const computed = supplierQuotes.map(quote => {
      const result = calculateQuoteMetricsWithTier(quote, hubData, productData);
      // DEV: Log immediately after calculation to verify
      if (process.env.NODE_ENV === 'development') {
        console.log('[ProfitCalculatorTab] Immediately after calculateQuoteMetricsWithTier:', {
          costPerUnitShortTerm: result.costPerUnitShortTerm,
          fbaFeePerUnit: result.fbaFeePerUnit,
          moqShortTerm: result.moqShortTerm,
          hasAllKeys: Object.keys(result).includes('costPerUnitShortTerm') && Object.keys(result).includes('fbaFeePerUnit') && Object.keys(result).includes('moqShortTerm'),
        });
      }
      return result;
    });
    
    // DEV: Verification logging for ALL suppliers - log the FULL object, not just selected fields
    if (process.env.NODE_ENV === 'development' && computed.length > 0) {
      console.log('[ProfitCalculatorTab] AFTER - Computed quotesWithMetrics:', computed.length, 'suppliers');
      computed.forEach((quote, idx) => {
        // Log the FULL quote object to see all fields
        console.log(`[ProfitCalculatorTab] AFTER - Supplier ${idx + 1} (${quote.displayName || quote.supplierName || 'Unnamed'}):`, quote);
        // Also log specific fields we care about
        console.log(`[ProfitCalculatorTab] AFTER - Supplier ${idx + 1} specific fields:`, {
          costPerUnitShortTerm: quote.costPerUnitShortTerm,
          fbaFeePerUnit: quote.fbaFeePerUnit,
          moqShortTerm: quote.moqShortTerm,
        });
      });
    }
    
    return computed;
  }, [supplierQuotes, hubData, productData]);

  // Filter suppliers
  const filteredQuotes = useMemo(() => {
    let filtered = quotesWithMetrics;
    
    if (hideIncomplete) {
      filtered = filtered.filter(q => {
        const accuracy = getAccuracyState(q);
        return accuracy.label !== 'Incomplete';
      });
    }
    
    if (hidePending) {
      filtered = filtered.filter(q => q.supplierGrade !== 'Pending');
    }
    
    if (showOnlySampled) {
      filtered = filtered.filter(q => {
        const sampled = q.sampleOrdered;
        return sampled === true || sampled === 'Yes';
      });
    }
    
    // Apply supplier order
    if (supplierOrder.length > 0) {
      filtered = [...filtered].sort((a, b) => {
        const aIdx = supplierOrder.indexOf(a.id);
        const bIdx = supplierOrder.indexOf(b.id);
        if (aIdx === -1 && bIdx === -1) return 0;
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      });
    }
    
    return filtered;
  }, [quotesWithMetrics, hideIncomplete, hidePending, showOnlySampled, supplierOrder]);
  
  // Get visible suppliers (for matrix display - excludes hidden)
  const visibleQuotes = useMemo(() => {
    return filteredQuotes.filter(q => !hiddenSuppliers.has(q.id));
  }, [filteredQuotes, hiddenSuppliers]);
  
  // Get hidden suppliers list
  const hiddenQuotesList = useMemo(() => {
    return supplierQuotes.filter(q => hiddenSuppliers.has(q.id));
  }, [supplierQuotes, hiddenSuppliers]);

  // Sort quotes
  const sortedQuotes = useMemo(() => {
    if (!sortConfig) return filteredQuotes;
    
    const sorted = [...filteredQuotes].sort((a, b) => {
      let aVal: any = a[sortConfig.key as keyof SupplierQuoteRow];
      let bVal: any = b[sortConfig.key as keyof SupplierQuoteRow];
      
      // Handle null/undefined
      if (isMissing(aVal)) return 1;
      if (isMissing(bVal)) return -1;
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      return sortConfig.direction === 'asc' 
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    
    return sorted;
  }, [filteredQuotes, sortConfig]);

  // Determine which suppliers have data for each column (for relative highlighting)
  const columnDataPresence = useMemo(() => {
    const presence: Record<string, number> = {};
    filteredQuotes.forEach(quote => {
      ['moq', 'costPerUnit', 'profitPerUnit', 'marginPct', 'roiPct', 'totalInvestment', 'grossProfit', 'leadTime'].forEach(key => {
        let value: any;
        if (key === 'moq') {
          const tier = quote.finalCalcTier || 'short';
          value = tier === 'medium' ? quote.moqMediumTerm : tier === 'long' ? quote.moqLongTerm : (quote.moqShortTerm ?? quote.moq);
        } else if (key === 'costPerUnit') {
          const tier = quote.finalCalcTier || 'short';
          value = tier === 'medium' ? quote.costPerUnitMediumTerm : tier === 'long' ? quote.costPerUnitLongTerm : (quote.costPerUnitShortTerm ?? quote.exwUnitCost);
        } else {
          value = quote[key as keyof SupplierQuoteRow];
        }
        if (!isMissing(value)) {
          presence[key] = (presence[key] || 0) + 1;
        }
      });
    });
    return presence;
  }, [filteredQuotes]);

  // Toggle row expansion
  const toggleRow = (quoteId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(quoteId)) {
      newExpanded.delete(quoteId);
    } else {
      newExpanded.add(quoteId);
    }
    setExpandedRows(newExpanded);
  };

  // Handle column sort
  const handleSort = (key: string) => {
    if (sortConfig?.key === key) {
      if (sortConfig.direction === 'desc') {
        setSortConfig(null);
      } else {
        setSortConfig({ key, direction: 'desc' });
      }
    } else {
      setSortConfig({ key, direction: 'asc' });
    }
  };

  // Get value for compare metric
  const getCompareValue = (quote: SupplierQuoteRow): number | null => {
    switch (compareMetric) {
      case 'profitPerUnit':
        return quote.profitPerUnit ?? null;
      case 'margin':
        return quote.marginPct ?? null;
      case 'roi':
        return quote.roiPct ?? null;
      case 'totalGrossProfit':
        return quote.grossProfit ?? null;
      case 'totalInvestment':
        return quote.totalInvestment ?? null;
      default:
        return null;
    }
  };

  // Prepare chart data
  const chartData = useMemo(() => {
    return sortedQuotes.map(quote => {
      const value = getCompareValue(quote);
      const accuracy = getAccuracyState(quote);
      const isMissing = value === null || value === undefined || (typeof value === 'number' && isNaN(value));
      
      return {
        name: quote.displayName || quote.supplierName || 'Unnamed Supplier',
        value: isMissing ? 0 : value,
        isMissing,
        grade: quote.supplierGrade || 'Pending',
        accuracy: accuracy.label,
        fullQuote: quote
      };
    });
  }, [sortedQuotes, compareMetric]);

  // Get tier used for display
  const getTierUsed = (quote: SupplierQuoteRow): string => {
    const tier = quote.finalCalcTier || 'short';
    return getTierDisplayName(tier);
  };

  // Get MOQ for tier
  const getMoqForTier = (quote: SupplierQuoteRow): number | null => {
    const tier = quote.finalCalcTier || 'short';
    if (tier === 'medium') return quote.moqMediumTerm ?? null;
    if (tier === 'long') return quote.moqLongTerm ?? null;
    return quote.moqShortTerm ?? quote.moq ?? null;
  };

  // Get Cost/Unit for tier
  const getCostPerUnitForTier = (quote: SupplierQuoteRow): number | null => {
    const tier = quote.finalCalcTier || 'short';
    if (tier === 'medium') return quote.costPerUnitMediumTerm ?? null;
    if (tier === 'long') return quote.costPerUnitLongTerm ?? null;
    const effectiveIncoterms = quote.incotermsAgreed || quote.incoterms || 'DDP';
    if (effectiveIncoterms === 'DDP' && quote.ddpPrice && quote.ddpPrice > 0) {
      return quote.ddpPrice;
    }
    return quote.costPerUnitShortTerm ?? quote.exwUnitCost ?? null;
  };

  // Get grade color
  const getGradeColor = (grade: string | undefined): { bg: string; border: string; text: string } => {
    const gradeColors: Record<string, { bg: string; border: string; text: string }> = {
      'A': { bg: 'bg-emerald-900/30', border: 'border-emerald-600/50', text: 'text-emerald-400' },
      'B': { bg: 'bg-blue-900/30', border: 'border-blue-600/50', text: 'text-blue-400' },
      'C': { bg: 'bg-yellow-900/30', border: 'border-yellow-600/50', text: 'text-yellow-400' },
      'D': { bg: 'bg-orange-900/30', border: 'border-orange-600/50', text: 'text-orange-400' },
      'F': { bg: 'bg-red-900/30', border: 'border-red-600/50', text: 'text-red-400' },
      'Pending': { bg: 'bg-slate-800/30', border: 'border-slate-700/30', text: 'text-slate-400' },
    };
    return gradeColors[grade || 'Pending'] || gradeColors['Pending'];
  };

  // Get grade glow class for header
  const getGradeGlow = (grade: string | undefined): string => {
    const glowMap: Record<string, string> = {
      'A': 'shadow-[0_0_8px_rgba(16,185,129,0.4)]',
      'B': 'shadow-[0_0_8px_rgba(59,130,246,0.4)]',
      'C': 'shadow-[0_0_8px_rgba(234,179,8,0.4)]',
      'D': 'shadow-[0_0_8px_rgba(249,115,22,0.4)]',
      'F': 'shadow-[0_0_8px_rgba(239,68,68,0.4)]',
    };
    return glowMap[grade || ''] || 'shadow-[0_0_8px_rgba(100,116,139,0.3)]';
  };

  // Get chart bar color
  const getBarColor = (item: typeof chartData[0]): string => {
    if (item.isMissing) return '#475569'; // slate-600
    const gradeColors: Record<string, string> = {
      'A': '#10b981', // emerald-500
      'B': '#3b82f6', // blue-500
      'C': '#eab308', // yellow-500
      'D': '#f97316', // orange-500
      'F': '#ef4444', // red-500
    };
    return gradeColors[item.grade] || '#64748b'; // slate-500
  };

  // Get metric label
  const getMetricLabel = (): string => {
    const labels: Record<CompareMetric, string> = {
      profitPerUnit: 'Profit/Unit',
      margin: 'Margin',
      roi: 'ROI',
      totalGrossProfit: 'Total Gross Profit',
      totalInvestment: 'Total Investment',
    };
    return labels[compareMetric];
  };

  // Matrix view helpers
  type MatrixRowKey = string;
  type MatrixCellValue = { value: string | number | null; missingReason?: string; isHighlighted?: boolean; highlightType?: 'best' | 'worst' };

  // Get target sales price
  const getTargetSalesPrice = (): number | null => {
    const hub = hubData || { targetSalesPrice: null };
    const originalPrice = productData?.price || productData?.salesPrice || null;
    return hub.targetSalesPrice ?? originalPrice ?? null;
  };

  // Get category for referral fee display
  const getCategory = (): string => {
    const hub = hubData || { categoryOverride: null };
    const originalCategory = productData?.category || '';
    return hub.categoryOverride || originalCategory || '';
  };

  // Get referral fee percentage
  const getReferralFeePercentage = (): number => {
    const hub = hubData || { referralFeePct: null };
    const category = getCategory();
    return hub.referralFeePct !== null ? hub.referralFeePct : getReferralFeePct(category);
  };

  // Extract lead time days from string
  const extractLeadTimeDays = (leadTime: string | null | undefined): number | null => {
    if (!leadTime) return null;
    const numMatch = leadTime.match(/(\d+)/);
    return numMatch ? parseInt(numMatch[1], 10) : null;
  };

  // Get value for a matrix row for a specific supplier
  const getMatrixCellValue = (
    quote: SupplierQuoteRow,
    rowKey: MatrixRowKey,
    tierUsed: 'short' | 'medium' | 'long'
  ): MatrixCellValue => {
    // DEV: Log what quote object we're receiving for key fields
    if (process.env.NODE_ENV === 'development' && quote.id === 'quote_1767475901219_0' && (rowKey === 'moq' || rowKey === 'costPerUnit' || rowKey === 'fbaFeePerUnit')) {
      console.log(`[getMatrixCellValue] Called for ${rowKey}:`, {
        quoteId: quote.id,
        costPerUnitShortTerm: quote.costPerUnitShortTerm,
        fbaFeePerUnit: quote.fbaFeePerUnit,
        moqShortTerm: quote.moqShortTerm,
        quoteKeys: Object.keys(quote),
      });
    }
    
    const targetPrice = getTargetSalesPrice();
    const category = getCategory();
    const referralFeePct = getReferralFeePercentage();

    switch (rowKey) {
      // SECTION 1 - Key Figures
      case 'sampleOrdered':
        return {
          value: quote.sampleOrdered === true || quote.sampleOrdered === 'Yes' ? 'Yes' : 'No'
        };
      case 'sampleNotes':
        return {
          value: quote.sampleNotes || null,
          missingReason: quote.sampleNotes ? undefined : 'Sample Notes'
        };
      case 'leadTime':
        const leadTimeDays = extractLeadTimeDays(quote.leadTime);
        return {
          value: leadTimeDays !== null ? `${leadTimeDays} days` : (quote.leadTime || null),
          missingReason: !quote.leadTime ? 'Lead Time' : undefined
        };
      case 'tradeAssurance':
        return {
          value: quote.alibabaTradeAssurance === 'Yes' ? 'Yes' : 'No'
        };
      case 'supplierGrade':
        return {
          value: quote.supplierGrade || 'Pending'
        };
      case 'calculationAccuracy':
        const accuracy = getAccuracyState(quote);
        return {
          value: accuracy.label
        };
      
      // SECTION 1.5 - Packaging (SPP)
      case 'sppDimensions':
        const length = toNumberOrNull(quote.singleProductPackageLengthCm);
        const width = toNumberOrNull(quote.singleProductPackageWidthCm);
        const height = toNumberOrNull(quote.singleProductPackageHeightCm);
        if (length !== null && width !== null && height !== null) {
          return {
            value: `${length}cm × ${width}cm × ${height}cm`
          };
        }
        return {
          value: null,
          missingReason: 'Unit Package Dimensions'
        };
      case 'sppWeight':
        const weight = toNumberOrNull(quote.singleProductPackageWeightKg);
        return {
          value: weight,
          missingReason: weight === null ? 'Unit Package Weight' : undefined
        };

      // SECTION 2 - Sales & MOQ
      case 'targetSalesPrice':
        return {
          value: targetPrice,
          missingReason: !targetPrice ? 'Target Sales Price' : undefined
        };
      case 'tierUsed':
        return {
          value: tierUsed === 'medium' ? 'Medium' : tierUsed === 'long' ? 'Long' : 'Short'
        };
      case 'moq':
        const moq = tierUsed === 'medium' 
          ? toNumberOrNull(quote.moqMediumTerm)
          : tierUsed === 'long'
          ? toNumberOrNull(quote.moqLongTerm)
          : toNumberOrNull(quote.moqShortTerm ?? quote.moq);
        // DEV: Debug logging
        if (process.env.NODE_ENV === 'development' && quote.id === 'quote_1767475901219_0') {
          console.log('[getMatrixCellValue] moq row:', {
            tierUsed,
            moqShortTerm: quote.moqShortTerm,
            moq: quote.moq,
            result: moq,
          });
        }
        return {
          value: moq,
          missingReason: moq === null ? `MOQ (${tierUsed === 'medium' ? 'Medium' : tierUsed === 'long' ? 'Long' : 'Short'}-term)` : undefined
        };
      case 'costPerUnit':
        const costPerUnit = tierUsed === 'medium'
          ? toNumberOrNull(quote.costPerUnitMediumTerm)
          : tierUsed === 'long'
          ? toNumberOrNull(quote.costPerUnitLongTerm)
          : (() => {
              const effectiveIncoterms = quote.incotermsAgreed || quote.incoterms || 'DDP';
              if (effectiveIncoterms === 'DDP' && quote.ddpPrice && quote.ddpPrice > 0) {
                return toNumberOrNull(quote.ddpPrice);
              }
              return toNumberOrNull(quote.costPerUnitShortTerm ?? quote.exwUnitCost);
            })();
        // DEV: Debug logging
        if (process.env.NODE_ENV === 'development' && quote.id === 'quote_1767475901219_0') {
          console.log('[getMatrixCellValue] costPerUnit row:', {
            tierUsed,
            costPerUnitShortTerm: quote.costPerUnitShortTerm,
            exwUnitCost: quote.exwUnitCost,
            result: costPerUnit,
          });
        }
        return {
          value: costPerUnit,
          missingReason: costPerUnit === null ? `Cost/Unit (${tierUsed === 'medium' ? 'Medium' : tierUsed === 'long' ? 'Long' : 'Short'}-term)` : undefined
        };

      // SECTION 3 - Manufacturing & Adders
      case 'sspCostPerUnit':
        const sspCost = toNumberOrNull(quote.sspCostPerUnit);
        return {
          value: sspCost,
          missingReason: sspCost === null ? 'SSP Cost/Unit' : undefined
        };
      case 'packagingCostPerUnit':
        const packagingCost = toNumberOrNull(quote.packagingCostPerUnit ?? quote.packagingPerUnit);
        return {
          value: packagingCost,
          missingReason: packagingCost === null ? 'Packaging Cost/Unit' : undefined
        };
      case 'labellingCostPerUnit':
        const labellingCost = toNumberOrNull(quote.labellingCostPerUnit);
        return {
          value: labellingCost,
          missingReason: labellingCost === null ? 'Labelling Cost/Unit' : undefined
        };
      case 'inspectionCostPerUnit':
        const inspectionCost = toNumberOrNull(quote.inspectionCostPerUnit ?? quote.inspectionPerUnit);
        return {
          value: inspectionCost,
          missingReason: inspectionCost === null ? 'Inspection Cost/Unit' : undefined
        };

      // SECTION 4 - Freight & Compliance
      case 'freightCostPerUnit':
        const freightCost = toNumberOrNull(quote.freightCostPerUnit ?? quote.ddpShippingPerUnit);
        return {
          value: freightCost,
          missingReason: freightCost === null ? 'Freight Cost/Unit' : undefined
        };
      case 'dutyCostPerUnit':
        const dutyCost = toNumberOrNull(quote.dutyCostPerUnit);
        return {
          value: dutyCost,
          missingReason: dutyCost === null ? 'Duty Cost/Unit' : undefined
        };
      case 'tariffCostPerUnit':
        const tariffCost = toNumberOrNull(quote.tariffCostPerUnit);
        return {
          value: tariffCost,
          missingReason: tariffCost === null ? 'Tariff Cost/Unit' : undefined
        };
      case 'freightDutyCombined':
        const freight = toNumberOrNull(quote.freightCostPerUnit ?? quote.ddpShippingPerUnit) ?? 0;
        const duty = toNumberOrNull(quote.dutyCostPerUnit) ?? 0;
        const tariff = toNumberOrNull(quote.tariffCostPerUnit) ?? 0;
        const combined = freight + duty + tariff;
        if (combined > 0) {
          return { value: combined };
        }
        const basic = toNumberOrNull(quote.freightDutyCost) ?? 0;
        return {
          value: basic > 0 ? basic : null,
          missingReason: basic === 0 ? 'Freight/Duty Cost' : undefined
        };
      case 'incotermsAgreed':
        return {
          value: quote.incotermsAgreed || quote.incoterms || null,
          missingReason: !quote.incotermsAgreed && !quote.incoterms ? 'Incoterms' : undefined
        };
      
      // SECTION 4.5 - Carton / Logistics
      case 'unitsPerCarton':
        const unitsPerCarton = toNumberOrNull(quote.unitsPerCarton);
        return {
          value: unitsPerCarton,
          missingReason: unitsPerCarton === null ? 'Units/Carton' : undefined
        };
      case 'cartonDimensions':
        const cartonLength = toNumberOrNull(quote.cartonLengthCm);
        const cartonWidth = toNumberOrNull(quote.cartonWidthCm);
        const cartonHeight = toNumberOrNull(quote.cartonHeightCm);
        if (cartonLength !== null && cartonWidth !== null && cartonHeight !== null) {
          return {
            value: `${cartonLength}cm × ${cartonWidth}cm × ${cartonHeight}cm`
          };
        }
        return {
          value: null,
          missingReason: 'Carton Dimensions'
        };
      case 'cartonWeight':
        const cartonWeight = toNumberOrNull(quote.cartonWeightKg);
        return {
          value: cartonWeight,
          missingReason: cartonWeight === null ? 'Carton Weight' : undefined
        };

      // SECTION 5 - Amazon Fees
      case 'categoryReferralPct':
        return {
          value: referralFeePct,
          missingReason: !referralFeePct ? 'Category Referral %' : undefined
        };
      case 'referralFeePerUnit':
        const referralFee = targetPrice && referralFeePct ? toNumberOrNull(targetPrice * referralFeePct) : toNumberOrNull(quote.referralFee);
        return {
          value: referralFee,
          missingReason: referralFee === null ? 'Referral Fee/Unit' : undefined
        };
      case 'fbaFeePerUnit':
        const fbaFee = toNumberOrNull(quote.fbaFeePerUnit);
        // DEV: Debug logging
        if (process.env.NODE_ENV === 'development' && quote.id === 'quote_1767475901219_0') {
          console.log('[getMatrixCellValue] fbaFeePerUnit row:', {
            fbaFeePerUnit: quote.fbaFeePerUnit,
            result: fbaFee,
            quoteKeys: Object.keys(quote),
            hasFbaFeePerUnit: 'fbaFeePerUnit' in quote,
          });
        }
        return {
          value: fbaFee,
          missingReason: fbaFee === null ? 'FBA Fee/Unit' : undefined
        };
      case 'totalFeesPerUnit':
        const refFee = targetPrice && referralFeePct ? toNumberOrNull(targetPrice * referralFeePct) ?? 0 : toNumberOrNull(quote.referralFee) ?? 0;
        const fbaFeeVal = toNumberOrNull(quote.fbaFeePerUnit) ?? 0;
        const totalFees = refFee + fbaFeeVal;
        return {
          value: totalFees > 0 ? totalFees : null,
          missingReason: totalFees === 0 ? 'Total Fees/Unit' : undefined
        };

      // SECTION 6 - Totals & Profit
      case 'totalLandedUnitCost':
        const landedCost = toNumberOrNull(quote.landedUnitCost);
        return {
          value: landedCost,
          missingReason: landedCost === null ? 'Total Landed Unit Cost' : undefined
        };
      case 'profitPerUnit':
        const profit = toNumberOrNull(quote.profitPerUnit);
        return {
          value: profit,
          missingReason: profit === null ? 'Profit Per Unit' : undefined
        };
      case 'margin':
        const margin = toNumberOrNull(quote.marginPct);
        return {
          value: margin,
          missingReason: margin === null ? 'Margin' : undefined
        };
      case 'roi':
        const roi = toNumberOrNull(quote.roiPct);
        return {
          value: roi,
          missingReason: roi === null ? 'ROI' : undefined
        };
      case 'totalInvestment':
        const investment = toNumberOrNull(quote.totalInvestment);
        return {
          value: investment,
          missingReason: investment === null ? 'Total Investment' : undefined
        };
      case 'totalGrossProfit':
        const grossProfit = toNumberOrNull(quote.grossProfit);
        return {
          value: grossProfit,
          missingReason: grossProfit === null ? 'Total Gross Profit' : undefined
        };

      default:
        return { value: null };
    }
  };

  // Matrix row definitions
  type MatrixRowDef = {
    key: MatrixRowKey;
    label: string;
    section: string;
    format: (value: any) => string;
    isProfitMetric?: boolean;
    editable?: boolean;
    inputType?: 'number' | 'text' | 'textarea' | 'select' | 'yesno' | 'incoterms' | 'dimensions' | 'cartonDimensions';
    selectOptions?: { value: string; label: string }[];
  };

  const matrixRows: MatrixRowDef[] = [
    // SECTION 1 - Key Supplier Info
    { key: 'supplierGrade', label: 'Supplier Grade', section: 'Key Supplier Info', format: (v) => v || 'Pending' },
    { key: 'calculationAccuracy', label: 'Calculation Accuracy', section: 'Key Supplier Info', format: (v) => v || '—' },
    { key: 'sampleOrdered', label: 'Sample Ordered', section: 'Key Supplier Info', format: (v) => v || '—', editable: true, inputType: 'yesno' },
    { key: 'sampleNotes', label: 'Sample Notes', section: 'Key Supplier Info', format: (v) => v || '—', editable: true, inputType: 'textarea' },
    { key: 'leadTime', label: 'Lead Time', section: 'Key Supplier Info', format: (v) => v || '—', editable: true, inputType: 'text' },
    { key: 'tradeAssurance', label: 'Trade Assurance', section: 'Key Supplier Info', format: (v) => v || '—', editable: true, inputType: 'yesno' },
    
    // SECTION 1.5 - Unit Packaging
    { key: 'sppDimensions', label: 'Unit Package Dimensions', section: 'Unit Packaging', format: (v) => v || '—', editable: true, inputType: 'dimensions' },
    { key: 'sppWeight', label: 'Unit Package Weight', section: 'Unit Packaging', format: (v) => v !== null && v !== undefined ? `${v}kg` : '—', editable: true, inputType: 'number' },

    // SECTION 2 - Sales & MOQ
    { key: 'targetSalesPrice', label: 'Target Sales Price', section: 'Sales & MOQ', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—' },
    { key: 'tierUsed', label: 'Tier Used', section: 'Sales & MOQ', format: (v) => v || '—' },
    { key: 'moq', label: 'MOQ', section: 'Sales & MOQ', format: (v) => v !== null && v !== undefined ? v.toLocaleString() : '—', editable: true, inputType: 'number' },
    { key: 'costPerUnit', label: 'Cost/Unit', section: 'Sales & MOQ', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—', editable: true, inputType: 'number' },

    // SECTION 3 - Manufacturing & Adders
    { key: 'sspCostPerUnit', label: 'SSP Cost/Unit', section: 'Manufacturing & Adders', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—', editable: true, inputType: 'number' },
    { key: 'packagingCostPerUnit', label: 'Packaging Cost/Unit', section: 'Manufacturing & Adders', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—', editable: true, inputType: 'number' },
    { key: 'labellingCostPerUnit', label: 'Labelling Cost/Unit', section: 'Manufacturing & Adders', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—', editable: true, inputType: 'number' },
    { key: 'inspectionCostPerUnit', label: 'Inspection Cost/Unit', section: 'Manufacturing & Adders', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—', editable: true, inputType: 'number' },

    // SECTION 4 - Freight & Compliance
    { key: 'freightCostPerUnit', label: 'Freight Cost/Unit', section: 'Freight & Compliance', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—', editable: true, inputType: 'number' },
    { key: 'dutyCostPerUnit', label: 'Duty Cost/Unit', section: 'Freight & Compliance', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—', editable: true, inputType: 'number' },
    { key: 'tariffCostPerUnit', label: 'Tariff Cost/Unit', section: 'Freight & Compliance', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—', editable: true, inputType: 'number' },
    { key: 'freightDutyCombined', label: 'Freight/Duty Combined', section: 'Freight & Compliance', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—', editable: true, inputType: 'number' },
    { key: 'incotermsAgreed', label: 'Incoterms Agreed', section: 'Freight & Compliance', format: (v) => v || '—', editable: true, inputType: 'incoterms', selectOptions: [
      { value: 'EXW', label: 'EXW' },
      { value: 'FOB', label: 'FOB' },
      { value: 'DDP', label: 'DDP' },
      { value: 'CIF', label: 'CIF' },
      { value: 'CFR', label: 'CFR' },
    ]},
    
    // SECTION 4.5 - Carton / Logistics
    { key: 'unitsPerCarton', label: 'Units/Carton', section: 'Carton / Logistics', format: (v) => v !== null && v !== undefined ? v.toLocaleString() : '—', editable: true, inputType: 'number' },
    { key: 'cartonDimensions', label: 'Carton Dimensions', section: 'Carton / Logistics', format: (v) => v || '—', editable: true, inputType: 'cartonDimensions' },
    { key: 'cartonWeight', label: 'Carton Weight', section: 'Carton / Logistics', format: (v) => v !== null && v !== undefined ? `${v}kg` : '—', editable: true, inputType: 'number' },

    // SECTION 5 - Amazon Fees
    { key: 'categoryReferralPct', label: 'Category Referral %', section: 'Amazon Fees', format: (v) => v !== null && v !== undefined ? `${(v * 100).toFixed(1)}%${getCategory() ? ` — ${getCategory()}` : ''}` : '—' },
    { key: 'referralFeePerUnit', label: 'Referral Fee/Unit', section: 'Amazon Fees', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—' },
    { key: 'fbaFeePerUnit', label: 'FBA Fee/Unit', section: 'Amazon Fees', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—', editable: true, inputType: 'number' },
    { key: 'totalFeesPerUnit', label: 'Total Fees/Unit', section: 'Amazon Fees', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—' },

    // SECTION 6 - Totals & Profit
    { key: 'totalLandedUnitCost', label: 'Total Landed Unit Cost', section: 'Totals & Profit', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—' },
    { key: 'profitPerUnit', label: 'Profit Per Unit', section: 'Totals & Profit', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—', isProfitMetric: true },
    { key: 'margin', label: 'Margin', section: 'Totals & Profit', format: (v) => v !== null && v !== undefined ? `${v.toFixed(1)}%` : '—', isProfitMetric: true },
    { key: 'roi', label: 'ROI', section: 'Totals & Profit', format: (v) => v !== null && v !== undefined ? `${v.toFixed(1)}%` : '—', isProfitMetric: true },
    { key: 'totalInvestment', label: 'Total Investment', section: 'Totals & Profit', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—' },
    { key: 'totalGrossProfit', label: 'Total Gross Profit', section: 'Totals & Profit', format: (v) => v !== null && v !== undefined ? formatCurrency(v) : '—', isProfitMetric: true },
  ];

  // Calculate best/worst suppliers for profit metrics
  const bestWorstSuppliers = useMemo(() => {
    const profitMetrics = ['profitPerUnit', 'margin', 'roi', 'totalGrossProfit'] as const;
    const result: Record<string, { best?: string; worst?: string }> = {};

    profitMetrics.forEach(metric => {
      const validQuotes = filteredQuotes.filter(q => {
        const value = metric === 'profitPerUnit' ? q.profitPerUnit
          : metric === 'margin' ? q.marginPct
          : metric === 'roi' ? q.roiPct
          : q.grossProfit;
        return value !== null && value !== undefined && !isNaN(value);
      });

      if (validQuotes.length > 0) {
        const sorted = [...validQuotes].sort((a, b) => {
          const aVal = metric === 'profitPerUnit' ? a.profitPerUnit!
            : metric === 'margin' ? a.marginPct!
            : metric === 'roi' ? a.roiPct!
            : a.grossProfit!;
          const bVal = metric === 'profitPerUnit' ? b.profitPerUnit!
            : metric === 'margin' ? b.marginPct!
            : metric === 'roi' ? b.roiPct!
            : b.grossProfit!;
          return bVal - aVal;
        });

        result[metric] = {
          best: sorted[0].id,
          worst: sorted.length > 1 ? sorted[sorted.length - 1].id : undefined
        };
      }
    });

    return result;
  }, [filteredQuotes]);

  // Check if any supplier has data for a row
  const hasAnyDataForRow = (rowKey: MatrixRowKey): boolean => {
    return visibleQuotes.some(quote => {
      const tier = quote.finalCalcTier || 'short';
      const cell = getMatrixCellValue(quote, rowKey, tier as 'short' | 'medium' | 'long');
      return cell.value !== null && cell.value !== undefined && cell.value !== '—' && cell.value !== '';
    });
  };

  // Check if all suppliers have data for a row
  const hasAllDataForRow = (rowKey: MatrixRowKey): boolean => {
    if (visibleQuotes.length === 0) return false;
    return visibleQuotes.every(quote => {
      const tier = quote.finalCalcTier || 'short';
      const cell = getMatrixCellValue(quote, rowKey, tier as 'short' | 'medium' | 'long');
      return cell.value !== null && cell.value !== undefined && cell.value !== '—' && cell.value !== '';
    });
  };

  // Check if row has any missing data (for Missing Info Only filter)
  const rowHasMissingData = (rowKey: MatrixRowKey): boolean => {
    return visibleQuotes.some(quote => {
      const tier = quote.finalCalcTier || 'short';
      const cell = getMatrixCellValue(quote, rowKey, tier as 'short' | 'medium' | 'long');
      return cell.missingReason !== undefined;
    });
  };

  // Check if section has any rows with missing data
  const sectionHasMissingData = (section: string): boolean => {
    const sectionRows = matrixRows.filter(r => r.section === section);
    return sectionRows.some(row => rowHasMissingData(row.key));
  };
  
  // Section collapse/expand handlers
  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };
  
  const collapseAllSections = () => {
    const allSections = new Set(matrixRows.map(r => r.section));
    setCollapsedSections(allSections);
  };
  
  const expandAllSections = () => {
    setCollapsedSections(new Set());
  };
  
  const isSectionCollapsed = (section: string) => {
    return collapsedSections.has(section);
  };
  
  // Column hide/show handlers
  const toggleSupplierVisibility = (quoteId: string) => {
    setHiddenSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(quoteId)) {
        next.delete(quoteId);
      } else {
        next.add(quoteId);
      }
      return next;
    });
  };
  
  const showSupplier = (quoteId: string) => {
    setHiddenSuppliers(prev => {
      const next = new Set(prev);
      next.delete(quoteId);
      return next;
    });
  };
  
  // Map matrix row key to SupplierQuoteRow field name based on tier
  const getFieldNameForRow = (rowKey: MatrixRowKey, tier: 'short' | 'medium' | 'long'): keyof SupplierQuoteRow | null => {
    switch (rowKey) {
      case 'moq':
        if (tier === 'medium') return 'moqMediumTerm';
        if (tier === 'long') return 'moqLongTerm';
        return 'moqShortTerm';
      case 'costPerUnit':
        if (tier === 'medium') return 'costPerUnitMediumTerm';
        if (tier === 'long') return 'costPerUnitLongTerm';
        return 'costPerUnitShortTerm';
      case 'leadTime':
        return 'leadTime';
      case 'sampleOrdered':
        return 'sampleOrdered';
      case 'sampleNotes':
        return 'sampleNotes';
      case 'tradeAssurance':
        return 'alibabaTradeAssurance';
      case 'sspCostPerUnit':
        return 'sspCostPerUnit';
      case 'packagingCostPerUnit':
        return 'packagingCostPerUnit';
      case 'labellingCostPerUnit':
        return 'labellingCostPerUnit';
      case 'inspectionCostPerUnit':
        return 'inspectionCostPerUnit';
      case 'freightCostPerUnit':
        return 'freightCostPerUnit';
      case 'dutyCostPerUnit':
        return 'dutyCostPerUnit';
      case 'tariffCostPerUnit':
        return 'tariffCostPerUnit';
      case 'freightDutyCombined':
        return 'freightDutyCost';
      case 'incotermsAgreed':
        return 'incotermsAgreed';
      case 'fbaFeePerUnit':
        return 'fbaFeePerUnit';
      case 'sppDimensions':
        return null; // Special handling - composite field
      case 'sppWeight':
        return 'singleProductPackageWeightKg';
      case 'unitsPerCarton':
        return 'unitsPerCarton';
      case 'cartonDimensions':
        return null; // Special handling - composite field
      case 'cartonWeight':
        return 'cartonWeightKg';
      default:
        return null;
    }
  };
  
  // Get raw value for editing (before formatting)
  const getRawValueForEdit = (quote: SupplierQuoteRow, rowKey: MatrixRowKey, tier: 'short' | 'medium' | 'long'): any => {
    const fieldName = getFieldNameForRow(rowKey, tier);
    if (!fieldName) return null;
    
    const value = quote[fieldName];
    
    // Handle special cases
    if (rowKey === 'sampleOrdered') {
      return value === true || value === 'Yes' ? 'Yes' : 'No';
    }
    if (rowKey === 'tradeAssurance') {
      return value === 'Yes' ? 'Yes' : 'No';
    }
    if (rowKey === 'leadTime') {
      // Return the full string value for editing
      return value || '';
    }
    
    if (rowKey === 'sppDimensions') {
      // Return formatted string for editing
      const length = quote.singleProductPackageLengthCm;
      const width = quote.singleProductPackageWidthCm;
      const height = quote.singleProductPackageHeightCm;
      if (length && width && height) {
        return `${length}cm × ${width}cm × ${height}cm`;
      }
      return '';
    }
    
    if (rowKey === 'cartonDimensions') {
      // Return formatted string for editing
      const length = quote.cartonLengthCm;
      const width = quote.cartonWidthCm;
      const height = quote.cartonHeightCm;
      if (length && width && height) {
        return `${length}cm × ${width}cm × ${height}cm`;
      }
      return '';
    }
    
    return value;
  };
  
  // Handle cell value update
  const handleCellUpdate = (quoteId: string, rowKey: MatrixRowKey, newValue: any, tier: 'short' | 'medium' | 'long') => {
    const fieldName = getFieldNameForRow(rowKey, tier);
    if (!fieldName || !onChange) return;
    
    let processedValue: any = newValue;
    
    // Process value based on type
    if (rowKey === 'moq') {
      // Parse as integer
      const num = parseFloat(String(newValue));
      processedValue = isNaN(num) ? null : Math.floor(num);
    } else if (rowKey === 'leadTime' || rowKey === 'sampleNotes') {
      // Keep as string
      processedValue = String(newValue).trim() || null;
    } else if (rowKey === 'sppDimensions') {
      // Parse dimensions string: "30cm × 30cm × 30cm" -> extract numbers
      const dims = String(newValue).match(/(\d+(?:\.\d+)?)/g);
      if (dims && dims.length >= 3) {
        handleUpdateQuote(quoteId, {
          singleProductPackageLengthCm: parseFloat(dims[0]),
          singleProductPackageWidthCm: parseFloat(dims[1]),
          singleProductPackageHeightCm: parseFloat(dims[2])
        });
        return;
      }
      return; // Invalid format, don't update
    } else if (rowKey === 'cartonDimensions') {
      // Parse dimensions string: "52cm × 40cm × 50cm" -> extract numbers
      const dims = String(newValue).match(/(\d+(?:\.\d+)?)/g);
      if (dims && dims.length >= 3) {
        handleUpdateQuote(quoteId, {
          cartonLengthCm: parseFloat(dims[0]),
          cartonWidthCm: parseFloat(dims[1]),
          cartonHeightCm: parseFloat(dims[2])
        });
        return;
      }
      return; // Invalid format, don't update
    } else if (rowKey === 'sppWeight') {
      // Parse as float for weight
      const num = parseFloat(String(newValue));
      handleUpdateQuote(quoteId, { singleProductPackageWeightKg: isNaN(num) ? null : num });
      return;
    } else if (rowKey === 'cartonWeight') {
      // Parse as float for weight
      const num = parseFloat(String(newValue));
      handleUpdateQuote(quoteId, { cartonWeightKg: isNaN(num) ? null : num });
      return;
    } else if (rowKey === 'unitsPerCarton') {
      // Parse as integer
      const num = parseFloat(String(newValue));
      handleUpdateQuote(quoteId, { unitsPerCarton: isNaN(num) ? null : Math.floor(num) });
      return;
    } else if (['costPerUnit', 'sspCostPerUnit', 'packagingCostPerUnit', 'labellingCostPerUnit', 
                 'inspectionCostPerUnit', 'freightCostPerUnit', 'dutyCostPerUnit', 'tariffCostPerUnit', 
                 'freightDutyCombined', 'fbaFeePerUnit'].includes(rowKey)) {
      // Parse as float
      const num = parseFloat(String(newValue));
      processedValue = isNaN(num) ? null : num;
    } else if (rowKey === 'sampleOrdered') {
      processedValue = newValue === 'Yes' ? 'Yes' : 'No';
      // Clear sample notes if "No" is selected
      if (processedValue === 'No') {
        handleUpdateQuote(quoteId, { sampleOrdered: 'No', sampleNotes: null });
        return;
      }
    } else if (rowKey === 'tradeAssurance') {
      processedValue = newValue === 'Yes' ? 'Yes' : 'No';
    } else if (rowKey === 'sampleNotes' || rowKey === 'incotermsAgreed') {
      processedValue = String(newValue).trim() || null;
    }
    
    // Special handling for freightDutyCombined
    if (rowKey === 'freightDutyCombined') {
      handleUpdateQuote(quoteId, { freightDutyCost: processedValue });
      return;
    }
    
    // Handle tier-specific fields
    if (rowKey === 'moq' || rowKey === 'costPerUnit') {
      const updates: Partial<SupplierQuoteRow> = {};
      if (tier === 'short') {
        if (rowKey === 'moq') {
          updates.moqShortTerm = processedValue;
          updates.moq = processedValue; // Also update legacy field
        } else {
          updates.costPerUnitShortTerm = processedValue;
          updates.exwUnitCost = processedValue; // Also update legacy field
        }
      } else if (tier === 'medium') {
        if (rowKey === 'moq') {
          updates.moqMediumTerm = processedValue;
        } else {
          updates.costPerUnitMediumTerm = processedValue;
        }
      } else if (tier === 'long') {
        if (rowKey === 'moq') {
          updates.moqLongTerm = processedValue;
        } else {
          updates.costPerUnitLongTerm = processedValue;
        }
      }
      handleUpdateQuote(quoteId, updates);
      return;
    }
    
    // Standard field update
    handleUpdateQuote(quoteId, { [fieldName]: processedValue } as Partial<SupplierQuoteRow>);
  };

  // SortableSupplierHeader Component
  const SortableSupplierHeader = ({ 
    quote, 
    tier, 
    accuracy, 
    gradeColors 
  }: { 
    quote: SupplierQuoteRow;
    tier: 'short' | 'medium' | 'long';
    accuracy: AccuracyState;
    gradeColors: { bg: string; border: string; text: string };
  }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: quote.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const gradeGlow = getGradeGlow(quote.supplierGrade);

    return (
      <th
        ref={setNodeRef}
        style={style}
        className={`px-4 py-3 text-center min-w-[220px] bg-slate-900/50 ${gradeGlow} transition-shadow`}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-slate-800/50 rounded transition-colors"
              title="Drag to reorder"
            >
              <GripVertical className="w-4 h-4 text-slate-500 hover:text-slate-300" />
            </div>
            <div className="font-semibold text-white text-sm">
              {quote.displayName || quote.supplierName || 'Unnamed Supplier'}
            </div>
            <button
              onClick={() => toggleSupplierVisibility(quote.id)}
              className="p-1 hover:bg-slate-800/50 rounded transition-colors"
              title="Hide supplier"
            >
              <Eye className="w-4 h-4 text-slate-400 hover:text-white" />
            </button>
          </div>
        </div>
      </th>
    );
  };

  // MatrixCell Component
  const MatrixCell = ({ 
    quote, 
    rowDef, 
    tier, 
    isMissing, 
    hasRelative, 
    hasAbsolute,
    isBest, 
    isWorst 
  }: { 
    quote: SupplierQuoteRow;
    rowDef: MatrixRowDef;
    tier: 'short' | 'medium' | 'long';
    isMissing: boolean;
    hasRelative: boolean;
    hasAbsolute: boolean;
    isBest?: boolean;
    isWorst?: boolean;
  }) => {
    const cellId = `${quote.id}-${rowDef.key}`;
    const isEditing = editingCell?.quoteId === quote.id && editingCell?.rowKey === rowDef.key;
    
    // CRITICAL: Use getMatrixCellValue for display (handles tier-based fields correctly)
    // Only use getRawValueForEdit when actually editing
    const cellValue = getMatrixCellValue(quote, rowDef.key, tier);
    const displayValue = cellValue.value; // Use the value from getMatrixCellValue
    const rawValue = getRawValueForEdit(quote, rowDef.key, tier); // Only for editing
    const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null);
    
    // Local state for editing - prevents re-renders from parent
    const [localEditValue, setLocalEditValue] = useState<string>('');
    
    // For dimensions inputs
    const [dimLength, setDimLength] = useState<string>('');
    const [dimWidth, setDimWidth] = useState<string>('');
    const [dimHeight, setDimHeight] = useState<string>('');
    
    useEffect(() => {
      if (isEditing) {
        // Initialize local edit value when editing starts
        if (rowDef.inputType === 'dimensions') {
          setDimLength(quote.singleProductPackageLengthCm?.toString() || '');
          setDimWidth(quote.singleProductPackageWidthCm?.toString() || '');
          setDimHeight(quote.singleProductPackageHeightCm?.toString() || '');
        } else if (rowDef.inputType === 'cartonDimensions') {
          setDimLength(quote.cartonLengthCm?.toString() || '');
          setDimWidth(quote.cartonWidthCm?.toString() || '');
          setDimHeight(quote.cartonHeightCm?.toString() || '');
        } else {
          setLocalEditValue(rawValue !== null && rawValue !== undefined ? String(rawValue) : '');
        }
        
        if (inputRef.current) {
          inputRef.current.focus();
          if (inputRef.current instanceof HTMLInputElement || inputRef.current instanceof HTMLTextAreaElement) {
            inputRef.current.select();
          }
        }
      }
    }, [isEditing, rawValue, quote, rowDef.inputType]);
    
    const handleStartEdit = () => {
      if (!rowDef.editable) return;
      setEditingCell({ quoteId: quote.id, rowKey: rowDef.key });
    };
    
    const handleSave = () => {
      if (!rowDef.editable) return;
      
      // Handle dimensions separately
      if (rowDef.inputType === 'dimensions') {
        const length = parseFloat(dimLength);
        const width = parseFloat(dimWidth);
        const height = parseFloat(dimHeight);
        
        handleUpdateQuote(quote.id, {
          singleProductPackageLengthCm: !isNaN(length) ? length : null,
          singleProductPackageWidthCm: !isNaN(width) ? width : null,
          singleProductPackageHeightCm: !isNaN(height) ? height : null,
        });
        setEditingCell(null);
        return;
      } else if (rowDef.inputType === 'cartonDimensions') {
        const length = parseFloat(dimLength);
        const width = parseFloat(dimWidth);
        const height = parseFloat(dimHeight);
        
        handleUpdateQuote(quote.id, {
          cartonLengthCm: !isNaN(length) ? length : null,
          cartonWidthCm: !isNaN(width) ? width : null,
          cartonHeightCm: !isNaN(height) ? height : null,
        });
        setEditingCell(null);
        return;
      }
      
      handleCellUpdate(quote.id, rowDef.key, localEditValue, tier);
      setEditingCell(null);
    };
    
    const handleCancel = () => {
      setEditingCell(null);
    };
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
      // For textarea, only save on Ctrl+Enter or Cmd+Enter
      if (rowDef.inputType === 'textarea') {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          handleSave();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      } else {
        // For other inputs, save on Enter
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSave();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      }
    };
    
    let cellClasses = 'px-4 py-3 text-sm text-center relative';
    if (isMissing) {
      // Two-level missing styling
      if (hasRelative) {
        // Attention missing: at least one supplier has data, this one is missing
        cellClasses += ' bg-red-950/30 border border-dashed border-red-700/50 text-red-300';
      } else {
        // Neutral missing: all suppliers are missing this field
        cellClasses += ' bg-slate-800/30 border border-dashed border-slate-700/50 text-slate-500';
      }
    } else if (rowDef.isProfitMetric) {
      // Enhanced styling for profit metrics
      if (isBest) {
        cellClasses += ' bg-emerald-900/30 border-2 border-emerald-500/70 text-emerald-300 font-semibold';
      } else if (isWorst) {
        cellClasses += ' bg-red-900/30 border-2 border-red-500/70 text-red-300 font-semibold';
      } else {
        cellClasses += ' bg-slate-800/20 text-slate-200';
      }
    } else {
      cellClasses += ' text-slate-300';
    }
    
    // Check if Sample Notes should be locked (when Sample Ordered is "No")
    const isSampleNotesLocked = rowDef.key === 'sampleNotes' && 
      (quote.sampleOrdered === 'No' || quote.sampleOrdered === false);
    
    // Determine if field is editable
    const isFieldEditable = rowDef.editable && !isSampleNotesLocked;
    
    if (isFieldEditable && !isEditing) {
      cellClasses += ' cursor-pointer hover:bg-slate-700/30 group';
    }
    
    // Add locked styling if Sample Notes is locked
    if (isSampleNotesLocked) {
      cellClasses += ' opacity-50 cursor-not-allowed';
    }
    
    // Determine title/tooltip
    let cellTitle: string | undefined;
    if (isSampleNotesLocked) {
      cellTitle = 'Sample Notes is locked (Sample Ordered must be Yes)';
    } else if (isMissing && rowDef.key !== 'targetSalesPrice') {
      cellTitle = `Missing: ${rowDef.label}${hasRelative ? ' (others have this value)' : ''}`;
    }
    
    return (
      <td 
        className={cellClasses}
        title={cellTitle}
        onClick={!isEditing && isFieldEditable ? handleStartEdit : undefined}
      >
        {isEditing ? (
          <div className="flex items-center justify-center gap-1 w-full">
            {rowDef.inputType === 'select' || rowDef.inputType === 'incoterms' ? (
              <>
                <select
                  ref={inputRef as React.RefObject<HTMLSelectElement>}
                  value={localEditValue}
                  onChange={(e) => setLocalEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                  autoFocus
                >
                  {rowDef.selectOptions?.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={handleSave}
                  className="p-1 bg-emerald-600 hover:bg-emerald-500 rounded text-white"
                  title="Save"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={handleCancel}
                  className="p-1 bg-red-600 hover:bg-red-500 rounded text-white"
                  title="Cancel"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : rowDef.inputType === 'yesno' ? (
              <>
                <select
                  ref={inputRef as React.RefObject<HTMLSelectElement>}
                  value={localEditValue}
                  onChange={(e) => setLocalEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                  autoFocus
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
                <button
                  onClick={handleSave}
                  className="p-1 bg-emerald-600 hover:bg-emerald-500 rounded text-white"
                  title="Save"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={handleCancel}
                  className="p-1 bg-red-600 hover:bg-red-500 rounded text-white"
                  title="Cancel"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : rowDef.inputType === 'textarea' ? (
              <div className="w-full">
                <textarea
                  ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                  value={localEditValue}
                  onChange={(e) => setLocalEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500 resize-none mb-1"
                  rows={3}
                  autoFocus
                  placeholder="Enter text... (Ctrl+Enter to save, Esc to cancel)"
                />
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={handleSave}
                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-white text-xs flex items-center gap-1"
                    title="Save"
                  >
                    <Check className="w-3 h-3" />
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-white text-xs flex items-center gap-1"
                    title="Cancel"
                  >
                    <X className="w-3 h-3" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : rowDef.inputType === 'dimensions' || rowDef.inputType === 'cartonDimensions' ? (
              <div className="w-full">
                <div className="grid grid-cols-3 gap-2 mb-1">
                  <div>
                    <label className="text-xs text-slate-400 block mb-0.5">L (cm)</label>
                    <input
                      ref={inputRef as React.RefObject<HTMLInputElement>}
                      type="number"
                      step="0.01"
                      value={dimLength}
                      onChange={(e) => setDimLength(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Length"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-0.5">W (cm)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={dimWidth}
                      onChange={(e) => setDimWidth(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Width"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-0.5">H (cm)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={dimHeight}
                      onChange={(e) => setDimHeight(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Height"
                    />
                  </div>
                </div>
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={handleSave}
                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-white text-xs flex items-center gap-1"
                    title="Save"
                  >
                    <Check className="w-3 h-3" />
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-white text-xs flex items-center gap-1"
                    title="Cancel"
                  >
                    <X className="w-3 h-3" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : rowDef.inputType === 'text' ? (
              <>
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={localEditValue}
                  onChange={(e) => setLocalEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  className="p-1 bg-emerald-600 hover:bg-emerald-500 rounded text-white"
                  title="Save"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={handleCancel}
                  className="p-1 bg-red-600 hover:bg-red-500 rounded text-white"
                  title="Cancel"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : (
              <>
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type="number"
                  step="any"
                  value={localEditValue}
                  onChange={(e) => setLocalEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  className="p-1 bg-emerald-600 hover:bg-emerald-500 rounded text-white"
                  title="Save"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={handleCancel}
                  className="p-1 bg-red-600 hover:bg-red-500 rounded text-white"
                  title="Cancel"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1">
            {isMissing ? (
              <>
                <span>—</span>
                {hasRelative && <AlertCircle className="w-3 h-3 text-red-400" />}
              </>
            ) : (
              <>
                <span>{rowDef.format(displayValue)}</span>
                {isSampleNotesLocked ? (
                  <Lock className="w-3 h-3 text-slate-500" />
                ) : rowDef.editable && (
                  <Pencil className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </>
            )}
            {isBest && rowDef.isProfitMetric && (
              <div className="flex items-center gap-1">
                <Trophy className="w-4 h-4 text-emerald-400" aria-label="Best value" />
                <span className="text-xs text-emerald-400 font-medium">Best</span>
              </div>
            )}
            {isWorst && rowDef.isProfitMetric && (
              <AlertTriangle className="w-4 h-4 text-red-400" aria-label="Worst value" />
            )}
          </div>
        )}
      </td>
    );
  };

  // Helper to get profit per unit tier (reuse logic from SupplierQuotesTab)
  const getProfitPerUnitTier = (value: number | null | undefined): { label: string; textColor: string; bgColor: string; borderColor: string } => {
    if (value === null || value === undefined || isNaN(value)) {
      return {
        label: '—',
        textColor: 'text-slate-400',
        bgColor: 'bg-slate-800/50',
        borderColor: 'border-slate-700/50',
      };
    }

    if (value < 5) {
      return {
        label: formatCurrency(value),
        textColor: 'text-red-400',
        bgColor: 'bg-red-900/30',
        borderColor: 'border-red-600/50',
      };
    } else if (value < 10) {
      return {
        label: formatCurrency(value),
        textColor: 'text-yellow-400',
        bgColor: 'bg-yellow-900/30',
        borderColor: 'border-yellow-600/50',
      };
    } else {
      return {
        label: formatCurrency(value),
        textColor: 'text-emerald-400',
        bgColor: 'bg-emerald-900/30',
        borderColor: 'border-emerald-600/50',
      };
    }
  };


  if (supplierQuotes.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-700/50 mb-4">
          <Calculator className="w-8 h-8 text-slate-500" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No Suppliers to Compare</h3>
        <p className="text-slate-400">
          Add suppliers in Supplier Quotes to see profit comparisons.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Controls */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* View Toggle */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-400 whitespace-nowrap">View:</label>
            <div className="flex rounded-lg border border-slate-700/50 overflow-hidden">
              <button
                onClick={() => setViewMode('matrix')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'matrix'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-900/50 text-slate-400 hover:bg-slate-800/50'
                }`}
              >
                Matrix
              </button>
            </div>
          </div>


          {/* Matrix Controls */}
          {viewMode === 'matrix' && (
            <div className="flex items-center gap-2">
              <button
                onClick={collapseAllSections}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-900/50 border border-slate-700/50 rounded-lg hover:bg-slate-800/50 transition-colors"
              >
                Collapse All
              </button>
              <button
                onClick={expandAllSections}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-900/50 border border-slate-700/50 rounded-lg hover:bg-slate-800/50 transition-colors"
              >
                Expand All
              </button>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 ml-auto">
            {viewMode === 'matrix' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={showMissingOnly}
                  onChange={(e) => setShowMissingOnly(e.target.checked)}
                />
                <span className="text-sm text-slate-400">Missing Info Only</span>
              </label>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={hideIncomplete}
                onChange={(e) => setHideIncomplete(e.target.checked)}
              />
              <span className="text-sm text-slate-400">Hide Incomplete</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={hidePending}
                onChange={(e) => setHidePending(e.target.checked)}
              />
              <span className="text-sm text-slate-400">Hide Pending</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={showOnlySampled}
                onChange={(e) => setShowOnlySampled(e.target.checked)}
              />
              <span className="text-sm text-slate-400">Sample Ordered Only</span>
            </label>
          </div>
        </div>
      </div>


      {/* Matrix View */}
      {viewMode === 'matrix' && (
        <div ref={matrixRef} className="bg-slate-800/50 rounded-xl border border-slate-700/50">
          {/* Hidden Suppliers Row */}
          {hiddenQuotesList.length > 0 && (
            <div className="p-3 bg-slate-700/30 border-b border-slate-700/50">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400 font-medium">Hidden suppliers:</span>
                {hiddenQuotesList.map((quote) => (
                  <button
                    key={quote.id}
                    onClick={() => showSupplier(quote.id)}
                    className="px-2 py-1 text-xs bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600/50 rounded-md text-slate-300 hover:text-white transition-colors flex items-center gap-1"
                  >
                    {quote.displayName || quote.supplierName || 'Unnamed'}
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {visibleQuotes.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-400">No suppliers match your filters.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full">
                  <table className="w-full border-collapse">
                    <thead className="bg-slate-900/50 border-b border-slate-700/50 sticky top-0 z-10">
                      <tr>
                        <th className="sticky left-0 bg-slate-900/50 z-20 px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider border-r border-slate-700/50 min-w-[200px]">
                          Key Supplier Info
                        </th>
                        <SortableContext
                          items={visibleQuotes.map(q => q.id)}
                          strategy={horizontalListSortingStrategy}
                        >
                          {visibleQuotes.map((quote) => {
                            const tier = quote.finalCalcTier || 'short';
                            const accuracy = getAccuracyState(quote);
                            const gradeColors = getGradeColor(quote.supplierGrade);
                            return (
                              <SortableSupplierHeader
                                key={quote.id}
                                quote={quote}
                                tier={tier as 'short' | 'medium' | 'long'}
                                accuracy={accuracy}
                                gradeColors={gradeColors}
                              />
                            );
                          })}
                        </SortableContext>
                      </tr>
                    </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {matrixRows.reduce((acc, rowDef, rowIndex) => {
                      const prevSection = rowIndex > 0 ? matrixRows[rowIndex - 1].section : null;
                      const isNewSection = prevSection !== rowDef.section;
                      
                      // Add section header row
                      if (isNewSection) {
                        const isCollapsed = isSectionCollapsed(rowDef.section);
                        const sectionHasMissing = showMissingOnly ? sectionHasMissingData(rowDef.section) : true;
                        
                        // Skip section if Missing Info Only is enabled and section has no missing data
                        if (showMissingOnly && !sectionHasMissing) {
                          return acc;
                        }
                        
                        acc.push(
                          <tr key={`section-${rowDef.section}`} className="bg-slate-700/30">
                            <td
                              colSpan={visibleQuotes.length + 1}
                              className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-700/30 cursor-pointer hover:bg-slate-600/30 transition-colors"
                              onClick={() => toggleSection(rowDef.section)}
                            >
                              <div className="flex items-center gap-2">
                                {isCollapsed ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronUp className="w-4 h-4" />
                                )}
                                {rowDef.section}
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      
                      // Skip rows if section is collapsed
                      if (isSectionCollapsed(rowDef.section)) {
                        return acc;
                      }
                      
                      // Skip row if Missing Info Only is enabled and row has no missing data
                      if (showMissingOnly && !rowHasMissingData(rowDef.key)) {
                        return acc;
                      }
                      
                      const hasRelativeData = hasAnyDataForRow(rowDef.key);
                      
                      // Add data row
                      acc.push(
                        <tr
                          key={rowDef.key}
                          className={`${
                            rowDef.isProfitMetric
                              ? 'bg-slate-800/30 font-semibold'
                              : 'hover:bg-slate-800/20'
                          }`}
                        >
                          {/* Row Label */}
                          <td className="sticky left-0 bg-slate-800/50 z-10 px-4 py-3 text-sm text-slate-300 border-r border-slate-700/50 font-medium">
                            {rowDef.label}
                          </td>
                          
                          {/* Supplier Cells */}
                          {visibleQuotes.map((quote) => {
                            const tier = quote.finalCalcTier || 'short';
                            const cell = getMatrixCellValue(quote, rowDef.key, tier as 'short' | 'medium' | 'long');
                            const isMissing = cell.missingReason !== undefined;
                            const isBest = bestWorstSuppliers[rowDef.key]?.best === quote.id;
                            const isWorst = bestWorstSuppliers[rowDef.key]?.worst === quote.id;
                            // Two-level missing logic: relative (attention) vs absolute (neutral)
                            const hasRelative = hasRelativeData && isMissing;
                            const hasAbsolute = isMissing && !hasRelativeData;
                            
                            return (
                              <MatrixCell
                                key={quote.id}
                                quote={quote}
                                rowDef={rowDef}
                                tier={tier as 'short' | 'medium' | 'long'}
                                isMissing={isMissing}
                                hasRelative={hasRelative}
                                hasAbsolute={hasAbsolute}
                                isBest={isBest}
                                isWorst={isWorst}
                              />
                            );
                          })}
                        </tr>
                      );
                      
                      return acc;
                    }, [] as JSX.Element[])}
                  </tbody>
                </table>
              </div>
            </div>
            </DndContext>
          )}
        </div>
      )}

      {/* Ranked View - Hidden per user request */}
      {false && viewMode === 'ranked' && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-700/50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider sticky left-0 bg-slate-900/50 z-20">
                  Supplier
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Accuracy
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800/50" onClick={() => handleSort('finalCalcTier')}>
                  Tier Used
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800/50" onClick={() => handleSort('profitPerUnit')}>
                  Profit/Unit
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800/50" onClick={() => handleSort('marginPct')}>
                  Margin
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800/50" onClick={() => handleSort('roiPct')}>
                  ROI
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {sortedQuotes.map((quote) => {
                const accuracy = getAccuracyState(quote);
                const gradeColors = getGradeColor(quote.supplierGrade);
                const isExpanded = expandedRows.has(quote.id);
                const tierUsed = getTierUsed(quote);
                const moq = getMoqForTier(quote);
                const costPerUnit = getCostPerUnitForTier(quote);
                const moqMissing = isMissing(moq);
                const costPerUnitMissing = isMissing(costPerUnit);
                const profitPerUnitMissing = isMissing(quote.profitPerUnit);
                const marginMissing = isMissing(quote.marginPct);
                const roiMissing = isMissing(quote.roiPct);
                const investmentMissing = isMissing(quote.totalInvestment);
                const grossProfitMissing = isMissing(quote.grossProfit);
                const leadTimeMissing = isMissing(quote.leadTime);
                
                // Check relative data presence
                const moqHasRelative = (columnDataPresence.moq || 0) > 0;
                const costHasRelative = (columnDataPresence.costPerUnit || 0) > 0;
                const profitHasRelative = (columnDataPresence.profitPerUnit || 0) > 0;
                const marginHasRelative = (columnDataPresence.marginPct || 0) > 0;
                const roiHasRelative = (columnDataPresence.roiPct || 0) > 0;
                const investmentHasRelative = (columnDataPresence.totalInvestment || 0) > 0;
                const grossProfitHasRelative = (columnDataPresence.grossProfit || 0) > 0;
                const leadTimeHasRelative = (columnDataPresence.leadTime || 0) > 0;

                // Get completeness for row indicator
                const completeness = accuracy.label;

                return (
                  <>
                    <tr 
                      key={quote.id}
                      className={`hover:bg-slate-800/30 transition-colors ${isExpanded ? 'bg-slate-800/20' : ''}`}
                    >
                      {/* Supplier */}
                      <td 
                        className="px-4 py-3 sticky left-0 bg-slate-800/50 z-10 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRow(quote.id);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRow(quote.id);
                            }}
                            className="flex-shrink-0 hover:bg-slate-700/50 rounded p-0.5 transition-colors"
                            aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-slate-300" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-300" />
                            )}
                          </button>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">
                              {quote.displayName || quote.supplierName || 'Unnamed Supplier'}
                            </span>
                            <div className={`px-2 py-0.5 rounded-md border text-xs font-semibold ${gradeColors.bg} ${gradeColors.border} ${gradeColors.text}`}>
                              {quote.supplierGrade || 'Pending'}
                            </div>
                            <div className={`px-2 py-0.5 rounded-md border text-xs ${accuracy.bgColor} ${accuracy.borderColor}`}>
                              <span className={accuracy.textColor}>{completeness}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Accuracy */}
                      <td className="px-4 py-3">
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${accuracy.bgColor} ${accuracy.borderColor}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${accuracy.textColor.replace('text-', 'bg-')}`}></div>
                          <span className={`text-xs font-medium ${accuracy.textColor}`}>{accuracy.label}</span>
                        </div>
                      </td>

                      {/* Tier Used */}
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {tierUsed}
                      </td>

                      {/* Profit/Unit */}
                      <td className={`px-4 py-3 text-sm ${getMissingCellStyle(profitPerUnitMissing, profitHasRelative)}`}>
                        {profitPerUnitMissing ? (
                          <span className="flex items-center gap-1" title="Missing: Profit/Unit">
                            — <AlertCircle className="w-3 h-3" />
                          </span>
                        ) : (
                          formatCurrency(quote.profitPerUnit!)
                        )}
                      </td>

                      {/* Margin */}
                      <td className={`px-4 py-3 text-sm ${getMissingCellStyle(marginMissing, marginHasRelative)}`}>
                        {marginMissing ? (
                          <span className="flex items-center gap-1" title="Missing: Margin">
                            — <AlertCircle className="w-3 h-3" />
                          </span>
                        ) : (
                          `${quote.marginPct!.toFixed(1)}%`
                        )}
                      </td>

                      {/* ROI */}
                      <td className={`px-4 py-3 text-sm ${getMissingCellStyle(roiMissing, roiHasRelative)}`}>
                        {roiMissing ? (
                          <span className="flex items-center gap-1" title="Missing: ROI">
                            — <AlertCircle className="w-3 h-3" />
                          </span>
                        ) : (
                          `${quote.roiPct!.toFixed(1)}%`
                        )}
                      </td>
                    </tr>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <tr key={`${quote.id}-expanded`} className="bg-slate-700/30">
                        <td colSpan={6} className="p-0 border-t-2 border-slate-500/60">
                          <div className="p-4 space-y-4 bg-slate-700/20">
                            {/* Scenario Details Section */}
                            <div className="bg-slate-800/70 rounded-lg border border-slate-600/50 p-4 shadow-lg">
                              <div className="mb-3">
                                <h4 className="text-sm font-semibold text-white mb-1">
                                  Scenario Details — {tierUsed}
                                </h4>
                                <p className="text-xs text-slate-400">
                                  Based on selected tier
                                </p>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {/* MOQ */}
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">MOQ</div>
                                  <div className={`text-sm font-medium ${moqMissing ? getMissingCellStyle(moqMissing, moqHasRelative) : 'text-white'}`}>
                                    {moqMissing ? (
                                      <span className="flex items-center gap-1" title="Missing: MOQ for chosen tier">
                                        — <AlertCircle className="w-3 h-3" />
                                      </span>
                                    ) : (
                                      moq?.toLocaleString()
                                    )}
                                  </div>
                                </div>

                                {/* Cost/Unit */}
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">Cost/Unit</div>
                                  <div className={`text-sm font-medium ${costPerUnitMissing ? getMissingCellStyle(costPerUnitMissing, costHasRelative) : 'text-white'}`}>
                                    {costPerUnitMissing ? (
                                      <span className="flex items-center gap-1" title="Missing: Cost/Unit for chosen tier">
                                        — <AlertCircle className="w-3 h-3" />
                                      </span>
                                    ) : (
                                      formatCurrency(costPerUnit!)
                                    )}
                                  </div>
                                </div>

                                {/* Total Investment */}
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">Total Investment</div>
                                  <div className={`text-sm font-medium ${investmentMissing ? getMissingCellStyle(investmentMissing, investmentHasRelative) : 'text-white'}`}>
                                    {investmentMissing ? (
                                      <span className="flex items-center gap-1" title="Missing: Total Investment">
                                        — <AlertCircle className="w-3 h-3" />
                                      </span>
                                    ) : (
                                      formatCurrency(quote.totalInvestment!)
                                    )}
                                  </div>
                                </div>

                                {/* Total Gross Profit */}
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">Total Gross Profit</div>
                                  <div className={`text-sm font-medium ${grossProfitMissing ? getMissingCellStyle(grossProfitMissing, grossProfitHasRelative) : 'text-emerald-400'}`}>
                                    {grossProfitMissing ? (
                                      <span className="flex items-center gap-1" title="Missing: Total Gross Profit">
                                        — <AlertCircle className="w-3 h-3" />
                                      </span>
                                    ) : (
                                      formatCurrency(quote.grossProfit!)
                                    )}
                                  </div>
                                </div>

                                {/* Lead Time */}
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">Lead Time</div>
                                  <div className={`text-sm font-medium ${leadTimeMissing ? getMissingCellStyle(leadTimeMissing, leadTimeHasRelative) : 'text-white'}`}>
                                    {leadTimeMissing ? (
                                      <span className="flex items-center gap-1" title="Missing: Lead Time">
                                        — <AlertCircle className="w-3 h-3" />
                                      </span>
                                    ) : (
                                      quote.leadTime || '—'
                                    )}
                                  </div>
                                </div>

                                {/* Sample Ordered */}
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">Sample Ordered</div>
                                  <div className="text-sm font-medium text-white">
                                    {quote.sampleOrdered === true || quote.sampleOrdered === 'Yes' ? 'Yes' : 'No'}
                                  </div>
                                </div>

                                {/* Trade Assurance */}
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">Trade Assurance</div>
                                  <div className="text-sm font-medium text-white">
                                    {quote.alibabaTradeAssurance === 'Yes' ? 'Yes' : 'No'}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Cost Stack Breakdown */}
                            <div className="bg-slate-800/70 rounded-lg border border-slate-600/50 p-4 shadow-lg">
                              <h4 className="text-sm font-semibold text-white mb-3">Cost Stack Breakdown</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <div className="text-xs text-slate-400 mb-1">Target Sales Price</div>
                                <div className="text-sm font-medium text-white">
                                  {hubData?.targetSalesPrice 
                                    ? formatCurrency(hubData.targetSalesPrice)
                                    : productData?.price 
                                    ? formatCurrency(productData.price)
                                    : quote.salesPrice 
                                    ? formatCurrency(quote.salesPrice)
                                    : '—'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-400 mb-1">Cost/Unit (Used)</div>
                                <div className="text-sm font-medium text-white">
                                  {costPerUnitMissing ? '—' : formatCurrency(costPerUnit!)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-400 mb-1">Shipping Component</div>
                                <div className="text-sm font-medium text-white">
                                  {(() => {
                                    const freight = quote.freightCostPerUnit ?? quote.ddpShippingPerUnit ?? 0;
                                    const duty = quote.dutyCostPerUnit ?? 0;
                                    const tariff = quote.tariffCostPerUnit ?? 0;
                                    const total = freight + duty + tariff;
                                    if (total > 0) {
                                      return formatCurrency(total);
                                    }
                                    const basic = quote.freightDutyCost ?? 0;
                                    return basic > 0 ? formatCurrency(basic) : '—';
                                  })()}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-400 mb-1">FBA Fee</div>
                                <div className="text-sm font-medium text-white">
                                  {quote.fbaFeePerUnit ? formatCurrency(quote.fbaFeePerUnit) : '—'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-400 mb-1">Referral Fee</div>
                                <div className="text-sm font-medium text-white">
                                  {quote.referralFee ? formatCurrency(quote.referralFee) : '—'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-400 mb-1">Total Cost</div>
                                <div className="text-sm font-medium text-white">
                                  {quote.landedUnitCost ? formatCurrency(quote.landedUnitCost) : '—'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-slate-400 mb-1">Profit/Unit</div>
                                <div className="text-sm font-medium text-emerald-400">
                                  {profitPerUnitMissing ? '—' : formatCurrency(quote.profitPerUnit!)}
                                </div>
                              </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Comparison Chart - Hidden with ranked view */}
      {false && sortedQuotes.length > 0 && viewMode === 'ranked' && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Comparison: {getMetricLabel()}</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis 
                dataKey="name" 
                stroke="#94a3b8"
                angle={-45}
                textAnchor="end"
                height={100}
                fontSize={12}
              />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: '#f1f5f9'
                }}
                formatter={(value: any, name: string, props: any) => {
                  if (props.payload.isMissing) {
                    return ['Missing data', ''];
                  }
                  if (compareMetric === 'profitPerUnit' || compareMetric === 'totalGrossProfit' || compareMetric === 'totalInvestment') {
                    return [formatCurrency(value), getMetricLabel()];
                  }
                  return [`${value.toFixed(1)}%`, getMetricLabel()];
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={getBarColor(entry)}
                    opacity={entry.isMissing ? 0.3 : 1}
                    stroke={entry.isMissing ? '#ef4444' : 'none'}
                    strokeWidth={entry.isMissing ? 2 : 0}
                    strokeDasharray={entry.isMissing ? '5 5' : '0'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
