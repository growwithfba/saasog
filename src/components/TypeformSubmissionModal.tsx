'use client';

import React from 'react';
import { X, Clock, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';

interface TypeformSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  canSubmit: boolean;
  submissionsUsed: number;
  submissionsRemaining: number;
  weekResetsAt: string;
  onSubmit?: () => void;
  isLoading?: boolean;
}

export const TypeformSubmissionModal: React.FC<TypeformSubmissionModalProps> = ({
  isOpen,
  onClose,
  canSubmit,
  submissionsUsed,
  submissionsRemaining,
  weekResetsAt,
  onSubmit,
  isLoading = false
}) => {
  if (!isOpen) return null;

  const formatResetDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const getDaysUntilReset = (dateString: string) => {
    try {
      const resetDate = new Date(dateString);
      const today = new Date();
      const diffTime = resetDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    } catch {
      return 0;
    }
  };

  const daysUntilReset = getDaysUntilReset(weekResetsAt);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl max-w-md w-full border border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">
            Typeform Validation Submission
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Status Overview */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              {canSubmit ? (
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              ) : (
                <AlertCircle className="w-6 h-6 text-amber-400" />
              )}
              <div>
                <h3 className="font-medium text-white">
                  {canSubmit ? 'Submission Available' : 'Weekly Limit Reached'}
                </h3>
                <p className="text-sm text-slate-400">
                  {canSubmit 
                    ? `You can submit ${submissionsRemaining} more validation${submissionsRemaining !== 1 ? 's' : ''} this week`
                    : 'You have used all available submissions for this week'
                  }
                </p>
              </div>
            </div>

            {/* Usage Stats */}
            <div className="bg-slate-700/30 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-slate-300">Weekly Usage</span>
                <span className="text-sm font-medium text-white">
                  {submissionsUsed} / 2
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    submissionsUsed === 0 ? 'w-0' :
                    submissionsUsed === 1 ? 'w-1/2 bg-emerald-500' : 
                    'w-full bg-amber-500'
                  }`}
                />
              </div>
            </div>

            {/* Reset Info */}
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Clock className="w-4 h-4" />
              <span>
                Resets in {daysUntilReset} day{daysUntilReset !== 1 ? 's' : ''} ({formatResetDate(weekResetsAt)})
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="mb-6 p-4 bg-slate-700/20 rounded-lg">
            <h4 className="font-medium text-white mb-2">What happens next?</h4>
            <p className="text-sm text-slate-300 leading-relaxed">
              Clicking "Submit for Validation" will open our Typeform where you can submit your 
              market analysis for expert review. Our team will provide professional feedback to 
              help improve your market research accuracy.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {canSubmit ? (
              <>
                <button
                  onClick={onSubmit}
                  disabled={isLoading}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 
                           text-white px-4 py-2 rounded-lg font-medium transition-colors 
                           flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4" />
                      Submit for Validation
                    </>
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="flex-1 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 
                         rounded-lg font-medium transition-colors"
              >
                Got it
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
