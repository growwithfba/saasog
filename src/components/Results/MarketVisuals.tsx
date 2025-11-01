'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine
} from 'recharts';
import { formatCurrency } from '../../utils/formatters';
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, flexRender, ColumnDef, ColumnResizeMode
} from '@tanstack/react-table';
import { getStabilityCategory, calculateScore, getCompetitorStrength } from '../../utils/scoring';
import { ChevronDown, ChevronUp, Filter } from 'lucide-react';

interface CompetitorData {
  asin: string;
  title: string;
  price: number;
  brand: string;
  monthlySales: number;
  monthlyRevenue: number;
  reviews?: number;
  marketShare?: number;
  keepaAnalysis?: {
    analysis?: {
      bsr?: {
        trend: 'improving' | 'declining' | 'stable';
        stability: number;
        score: number;
        details?: {
          baseScore: number;
          meanBSR: number;
          stabilityBonus: number;
          trendBonus: number;
        };
      };
    };
  };
}

interface BSRTimelineScore {
  finalScore: number;
  timeInRanges: {
    under10k: number;
    under25k: number;
    under50k: number;
    under100k: number;
    under250k: number;
    above250k: number;
  };
  volatilityPenalty: number;
}

interface KeepaData {
  analysis: {
    bsr: {
      stability: number;
      trend: {
        direction: string;
      };
      details: {
        performanceSummary: string;
        threeMonth: BSRTimelineScore;
        sixMonth: BSRTimelineScore;
        twelveMonth: BSRTimelineScore;
      };
    };
    price: {
      stability: number;
      trend: {
        direction: string;
      };
    };
  };
}

interface MarketVisualsProps {
  competitors: CompetitorData[];
  rawData: any[]; // Consider creating a specific type for this
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EC4899'];
const OTHER_COLOR = '#94A3B8'; // Color for "Other" category in pie chart

// Define table columns
const columns: ColumnDef<CompetitorData>[] = [
  {
    accessorKey: 'asin',
    header: 'ASIN',
    size: 120,
    cell: ({ getValue }) => {
      const asinValue = getValue<string>();
      let asin, url;
      
      if (asinValue.includes('HYPERLINK')) {
        asin = asinValue.match(/"([^"]+)","([^"]+)"/)?.[2] || asinValue;
        url = asinValue.match(/"([^"]+)"/)?.[1];
      } else {
        asin = asinValue.trim();
        url = `https://www.amazon.com/dp/${asin}`;
      }
      
      return (
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 hover:underline"
        >
          {asin}
        </a>
      );
    }
  },
  {
    accessorKey: 'price',
    header: 'Price',
    size: 100,
    cell: ({ getValue }) => formatCurrency(getValue<number>()),
  },
  {
    accessorKey: 'monthlySales',
    header: 'Monthly Sales',
    size: 120,
    cell: ({ getValue }) => getValue<number>().toLocaleString(),
  },
  {
    accessorKey: 'monthlyRevenue',
    header: 'Monthly Revenue',
    size: 150,
    cell: ({ getValue }) => formatCurrency(getValue<number>()),
  },
];

const getPerformanceColor = (score: number): string => {
  if (!score || isNaN(score)) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-blue-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
};

const getStabilityBadgeStyle = (stabilityCategory: string): string => {
  switch (stabilityCategory.toLowerCase()) {
    case 'very stable':
      return 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/30';
    case 'stable':
      return 'bg-green-500/30 text-green-400';
    case 'moderate':
      return 'bg-blue-500/30 text-blue-400';
    case 'somewhat stable':
      return 'bg-yellow-500/30 text-yellow-400';
    case 'unstable':
      return 'bg-orange-500/30 text-orange-400';
    case 'poor':
      return 'bg-red-500/30 text-red-400';
    default:
      return 'bg-slate-500/30 text-slate-400';
  }
};

const renderBSRScore = (score?: number) => {
  if (score === undefined || score === null) {
    return <span className="text-slate-500">No data</span>;
  }
  return <span className={getPerformanceColor(score)}>{score.toFixed(1)}%</span>;
};

const renderStabilityScore = (stability?: number) => {
  if (stability === undefined || stability === null) {
    return <span className="text-slate-500">No data</span>;
  }
  const percentage = stability * 100;
  return (
    <span className={getPerformanceColor(percentage)}>
      {percentage.toFixed(1)}%
    </span>
  );
};

const renderTrendDirection = (trend?: { 
  direction: 'up' | 'down' | 'stable';
  strength: number;
  confidence: number;
}) => {
  if (!trend) {
    return <span className="text-slate-500">No trend data</span>;
  }

  const directionIcons = {
    up: '↑',
    down: '↓',
    stable: '→'
  };

  const color = trend.strength > 0.5 
    ? 'text-emerald-400' 
    : trend.strength < 0.2 
      ? 'text-red-400' 
      : 'text-blue-400';

  return (
    <span className={color}>
      {directionIcons[trend.direction]} 
      {trend.direction.toUpperCase()}
      {trend.confidence > 0 && 
        <span className="text-xs ml-1">
          ({(trend.confidence * 100).toFixed(0)}% confidence)
        </span>
      }
    </span>
  );
};

// Add this function to interpret BSR data trends
const interpretBSRHistory = (bsrHistory: Array<{ timestamp: number; value: number }>) => {
  if (!bsrHistory || bsrHistory.length === 0) {
    return { 
      staysUnder50k: false,
      percentUnder50k: 0,
      hasSeasonalPattern: false,
      avgBSR: 0,
      consistentlyPoor: false
    };
  }
  
  const values = bsrHistory.map(point => point.value);
  const avgBSR = values.reduce((sum, val) => sum + val, 0) / values.length;
  const pointsUnder50k = values.filter(v => v < 50000).length;
  const percentUnder50k = (pointsUnder50k / values.length) * 100;
  
  // Check for consistently poor BSR (never under 50k)
  const consistentlyPoor = pointsUnder50k === 0;
  
  // Check for seasonal patterns (better BSR in Q4)
  const timestamps = bsrHistory.map(point => new Date(point.timestamp));
  const q4Points = bsrHistory.filter(point => {
    const month = new Date(point.timestamp).getMonth();
    return month >= 9 && month <= 11; // Oct-Dec
  });
  
  const nonQ4Points = bsrHistory.filter(point => {
    const month = new Date(point.timestamp).getMonth();
    return month < 9 || month > 11;
  });
  
  const q4AvgBSR = q4Points.length > 0 ? 
    q4Points.reduce((sum, point) => sum + point.value, 0) / q4Points.length : 0;
  
  const nonQ4AvgBSR = nonQ4Points.length > 0 ? 
    nonQ4Points.reduce((sum, point) => sum + point.value, 0) / nonQ4Points.length : 0;
  
  const hasSeasonalPattern = q4AvgBSR > 0 && nonQ4AvgBSR > 0 && 
    q4AvgBSR < nonQ4AvgBSR * 0.7; // 30% better in Q4
  
  return {
    staysUnder50k: percentUnder50k > 90,
    percentUnder50k,
    hasSeasonalPattern,
    avgBSR,
    consistentlyPoor
  };
};

// Get color for BSR percentage under 50k
const getBSRPercentageColor = (percentage: number): string => {
  if (percentage >= 85) return 'text-emerald-400';
  if (percentage >= 65) return 'text-yellow-400';
  return 'text-red-400';
};

// Get color for average BSR based on value ranges
const getBSRColor = (bsr: number): string => {
  if (bsr <= 2000) return 'text-red-400'; // Very competitive - hard to rank
  if (bsr <= 10000) return 'text-yellow-400'; // Competitive but possible
  if (bsr <= 50000) return 'text-emerald-400'; // Ideal BSR range
  if (bsr <= 75000) return 'text-yellow-400'; // Acceptable but not ideal
  return 'text-red-400'; // Poor BSR - very difficult to compete
};

// Function to determine price stability category
const getPriceStabilityCategory = (stability: number) => {
  if (stability >= 0.9) return 'Very Stable';
  if (stability >= 0.75) return 'Stable';
  if (stability >= 0.6) return 'Moderate';
  if (stability >= 0.45) return 'Unstable';
  return 'Highly Unstable';
};

const MarketVisuals: React.FC<MarketVisualsProps> = ({ 
  competitors, 
  rawData = [] 
}) => {
  const [activeMetrics, setActiveMetrics] = useState({
    sales: true,
    revenue: true,
    reviews: false
  });
  const [selectedCompetitors, setSelectedCompetitors] = useState<string[]>([]);
  const [competitorView, setCompetitorView] = useState('all'); // 'all', 'top5', 'bottom5'
  const [showAllHistorical, setShowAllHistorical] = useState(false);
  const [showAllMarketShare, setShowAllMarketShare] = useState(false);

  const toggleMetric = (metric: 'sales' | 'revenue' | 'reviews') => {
    setActiveMetrics(prev => {
      // If the metric is already active, deactivate it
      if (prev[metric]) {
        return {
          ...prev,
          [metric]: false
        };
      }
      
      // Count how many metrics are currently active
      const activeCount = Object.values(prev).filter(Boolean).length;
      
      // If two metrics are already active, disable the oldest one
      if (activeCount >= 2) {
        // Find which metrics are active
        const activeMetricKeys = Object.keys(prev).filter(key => prev[key as keyof typeof prev]) as Array<keyof typeof prev>;
        
        // Deactivate the first metric in the list
        if (activeMetricKeys.length > 0) {
          return {
            ...prev,
            [activeMetricKeys[0]]: false,  // Disable the first active metric
            [metric]: true                 // Enable the new metric
          };
        }
      }
      
      // Otherwise just enable the new metric
      return {
        ...prev,
        [metric]: true
      };
    });
  };

  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataValidated, setDataValidated] = useState(false);

  // Helper functions
  const extractAsin = (hyperlink: string): string => {
    // If it's already a clean ASIN, just return it
    if (/^[A-Z0-9]{10}$/.test(hyperlink)) {
      return hyperlink;
    }
    
    // Try to extract from HYPERLINK format: HYPERLINK("https://amazon.com/dp/B01234ABCD","B01234ABCD")
    if (hyperlink.includes('HYPERLINK')) {
      const match = hyperlink.match(/HYPERLINK\s*\(\s*"[^"]*"\s*,\s*"([A-Z0-9]{10})"\s*\)/i);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // Try to extract from URL format: https://www.amazon.com/something/dp/B01234ABCD/something
    const dpMatch = hyperlink.match(/\/dp\/([A-Z0-9]{10})/i);
    if (dpMatch && dpMatch[1]) {
      return dpMatch[1];
    }
    
    // Try to find any 10-character alphanumeric string that matches ASIN pattern
    const asinMatch = hyperlink.match(/\b([A-Z0-9]{10})\b/);
    if (asinMatch && asinMatch[1]) {
      return asinMatch[1];
    }
    
    // If all else fails, log the issue and return an empty string
    console.warn('Could not extract ASIN from:', hyperlink);
    return '';
  };

  // Merged competitor data with Keepa analysis
  const mergedCompetitorData = useMemo(() => {
    if (!competitors?.length) return [];

    // Debug data issues
    console.log('MarketVisuals - Raw data check:', {
      competitorsCount: competitors?.length || 0,
      rawDataExists: !!rawData,
      rawDataCount: rawData?.length || 0
    });

    // If no rawData, warn and continue without Keepa data
    if (!rawData || rawData.length === 0) {
      console.warn('No Keepa data available for any competitors');
      // Return competitors without Keepa data
      return competitors.map(competitor => {
        const extractedAsin = extractAsin(competitor.asin);
        return {
          ...competitor,
          brand: competitor.brand || 
                (competitor as any)?.Brand || 
                (competitor as any)?.['Brand Name'] || 
                (competitor as any)?.['Manufacturer'] || 
                (competitor as any)?.manufacturer || 
                'Unknown',
          asin: extractedAsin,
          keepaAnalysis: null,
          bsrStability: 0.5, // Default values
          priceStability: 0.5,
          threeMonthScore: 50,
          analysisDetails: {
            trend: { direction: 'stable', strength: 0, confidence: 0 },
            competitiveScore: 5,
            meanBSR: null,
            priceHistory: [],
            bsrHistory: [],
            bsrTrend: 'stable',
            bsrStrength: 0,
            priceTrend: 'stable',
            priceStrength: 0
          }
        };
      });
    }

    const result = competitors.map(competitor => {
      const extractedAsin = extractAsin(competitor.asin);
      
      // Log the ASIN extraction for each competitor
      if (extractedAsin) {
        console.log(`ASIN extracted: "${extractedAsin}" from original: "${competitor.asin}"`);
      } else {
        console.warn(`Failed to extract ASIN from: "${competitor.asin}"`);
      }
      
      // Find matching Keepa data - log whether found
      const keepaAnalysis = rawData?.find(k => k.asin === extractedAsin);
      if (!keepaAnalysis && extractedAsin) {
        console.warn(`No matching Keepa data found for ASIN: ${extractedAsin}`);
        
        // Show ASINs in rawData for debugging
        if (rawData?.length > 0) {
          console.log('Available Keepa ASINs:', rawData.map(k => k.asin).join(', '));
        }
      }
      
      const bsrAnalysis = keepaAnalysis?.analysis?.bsr || {
        stability: 0.5,
        trend: {
          direction: 'stable',
          strength: 0,
          confidence: 0
        }
      };

      const priceAnalysis = keepaAnalysis?.analysis?.price || {
        stability: 0.5,
        trend: {
          direction: 'stable',
          strength: 0
        }
      };

      const competitiveScore = keepaAnalysis?.analysis?.competitivePosition?.score || 5;

      return {
        ...competitor,
        brand: competitor.brand || 
               (competitor as any)?.Brand || 
               (competitor as any)?.['Brand Name'] || 
               (competitor as any)?.['Manufacturer'] || 
               (competitor as any)?.manufacturer || 
               'Unknown',
        asin: extractedAsin,
        keepaAnalysis,
        bsrStability: bsrAnalysis.stability,
        priceStability: priceAnalysis.stability,
        threeMonthScore: bsrAnalysis.stability * 100,
        analysisDetails: {
          trend: bsrAnalysis.trend,
          competitiveScore,
          meanBSR: keepaAnalysis?.productData?.bsr?.length > 0 
            ? Math.round(
                keepaAnalysis.productData.bsr.reduce((sum, point) => sum + point.value, 0) / 
                keepaAnalysis.productData.bsr.length
              )
            : null,
          priceHistory: keepaAnalysis?.productData?.prices || [],
          bsrHistory: keepaAnalysis?.productData?.bsr || [],
          bsrTrend: bsrAnalysis.trend.direction,
          bsrStrength: bsrAnalysis.trend.strength,
          priceTrend: priceAnalysis.trend.direction,
          priceStrength: priceAnalysis.trend.strength
        }
      };
    });
    
    return result;
  }, [competitors, rawData]);

  // Get top 5 competitors by monthly revenue
  const top5Competitors = useMemo(() => {
    return [...mergedCompetitorData]
      .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)
      .slice(0, 5);
  }, [mergedCompetitorData]);

  // Bottom 5 competitors by monthly revenue
  const bottom5Competitors = useMemo(() => {
    return [...mergedCompetitorData]
      .sort((a, b) => a.monthlyRevenue - b.monthlyRevenue)
      .slice(0, 5);
  }, [mergedCompetitorData]);

  // Calculate total market value
  const totalMarketValue = useMemo(() => 
    mergedCompetitorData.reduce((sum, comp) => sum + comp.monthlyRevenue, 0),
    [mergedCompetitorData]
  );

  // Calculate market share for pie chart (top 5 + "Other")
  const pieChartData = useMemo(() => {
    // Use top 5 competitors
    const topCompetitors = top5Competitors;
    
    // Calculate total revenue of top competitors
    const topRevenueTotal = topCompetitors.reduce((sum, comp) => sum + comp.monthlyRevenue, 0);
    
    // Calculate revenue for "Other" category
    const otherRevenue = totalMarketValue - topRevenueTotal;
    
    // Create pie chart data
    const data = topCompetitors.map(comp => ({
      name: comp.title.length > 20 ? `${comp.title.substring(0, 20)}...` : comp.title,
      value: comp.monthlyRevenue,
      percentage: (comp.monthlyRevenue / totalMarketValue) * 100,
      formattedRevenue: formatCurrency(comp.monthlyRevenue),
      asin: comp.asin
    }));
    
    // Add "Other" category if there are more than 5 competitors
    if (mergedCompetitorData.length > 5 && !showAllMarketShare) {
      data.push({
        name: 'Other Competitors',
        value: otherRevenue,
        percentage: (otherRevenue / totalMarketValue) * 100,
        formattedRevenue: formatCurrency(otherRevenue),
        asin: 'other'
      });
    }
    
    // If showing all, return data for all competitors
    if (showAllMarketShare) {
      return mergedCompetitorData.map(comp => ({
        name: comp.title.length > 20 ? `${comp.title.substring(0, 20)}...` : comp.title,
        value: comp.monthlyRevenue,
        percentage: (comp.monthlyRevenue / totalMarketValue) * 100,
        formattedRevenue: formatCurrency(comp.monthlyRevenue),
        asin: comp.asin
      }));
    }
    
    return data;
  }, [mergedCompetitorData, top5Competitors, totalMarketValue, showAllMarketShare]);

  // Table state
  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');
  const [sorting, setSorting] = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState({});

  const table = useReactTable<CompetitorData>({
    data: mergedCompetitorData,
    columns: columns as ColumnDef<CompetitorData>[],
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode,
  });

  // Render helper for missing data
  const renderMissingDataMessage = (competitor: any, index: number) => {
    // First, check if Keepa analysis is null (meaning no data was found)
    if (!competitor.keepaAnalysis) {
      return (
        <div className="text-slate-400 p-4 bg-slate-800/30 rounded-lg" key={`${competitor.asin}-${index}-no-data`}>
          <p className="mb-2">No Keepa Data Available</p>
          <p className="text-sm opacity-75">
            Unable to fetch analysis for ASIN: {competitor.asin}
          </p>
          <p className="text-xs mt-2 text-blue-400">
            Possible reasons:
            <ul className="list-disc pl-4 mt-1">
              <li>ASIN may not exist in Amazon catalog</li>
              <li>Product may be too new</li>
              <li>API key may have insufficient tokens</li>
            </ul>
          </p>
        </div>
      );
    }

    // Check if analysis object exists
    if (!competitor.keepaAnalysis.analysis) {
      return (
        <div className="text-slate-400 p-4 bg-slate-800/30 rounded-lg" key={`${competitor.asin}-${index}-no-analysis`}>
          <p className="mb-2">Analysis Not Available</p>
          <p className="text-sm opacity-75">
            Data retrieved but analysis failed for: {competitor.title}
          </p>
          <p className="text-xs mt-2 text-blue-400">
            Product data may be incomplete or too limited for meaningful analysis.
          </p>
        </div>
      );
    }

    // Check if BSR details are available
    if (!competitor.keepaAnalysis.analysis.bsr?.details) {
      return (
        <div className="text-slate-400 p-4 bg-slate-800/30 rounded-lg" key={`${competitor.asin}-${index}-incomplete-bsr`}>
          <p className="mb-2">Incomplete BSR Analysis</p>
          <p className="text-sm opacity-75">
            Missing detailed BSR data for: {competitor.title}
          </p>
          <p className="text-xs mt-2 text-blue-400">
            BSR history may be limited. Try refreshing or check product eligibility.
          </p>
        </div>
      );
    }

    return null;
  };

  // Toggle competitor selection
  const toggleCompetitor = (asin: string) => {
    setSelectedCompetitors(prev => 
      prev.includes(asin) 
        ? prev.filter(a => a !== asin) 
        : [...prev, asin]
    );
  };

  // Calculate average values for reference lines
  const averageRevenue = useMemo(() => 
    mergedCompetitorData.length > 0 
      ? mergedCompetitorData.reduce((sum, comp) => sum + comp.monthlyRevenue, 0) / mergedCompetitorData.length
      : 0,
    [mergedCompetitorData]
  );

  const averageSales = useMemo(() => 
    mergedCompetitorData.length > 0 
      ? mergedCompetitorData.reduce((sum, comp) => sum + comp.monthlySales, 0) / mergedCompetitorData.length
      : 0,
    [mergedCompetitorData]
  );

  // Get filtered competitors based on view setting
  const getFilteredCompetitors = useMemo(() => {
    if (competitorView === 'all') {
      // For all competitors view, limit to a manageable number if there are too many
      return mergedCompetitorData.length > 50 
        ? mergedCompetitorData.slice(0, 50)  // Limit to 50 for performance
        : mergedCompetitorData;
    } else if (competitorView === 'top5') {
      return top5Competitors;
    } else if (competitorView === 'bottom5') {
      return bottom5Competitors;
    }
    return mergedCompetitorData;
  }, [mergedCompetitorData, competitorView, top5Competitors, bottom5Competitors]);

  // Always use top 5 competitors for Historical Analysis
  const getHistoricalCompetitors = useMemo(() => {
    return top5Competitors;
  }, [top5Competitors]);

  // Calculate grid layout based on number of competitors
  const getHistoricalGridClasses = useMemo(() => {
    const competitorCount = getHistoricalCompetitors.length;
    
    if (competitorCount <= 2) {
      return "grid grid-cols-1 gap-4";
    } else if (competitorCount <= 6) {
      return "grid grid-cols-1 lg:grid-cols-2 gap-4";
    } else if (competitorCount <= 9) {
      return "grid grid-cols-1 lg:grid-cols-3 gap-4";
    } else {
      return "grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-4";
    }
  }, [getHistoricalCompetitors]);

  return (
    <div className="space-y-8">
      {/* Top 5 Competitors Chart */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-700/50">
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Competitor Graph Analysis</h2>
            
            {/* View Selector */}
            <div className="flex items-center gap-4">
              {/* View Controls */}
              <div className="bg-slate-800/50 rounded-lg p-1 flex">
                <button
                  onClick={() => setCompetitorView('all')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    competitorView === 'all' 
                      ? 'bg-blue-500/30 text-blue-400' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  All Competitors
                </button>
                <button
                  onClick={() => setCompetitorView('top5')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    competitorView === 'top5' 
                      ? 'bg-emerald-500/30 text-emerald-400' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  Top 5 Sales
                </button>
                <button
                  onClick={() => setCompetitorView('bottom5')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    competitorView === 'bottom5' 
                      ? 'bg-amber-500/30 text-amber-400' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  Bottom 5 Sales
                </button>
              </div>
              
              {/* Metric Controls */}
              <div className="flex gap-2">
                <button
                  onClick={() => toggleMetric('sales')}
                  className={`px-4 py-2 rounded-full transition-all duration-200 ${
                    activeMetrics.sales 
                      ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30' 
                      : 'bg-slate-700/30 text-slate-400 hover:bg-blue-500/10 hover:text-blue-400'
                  } text-sm`}
                >
                  Sales
                </button>
                <button
                  onClick={() => toggleMetric('revenue')}
                  className={`px-4 py-2 rounded-full transition-all duration-200 ${
                    activeMetrics.revenue 
                      ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30' 
                      : 'bg-slate-700/30 text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-400'
                  } text-sm`}
                >
                  Revenue
                </button>
                <button
                  onClick={() => toggleMetric('reviews')}
                  className={`px-4 py-2 rounded-full transition-all duration-200 ${
                    activeMetrics.reviews 
                      ? 'bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30' 
                      : 'bg-slate-700/30 text-slate-400 hover:bg-violet-500/10 hover:text-violet-400'
                  } text-sm`}
                >
                  Reviews
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <ResponsiveContainer width="100%" height={450}>
            <ComposedChart 
              data={getFilteredCompetitors}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              barGap={5}
              barSize={40}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="brand"
                stroke="#94a3b8"
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
                height={65}
                tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 'bold' }}
                angle={-45}
                textAnchor="end"
                interval={0}
              />
              <YAxis 
                yAxisId="left"
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8' }}
                tickFormatter={(value) => {
                  // Show $ sign for revenue
                  return `$${value.toLocaleString()}`;
                }}
                domain={[0, 'dataMax * 1.1']}
                width={70}
                label={{ value: 'Revenue ($)', angle: -90, position: 'insideLeft', offset: -5, fill: '#94a3b8', fontSize: 12 }}
              />
              {activeMetrics.sales && (
                <YAxis 
                  yAxisId="right" 
                  orientation="right"
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8' }}
                  width={50}
                  tickFormatter={(value) => value.toLocaleString()}
                  domain={[0, 'dataMax * 1.1']}
                  label={{ value: 'Units', angle: 90, position: 'insideRight', offset: 5, fill: '#94a3b8', fontSize: 12 }}
                />
              )}
              {!activeMetrics.sales && activeMetrics.reviews && (
                <YAxis 
                  yAxisId="right" 
                  orientation="right"
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8' }}
                  width={50}
                  tickFormatter={(value) => value.toLocaleString()}
                  domain={[0, 'dataMax * 1.1']}
                  label={{ value: 'Reviews', angle: 90, position: 'insideRight', offset: 5, fill: '#94a3b8', fontSize: 12 }}
                />
              )}
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '0.5rem',
                  width: '280px', // Fixed width
                  overflow: 'hidden'
                }}
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    
                    const totalReviews = mergedCompetitorData.reduce((sum, comp) => sum + (comp.reviews || 0), 0);
                    const reviewShare = totalReviews > 0 ? ((data.reviews || 0) / totalReviews) * 100 : 0;
                    
                    return (
                      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-xl w-[280px]" key={`tooltip-${data.asin}-${Date.now()}`}>
                        <div className="text-blue-400 font-medium text-sm mb-1">
                          {data.brand || 'Unknown Brand'}
                        </div>
                        <p className="text-white text-sm mb-3 font-medium truncate" title={data.title}>
                          {data.title}
                        </p>
                        <div className="space-y-2">
                          {activeMetrics.revenue && (
                            <div key={`tooltip-${data.asin}-revenue`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">Revenue:</span>
                              <span className="text-emerald-400">${data.monthlyRevenue?.toLocaleString()}</span>
                            </div>
                          )}
                          {activeMetrics.sales && (
                            <div key={`tooltip-${data.asin}-sales`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">Sales:</span>
                              <span className="text-green-400">{data.monthlySales?.toLocaleString()} units</span>
                            </div>
                          )}
                          {activeMetrics.reviews && (
                            <div key={`tooltip-${data.asin}-reviews`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">Reviews:</span>
                              <span className="text-violet-400">{data.reviews?.toLocaleString()}</span>
                            </div>
                          )}
                          <div key={`tooltip-${data.asin}-market-share`} className="flex justify-between">
                            <span className="text-slate-400 text-sm">Market Share:</span>
                            <span className="text-amber-400">{data.marketShare?.toFixed(1)}%</span>
                          </div>
                          <div key={`tooltip-${data.asin}-review-share`} className="flex justify-between">
                            <span className="text-slate-400 text-sm">Review Share:</span>
                            <span className="text-pink-400">{reviewShare.toFixed(1)}%</span>
                          </div>
                          <div key={`tooltip-${data.asin}-competitor-score`} className="flex justify-between border-t border-slate-700 pt-1 mt-1">
                            <span className="text-slate-400 text-sm">Competitor Score:</span>
                            <span className={`${
                              parseFloat(calculateScore(data)) >= 60 ? "text-red-400" :
                              parseFloat(calculateScore(data)) >= 45 ? "text-amber-400" :
                              "text-emerald-400"
                            }`}>
                              {parseFloat(calculateScore(data)).toFixed(2)}%
                            </span>
                          </div>
                          <div key={`tooltip-${data.asin}-strength`} className="flex justify-between">
                            <span className="text-slate-400 text-sm">Strength:</span>
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              getCompetitorStrength(parseFloat(calculateScore(data))).color === 'red' ? 'bg-red-900/20 text-red-400' : 
                              getCompetitorStrength(parseFloat(calculateScore(data))).color === 'yellow' ? 'bg-amber-900/20 text-amber-400' :
                              'bg-emerald-900/20 text-emerald-400'
                            }`}>
                              {getCompetitorStrength(parseFloat(calculateScore(data))).label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend 
                wrapperStyle={{ color: '#94a3b8' }}
                payload={[
                  ...(activeMetrics.revenue ? [{ 
                    value: 'Monthly Revenue', 
                    type: 'square' as const, 
                    color: competitorView === 'top5' ? "#00cc44" : "#10B981"
                  }] : []),
                  ...(activeMetrics.sales ? [{ 
                    value: 'Monthly Sales (units)', 
                    type: 'square' as const, 
                    color: competitorView === 'top5' ? "#00cc44" : "#10B981"
                  }] : []),
                  ...(activeMetrics.reviews ? [{ 
                    value: 'Reviews', 
                    type: 'line' as const, 
                    color: "#FFB300"
                  }] : [])
                ]}
              />
              {activeMetrics.revenue && (
                <Bar 
                  yAxisId="left"
                  dataKey="monthlyRevenue"
                  name="Monthly Revenue"
                  fill="#38BDF8"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  shape={(props) => {
                    const { x, y, width, height, value } = props;
                    
                    // Use scoring system for coloring - REVERSED from competitor strength
                    // High revenue (green) = GOOD, Low revenue (red) = BAD
                    let score = 1;
                    
                    // Monthly revenue score based on MetricScoring.monthlyRevenue
                    if (value >= 10000) score = 10;
                    else if (value >= 9000) score = 9;
                    else if (value >= 7500) score = 8;
                    else if (value >= 6000) score = 7;
                    else if (value >= 5000) score = 6;
                    else if (value >= 4000) score = 5;
                    else if (value >= 3000) score = 4;
                    else if (value >= 2500) score = 3;
                    else if (value >= 1000) score = 2;
                    else score = 1;
                    
                    // Color spectrum: red (low revenue) -> yellow (medium revenue) -> green (high revenue)
                    const normalizedScore = score / 10; // Convert to 0-1 scale
                    
                    // Calculate colors based on score
                    let fillColor;
                    if (normalizedScore >= 0.8) {
                      // Green spectrum for high revenue (8-10)
                      const intensity = Math.min(1, (normalizedScore - 0.8) / 0.2);
                      fillColor = `rgb(${Math.round(20 + intensity * 30)}, ${Math.round(170 + intensity * 50)}, ${Math.round(80 + intensity * 20)})`;
                    } else if (normalizedScore >= 0.4) {
                      // Yellow spectrum for medium revenue (4-7)
                      const intensity = (normalizedScore - 0.4) / 0.4;
                      fillColor = `rgb(${Math.round(180 + intensity * 40)}, ${Math.round(150 + intensity * 30)}, ${Math.round(10 + intensity * 70)})`;
                    } else {
                      // Red spectrum for low revenue (1-3)
                      const intensity = normalizedScore / 0.4;
                      fillColor = `rgb(${Math.round(200 + intensity * 55)}, ${Math.round(30 + intensity * 120)}, ${Math.round(30 + intensity * 20)})`;
                    }
                    
                    // Add extra brightness to top5 view for first item
                    if (competitorView === 'top5') {
                      const index = getFilteredCompetitors.findIndex(comp => comp.monthlyRevenue === value);
                      if (index === 0) {
                        // Enhance color for the top competitor
                        fillColor = normalizedScore >= 0.8 ? '#00cc44' : 
                                   normalizedScore >= 0.4 ? '#ffcc00' : 
                                   '#ff3333';
                      }
                    }
                    
                    return <rect x={x} y={y} width={width} height={height} fill={fillColor} rx={4} ry={4} />;
                  }}
                />
              )}
              {activeMetrics.sales && (
                <Bar
                  yAxisId="right"
                  dataKey="monthlySales"
                  name="Monthly Sales"
                  fill="#10B981"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  shape={(props) => {
                    const { x, y, width, height, value } = props;
                    
                    // Use scoring system for coloring - REVERSED from competitor strength
                    // High sales (green) = GOOD, Low sales (red) = BAD
                    let score = 1;
                    
                    // Monthly sales score based on MetricScoring.monthlySales
                    if (value > 600) score = 10;
                    else if (value > 500) score = 9;
                    else if (value > 400) score = 8;
                    else if (value > 300) score = 7;
                    else if (value > 240) score = 6;
                    else if (value > 180) score = 5;
                    else if (value > 120) score = 4;
                    else if (value > 60) score = 3;
                    else if (value > 30) score = 2;
                    else score = 1;
                    
                    // Color spectrum: red (low sales) -> yellow (medium sales) -> green (high sales)
                    const normalizedScore = score / 10; // Convert to 0-1 scale
                    
                    // Calculate colors based on score
                    let fillColor;
                    if (normalizedScore >= 0.8) {
                      // Green spectrum for high sales (8-10)
                      const intensity = Math.min(1, (normalizedScore - 0.8) / 0.2);
                      fillColor = `rgb(${Math.round(20 + intensity * 30)}, ${Math.round(170 + intensity * 50)}, ${Math.round(80 + intensity * 20)})`;
                    } else if (normalizedScore >= 0.4) {
                      // Yellow spectrum for medium sales (4-7)
                      const intensity = (normalizedScore - 0.4) / 0.4;
                      fillColor = `rgb(${Math.round(180 + intensity * 40)}, ${Math.round(150 + intensity * 30)}, ${Math.round(10 + intensity * 70)})`;
                    } else {
                      // Red spectrum for low sales (1-3)
                      const intensity = normalizedScore / 0.4;
                      fillColor = `rgb(${Math.round(200 + intensity * 55)}, ${Math.round(30 + intensity * 120)}, ${Math.round(30 + intensity * 20)})`;
                    }
                    
                    // Add extra brightness to top5 view for first item
                    if (competitorView === 'top5') {
                      const index = getFilteredCompetitors.findIndex(comp => comp.monthlySales === value);
                      if (index === 0) {
                        // Enhance color for the top competitor
                        fillColor = normalizedScore >= 0.8 ? '#00cc44' : 
                                   normalizedScore >= 0.4 ? '#ffcc00' : 
                                   '#ff3333';
                      }
                    }
                    
                    return <rect x={x} y={y} width={width} height={height} fill={fillColor} rx={4} ry={4} />;
                  }}
                />
              )}
              {activeMetrics.reviews && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="reviews"
                  name="Reviews"
                  stroke="#FFB300"
                  strokeWidth={3}
                  dot={{ r: 5, fill: "#FFB300", strokeWidth: 1, stroke: "#FF8F00" }}
                  activeDot={{ r: 7, fill: "#FF8F00" }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Historical Analysis Section */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-700/50">
        <div className="p-6 border-b border-slate-700/50">
          <div>
            <h2 className="text-2xl font-bold text-white">Top 5 Competitors - BSR and Pricing Analysis</h2>
            <p className="text-slate-400 mt-1">
              Based on the last 12 months of Keepa data.
            </p>
          </div>
        </div>
        
        <div className="p-6 overflow-x-overlay">
          <div className="flex space-x-4 pb-4 min-w-full overflow-x-auto">
            {getHistoricalCompetitors.map((competitor, index) => (
              <div key={`competitor-card-${competitor.asin}-${index}`} className="bg-slate-700/30 rounded-lg p-4 w-[500px] flex-shrink-0">
                {/* Rank label */}
                <div className="mb-2 flex justify-between items-center">
                  <span className="text-xs font-semibold px-2 py-1 rounded bg-blue-500/20 text-blue-400">
                    {index === 0 ? 'TOP COMPETITOR' : 
                     index === 1 ? '2ND COMPETITOR' : 
                     index === 2 ? '3RD COMPETITOR' : 
                     `${index + 1}TH COMPETITOR`}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${
                    getCompetitorStrength(parseFloat(calculateScore(competitor))).color === 'red' ? 'bg-red-900/20 text-red-400' : 
                    getCompetitorStrength(parseFloat(calculateScore(competitor))).color === 'yellow' ? 'bg-amber-900/20 text-amber-400' :
                    'bg-emerald-900/20 text-emerald-400'
                  }`}>
                    {getCompetitorStrength(parseFloat(calculateScore(competitor))).label}
                  </span>
                </div>
                
                {/* Brand and title */}
                <div className="mb-3">
                  <h3 className="text-lg font-medium text-white flex items-center justify-between">
                    <span className="truncate mr-2">{competitor.brand || 'Unknown Brand'}</span>
                    <a 
                      href={`https://www.amazon.com/dp/${competitor.asin}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-slate-600/50 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded"
                    >
                      View on Amazon
                    </a>
                  </h3>
                  <p className="text-sm text-slate-400 truncate">{competitor.title || 'Unknown Product'}</p>
                </div>
                
                {competitor.keepaAnalysis?.analysis ? (
                  <>
                    <div className="mb-4 flex items-center gap-2">
                      {/* Remove stability category badge and Avg BSR display */}
                    </div>

                    {competitor.keepaAnalysis.productData?.bsr?.length > 0 && (
                      <div className="mb-4">
                        {(() => {
                          const bsrInsights = interpretBSRHistory(competitor.keepaAnalysis.productData.bsr);
                          return (
                            <div className="bg-slate-700/40 rounded-lg p-2 text-xs">
                              {bsrInsights.staysUnder50k && (
                                <div className="text-emerald-400 flex items-center gap-1 mb-1" key={`${competitor.asin}-${index}-bsr-under50k`}>
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  Consistently maintains BSR under 50k ({Math.round(bsrInsights.percentUnder50k)}% of time)
                                </div>
                              )}
                              {!bsrInsights.staysUnder50k && !bsrInsights.consistentlyPoor && (
                                <div className={`${getBSRPercentageColor(bsrInsights.percentUnder50k)} flex items-center gap-1 mb-1`} key={`${competitor.asin}-${index}-bsr-sometimes-under50k`}>
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                  </svg>
                                  Maintains BSR under 50k for {Math.round(bsrInsights.percentUnder50k)}% of time
                                </div>
                              )}
                              {bsrInsights.consistentlyPoor && (
                                <div className="text-red-400 flex items-center gap-1 mb-1" key={`${competitor.asin}-${index}-bsr-poor`}>
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-5a1 1 0 112 0v1a1 1 0 11-2 0v-1zm2-2a1 1 0 10-2 0V7a1 1 0 112 0v4z" clipRule="evenodd" />
                                  </svg>
                                  Never achieves good BSR ranking (consistently above 50k)
                                </div>
                              )}
                              {bsrInsights.hasSeasonalPattern && (
                                <div className="text-blue-400 flex items-center gap-1" key={`${competitor.asin}-${index}-bsr-seasonal`}>
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5.05 3.636a1 1 0 010 1.414 7 7 0 001.414 9.9 7 7 0 009.9 1.414 1 1 0 011.414 1.414 9 9 0 01-12.728-12.728 1 1 0 011.414 0zm9.9 2.121a1 1 0 00-1.414 0 7 7 0 00-1.414 9.9 7 7 0 009.9 1.414 1 1 0 000-1.414 9 9 0 00-7.071-9.9z" clipRule="evenodd" />
                                  </svg>
                                  Shows Q4 seasonal strength (normal pattern)
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="bg-slate-800/50 p-3 rounded-lg">
                          <h4 className="text-slate-300 text-sm font-medium mb-2">BSR Metrics
                            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${getPerformanceColor(competitor.bsrStability * 100)}`}>
                              {getStabilityCategory(competitor.bsrStability)}
                            </span>
                          </h4>
                          <div className="space-y-1">
                            <div key={`${competitor.asin}-${index}-bsr-stability`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">BSR Stability Score:</span>
                              <span className={getPerformanceColor(competitor.bsrStability * 100)}>
                                {(competitor.bsrStability * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div key={`${competitor.asin}-${index}-bsr-current`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">Current BSR:</span>
                              <span className="text-slate-300">
                                #{competitor.keepaAnalysis.productData?.bsr?.length > 0 ? 
                                  competitor.keepaAnalysis.productData.bsr
                                    .sort((a, b) => b.timestamp - a.timestamp)[0].value.toLocaleString() : 'N/A'}
                              </span>
                            </div>
                            <div key={`${competitor.asin}-${index}-bsr-average`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">Average BSR:</span>
                              <span className="text-slate-300">
                                #{competitor.analysisDetails.meanBSR ? 
                                  competitor.analysisDetails.meanBSR.toLocaleString() : 'N/A'}
                              </span>
                            </div>
                            <div key={`${competitor.asin}-${index}-bsr-highest`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">Highest BSR:</span>
                              <span className="text-amber-400">
                                #{competitor.keepaAnalysis.productData?.bsr?.length > 0 ? 
                                  Math.max(...competitor.keepaAnalysis.productData.bsr
                                    .map(point => point.value)).toLocaleString() : 'N/A'}
                              </span>
                            </div>
                            <div key={`${competitor.asin}-${index}-bsr-lowest`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">Lowest BSR:</span>
                              <span className="text-emerald-400">
                                #{competitor.keepaAnalysis.productData?.bsr?.length > 0 ? 
                                  Math.min(...competitor.keepaAnalysis.productData.bsr
                                    .map(point => point.value)).toLocaleString() : 'N/A'}
                              </span>
                            </div>
                            <div key={`${competitor.asin}-${index}-bsr-ots`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">OTS Rate:</span>
                              <span className="text-slate-300">
                                {competitor.keepaAnalysis.productData?.bsr?.length > 0 ? 
                                  (() => {
                                    const sortedBsr = [...competitor.keepaAnalysis.productData.bsr].sort((a, b) => a.timestamp - b.timestamp);
                                    const oldestTimestamp = sortedBsr[0].timestamp;
                                    const newestTimestamp = sortedBsr[sortedBsr.length - 1].timestamp;
                                    const totalTimeInDays = (newestTimestamp - oldestTimestamp) / (1000 * 60 * 60 * 24);
                                    
                                    // Find gaps in BSR data > 7 days (likely OTS periods)
                                    let otsTimeInDays = 0;
                                    for (let i = 1; i < sortedBsr.length; i++) {
                                      const gap = (sortedBsr[i].timestamp - sortedBsr[i-1].timestamp) / (1000 * 60 * 60 * 24);
                                      if (gap > 7) {
                                        otsTimeInDays += gap;
                                      }
                                    }
                                    
                                    // Calculate OTS percentage
                                    const otsPercentage = Math.min(100, (otsTimeInDays / totalTimeInDays) * 100);
                                    
                                    // Return with appropriate color
                                    const otsValue = `${otsPercentage.toFixed(1)}%`;
                                    
                                    if (otsPercentage < 5) {
                                      return <span className="text-emerald-400" key={`${competitor.asin}-${index}-ots-value-emerald`}>{otsValue}</span>;
                                    } else if (otsPercentage < 15) {
                                      return <span className="text-yellow-400" key={`${competitor.asin}-${index}-ots-value-yellow`}>{otsValue}</span>;
                                    } else {
                                      return <span className="text-red-400" key={`${competitor.asin}-${index}-ots-value-red`}>{otsValue}</span>;
                                    }
                                  })() : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="bg-slate-800/50 p-3 rounded-lg">
                          <h4 className="text-slate-300 text-sm font-medium mb-2">Price Metrics
                            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${competitor.priceStability * 100 > 75 ? 
                              'text-emerald-400' : competitor.priceStability * 100 > 50 ? 
                              'text-blue-400' : 'text-red-400'}`}>
                              {getPriceStabilityCategory(competitor.priceStability)}
                            </span>
                          </h4>
                          <div className="space-y-1">
                            <div key={`${competitor.asin}-${index}-price-stability`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">Price Stability Score:</span>
                              <span className={`${competitor.priceStability * 100 > 75 ? 
                                'text-emerald-400' : competitor.priceStability * 100 > 50 ? 
                                'text-blue-400' : 'text-red-400'}`}>
                                {(competitor.priceStability * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div key={`${competitor.asin}-${index}-price-current`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">Current Price:</span>
                              <span className="text-slate-300">
                                {competitor.keepaAnalysis.productData?.prices?.length > 0 ? 
                                  `$${(competitor.keepaAnalysis.productData.prices
                                    .sort((a, b) => b.timestamp - a.timestamp)[0].value / 100).toFixed(2)}` : 'N/A'}
                              </span>
                            </div>
                            <div key={`${competitor.asin}-${index}-price-average`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">Average Price:</span>
                              <span className="text-slate-300">
                                {competitor.keepaAnalysis.productData?.prices?.length > 0 ? 
                                  `$${((competitor.keepaAnalysis.productData.prices.reduce((sum, point) => sum + point.value, 0) / 
                                    competitor.keepaAnalysis.productData.prices.length) / 100).toFixed(2)}` : 'N/A'}
                              </span>
                            </div>
                            <div key={`${competitor.asin}-${index}-price-highest`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">Highest Price:</span>
                              <span className="text-amber-400">
                                {competitor.keepaAnalysis.productData?.prices?.length > 0 ? 
                                  `$${(Math.max(...competitor.keepaAnalysis.productData.prices
                                    .map(point => point.value)) / 100).toFixed(2)}` : 'N/A'}
                              </span>
                            </div>
                            <div key={`${competitor.asin}-${index}-price-lowest`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">Lowest Price:</span>
                              <span className="text-emerald-400">
                                {competitor.keepaAnalysis.productData?.prices?.length > 0 ? 
                                  `$${(Math.min(...competitor.keepaAnalysis.productData.prices
                                    .map(point => point.value)) / 100).toFixed(2)}` : 'N/A'}
                              </span>
                            </div>
                            <div key={`${competitor.asin}-${index}-price-frequency`} className="flex justify-between">
                              <span className="text-slate-400 text-sm">Sale Frequency:</span>
                              <span className="text-slate-300">
                                {competitor.keepaAnalysis.productData?.prices?.length > 5 ? 
                                  (() => {
                                    const prices = competitor.keepaAnalysis.productData.prices.map(point => point.value / 100);
                                    const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
                                    const saleThreshold = avgPrice * 0.9;
                                    const salesCount = prices.filter(price => price <= saleThreshold).length;
                                    const percentage = (salesCount / prices.length) * 100;
                                    
                                    // Return with appropriate color
                                    if (percentage < 5) {
                                      return <span className="text-blue-400" key={`${competitor.asin}-${index}-sale-freq-low`}>{percentage.toFixed(1)}%</span>;
                                    } else if (percentage < 25) {
                                      return <span className="text-yellow-400" key={`${competitor.asin}-${index}-sale-freq-medium`}>{percentage.toFixed(1)}%</span>;
                                    } else {
                                      return <span className="text-emerald-400" key={`${competitor.asin}-${index}-sale-freq-high`}>{percentage.toFixed(1)}%</span>;
                                    }
                                  })() : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  renderMissingDataMessage(competitor, index)
                )}
              </div>
            ))}
          </div>
          
          {mergedCompetitorData.length > 5 && (
            <div className="mt-6 text-center">
              <div className="text-blue-400 text-sm flex items-center gap-1 mx-auto justify-center">
                <ChevronDown className="w-4 h-4" />
                Showing top {top5Competitors.length} competitors by revenue. {mergedCompetitorData.length - top5Competitors.length} competitors hidden.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketVisuals;