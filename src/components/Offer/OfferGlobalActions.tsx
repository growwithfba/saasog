'use client';

import { useState } from 'react';
import { Trash2, X, CheckCircle } from 'lucide-react';
import { Portal } from '@/components/ui/Portal';

interface OfferGlobalActionsProps {
  onClear: () => void;
  hasData: boolean;
  activeTab?: 'customer-voice' | 'offer';
}

export function OfferGlobalActions({ onClear, hasData, activeTab }: OfferGlobalActionsProps) {
  const [showClearModal, setShowClearModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const handleClear = () => {
    onClear();
    setShowClearModal(false);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  if (!hasData) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setShowClearModal(true)}
        className="p-2 bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 hover:border-red-500/60 rounded-lg text-red-400 hover:text-red-300 transition-colors"
        title="Clear stored offer data"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {showClearModal && (
        <Portal>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {activeTab === 'customer-voice'
                    ? 'Clear customer voice data for this product?'
                    : 'Clear data for this product?'}
                </h3>
                <p className="text-slate-400 text-sm">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-slate-300 mb-6">
              {activeTab === 'customer-voice'
                ? 'This will clear the Review Insights (reviews, complaints, strengths) and generated Super Selling Points for this product. The product record itself stays intact.'
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
        </Portal>
      )}

      {showSuccessToast && (
        <Portal>
        <div className="fixed bottom-4 right-4 z-50">
          <div className="bg-emerald-600 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300">
            <CheckCircle className="w-5 h-5" />
            <div>
              <p className="font-medium">Cleared.</p>
            </div>
            <button
              onClick={() => setShowSuccessToast(false)}
              className="ml-2 hover:bg-emerald-700 rounded p-1 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}
