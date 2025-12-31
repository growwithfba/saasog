'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  PieChart, Pie, Cell, ResponsiveContainer, Legend 
} from 'recharts';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { calculateScore, getCompetitorStrength, getCompetitionLevel, MetricScoring } from '../../utils/scoring';
import { supabase } from '../../utils/supabaseClient';
import MarketVisuals from './MarketVisuals';
import { KeepaAnalysis } from '../Keepa/KeepaAnalysis';
import { KeepaAnalysisResult } from '../Keepa/KeepaTypes';
import {
  selectKeepaResults,
  selectKeepaStatus,
  selectKeepaError,
  selectTokenBalance,
  setKeepaData,
  startAnalysis,
  setError
} from '../../store/keepaSlice';
import type { AppDispatch } from '../../store';
import { TrendingUp, Users, Loader2, CheckCircle2, BarChart3, Calendar, Package, BarChart2, Info, X, Filter, ChevronDown, ChevronUp, SlidersHorizontal, FileText, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { saveSubmissionToLocalStorage, getUserSubmissionsFromLocalStorage } from '@/utils/storageUtils';

interface Competitor {
  asin: string;
  title: string;
  monthlyRevenue: number;
  monthlySales: number;
  reviews?: number | string;
  rating?: number | string;
  score?: number | string;
  fulfillment?: 'FBA' | 'FBM' | 'Amazon';
  fulfillmentMethod?: string;
  fulfilledBy?: string;
  marketShare: number;
  dateFirstAvailable?: string;
  // Add all new fields that might come from CSV
  brand?: string;
  category?: string;
  price?: number;
  bsr?: number;
  variations?: number | string;
  productType?: string;
  sellerCount?: number;
  grossProfit?: number;
  activeSellers?: number;
  productWeight?: string | number;
  sizeTier?: string;
  soldBy?: string;
}

interface ProductVettingResultsProps {
  competitors: Competitor[];
  distributions?: {
    age: {
      mature: number;
      established: number;
      growing: number;
      new: number;
      na?: number;
    };
    fulfillment: {
      fba: number;
      fbm: number;
      amazon: number;
      na?: number;
    };
  };
  // New props for auto-initialized Keepa analysis
  keepaResults?: KeepaAnalysisResult[];
  marketScore?: {
    score?: number;
    status: string;
  };
  analysisComplete?: boolean;
  productName?: string;
  alreadySaved?: boolean;  // Add this new prop to check if data was already saved
  onResetCalculation?: () => void;  // Add callback for reset calculation
  isRecalculating?: boolean;  // Add loading state for recalculation
}

// Add helper function for age calculation
const calculateAge = (dateStr: string): number => {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30)); // Age in months
};

const calculateDistributions = (competitors) => {
  const total = competitors.length || 1;
  
  // Initialize with default values
  const ageRanges = {
    new: 0,
    growing: 0,
    established: 0,
    mature: 0
  };

  // Fulfillment Methods
  const fulfillmentRanges = {
    fba: 0,
    fbm: 0,
    amazon: 0
  };

  
  // Now calculate actual counts if we have competitors
  if (competitors && competitors.length > 0) {
    // Market Age Distribution
    competitors.forEach(c => {
      if (!c.age && c.dateFirstAvailable) {
        c.age = calculateAge(c.dateFirstAvailable);
      }
      
      if (c.age <= 6) ageRanges.new++;
      else if (c.age > 6 && c.age <= 12) ageRanges.growing++;
      else if (c.age > 12 && c.age <= 18) ageRanges.established++;
      else if (c.age > 18) ageRanges.mature++;
    });

    // Fulfillment Methods
    competitors.forEach(c => {
      const method = (c.fulfillment || '').toLowerCase();
      if (method.includes('fba')) fulfillmentRanges.fba++;
      else if (method.includes('fbm')) fulfillmentRanges.fbm++;
      else if (method.includes('amazon')) fulfillmentRanges.amazon++;
    });

  }

  // Convert to percentages
  const calculatePercentages = (ranges, total = 1) => {
    return Object.entries(ranges).reduce((acc, [key, value]) => {
      return {
        ...acc,
        [key]: (Number(value) / total) * 100
      };
    }, {});
  };

  return {
    age: calculatePercentages(ageRanges, total),
    fulfillment: calculatePercentages(fulfillmentRanges, total)
  };
};

// Updated color constants with consistent definitions for all categories
const COLORS = {
  // Age distribution colors
  mature: '#10B981',     // Emerald
  established: '#3B82F6', // Blue
  growing: '#F59E0B',    // Amber
  new: '#EF4444',        // Red
  
  // Fulfillment colors
  fba: '#EF4444',        // Red
  fbm: '#10B981',        // Green
  amazon: '#F59E0B',     // Orange/Amber
  
  na: '#8B5CF6',           // Purple
  
  // Generic colors
  success: '#10B981',      // Emerald
  primary: '#3B82F6',      // Blue
  warning: '#F59E0B',      // Amber
  danger: '#EF4444',        // Red
  purple: '#8B5CF6'         // Purple
};

const calculateMarketMaturityScore = (competitors) => {
  if (!competitors?.length) return 0;
  const distributions = calculateDistributions(competitors);
  
  // Weight the score based on the distribution of ages
  return Math.round(
    (safeGet(distributions?.age, 'mature', 0) * 1.0 +
     safeGet(distributions?.age, 'established', 0) * 0.7 +
     safeGet(distributions?.age, 'growing', 0) * 0.4 + 
     safeGet(distributions?.age, 'new', 0) * 0.1)
  );
};

const getMarketAgeData = (competitors) => {
  return competitors.map(competitor => ({
    title: competitor.title.substring(0, 20) + '...',
    age: Math.round(Math.random() * 24) // Replace with actual age calculation
  }));
};

// Add these helper functions at the component level
const getDominantCategory = (distribution: Record<string, number>): string => {
  const sorted = Object.entries(distribution)
    .sort(([,a], [,b]) => b - a);
  return sorted[0]?.[0] || 'N/A';
};

// Helper function to safely parse numeric values
const safeParseNumber = (value: string | number | undefined): number => {
  if (typeof value === 'undefined') return 0;
  if (typeof value === 'number') return value;
  return parseFloat(value) || 0;
};

// Helper to safely access distribution properties
const safeGet = (obj: any, key: string, defaultValue: number = 0): number => {
  return typeof obj === 'object' && obj !== null && key in obj ? 
    obj[key] : defaultValue;
};

const calculateMaturity = (distribution: Record<string, number> = {}): number => {
  const mature = safeGet(distribution, 'mature', 0);
  const established = safeGet(distribution, 'established', 0);
  const growing = safeGet(distribution, 'growing', 0);
  const newPct = safeGet(distribution, 'new', 0);
  
  return Math.round(
    (mature * 1.0 +
     established * 0.7 +
     growing * 0.4 +
     newPct * 0.1)
  );
};

// Add this custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
        <p className="text-slate-300 font-medium">{payload[0].name}</p>
        <p className="text-emerald-400 font-semibold">
          {payload[0].value.toFixed(1)}%
        </p>
      </div>
    );
  }
  return null;
};

// Add these helper functions at the component level
const getPrimaryAge = (age = {}) => {
  if (!age) return 'Unknown';
  const sorted = Object.entries(age || {})
    .filter(([key]) => key !== 'na') // Exclude N/A from primary calculation
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  return sorted[0] ? sorted[0][0].charAt(0).toUpperCase() + sorted[0][0].slice(1).toLowerCase() : 'Unknown';
};

const getMaturityLevel = (age: Record<string, number> = {}) => {
  if (!age) return '0.0';
  return ((age.mature || 0) + (age.established || 0)).toFixed(1);
};

const getPrimaryMethod = (fulfillment: Record<string, number> = {}) => {
  if (!fulfillment) return 'Unknown';
  const sorted = Object.entries(fulfillment || {})
    .filter(([key]) => key !== 'na')
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  return sorted[0] ? sorted[0][0].toUpperCase() : 'Unknown';
};

const getQualityLevel = (quality = {}) => {
  if (!quality) return 'Unknown';
  const sorted = Object.entries(quality || {})
    .filter(([key]) => key !== 'na')
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  return sorted[0] ? sorted[0][0].charAt(0).toUpperCase() + sorted[0][0].slice(1).toLowerCase() : 'Unknown';
};

// Custom label renderer
const renderCustomLabel = ({
  cx,
  cy,
  midAngle,
  outerRadius,
  value,
  name
}: any) => {
  const radius = outerRadius * 1.2;
  const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
  const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));
  
  return (
    <text
      x={x}
      y={y}
      fill="#94a3b8"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-xs"
    >
      {`${name} (${value.toFixed(1)}%)`}
    </text>
  );
};

// Add a SubmissionData interface to define the shape of the object
interface SubmissionData {
  userId: string;
  id: string;
  title: string;
  score: number;
  status: string;
  productData: {
    competitors: Competitor[];
    distributions: any;
  };
  keepaResults: any[];
  marketScore: {
    score?: number;
    status: string;
  };
  metrics: any;
  marketInsights: string;
  fromSaveCalculation: boolean;
  updatedAt: string;
  createdAt?: string;
}

export const ProductVettingResults: React.FC<{
  onlyReadMode?: boolean;
  competitors: Competitor[];
  distributions?: any;
  keepaResults?: KeepaAnalysisResult[];
  marketScore: { score: number; status: string };
  analysisComplete?: boolean;
  productName?: string;
  alreadySaved?: boolean;
  onResetCalculation?: () => void;
  isRecalculating?: boolean;
  onCompetitorsUpdated?: (updatedCompetitors: Competitor[]) => void;
}> = ({ 
  onlyReadMode = false,
  competitors = [],
  distributions: propDistributions,
  keepaResults = [],
  marketScore = { score: 0, status: 'Assessment Unavailable' },
  analysisComplete = false,
  productName = 'Untitled Analysis',
  alreadySaved = false,
  onResetCalculation,
  isRecalculating = false,
  onCompetitorsUpdated
}) => {
  const [sortKey, setSortKey] = useState('score');
  const [sortDirection, setSortDirection] = useState('asc');
  const [visibleColumns, setVisibleColumns] = useState(['asin', 'price', 'reviews', 'rating', 'sales', 'revenue', 'score']);
  const [showScatterPlot, setShowScatterPlot] = useState(false);
  const [showAllCompetitors, setShowAllCompetitors] = useState(false);
  const [showCalculationModal, setShowCalculationModal] = useState(false);
  // Add state for competitor removal and local competitor management
  const [localCompetitors, setLocalCompetitors] = useState(competitors);
  const [removedCompetitors, setRemovedCompetitors] = useState<Set<string>>(new Set());
  const [selectedForRemoval, setSelectedForRemoval] = useState<Set<string>>(new Set());
  const [showRecalculatePrompt, setShowRecalculatePrompt] = useState(false);
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();

  // Update local state when props change
  useEffect(() => {
    console.log('ProductVettingResults: Competitors prop changed:', competitors.length, 'competitors');
    setLocalCompetitors(competitors);
    // Reset removed competitors when new data comes in
    setRemovedCompetitors(new Set());
    setSelectedForRemoval(new Set());
  }, [competitors]);

  // Debugging useEffect to log the data
  useEffect(() => {
    if (competitors.length > 0 || keepaResults?.length > 0) {
      console.log('ProductVettingResults - Data for MarketVisuals:', {
        competitorsCount: competitors.length,
        competitorSample: competitors.slice(0, 2),
        keepaResultsCount: keepaResults?.length || 0,
        keepaResultsSample: (keepaResults || []).slice(0, 2)
      });
    }
  }, [competitors, keepaResults]);
  
  const [activeTab, setActiveTab] = useState('overview');
  const [isClient, setIsClient] = useState(false);
  const [showAllMarketShare, setShowAllMarketShare] = useState(false);
  
  // Add saving state
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  
  // Add sorting and column visibility state
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'ascending' | 'descending'}>({
    key: 'monthlySales',
    direction: 'descending'
  });
  
  // Function to toggle competitor selection for removal
  const handleToggleCompetitorSelection = (asin: string) => {
    const newSelectedForRemoval = new Set(selectedForRemoval);
    if (newSelectedForRemoval.has(asin)) {
      newSelectedForRemoval.delete(asin);
    } else {
      newSelectedForRemoval.add(asin);
    }
    setSelectedForRemoval(newSelectedForRemoval);
  };

  // Function to remove selected competitors and trigger recalculation
  const handleRemoveSelectedCompetitors = async () => {
    const newRemovedCompetitors = new Set([...removedCompetitors, ...selectedForRemoval]);
    setRemovedCompetitors(newRemovedCompetitors);
    setSelectedForRemoval(new Set());
    
    // Filter out removed competitors and call parent callback
    const activeCompetitors = localCompetitors.filter(comp => !newRemovedCompetitors.has(comp.asin));
    
    console.log('ProductVettingResults: Removing competitors', {
      originalCount: localCompetitors.length,
      removedCount: newRemovedCompetitors.size,
      activeCount: activeCompetitors.length,
      hasCallback: !!onCompetitorsUpdated
    });
    
    if (onCompetitorsUpdated) {
      // Let parent handle the full recalculation pipeline
      console.log('ProductVettingResults: Calling onCompetitorsUpdated with', activeCompetitors.length, 'competitors');
      onCompetitorsUpdated(activeCompetitors);
    } else if (onResetCalculation) {
      // Fallback to reset calculation for submission pages
      console.log('ProductVettingResults: Calling onResetCalculation fallback');
      onResetCalculation();
    }
    
    setShowRecalculatePrompt(false);
  };

  // Function to restore a removed competitor
  const handleRestoreCompetitor = (asin: string) => {
    const newRemovedCompetitors = new Set(removedCompetitors);
    newRemovedCompetitors.delete(asin);
    setRemovedCompetitors(newRemovedCompetitors);
    if (newRemovedCompetitors.size === 0) {
      setShowRecalculatePrompt(false);
    }
  };

  // Function to clear all selections
  const handleClearSelections = () => {
    setSelectedForRemoval(new Set());
  };



  // Function to handle reset calculation
  const handleResetCalculation = () => {
    if (onResetCalculation) {
      // Call the parent's reset callback to trigger recalculation
      onResetCalculation();
    } else {
      // Fallback: Navigate back to dashboard if no callback provided
      window.location.href = '/vetting';
    }
  };
  
  // Add sorting and column visibility state
  const [columnVisibility, setColumnVisibility] = useState<{[key: string]: boolean}>({
    // Default visible columns
    no: true,
    asin: true,
    brand: true,
    title: true,
    category: true,
    price: true,
    bsr: true,
    score: true,
    monthlySales: true,
    monthlyRevenue: true,
    rating: true,
    reviews: true,
    fulfillment: true,
    dateFirstAvailable: true,
    // Hidden by default
    variations: false,
    productType: false,
    sellerCount: false,
    grossProfit: false,
    activeSellers: false,
    productWeight: false,
    sizeTier: false,
    soldBy: false
  });
  
  // Define market entry UI status based on provided market score
  const marketEntryUIStatus = marketScore.status === 'PASS' ? 'PASS' : 
                              marketScore.status === 'RISKY' ? 'RISKY' : 
                              'FAIL';
  
  // Update distributions state to use props
  const [distributions, setDistributions] = useState(propDistributions || {
    age: { mature: 0, established: 0, growing: 0, new: 0, na: 0 },
    fulfillment: { fba: 0, fbm: 0, amazon: 0, na: 0 }
  });
  
  // Filter out removed competitors first - this is the main competitors array to use
  const activeCompetitors = useMemo(() => {
    return localCompetitors.filter(competitor => !removedCompetitors.has(competitor.asin));
  }, [localCompetitors, removedCompetitors]);

  // Sort competitors based on the sort configuration
  const sortedCompetitors = useMemo(() => {
    // Create a copy of the active competitors array to sort
    const sortableCompetitors = [...activeCompetitors];
    
    // Apply sorting based on current sort configuration
    if (sortConfig.key) {
      sortableCompetitors.sort((a: any, b: any) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        
        // Handle special case for null/undefined values
        if (aVal === null || aVal === undefined || aVal === '') {
          if (bVal === null || bVal === undefined || bVal === '') return 0;
          return 1;
        }
        if (bVal === null || bVal === undefined || bVal === '') return -1;
        
        // Convert to numbers for numeric fields
        const numericFields = ['price', 'monthlySales', 'monthlyRevenue', 'rating', 'reviews', 'score', 'bsr', 'marketShare'];
        if (numericFields.includes(sortConfig.key)) {
          aVal = parseFloat(aVal) || 0;
          bVal = parseFloat(bVal) || 0;
        }
        
        // Convert to lowercase for string comparison
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();
        
        // Compare values based on direction
        if (aVal < bVal) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aVal > bVal) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    
    return sortableCompetitors;
  }, [activeCompetitors, sortConfig]);
  
  // Function to handle sorting when a column header is clicked
  const handleSort = (key: string) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'ascending' 
        ? 'descending' 
        : 'ascending'
    }));
  };
  
  // Function to toggle column visibility
  const toggleColumnVisibility = (key: string) => {
    setColumnVisibility(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Set isClient to true after component mounts
  React.useEffect(() => {
    setIsClient(true);
    
    // Update the distributions when props change
    if (propDistributions) {
      setDistributions(propDistributions);
    }
  }, [propDistributions]);

  // Helper functions for color selection
  const getCompetitorCountColor = (count: number): string => {
    if (count < 10) return 'text-emerald-400 border-emerald-500/50'; // Very Low - Great
    if (count < 15) return 'text-green-400 border-green-500/50'; // Low - Good
    if (count < 20) return 'text-blue-400 border-blue-500/50'; // Average - Decent
    if (count < 30) return 'text-amber-400 border-amber-500/50'; // High - Caution
    return 'text-red-400 border-red-500/50'; // Very High - Bad
  };
  
  const getCompetitorCountMessage = (count: number): string => {
    if (count < 10) return 'LOW'; // Great
    if (count < 15) return 'MODERATE'; // Good
    if (count < 20) return 'AVERAGE'; // Decent
    if (count < 30) return 'HIGH'; // Caution
    return 'VERY HIGH'; // Bad
  };
  
  const getRevenuePerCompetitorColor = (revenue: number): string => {
    if (revenue >= 12000) return 'text-emerald-400 border-emerald-500/50'; // Very High - Excellent
    if (revenue >= 8000) return 'text-green-400 border-green-500/50'; // High - Very Good
    if (revenue >= 5000) return 'text-blue-400 border-blue-500/50'; // Good - Decent
    if (revenue >= 4000) return 'text-yellow-400 border-yellow-500/50'; // Average - Acceptable
    if (revenue >= 3000) return 'text-amber-400 border-amber-500/50'; // Low - Concern
    return 'text-red-400 border-red-500/50'; // Very Low - Poor
  };
  
  const getRevenuePerCompetitorMessage = (revenue: number): string => {
    if (revenue >= 12000) return 'EXCELLENT'; // Very High 
    if (revenue >= 8000) return 'VERY GOOD'; // High
    if (revenue >= 5000) return 'GOOD'; // Good
    if (revenue >= 4000) return 'AVERAGE'; // Average
    if (revenue >= 3000) return 'LOW'; // Low
    return 'VERY LOW'; // Very Low
  };
  
  const getRevenueColor = (revenue: number): string => {
    if (revenue >= 12000) return 'text-emerald-400 border-emerald-500/50'; // Very High - Excellent
    if (revenue >= 8000) return 'text-green-400 border-green-500/50'; // High - Very Good
    if (revenue >= 5000) return 'text-blue-400 border-blue-500/50'; // Good - Decent
    if (revenue >= 4000) return 'text-yellow-400 border-yellow-500/50'; // Average - Acceptable
    if (revenue >= 3000) return 'text-amber-400 border-amber-500/50'; // Low - Concern
    return 'text-red-400 border-red-500/50'; // Very Low - Poor
  };
  
  const getRevenueMessage = (revenue: number): string => {
    if (revenue >= 12000) return 'EXCELLENT'; // Very High 
    if (revenue >= 8000) return 'VERY GOOD'; // High
    if (revenue >= 5000) return 'GOOD'; // Good
    if (revenue >= 4000) return 'AVERAGE'; // Average
    if (revenue >= 3000) return 'LOW'; // Low
    return 'VERY LOW'; // Very Low
  };

  // Helper functions for status styles
  const getBorderColorClass = (status: 'PASS' | 'FAIL' | 'RISKY') => ({
    PASS: 'border-emerald-500/50',
    RISKY: 'border-amber-500/50',
    FAIL: 'border-red-500/50'
  }[status]);

  const getGlowColorClass = (status: 'PASS' | 'FAIL' | 'RISKY') => ({
    PASS: 'shadow-emerald-500/20',
    RISKY: 'shadow-amber-500/20',
    FAIL: 'shadow-red-500/20'
  }[status]);

  const getTextColorClass = (status: 'PASS' | 'FAIL' | 'RISKY') => ({
    PASS: 'text-emerald-400',
    RISKY: 'text-amber-400',
    FAIL: 'text-red-400'
  }[status]);

  const getAssessmentSummary = (status: string): string => {
    switch (status) {
      case 'PASS':
        return 'Great Opportunity';
      case 'RISKY':
        return 'Proceed with Caution';
      case 'FAIL':
        return 'Not Recommended';
      default:
        return 'Assessment Unavailable';
    }
  };

  // Generate a comprehensive market assessment message based on key metrics
  const generateMarketAssessmentMessage = (): string => {
    // Calculate key metrics
    const totalMarketCap = activeCompetitors.reduce((sum, comp) => sum + (comp?.monthlyRevenue || 0), 0);
    const revenuePerCompetitor = activeCompetitors.length ? totalMarketCap / activeCompetitors.length : 0;
    const competitorCount = activeCompetitors.length;
    
    // Calculate total reviews
    const totalReviews = activeCompetitors.reduce((sum, comp) => 
      sum + (comp.reviews ? parseFloat(comp.reviews.toString()) : 0), 0);
    
    // Get stability metrics from Keepa data
    const validResults = keepaResults?.filter(result => result?.analysis?.bsr?.stability !== undefined) || [];
    const avgBSRStability = validResults.length 
      ? validResults.reduce((sum, result) => sum + (result.analysis.bsr.stability || 0), 0) / validResults.length
      : 0.5;
    
    const validPriceResults = keepaResults?.filter(result => result?.analysis?.price?.stability !== undefined) || [];
    const avgPriceStability = validPriceResults.length 
      ? validPriceResults.reduce((sum, result) => sum + (result.analysis.price.stability || 0), 0) / validPriceResults.length
      : 0.5;
    
    // Get top 5 competitors by revenue
    const top5 = [...activeCompetitors]
      .sort((a, b) => b.monthlySales - a.monthlySales)
      .slice(0, 5);
    
    // Calculate average reviews and rating for top 5
    const avgReviews = top5.reduce((sum, comp) => 
      sum + (comp.reviews ? parseFloat(comp.reviews.toString()) : 0), 0) / (top5.length || 1);
    
    const validRatings = top5.filter(comp => comp.rating);
    const avgRating = validRatings.length ? 
      validRatings.reduce((sum, comp) => sum + (comp.rating ? parseFloat(comp.rating.toString()) : 0), 0) / validRatings.length
      : 0;
      
    // Calculate average age of listings
    const competitorsWithAge = top5.filter(comp => comp.dateFirstAvailable);
    const avgAgeMonths = competitorsWithAge.length ? 
      competitorsWithAge.reduce((sum, comp) => sum + calculateAge(comp.dateFirstAvailable || ''), 0) / competitorsWithAge.length
      : 0;
      
    // Calculate competitor strength distribution
    const competitorStrengths = activeCompetitors.map(c => {
      const score = parseFloat(calculateScore(c));
      return getCompetitorStrength(score).label;
    });
    
    const strongCount = competitorStrengths.filter(s => s === 'STRONG').length;
    const decentCount = competitorStrengths.filter(s => s === 'DECENT').length;
    const weakCount = competitorStrengths.filter(s => s === 'WEAK').length;
    
    // Calculate market concentration
    const top5MarketShare = top5.reduce((sum, comp) => sum + (comp.marketShare || 0), 0);
    const top5ReviewShare = totalReviews > 0 ? 
      top5.reduce((sum, comp) => sum + (comp.reviews ? parseFloat(comp.reviews.toString()) : 0), 0) / totalReviews * 100 : 0;
    
    // Generate base message based on key factors
    let message = '';
    
    // Primary factors: Revenue per Competitor and Competitor Count
    if (revenuePerCompetitor >= 12000 && competitorCount < 10) {
      message = "Exceptional market with high revenue potential and manageable competition level. Opportunity to capture significant market share with the right product.";
    } else if (revenuePerCompetitor >= 8000 && competitorCount < 15) {
      message = "Strong market with good revenue potential. Competitive landscape is favorable for new entrants with quality offerings.";
    } else if (revenuePerCompetitor >= 5000 && competitorCount < 20) {
      message = "Solid market with balanced competition. Good opportunity with moderate barriers to entry.";
    } else if (revenuePerCompetitor < 3000 && competitorCount > 30) {
      message = "Challenging market with high competition density. Revenue potential may be limited by market saturation.";
    } else if (revenuePerCompetitor < 4000 && competitorCount > 20) {
      message = "Difficult market with below average revenue and significant competition. Consider differentiation strategies.";
    } else if (revenuePerCompetitor >= 5000 && competitorCount > 20) {
      message = "Mixed market with good revenue indicators but crowded competitive landscape. Product differentiation essential.";
    } else if (revenuePerCompetitor < 4000 && competitorCount < 15) {
      message = "Niche market with modest revenue potential but limited competition. May offer targeted opportunity.";
    } else {
      message = "Average market with moderate revenue potential and competition. Success will depend on execution quality.";
    }
    
    // Secondary factors: Add insights about other key metrics
    const secondaryInsights = [];
    
    // BSR Stability insight
    if (avgBSRStability >= 0.8) {
      secondaryInsights.push("BSR shows high stability");
    } else if (avgBSRStability <= 0.4) {
      secondaryInsights.push("BSR fluctuates significantly");
    }
    
    // Price stability insight  
    if (avgPriceStability >= 0.8) {
      secondaryInsights.push("pricing is consistently stable");
    } else if (avgPriceStability <= 0.4) {
      secondaryInsights.push("market has unpredictable pricing");
    }
    
    // Rating insight
    if (avgRating >= 4.7) {
      secondaryInsights.push("competitors maintain excellent ratings");
    } else if (avgRating < 4.0) {
      secondaryInsights.push("ratings show room for improvement");
    }
    
    // Listing age insight
    if (avgAgeMonths > 24) {
      secondaryInsights.push("listings are well-established");
    } else if (avgAgeMonths < 6) {
      secondaryInsights.push("market contains mostly new listings");
    }
    
    // Competitor quality insight
    if (strongCount > competitors.length * 0.5) {
      secondaryInsights.push("most competitors are high quality");
    } else if (weakCount > competitors.length * 0.5) {
      secondaryInsights.push("many competitors show weaknesses");
    }
    
    // Market concentration insight
    if (top5MarketShare > 80) {
      secondaryInsights.push("top 5 competitors dominate market share");
    } else if (top5ReviewShare > 80) {
      secondaryInsights.push("review presence is concentrated among leaders");
    }
    
    // Combine the message with secondary insights if available
    if (secondaryInsights.length > 0) {
      // Pick 1-2 insights that are most relevant/interesting to avoid overcrowding
      const selectedInsights = secondaryInsights.slice(0, Math.min(2, secondaryInsights.length));
      message += " " + selectedInsights.join(" and ") + ".";
    }
    
    return message;
  };

  // Safe calculation wrapper
  const safeCalculate = (calculation: () => number, defaultValue: number = 0): number => {
    try {
      return calculation();
    } catch (error) {
      console.error('Calculation error:', error);
      return defaultValue;
    }
  };
  
  // Define all the render helper functions
  
  const renderLoadingState = () => {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            Loading Market Analysis
          </h3>
          <p className="text-slate-400">
            Retrieving data and calculating scores...
          </p>
        </div>
      </div>
    );
  };

  // Render header metrics section
  const renderHeaderMetrics = () => {
    const competitorColorClass = getCompetitorCountColor(activeCompetitors.length);
    const competitionLevel = getCompetitionLevel(activeCompetitors);
    
    // Calculate total market cap
    const totalMarketCap = activeCompetitors.reduce((sum, comp) => sum + (comp?.monthlyRevenue || 0), 0);
    
    // Calculate revenue per competitor
    const revenuePerCompetitor = activeCompetitors.length ? 
      totalMarketCap / activeCompetitors.length : 0;
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Market Cap Card */}
        <div className={`bg-white/90 dark:bg-slate-800/50 rounded-2xl border-2 border-emerald-500/50 p-6`}>
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Market Cap</h2>
            <BarChart3 className="w-8 h-8 text-gray-600 dark:text-slate-400" strokeWidth={1.5} />
          </div>
          <div className="text-3xl font-bold text-emerald-400">
            {formatCurrency(totalMarketCap)}
          </div>
        </div>

        {/* Revenue per Competitor Card */}
        <div className={`bg-white/90 dark:bg-slate-800/50 rounded-2xl border-2 ${getRevenuePerCompetitorColor(revenuePerCompetitor)} p-6`}>
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Revenue per Competitor</h2>
            <TrendingUp className="w-8 h-8 text-gray-600 dark:text-slate-400" strokeWidth={1.5} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-3xl font-bold ${getRevenuePerCompetitorColor(revenuePerCompetitor)}`}>
              {formatCurrency(revenuePerCompetitor)}
            </span>
            <span className={`text-sm font-semibold rounded-md px-2 py-1 ${
              revenuePerCompetitor >= 8000 
                ? 'bg-emerald-900/30 text-emerald-400'
                : revenuePerCompetitor >= 5000
                ? 'bg-blue-900/30 text-blue-400'
                : revenuePerCompetitor >= 3000
                ? 'bg-amber-900/30 text-amber-400'
                : 'bg-red-900/30 text-red-400'
            }`}>
              {getRevenuePerCompetitorMessage(revenuePerCompetitor)}
            </span>
          </div>
        </div>

        {/* Total Competitors Card - Now includes competition level */}
        <div className={`bg-white/90 dark:bg-slate-800/50 rounded-2xl border-2 ${competitorColorClass} p-6`}>
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Total Competitors</h2>
            <Users className="w-8 h-8 text-gray-600 dark:text-slate-400" strokeWidth={1.5} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-3xl font-bold ${competitorColorClass}`}>
              {competitors.length}
            </span>
            <span className={`text-sm font-semibold rounded-md px-2 py-1 ${
              competitors.length < 10
                ? 'bg-emerald-900/30 text-emerald-400'
                : competitors.length < 15
                ? 'bg-green-900/30 text-green-400'
                : competitors.length < 20
                ? 'bg-blue-900/30 text-blue-400'
                : competitors.length < 30
                ? 'bg-amber-900/30 text-amber-400'
                : 'bg-red-900/30 text-red-400'
            }`}>
              {getCompetitorCountMessage(competitors.length)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Render market entry assessment section
  const renderMarketEntryAssessment = () => {
    // Get competition level to include in the market assessment
    const competitionLevel = getCompetitionLevel(activeCompetitors);
    
    // Generate comprehensive market message
    const marketAssessmentMessage = generateMarketAssessmentMessage();
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {/* Top 5 Competitors Card - LEFT */}
        <div className={`bg-white/90 dark:bg-slate-800/50 rounded-2xl border-2 ${getBorderColorClass(marketEntryUIStatus)} p-6`}>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top 5 Competitors</h2>
          <div className="space-y-4">
            <div className="bg-gray-100 dark:bg-slate-700/20 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-slate-400 mb-2">Average Reviews</div>
              <div className="flex items-center gap-2">
                {(() => {
                  // Get top 5 competitors by monthly sales
                  const top5 = [...competitors]
                    .sort((a, b) => b.monthlySales - a.monthlySales)
                    .slice(0, 5);
                  
                  // Calculate average reviews
                  const avgReviews = top5.reduce((sum, comp) => 
                    sum + (comp.reviews ? parseFloat(comp.reviews.toString()) : 0), 0) / top5.length;
                  
                  // Determine color and verbal rating
                  let color = "text-yellow-400"; // Decent (default)
                  let rating = "DECENT";
                  
                  if (avgReviews > 1000) {
                    color = "text-red-400";
                    rating = "HIGH";
                  } else if (avgReviews < 300) {
                    color = "text-green-400";
                    rating = "LOW";
                  }
                  
                  return (
                    <>
                      <span className={`text-lg font-medium ${color}`}>
                        {avgReviews ? Math.round(avgReviews).toLocaleString() : 'N/A'}
                      </span>
                      <span className="text-sm font-semibold text-gray-600 dark:text-slate-400">({rating})</span>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="bg-gray-100 dark:bg-slate-700/20 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-slate-400 mb-2">Average Rating</div>
              <div className="flex items-center gap-2">
                {(() => {
                  // Get top 5 competitors by monthly sales
                  const top5 = [...competitors]
                    .sort((a, b) => b.monthlySales - a.monthlySales)
                    .slice(0, 5);
                  
                  // Calculate average rating
                  const validRatings = top5.filter(comp => comp.rating);
                  const avgRating = validRatings.reduce((sum, comp) => 
                    sum + (comp.rating ? parseFloat(comp.rating.toString()) : 0), 0) / validRatings.length;
                  
                  // Determine color and verbal rating
                  let color = "text-yellow-400"; // Average Quality (default)
                  let rating = "AVERAGE QUALITY";
                  
                  if (avgRating >= 4.7) {
                    color = "text-red-400";
                    rating = "HIGH QUALITY";
                  } else if (avgRating < 4.1) {
                    color = "text-green-400";
                    rating = "LOW QUALITY";
                  }
                  
                  return (
                    <>
                      <span className={`text-lg font-medium ${color}`}>
                        {avgRating ? avgRating.toFixed(1) : 'N/A'}
                      </span>
                      <span className={`text-xl ${color}`}>★</span>
                      <span className="text-sm font-semibold text-gray-600 dark:text-slate-400">({rating})</span>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="bg-gray-100 dark:bg-slate-700/20 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-slate-400 mb-2">Average Listing Age</div>
              <div className="flex items-center gap-2">
                {(() => {
                  // Get top 5 competitors by monthly sales
                  const top5 = [...competitors]
                    .sort((a, b) => b.monthlySales - a.monthlySales)
                    .slice(0, 5);
                  
                  // Calculate age for each competitor with dateFirstAvailable
                  const competitorsWithAge = top5.filter(comp => comp.dateFirstAvailable);
                  
                  // If we have competitors with age data
                  if (competitorsWithAge.length > 0) {
                    // Get average age in months
                    const avgAgeMonths = competitorsWithAge.reduce((sum, comp) => {
                      return sum + calculateAge(comp.dateFirstAvailable || '');
                    }, 0) / competitorsWithAge.length;
                    
                    // Convert months to years and months
                    const years = Math.floor(avgAgeMonths / 12);
                    const months = Math.round(avgAgeMonths % 12);
                    
                    // Use neutral color for all ages
                    const color = "text-blue-400";
                    
                    return (
                      <span className={`text-lg font-medium ${color}`}>
                        {years > 0 ? `${years}y ${months}m` : `${months} months`}
                      </span>
                    );
                  } else {
                    // No listing age data available
                    return (
                      <span className="text-gray-600 dark:text-slate-400">No data available</span>
                    );
                  }
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Main Assessment Card - CENTER */}
        <div className={`bg-white/90 dark:bg-slate-800/50 rounded-2xl border-4 ${getBorderColorClass(marketEntryUIStatus)} 
            shadow-lg ${getGlowColorClass(marketEntryUIStatus)} p-6 transform scale-105`}>
          <div className="flex flex-col items-center text-center h-full">
            <div className={`text-6xl font-bold mb-2 ${getTextColorClass(marketEntryUIStatus)}`}>
              {marketEntryUIStatus}
            </div>
            
            <div className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
              {typeof marketScore === 'object' && marketScore.score !== undefined 
                ? Number(marketScore.score).toFixed(1) 
                : typeof marketScore === 'number' 
                  ? Number(marketScore).toFixed(1) 
                  : '0.0'}%
            </div>

            <div className={`text-xl font-medium mb-4 ${getTextColorClass(marketEntryUIStatus)}`}>
              {getAssessmentSummary(marketEntryUIStatus)}
            </div>
            
            <p className="text-gray-700 dark:text-slate-300 mb-6 text-sm">
              {marketAssessmentMessage}
            </p>

            <div className="w-full mt-auto">
              <div className="relative h-4 bg-gray-200 dark:bg-slate-700/30 rounded-full overflow-hidden">
                <div 
                  className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${
                    marketScore.status === 'PASS' ? 'bg-emerald-500' :
                    marketScore.status === 'RISKY' ? 'bg-amber-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${typeof marketScore === 'object' && marketScore.score !== undefined 
                    ? marketScore.score 
                    : typeof marketScore === 'number' 
                      ? marketScore 
                      : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Key Market Indicators Card - RIGHT */}
        <div className={`bg-white/90 dark:bg-slate-800/50 rounded-2xl border-2 ${getBorderColorClass(marketEntryUIStatus)} p-6`}>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Key Market Indicators</h2>
          <div className="space-y-4">
            <div className="bg-gray-100 dark:bg-slate-700/20 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-slate-400 mb-2">Market Size</div>
              <div className="flex items-center gap-2">
                {(() => {
                  // Calculate market size based on various metrics
                  // - Total Revenue
                  const totalRevenue = activeCompetitors.reduce((sum, comp) => 
                    sum + (comp.monthlyRevenue || 0), 0);
                  
                  // - Total Reviews
                  const totalReviews = activeCompetitors.reduce((sum, comp) => 
                    sum + (comp.reviews ? parseFloat(comp.reviews.toString()) : 0), 0);
                  
                  // - Competitor Count
                  const competitorCount = activeCompetitors.length;
                  
                  // - Average BSR (lower is better)
                  const validBSRs = activeCompetitors.filter(comp => comp.bsr && comp.bsr < 1000000);
                  const avgBSR = validBSRs.length ? 
                    validBSRs.reduce((sum, comp) => sum + (comp.bsr || 0), 0) / validBSRs.length : 
                    1000000;
                  
                  // Determine market size based on weighted factors
                  let marketSize = "Medium";
                  let color = "text-yellow-400";
                  let icon = "→";
                  
                  // Very Large Market Indicators (any 2 of these)
                  const isVeryLarge = [
                    totalRevenue > 200000,
                    totalReviews > 10000,
                    competitorCount > 30,
                    avgBSR < 5000
                  ].filter(Boolean).length >= 2;
                  
                  // Large Market Indicators (any 2 of these)
                  const isLarge = [
                    totalRevenue > 100000,
                    totalReviews > 5000,
                    competitorCount > 20,
                    avgBSR < 10000
                  ].filter(Boolean).length >= 2;
                  
                  // Average Market Indicators (any 2 of these)
                  const isAverage = [
                    totalRevenue > 75000 && totalRevenue <= 100000,
                    totalReviews > 3000 && totalReviews <= 5000,
                    competitorCount > 15 && competitorCount <= 20,
                    avgBSR >= 10000 && avgBSR < 20000
                  ].filter(Boolean).length >= 2;
                  
                  // Small Market Indicators (any 2 of these)
                  const isSmall = [
                    totalRevenue < 50000,
                    totalReviews < 2000,
                    competitorCount < 10,
                    avgBSR > 30000
                  ].filter(Boolean).length >= 2;
                  
                  // Very Small Market Indicators (any 2 of these)
                  const isVerySmall = [
                    totalRevenue < 20000,
                    totalReviews < 500,
                    competitorCount < 5,
                    avgBSR > 75000
                  ].filter(Boolean).length >= 2;
                  
                  if (isVeryLarge) {
                    marketSize = "Very Large";
                    color = "text-red-400";
                    icon = "↑";
                  } else if (isLarge) {
                    marketSize = "Large";
                    color = "text-amber-400";
                    icon = "↗";
                  } else if (isAverage) {
                    marketSize = "Average";
                    color = "text-blue-400";
                    icon = "→";
                  } else if (isSmall) {
                    marketSize = "Small";
                    color = "text-emerald-400";
                    icon = "↘";
                  } else if (isVerySmall) {
                    marketSize = "Very Small";
                    color = "text-emerald-400";
                    icon = "↓";
                  }
                  
                  return (
                    <>
                      <span className={`text-lg font-medium ${color}`}>
                        {marketSize} <span className="text-xl">{icon}</span>
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="bg-gray-100 dark:bg-slate-700/20 rounded-lg p-3">
              <div className="text-sm text-gray-600 dark:text-slate-400 mb-2">BSR Stability</div>
              <div className="flex items-center gap-2">
                {(() => {
                  // Get average BSR stability from Keepa results
                  const validResults = keepaResults?.filter(result => 
                    result?.analysis?.bsr?.stability !== undefined
                  ) || [];
                  
                  const avgStability = validResults.length 
                    ? validResults.reduce((sum, result) => 
                        sum + (result.analysis.bsr.stability || 0), 0) / validResults.length
                    : 0.5; // Default if no data
                  
                  // Determine stability category and color
                  let stabilityCategory = "Moderate Stability";
                  let color = "text-yellow-400";
                  
                  if (avgStability >= 0.8) {
                    stabilityCategory = "Highly Stable";
                    color = "text-emerald-400";
                  } else if (avgStability >= 0.6) {
                    stabilityCategory = "Moderately Stable";
                    color = "text-green-400";
                  } else if (avgStability >= 0.4) {
                    stabilityCategory = "Moderate Stability";
                    color = "text-yellow-400";
                  } else if (avgStability >= 0.2) {
                    stabilityCategory = "Unstable";
                    color = "text-amber-400";
                  } else {
                    stabilityCategory = "Highly Unstable";
                    color = "text-red-400";
                  }
                  
                  return (
                    <span className={`text-lg font-medium ${color}`}>
                      {stabilityCategory}
                    </span>
                  );
                })()}
              </div>
            </div>
            <div className="bg-slate-700/20 rounded-lg p-3">
              <div className="text-sm text-slate-400 mb-2">Price Volatility</div>
              <div className="flex items-center gap-2">
                {(() => {
                  // Get average price stability from Keepa results
                  const validResults = keepaResults?.filter(result => 
                    result?.analysis?.price?.stability !== undefined
                  ) || [];
                  
                  const avgStability = validResults.length 
                    ? validResults.reduce((sum, result) => 
                        sum + (result.analysis.price.stability || 0), 0) / validResults.length
                    : 0.5; // Default if no data
                  
                  // Determine volatility category and color
                  let volatilityCategory = "Moderate Volatility";
                  let color = "text-yellow-400";
                  
                  if (avgStability >= 0.8) {
                    volatilityCategory = "Highly Stable";
                    color = "text-emerald-400";
                  } else if (avgStability >= 0.6) {
                    volatilityCategory = "Moderately Stable";
                    color = "text-green-400";
                  } else if (avgStability >= 0.4) {
                    volatilityCategory = "Moderate Volatility";
                    color = "text-yellow-400";
                  } else if (avgStability >= 0.2) {
                    volatilityCategory = "Highly Volatile";
                    color = "text-amber-400";
                  } else {
                    volatilityCategory = "Extreme Volatility";
                    color = "text-red-400";
                  }
                  
                  return (
                    <span className={`text-lg font-medium ${color}`}>
                      {volatilityCategory}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render charts for competitor analysis
  const renderCharts = () => {
    // Server-side or initial render placeholder
    if (typeof window === 'undefined' || !isClient) {
      return (
        <div className="p-8">
          <div className="flex animate-pulse">
            <div className="w-2/5 h-64 bg-slate-800/30 rounded-xl"></div>
            <div className="w-3/5 h-64 ml-6 bg-slate-800/30 rounded-xl"></div>
          </div>
        </div>
      );
    }

    // Calculate total reviews for the review share column
    const totalReviews = activeCompetitors.reduce((sum, comp) => {
      const reviewValue = typeof comp.reviews === 'string' ? 
        parseFloat(comp.reviews) : (comp.reviews || 0);
      return sum + reviewValue;
    }, 0);

    // Process competitor data for the breakdown table
    const competitorBreakdown = (() => {
      if (activeTab === 'fulfillment') {
        return activeCompetitors.map(comp => ({
          name: comp.title?.length > 30 ? comp.title.substring(0, 30) + '...' : comp.title || 'Unknown Product',
          asin: comp.asin,
          value: comp.fulfillmentMethod || comp.fulfillment || comp.fulfilledBy || extractFulfillmentMethod(comp) || 'N/A'
        }));
      } else if (activeTab === 'age') {
        return activeCompetitors.map(comp => ({
          name: comp.title?.length > 30 ? comp.title.substring(0, 30) + '...' : comp.title || 'Unknown Product',
          asin: comp.asin,
          value: comp.dateFirstAvailable ? calculateAge(comp.dateFirstAvailable) : 'N/A',
          category: comp.dateFirstAvailable ? 
            (calculateAge(comp.dateFirstAvailable) >= 24 ? 'Mature' : 
              calculateAge(comp.dateFirstAvailable) >= 12 ? 'Established' :
              calculateAge(comp.dateFirstAvailable) >= 6 ? 'Growing' : 'New') : 'N/A'
        }));
      } else {
        return competitors.map(comp => ({
          name: comp.title?.length > 30 ? comp.title.substring(0, 30) + '...' : comp.title || 'Unknown Product',
          asin: comp.asin,
          value: comp.score ? parseFloat(comp.score.toString()).toFixed(1) : 'N/A',
          category: comp.score ? 
            (parseFloat(comp.score.toString()) >= 7.5 ? 'Exceptional' : 
              parseFloat(comp.score.toString()) >= 5 ? 'Decent' : 'Poor') : 'N/A'
        }));
      }
    })();

    // Helper for category descriptions
    const getCategoryDescription = (category) => {
      if (activeTab === 'age') {
        return {
          'Mature': 'Products in market for 2+ years',
          'Established': 'Products in market for 1-2 years',
          'Growing': 'Products in market for 6-12 months',
          'New': 'Products in market for 0-6 months'
        }[category] || '';
      } else if (activeTab === 'fulfillment') {
        return {
          'FBA': 'Fulfilled by Amazon - Prime eligible',
          'FBM': 'Fulfilled by Merchant - Seller handles shipping',
          'Amazon': 'Sold & shipped by Amazon directly'
        }[category] || '';
      } else {
        return {
          'Exceptional': 'High quality listings (7.5-10)',
          'Decent': 'Average quality listings (5-7.4)',
          'Poor': 'Below average listings (0-4.9)'
        }[category] || '';
      }
    };

    const getSummaryText = () => {
      if (activeTab === 'age') {
        const maturityLevel = getMaturityLevel(distributions.age);
        return parseFloat(maturityLevel) > 60 
          ? `${maturityLevel}% maturity indicates an established market with stable demand and potentially high barriers to entry.`
          : `${maturityLevel}% maturity suggests a growing market with opportunities for new entrants.`;
      } else if (activeTab === 'fulfillment') {
        return `${(distributions.fulfillment.fba || 0).toFixed(1)}% FBA indicates ${distributions.fulfillment.fba > 70 ? 'high' : 'moderate'} 
          competition for Prime customers.`;
      } else {
        return 'Market analysis data available.';
      }
    };

    const getPieChartData = () => {
      if (activeTab === 'age') {
        return [
          { name: 'Mature (2+ years)', shortName: 'Mature', value: distributions.age.mature || 0 },
          { name: 'Established (1-2 years)', shortName: 'Established', value: distributions.age.established || 0 },
          { name: 'Growing (6-12 months)', shortName: 'Growing', value: distributions.age.growing || 0 },
          { name: 'New (0-6 months)', shortName: 'New', value: distributions.age.new || 0 },
          { name: 'N/A', shortName: 'N/A', value: distributions.age.na || 0 }
        ].filter(item => item.value > 0);
      } else if (activeTab === 'fulfillment') {
        return [
          { name: 'FBA', shortName: 'FBA', value: distributions.fulfillment.fba || 0 },
          { name: 'FBM', shortName: 'FBM', value: distributions.fulfillment.fbm || 0 },
          { name: 'Amazon', shortName: 'Amazon', value: distributions.fulfillment.amazon || 0 },
          { name: 'N/A', shortName: 'N/A', value: distributions.fulfillment.na || 0 }
        ].filter(item => item.value > 0);
      } else {
        return [];
      }
    };

    const pieChartData = getPieChartData();

    return (
      <div className="p-8">
        {/* Remove buttons from here since they'll be moved to the top */}
        
        {/* Tab Navigation */}
        <div className="flex mb-6 border-b border-gray-200 dark:border-slate-700/50 overflow-x-auto">
          <button
            className={`px-6 py-3 flex items-center gap-2 text-sm font-medium rounded-t-lg transition-all ${
              activeTab === 'overview' 
                ? 'bg-gray-100 dark:bg-slate-700/30 text-emerald-400 border-b-2 border-emerald-400' 
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/20'
            }`}
            onClick={() => setActiveTab('overview')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Competitor Overview
          </button>
          
          <button
            className={`px-6 py-3 flex items-center gap-2 text-sm font-medium rounded-t-lg transition-all ${
              activeTab === 'age' 
                ? 'bg-gray-100 dark:bg-slate-700/30 text-emerald-400 border-b-2 border-emerald-400' 
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/20'
            }`}
            onClick={() => setActiveTab('age')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Market Age Distribution
          </button>
          
          <button
            className={`px-6 py-3 flex items-center gap-2 text-sm font-medium rounded-t-lg transition-all ${
              activeTab === 'fulfillment' 
                ? 'bg-gray-100 dark:bg-slate-700/30 text-emerald-400 border-b-2 border-emerald-400' 
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/20'
            }`}
            onClick={() => setActiveTab('fulfillment')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            Fulfillment Methods
          </button>
          
          
          <button
            className={`px-6 py-3 flex items-center gap-2 text-sm font-medium rounded-t-lg transition-all ${
              activeTab === 'market_share' 
                ? 'bg-gray-100 dark:bg-slate-700/30 text-emerald-400 border-b-2 border-emerald-400' 
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/20'
            }`}
            onClick={() => setActiveTab('market_share')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Market Share
          </button>
          
          <button
            className={`px-6 py-3 flex items-center gap-2 text-sm font-medium rounded-t-lg transition-all ${
              activeTab === 'raw_data' 
                ? 'bg-gray-100 dark:bg-slate-700/30 text-emerald-400 border-b-2 border-emerald-400' 
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700/20'
            }`}
            onClick={() => setActiveTab('raw_data')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            All Data
          </button>
        </div>
        
        {/* Competitor Overview Tab Content */}
        {activeTab === 'overview' && renderCompetitorOverview()}

        {/* Chart Container for other tabs */}
        {activeTab !== 'overview' && activeTab !== 'market_share' && activeTab !== 'raw_data' && (
          <div className="bg-slate-800/30 rounded-xl p-6">
            <h3 className="text-lg font-medium text-white mb-4">
              {activeTab === 'age' ? 'Market Age Distribution' : 
              activeTab === 'fulfillment' ? 'Fulfillment Methods' : 'Unknown Tab'}
            </h3>
            
            <div className="flex flex-col lg:flex-row max-h-[500px]">
              {/* Left side - Chart */}
              <div className="w-full lg:w-2/5 lg:pr-6">
                <div className="h-[400px] relative">
                  {distributions && (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={150}
                          paddingAngle={4}
                          dataKey="value"
                          labelLine={false}
                        >
                          {activeTab === 'age' && [
                            <Cell key="mature" fill={COLORS.mature} />,
                            <Cell key="established" fill={COLORS.established} />,
                            <Cell key="growing" fill={COLORS.growing} />,
                            <Cell key="new" fill={COLORS.new} />,
                            <Cell key="na" fill="#4B5563" />
                          ].filter((_, i) => {
                            const ageArray = [
                              distributions.age.mature || 0,
                              distributions.age.established || 0,
                              distributions.age.growing || 0,
                              distributions.age.new || 0,
                              distributions.age.na || 0
                            ];
                            return ageArray[i] > 0;
                          })}
                          
                          {activeTab === 'fulfillment' && [
                            <Cell key="fba" fill={COLORS.fba} />,
                            <Cell key="fbm" fill={COLORS.fbm} />,
                            <Cell key="amazon" fill={COLORS.amazon} />,
                            <Cell key="na" fill="#4B5563" />
                          ].filter((_, i) => {
                            const fulfillmentArray = [
                              distributions.fulfillment.fba || 0,
                              distributions.fulfillment.fbm || 0,
                              distributions.fulfillment.amazon || 0,
                              distributions.fulfillment.na || 0
                            ];
                            return fulfillmentArray[i] > 0;
                          })}
                          
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload?.length) {
                              const data = payload[0];
                              return (
                                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl z-20"
                                    style={{ 
                                      position: 'absolute', 
                                      transform: 'translateY(-20px)'
                                    }}>
                                  <div className="flex items-center gap-2 mb-1">
                                    <div 
                                      className="w-3 h-3 rounded-full" 
                                      style={{ backgroundColor: data.payload.fill || data.color }}
                                    ></div>
                                    <p className="text-slate-300 font-medium">{data.name}</p>
                                  </div>
                                  <p className="text-emerald-400 font-semibold text-lg">
                                    {typeof data.value === 'number' ? data.value.toFixed(1) : data.value}%
                                  </p>
                                  <p className="text-slate-400 text-xs mt-1">
                                    {getCategoryDescription(data.payload.shortName)}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                          wrapperStyle={{ zIndex: 100 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Right side - Legend and Competitor Breakdown */}
              <div className="w-full lg:w-3/5 lg:pl-6 mt-6 lg:mt-0 overflow-y-auto">
                {/* Legend */}
                <div className="mb-6">
                  <h4 className="text-base font-medium text-slate-300 mb-3">Distribution</h4>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
                    {activeTab === 'age' && (
                      <>
                        <div className="flex items-center">
                          <div className="h-4 w-4 rounded-full bg-emerald-500 mr-3"></div>
                          <div className="text-base text-slate-200 font-medium">
                            Mature: 2+ Years 
                            <span className="text-emerald-400 ml-2 font-bold">
                              ({(distributions.age.mature || 0).toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="h-4 w-4 rounded-full bg-blue-400 mr-3"></div>
                          <div className="text-base text-slate-200 font-medium">
                            Established: 1-2 Years 
                            <span className="text-blue-400 ml-2 font-bold">
                              ({(distributions.age.established || 0).toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="h-4 w-4 rounded-full bg-amber-400 mr-3"></div>
                          <div className="text-base text-slate-200 font-medium">
                            Growing: 6-12 Months 
                            <span className="text-amber-400 ml-2 font-bold">
                              ({(distributions.age.growing || 0).toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="h-4 w-4 rounded-full bg-red-400 mr-3"></div>
                          <div className="text-base text-slate-200 font-medium">
                            New: 0-6 Months 
                            <span className="text-red-400 ml-2 font-bold">
                              ({(distributions.age.new || 0).toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        {(distributions.age.na || 0) > 0 && (
                          <div className="flex items-center">
                            <div className="h-4 w-4 rounded-full bg-purple-500 mr-3"></div>
                            <div className="text-base text-slate-200 font-medium">
                              Not Available 
                              <span className="text-purple-400 ml-2 font-bold">
                                ({(distributions.age.na || 0).toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {activeTab === 'fulfillment' && (
                      <>
                        <div className="flex items-center">
                          <div className="h-4 w-4 rounded-full bg-red-500 mr-3"></div>
                          <div className="text-base text-slate-200 font-medium">
                            FBA
                            <span className="text-red-400 ml-2 font-bold">
                              ({(distributions.fulfillment.fba || 0).toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="h-4 w-4 rounded-full bg-emerald-500 mr-3"></div>
                          <div className="text-base text-slate-200 font-medium">
                            FBM
                            <span className="text-emerald-400 ml-2 font-bold">
                              ({(distributions.fulfillment.fbm || 0).toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="h-4 w-4 rounded-full bg-amber-500 mr-3"></div>
                          <div className="text-base text-slate-200 font-medium">
                            Amazon
                            <span className="text-amber-400 ml-2 font-bold">
                              ({(distributions.fulfillment.amazon || 0).toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        {(distributions.fulfillment.na || 0) > 0 && (
                          <div className="flex items-center">
                            <div className="h-4 w-4 rounded-full bg-purple-500 mr-3"></div>
                            <div className="text-base text-slate-200 font-medium">
                              Not Available
                              <span className="text-purple-400 ml-2 font-bold">
                                ({(distributions.fulfillment.na || 0).toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {activeTab === 'quality' && (
                      <>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Summary Card */}
            <div className="mt-6 bg-slate-700/40 rounded-lg p-5 border-l-4 border-emerald-500 shadow-lg">
              <div className="text-base font-medium text-white">
                {getSummaryText()}
              </div>
            </div>
          </div>
        )}

        {/* Market Share Distribution Tab Content */}
        {activeTab === 'market_share' && (
          <div className="bg-slate-800/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Market Share Distribution</h3>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">Total Market Value:</span>
                  <span className="text-emerald-400 font-semibold">
                    {formatCurrency(activeCompetitors.reduce((sum, comp) => sum + (comp?.monthlyRevenue || 0), 0))}
                  </span>
                </div>
                
                {activeCompetitors.length > 5 && (
                  <button
                    onClick={() => setShowAllMarketShare(!showAllMarketShare)}
                    className="flex items-center gap-1 text-sm bg-slate-700/50 hover:bg-slate-700/80 
                              text-slate-300 hover:text-white px-3 py-2 rounded-lg transition-all"
                  >
                    {showAllMarketShare ? (
                      <>
                        <Filter className="w-4 h-4" />
                        Show Top 5 Only
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Show All ({competitors.length})
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="min-h-[400px]">
                {isClient && (
                  <ResponsiveContainer width="100%" height={400}>
                    <PieChart>
                      <Pie
                        data={(() => {
                          // Get top 5 competitors by revenue
                          const top5 = [...activeCompetitors]
                            .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)
                            .slice(0, 5);
                          
                          // Calculate total revenue
                          const totalRevenue = activeCompetitors.reduce((sum, comp) => sum + comp.monthlyRevenue, 0);
                          
                          // Calculate top 5 revenue
                          const top5Revenue = top5.reduce((sum, comp) => sum + comp.monthlyRevenue, 0);
                          
                          // Calculate other revenue
                          const otherRevenue = totalRevenue - top5Revenue;
                          
                          // Create pie chart data for top 5 - use brand instead of title
                          const data = top5.map(comp => ({
                            name: comp.brand || 'Unknown Brand',
                            value: comp.monthlyRevenue,
                            percentage: (comp.monthlyRevenue / totalRevenue) * 100,
                            formattedRevenue: formatCurrency(comp.monthlyRevenue),
                            asin: comp.asin
                          }));
                          
                          // Add "Other" category if there are more than 5 competitors and not showing all
                          if (competitors.length > 5 && !showAllMarketShare) {
                            data.push({
                              name: 'Other Competitors',
                              value: otherRevenue,
                              percentage: (otherRevenue / totalRevenue) * 100,
                              formattedRevenue: formatCurrency(otherRevenue),
                              asin: 'other'
                            });
                          }
                          
                          // If showing all, return data for all competitors - use brand instead of title
                          if (showAllMarketShare) {
                            return competitors.map(comp => ({
                              name: comp.brand || 'Unknown Brand',
                              value: comp.monthlyRevenue,
                              percentage: (comp.monthlyRevenue / totalRevenue) * 100,
                              formattedRevenue: formatCurrency(comp.monthlyRevenue),
                              asin: comp.asin || ''
                            }));
                          }
                          
                          return data;
                        })()}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={140}
                        paddingAngle={2}
                        label={({ name, percentage }) => 
                          name === 'Other Competitors' 
                            ? `${name} (${percentage.toFixed(1)}%)` 
                            : `${name} (${percentage.toFixed(1)}%)`
                        }
                        labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                      >
                        {(() => {
                          const pieData = showAllMarketShare
                            ? competitors
                            : [...competitors].sort((a, b) => b.monthlyRevenue - a.monthlyRevenue).slice(0, 5);
                          
                          const colors = [
                            '#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EC4899',
                            '#8B5CF6', '#14B8A6', '#F97316', '#0EA5E9', '#84CC16'
                          ];
                          
                          return pieData.map((_, index) => (
                            <Cell 
                              key={`cell-${index}`}
                              fill={index < 10 ? colors[index] : '#94A3B8'}
                              stroke="rgba(0,0,0,0.1)"
                              strokeWidth={2}
                            />
                          )).concat(
                            competitors.length > 5 && !showAllMarketShare
                              ? <Cell key="cell-other" fill="#94A3B8" stroke="rgba(0,0,0,0.1)" strokeWidth={2} />
                              : []
                          );
                        })()}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
                                <p className="text-slate-300 font-medium mb-1">{data.name}</p>
                                <p className="text-emerald-400 font-semibold mb-1">
                                  {data.formattedRevenue}
                                </p>
                                <p className="text-slate-400 text-sm">
                                  {data.percentage.toFixed(1)}% market share
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {(() => {
                  // Get competitors to display
                  const compsToDisplay = showAllMarketShare
                    ? [...activeCompetitors]
                    : [...activeCompetitors].sort((a, b) => b.monthlyRevenue - a.monthlyRevenue).slice(0, 5);
                  
                  // Calculate total revenue
                  const totalRevenue = activeCompetitors.reduce((sum, comp) => sum + comp.monthlyRevenue, 0);
                  
                  // Color array
                  const colors = [
                    '#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EC4899',
                    '#8B5CF6', '#14B8A6', '#F97316', '#0EA5E9', '#84CC16'
                  ];
                  
                  // Prepare entries for display - show brand in main list too
                  const entries = compsToDisplay.map((comp, index) => ({
                    name: comp.brand || 'Unknown Brand',
                    title: comp.title?.length > 30 ? comp.title.substring(0, 30) + '...' : comp.title,
                    value: comp.monthlyRevenue,
                    percentage: (comp.monthlyRevenue / totalRevenue) * 100,
                    formattedRevenue: formatCurrency(comp.monthlyRevenue),
                    color: index < 10 ? colors[index] : '#94A3B8'
                  }));
                  
                  // Add "Other" category if showing top 5 only and there are more than 5 competitors
                  if (!showAllMarketShare && competitors.length > 5) {
                    const top5Revenue = entries.reduce((sum, entry) => sum + entry.value, 0);
                    const otherRevenue = totalRevenue - top5Revenue;
                    
                    entries.push({
                      name: 'Other Competitors',
                      title: 'Various Competitors',
                      value: otherRevenue,
                      percentage: (otherRevenue / totalRevenue) * 100,
                      formattedRevenue: formatCurrency(otherRevenue),
                      color: '#94A3B8'
                    });
                  }
                  
                  return entries.map((entry, index) => (
                    <div 
                      key={entry.name + index}
                      className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700/50"
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: entry.color }}
                        />
                        <div>
                          <p className="text-slate-200 font-medium">{entry.name}</p>
                          <p className="text-slate-400 text-xs mt-1">
                            {entry.title}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-400 font-semibold">
                          {entry.formattedRevenue}
                        </p>
                        <p className="text-slate-400 text-sm">
                          Monthly Revenue
                        </p>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}
        
        {/* Raw Data Tab Content (now All Data) */}
        {activeTab === 'raw_data' && (
          <div className="bg-slate-800/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">30 Day Market Data</h3>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">Total Competitors:</span>
                  <span className="text-emerald-400 font-semibold">{competitors.length}</span>
                </div>
                
                {/* Column visibility dropdown */}
                <div className="relative">
                  <button 
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-slate-700/30 
                      hover:bg-slate-700/50 text-slate-300 rounded-lg"
                    onClick={() => document.getElementById('column-toggle')?.classList.toggle('hidden')}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    Customize Columns
                  </button>
                  
                  <div 
                    id="column-toggle"
                    className="hidden absolute right-0 top-full mt-2 bg-slate-800 border 
                      border-slate-700 rounded-lg shadow-xl p-4 z-20 min-w-[200px]"
                  >
                    <div className="font-medium text-white text-sm mb-2">Toggle Columns</div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {[
                        { key: 'no', label: 'No' },
                        { key: 'asin', label: 'ASIN' },
                        { key: 'brand', label: 'Brand' },
                        { key: 'title', label: 'Product Title' },
                        { key: 'category', label: 'Category' },
                        { key: 'price', label: 'Price' },
                        { key: 'bsr', label: 'BSR' },
                        { key: 'score', label: 'Listing Score' },
                        { key: 'monthlySales', label: 'Monthly Sales' },
                        { key: 'monthlyRevenue', label: 'Monthly Revenue' },
                        { key: 'rating', label: 'Rating' },
                        { key: 'reviews', label: 'Reviews' },
                        { key: 'variations', label: 'Variations' },
                        { key: 'fulfillment', label: 'Fulfilled By' },
                        { key: 'productType', label: 'Product Type' },
                        { key: 'sellerCount', label: 'Seller Count' },
                        { key: 'grossProfit', label: 'Gross Profit' },
                        { key: 'dateFirstAvailable', label: 'Date First Available' },
                        { key: 'activeSellers', label: 'Active Sellers' },
                        { key: 'productWeight', label: 'Product Weight' },
                        { key: 'sizeTier', label: 'Size Tier' },
                        { key: 'soldBy', label: 'Sold By' }
                      ].map(column => (
                        <div key={column.key} className="flex items-center">
                          <input
                            type="checkbox"
                            id={`column-${column.key}`}
                            checked={columnVisibility[column.key]}
                            onChange={() => toggleColumnVisibility(column.key)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-600 
                              focus:ring-offset-gray-800 focus:ring-offset-2 bg-slate-700 border-slate-600"
                          />
                          <label 
                            htmlFor={`column-${column.key}`}
                            className="ml-2 text-sm text-slate-300"
                          >
                            {column.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-slate-700/50 sticky top-0 bg-slate-800/90 z-10">
                    <tr>
                      {columnVisibility.no && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('index')}>
                          No {sortConfig.key === 'index' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.asin && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('asin')}>
                          ASIN {sortConfig.key === 'asin' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.brand && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('brand')}>
                          Brand {sortConfig.key === 'brand' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.title && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('title')}>
                          Product Title {sortConfig.key === 'title' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.category && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('category')}>
                          Category {sortConfig.key === 'category' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.price && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('price')}>
                          Price {sortConfig.key === 'price' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.bsr && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('bsr')}>
                          BSR {sortConfig.key === 'bsr' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.score && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('score')}>
                          Listing Score {sortConfig.key === 'score' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.monthlySales && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('monthlySales')}>
                          Monthly Sales {sortConfig.key === 'monthlySales' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.monthlyRevenue && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('monthlyRevenue')}>
                          Monthly Revenue {sortConfig.key === 'monthlyRevenue' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.rating && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('rating')}>
                          Rating {sortConfig.key === 'rating' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.reviews && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('reviews')}>
                          Reviews {sortConfig.key === 'reviews' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.variations && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('variations')}>
                          Variations {sortConfig.key === 'variations' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.fulfillment && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('fulfillment')}>
                          Fulfilled By {sortConfig.key === 'fulfillment' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.productType && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('productType')}>
                          Product Type {sortConfig.key === 'productType' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.sellerCount && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('sellerCount')}>
                          Seller Count {sortConfig.key === 'sellerCount' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.grossProfit && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('grossProfit')}>
                          Gross Profit {sortConfig.key === 'grossProfit' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.dateFirstAvailable && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('dateFirstAvailable')}>
                          Date First Available {sortConfig.key === 'dateFirstAvailable' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.activeSellers && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('activeSellers')}>
                          Active Sellers {sortConfig.key === 'activeSellers' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.productWeight && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('productWeight')}>
                          Product Weight {sortConfig.key === 'productWeight' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.sizeTier && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('sizeTier')}>
                          Size Tier {sortConfig.key === 'sizeTier' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                      {columnVisibility.soldBy && (
                        <th className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" onClick={() => handleSort('soldBy')}>
                          Sold By {sortConfig.key === 'soldBy' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCompetitors.map((competitor, index) => {
                      // Get clean ASIN from data
                      let cleanAsin = competitor.asin;
                      if (typeof cleanAsin === 'string' && cleanAsin.includes('amazon.com/dp/')) {
                        const match = cleanAsin.match(/dp\/([A-Z0-9]{10})/);
                        if (match && match[1]) {
                          cleanAsin = match[1];
                        }
                      }
                      
                      return (
                        <tr key={competitor.asin || `competitor-${index}`} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          {columnVisibility.no && <td className="p-3 text-white">{index + 1}</td>}
                          {columnVisibility.asin && (
                            <td className="p-3 text-blue-400">
                              <a 
                                href={`https://www.amazon.com/dp/${cleanAsin}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="hover:text-blue-300 hover:underline"
                              >
                                {cleanAsin}
                              </a>
                            </td>
                          )}
                          {columnVisibility.brand && <td className="p-3 text-white">{competitor.brand || 'N/A'}</td>}
                          {columnVisibility.title && <td className="p-3 text-white truncate max-w-xs">{competitor.title}</td>}
                          {columnVisibility.category && <td className="p-3 text-white">{competitor.category || 'N/A'}</td>}
                          {columnVisibility.price && <td className="p-3 text-white">{competitor.price ? formatCurrency(competitor.price) : 'N/A'}</td>}
                          {columnVisibility.bsr && <td className="p-3 text-white">{competitor.bsr ? formatNumber(competitor.bsr) : 'N/A'}</td>}
                          {columnVisibility.score && <td className="p-3 text-white">{competitor.score || 'N/A'}</td>}
                          {columnVisibility.monthlySales && <td className="p-3 text-white">{formatNumber(competitor.monthlySales)}</td>}
                          {columnVisibility.monthlyRevenue && <td className="p-3 text-white">{formatCurrency(competitor.monthlyRevenue)}</td>}
                          {columnVisibility.rating && <td className="p-3 text-white">{competitor.rating || 'N/A'}</td>}
                          {columnVisibility.reviews && <td className="p-3 text-white">{competitor.reviews ? formatNumber(Number(competitor.reviews)) : 'N/A'}</td>}
                          {columnVisibility.variations && <td className="p-3 text-white">{competitor.variations || 'N/A'}</td>}
                          {columnVisibility.fulfillment && <td className="p-3 text-white">{competitor.fulfillment || competitor.fulfilledBy || 'N/A'}</td>}
                          {columnVisibility.productType && <td className="p-3 text-white">{competitor.productType || 'N/A'}</td>}
                          {columnVisibility.sellerCount && <td className="p-3 text-white">{competitor.sellerCount || 'N/A'}</td>}
                          {columnVisibility.grossProfit && <td className="p-3 text-white">{competitor.grossProfit ? formatCurrency(competitor.grossProfit) : 'N/A'}</td>}
                          {columnVisibility.dateFirstAvailable && <td className="p-3 text-white">{competitor.dateFirstAvailable || 'N/A'}</td>}
                          {columnVisibility.activeSellers && <td className="p-3 text-white">{competitor.activeSellers || 'N/A'}</td>}
                          {columnVisibility.productWeight && <td className="p-3 text-white">{competitor.productWeight || 'N/A'}</td>}
                          {columnVisibility.sizeTier && <td className="p-3 text-white">{competitor.sizeTier || 'N/A'}</td>}
                          {columnVisibility.soldBy && <td className="p-3 text-white">{competitor.soldBy || 'N/A'}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };


  // Now add the renderCompetitorOverview function
  const renderCompetitorOverview = () => {
    // Use sorted and active competitors for display
    const competitorsToShow = sortedCompetitors;
    
    // Calculate total reviews for the review share column
    const totalReviews = competitorsToShow.reduce((sum, comp) => {
      const reviewValue = typeof comp.reviews === 'string' ? 
        parseFloat(comp.reviews) : (comp.reviews || 0);
      return sum + reviewValue;
    }, 0);
    
    return (
      <div className="space-y-4">
        {/* Selection Controls */}
        {selectedForRemoval.size > 0 && (
          <div className="bg-slate-700/30 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-white font-medium">
                {selectedForRemoval.size} competitor{selectedForRemoval.size !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={handleClearSelections}
                className="text-slate-400 hover:text-white text-sm transition-colors"
              >
                Clear selection
              </button>
            </div>
            <button
              onClick={handleRemoveSelectedCompetitors}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Remove Selected
            </button>
          </div>
        )}
        
        <div className="overflow-x-auto">
          <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="border-b border-slate-700/50 sticky top-0 bg-slate-800/90 z-10">
              <tr>
                <th className="p-3 text-sm text-slate-400">Rank</th>
                <th 
                  className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" 
                  onClick={() => handleSort('brand')}
                >
                  Brand {sortConfig.key === 'brand' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                </th>
                <th 
                  className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white" 
                  onClick={() => handleSort('asin')}
                >
                  ASIN {sortConfig.key === 'asin' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                </th>
                <th 
                  className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white"
                  onClick={() => handleSort('monthlyRevenue')}
                >
                  Monthly Revenue {sortConfig.key === 'monthlyRevenue' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                </th>
                <th 
                  className="p-3 text-sm text-slate-400 cursor-pointer hover:text-white"
                  onClick={() => handleSort('marketShare')}
                >
                  Market Share {sortConfig.key === 'marketShare' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                </th>
                <th className="p-3 text-sm text-slate-400">Review Share</th>
                <th className="p-3 text-sm text-slate-400">Competitor Score</th>
                <th className="p-3 text-sm text-slate-400">Strength</th>
                <th className="p-3 text-sm text-slate-400">Select</th>
              </tr>
            </thead>
            <tbody>
              {/* Show active competitors */}
              {competitorsToShow.map((competitor, index) => {
                // Use the scoring calculation from scoring.ts
                const competitorScore = parseFloat(calculateScore(competitor));
                const strength = getCompetitorStrength(competitorScore);
                const reviewValue = typeof competitor.reviews === 'string' ? 
                  parseFloat(competitor.reviews) : (competitor.reviews || 0);
                const reviewShare = totalReviews > 0 
                  ? (reviewValue / totalReviews * 100) 
                  : 0;
                
                // Map the strength color to Tailwind CSS classes
                const strengthColorClass = 
                  strength.color === 'red' ? 'bg-red-900/20 text-red-400' : 
                  strength.color === 'yellow' ? 'bg-amber-900/20 text-amber-400' :
                  'bg-emerald-900/20 text-emerald-400';
                
                // Get clean ASIN from data
                let cleanAsin = competitor.asin;
                if (typeof cleanAsin === 'string' && cleanAsin.includes('amazon.com/dp/')) {
                  const match = cleanAsin.match(/dp\/([A-Z0-9]{10})/);
                  if (match && match[1]) {
                    cleanAsin = match[1];
                  }
                }
                
                return (
                  <tr key={competitor.asin || index} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="p-3 text-white">{index + 1}</td>
                    <td className="p-3 text-white truncate max-w-xs">
                      {competitor.brand || "Unknown Brand"}
                    </td>
                    <td className="p-3">
                      <a 
                        href={`https://www.amazon.com/dp/${cleanAsin}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        {cleanAsin}
                      </a>
                    </td>
                    <td className="p-3 text-white">{formatCurrency(competitor.monthlyRevenue)}</td>
                    <td className="p-3 text-white">{competitor.marketShare.toFixed(2)}%</td>
                    <td className="p-3 text-white">{reviewShare.toFixed(2)}%</td>
                    <td className="p-3 text-white">{competitorScore.toFixed(2)}%
                      <CompetitorScoreDetails score={competitorScore.toFixed(2)} competitor={competitor} />
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${strengthColorClass}`}>
                        {strength.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <input
                        disabled={onlyReadMode}
                        type="checkbox"
                        checked={selectedForRemoval.has(competitor.asin)}
                        onChange={() => handleToggleCompetitorSelection(competitor.asin)}
                        className="w-4 h-4 text-red-500 bg-slate-700 border-slate-600 rounded focus:ring-red-500 focus:ring-2"
                        title="Select for removal"
                      />
                    </td>
                  </tr>
                );
              })}
              
              {/* Show removed competitors with struck-through styling */}
              {Array.from(removedCompetitors).map((removedAsin) => {
                const competitor = competitors.find(c => c.asin === removedAsin);
                if (!competitor) return null;
                
                const competitorScore = parseFloat(calculateScore(competitor));
                const strength = getCompetitorStrength(competitorScore);
                const reviewValue = typeof competitor.reviews === 'string' ? 
                  parseFloat(competitor.reviews) : (competitor.reviews || 0);
                const reviewShare = totalReviews > 0 
                  ? (reviewValue / totalReviews * 100) 
                  : 0;
                
                const strengthColorClass = 
                  strength.color === 'red' ? 'bg-red-900/20 text-red-400' : 
                  strength.color === 'yellow' ? 'bg-amber-900/20 text-amber-400' :
                  'bg-emerald-900/20 text-emerald-400';
                
                let cleanAsin = competitor.asin;
                if (typeof cleanAsin === 'string' && cleanAsin.includes('amazon.com/dp/')) {
                  const match = cleanAsin.match(/dp\/([A-Z0-9]{10})/);
                  if (match && match[1]) {
                    cleanAsin = match[1];
                  }
                }
                
                return (
                  <tr key={`removed-${competitor.asin}`} className="border-b border-slate-700/50 bg-red-900/10 opacity-50">
                    <td className="p-3 text-white line-through">-</td>
                    <td className="p-3 text-white truncate max-w-xs line-through">
                      {competitor.brand || "Unknown Brand"}
                    </td>
                    <td className="p-3 text-blue-400 line-through">{cleanAsin}</td>
                    <td className="p-3 text-white line-through">{formatCurrency(competitor.monthlyRevenue)}</td>
                    <td className="p-3 text-white line-through">{competitor.marketShare.toFixed(2)}%</td>
                    <td className="p-3 text-white line-through">{reviewShare.toFixed(2)}%</td>
                    <td className="p-3 text-white line-through">{competitorScore.toFixed(2)}%</td>
                    <td className="p-3 line-through">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${strengthColorClass}`}>
                        {strength.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => handleRestoreCompetitor(competitor.asin)}
                        className="p-1 hover:bg-emerald-500/20 rounded-lg text-emerald-400 hover:text-emerald-300 transition-colors"
                        title="Restore competitor"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    );
  };
  
  // Modify the button UI for the save button to show loading and complete states
  const renderActionButtons = () => {
    // Removed floating buttons - no longer needed
    return null;
  };
  
  // Update the render function to use the new renderCompetitorOverview function
  const render = () => {
    // Safely check if we have enough data to render
    if (!competitors?.length || !isClient) {
      return renderLoadingState();
    }

    return (
      <div className="space-y-6">
        {/* Header metrics and main assessment cards */}
        {renderHeaderMetrics()}
        {renderMarketEntryAssessment()}
        
        {/* Detailed Competitor Analysis with Tabs */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
          <h2 className="text-xl font-bold text-white p-6 pb-0">Detailed Competitor Analysis</h2>
          {renderCharts()}
        </div>
        
        
        {/* Market Visuals */}
        {competitors.length > 0 && (
          <div>
            {/* Using the key to trigger useEffect when data changes */}
            <MarketVisuals 
              competitors={competitors as any} 
              rawData={keepaResults || []} 
            />
          </div>
        )}
      </div>
    );
  };

  // Main return
  return (
    <div className="min-h-screen bg-[#d3d3d3] dark:bg-slate-900 py-6">
      {/* Market analysis content */}
      <div className="bg-white/90 dark:bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50">
        {/* Add buttons at the top */}
        <div className="flex justify-end items-center gap-3 p-4 border-b border-gray-200 dark:border-slate-700/50">
          {/* Buttons are now rendered by the renderActionButtons function */}
        </div>
        {render()}
      </div>
      
      {/* Render action buttons separately */}
      {renderActionButtons()}
      
      {/* Recalculate Prompt Modal */}
      {showRecalculatePrompt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Recalculate Analysis</h3>
                <p className="text-gray-600 dark:text-slate-400 text-sm">Update your market score</p>
              </div>
            </div>
            
            <div className="bg-gray-100 dark:bg-slate-700/30 rounded-lg p-4 mb-6">
              <p className="text-gray-700 dark:text-slate-300 text-sm mb-2">
                You've removed {removedCompetitors.size} weak competitor{removedCompetitors.size !== 1 ? 's' : ''} from your analysis.
              </p>
              <p className="text-gray-900 dark:text-white font-medium">
                Recalculate to see your updated market score with the filtered competitor set.
              </p>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRecalculatePrompt(false);
                  // Restore all removed competitors
                  setRemovedCompetitors(new Set());
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRecalculatePrompt(false);
                  handleResetCalculation();
                }}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 rounded-lg text-white transition-colors flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                Recalculate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to extract fulfillment method
const extractFulfillmentMethod = (competitor: Competitor): string => {
  if (competitor?.fulfillment) {
    return competitor.fulfillment;
  }
  if (competitor?.fulfillmentMethod) {
    return competitor.fulfillmentMethod;
  }
  if (competitor?.fulfilledBy) {
    return competitor.fulfilledBy;
  }
  return 'Unknown';
};

// Add the CompetitorScoreDetails component definition
const CompetitorScoreDetails = ({ score, competitor }) => {
  const [showDetails, setShowDetails] = useState(false);
  
  // Define the same weighting factors from scoring.ts
  const weights = {
    // HIGHEST IMPACT
    monthlySales: 2.0,
    reviews: 1.8,
    
    // MEDIUM IMPACT
    marketShare: 1.5,
    monthlyRevenue: 1.5,
    bsr: 1.3,
    rating: 1.3,
    reviewShare: 1.3,
    
    // LOWEST IMPACT
    price: 1.0,
    fulfillment: 0.8,
    listingScore: 0.8
  };
  
  if (!competitor) return null;
  
  // Calculate raw scores
  const priceScore = MetricScoring.price(competitor.price);
  const bsrScore = MetricScoring.bsr(competitor.bsr);
  const salesScore = MetricScoring.monthlySales(competitor.monthlySales);
  const revenueScore = MetricScoring.monthlyRevenue(competitor.monthlyRevenue);
  const ratingScore = MetricScoring.rating(competitor.rating);
  const reviewsScore = MetricScoring.reviews(competitor.reviews);
  const fulfillmentScore = MetricScoring.fulfillment(competitor.fulfilledBy || competitor.fulfillment);
  const listingScore = competitor.score !== null && competitor.score !== undefined ? 
    MetricScoring.listingScore(competitor.score) : null;
  
  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="inline-flex items-center text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
      >
        <Info className="w-3 h-3 mr-1" /> Details
      </button>
      
      {showDetails && (
        <div className="absolute z-50 w-80 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3 shadow-xl right-0 mt-2">
          <div className="text-xs text-gray-600 dark:text-slate-400 mb-2">
            <h4 className="text-gray-900 dark:text-white text-sm font-medium mb-1">Score Breakdown</h4>
            <div className="text-xs text-gray-700 dark:text-slate-300 mb-2">Showing raw scores with weight multipliers</div>
            <div className="space-y-1.5">
              <div className="grid grid-cols-12">
                <span className="col-span-5">Metric</span>
                <span className="col-span-2">Raw</span>
                <span className="col-span-2">Weight</span>
                <span className="col-span-3">Weighted</span>
              </div>
            
              {/* High Impact */}
              <div className="border-t border-gray-300 dark:border-slate-700 py-1">
                <div className="text-gray-700 dark:text-slate-300 font-medium mb-1">HIGH IMPACT</div>
              </div>
              
              <div className="grid grid-cols-12 items-center">
                <span className="col-span-5">Monthly Sales:</span>
                <span className="col-span-2">{salesScore}/10</span>
                <span className="col-span-2">×{weights.monthlySales}</span>
                <span className="col-span-3 text-emerald-400">{(salesScore * weights.monthlySales).toFixed(1)}</span>
              </div>
              
              <div className="grid grid-cols-12 items-center">
                <span className="col-span-5">Reviews:</span>
                <span className="col-span-2">{reviewsScore}/10</span>
                <span className="col-span-2">×{weights.reviews}</span>
                <span className="col-span-3 text-emerald-400">{(reviewsScore * weights.reviews).toFixed(1)}</span>
              </div>
              
              {/* Medium Impact */}
              <div className="border-t border-gray-300 dark:border-slate-700 py-1">
                <div className="text-gray-700 dark:text-slate-300 font-medium mb-1">MEDIUM IMPACT</div>
              </div>
              
              {competitor.marketShare !== undefined && competitor.marketShare !== null && (
                <div className="grid grid-cols-12 items-center">
                  <span className="col-span-5">Market Share:</span>
                  <span className="col-span-2">{Math.min(10, Math.max(1, Math.ceil(competitor.marketShare / 3)))}/10</span>
                  <span className="col-span-2">×{weights.marketShare}</span>
                  <span className="col-span-3 text-emerald-400">
                    {(Math.min(10, Math.max(1, Math.ceil(competitor.marketShare / 3))) * weights.marketShare).toFixed(1)}
                  </span>
                </div>
              )}
              
              <div className="grid grid-cols-12 items-center">
                <span className="col-span-5">Monthly Revenue:</span>
                <span className="col-span-2">{revenueScore}/10</span>
                <span className="col-span-2">×{weights.monthlyRevenue}</span>
                <span className="col-span-3 text-emerald-400">{(revenueScore * weights.monthlyRevenue).toFixed(1)}</span>
              </div>
              
              <div className="grid grid-cols-12 items-center">
                <span className="col-span-5">BSR:</span>
                <span className="col-span-2">{bsrScore}/10</span>
                <span className="col-span-2">×{weights.bsr}</span>
                <span className="col-span-3 text-emerald-400">{(bsrScore * weights.bsr).toFixed(1)}</span>
              </div>
              
              <div className="grid grid-cols-12 items-center">
                <span className="col-span-5">Rating:</span>
                <span className="col-span-2">{ratingScore}/10</span>
                <span className="col-span-2">×{weights.rating}</span>
                <span className="col-span-3 text-emerald-400">{(ratingScore * weights.rating).toFixed(1)}</span>
              </div>
              
              {competitor.reviewShare !== undefined && competitor.reviewShare !== null && (
                <div className="grid grid-cols-12 items-center">
                  <span className="col-span-5">Review Share:</span>
                  <span className="col-span-2">{Math.min(10, Math.max(1, Math.ceil(competitor.reviewShare / 3)))}/10</span>
                  <span className="col-span-2">×{weights.reviewShare}</span>
                  <span className="col-span-3 text-emerald-400">
                    {(Math.min(10, Math.max(1, Math.ceil(competitor.reviewShare / 3))) * weights.reviewShare).toFixed(1)}
                  </span>
                </div>
              )}
              
              {/* Low Impact */}
              <div className="border-t border-gray-300 dark:border-slate-700 py-1">
                <div className="text-gray-700 dark:text-slate-300 font-medium mb-1">LOW IMPACT</div>
              </div>
              
              <div className="grid grid-cols-12 items-center">
                <span className="col-span-5">Price:</span>
                <span className="col-span-2">{priceScore}/10</span>
                <span className="col-span-2">×{weights.price}</span>
                <span className="col-span-3 text-emerald-400">{(priceScore * weights.price).toFixed(1)}</span>
              </div>
              
              <div className="grid grid-cols-12 items-center">
                <span className="col-span-5">Fulfillment:</span>
                <span className="col-span-2">{fulfillmentScore}/10</span>
                <span className="col-span-2">×{weights.fulfillment}</span>
                <span className="col-span-3 text-emerald-400">{(fulfillmentScore * weights.fulfillment).toFixed(1)}</span>
              </div>
              
              {listingScore !== null && (
                <div className="grid grid-cols-12 items-center">
                  <span className="col-span-5">Listing Score:</span>
                  <span className="col-span-2">{listingScore}/10</span>
                  <span className="col-span-2">×{weights.listingScore}</span>
                  <span className="col-span-3 text-emerald-400">{(listingScore * weights.listingScore).toFixed(1)}</span>
                </div>
              )}
              
              <div className="border-t border-gray-300 dark:border-slate-700 pt-1 mt-1 font-medium">
                <div className="flex justify-between text-gray-900 dark:text-white">
                  <span>Total Score:</span>
                  <span>{score}%</span>
                </div>
              </div>
            </div>
          </div>
          <button 
            onClick={() => setShowDetails(false)}
            className="absolute top-2 right-2 text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

// Add a custom tooltip component for brand hover
const BrandTooltip = ({ title, isVisible, position }) => {
  if (!isVisible || !title) return null;
  
  return (
    <div 
      className="absolute z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3 shadow-xl max-w-md"
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y + 10}px`,
        transform: 'translateX(-50%)',
      }}
    >
      <p className="text-gray-700 dark:text-slate-300 text-sm">
        {title}
      </p>
    </div>
  );
};

export default ProductVettingResults;
