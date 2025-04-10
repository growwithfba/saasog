// components/Keepa/KeepaAnalysis.tsx
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { useSelector } from 'react-redux';
import { selectKeepaResults } from '../../store/keepaSlice';
import { KeepaAnalysisResult } from './KeepaTypes';
import { keepaService } from '../../services/keepaService';

interface KeepaAnalysisProps {
  asins: string[];
}

interface KeepaAnalysisRef {
  runAnalysis: () => Promise<KeepaAnalysisResult[] | void>;
}

export const KeepaAnalysis = forwardRef<KeepaAnalysisRef, KeepaAnalysisProps>(
  ({ asins }, ref) => {
    const analysisResults = useSelector(selectKeepaResults);
    const hasAnalyzed = useRef(false);

    const runAnalysis = async () => {
      if (hasAnalyzed.current) return;
      
      try {
        const results = await keepaService.getCompetitorData(asins);
        hasAnalyzed.current = true;
        return results;
      } catch (error) {
        console.error('Keepa analysis failed:', error);
        throw error;
      }
    };
    useImperativeHandle(ref, () => ({
      runAnalysis
    }));

    const getPerformanceColor = (score?: number) => {
      if (!score) return 'text-slate-400';
      if (score >= 80) return 'text-emerald-400';
      if (score >= 60) return 'text-blue-400';
      if (score >= 40) return 'text-yellow-400';
      return 'text-red-400';
    };

    const renderStability = (stability?: number) => {
      if (typeof stability !== 'number') return '50%';
      return `${(stability * 100).toFixed(1)}%`;
    };

    return (
      <div className="space-y-4">
        {analysisResults?.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analysisResults.map((item) => (
              <div key={item.asin} className="bg-slate-800/50 rounded-xl p-4">
                <h3 className="font-medium text-white mb-2">
                  {item.productData.title || 'Unknown Product'}
                </h3>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">BSR Stability</span>
                    <span className={getPerformanceColor(item.analysis.bsr.stability * 100)}>
                      {renderStability(item.analysis.bsr.stability)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-slate-400">Price Stability</span>
                    <span className={getPerformanceColor(item.analysis.price.stability * 100)}>
                      {renderStability(item.analysis.price.stability)}
                    </span>
                  </div>
                  
                  {item.analysis.bsr.stability < 0.3 || item.analysis.price.stability < 0.35 ? (
                    <div className="mt-2 p-2 bg-red-900/30 rounded text-red-300 text-xs">
                      Warning: High volatility detected
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            No analysis data available
          </div>
        )}
      </div>
    );
  }
);

KeepaAnalysis.displayName = 'KeepaAnalysis';