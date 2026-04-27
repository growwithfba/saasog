'use client';

import { useState } from 'react';
import { Save, Trash2, X, Loader2, CheckCircle } from 'lucide-react';
import { Portal } from '@/components/ui/Portal';

interface OfferGlobalActionsProps {
  onSave: () => void;
  onClear: () => void;
  hasData: boolean;
  isDirty?: boolean;
  isSaving?: boolean;
  activeTab?: 'customer-voice' | 'offer';
}

export function OfferGlobalActions({ onSave, onClear, hasData, isDirty = false, isSaving = false, activeTab }: OfferGlobalActionsProps) {
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

  // The buttons used to render greyed out when there was nothing to
  // save / clear, which made them look redundant at a glance. Hide them
  // entirely when not actionable so they only appear when relevant:
  //   - Save Changes: only when there are unsaved edits.
  //   - Clear: only when there's stored data to clear.
  const showSave = isDirty || isSaving;
  const showClear = hasData;

  if (!showSave && !showClear) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {showSave && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 disabled:cursor-wait rounded-lg text-white text-sm font-medium transition-colors flex items-center gap-2"
            title="Persist your manual edits to this offer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        )}

        {showClear && (
          <button
            onClick={() => setShowClearModal(true)}
            className="p-2 bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 hover:border-red-500/60 rounded-lg text-red-400 hover:text-red-300 transition-colors"
            title="Clear stored offer data"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Clear Confirmation Modal */}
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

      {/* Success Toast */}
      {showSuccessToast && (
        <Portal>
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
        </Portal>
      )}
    </>
  );
}

