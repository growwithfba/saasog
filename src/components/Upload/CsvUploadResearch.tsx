// Modified CsvUpload.tsx to auto-initialize Keepa analysis and save submissions

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ProductVettingResults } from '../Results/ProductVettingResults';
import Papa from 'papaparse';
import { KeepaAnalysisResult } from '../Keepa/KeepaTypes';
import { Loader2, CheckCircle, X } from 'lucide-react';
import { calculateMarketScore } from '@/utils/scoring';
import { supabase } from '@/utils/supabaseClient';
import { useProductFunnelStats } from '@/hooks/useProductFunnelStats';


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
  userId?: string;
  setActiveTab?: (tab: string) => void;
  onSubmit?: () => void;
  initialProductName?: string;
  researchProductId?: string;
}

// Define CSV format types
type CsvFormat = 'H10' | 'unknown';

const cleanNumber = (value: string | number): number => {
  if (typeof value === 'number') return value;
  if (!value || value === 'N/A' || value === '-') return 0;
  
  // Handle currency values and thousand separators
  const cleanValue = value.toString()
    .replace(/[$£€,]/g, '') // Remove currency symbols and commas
    .replace(/\s/g, '');    // Remove spaces
  
  return parseFloat(cleanValue) || 0;
};

export const CsvUploadResearch: React.FC<CsvUploadProps> = ({ setActiveTab, userId, onSubmit, initialProductName, researchProductId }) => {
  // All state hooks declared first
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]); // New: Array of files for multi-upload
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; fileName: string }>({ current: 0, total: 0, fileName: '' });
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'parsing' | 'analyzing' | 'complete' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [keepaResults, setKeepaResults] = useState<KeepaAnalysisResult[]>([]);
  const [marketScore, setMarketScore] = useState<{ score: number; status: string }>({ score: 0, status: 'FAIL' });
  const [productName, setProductName] = useState<string>(initialProductName || '');
  const [processingFeedback, setProcessingFeedback] = useState<string>('');
  const [detectedFormat, setDetectedFormat] = useState<CsvFormat>('unknown');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [autoSaveComplete, setAutoSaveComplete] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [productsSavedCount, setProductsSavedCount] = useState<{ new: number; updated: number }>({ new: 0, updated: 0 });
  const router = useRouter();
  const { products } = useProductFunnelStats();
  // Removed: isSaving and saveAttempted - no longer needed since manual save is disabled

  const randomIndex = Math.floor(Math.random() * 5);
  console.log('Random index:', randomIndex);
  const progressMessage = [
    "Evaluating seasonal market trends", 
    "Fetching competitor sales history…", 
    "Measuring all risk factors…", 
    "Calculating final score…",
    "Saving your idea and preparing results…"
][randomIndex]

  // Helper to standardize a column name for matching
  const standardizeColumnName = useCallback((name: string): string => {
    return name.toLowerCase()
      .replace(/[\s_-]+/g, '') // Remove spaces, underscores, hyphens
      .replace(/[^\w]/g, '');   // Remove any non-alphanumeric chars
  }, []);

  // Function to handle reset calculation - recalculate with existing data
  const handleResetCalculation = useCallback(async () => {
    if (files.length === 0 || !productName.trim()) {
      console.error('No files or product name available for recalculation');
      return;
    }

    setIsRecalculating(true);
    setError(null);
    setProcessingStatus('parsing');
    
    try {
      console.log('Starting recalculation...');
      setProcessingFeedback('Recalculating analysis...');
      
      // Parse all CSV files again
      const allRows = await parseMultipleCsvFiles(files);
      
      if (allRows.length === 0) {
        setError('No valid data found in the uploaded CSV files');
        setProcessingStatus('error');
        setIsRecalculating(false);
        return;
      }
      
      console.log('Combined rows from all files:', allRows.length);
      
      // Normalize column names using the detected format
      const normalizedData = normalizeColumnNames(allRows);
      
      if (normalizedData.length === 0) {
        const formatMessage = detectedFormat === 'H10' 
          ? 'Missing required fields in Helium 10 CSV files. Please check your file format.'
          : 'Missing required fields in CSV files. Please ensure your files contain ASIN, Monthly Sales, Monthly Revenue, and Price columns.';
        setError(formatMessage);
        setProcessingStatus('error');
        setIsRecalculating(false);
        return;
      }
      
      setProcessingFeedback(`Recalculating ${normalizedData.length} products from ${files.length} files...`);
      setProcessingStatus('analyzing');
      
      // Process the data
      const processedData = transformData(normalizedData);
      
      // Reset all existing results
      setResults(processedData);
      setCompetitors(processedData.competitors);
      setKeepaResults([]); // Clear previous Keepa results
      setMarketScore({ score: 0, status: 'FAIL' }); // Reset market score
      
      // Calculate new market score
      const newMarketScore = calculateMarketScore(processedData.competitors, []);
      setMarketScore(newMarketScore);
      
      setProcessingStatus('complete');
      setProcessingFeedback('Recalculation complete!');
      
      setIsRecalculating(false);
      setProcessingFeedback('');
      
    } catch (error) {
      console.error('Error during recalculation:', error);
      setError(error instanceof Error ? error.message : 'Failed to recalculate. Please try again.');
      setProcessingStatus('error');
      setIsRecalculating(false); // Reset immediately on error
    }
  }, [files, productName, detectedFormat]);

  // DISABLED: Auto-save now runs inline in handleSubmit for better performance
  // This useEffect is kept for hook consistency but does nothing
  useEffect(() => {
    // Auto-save is now handled directly in handleSubmit via performAutoSave
    // This prevents the delay caused by waiting for state updates and re-renders
  }, [processingStatus, results, marketScore, competitors, keepaResults, productName, userId, isAutoSaving, autoSaveComplete]);

  const saveProducts = async (normalizedData: any[]) => {
    // Get the user's session to include authorization token
    const { data: { session } } = await supabase.auth.getSession();

    const payload = normalizedData.map(product => {
      const { asin, title, category, brand, price, monthly_revenue, monthly_units_sold, ...extraData } = product;
      return {
        asin,
        title,
        category,
        brand,
        price: cleanNumber(price),
        monthly_revenue: cleanNumber(monthly_revenue),
        monthly_units_sold: cleanNumber(monthly_units_sold),
        extra_data: extraData
      }
    });

    const payloadNew = payload.filter(product => !products.map(p => p.asin).includes(product.asin));
    const payloadUpdated = payload.filter(product => products.map(p => p.asin).includes(product.asin));
    let savedProductsNew = false;
    let savedProductsUpdated = false;

    console.log('Saving products payload new:', payloadNew);
    console.log('Saving products payload updated:', payloadUpdated);

    if (payloadNew.length > 0) {
      const response = await fetch('/api/research', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        credentials: 'include', // Include cookies for additional auth context
        body: JSON.stringify({
          products: payloadNew
        })
      });
      if (response.ok) {
        savedProductsNew = true;
        console.log('Products saved successfully');
      } else {
        console.error('Failed to save products');
      }
    } else {
      savedProductsNew = true;
    }

    if (payloadUpdated.length > 0) {
      const responseUpdated = await fetch('/api/research', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        credentials: 'include', // Include cookies for additional auth context
        body: JSON.stringify({
          products: payloadUpdated
        })
      });
      if (responseUpdated.ok) {
        savedProductsUpdated = true;
        console.log('Products updated successfully');
      } else {
        console.error('Failed to update products');
      }
    } else {
      savedProductsUpdated = true;
    }
    if (savedProductsNew && savedProductsUpdated) {
      // Show success modal
      setShowSuccessModal(true);
      return { savedProductsNew, savedProductsUpdated, newCount: payloadNew.length, updatedCount: payloadUpdated.length };
    }

    // Return null if save failed
    return null;
  };

  // Handle submit button click - optimized for speed
  const handleSubmit = async () => {
    if (files.length === 0) return;
    
    setLoading(true);
    setError(null);
    setProcessingStatus('parsing');
    
    try {
      console.log(`Starting multi-CSV parsing for ${files.length} files:`, files.map(f => f.name));
      
      // Parse all CSV files with deduplication
      const allRows = await parseMultipleCsvFiles(files);
      
      if (allRows.length === 0) {
        setError('No valid data found in the uploaded CSV files');
        setProcessingStatus('error');
        setLoading(false);
        return;
      }
      
      console.log('Combined rows from all files:', allRows.length);
      
      // Normalize column names using the detected format
      const normalizedData = normalizeColumnNames(allRows);
      
      if (normalizedData.length === 0) {
        const formatMessage = detectedFormat === 'H10' 
          ? 'Missing required fields in Helium 10 CSV files. Please check your file format.'
          : 'Missing required fields in CSV files. Please ensure your files contain ASIN, Monthly Sales, Monthly Revenue, and Price columns.';
        setError(formatMessage);
        setProcessingStatus('error');
        setLoading(false);
        return;
      }
      
      setProcessingFeedback(`Processing ${normalizedData.length} products from ${files.length} files...`);
      setProcessingStatus('analyzing');
      // Set all state at once to minimize re-renders
      setProcessingFeedback('Saving analysis...');
      const saveResult = await saveProducts(normalizedData);
      if (saveResult) {
        setProductsSavedCount({ new: saveResult.newCount, updated: saveResult.updatedCount });
      }
      setProcessingStatus('complete');

      
    } catch (error) {
      console.error('Error processing files:', error);
      setError(error instanceof Error ? error.message : 'Failed to process CSV files');
      setProcessingStatus('error');
    } finally {
      setLoading(false);
    }
  };
  
  // Extract auto-save logic into a separate function for direct calling
  const performAutoSave = async (processedData: any, keepaResults: KeepaAnalysisResult[], marketScore: { score: number; status: string }) => {
    if (!userId) {
      console.warn('No user ID, skipping auto-save');
      return;
    }
    
    setIsAutoSaving(true);
    
    try {
      console.log('Auto-saving submission...');
      
      // Get the current user from Supabase
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.error('Authentication error during auto-save:', userError);
        throw new Error('User not logged in. Please sign in to save your calculation.');
      }
      
      // Get the exact score from the market score
      const scoreValue = typeof marketScore.score === 'number' 
        ? marketScore.score 
        : marketScore.status === 'PASS' ? 75 : 
          marketScore.status === 'RISKY' ? 50 : 25;
      
      const productTitle = productName || processedData.competitors[0]?.title || 'Untitled Analysis';
      
      // Create submission payload for Supabase
      const submissionData: any = {
        user_id: user.id,
        title: productTitle,
        product_name: productName || 'Untitled Product',
        score: scoreValue,
        status: marketScore.status,
        submission_data: {
          productData: {
            competitors: processedData.competitors,
            distributions: processedData.distributions
          },
          keepaResults: keepaResults || [],
          marketScore,
          metrics: {
            totalMarketCap: processedData.competitors.reduce((sum, comp) => sum + (comp?.monthlyRevenue || 0), 0),
            revenuePerCompetitor: processedData.competitors.length ? processedData.competitors.reduce((sum, comp) => sum + (comp?.monthlyRevenue || 0), 0) / processedData.competitors.length : 0,
            competitorCount: processedData.competitors.length,
            calculatedAt: new Date().toISOString()
          },
          marketInsights: 'Auto-generated market analysis',
          createdAt: new Date().toISOString()
        }
      };
      
      // Add research_product_id if provided
      if (researchProductId) {
        submissionData.research_product_id = researchProductId;
      }
      
      console.log('Auto-saving submission payload');
      
      // Insert into Supabase
      const { data: insertResult, error: insertError } = await supabase
        .from('submissions')
        .insert(submissionData)
        .select();
      
      if (insertError) {
        console.error('Supabase auto-save insert error:', insertError);
        throw new Error(`Failed to auto-save to database: ${insertError.message}`);
      }
      
      console.log('Successfully auto-saved to Supabase:', insertResult);
      
      // Update research product is_vetted to true if researchProductId is provided
      if (researchProductId) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const response = await fetch('/api/research/status', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
            },
            credentials: 'include',
            body: JSON.stringify({
              productIds: [researchProductId],
              status: 'vetted',
              value: true
            })
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.success) {
              console.log('Successfully updated research product vetted status');
            } else {
              console.error('Failed to update research product vetted status:', result.error);
            }
          } else {
            console.error('Failed to update research product vetted status');
          }
        } catch (updateError) {
          console.error('Error updating research product vetted status:', updateError);
          // Don't throw error - submission was created successfully
        }
      }
      
      setAutoSaveComplete(true);
      
      // Navigate immediately without delay
      const submissionId = insertResult[0]?.id;
      if (submissionId) {
        window.location.href = `/submission/${submissionId}`;
      } else {
        console.error('No submission ID returned from auto-save');
      }
      
    } catch (error) {
      console.error('Error during auto-save:', error);
      setIsAutoSaving(false);
      // Show error message to user
      const errorElement = document.createElement('div');
      errorElement.className = 'fixed top-4 right-4 bg-red-800/90 text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2';
      errorElement.innerHTML = `
        <svg class="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <span>Auto-save failed. You can manually save your results below.</span>
      `;
      document.body.appendChild(errorElement);
      
      // Remove the error message after 5 seconds
      setTimeout(() => {
        errorElement.classList.add('opacity-0');
        setTimeout(() => {
          if (document.body.contains(errorElement)) {
            document.body.removeChild(errorElement);
          }
        }, 300);
      }, 5000);
    }
  };

  // Format detection function
  const detectCsvFormat = useCallback((headers: string[]): CsvFormat => {
    const standardizedHeaders = headers.map(standardizeColumnName);
    
    // H10 format indicators (specific to Helium 10)
    const h10Indicators = [
      'productdetails',
      'url',
      'imageurl',
      'parentlevelsales',
      'asinsales',
      'recentpurchases',
      'asinrevenue',
      'parentlevelrever',
      'titlecharcount',
      'reviewvelocity',
      'buybox'
    ];
    
    const h10Matches = h10Indicators.filter(indicator => 
      standardizedHeaders.some(header => header.includes(indicator))
    ).length;
    
    console.log('Format detection - H10 matches:', h10Matches);
    console.log('Standardized headers:', standardizedHeaders);
    
    if (h10Matches >= 2) {
      return 'H10';
    } else {
      return 'unknown';
    }
  }, [standardizeColumnName]);

  // Enhanced column mapping function with format detection
  const normalizeColumnNames = useCallback((data: any[]): any[] => {
    if (!data || data.length === 0) return data;
    
    // Get original headers
    const originalColumns = Object.keys(data[0]);
    console.log('Original CSV columns:', originalColumns);
    
    // Detect format
    const format = detectCsvFormat(originalColumns);
    setDetectedFormat(format);
    console.log('Detected CSV format:', format);
    console.log('Format detection details:', {
      originalHeaders: originalColumns,
      standardizedHeaders: originalColumns.map(standardizeColumnName),
      detectedFormat: format
    });
    
    // Define column mappings for different formats
    const standardColumnMapping: Record<string, string> = {
      'no': 'No',
      'asin': 'ASIN',
      'producttitle': 'Product Details',
      'productdetails': 'Product Details', // H10 format uses "Product Details" for full product title
      'title': 'Product Details',
      'brand': 'Brand',
      'category': 'Category',
      'price': 'Price',
      'priceus': 'Price',
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

    // H10 column mapping
    const h10ColumnMapping: Record<string, string> = {
      // Primary mapping from your prompt
      'asin': 'asin',
      'title': 'title',
      'category': 'category',
      'brand': 'brand',
      'fulfillment': 'fulfilled_by',
      'sizetier': 'size_tier',
      'numberofimages': 'number_of_images',
      'variationcount': 'variation_count',
      'weight': 'weight',
      'bsr': 'bsr',
      'price': 'price',
      'parentlevelsales': 'parent_level_sales',
      'asinsales': 'monthly_units_sold',
      'parentlevelrevenue': 'parent_level_revenue',
      'asinrevenue': 'monthly_revenue',
      'netprice': 'net_price',
      'reviewcount': 'review',
      'reviewsrating': 'rating',
      'sellers': 'active_sellers',
      'lastyearsales': 'last_year_sales',
      'salesyearoveryear': 'sales_year_over_year',
      'salestrend90days': 'sales_trend',
      'pricetrend90days': 'price_trend',
      'bestsalesperiod': 'best_sales_period',
      'salestoreviews': 'sales_to_reviews',
    };
    
    // Choose the appropriate mapping based on detected format
    const columnMapping = format === 'H10' ? h10ColumnMapping : standardColumnMapping;
    
    // Map standardized names to original column names from this specific file
    const columnLookup: Record<string, string> = {};
    for (const originalName of originalColumns) {
      const standardized = standardizeColumnName(originalName);
      if (columnMapping[standardized]) {
        columnLookup[columnMapping[standardized]] = originalName;
      }
    }
    
    console.log('Column mapping lookup:', columnLookup);
    console.log('Column mapping lookup length:', Object.keys(columnLookup).length);
    console.log('Using format:', format);
    
    // Check for required columns
    const requiredColumns = ['asin', 'monthly_units_sold', 'monthly_revenue', 'price'];
    const missingRequiredColumns = requiredColumns.filter(col => !columnLookup[col]);
    
    if (missingRequiredColumns.length > 0) {
      console.error(`Missing required columns: ${missingRequiredColumns.join(', ')}`);
      console.error('Available columns:', Object.keys(columnLookup));
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
  }, [detectCsvFormat, standardizeColumnName]);

  // Multi-CSV parsing and deduplication functions
  const parseMultipleCsvFiles = useCallback(async (fileList: FileList | File[]): Promise<any[]> => {
    const files = Array.from(fileList);
    const allRows: any[] = [];
    let firstHeaders: string[] | null = null;
    let detectedFormat: CsvFormat = 'unknown';
    
    console.log(`Starting to parse ${files.length} CSV files...`);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`Parsing file ${i + 1}/${files.length}: ${file.name}`);
      
      setUploadProgress({
        current: i + 1,
        total: files.length,
        fileName: file.name
      });
      
      setProcessingFeedback(`Parsing ${file.name} (${i + 1}/${files.length})...`);
      
      try {
        const fileData = await parseSingleCsvFile(file);
        
        if (fileData.length === 0) {
          console.warn(`File ${file.name} appears to be empty, skipping...`);
          continue;
        }
        
        // Detect format from first file or use existing detection
        if (i === 0) {
          const headers = Object.keys(fileData[0]);
          detectedFormat = detectCsvFormat(headers);
          setDetectedFormat(detectedFormat);
          firstHeaders = headers;
          console.log(`Detected format from first file: ${detectedFormat}`);
        }
        
        // Filter out header rows that match the first file's headers
        const filteredData = fileData.filter(row => {
          // Check if this row is a header row by comparing values
          const isHeaderRow = firstHeaders.every(header => {
            const rowValue = row[header];
            const headerValue = header; // The header value is the same as the header name
            return rowValue === headerValue;
          });
          
          if (isHeaderRow) {
            console.log(`Skipping header row in file ${file.name}`);
            return false;
          }
          return true;
        });
        
        console.log(`File ${file.name}: ${filteredData.length} data rows (after header filtering)`);
        allRows.push(...filteredData);
        
      } catch (error) {
        console.error(`Error parsing file ${file.name}:`, error);
        setError(`Failed to parse ${file.name}. Please check the file format.`);
        setProcessingStatus('error');
        return [];
      }
    }
    
    console.log(`Total rows from all files: ${allRows.length}`);
    
    // Deduplicate by ASIN
    const deduplicatedRows = deduplicateByAsin(allRows);
    console.log(`Rows after ASIN deduplication: ${deduplicatedRows.length}`);
    
    return deduplicatedRows;
  }, [detectCsvFormat]);

  const parseSingleCsvFile = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        transformHeader: (header) => header.trim(),
        complete: (results) => {
          if (results.errors.length > 0) {
            console.warn('Papa parse warnings:', results.errors);
          }
          resolve(results.data);
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  };

  const deduplicateByAsin = useCallback((rows: any[]): any[] => {
    const seenAsins = new Set<string>();
    const deduplicated: any[] = [];
    
    for (const row of rows) {
      const asin = row.ASIN || row.asin || '';
      const cleanAsin = asin.toString().trim().toUpperCase();
      
      if (cleanAsin && cleanAsin.length === 10 && /^[A-Z0-9]{10}$/.test(cleanAsin)) {
        if (!seenAsins.has(cleanAsin)) {
          seenAsins.add(cleanAsin);
          deduplicated.push(row);
        } else {
          console.log(`Skipping duplicate ASIN: ${cleanAsin}`);
        }
      } else {
        // Keep rows without valid ASINs (they might be important)
        deduplicated.push(row);
      }
    }
    
    console.log(`Deduplication: ${rows.length} → ${deduplicated.length} rows`);
    return deduplicated;
  }, []);

  // Extract ASIN from hyperlink or direct ASIN string - defined as a memoized function
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

  // Define all useEffect hooks
  // Set mounted state
  useEffect(() => {
    setMounted(true);
  }, []);

  // Update productName when initialProductName changes
  useEffect(() => {
    if (initialProductName) {
      setProductName(initialProductName);
    }
  }, [initialProductName]);

  // DISABLED: Keepa analysis now runs inline in handleSubmit for better performance
  // This useEffect is kept for hook consistency but does nothing
  useEffect(() => {
    // Keepa analysis is now handled directly in handleSubmit
    // This prevents the delay caused by waiting for state updates and re-renders
  }, [competitors, processingStatus, extractAsin]);

  // DISABLED: Manual save mechanism - using auto-save instead to prevent duplicates
  // This useEffect was causing duplicate saves because auto-save already handles saving
  /*
  useEffect(() => {
    let isMounted = true;
    
    const saveData = async () => {
      if (processingStatus === 'complete' && results && userId && !isSaving && !saveAttempted) {
        console.log('Analysis complete, saving submission...');
        const success = await saveSubmission(results);
        
        // Only proceed if component is still mounted
        if (isMounted && success && onSubmit) {
          console.log('Analysis complete, now showing results page');
          // Don't redirect to dashboard, let the UI flow normally to show results
          // window.location.href = '/dashboard'; // Force redirect to dashboard
        }
      }
    };
    
    saveData();
    
    // Cleanup function to prevent state updates on unmounted component
    return () => {
      isMounted = false;
    };
  }, [processingStatus, results, userId, isSaving, saveAttempted]);
  */

  // Define all handler functions using useCallback to prevent unnecessary re-renders
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!productName.trim()) {
      setError('Please enter a product name first');
      return;
    }
    
    if (!e.target.files || e.target.files.length === 0) return;
    
    const fileList = e.target.files;
    const newFiles = Array.from(fileList);
    
    // Filter for CSV files only
    const csvFiles = newFiles.filter(file => file.name.toLowerCase().endsWith('.csv'));
    
    if (csvFiles.length === 0) {
      setError('Please upload CSV files only');
      return;
    }
    
    // Check file limit (5 CSV files max)
    setFiles(prevFiles => {
      const newTotal = prevFiles.length + csvFiles.length;
      if (newTotal > 5) {
        setError(`Maximum 5 CSV files allowed. You're trying to add ${csvFiles.length} files to ${prevFiles.length} existing files.`);
        return prevFiles;
      }
      return [...prevFiles, ...csvFiles];
    });
    setFile(csvFiles[0]); // Keep for backward compatibility
    setError(null);
    
    console.log(`Added ${csvFiles.length} CSV files to staging:`, csvFiles.map(f => f.name));
    
    // Don't auto-process - just stage the files
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

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files) {
      const fileList = e.dataTransfer.files;
      const newFiles = Array.from(fileList);
      
      // Filter for CSV files only
      const csvFiles = newFiles.filter(file => file.name.toLowerCase().endsWith('.csv'));
      
      if (csvFiles.length === 0) {
        setError('Please upload CSV files only');
        return;
      }
      
      // Check file limit (5 CSV files max)
      setFiles(prevFiles => {
        const newTotal = prevFiles.length + csvFiles.length;
        if (newTotal > 5) {
          setError(`Maximum 5 CSV files allowed. You're trying to add ${csvFiles.length} files to ${prevFiles.length} existing files.`);
          return prevFiles;
        }
        return [...prevFiles, ...csvFiles];
      });
      setFile(csvFiles[0]); // Keep for backward compatibility
      setError(null);
      
      console.log(`Added ${csvFiles.length} dropped CSV files to staging:`, csvFiles.map(f => f.name));
      
      // Don't auto-process - just stage the files
    }
  }, [productName]);

  // Now all our hooks are defined before any conditional returns
  if (!mounted) {
    return null;
  }

  // Helper functions defined AFTER all hooks
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
          title: row['Product Details'] || 'N/A',
          price: cleanNumber(row.Price || 0),
          monthlySales: cleanNumber(row['Monthly Sales'] || 0),
          monthlyRevenue: cleanNumber(row['Monthly Revenue'] || 0),
          rating: cleanNumber(row.Rating || 0),
          reviews: cleanNumber(row.Reviews || 0),
          score: cleanNumber(row['Listing Score'] || 0),
          marketShare: (cleanNumber(row['Monthly Revenue'] || 0) / marketCap) * 100,
          dateFirstAvailable: row['Date First Available'] || 'Unknown',
          fulfillment: row['Fulfilled By'] || 'FBM',
          // Add all additional raw CSV fields
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
          listingQuality: {
            infographics: determineListingQuality(cleanNumber(row['Listing Score'] || 0))
          }
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
      let listingQualityDistribution = { exceptional: 0, decent: 0, poor: 0 };
      
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
        
        // Listing quality distribution
        const quality = comp.listingQuality.infographics;
        if (quality === 'high') listingQualityDistribution.exceptional++;
        else if (quality === 'medium') listingQualityDistribution.decent++;
        else listingQualityDistribution.poor++;
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
        fulfillment: toPercentages(fulfillmentDistribution),
        listingQuality: toPercentages(listingQualityDistribution)
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

  function determineMarketEntryStatus(marketCap: number, totalCompetitors: number) {
    if (marketCap > 1000000 && totalCompetitors < 50) {
      return {
        status: 'PASS',
        message: 'Great opportunity to enter the market'
      };
    } else if (marketCap > 500000 || totalCompetitors < 100) {
      return {
        status: 'RISKY',
        message: 'Consider market conditions carefully'
      };
    } else {
      return {
        status: 'FAIL',
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

  function determineListingQuality(score: number): 'high' | 'medium' | 'low' {
    if (score >= 8) return 'high';
    if (score >= 5) return 'medium';
    return 'low';
  }

  const renderLoadingState = () => {
    const getLoadingMessage = () => {
      if (processingFeedback) return processingFeedback;
      if (processingStatus === 'parsing') return 'Analyzing competitor data...';
      if (processingStatus === 'analyzing') return 'Analyzing market trends and calculating scores...';
      return 'Processing your analysis...';
    };

    return (
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 flex items-center justify-center">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 max-w-md w-full text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">
            Analyzing Your Product Idea
          </h2>
          <p className="text-slate-400 min-h-[24px]">
            {getLoadingMessage()}
          </p>
          {detectedFormat !== 'unknown' && uploadProgress.total > 0 && (
            <p className="text-slate-500 text-sm mt-2">
              Using {detectedFormat} format
            </p>
          )}
          {uploadProgress.total > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-500 mb-2">
                <span>Processing files...</span>
                <span>{uploadProgress.current}/{uploadProgress.total}</span>
              </div>
              <div className="bg-slate-700/30 h-2 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-500 mt-2 truncate">
                {uploadProgress.fileName}
              </p>
            </div>
          )}
          {uploadProgress.total === 0 && (
            <div className="mt-6 bg-slate-700/30 h-2 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full animate-pulse w-3/4"></div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Show loading state during processing
  if (processingStatus === 'parsing' || processingStatus === 'analyzing') {
    return renderLoadingState();
  }

  return (
    <>
    {/* Recalculation Loading Overlay - Positioned at document level */}
    {isRecalculating && results && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]">
        <div className="bg-slate-800 rounded-xl p-8 max-w-md w-full mx-4 border border-slate-700">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              Recalculating Analysis
            </h3>
            <p className="text-slate-400 mb-4">
              {processingFeedback || 'Processing your data with updated calculations...'}
            </p>
            <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Auto-saving Loading Overlay */}
    {isAutoSaving && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]">
        <div className="bg-slate-800 rounded-xl p-8 max-w-md w-full mx-4 border border-slate-700">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-emerald-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              Saving Analysis
            </h3>
            <p className="text-slate-400 mb-4">
              {progressMessage}
            </p>
            <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Success Modal - Upload Complete */}
    {showSuccessModal && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full mx-4 border border-slate-700 shadow-2xl relative">
          {/* Close Button */}
          <button
            onClick={() => setShowSuccessModal(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="text-center">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              Upload Successful!
            </h3>
            <p className="text-slate-300 mb-4">
              Your products have been successfully saved to your research funnel.
            </p>
            {(productsSavedCount.new > 0 || productsSavedCount.updated > 0) && (
              <div className="bg-slate-700/30 rounded-lg p-4 mb-6">
                {productsSavedCount.new > 0 && (
                  <p className="text-emerald-400 text-sm mb-1">
                    ✓ {productsSavedCount.new} new product{productsSavedCount.new !== 1 ? 's' : ''} added
                  </p>
                )}
                {productsSavedCount.updated > 0 && (
                  <p className="text-blue-400 text-sm">
                    ✓ {productsSavedCount.updated} product{productsSavedCount.updated !== 1 ? 's' : ''} updated
                  </p>
                )}
              </div>
            )}
            <button
              onClick={() => {
                setShowSuccessModal(false);
                setActiveTab('submissions');
                onSubmit();
              }}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg shadow-blue-500/25"
            >
              View My Products
            </button>
            <button
              onClick={() => {
                setShowSuccessModal(false);
              }}
              className="mt-3 text-slate-400 hover:text-slate-200 text-sm transition-colors"
            >
              Stay on this page
            </button>
          </div>
        </div>
      </div>
    )}

    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* File Upload Section - Only when no results */}
        {!results && (
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6">
            <div className="max-w-7xl mx-auto space-y-8">
              {/* Product Name Input Field */}
              <div className="bg-slate-900/30 border border-slate-700/50 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                    <span className="text-blue-400 font-bold text-lg">1</span>
                  </div>
                  <div>
                    <label htmlFor="productName" className="block text-white text-lg font-semibold">
                      Product Information
                    </label>
                    <p className="text-slate-400 text-sm">What product are you analyzing?</p>
                  </div>
                </div>
                
                <div className="relative">
                  <input
                    type="text"
                    id="productName"
                    value={productName}
                    onChange={(e) => {
                      setProductName(e.target.value);
                      if (e.target.value.trim()) setError(null);
                    }}
                    placeholder="Enter the name of the product you're analyzing"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  {!productName.trim() && error && (
                    <p className="mt-2 text-red-400 text-sm">Please enter a product name</p>
                  )}
                </div>

                {detectedFormat !== 'unknown' && (
                  <div className="mt-4 text-center">
                    <span className="text-sm text-emerald-400 bg-emerald-400/10 px-4 py-2 rounded-full border border-emerald-400/20">
                      ✓ Detected: {detectedFormat} format
                    </span>
                  </div>
                )}
              </div>
              
              <div 
                className={`relative rounded-2xl p-12 text-center transition-all duration-300 border-2 border-dashed ${
                  isDragging
                      ? 'border-blue-400 bg-blue-900/20 shadow-[0_0_30px_10px_rgba(59,130,246,0.15)]'
                      : 'border-slate-600/50 bg-slate-900/30 hover:border-blue-400/50 hover:bg-blue-900/10'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".csv"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  id="fileInput"
                />
                <label 
                  htmlFor="fileInput" 
                  className='block cursor-pointer'
                >
                  <div className='w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center bg-blue-500/20'>
                    <svg
                      className='w-10 h-10 text-blue-400'
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
                      />
                    </svg>
                  </div>
                  
                  <div>
                    <h4 className='text-2xl font-bold mb-3 text-white'>
                      Drop your CSV files here
                    </h4>
                    <p className='text-base mb-2 text-slate-300'>
                      Supports the  'My List - Products' CSV file from Helium 10
                    </p>
                    <p className='text-sm text-slate-400'>
                      <span className="text-blue-400 font-medium">or click to browse and select files</span>
                    </p>
                  </div>
                </label>
                
                {files.length > 0 && (
                  <div className="mt-8">
                    <button
                      onClick={handleSubmit}
                      disabled={loading}
                      className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 disabled:from-slate-600 disabled:to-slate-700 text-white font-bold text-lg rounded-xl transition-all duration-200 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transform hover:scale-105 disabled:transform-none disabled:shadow-none"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="animate-spin h-6 w-6" />
                          <span>Analyzing Product...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.414 14.586 7H12z" clipRule="evenodd" />
                          </svg>
                          <span>Research my products</span>
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* File List Display */}
              {files.length > 0 && (
                <div className="bg-slate-900/30 border border-slate-700/50 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-white font-semibold">Files Ready ({files.length})</h3>
                        <p className="text-slate-400 text-sm">Ready for analysis</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setFiles([])}
                      className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                  
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-slate-200 font-medium">{file.name}</p>
                            <p className="text-slate-500 text-sm">{(file.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setFiles(currentFiles => currentFiles.filter((_, i) => i !== index))}
                          className="text-slate-400 hover:text-red-400 transition-colors p-1"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <p className="text-blue-300 text-sm flex items-center gap-2">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      Files will be automatically merged and deduplicated by ASIN
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-900/20 border border-red-500/50 rounded-2xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-red-400 font-semibold mb-1">Upload Error</h4>
                      <p className="text-red-300 text-sm">{error}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>


    {/* Results Section - Only show if not auto-saving or auto-save failed */}
    {results && processingStatus === 'complete' && !isAutoSaving && !autoSaveComplete && (
      <div className="w-full">
        <ProductVettingResults 
          competitors={results.competitors}
          distributions={results.distributions}
          keepaResults={keepaResults}
          marketScore={marketScore}
          analysisComplete={true}
          productName={productName}
          alreadySaved={false}
          onResetCalculation={handleResetCalculation}
          isRecalculating={isRecalculating}
        />
      </div>
    )}
  </>
  );
};