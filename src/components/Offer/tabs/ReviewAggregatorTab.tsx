'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, Sparkles, Loader2, CheckCircle, AlertCircle, Plus, MessageSquare, Brain, Zap, BarChart3 } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import Papa from 'papaparse';
import { ReviewInsightsPanel } from '@/components/Offer/ReviewInsightsPanel';

// Interface for parsed review from CSV
interface Review {
  title: string;
  body: string;
  rating: number | string;
}

interface ReviewAggregatorTabProps {
  productId: string | null;
  data?: {
    topLikes: string;
    topDislikes: string;
    importantInsights: string;
    importantQuestions: string;
    strengthsTakeaway?: string;
    painPointsTakeaway?: string;
    insightsTakeaway?: string;
    questionsTakeaway?: string;
    totalReviewCount?: number;
    positiveReviewCount?: number;
    neutralReviewCount?: number;
    negativeReviewCount?: number;
  };
  onChange: (data: {
    topLikes: string;
    topDislikes: string;
    importantInsights: string;
    importantQuestions: string;
    strengthsTakeaway?: string;
    painPointsTakeaway?: string;
    insightsTakeaway?: string;
    questionsTakeaway?: string;
    totalReviewCount?: number;
    positiveReviewCount?: number;
    neutralReviewCount?: number;
    negativeReviewCount?: number;
  }) => void;
  storedReviewsCount?: number;
  onDirtyChange?: (isDirty: boolean) => void;
  onInsightsSaved?: () => void;
}

// Loading progress steps for visual feedback
const ANALYSIS_STEPS = [
  { icon: Upload, label: 'Uploading file...', duration: 2000 },
  { icon: Brain, label: 'AI analyzing reviews...', duration: 4000 },
  { icon: BarChart3, label: 'Extracting insights...', duration: 3000 },
  { icon: Zap, label: 'Generating recommendations...', duration: 2000 },
];

const GENERATE_STEPS = [
  { icon: Brain, label: 'AI analyzing product data...', duration: 3000 },
  { icon: BarChart3, label: 'Identifying patterns...', duration: 3000 },
  { icon: Zap, label: 'Generating insights...', duration: 2000 },
];

export function ReviewAggregatorTab({ productId, data, onChange, storedReviewsCount = 0, onDirtyChange, onInsightsSaved }: ReviewAggregatorTabProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const addMoreFileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasReviews, setHasReviews] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingType, setLoadingType] = useState<'analyze' | 'generate'>('analyze');
  const [totalReviews, setTotalReviews] = useState(storedReviewsCount || 0);
  const [overflowModal, setOverflowModal] = useState<{
    existingReviews: Review[];
    newReviews: Review[];
    remaining: number;
  } | null>(null);

  // Animate through loading steps
  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      setLoadingProgress(0);
      return;
    }

    const steps = loadingType === 'analyze' ? ANALYSIS_STEPS : GENERATE_STEPS;
    let currentStep = 0;
    let progress = 0;

    const progressInterval = setInterval(() => {
      progress += 2;
      setLoadingProgress(Math.min(progress, 95)); // Cap at 95% until complete
    }, 200);

    const stepInterval = setInterval(() => {
      currentStep = (currentStep + 1) % steps.length;
      setLoadingStep(currentStep);
    }, 2500);

    return () => {
      clearInterval(progressInterval);
      clearInterval(stepInterval);
    };
  }, [loading, loadingType]);

  const reviewInsights = data || {
    topLikes: '',
    topDislikes: '',
    importantInsights: '',
    importantQuestions: '',
    strengthsTakeaway: '',
    painPointsTakeaway: '',
    insightsTakeaway: '',
    questionsTakeaway: '',
    totalReviewCount: 0,
    positiveReviewCount: 0,
    neutralReviewCount: 0,
    negativeReviewCount: 0
  };

  const sanitizeCsvValue = (value: string | number) => {
    const stringValue = String(value ?? '');
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const buildCsvFromReviews = (reviews: Review[]) => {
    const header = 'title,body,rating';
    const rows = reviews.map(r => [
      sanitizeCsvValue(r.title || ''),
      sanitizeCsvValue(r.body || ''),
      sanitizeCsvValue(r.rating ?? '')
    ].join(','));
    return [header, ...rows].join('\n');
  };

  const makeReviewKey = (review: Review) => {
    return [
      (review.title || '').trim().toLowerCase(),
      (review.body || '').trim().toLowerCase(),
      String(review.rating ?? '').trim().toLowerCase()
    ].join('||');
  };

  const dedupeReviews = (reviews: Review[]) => {
    const seen = new Set<string>();
    const unique: Review[] = [];
    for (const r of reviews) {
      const key = makeReviewKey(r);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(r);
    }
    return unique;
  };

  const analyzeAndPersist = async (mergedReviews: Review[], options?: { userId?: string; fileName?: string }) => {
    if (!productId) return;
    const { userId, fileName } = options || {};
    const { data: { session } } = await supabase.auth.getSession();
    const csvString = buildCsvFromReviews(mergedReviews);
    const csvFile = new File([csvString], fileName || 'reviews.csv', { type: 'text/csv' });

    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('productId', productId);

    const response = await fetch('/api/offer/analyze-reviews', {
      method: 'POST',
      body: formData,
      headers: {
        ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
      },
    });

    const result = await response.json();

    if (!response.ok) {
      // Use the error message from the API if available, otherwise use a generic message
      const errorMessage = result.error || result.message || 'Failed to analyze reviews';
      throw new Error(errorMessage);
    }

    if (result.success && result.data) {
      onChange(result.data.reviewInsights);
      setSuccess(true);
      setHasReviews(true);
      setSelectedFile(null);

      try {
        const saveResponse = await fetch('/api/offer/save-reviews', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
          },
          body: JSON.stringify({
            productId,
            reviews: dedupeReviews(mergedReviews),
            insights: result.data.reviewInsights,
            user_id: userId ?? session?.user?.id
          }),
        });

        if (!saveResponse.ok) {
          const saveError = await saveResponse.json();
          console.error('Error storing reviews/insights:', saveError);
        } else {
          const saveResult = await saveResponse.json();
          console.log('Reviews and insights stored successfully in offer_products');
          setTotalReviews(saveResult.data.reviewsStored);
          onInsightsSaved?.();
        }
      } catch (saveError) {
        console.error('Error storing reviews/insights:', saveError);
      }

      setTimeout(() => setSuccess(false), 3000);
    } else {
      throw new Error(result.error || 'Failed to generate insights');
    }
  };

  // Check if we have any review data
  const hasReviewData = reviewInsights.topLikes || reviewInsights.topDislikes || 
                       reviewInsights.importantInsights || reviewInsights.importantQuestions;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
      setSelectedFile(file);
      setError(null);
      setSuccess(false);
    } else {
      setError('Please select a valid CSV file');
    }
  };

  const fetchExistingReviews = async (): Promise<Review[]> => {
    if (!productId) return [];
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/offer?productId=${productId}`, {
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        }
      });

      if (!response.ok) return [];
      const result = await response.json();
      const reviews = result?.data?.offerProduct?.reviews;
      return Array.isArray(reviews) ? reviews : [];
    } catch (err) {
      console.error('Error fetching existing reviews:', err);
      return [];
    }
  };

  const handleAnalyzeReviews = async () => {
    if (!selectedFile || !productId) {
      setError('Please select a file and a product');
      return;
    }

    setLoadingType('analyze');
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Parse the CSV file to extract reviews
      const fileText = await selectedFile.text();
      const parseResult = Papa.parse<Review>(fileText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase(),
      });

      // Map parsed data to Review objects
      const parsedReviews: Review[] = parseResult.data.map((row: any) => ({
        title: row.title || '',
        body: row.body || '',
        rating: row.rating ? (isNaN(Number(row.rating)) ? row.rating : Number(row.rating)) : 0,
      }));
      const reviews = dedupeReviews(parsedReviews);

      console.log(`Parsed ${reviews.length} reviews from CSV`);
      if (!reviews.length) {
        setError('No new reviews found (all are duplicates or the file is empty).');
        setLoading(false);
        return;
      }

      await analyzeAndPersist(dedupeReviews(reviews), { fileName: selectedFile.name });
    } catch (error) {
      console.error('Error analyzing reviews:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze reviews');
    } finally {
      setLoading(false);
    }
  };

  const processAdditionalReviews = async (file: File) => {
    if (!productId) {
      setError('Please select a product');
      return;
    }

    setLoadingType('analyze');
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const existingReviews = dedupeReviews(await fetchExistingReviews());
      const fileText = await file.text();
      const parseResult = Papa.parse<Review>(fileText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase(),
      });

      const newReviews: Review[] = parseResult.data.map((row: any) => ({
        title: row.title || '',
        body: row.body || '',
        rating: row.rating ? (isNaN(Number(row.rating)) ? row.rating : Number(row.rating)) : 0,
      }));
      const newUniqueReviews = dedupeReviews(newReviews);

      // Remove duplicates that already exist to avoid double counting
      const existingKeys = new Set(existingReviews.map(makeReviewKey));
      const newNonDuplicate = newUniqueReviews.filter(r => !existingKeys.has(makeReviewKey(r)));

      if (!newNonDuplicate.length) {
        setError('No new reviews to add (all are duplicates).');
        setLoading(false);
        return;
      }

      const remaining = 100 - existingReviews.length;
      if (remaining <= 0) {
        setError('You have already reached the maximum of 100 reviews for this product.');
        return;
      }

      let reviewsToUse = newNonDuplicate;
      if (newNonDuplicate.length > remaining) {
        // Show modal to choose between taking only the remaining or replacing existing reviews
        setOverflowModal({
          existingReviews,
          newReviews: newNonDuplicate,
          remaining
        });
        setLoading(false);
        return;
      }

      const mergedReviews = [...existingReviews, ...reviewsToUse];
      await analyzeAndPersist(mergedReviews, { fileName: 'additional-reviews.csv' });
    } catch (error) {
      console.error('Error processing additional reviews:', error);
      setError(error instanceof Error ? error.message : 'Failed to process additional reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof typeof reviewInsights, value: string) => {
    onChange({
      ...reviewInsights,
      [field]: value
    });
    if (value) setHasReviews(true);
    onDirtyChange?.(true);
  };

  // Handler for ReviewInsightsPanel to preserve behavior
  const handleInsightsChange = (updatedInsights: {
    topLikes: string;
    topDislikes: string;
    importantInsights: string;
    importantQuestions: string;
    strengthsTakeaway?: string;
    painPointsTakeaway?: string;
    insightsTakeaway?: string;
    questionsTakeaway?: string;
    totalReviewCount?: number;
    positiveReviewCount?: number;
    neutralReviewCount?: number;
    negativeReviewCount?: number;
  }) => {
    onChange(updatedInsights);
    // Check if any field has content to set hasReviews
    if (updatedInsights.topLikes || updatedInsights.topDislikes || 
        updatedInsights.importantInsights || updatedInsights.importantQuestions) {
      setHasReviews(true);
    }
    onDirtyChange?.(true);
  };

  const handleAddMoreClick = () => {
    if (!productId) {
      setError('Please select a product');
      return;
    }
    if (loading) return;
    setError(null);
    if (addMoreFileInputRef.current) {
      addMoreFileInputRef.current.value = '';
      addMoreFileInputRef.current.click();
    }
  };

  const handleAddMoreFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!(file.type === 'text/csv' || file.name.endsWith('.csv'))) {
      setError('Please select a valid CSV file');
      return;
    }
    processAdditionalReviews(file);
  };

  const handleOverflowChoice = async (mode: 'difference' | 'replace') => {
    if (!overflowModal || !productId) return;
    const { existingReviews, newReviews, remaining } = overflowModal;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      let reviewsToUse: Review[];
      if (mode === 'difference') {
        reviewsToUse = newReviews.slice(0, remaining);
        await analyzeAndPersist([...existingReviews, ...reviewsToUse], { fileName: 'additional-reviews.csv', userId });
      } else {
        reviewsToUse = newReviews.slice(0, 100);
        await analyzeAndPersist(reviewsToUse, { fileName: 'additional-reviews.csv', userId });
      }
      setOverflowModal(null);
    } catch (err) {
      console.error('Error handling overflow choice:', err);
      setError(err instanceof Error ? err.message : 'Failed to process reviews');
    } finally {
      setLoading(false);
    }
  };

  // Get current step info for the loading overlay
  const currentSteps = loadingType === 'analyze' ? ANALYSIS_STEPS : GENERATE_STEPS;
  const CurrentStepIcon = currentSteps[loadingStep]?.icon || Brain;
  const currentStepLabel = currentSteps[loadingStep]?.label || 'Processing...';

  // AI Analysis Loading Overlay
  const loadingMarkup = (loading && (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-3xl border-2 border-purple-500/50 shadow-2xl shadow-purple-500/20 p-8 max-w-md w-full mx-4 relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        
        <div className="relative z-10">
          {/* Animated icon container */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              {/* Spinning outer ring */}
              <div className="absolute inset-0 w-24 h-24 border-4 border-purple-500/20 rounded-full"></div>
              <div className="absolute inset-0 w-24 h-24 border-4 border-transparent border-t-purple-500 border-r-purple-500 rounded-full animate-spin"></div>
              
              {/* Inner icon container */}
              <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-purple-500/50 animate-pulse">
                <CurrentStepIcon className="w-10 h-10 text-white" strokeWidth={2} />
              </div>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-2xl font-bold text-center bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-2">
            {loadingType === 'analyze' ? 'Analyzing Reviews' : 'Generating Insights'}
          </h3>

          {/* Current step label */}
          <p className="text-center text-slate-300 mb-6 h-6 transition-all duration-300">
            {currentStepLabel}
          </p>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-500">
              <span>Processing</span>
              <span>{Math.round(loadingProgress)}%</span>
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex justify-center gap-2 mt-4">
            {currentSteps.map((step, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  index === loadingStep
                    ? 'bg-purple-500 scale-125'
                    : index < loadingStep
                    ? 'bg-purple-500/50'
                    : 'bg-slate-600'
                }`}
              ></div>
            ))}
          </div>

          {/* Tip message */}
          <p className="text-center text-xs text-slate-500 mt-6">
            ✨ Our AI is carefully analyzing your data for the best insights
          </p>
        </div>
      </div>
    </div>
  ));

  // Check if we should hide the uploader (reviews already stored in DB or has review data)
  const hasStoredReviews = totalReviews > 0;
  const currentStoredCount = Math.min(totalReviews, 100);
  const remainingSlots = Math.max(0, 100 - currentStoredCount);

  // Review Uploader Section - Enhanced (hide if reviews already exist in DB)
  const reviewUploaderMarkup = !hasReviewData && !hasStoredReviews && (
      <div className="bg-gradient-to-br from-purple-900/20 via-slate-800/50 to-blue-900/20 rounded-2xl border-2 border-purple-500/40 shadow-lg p-6 relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-xl flex items-center justify-center">
                <Upload className="w-5 h-5 text-purple-400" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Review Uploader</h3>
                <p className="text-sm text-slate-400 mt-1">Upload Customer Reviews (CSV or Document)</p>
              </div>
            </div>
            <div className="hidden md:block">
              <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center border border-purple-500/20">
                <Upload className="w-6 h-6 text-purple-400" strokeWidth={1.5} />
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="relative">
                <input
                  type="file"
                  accept=".csv,.doc,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="review-upload"
                  disabled={loading}
                />
                <label
                  htmlFor="review-upload"
                  className={`flex items-center gap-3 px-5 py-4 bg-slate-900/60 border-2 border-slate-700/50 rounded-lg cursor-pointer transition-all duration-200 ${
                    loading
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:border-purple-500/50 hover:bg-slate-900/80 hover:shadow-lg hover:shadow-purple-500/10'
                  }`}
                >
                  <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                    <Upload className="w-5 h-5 text-purple-400" />
                  </div>
                  <span className="text-sm font-medium text-slate-300 flex-1">
                    {selectedFile ? (
                      <span className="text-purple-300">{selectedFile.name}</span>
                    ) : (
                      'Choose file to upload'
                    )}
                  </span>
                  {selectedFile && (
                    <span className="text-xs text-emerald-400 font-medium">✓ Selected</span>
                  )}
                </label>
              </div>
            </div>

            <button
              onClick={handleAnalyzeReviews}
              disabled={!selectedFile || loading}
              className="w-full px-6 py-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 hover:shadow-xl hover:shadow-purple-500/30 hover:scale-[1.02] transform duration-200"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyzing Reviews...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Analyze Uploaded Reviews With AI
                </>
              )}
            </button>
          </div>
        </div>
      </div>
  );

  // Generate With AI Button - Show above insights
  // const generateWithAIMarkup = hasReviewData && (
  //   <div className="flex justify-end">
  //     <button
  //       onClick={handleGenerateWithAI}
  //       disabled={loading}
  //       className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all flex items-center gap-2"
  //     >
  //       {loading ? (
  //         <>
  //           <Loader2 className="w-4 h-4 animate-spin" />
  //           Generating...
  //         </>
  //       ) : (
  //         <>
  //           <Sparkles className="w-4 h-4" />
  //           Generate With AI
  //         </>
  //       )}
  //     </button>
  //   </div>
  // );

  return (
    <div className="space-y-6 relative">
      {loadingMarkup}
      {reviewUploaderMarkup}
      {/* {generateWithAIMarkup} */}
      {overflowModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-xl font-bold text-white">Review limit reached</h3>
            <p className="text-slate-300 text-sm">
              You already have {overflowModal.existingReviews.length} reviews. Adding {overflowModal.newReviews.length} more exceeds the maximum of 100.
            </p>
            <p className="text-slate-300 text-sm">
              Choose how to proceed:
            </p>
            <ul className="text-slate-300 text-sm list-disc pl-5 space-y-1">
              <li>Take only the remaining {overflowModal.remaining} new reviews</li>
              <li>Replace existing reviews with the new file (up to 100)</li>
            </ul>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setOverflowModal(null)}
                className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleOverflowChoice('difference')}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500"
                disabled={loading}
              >
                Take remaining ({overflowModal.remaining})
              </button>
              <button
                onClick={() => handleOverflowChoice('replace')}
                className="px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-400"
                disabled={loading}
              >
                Replace with new file
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Review Insights Section - WOW Factor */}
      <div className="bg-gradient-to-br from-blue-900/30 via-indigo-900/20 to-slate-800/50 rounded-2xl border-2 border-blue-500/70 shadow-2xl shadow-blue-500/20 p-8 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl"></div>
        
        <div className="flex items-start justify-between mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/50">
              <MessageSquare className="w-6 h-6 text-white" strokeWidth={2.5} fill="white" />
            </div>
            <div>
              <h3 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent">
                AI Review Insights
              </h3>
              <p className="text-slate-300 text-sm mt-1">Strategic intelligence derived from real customer feedback</p>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-blue-500/30">
              <MessageSquare className="w-8 h-8 text-blue-400" strokeWidth={1.5} />
            </div>
          </div>
        </div>
        
        <div className="relative z-10">
          <ReviewInsightsPanel 
            variant="embedded" 
            data={reviewInsights} 
            onChange={handleInsightsChange} 
          />
        </div>
      </div>

      {/* Action Buttons - Show if reviews exist */}
      {hasReviewData && (
        <div className="flex justify-end gap-3">
          <input
            ref={addMoreFileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleAddMoreFileSelect}
            disabled={loading || currentStoredCount >= 100}
          />
          <button
            onClick={handleAddMoreClick}
            disabled={loading || currentStoredCount >= 100}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {`Add More Reviews (${currentStoredCount}/100)`}
            {remainingSlots === 0 && <span className="text-xs text-red-300">(max reached)</span>}
          </button>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="p-4 bg-emerald-500/10 border-2 border-emerald-500/20 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          <span className="text-sm text-emerald-400 font-medium">
            Insights generated successfully! Review and edit the suggestions above.
          </span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-500/10 border-2 border-red-500/20 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm text-red-400 font-medium">{error}</span>
        </div>
      )}
    </div>
  );
}
