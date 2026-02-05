'use client';

import { useState } from 'react';
import { Save, Trash2, Send, CheckCircle, X, Loader2 } from 'lucide-react';

interface OfferGlobalActionsProps {
  onSave: () => void;
  onClear: () => void;
  onSendToSourcing: () => void;
  hasData: boolean;
  isDirty?: boolean;
  isSaving?: boolean;
  canPushToSourcing?: boolean;
  isPushingToSourcing?: boolean;
  isAlreadyOffered?: boolean;
  activeTab?: 'product-info' | 'review-aggregator' | 'ssp-builder';
}

export function OfferGlobalActions({ onSave, onClear, onSendToSourcing, hasData, isDirty = false, isSaving = false, canPushToSourcing = false, isPushingToSourcing = false, isAlreadyOffered = false, activeTab }: OfferGlobalActionsProps) {
  const [showClearModal, setShowClearModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const handleSave = () => {
    onSave();
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  const handleClear = () => {
    onClear();
    setShowClearModal(false);
  };

  const handleSendToSourcing = () => {
    onSendToSourcing();
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  return (
    <>
      <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Info
                </>
              )}
            </button>

            <button
              onClick={() => setShowClearModal(true)}
              className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear Info
            </button>
          </div>

          {(canPushToSourcing || isAlreadyOffered) && (
            <button
              onClick={handleSendToSourcing}
              disabled={isPushingToSourcing || isAlreadyOffered}
              title={isAlreadyOffered ? 'This product has already been pushed to sourcing' : undefined}
              className={`px-6 py-2.5 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 backdrop-blur-sm ${
                isAlreadyOffered 
                  ? 'bg-slate-600 cursor-not-allowed opacity-60 text-white' 
                  : 'bg-gradient-to-br from-lime-900/30 via-lime-800/20 to-slate-800/50 border border-lime-500/50 hover:border-lime-500/70 shadow-lg shadow-lime-500/15 hover:shadow-xl hover:shadow-lime-500/25 text-lime-300 hover:text-lime-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] hover:brightness-110'
              }`}
            >
              {isPushingToSourcing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Pushing...
                </>
              ) : isAlreadyOffered ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Already in Sourcing
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Push to Sourcing
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {activeTab === 'review-aggregator' 
                    ? 'Clear Review Insights for this product?' 
                    : activeTab === 'ssp-builder'
                    ? 'Clear SSP Improvements for this product?'
                    : 'Clear data for this product?'}
                </h3>
                <p className="text-slate-400 text-sm">This action cannot be undone</p>
              </div>
            </div>
            
            <p className="text-slate-300 mb-6">
              {activeTab === 'review-aggregator' 
                ? 'This will clear all Review Insights (reviews, likes, dislikes, insights, and questions) for this product. The product record and SSP Improvements will be kept.'
                : activeTab === 'ssp-builder'
                ? 'This will clear all SSP Improvements (quantity, functionality, quality, aesthetic, and bundle) for this product. The product record and Review Insights will be kept.'
                : 'This will clear data for this product. The product record will be kept in the database.'}
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-white transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="bg-emerald-600 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300">
            <CheckCircle className="w-5 h-5" />
            <div>
              <p className="font-medium">Action completed successfully!</p>
            </div>
            <button
              onClick={() => setShowSuccessToast(false)}
              className="ml-2 hover:bg-emerald-700 rounded p-1 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

