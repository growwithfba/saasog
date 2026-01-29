import React, { useMemo, useState, useEffect, useCallback } from 'react';
import type { KeepaAnalysisApiResponse, KeepaAnalysisSnapshot } from './KeepaTypes';
import { getProductAsin } from '@/utils/productIdentifiers';
import { supabase, ensureAnonymousSession } from '@/utils/supabaseClient';
import KeepaInsightsTab from './KeepaInsightsTab';
import KeepaSeasonalityTab from './KeepaSeasonalityTab';
import KeepaTrendsTab from './KeepaTrendsTab';
import KeepaStockPromoTab from './KeepaStockPromoTab';
import KeepaCompareTab from './KeepaCompareTab';

type KeepaTabId = 'insights' | 'trends' | 'seasonality' | 'promos' | 'competitors';

interface KeepaSignalsHubProps {
  productId: string;
  competitors: Array<Record<string, any>>;
  title?: string;
  subtitle?: string;
}

const normalizeAsin = (asin: string | null) =>
  asin ? asin.replace(/[^A-Z0-9]/gi, '').toUpperCase() : '';

const sanitizeUiMessage = (message?: string | null) =>
  message ? message.replace(/keepa/gi, 'market') : message;

const KeepaSignalsHub: React.FC<KeepaSignalsHubProps> = ({
  productId,
  competitors,
  title = 'Market Signals',
  subtitle = 'Historical pricing, demand, and supply signals based on the top 5 competitors (last 12-24 months).'
}) => {
  const [activeTab, setActiveTab] = useState<KeepaTabId>('insights');
  const [analysis, setAnalysis] = useState<KeepaAnalysisSnapshot | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'stale' | 'missing' | 'error' | 'quota'>(
    'idle'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const topCompetitors = useMemo(() => {
    const sorted = [...(competitors || [])].sort(
      (a, b) => (b.monthlyRevenue || 0) - (a.monthlyRevenue || 0)
    );
    return sorted.slice(0, 5).map(item => {
      const asin = normalizeAsin(getProductAsin(item) || item.asin || '');
      return {
        ...item,
        asin
      };
    });
  }, [competitors]);

  const getAuthHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    let token = data.session?.access_token;
    if (!token) {
      await ensureAnonymousSession();
      const refreshed = await supabase.auth.getSession();
      token = refreshed.data.session?.access_token;
    }
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadAnalysis = useCallback(async () => {
    if (!productId) return;
    setStatus('loading');
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/keepa/analysis?productId=${encodeURIComponent(productId)}`, {
        method: 'GET',
        headers,
        cache: 'no-store'
      });
      const payload = (await response.json().catch(() => null)) as KeepaAnalysisApiResponse | null;
      if (!response.ok) {
        console.error('Keepa analysis load failed', { status: response.status, payload });
        throw new Error(sanitizeUiMessage(payload?.error?.message) || 'Failed to load Market Signals.');
      }
      if (!payload?.analysis) {
        setAnalysis(null);
        setStatus('missing');
        return;
      }
      setAnalysis(payload.analysis);
      setStatus(payload.stale ? 'stale' : 'ready');
    } catch (error) {
      console.error('Keepa analysis load error:', error);
      setStatus('error');
      setErrorMessage(
        sanitizeUiMessage(error instanceof Error ? error.message : 'Market Signals failed to load.')
      );
    }
  }, [getAuthHeaders, productId]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const handleGenerate = async () => {
    if (!productId || isGenerating) return;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/keepa/analysis/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        cache: 'no-store',
        body: JSON.stringify({
          productId,
          windowMonths: 24,
          competitorAsins: topCompetitors.map(item => item.asin).filter(Boolean),
          forceRefresh: true
        })
      });
      const payload = (await response.json().catch(() => null)) as KeepaAnalysisApiResponse | null;
      if (response.status === 429) {
        setStatus('quota');
        setErrorMessage(
          sanitizeUiMessage(payload?.error?.message) || "You've reached today's refresh limit. Try again tomorrow."
        );
        return;
      }
      if (!response.ok || !payload?.analysis) {
        throw new Error(sanitizeUiMessage(payload?.error?.message) || 'Failed to refresh Market Signals.');
      }
      setAnalysis(payload.analysis);
      setStatus('ready');
    } catch (error) {
      console.error('Keepa analysis refresh error:', error);
      setStatus('error');
      setErrorMessage(sanitizeUiMessage(error instanceof Error ? error.message : 'Refresh failed.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const tabs: Array<{ id: KeepaTabId; label: string }> = [
    { id: 'insights', label: 'Insights' },
    { id: 'trends', label: 'Trends' },
    { id: 'seasonality', label: 'Seasonality' },
    { id: 'promos', label: 'Promos & Stockouts' },
    { id: 'competitors', label: 'Competitors' }
  ];

  const showEmptyState = !analysis;
  const showWarning =
    status === 'loading' || status === 'stale' || status === 'missing' || status === 'quota' || status === 'error';

  return (
    <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-700/50">
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-white">{title}</h2>
              <p className="text-slate-400">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !topCompetitors.length}
              className="rounded-full border border-blue-500/60 bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-100 hover:border-blue-400/70 disabled:cursor-not-allowed disabled:border-slate-700/60 disabled:bg-slate-900/40 disabled:text-slate-500"
            >
              {analysis
                ? isGenerating
                  ? 'Refreshing…'
                  : 'Refresh Market Signals'
                : isGenerating
                ? 'Generating…'
                : 'Generate Market Signals'}
            </button>
          </div>
        </div>
      </div>

      {showWarning && (
        <div className="px-6 pt-4 space-y-2">
          {status === 'loading' && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
              Loading historical signals…
            </div>
          )}
          {status === 'missing' && (
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
              No Market Signals generated yet. Click Generate to load history.
            </div>
          )}
          {status === 'stale' && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Historical signals are out of date. Refresh to pull the latest 12-24 month view.
            </div>
          )}
          {status === 'quota' && (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage || "You've reached today's refresh limit. Try again tomorrow."}
            </div>
          )}
          {status === 'error' && (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {(errorMessage || 'Market Signals failed to load.')} Try refresh.
            </div>
          )}
        </div>
      )}

      <div className="px-6 pt-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'border-blue-500/60 bg-blue-500/10 text-blue-200'
                  : 'border-slate-700/60 bg-slate-900/40 text-slate-300 hover:border-slate-500/70 hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 min-h-[520px] overflow-y-auto">
        {showEmptyState ? (
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-6 text-sm text-slate-300">
            No Market Signals generated yet. Click Generate to see historical insights, trends, and competitor comparisons.
          </div>
        ) : (
          analysis && (
            <>
              {activeTab === 'insights' && <KeepaInsightsTab analysis={analysis} />}
              {activeTab === 'trends' && <KeepaTrendsTab analysis={analysis} />}
              {activeTab === 'seasonality' && <KeepaSeasonalityTab analysis={analysis} />}
              {activeTab === 'promos' && <KeepaStockPromoTab analysis={analysis} />}
              {activeTab === 'competitors' && <KeepaCompareTab analysis={analysis} />}
            </>
          )
        )}
      </div>
    </div>
  );
};

export default KeepaSignalsHub;
