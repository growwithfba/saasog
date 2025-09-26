'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ProductVettingResults } from '../Results/ProductVettingResults';
import Papa from 'papaparse';
import { keepaService } from '../../services/keepaService';
import { KeepaAnalysisResult } from '../Keepa/KeepaTypes';
import { Loader2, FileSpreadsheet, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { calculateMarketScore } from '@/utils/scoring';

interface CsvUploadProps {
  onSubmit?: () => void;
  userId?: string;
}

// Helper to clean numbers from various formats
const cleanNumber = (value: string | number): number => {
  if (typeof value === 'number') return value;
  if (!value || value === 'N/A' || value === '-') return 0;
  
  // Handle currency values and thousand separators
  const cleanValue = value.toString()
    .replace(/[$£€,]/g, '') // Remove currency symbols and commas
    .replace(/\s/g, '');    // Remove spaces
  
  return parseFloat(cleanValue) || 0;
};

export const ImprovedCsvUpload: React.FC<CsvUploadProps> = ({ onSubmit, userId }) => {
  // State variables
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [originalCsvData, setOriginalCsvData] = useState<{ fileName: string; content: string; fileSize: number } | null>(null);
  const [results, setResults] = useState<any>(null);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'parsing' | 'analyzing' | 'complete' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [keepaResults, setKeepaResults] = useState<KeepaAnalysisResult[]>([]);
  const [marketScore, setMarketScore] = useState<{ score: number; status: string }>({ score: 0, status: 'FAIL' });
  const [productName, setProductName] = useState<string>('');
  const [processingFeedback, setProcessingFeedback] = useState<string>('');
  const [missingColumns, setMissingColumns] = useState<string[]>([]);

  // Set mounted state
  useEffect(() => {
    setMounted(true);
  }, []);

  // Function to handle competitors updated from ProductVettingResults
  const handleCompetitorsUpdated = useCallback(async (updatedCompetitors: any[]) => {
    console.log('Handling competitors update:', updatedCompetitors.length, 'competitors');
    
    // Update the competitors state, which will trigger the existing Keepa analysis pipeline
    setCompetitors(updatedCompetitors);
    
    // Update the results to reflect the new competitor list
    if (results) {
      const updatedResults = {
        ...results,
        competitors: updatedCompetitors
      };
      setResults(updatedResults);
    }
    
    // Set processing status to parsing to trigger the Keepa analysis useEffect
    setProcessingStatus('parsing');
  }, [results]);

  // Clean up product title to ensure it doesn't contain URLs or hyperlinks
  const cleanProductTitle = useCallback((title: string): string => {
    if (!title || title === 'N/A') return 'N/A';
    
    // If the title looks like a URL or hyperlink, try to extract the actual title
    if (title.includes('http') || title.includes('amazon.com') || title.includes('dp/')) {
      // This is likely a URL, return a generic title
      return 'Amazon Product';
    }
    
    // If it's a HYPERLINK Excel formula, try to extract the display text
    const hyperlinkMatch = title.match(/HYPERLINK\s*\(\s*"[^"]*"\s*,\s*"([^"]*)"\s*\)/i);
    if (hyperlinkMatch && hyperlinkMatch[1]) {
      return hyperlinkMatch[1].trim();
    }
    
    // Remove any remaining Excel formula artifacts
    const cleanTitle = title.replace(/=HYPERLINK\([^)]*\)/gi, '')
                           .replace(/^[='"]+|['"]+$/g, '')
                           .trim();
    
    return cleanTitle || 'Amazon Product';
  }, []);

  // Extract ASIN from hyperlink or direct ASIN string
  const extractAsin = useCallback((hyperlink: string): string => {
    if (!hyperlink) return '';
    
    console.log('Extracting ASIN from:', hyperlink);
    
    // If it's already a valid ASIN (10 characters alphanumeric)
    if (/^[A-Z0-9]{10}$/.test(hyperlink)) {
      console.log('Direct ASIN found:', hyperlink);
      return hyperlink;
    }
    
    // Handle hyperlink format
    const dpMatch = hyperlink.match(/dp\/([A-Z0-9]{10})/);
    if (dpMatch) {
      console.log('ASIN from dp link:', dpMatch[1]);
      return dpMatch[1];
    }
    
    // Try alternative patterns
    // Look for any 10 character alphanumeric sequence that looks like an ASIN
    const asinMatch = hyperlink.match(/\b([A-Z0-9]{10})\b/);
    if (asinMatch) {
      console.log('ASIN from pattern match:', asinMatch[1]);
      return asinMatch[1];
    }
    
    console.log('No valid ASIN found in:', hyperlink);
    return '';
  }, []);

  // Column name normalization to handle different CSV formats
  const normalizeColumnNames = useCallback((data: any[]): any[] => {
    if (!data || data.length === 0) {
      setProcessingFeedback('CSV file is empty or contains no valid data.');
      return [];
    }
    
    // Helper to standardize a column name for matching
    const standardizeColumnName = (name: string): string => {
      return name.toLowerCase()
        .replace(/[\s_-]+/g, '') // Remove spaces, underscores, hyphens
        .replace(/[^\w]/g, '');   // Remove any non-alphanumeric chars
    };
    
    // Map of standardized names to our preferred column names
    const columnMapping: Record<string, string> = {
      'no': 'No',
      'asin': 'ASIN',
      'producttitle': 'Product Title',
      'title': 'Product Title',
      'brand': 'Brand',
      'category': 'Category',
      'price': 'Price',
      'bsr': 'BSR',
      'listingscore': 'Listing Score',
      'monthlysales': 'Monthly Sales',
      'sales': 'Monthly Sales',
      'monthlyrevenue': 'Monthly Revenue',
      'revenue': 'Monthly Revenue',
      'rating': 'Rating',
      'reviews': 'Reviews',
      'variations': 'Variations',
      'fulfilledby': 'Fulfilled By',
      'fulfilled': 'Fulfilled By',
      'producttype': 'Product Type',
      'sellercountry': 'Seller Country',
      'grossprofit': 'Gross Profit',
      'profit': 'Gross Profit',
      'datefirstavailable': 'Date First Available',
      'firstseen': 'Date First Available',
      'date': 'Date First Available', 
      'activesellers': 'Active Sellers',
      'sellers': 'Active Sellers',
      'productweight': 'Product Weight',
      'weight': 'Product Weight',
      'sizetier': 'Size Tier',
      'soldby': 'Sold By'
    };
    
    // Log original columns for debugging
    const originalColumns = Object.keys(data[0]);
    console.log('Original CSV columns:', originalColumns);
    
    // Map standardized names to original column names from this specific file
    const columnLookup: Record<string, string> = {};
    for (const originalName of originalColumns) {
      const standardized = standardizeColumnName(originalName);
      if (columnMapping[standardized]) {
        columnLookup[columnMapping[standardized]] = originalName;
      }
    }
    
    console.log('Column mapping lookup:', columnLookup);
    
    // Check for required columns
    const requiredColumns = ['ASIN', 'Monthly Sales', 'Monthly Revenue', 'Price'];
    const missingRequiredColumns = requiredColumns.filter(col => !columnLookup[col]);
    
    if (missingRequiredColumns.length > 0) {
      setMissingColumns(missingRequiredColumns);
      setProcessingFeedback(`Missing required columns: ${missingRequiredColumns.join(', ')}`);
      return [];
    }
    
    // Transform the data
    return data.map(row => {
      const normalizedRow: Record<string, any> = {};
      
      // Map each desired column to its value using the lookup
      for (const [standardColumn, originalColumn] of Object.entries(columnLookup)) {
        normalizedRow[standardColumn] = row[originalColumn];
      }
      
      return normalizedRow;
    });
  }, []);

  // Save analysis results
  const saveSubmission = async (processedData: any) => {
    if (!userId) {
      console.warn('No user ID provided, submission not saved');
      return false;
    }

    try {
      console.log('Saving submission with user ID:', userId);
      
      // Create the submission payload with a unique ID
      const submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const payload = {
        userId,
        title: productName || processedData.competitors?.[0]?.title || 'Untitled Analysis',
        score: marketScore.score,
        status: marketScore.status,
        productData: processedData,
        keepaResults: keepaResults,
        marketScore: marketScore,
        productName: productName,
        originalCsvData: originalCsvData, // Include original CSV data
        fromUpload: true,
        id: submissionId,
        createdAt: new Date().toISOString()
      };
      
      // Save to localStorage with deduplication
      try {
        const existingJson = localStorage.getItem('savedSubmissions');
        let existing = existingJson ? JSON.parse(existingJson) : [];
        
        // Make sure existing is an array
        if (!Array.isArray(existing)) existing = [];
        
        // Filter out any old entries with the same title to avoid duplicates
        existing = existing.filter((item) => item.title !== payload.title);
        
        // Add the new submission
        const updatedSubmissions = [...existing, payload];
        localStorage.setItem('savedSubmissions', JSON.stringify(updatedSubmissions));
        
        // Also update cookies for compatibility
        document.cookie = `savedSubmissions=${encodeURIComponent(JSON.stringify(updatedSubmissions))}; path=/;`;
        
        console.log('Saved submission to localStorage and cookies');
      } catch (localStorageError) {
        console.error('Error saving to localStorage:', localStorageError);
      }
      
      // Send to API - with better error logging
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const responseData = await response.json();
        console.log('API response:', responseData);

        if (response.ok) {
          console.log('Submission saved successfully');
          if (onSubmit) {
            onSubmit();
          }
          return true;
        } else {
          console.error('API error:', responseData);
          return false;
        }
      } catch (apiError) {
        console.error('Error calling API:', apiError);
        return false;
      }
    } catch (error) {
      console.error('Error saving submission:', error);
      return false;
    }
  };

  // Run Keepa analysis when competitors change
  useEffect(() => {
    const runKeepaAnalysis = async () => {
      if (processingStatus !== 'parsing' || competitors.length === 0) {
        return;
      }
      
      try {
        setProcessingStatus('analyzing');
        setProcessingFeedback('Preparing ASINs for Keepa analysis...');
        
        // Get top 5 competitors by revenue
        const top5Competitors = [...competitors]
          .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)
          .slice(0, 5);
          
        console.log('Top 5 competitors for analysis:', top5Competitors);
        
        // Extract ASINs directly without using extractAsin since we've already processed them
        // in the transformData function
        let asinsToAnalyze = top5Competitors.map(comp => comp.asin)
          .filter(asin => asin && asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin));
        
        console.log('ASINs for Keepa analysis:', asinsToAnalyze);
        
        if (asinsToAnalyze.length === 0) {
          console.error('No valid ASINs found in the top competitors. Raw values:', 
            top5Competitors.map(c => ({ asin: c.asin, title: c.title })));
          
          // Fallback - try to extract ASINs from all competitors
          console.log('Trying fallback: extracting ASINs from all competitors...');
          asinsToAnalyze = competitors.map(comp => comp.asin)
            .filter(asin => asin && asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin))
            .slice(0, 5); // Take up to 5
          
          console.log('Fallback ASINs:', asinsToAnalyze);
          
          if (asinsToAnalyze.length === 0) {
            setProcessingFeedback('No valid ASINs found in the data. Analysis will continue with limited insights.');
            setProcessingStatus('complete');
            return;
          }
        }
        
        setProcessingFeedback(`Checking competitor sales history, seasonal trends, market gaps, and more. Calculating a final score… `);
        
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
          
          // Calculate and set market score
          const newScore = calculateMarketScore(competitors, validatedResults);
          setMarketScore(newScore);
          setProcessingFeedback('Analysis complete!');
          setProcessingStatus('complete');
        } else {
          throw new Error('Invalid data format received from Keepa');
        }
      } catch (error) {
        console.error('Keepa analysis failed:', error);
        setError(error instanceof Error ? error.message : 'Keepa analysis failed');
        setProcessingStatus('complete'); // Still show results but with error message
      }
    };

    runKeepaAnalysis();
  }, [competitors, processingStatus, extractAsin]);

  // Save submission when analysis is complete
  useEffect(() => {
    let isMounted = true;
    
    const saveData = async () => {
      if (processingStatus === 'complete' && results && userId) {
        console.log('Analysis complete, saving submission...');
        await saveSubmission(results);
      }
    };
    
    saveData();
    
    return () => { isMounted = false; };
  }, [processingStatus, results, userId, onSubmit]);

  // File upload handler
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
    setProcessingFeedback(`Parsing ${file.name}...`);

    console.log('Starting CSV parsing for file:', file.name);
    
    // First, read the file content to store the original CSV
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        // Store original CSV data
        setOriginalCsvData({
          fileName: file.name,
          content: content,
          fileSize: file.size
        });
        console.log('Original CSV content stored:', { fileName: file.name, size: file.size });
      }
      
      // Now parse the CSV for processing
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false, // Keep everything as strings for consistent processing
        transformHeader: (header) => header.trim(), // Trim whitespace from headers
        complete: (results) => {
          console.log('Papa parse complete with', results.data.length, 'rows');
          
          if (results.data.length === 0) {
            setError('The CSV file appears to be empty');
            setProcessingStatus('error');
            return;
          }
          
          // Log sample of parsed data
          console.log('First row fields:', Object.keys(results.data[0]));
          console.log('Sample row data:', results.data[0]);
          
          // Normalize column names to handle variations
          const normalizedData = normalizeColumnNames(results.data);
          
          if (normalizedData.length === 0) {
            // normalizeColumnNames has already set the error message
            setProcessingStatus('error');
            return;
          }
          
          // Process the data
          setProcessingFeedback('Processing competitor data...');
          const processedData = transformData(normalizedData);
          if (processedData) {
            setResults(processedData);
          } else {
            setProcessingStatus('error');
          }
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
          setError(`Failed to process CSV: ${error.message}`);
          setProcessingStatus('error');
        }
      });
    };
    
    reader.onerror = () => {
      setError('Failed to read file');
      setProcessingStatus('error');
    };
    
    reader.readAsText(file);
  }, [productName, normalizeColumnNames]);

  // Drag and drop handlers
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
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      
      // Check if file is CSV
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setError('Please upload a CSV file');
        return;
      }
      
      setFile(file);
      setError(null);
      
      // Store original CSV content for drag and drop too
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          setOriginalCsvData({
            fileName: file.name,
            content: content,
            fileSize: file.size
          });
          console.log('Original CSV content stored (drag&drop):', { fileName: file.name, size: file.size });
        }
      };
      reader.readAsText(file);
      setProcessingStatus('parsing');
      setProcessingFeedback(`Parsing ${file.name}...`);
      
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        transformHeader: (header) => header.trim(),
        complete: (results) => {
          console.log('Papa parse complete with', results.data.length, 'rows');
          
          if (results.data.length === 0) {
            setError('The CSV file appears to be empty');
            setProcessingStatus('error');
            return;
          }
          
          // Normalize column names to handle variations
          const normalizedData = normalizeColumnNames(results.data);
          
          if (normalizedData.length === 0) {
            // normalizeColumnNames has already set the error message
            setProcessingStatus('error');
            return;
          }
          
          // Process the data
          setProcessingFeedback('Processing competitor data...');
          const processedData = transformData(normalizedData);
          if (processedData) {
            setResults(processedData);
          } else {
            setProcessingStatus('error');
          }
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
          setError(`Failed to process CSV: ${error.message}`);
          setProcessingStatus('error');
        }
      });
    }
  }, [productName, normalizeColumnNames]);

  // Data transformation function
  function transformData(csvData: any[]) {
    if (!csvData || csvData.length === 0) {
      setError('No valid data found in the CSV');
      return null;
    }
    
    try {
      setProcessingFeedback('Calculating market metrics...');
      
      // Extract and clean revenue values
      const monthlyRevenues = csvData.map(row => cleanNumber(row['Monthly Revenue'] || 0));
      const marketCap = monthlyRevenues.reduce((sum, rev) => sum + rev, 0);
      const totalCompetitors = csvData.length;
      
      // Calculate market concentration
      const marketConcentration = determineMarketConcentration(monthlyRevenues);
      
      // Process competitors
      const processedCompetitors = csvData.map(row => {
        // Get ASIN directly - since we're seeing plain ASINs in the CSV
        let asin = row.ASIN || '';
        
        // Clean it: remove any spaces or non-alphanumeric characters
        asin = asin.trim().replace(/[^A-Z0-9]/g, '');
        
        // Validate it's a proper ASIN format
        if (asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin)) {
          console.log(`Valid ASIN found: ${asin}`);
        } else {
          console.warn(`Invalid ASIN format: "${asin}"`);
          // Try to extract from a possible hyperlink or text
          const extractedAsin = extractAsin(row.ASIN || '');
          if (extractedAsin) {
            asin = extractedAsin;
            console.log(`Extracted ASIN from text: ${asin}`);
          }
        }
        
        // Create Amazon URL from ASIN for display purposes
        const amazonUrl = asin.length === 10 ? `https://www.amazon.com/dp/${asin}` : '';
        
        return {
          asin: asin,
          amazonUrl: amazonUrl,
          title: cleanProductTitle(row['Product Title'] || 'N/A'),
          price: cleanNumber(row.Price || 0),
          monthlySales: cleanNumber(row['Monthly Sales'] || 0),
          monthlyRevenue: cleanNumber(row['Monthly Revenue'] || 0),
          rating: cleanNumber(row.Rating || 0),
          reviews: cleanNumber(row.Reviews || 0),
          score: cleanNumber(row['Listing Score'] || 0),
          marketShare: (cleanNumber(row['Monthly Revenue'] || 0) / marketCap) * 100,
          dateFirstAvailable: row['Date First Available'] || 'Unknown',
          fulfillment: row['Fulfilled By'] || 'FBM',
          // Add additional raw CSV fields
          brand: row.Brand || 'N/A',
          category: row.Category || 'N/A',
          bsr: cleanNumber(row.BSR || 0),
          variations: row.Variations,
          productType: row['Product Type'],
          sellerCount: cleanNumber(row['Seller Count'] || 0),
          grossProfit: cleanNumber(row['Gross Profit'] || 0),
          activeSellers: cleanNumber(row['Active Sellers'] || 0),
          productWeight: row['Product Weight'],
          sizeTier: row['Size Tier'],
          soldBy: row['Sold By'],
        };
      });

      // Log processed ASINs for debugging
      console.log('Processed competitors with ASINs:', 
        processedCompetitors.map(c => ({ 
          asin: c.asin, 
          title: c.title.substring(0, 30) + (c.title.length > 30 ? '...' : '')
        }))
      );
      
      // Set competitors state to trigger Keepa analysis
      setCompetitors(processedCompetitors);

      // Calculate distributions
      let ageDistribution = { mature: 0, established: 0, growing: 0, new: 0 };
      let fulfillmentDistribution = { fba: 0, fbm: 0, amazon: 0 };
      
      // Process each competitor for distributions
      processedCompetitors.forEach(comp => {
        // Age distribution
        const age = calculateAge(comp.dateFirstAvailable);
        if (age > 18) ageDistribution.mature++;
        else if (age > 12) ageDistribution.established++;
        else if (age > 6) ageDistribution.growing++;
        else ageDistribution.new++;
        
        // Fulfillment distribution
        const method = (comp.fulfillment || '').toLowerCase();
        if (method.includes('fba')) fulfillmentDistribution.fba++;
        else if (method.includes('fbm')) fulfillmentDistribution.fbm++;
        else if (method.includes('amazon')) fulfillmentDistribution.amazon++;
        else fulfillmentDistribution.fbm++; // Default to FBM if unknown
        
      });

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
        fulfillment: toPercentages(fulfillmentDistribution)
      };

      return {
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
    } catch (err) {
      console.error('Error transforming data:', err);
      setError('Error processing CSV data. Please check the format.');
      return null;
    }
  }

  // Helper functions

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
    if (!revenues.length) return 'Unknown';
    
    // Sort revenues in descending order
    const sortedRevenues = [...revenues].sort((a, b) => b - a);
    const totalRevenue = sortedRevenues.reduce((sum, rev) => sum + rev, 0);
    
    if (totalRevenue === 0) return 'Unknown';
    
    const topCompetitorShare = sortedRevenues[0] / totalRevenue;
    
    if (topCompetitorShare > 0.5) return 'High';
    if (topCompetitorShare > 0.2) return 'Moderate';
    return 'Low';
  }

  function calculateAge(dateStr?: string): number {
    if (!dateStr || dateStr === 'Unknown') return 0;
    
    // Try different date formats
    const date = new Date(dateStr);
    
    // Check if date is valid
    if (isNaN(date.getTime())) return 0;
    
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30)); // Age in months
  }

  // Return early for SSR
  if (!mounted) {
    return null;
  }

  // Loading state component
  const renderLoadingState = () => {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 flex items-center justify-center">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 max-w-md w-full text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">
            {processingStatus === 'parsing' ? 'Processing CSV Data' : 'Analyzing Your Product Idea…'}
          </h2>
          <p className="text-slate-400">
            {processingFeedback || 'Working on your data...'}
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-2">
          <div className="flex items-center gap-3">
            <img
              src="/GWF7.png"
              alt="Product Vetting Calculator Logo"
              className="h-20 w-auto object-contain"
            />
            <img
              src="/VettingV6.png"
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
                  <FileSpreadsheet
                    className={`w-12 h-12 mx-auto mb-4 ${!productName.trim() ? 'text-slate-600' : 'text-slate-400'}`}
                  />
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
                    <AlertCircle className="w-6 h-6 text-red-400" />
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
            alreadySaved={true}
            onCompetitorsUpdated={handleCompetitorsUpdated}
          />
        )}
      </div>
    </div>
  );
}; 