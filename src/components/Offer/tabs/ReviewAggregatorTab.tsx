'use client';

import { useState, useEffect } from 'react';
import { Upload, Sparkles, Loader2, CheckCircle, AlertCircle, Plus, FileText, MessageSquare, Lightbulb, HelpCircle, Brain, Zap, BarChart3 } from 'lucide-react';
import type { OfferData } from '../types';
import { supabase } from '@/utils/supabaseClient';
import Papa from 'papaparse';

// Interface for parsed review from CSV
interface Review {
  title: string;
  comment: string;
  stars: number | string;
}

interface ReviewAggregatorTabProps {
  productId: string | null;
  data?: {
    topLikes: string;
    topDislikes: string;
    importantInsights: string;
    importantQuestions: string;
  };
  onChange: (data: {
    topLikes: string;
    topDislikes: string;
    importantInsights: string;
    importantQuestions: string;
  }) => void;
  storedReviewsCount?: number;
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

export function ReviewAggregatorTab({ productId, data, onChange, storedReviewsCount = 0 }: ReviewAggregatorTabProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasReviews, setHasReviews] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingType, setLoadingType] = useState<'analyze' | 'generate'>('analyze');

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
    importantQuestions: ''
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
      const reviews: Review[] = parseResult.data.map((row: any) => ({
        title: row.title || '',
        comment: row.comment || '',
        stars: row.stars ? (isNaN(Number(row.stars)) ? row.stars : Number(row.stars)) : 0,
      }));

      console.log(`Parsed ${reviews.length} reviews from CSV`);

      // Store reviews in offer_products table before analyzing
      const { data: { session } } = await supabase.auth.getSession();
      
      const saveResponse = await fetch('/api/offer/save-reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        body: JSON.stringify({
          productId: productId,
          reviews: reviews,
        }),
      });

      if (!saveResponse.ok) {
        const saveError = await saveResponse.json();
        console.error('Error storing reviews:', saveError);
        // Continue with analysis even if storage fails
      } else {
        console.log('Reviews stored successfully in offer_products');
      }

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('productId', productId);
      // debugger

      const response = await fetch('/api/offer/analyze-reviews', {
        method: 'POST',
        body: formData,
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
      });

      if (!response.ok) {
        throw new Error('Failed to analyze reviews');
      }

      const result = await response.json();

      if (result.success && result.data) {
        onChange(result.data.reviewInsights);
        setSuccess(true);
        setHasReviews(true);
        setSelectedFile(null);
        
        setTimeout(() => setSuccess(false), 3000);
      } else {
        throw new Error(result.error || 'Failed to generate insights');
      }
    } catch (error) {
      console.error('Error analyzing reviews:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateWithAI = async () => {
    if (!productId) {
      setError('Please select a product');
      return;
    }

    setLoadingType('generate');
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/offer/analyze-reviews', {
        method: 'POST',
        body: JSON.stringify({ productId, generateOnly: true }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to generate insights');
      }

      const result = await response.json();

      if (result.success && result.data) {
        onChange(result.data.reviewInsights);
        setSuccess(true);
        setHasReviews(true);
        
        setTimeout(() => setSuccess(false), 3000);
      } else {
        throw new Error(result.error || 'Failed to generate insights');
      }
    } catch (error) {
      console.error('Error generating insights:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate insights');
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
  const hasStoredReviews = storedReviewsCount > 0;

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
  const generateWithAIMarkup = hasReviewData && (
    <div className="flex justify-end">
      <button
        onClick={handleGenerateWithAI}
        disabled={loading}
        className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all flex items-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate With AI
          </>
        )}
      </button>
    </div>
  );

  // Message showing stored reviews count
  const storedReviewsMarkup = hasStoredReviews && !hasReviewData && (
    <div className="bg-gradient-to-br from-emerald-900/20 via-slate-800/50 to-emerald-900/20 rounded-2xl border-2 border-emerald-500/40 shadow-lg p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl"></div>
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500/20 to-green-500/20 rounded-xl flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-400" strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Reviews Already Uploaded</h3>
            <p className="text-sm text-slate-400 mt-1">
              {storedReviewsCount} review{storedReviewsCount !== 1 ? 's' : ''} stored for this product
            </p>
          </div>
        </div>
        <p className="text-slate-300 text-sm mb-4">
          You have already uploaded reviews for this product. Click "Generate With AI" to analyze them and generate insights.
        </p>
        <button
          onClick={handleGenerateWithAI}
          disabled={loading}
          className="w-full px-6 py-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 hover:shadow-xl hover:shadow-purple-500/30 hover:scale-[1.02] transform duration-200"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating Insights...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate Insights From Stored Reviews
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 relative">
      {loadingMarkup}
      {reviewUploaderMarkup}
      {storedReviewsMarkup}
      {generateWithAIMarkup}

      {/* Review Insights Section - WOW Factor */}
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
                Review Insights
              </h3>
              <p className="text-slate-300 text-sm mt-1">Key findings from customer feedback analysis</p>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-blue-500/30">
              <MessageSquare className="w-8 h-8 text-blue-400" strokeWidth={1.5} />
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
          {/* Top 5 Customer Likes - Green theme with WOW factor */}
          <div className="bg-gradient-to-br from-emerald-900/30 via-green-900/20 to-slate-800/50 rounded-2xl p-6 border-2 border-emerald-500/70 shadow-xl shadow-emerald-500/20 relative overflow-hidden group hover:shadow-2xl hover:shadow-emerald-500/30 transition-all duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:blur-3xl transition-all"></div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/50 group-hover:scale-110 transition-transform duration-300">
                <CheckCircle className="w-7 h-7 text-white" strokeWidth={2.5} fill="white" />
              </div>
              <label className="block text-xl font-bold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
                Top 5 Customer Likes
              </label>
            </div>
            <textarea
              value={reviewInsights.topLikes}
              onChange={(e) => handleChange('topLikes', e.target.value)}
              rows={10}
              className="w-full px-4 py-3 bg-slate-900/60 border-2 border-emerald-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/50 resize-none transition-all duration-300 relative z-10"
              placeholder="Enter the top 5 things customers like about this product..."
            />
          </div>

          {/* Top 5 Customer Dislikes - Red theme with WOW factor */}
          <div className="bg-gradient-to-br from-red-900/30 via-rose-900/20 to-slate-800/50 rounded-2xl p-6 border-2 border-red-500/70 shadow-xl shadow-red-500/20 relative overflow-hidden group hover:shadow-2xl hover:shadow-red-500/30 transition-all duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-2xl group-hover:blur-3xl transition-all"></div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-rose-500 rounded-xl flex items-center justify-center shadow-lg shadow-red-500/50 group-hover:scale-110 transition-transform duration-300">
                <AlertCircle className="w-7 h-7 text-white" strokeWidth={2.5} fill="white" />
              </div>
              <label className="block text-xl font-bold bg-gradient-to-r from-red-400 to-rose-400 bg-clip-text text-transparent">
                Top 5 Customer Dislikes
              </label>
            </div>
            <textarea
              value={reviewInsights.topDislikes}
              onChange={(e) => handleChange('topDislikes', e.target.value)}
              rows={10}
              className="w-full px-4 py-3 bg-slate-900/60 border-2 border-red-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/70 focus:ring-2 focus:ring-red-500/50 resize-none transition-all duration-300 relative z-10"
              placeholder="Enter the top 5 things customers dislike about this product..."
            />
          </div>

          {/* Important Insights - Amber/Yellow theme with WOW factor */}
          <div className="bg-gradient-to-br from-amber-900/30 via-yellow-900/20 to-slate-800/50 rounded-2xl p-6 border-2 border-amber-500/70 shadow-xl shadow-amber-500/20 relative overflow-hidden group hover:shadow-2xl hover:shadow-amber-500/30 transition-all duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:blur-3xl transition-all"></div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-yellow-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/50 group-hover:scale-110 transition-transform duration-300">
                <Lightbulb className="w-7 h-7 text-white" strokeWidth={2.5} fill="white" />
              </div>
              <label className="block text-xl font-bold bg-gradient-to-r from-amber-400 to-yellow-400 bg-clip-text text-transparent">
                Important Insights
              </label>
            </div>
            <textarea
              value={reviewInsights.importantInsights}
              onChange={(e) => handleChange('importantInsights', e.target.value)}
              rows={10}
              className="w-full px-4 py-3 bg-slate-900/60 border-2 border-amber-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/70 focus:ring-2 focus:ring-amber-500/50 resize-none transition-all duration-300 relative z-10"
              placeholder="Enter important insights from customer reviews..."
            />
          </div>

          {/* Important Questions - Blue theme with WOW factor */}
          <div className="bg-gradient-to-br from-blue-900/30 via-cyan-900/20 to-slate-800/50 rounded-2xl p-6 border-2 border-blue-500/70 shadow-xl shadow-blue-500/20 relative overflow-hidden group hover:shadow-2xl hover:shadow-blue-500/30 transition-all duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:blur-3xl transition-all"></div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/50 group-hover:scale-110 transition-transform duration-300">
                <HelpCircle className="w-7 h-7 text-white" strokeWidth={2.5} fill="white" />
              </div>
              <label className="block text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Important Questions
              </label>
            </div>
            <textarea
              value={reviewInsights.importantQuestions}
              onChange={(e) => handleChange('importantQuestions', e.target.value)}
              rows={10}
              className="w-full px-4 py-3 bg-slate-900/60 border-2 border-blue-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/50 resize-none transition-all duration-300 relative z-10"
              placeholder="Enter important questions customers ask about this product..."
            />
          </div>
        </div>
      </div>

      {/* Add More Reviews Button - Show if reviews exist */}
      {hasReviewData && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              setHasReviews(false);
              setSelectedFile(null);
            }}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add More Reviews
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
