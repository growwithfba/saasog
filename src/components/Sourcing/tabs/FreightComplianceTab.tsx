'use client';

import { useState } from 'react';
import { Truck, CheckCircle, ExternalLink } from 'lucide-react';
import type { ProfitCalculatorData } from '../types';

interface FreightComplianceTabProps {
  productId: string;
  data: ProfitCalculatorData | undefined;
  onChange: (data: ProfitCalculatorData) => void;
}

export function FreightComplianceTab({ productId, data, onChange }: FreightComplianceTabProps) {
  const freightData = data || {
    incoterms: '',
    freightForwarder: '',
    htsCode: '',
    htsLookupUrl: '',
    dutyRatePct: null,
    tariffPct: null,
    notes: ''
  } as ProfitCalculatorData;

  const [checklist, setChecklist] = useState({
    htsConfirmed: freightData.htsCode?.trim() ? true : false,
    incotermsAgreed: freightData.incoterms?.trim() ? true : false,
    freightQuoteReceived: freightData.freightForwarder?.trim() ? true : false,
    inspectionPlanSet: false // This would come from another source or be set separately
  });

  const handleFieldChange = (field: keyof ProfitCalculatorData, value: any) => {
    const updated = {
      ...freightData,
      [field]: value
    };
    onChange(updated);

    // Update checklist based on field changes
    if (field === 'htsCode') {
      setChecklist(prev => ({ ...prev, htsConfirmed: !!value?.trim() }));
    } else if (field === 'incoterms') {
      setChecklist(prev => ({ ...prev, incotermsAgreed: !!value?.trim() }));
    } else if (field === 'freightForwarder') {
      setChecklist(prev => ({ ...prev, freightQuoteReceived: !!value?.trim() }));
    }
  };

  const handleChecklistChange = (key: keyof typeof checklist, value: boolean) => {
    setChecklist(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Input Fields */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-400" />
            Freight & Compliance Information
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Incoterms</label>
              <input
                type="text"
                value={freightData.incoterms || ''}
                onChange={(e) => handleFieldChange('incoterms', e.target.value)}
                placeholder="e.g., EXW, FOB, CIF, DDP"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Freight Forwarder</label>
              <input
                type="text"
                value={freightData.freightForwarder || ''}
                onChange={(e) => handleFieldChange('freightForwarder', e.target.value)}
                placeholder="Freight forwarder name"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1 flex items-center gap-2">
                HTS Code
                {freightData.htsLookupUrl && (
                  <a
                    href={freightData.htsLookupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
                    title="Open HTS lookup"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Lookup
                  </a>
                )}
              </label>
              <input
                type="text"
                value={freightData.htsCode || ''}
                onChange={(e) => handleFieldChange('htsCode', e.target.value)}
                placeholder="e.g., 1234.56.78"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">HTS Lookup URL</label>
              <input
                type="url"
                value={freightData.htsLookupUrl || ''}
                onChange={(e) => handleFieldChange('htsLookupUrl', e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Duty Rate %</label>
                <input
                  type="number"
                  step="0.01"
                  value={freightData.dutyRatePct || ''}
                  onChange={(e) => handleFieldChange('dutyRatePct', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Tariff %</label>
                <input
                  type="number"
                  step="0.01"
                  value={freightData.tariffPct || ''}
                  onChange={(e) => handleFieldChange('tariffPct', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Notes</label>
              <textarea
                value={freightData.notes || ''}
                onChange={(e) => handleFieldChange('notes', e.target.value)}
                placeholder="Additional notes about freight and compliance..."
                rows={4}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 resize-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Column - Checklist */}
      <div className="lg:col-span-1">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 sticky top-6">
          <h3 className="text-lg font-semibold text-white mb-4">Order Readiness Checklist</h3>
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-700/30 transition-colors">
              <input
                type="checkbox"
                checked={checklist.htsConfirmed}
                onChange={(e) => handleChecklistChange('htsConfirmed', e.target.checked)}
                className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 mt-0.5 flex-shrink-0"
              />
              <div className="flex-1">
                <div className="text-white font-medium">HTS Confirmed</div>
                <div className="text-xs text-slate-400 mt-1">HTS code has been verified and confirmed</div>
              </div>
              {checklist.htsConfirmed && (
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              )}
            </label>

            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-700/30 transition-colors">
              <input
                type="checkbox"
                checked={checklist.incotermsAgreed}
                onChange={(e) => handleChecklistChange('incotermsAgreed', e.target.checked)}
                className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 mt-0.5 flex-shrink-0"
              />
              <div className="flex-1">
                <div className="text-white font-medium">Incoterms Agreed</div>
                <div className="text-xs text-slate-400 mt-1">Incoterms have been agreed upon with supplier</div>
              </div>
              {checklist.incotermsAgreed && (
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              )}
            </label>

            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-700/30 transition-colors">
              <input
                type="checkbox"
                checked={checklist.freightQuoteReceived}
                onChange={(e) => handleChecklistChange('freightQuoteReceived', e.target.checked)}
                className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 mt-0.5 flex-shrink-0"
              />
              <div className="flex-1">
                <div className="text-white font-medium">Freight Quote Received</div>
                <div className="text-xs text-slate-400 mt-1">Freight forwarder has provided a quote</div>
              </div>
              {checklist.freightQuoteReceived && (
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              )}
            </label>

            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-700/30 transition-colors">
              <input
                type="checkbox"
                checked={checklist.inspectionPlanSet}
                onChange={(e) => handleChecklistChange('inspectionPlanSet', e.target.checked)}
                className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 mt-0.5 flex-shrink-0"
              />
              <div className="flex-1">
                <div className="text-white font-medium">Inspection Plan Set</div>
                <div className="text-xs text-slate-400 mt-1">Quality inspection plan has been established</div>
              </div>
              {checklist.inspectionPlanSet && (
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              )}
            </label>
          </div>

          {/* Progress Summary */}
          <div className="mt-6 pt-6 border-t border-slate-700/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Progress</span>
              <span className="text-sm font-medium text-white">
                {Object.values(checklist).filter(Boolean).length} / {Object.keys(checklist).length}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-300"
                style={{
                  width: `${(Object.values(checklist).filter(Boolean).length / Object.keys(checklist).length) * 100}%`
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

