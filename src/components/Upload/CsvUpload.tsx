// Modified CsvUpload.tsx to auto-initialize Keepa analysis and save submissions

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProductVettingResults } from '../Results/ProductVettingResults';
import Papa from 'papaparse';
import { keepaService } from '../../services/keepaService';
import { KeepaAnalysisResult } from '../Keepa/KeepaTypes';
import { Loader2, CheckCircle } from 'lucide-react';
import { calculateMarketScore } from '@/utils/scoring';

interface HLPData {
  title: string;
  category: string;
  price: string;
  bsr: string;
  rating: string;
}

interface CalculatedResult {
  asin: string;
  title: string;
  price: number;
  monthlySales: number;
  monthlyRevenue: number;
  rating: number;
  reviews: number;
  score: number;
  recommendation: string;
}

// Add these props to your component
interface CsvUploadProps {
  onSubmit?: () => void;
  userId?: string;
}

const cleanNumber = (value: string | number): number => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const cleanValue = value.toString().replace(/[$,]/g, '');
  return parseFloat(cleanValue) || 0;
};

export const CsvUpload: React.FC<CsvUploadProps> = ({ onSubmit, userId }) => {
  // All state hooks declared first
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'parsing' | 'analyzing' | 'complete' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [keepaResults, setKeepaResults] = useState<KeepaAnalysisResult[]>([]);
  const [marketScore, setMarketScore] = useState<{ score: number; status: string }>({ score: 0, status: 'FAIL' });
  const [productName, setProductName] = useState<string>('');

  // Add this function to save the submission
  const saveSubmission = async (processedData: any) => {
    if (!userId) {
      console.warn('No user ID provided, submission not saved');
      return;
    }

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          title: productName || processedData.competitors?.[0]?.title || 'Untitled Analysis',
          score: processedData.marketEntryStatus.status === 'FAVORABLE' ? 75 :
                processedData.marketEntryStatus.status === 'NEUTRAL' ? 50 : 25,
          status: processedData.marketEntryStatus.status === 'FAVORABLE' ? 'PASS' :
                processedData.marketEntryStatus.status === 'NEUTRAL' ? 'RISKY' : 'FAIL',
          productData: processedData,
          keepaResults: keepaResults,
          marketScore: marketScore,
          productName: productName, // Save the product name
          fromUpload: true // Flag to identify this submission came from the initial upload
        }),
      });

      if (response.ok && onSubmit) {
        console.log('Submission saved successfully, calling onSubmit callback');
        onSubmit();
      }
      
      return true; // Indicate success
    } catch (error) {
      console.error('Error saving submission:', error);
      return false; // Indicate failure
    }
  };

  // Extract ASIN from hyperlink or direct ASIN string - defined as a memoized function
  const extractAsin = useCallback((hyperlink: string): string => {
    const match = hyperlink.match(/dp\/([A-Z0-9]{10})/);
    return match ? match[1] : '';
  }, []);

  // Define all useEffect hooks
  // Set mounted state
  useEffect(() => {
    setMounted(true);
  }, []);

  // Run Keepa analysis when competitors change
  useEffect(() => {
    // We define the whole function inside to avoid conditional hook calls
    const runKeepaAnalysis = async () => {
      // Skip execution based on conditions, but keep the hook structure intact
      if (processingStatus !== 'parsing' || competitors.length === 0) {
        return;
      }
      
      try {
        setProcessingStatus('analyzing');
        
        // Get top 5 competitors by revenue
        const top5Competitors = [...competitors]
          .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)
          .slice(0, 5);
          
        // Extract ASINs
        const asinsToAnalyze = top5Competitors
          .map(comp => extractAsin(comp.asin))
          .filter(asin => asin.length === 10);
        
        if (asinsToAnalyze.length === 0) {
          throw new Error("No valid ASINs found for analysis");
        }
        
        // Run Keepa analysis
        const results = await keepaService.getCompetitorData(asinsToAnalyze);
        
        // Validate and process results
        if (results && Array.isArray(results)) {
          const validatedResults = results.map(result => ({
            ...result,
            analysis: {
              bsr: result?.analysis?.bsr || {
                stability: 0.5,
                trend: { direction: 'stable', strength: 0, confidence: 0 }
              },
              price: result?.analysis?.price || {
                stability: 0.5,
                trend: { direction: 'stable', strength: 0 }
              },
              competitivePosition: result?.analysis?.competitivePosition || {
                score: 5,
                factors: ['Default score']
              }
            }
          })) as KeepaAnalysisResult[];

          setKeepaResults(validatedResults);
          
          // Calculate and set market score using the new imported function
          const newScore = calculateMarketScore(competitors, validatedResults);
          setMarketScore(newScore);
          setProcessingStatus('complete');
        } else {
          throw new Error('Invalid data format received from Keepa');
        }
      } catch (error) {
        console.error('Keepa analysis failed:', error);
        setError(error instanceof Error ? error.message : 'Keepa analysis failed');
        setProcessingStatus('error');
      }
    };

    runKeepaAnalysis();
  }, [competitors, processingStatus, extractAsin]);

  // Add effect to save submission when analysis is complete
  useEffect(() => {
    let isMounted = true;
    
    const saveData = async () => {
      if (processingStatus === 'complete' && results && userId) {
        console.log('Analysis complete, saving submission...');
        const success = await saveSubmission(results);
        
        // Only proceed if component is still mounted
        if (isMounted && success && onSubmit) {
          console.log('Redirecting to dashboard after successful save');
          window.location.href = '/dashboard'; // Force redirect to dashboard
        }
      }
    };
    
    saveData();
    
    // Cleanup function to prevent state updates on unmounted component
    return () => {
      isMounted = false;
    };
  }, [processingStatus, results, userId]);

  // Define all handler functions using useCallback to prevent unnecessary re-renders
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!productName.trim()) {
      setError('Please enter a product name first');
      return;
    }
    
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setFile(file);
    setError(null);
    setProcessingStatus('parsing');

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const processedData = transformData(results.data);
        setResults(processedData);
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        setError('Failed to process CSV. Please check the file format.');
        setProcessingStatus('error');
      }
    });
  }, [productName]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      return;
    }
    setIsDragging(true);
  }, [productName]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (!productName.trim()) {
      setError('Please enter a product name first');
      return;
    }
    
    if (e.dataTransfer.files) {
      const file = e.dataTransfer.files[0];
      setFile(file);
      setProcessingStatus('parsing');
      
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          const processedData = transformData(results.data);
          setResults(processedData);
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
          setError('Failed to process CSV. Please check the file format.');
          setProcessingStatus('error');
        }
      });
    }
  }, [productName]);

  // Now all our hooks are defined before any conditional returns
  if (!mounted) {
    return null;
  }

  // Helper functions defined AFTER all hooks
  function transformData(csvData: any[]) {
    const monthlyRevenues = csvData.map(row => cleanNumber(row['Monthly Revenue']));
    const marketCap = monthlyRevenues.reduce((sum, rev) => sum + rev, 0);
    const totalCompetitors = csvData.length;
    
    // Calculate market concentration
    const marketConcentration = determineMarketConcentration(monthlyRevenues);
    
    const processedCompetitors = csvData.map(row => ({
      asin: row.ASIN || 'N/A',
      title: row['Product Title'] || 'N/A',
      price: cleanNumber(row.Price),
      monthlySales: cleanNumber(row['Monthly Sales']),
      monthlyRevenue: cleanNumber(row['Monthly Revenue']),
      rating: cleanNumber(row.Rating),
      reviews: cleanNumber(row.Reviews),
      score: cleanNumber(row['Listing Score']),
      marketShare: (cleanNumber(row['Monthly Revenue']) / marketCap) * 100,
      dateFirstAvailable: row['Date First Available'],
      fulfillment: row['Fulfilled By'] || 'FBM',
      // Add all additional raw CSV fields
      brand: row.Brand || 'N/A',
      category: row.Category || 'N/A',
      bsr: cleanNumber(row.BSR),
      variations: row.Variations,
      productType: row['Product Type'],
      sellerCount: cleanNumber(row['Seller Count']),
      grossProfit: cleanNumber(row['Gross Profit']),
      activeSellers: cleanNumber(row['Active Sellers']),
      productWeight: row['Product Weight'],
      sizeTier: row['Size Tier'],
      soldBy: row['Sold By'],
      listingQuality: {
        infographics: determineListingQuality(cleanNumber(row['Listing Score']))
      }
    }));

    // Set competitors state to trigger Keepa analysis
    setCompetitors(processedCompetitors);

    // Helper function to determine listing quality
    function determineListingQuality(score: number): 'high' | 'medium' | 'low' {
      if (score >= 8) return 'high';
      if (score >= 5) return 'medium';
      return 'low';
    }

    // Calculate age distributions
    const ageDistribution = processedCompetitors.reduce((acc, comp) => {
      const age = calculateAge(comp.dateFirstAvailable);
      if (age > 18) acc.mature++;
      else if (age > 12) acc.established++;
      else if (age > 6) acc.growing++;
      else acc.new++;
      return acc;
    }, { mature: 0, established: 0, growing: 0, new: 0 });

    // Calculate fulfillment distributions
    const fulfillmentDistribution = processedCompetitors.reduce((acc, comp) => {
      const method = comp.fulfillment.toLowerCase();
      if (method === 'fba') acc.fba++;
      else if (method === 'fbm') acc.fbm++;
      else if (method === 'amazon') acc.amazon++;
      return acc;
    }, { fba: 0, fbm: 0, amazon: 0 });

    // Calculate listing quality distributions
    const listingQualityDistribution = processedCompetitors.reduce((acc, comp) => {
      const quality = comp.listingQuality.infographics;
      if (quality === 'high') acc.exceptional++;
      else if (quality === 'medium') acc.decent++;
      else acc.poor++;
      return acc;
    }, { exceptional: 0, decent: 0, poor: 0 });

    // Convert counts to percentages
    const toPercentages = (distribution: Record<string, number>) => {
      return Object.fromEntries(
        Object.entries(distribution).map(([key, value]) => [
          key,
          (value / totalCompetitors) * 100
        ])
      );
    };

    const distributions = {
      age: toPercentages(ageDistribution),
      fulfillment: toPercentages(fulfillmentDistribution),
      listingQuality: toPercentages(listingQualityDistribution)
    };

    const processedData = {
      headerMetrics: {
        marketCap: {
          value: marketCap,
          display: new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(marketCap)
        },
        totalCompetitors: {
          value: totalCompetitors,
          display: totalCompetitors.toString()
        }
      },
      marketEntryStatus: determineMarketEntryStatus(marketCap, totalCompetitors),
      competitors: processedCompetitors,
      distributions
    };

    return processedData;
  }

  function determineMarketEntryStatus(marketCap: number, totalCompetitors: number) {
    if (marketCap > 1000000 && totalCompetitors < 50) {
      return {
        status: 'FAVORABLE',
        message: 'Great opportunity to enter the market'
      };
    } else if (marketCap > 500000 || totalCompetitors < 100) {
      return {
        status: 'NEUTRAL',
        message: 'Consider market conditions carefully'
      };
    } else {
      return {
        status: 'CHALLENGING',
        message: 'High competition - niche entry recommended'
      };
    }
  }

  function determineMarketConcentration(revenues: number[]) {
    // Simple market concentration calculation
    const totalRevenue = revenues.reduce((sum, rev) => sum + rev, 0);
    const topCompetitorShare = revenues[0] / totalRevenue;
    
    if (topCompetitorShare > 0.5) return 'High';
    if (topCompetitorShare > 0.2) return 'Moderate';
    return 'Low';
  }

  function calculateAge(dateStr?: string): number {
    if (!dateStr) return 0;
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30)); // Age in months
  }

  const renderLoadingState = () => {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 flex items-center justify-center">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 max-w-md w-full text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">
            {processingStatus === 'parsing' ? 'Processing CSV Data' : 'Running Market Analysis'}
          </h2>
          <p className="text-slate-400">
            {processingStatus === 'parsing' 
              ? 'Analyzing competitor data...' 
              : 'Retrieving historical performance data...'}
          </p>
          <div className="mt-6 bg-slate-700/30 h-2 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-pulse w-3/4"></div>
          </div>
        </div>
      </div>
    );
  };

  // Show loading state during processing
  if (processingStatus === 'parsing' || processingStatus === 'analyzing') {
    return renderLoadingState();
  }

  // Add a completion state to handle the redirect after saving
  if (processingStatus === 'complete' && results) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 flex items-center justify-center">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 max-w-md w-full text-center">
          <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Analysis Complete!</h2>
          <p className="text-slate-400 mb-6">Your product has been analyzed and saved successfully.</p>
          <div className="flex justify-center">
            <a href="/dashboard" className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors">
              Return to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header - Always visible */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-2">
          <div className="flex items-center gap-3">
            <img
              src="/Elevate 2 - Icon.png"
              alt="Product Vetting Calculator Logo"
              className="h-20 w-auto object-contain"
            />
            <img
              src="/VettingCalculator.png"
              alt="Vetting Calculator"
              className="h-25 w-auto object-contain"
            />
          </div>
        </div>

        {/* File Upload Section - Only when no results */}
        {!results && (
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6">
            <div className="max-w-7xl mx-auto space-y-8">
              {/* Product Name Input Field */}
              <div className="bg-slate-900/20 border-2 border-sky-400/50 rounded-2xl p-6">
                <label htmlFor="productName" className="block text-slate-300 text-lg font-semibold mb-3">
                  Enter Product Name
                </label>
                <input
                  type="text"
                  id="productName"
                  value={productName}
                  onChange={(e) => {
                    setProductName(e.target.value);
                    if (e.target.value.trim()) setError(null);
                  }}
                  placeholder="Enter the name of the product you're analyzing"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                  required
                />
                {!productName.trim() && error && (
                  <p className="mt-2 text-red-400 text-sm">Please enter a product name</p>
                )}
              </div>
              
              <div 
                className={`relative rounded-2xl p-8 text-center transition-all duration-300
                  ${!productName.trim() 
                    ? 'border-2 border-slate-600/50 bg-slate-900/20 opacity-70 cursor-not-allowed' 
                    : isDragging
                      ? 'border-2 border-sky-400 bg-blue-900/10 shadow-[0_0_20px_5px_rgba(56,189,248,0.4)]'
                      : 'border-2 border-sky-400/50 bg-slate-900/20 shadow-[0_0_10px_2px_rgba(56,189,248,0.15)]'
                  }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="fileInput"
                  disabled={!productName.trim()}
                />
                <label 
                  htmlFor="fileInput" 
                  className={`block ${!productName.trim() ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <svg
                    className={`w-12 h-12 mx-auto mb-4 ${!productName.trim() ? 'text-slate-600' : 'text-slate-400'}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      d="M12 4v16m8-8H4" 
                    />
                  </svg>
                  <div className={`${!productName.trim() ? 'text-slate-500' : 'text-slate-300'}`}>
                    <p className="text-lg mb-2 font-semibold">
                      {!productName.trim() 
                        ? 'Enter product name first' 
                        : 'Drag & Drop your CSV file here'}
                    </p>
                    <p className={`text-sm ${!productName.trim() ? 'text-slate-600' : 'text-slate-400'}`}>
                      {productName.trim() && 'or click to browse'}
                    </p>
                  </div>
                </label>
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-500/50 rounded-2xl p-6">
                  <div className="flex items-center gap-3">
                    <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-red-400">{error}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Results Section - Only shown when analysis is complete */}
        {results && processingStatus === 'complete' && (
          <ProductVettingResults 
            competitors={results.competitors}
            distributions={results.distributions}
            keepaResults={keepaResults}
            marketScore={marketScore}
            analysisComplete={true}
            productName={productName}
          />
        )}
      </div>
    </div>
  );
};