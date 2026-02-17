'use client';

import { useState } from 'react';
import { Sparkles, Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import type { OfferData } from './types';

interface AiReviewPanelProps {
  productId: string | null;
  onDataGenerated: (data: Partial<OfferData>) => void;
}

export function AiReviewPanel({ productId, onDataGenerated }: AiReviewPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setSelectedFile(file);
      setError(null);
      setSuccess(false);
    } else {
      setError('Please select a valid CSV file');
    }
  };

  const handleAnalyzeReviews = async () => {
    if (!selectedFile || !productId) {
      setError('Please select a CSV file and a product');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('productId', productId);

      const response = await fetch('/api/offer/analyze-reviews', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to analyze reviews');
      }

      const result = await response.json();

      if (result.success && result.data) {
        // Update the offer data with AI-generated insights
        onDataGenerated(result.data);
        setSuccess(true);
        setSelectedFile(null);
        
        // Reset success message after 3 seconds
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

  return (
    <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">AI Review Analysis</h3>
      </div>

      <p className="text-sm text-slate-400 mb-6">
        Upload a CSV of customer reviews to automatically generate insights and SSP ideas.
      </p>

      {/* File Upload */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Upload CSV of customer reviews
        </label>
        <div className="relative">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
            id="csv-upload"
            disabled={loading}
          />
          <label
            htmlFor="csv-upload"
            className={`flex items-center gap-2 px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-lg cursor-pointer transition-colors ${
              loading
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:border-purple-500/50 hover:bg-slate-900/70'
            }`}
          >
            <Upload className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300">
              {selectedFile ? selectedFile.name : 'Choose CSV file'}
            </span>
          </label>
        </div>
      </div>

      {/* Analyze Button */}
      <button
        onClick={handleAnalyzeReviews}
        disabled={!selectedFile || loading || !productId}
        className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all transform hover:scale-105 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing Reviews...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Analyze Reviews and Suggest Product Improvements
          </>
        )}
      </button>

      {/* Success Message */}
      {success && (
        <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-emerald-400">
            Insights generated successfully! Review and edit the suggestions above.
          </span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}
    </div>
  );
}

