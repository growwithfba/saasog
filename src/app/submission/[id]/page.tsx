'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, CheckCircle2, Share2, ExternalLink, Download, RotateCcw } from 'lucide-react';
import { getSubmissionFromLocalStorage, saveSubmissionToLocalStorage } from '@/utils/storageUtils';
import { supabase } from '@/utils/supabaseClient';
import { ProductVettingResults } from '@/components/Results/ProductVettingResults';
import { TypeformSubmissionModal } from '@/components/TypeformSubmissionModal';
import { extractTitlesFromOriginalCsv, applyTitleCorrections } from '@/utils/csvTitleFixer';


export default function SubmissionPage() {
  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [validationsRemaining, setValidationsRemaining] = useState<number>(2);
  const [isSubmittingValidation, setIsSubmittingValidation] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalculationFeedback, setRecalculationFeedback] = useState<string>('');
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [user, setUser] = useState<any>(null);
  
  // Typeform submission tracking
  const [showTypeformModal, setShowTypeformModal] = useState(false);
  const [typeformStatus, setTypeformStatus] = useState({
    canSubmit: true, // Default to true for new users
    submissionsUsed: 0,
    submissionsRemaining: 2, // Default to 2 remaining
    weekResetsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 7 days from now
  });
  const [isLoadingTypeformStatus, setIsLoadingTypeformStatus] = useState(true);
  const [typeformStatusLoaded, setTypeformStatusLoaded] = useState(false);
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  // Fetch typeform submission status
  const fetchTypeformStatus = async () => {
    try {
      setIsLoadingTypeformStatus(true);
      
      // Get session token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/typeform-submissions', {
        credentials: 'include',
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setTypeformStatus({
            canSubmit: data.canSubmit,
            submissionsUsed: data.submissionsUsed,
            submissionsRemaining: data.submissionsRemaining,
            weekResetsAt: data.weekResetsAt
          });
          setTypeformStatusLoaded(true);
        } else {
          console.warn('API returned unsuccessful response:', data);
          // Keep default optimistic state if API fails
        }
      } else {
        console.warn('Failed to fetch typeform status:', response.status);
        // Keep default optimistic state if API fails
      }
    } catch (error) {
      console.error('Error fetching typeform status:', error);
      // Keep default optimistic state if API fails
    } finally {
      setIsLoadingTypeformStatus(false);
    }
  };

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error || !user) {
          // User not authenticated, redirect to login with return URL
          const currentUrl = window.location.pathname + window.location.search;
          router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`);
          return;
        }
        
        setUser(user);
        setIsAuthenticating(false);
        
        // Fetch typeform status after authentication
        await fetchTypeformStatus();
      } catch (error) {
        console.error('Auth check failed:', error);
        // Redirect to login on any auth error
        const currentUrl = window.location.pathname + window.location.search;
        router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`);
      }
    };
    
    checkAuth();
  }, [router]);

  // Handle competitors updated from ProductVettingResults
  const handleCompetitorsUpdated = async (updatedCompetitors: any[]) => {
    if (!submission) return;

    console.log('Submission page: Handling competitors update:', updatedCompetitors.length, 'competitors');
    setIsRecalculating(true);
    setError(null);
    
    try {
      setRecalculationFeedback('Recalculating with removed competitors...');
      
      // Recalculate market metrics
      const newMarketCap = updatedCompetitors.reduce((sum, comp) => sum + (comp.monthlyRevenue || 0), 0);
      const newRevenuePerCompetitor = updatedCompetitors.length > 0 ? newMarketCap / updatedCompetitors.length : 0;
      const newTotalCompetitors = updatedCompetitors.length;

      // Recalculate market shares based on new market cap
      const competitorsWithUpdatedShares = updatedCompetitors.map(comp => ({
        ...comp,
        marketShare: newMarketCap > 0 ? (comp.monthlyRevenue / newMarketCap) * 100 : 0
      }));

      setRecalculationFeedback('Calling Keepa API for updated analysis...');

      // Get ASINs for Keepa analysis (top 5 by revenue)
      const topCompetitors = [...competitorsWithUpdatedShares]
        .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)
        .slice(0, 5);
      
      const asinsToAnalyze = topCompetitors
        .map(comp => comp.asin)
        .filter(asin => asin && asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin));

      console.log('Submission page: ASINs for Keepa recalculation:', asinsToAnalyze);

      // Call Keepa API for updated analysis
      let newKeepaResults = [];
      let newMarketScore = { score: 0, status: 'FAIL' };

      if (asinsToAnalyze.length > 0) {
        try {
          // Import keepaService and calculateMarketScore
          const { keepaService } = await import('@/services/keepaService');
          const { calculateMarketScore } = await import('@/utils/scoring');
          
          console.log('Submission page: Calling Keepa API for recalculation...');
          const keepaResults = await keepaService.getCompetitorData(asinsToAnalyze);
          
          if (keepaResults && Array.isArray(keepaResults)) {
            newKeepaResults = keepaResults;
            newMarketScore = calculateMarketScore(competitorsWithUpdatedShares, keepaResults);
            console.log('Submission page: Keepa recalculation successful:', { 
              keepaResultsCount: newKeepaResults.length, 
              newScore: newMarketScore 
            });
          }
        } catch (keepaError) {
          console.error('Submission page: Keepa recalculation failed:', keepaError);
          // Continue with basic market score calculation
          const { calculateMarketScore } = await import('@/utils/scoring');
          newMarketScore = calculateMarketScore(competitorsWithUpdatedShares, []);
        }
      }

      setRecalculationFeedback('Updating submission in database...');

      // Update submission in Supabase
      if (user) {
        try {
          const submissionData = {
            score: newMarketScore.score,
            status: newMarketScore.status,
            submission_data: {
              ...submission.submission_data,
              productData: {
                competitors: competitorsWithUpdatedShares,
                distributions: submission.submission_data?.productData?.distributions || {}
              },
              keepaResults: newKeepaResults,
              marketScore: newMarketScore,
              metrics: {
                totalMarketCap: newMarketCap,
                revenuePerCompetitor: newRevenuePerCompetitor,
                competitorCount: newTotalCompetitors,
                calculatedAt: new Date().toISOString()
              },
              updatedAt: new Date().toISOString()
            }
          };

          const { data: updateResult, error: updateError } = await supabase
            .from('submissions')
            .update(submissionData)
            .eq('id', id)
            .eq('user_id', user.id);

          if (updateError) {
            console.error('Error updating submission:', updateError);
            throw new Error('Failed to update submission in database');
          } else {
            console.log('Successfully updated submission in Supabase');
            
            // Update local submission state
            setSubmission({
              ...submission,
              ...submissionData,
              productData: submissionData.submission_data.productData,
              keepaResults: newKeepaResults,
              marketScore: newMarketScore
            });
          }
        } catch (dbError) {
          console.error('Database update error:', dbError);
          throw new Error('Failed to save updated analysis');
        }
      }

      setRecalculationFeedback('Recalculation complete!');
      
    } catch (error) {
      console.error('Error during competitor recalculation:', error);
      setError(error instanceof Error ? error.message : 'Failed to recalculate. Please try again.');
    } finally {
      setIsRecalculating(false);
      setRecalculationFeedback('');
    }
  };

  // Handle reset calculation for saved submissions - actual recalculation
  const handleResetCalculation = async () => {
    if (!submission || !submission.productData?.competitors) return;

    console.log('Starting actual recalculation for saved submission...');
    setIsRecalculating(true);
    setError(null);
    
    try {
      setRecalculationFeedback('Recalculating market metrics...');
      
      const competitors = submission.productData.competitors;
      
      // Recalculate basic market metrics
      const newMarketCap = competitors.reduce((sum, comp) => sum + (comp.monthlyRevenue || 0), 0);
      const newRevenuePerCompetitor = competitors.length > 0 ? newMarketCap / competitors.length : 0;
      const newTotalCompetitors = competitors.length;

      setRecalculationFeedback('Calling Keepa API for fresh analysis...');

      // Get ASINs for Keepa analysis (top 5 by revenue)
      const topCompetitors = [...competitors]
        .sort((a, b) => (b.monthlyRevenue || 0) - (a.monthlyRevenue || 0))
        .slice(0, 5);
      
      const asinsToAnalyze = topCompetitors
        .map(comp => comp.asin)
        .filter(asin => asin && asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin));

      console.log('Reset: ASINs for Keepa recalculation:', asinsToAnalyze);

      // Call Keepa API for fresh analysis
      let newKeepaResults = [];
      let newMarketScore = { score: 0, status: 'FAIL' };

      if (asinsToAnalyze.length > 0) {
        try {
          const { keepaService } = await import('@/services/keepaService');
          const { calculateMarketScore } = await import('@/utils/scoring');
          
          console.log('Reset: Calling Keepa API for fresh data...');
          const keepaResults = await keepaService.getCompetitorData(asinsToAnalyze);
          
          if (keepaResults && Array.isArray(keepaResults)) {
            newKeepaResults = keepaResults;
            newMarketScore = calculateMarketScore(competitors, keepaResults);
            console.log('Reset: Keepa analysis successful:', { 
              keepaResultsCount: newKeepaResults.length, 
              newScore: newMarketScore 
            });
          } else {
            // Fallback to calculation without Keepa data
            newMarketScore = calculateMarketScore(competitors, []);
            console.log('Reset: Using fallback calculation without Keepa data');
          }
        } catch (keepaError) {
          console.error('Reset: Keepa analysis failed:', keepaError);
          // Fallback to calculation without Keepa data
          const { calculateMarketScore } = await import('@/utils/scoring');
          newMarketScore = calculateMarketScore(competitors, []);
          console.log('Reset: Using fallback calculation due to Keepa error');
        }
      } else {
        // No valid ASINs, calculate without Keepa data
        const { calculateMarketScore } = await import('@/utils/scoring');
        newMarketScore = calculateMarketScore(competitors, []);
        console.log('Reset: No valid ASINs, calculating without Keepa data');
      }

      setRecalculationFeedback('Updating submission in database...');

      // Update submission in Supabase
      if (user) {
        try {
          const submissionData = {
            score: newMarketScore.score,
            status: newMarketScore.status,
            submission_data: {
              ...submission.submission_data,
              productData: {
                competitors: competitors,
                distributions: submission.submission_data?.productData?.distributions || {}
              },
              keepaResults: newKeepaResults,
              marketScore: newMarketScore,
              metrics: {
                totalMarketCap: newMarketCap,
                revenuePerCompetitor: newRevenuePerCompetitor,
                competitorCount: newTotalCompetitors,
                calculatedAt: new Date().toISOString()
              },
              recalculatedAt: new Date().toISOString()
            }
          };

          const { data: updateResult, error: updateError } = await supabase
            .from('submissions')
            .update(submissionData)
            .eq('id', id)
            .eq('user_id', user.id);

          if (updateError) {
            console.error('Reset: Error updating submission:', updateError);
            throw new Error('Failed to update submission in database');
          } else {
            console.log('Reset: Successfully updated submission in Supabase');
            
            // Update local submission state
            setSubmission({
              ...submission,
              ...submissionData,
              productData: submissionData.submission_data.productData,
              keepaResults: newKeepaResults,
              marketScore: newMarketScore
            });
          }
        } catch (dbError) {
          console.error('Reset: Database update error:', dbError);
          throw new Error('Failed to save recalculated analysis');
        }
      }

      setRecalculationFeedback('Recalculation complete!');
      
      // Show completion message briefly
      setTimeout(() => {
        setIsRecalculating(false);
        setRecalculationFeedback('');
      }, 0);
      
    } catch (error) {
      console.error('Reset: Error during recalculation:', error);
      setError(error instanceof Error ? error.message : 'Failed to recalculate. Please try again.');
      setIsRecalculating(false);
      setRecalculationFeedback('');
    }
  };

  useEffect(() => {
    // This effect now only runs after authentication is complete
    if (!isAuthenticating && user && id) {
      fetchSubmission();
    }
  }, [id, isAuthenticating, user]);

  // Fetch validation count on component mount
  useEffect(() => {
    const fetchValidationCount = async () => {
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (!user.id) return;

        const response = await fetch(`/api/validations?userId=${user.id}`);
        if (response.ok) {
          const data = await response.json();
          setValidationsRemaining(data.remaining || 0);
        }
      } catch (error) {
        console.error('Error fetching validation count:', error);
      }
    };

    fetchValidationCount();
  }, []);

  // Update page title when submission loads
  useEffect(() => {
    if (submission) {
      const productName = submission.productName || submission.title || 'Analysis';
      document.title = `${productName} - Market Analysis`;
    }
    
    // Cleanup: reset title when component unmounts
    return () => {
      document.title = 'Amazon FBA Market Analysis';
    };
  }, [submission]);

  const fetchSubmission = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log(`Fetching submission with ID: ${id}`);
      
      // First try to get from local storage
      const localSubmission = getSubmissionFromLocalStorage(id);
      if (localSubmission) {
        console.log(`Found submission in local storage: ${localSubmission.id}`);
        
        // Apply title corrections from original CSV if available
        let correctedCompetitors = localSubmission.productData?.competitors || [];
        if (localSubmission.originalCsvData?.content && correctedCompetitors.length > 0) {
          console.log('Applying title corrections from original CSV data');
          const titleMapping = extractTitlesFromOriginalCsv(localSubmission.originalCsvData.content);
          correctedCompetitors = applyTitleCorrections(correctedCompetitors, titleMapping);
        }

        // Normalize it like we do with API data - ensure all fields are preserved
        const normalizedLocalSubmission = {
          ...localSubmission,
          // Ensure score is a number
          score: typeof localSubmission.score === 'number' ? localSubmission.score : 0,
          // Ensure we have a status
          status: localSubmission.status || 'N/A',
          // Ensure we have product data with corrected titles
          productData: localSubmission.productData ? { 
            ...localSubmission.productData,
            competitors: correctedCompetitors
          } : { 
            competitors: correctedCompetitors,
            distributions: null
          },
          // Ensure metrics exist
          metrics: localSubmission.metrics || {},
          // Ensure market score exists
          marketScore: localSubmission.marketScore || { 
            score: localSubmission.score, 
            status: localSubmission.status || 'N/A' 
          },
          // Preserve keepaResults if they exist
          keepaResults: localSubmission.keepaResults || [],
          // Preserve market insights if they exist
          marketInsights: localSubmission.marketInsights || '',
          // Ensure ID is preserved
          id: localSubmission.id,
          // Ensure createdAt exists
          createdAt: localSubmission.createdAt || new Date().toISOString()
        };
        
        // No need to save back to local storage as this is causing duplicate entries
        // Just use the normalized version directly
        setSubmission(normalizedLocalSubmission);
        setLoading(false);
      }
      
      // Wait a moment to ensure the submission is saved to storage
      await new Promise(resolve => setTimeout(resolve, 300));
      
      try {
        // Get session for authorization
        const { data: { session } } = await supabase.auth.getSession();
        
        // Fetch the submission from our API with authorization header
        const response = await fetch(`/api/analyze/${id}`, {
          headers: {
            ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
          },
          credentials: 'include'
        });
        
        if (!response.ok) {
          console.log(`API returned status ${response.status} - using local data if available`);
          
          // If we already have a local submission, keep using it and don't show error
          if (localSubmission) {
            console.log(`Using local data since API request failed`);
            return;
          }
          
          // Only throw if we don't have local data
          throw new Error(`Failed to fetch submission: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.submission) {
          console.log(`API returned no data or error - using local data if available`);
          
          // If we already have a local submission, keep using it and don't show error
          if (localSubmission) {
            console.log('Using local data since API returned no submission');
            return;
          }
          
          // Only throw if we don't have local data
          throw new Error('Failed to retrieve submission data');
        }
        
        console.log(`Successfully fetched submission from API: ${data.submission.id}`);
        
        // Apply title corrections from original CSV if available
        let correctedCompetitors = data.submission.productData?.competitors || [];
        if (data.submission.originalCsvData?.content && correctedCompetitors.length > 0) {
          console.log('Applying title corrections from original CSV data (API)');
          const titleMapping = extractTitlesFromOriginalCsv(data.submission.originalCsvData.content);
          correctedCompetitors = applyTitleCorrections(correctedCompetitors, titleMapping);
        }
        
        // Validate and normalize important data
        const normalizedSubmission = {
          ...data.submission,
          // Ensure score is a number
          score: typeof data.submission.score === 'number' ? data.submission.score : 0,
          // Ensure we have a status
          status: data.submission.status || 'N/A',
          // Ensure we have product data with corrected titles
          productData: data.submission.productData ? { 
            ...data.submission.productData,
            competitors: correctedCompetitors
          } : { 
            competitors: correctedCompetitors,
            distributions: null
          },
          // Ensure metrics exist
          metrics: data.submission.metrics || {},
          // Ensure market score exists
          marketScore: data.submission.marketScore || { 
            score: data.submission.score, 
            status: data.submission.status || 'N/A' 
          },
          // Preserve keepaResults if they exist
          keepaResults: data.submission.keepaResults || [],
          // Preserve market insights if they exist
          marketInsights: data.submission.marketInsights || '',
          // Ensure ID is preserved
          id: data.submission.id,
          // Ensure createdAt exists
          createdAt: data.submission.createdAt || new Date().toISOString()
        };
        
        // Save to local storage only if we didn't already have this submission locally
        if (!localSubmission) {
          saveSubmissionToLocalStorage(normalizedSubmission);
        }
        
        setSubmission(normalizedSubmission);
      } catch (apiError) {
        console.error('API error:', apiError);
        
        // If we already have a local submission, don't show the error
        if (!localSubmission) {
          setError(apiError instanceof Error ? apiError.message : 'Failed to fetch submission details');
        }
      }
    } catch (error) {
      console.error('Error fetching submission:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while fetching the submission');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    alert('PDF Export feature will be implemented here');
    // In production, implement PDF generation and download
  };

  const handleShareSubmission = async () => {
    try {
      const shareUrl = `${window.location.origin}/submission/${id}`;
      
      // Copy to clipboard
      await navigator.clipboard.writeText(shareUrl);
      
      // Show success message (you can replace this with a toast notification)
      alert('Share link copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy share link:', error);
      // Fallback: show the URL in a prompt
      const shareUrl = `${window.location.origin}/submission/${id}`;
      prompt('Share this link:', shareUrl);
    }
  };

  const handleTypeformSubmission = async () => {
    if (!typeformStatus.canSubmit && typeformStatusLoaded) {
      return; // This shouldn't happen as the button should be disabled
    }

    setIsSubmittingValidation(true);
    
    try {
      // First, open the Typeform immediately
      const typeformUrl = 'https://form.typeform.com/to/WQWZXnEy';
      window.open(typeformUrl, '_blank');
      
      // Then record the click/usage
      const { data: { session } } = await supabase.auth.getSession();
      
      const typeformResponse = await fetch('/api/typeform-submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        body: JSON.stringify({
          submissionId: id
        }),
        credentials: 'include'
      });

      const typeformData = await typeformResponse.json();

      if (!typeformResponse.ok) {
        if (typeformResponse.status === 403) {
          // Update local status if limit reached
          setTypeformStatus(prev => ({
            ...prev,
            canSubmit: false,
            submissionsUsed: typeformData.submissionsUsed || prev.submissionsUsed,
            submissionsRemaining: 0
          }));
          console.warn('Weekly limit reached after this submission');
        } else {
          console.warn('Failed to record typeform click:', typeformData.error);
        }
      } else {
        // Update local typeform status
        setTypeformStatus(prev => ({
          ...prev,
          canSubmit: typeformData.submissionsRemaining > 0,
          submissionsUsed: typeformData.submissionsUsed,
          submissionsRemaining: typeformData.submissionsRemaining
        }));
        setTypeformStatusLoaded(true);
      }

      // Close the modal
      setShowTypeformModal(false);

      // No alert needed - just log success
      console.log('Typeform click recorded successfully:', typeformData.message);
      
    } catch (error) {
      console.error('Error recording typeform click:', error);
      // Still open the typeform even if tracking fails
      const typeformUrl = 'https://form.typeform.com/to/WQWZXnEy';
      window.open(typeformUrl, '_blank');
      setShowTypeformModal(false);
      // No alert needed - user doesn't need to know about tracking issues
    } finally {
      setIsSubmittingValidation(false);
    }
  };

  const handleTypeformClick = () => {
    // Always show modal - it will handle the different states
    setShowTypeformModal(true);
  };


  const handleDownloadCSV = async () => {
    // First, try to download the original CSV file if available
    if (submission?.originalCsvData) {
      console.log('Downloading original CSV file:', submission.originalCsvData.fileName);
      
      try {
        // Try to use the API endpoint first (better for large files and authentication)
        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch(`/api/submissions/${id}/download`, {
          headers: {
            ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
          },
          credentials: 'include'
        });

        if (response.ok) {
          // Get the filename from the response headers
          const contentDisposition = response.headers.get('content-disposition');
          let fileName = submission.originalCsvData.fileName;
          
          if (contentDisposition) {
            const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
            if (fileNameMatch) {
              fileName = fileNameMatch[1];
            }
          }

          // Download the file
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', fileName);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          return;
        } else {
          console.warn('API download failed, falling back to client-side download');
        }
      } catch (apiError) {
        console.error('API download error, falling back to client-side:', apiError);
      }
      
      // Fallback to client-side download
      let content = submission.originalCsvData.content;
      let fileName = submission.originalCsvData.fileName;
      
      // If it's a combined file from multiple uploads, we need to handle it differently
      if (submission.originalCsvData.files && submission.originalCsvData.files.length > 1) {
        // For multiple files, download the first one or let user choose
        // For now, we'll download the combined content
        console.log('Multiple files detected, downloading combined content');
        fileName = `${submission.title || 'analysis'}_original_combined.csv`;
      }
      
      // Create and download the original file
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Fallback: Create CSV from processed competitor data (for backwards compatibility)
    if (!submission?.productData?.competitors) {
      alert('No data available to download');
      return;
    }

    console.log('No original CSV found, generating CSV from processed data');
    const competitors = submission.productData.competitors;
    const headers = ['Brand', 'ASIN', 'Monthly Revenue', 'Monthly Sales', 'Price', 'Reviews', 'Rating', 'BSR', 'Market Share'];
    
    const csvContent = [
      headers.join(','),
      ...competitors.map(comp => [
        comp.brand || '',
        comp.asin || '',
        comp.monthlyRevenue || 0,
        comp.monthlySales || 0,
        comp.price || 0,
        comp.reviews || 0,
        comp.rating || 0,
        comp.bsr || 0,
        comp.marketShare || 0
      ].join(','))
    ].join('\n');

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${submission.title || 'analysis'}_competitors.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Show authentication loading screen
  if (isAuthenticating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="flex flex-col items-center">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
          <p className="text-slate-400">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="flex flex-col items-center">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
          <p className="text-slate-400">Loading analysis results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 max-w-md text-center">
          <div className="text-red-400 mb-4 flex justify-center">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-slate-300 font-medium mb-2">Failed to load submission</p>
          <p className="text-slate-400 mb-6">{error}</p>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white inline-block"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 max-w-md text-center">
          <p className="text-slate-400 mb-4">Analysis not found</p>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white inline-block"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Calculate metric values from submission data
  const marketCap = submission.metrics?.totalMarketCap || 
    (submission.productData?.competitors?.reduce((sum, comp) => sum + (comp.monthlyRevenue || 0), 0) || 0);
  
  const revenuePerCompetitor = submission.metrics?.revenuePerCompetitor || 
    (submission.productData?.competitors?.length > 0 
      ? marketCap / submission.productData.competitors.length 
      : 0);
  
  const totalCompetitors = submission.metrics?.competitorCount || 
    (submission.productData?.competitors?.length || 0);
  
  const marketScore = typeof submission.marketScore === 'object' 
    ? submission.marketScore.score || submission.score
    : submission.score;
  
  const marketStatus = typeof submission.marketScore === 'object'
    ? submission.marketScore.status || 'N/A'
    : submission.status;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      {/* Recalculation Loading Overlay */}
      {isRecalculating && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-8 max-w-md w-full mx-4 border border-slate-700">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                Recalculating Analysis
              </h3>
              <p className="text-slate-400 mb-4">
                {recalculationFeedback || 'Processing your saved data with updated calculations...'}
              </p>
              <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <img 
                src="/grow-with-fba.png"
                alt="Elevate Icon"
                className="h-12 w-auto"
              />
              <div>
                <h1 className="text-2xl font-bold text-white">{submission.productName || submission.title || 'Untitled Analysis'}</h1>
                <p className="text-slate-400">
                  Analyzed on {submission.createdAt ? new Date(submission.createdAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }).replace(/\//g, '/') : '4/9/2025'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button 
                onClick={handleShareSubmission}
                className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg transition-colors flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                <span>Share</span>
              </button>
              
              <button 
                onClick={handleTypeformClick}
                disabled={isLoadingTypeformStatus}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  isLoadingTypeformStatus 
                    ? 'bg-slate-600/50 text-slate-400 cursor-not-allowed' 
                    : typeformStatus.canSubmit || !typeformStatusLoaded
                      ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 hover:text-purple-300'
                      : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300'
                }`}
                title={
                  isLoadingTypeformStatus 
                    ? 'Loading submission status...' 
                    : !typeformStatusLoaded
                      ? 'Submit for validation (checking status...)'
                    : typeformStatus.canSubmit 
                      ? `Submit for validation (${typeformStatus.submissionsRemaining} remaining this week)`
                      : `Weekly limit reached (${typeformStatus.submissionsUsed}/2 used)`
                }
              >
                <ExternalLink className="w-4 h-4" />
                <span>
                  {isLoadingTypeformStatus 
                    ? 'Loading...' 
                    : !typeformStatusLoaded
                      ? 'Submit Validation'
                    : typeformStatus.canSubmit 
                      ? `Submit Validation (${typeformStatus.submissionsRemaining})` 
                      : `Limit Reached (${typeformStatus.submissionsUsed}/2)`
                  }
                </span>
              </button>
              
              <button 
                onClick={handleDownloadCSV}
                className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg transition-colors flex items-center gap-2"
                title={submission?.originalCsvData ? "Download original uploaded CSV file" : "Download processed competitor data as CSV"}
              >
                <Download className="w-4 h-4" />
                <span>{submission?.originalCsvData ? 'Download Original' : 'Download CSV'}</span>
              </button>
              
              <button 
                onClick={handleResetCalculation}
                disabled={isRecalculating}
                className="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 disabled:bg-slate-800 disabled:cursor-not-allowed rounded-lg text-slate-300 hover:text-white disabled:text-slate-500 transition-colors flex items-center gap-2"
                title="Recalculate market score with fresh Keepa data"
              >
                <RotateCcw className={`w-4 h-4 ${isRecalculating ? 'animate-spin' : ''}`} />
                <span>{isRecalculating ? 'Recalculating...' : 'Recalculate'}</span>
              </button>
              
              <Link
                href="/dashboard"
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
        
        {/* Use ProductVettingResults component for full functionality */}
        <ProductVettingResults
          competitors={submission.productData?.competitors || []}
          distributions={submission.productData?.distributions}
          keepaResults={submission.keepaResults || []}
          marketScore={submission.marketScore || { score: submission.score, status: submission.status }}
          analysisComplete={true}
          productName={submission.productName || submission.title || 'Untitled Analysis'}
          alreadySaved={true}
          onResetCalculation={handleResetCalculation}
          isRecalculating={isRecalculating}
          onCompetitorsUpdated={handleCompetitorsUpdated}
        />
      </div>

      {/* Typeform Submission Modal */}
      <TypeformSubmissionModal
        isOpen={showTypeformModal}
        onClose={() => setShowTypeformModal(false)}
        canSubmit={typeformStatusLoaded ? typeformStatus.canSubmit : true}
        submissionsUsed={typeformStatus.submissionsUsed}
        submissionsRemaining={typeformStatus.submissionsRemaining}
        weekResetsAt={typeformStatus.weekResetsAt}
        onSubmit={handleTypeformSubmission}
        isLoading={isSubmittingValidation || isLoadingTypeformStatus}
      />
    </div>
  );
}
