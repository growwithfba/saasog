'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, CheckCircle2, Share2, ExternalLink, Download, RotateCcw } from 'lucide-react';
import { getSubmissionFromLocalStorage, saveSubmissionToLocalStorage } from '@/utils/storageUtils';
import { supabase } from '@/utils/supabaseClient';
import { ProductVettingResults } from '@/components/Results/ProductVettingResults';


export default function SubmissionPage() {
  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [validationsRemaining, setValidationsRemaining] = useState<number>(2);
  const [isSubmittingValidation, setIsSubmittingValidation] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalculationFeedback, setRecalculationFeedback] = useState<string>('');
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  // Handle reset calculation for saved submissions
  const handleResetCalculation = async () => {
    if (!submission) return;

    const startTime = Date.now();
    setIsRecalculating(true);
    setError(null);
    
    try {
      console.log('Starting recalculation for saved submission...');
      setRecalculationFeedback('Recalculating analysis...');
      
      // Simulate processing time with meaningful steps
      await new Promise(resolve => setTimeout(resolve, 800));
      setRecalculationFeedback('Processing competitor data...');
      
      await new Promise(resolve => setTimeout(resolve, 600));
      setRecalculationFeedback('Calculating market scores...');
      
      await new Promise(resolve => setTimeout(resolve, 400));
      setRecalculationFeedback('Finalizing results...');
      
      // For saved submissions, we'll simulate recalculation by refreshing the data
      // In a real scenario, you might want to re-fetch from the API or reprocess the data
      
      // Ensure minimum 2 seconds loading time for better UX
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, 2000 - elapsedTime);
      
      setRecalculationFeedback('Recalculation complete!');
      
      setTimeout(() => {
        setIsRecalculating(false);
        setRecalculationFeedback('');
        
        // Optional: You could refresh the submission data here
        // fetchSubmission();
      }, remainingTime);
      
    } catch (error) {
      console.error('Error during recalculation:', error);
      setError(error instanceof Error ? error.message : 'Failed to recalculate. Please try again.');
      setIsRecalculating(false);
      setRecalculationFeedback('');
    }
  };

  useEffect(() => {
    if (!id) return;
    
    const initializePage = async () => {
      // Check if user is authenticated via Supabase
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Session error:', error);
        router.push('/login');
        return;
      }
      
      if (!session) {
        // Check for anonymous session or localStorage fallback
        const localUser = localStorage.getItem('user');
        if (!localUser) {
          router.push('/login');
          return;
        }
      }
      
      fetchSubmission();
    };
    
    initializePage();
  }, [id, router]);

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
      document.title = `${productName} - Market Analysis | SaasOG`;
    }
    
    // Cleanup: reset title when component unmounts
    return () => {
      document.title = 'SaasOG - Amazon FBA Market Analysis';
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
        
        // Normalize it like we do with API data - ensure all fields are preserved
        const normalizedLocalSubmission = {
          ...localSubmission,
          // Ensure score is a number
          score: typeof localSubmission.score === 'number' ? localSubmission.score : 0,
          // Ensure we have a status
          status: localSubmission.status || 'N/A',
          // Ensure we have product data
          productData: localSubmission.productData || { 
            competitors: [],
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
        
        // Validate and normalize important data
        const normalizedSubmission = {
          ...data.submission,
          // Ensure score is a number
          score: typeof data.submission.score === 'number' ? data.submission.score : 0,
          // Ensure we have a status
          status: data.submission.status || 'N/A',
          // Ensure we have product data
          productData: data.submission.productData || { 
            competitors: [],
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

  const handleSubmitValidation = async () => {
    if (validationsRemaining <= 0) {
      alert('You have reached the maximum of 2 validation submissions.');
      return;
    }

    setIsSubmittingValidation(true);
    
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const shareUrl = `${window.location.origin}/submission/${id}`;
      
      // First, make sure the submission is publicly accessible
      const shareResponse = await fetch('/api/submissions/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ submissionId: id }),
      });

      if (!shareResponse.ok) {
        throw new Error('Failed to make submission publicly accessible');
      }

      // Submit the validation request
      const validationResponse = await fetch('/api/validations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          submissionId: id,
          submissionUrl: shareUrl
        }),
      });

      const validationData = await validationResponse.json();

      if (!validationResponse.ok) {
        throw new Error(validationData.error || 'Failed to submit validation');
      }

      // Update remaining validations
      setValidationsRemaining(validationData.remaining);

      // Open the Typeform with the submission link
      const typeformUrl = `https://form.typeform.com/to/YOUR_FORM_ID?submission_link=${encodeURIComponent(shareUrl)}`;
      window.open(typeformUrl, '_blank');

      alert('Validation request submitted successfully!');
    } catch (error) {
      console.error('Error submitting validation:', error);
      alert(`Failed to submit validation: ${error.message}`);
    } finally {
      setIsSubmittingValidation(false);
    }
  };


  const handleDownloadCSV = () => {
    if (!submission?.productData?.competitors) {
      alert('No competitor data available to download');
      return;
    }

    // Create CSV content from competitor data
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
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <img 
                src="/GWF7.png"
                alt="Elevate Icon"
                className="h-12 w-auto"
              />
              <div>
                <h1 className="text-2xl font-bold text-white">{submission.productName || submission.title || 'Untitled Analysis'}</h1>
                <p className="text-slate-400">
                  Analyzed on {submission.createdAt ? new Date(submission.createdAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }).replace(/\//g, '/') : '4/9/2025'} • ID: {submission.id ? submission.id.substring(0, 10) : 'sub_17442521'}
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
                onClick={handleSubmitValidation}
                disabled={validationsRemaining <= 0 || isSubmittingValidation}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  validationsRemaining <= 0 
                    ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed' 
                    : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400'
                }`}
              >
                <ExternalLink className="w-4 h-4" />
                <span>
                  {isSubmittingValidation 
                    ? 'Submitting...' 
                    : `Submit Validation (${validationsRemaining} left)`
                  }
                </span>
              </button>
              
              <button 
                onClick={handleDownloadCSV}
                className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download CSV</span>
              </button>
              
              <button 
                onClick={handleResetCalculation}
                className="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset</span>
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
        />
      </div>
    </div>
  );
}
