'use client';

import { useState } from 'react';
import { Save, Trash2, Send, CheckCircle, X } from 'lucide-react';

interface OfferGlobalActionsProps {
  onSave: () => void;
  onClear: () => void;
  onSendToSourcing: () => void;
  hasData: boolean;
}

export function OfferGlobalActions({ onSave, onClear, onSendToSourcing, hasData }: OfferGlobalActionsProps) {
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
              className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Info
            </button>

            <button
              onClick={() => setShowClearModal(true)}
              className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear Info
            </button>
          </div>

          <button
            onClick={handleSendToSourcing}
            disabled={!hasData}
            className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all transform hover:scale-105 flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Push to Sourcing
          </button>
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
                <h3 className="text-xl font-semibold text-white">Clear all Offer data for this product?</h3>
                <p className="text-slate-400 text-sm">This action cannot be undone</p>
              </div>
            </div>
            
            <p className="text-slate-300 mb-6">
              This will remove all Review Insights, SSP ideas, and Supplier Info for this product.
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

