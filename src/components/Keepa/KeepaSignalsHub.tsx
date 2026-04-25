import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import type { KeepaAnalysisApiResponse, KeepaAnalysisSnapshot } from './KeepaTypes';
import { getProductAsin } from '@/utils/productIdentifiers';
import { supabase, ensureAnonymousSession } from '@/utils/supabaseClient';
import KeepaTrendsTab from './KeepaTrendsTab';
import MarketStory from './MarketStory';
import AtAGlanceCards from './AtAGlanceCards';
import PreVettingTabs from './PreVettingTabs';

/**
 * Stage-cycling loading indicator. The /api/keepa/analysis/generate call
 * is one POST that takes 15–30 seconds (Keepa fetch + analysis + Sonnet
 * narration), so we can't show real progress without restructuring the
 * route to stream. Instead we cycle through honest, plain-English
 * stage messages so the user feels something is happening rather than
 * staring at a frozen button.
 */
const REFRESH_STAGES: string[] = [
  'Pulling 12 months of market history…',
  'Reading how each competitor has behaved…',
  'Looking for launches, stockouts, and rank moves…',
  'Writing your market briefing…',
  'Almost done — finishing the read…'
];
const REFRESH_STAGE_INTERVAL_MS = 6000;

const RefreshingBanner: React.FC = () => {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStageIndex(prev => Math.min(prev + 1, REFRESH_STAGES.length - 1));
    }, REFRESH_STAGE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-5 py-4 flex items-start gap-4 overflow-hidden relative">
      {/* Animated shimmer bar across the top */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-blue-400/70 to-transparent animate-pulse" />
      <Loader2 className="w-5 h-5 text-blue-200 animate-spin shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-blue-100">
          Refreshing Market Climate
        </div>
        <div className="text-xs text-blue-200/80 mt-0.5 leading-relaxed">
          {REFRESH_STAGES[stageIndex]}
        </div>
        <div className="text-[11px] text-blue-300/60 mt-1">
          This usually takes 15–30 seconds. You can keep using the rest of the
          page while we work.
        </div>
      </div>
    </div>
  );
};

interface KeepaSignalsHubProps {
  productId: string;
  competitors: Array<Record<string, any>>;
  title?: string;
  subtitle?: string;
  removedAsins?: Set<string> | string[];
}

const normalizeAsin = (asin: string | null) =>
  asin ? asin.replace(/[^A-Z0-9]/gi, '').toUpperCase() : '';

const sanitizeUiMessage = (message?: string | null) =>
  message ? message.replace(/keepa/gi, 'market') : message;

const KeepaSignalsHub: React.FC<KeepaSignalsHubProps> = ({
  productId,
  competitors,
  title = 'Market Climate',
  subtitle = 'How prices, demand, and promos have behaved across the top 5 competitors over the past 12 months.',
  removedAsins
}) => {
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
        throw new Error(sanitizeUiMessage(payload?.error?.message) || 'Failed to load Market Climate.');
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
        sanitizeUiMessage(error instanceof Error ? error.message : 'Market Climate failed to load.')
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
        throw new Error(sanitizeUiMessage(payload?.error?.message) || 'Failed to refresh Market Climate.');
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
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                isGenerating
                  ? 'border-blue-400/70 bg-blue-500/15 text-blue-100 animate-pulse'
                  : 'border-blue-500/60 bg-blue-500/10 text-blue-100 hover:border-blue-400/70 disabled:border-slate-700/60 disabled:bg-slate-900/40 disabled:text-slate-500'
              }`}
            >
              {isGenerating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {analysis
                ? isGenerating
                  ? 'Refreshing…'
                  : 'Refresh Market Climate'
                : isGenerating
                ? 'Generating…'
                : 'Generate Market Climate'}
            </button>
          </div>
        </div>
      </div>

      {/* While generating/refreshing, the banner takes priority over the
          static warning messages — there's no need to also tell the user
          the data is "stale" or "loading" when they can see it being
          refreshed in real time. */}
      {isGenerating && (
        <div className="px-6 pt-4">
          <RefreshingBanner />
        </div>
      )}

      {!isGenerating && showWarning && (
        <div className="px-6 pt-4 space-y-2">
          {status === 'loading' && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
              Loading Market Climate…
            </div>
          )}
          {status === 'missing' && (
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
              Market Climate data hasn't been generated yet. Click Generate to load the 12–24 month view.
            </div>
          )}
          {status === 'stale' && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Market Climate is out of date. Refresh to pull the latest 12–24 month view.
            </div>
          )}
          {status === 'quota' && (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage || "You've reached today's refresh limit. Try again tomorrow."}
            </div>
          )}
          {status === 'error' && (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {(errorMessage || 'Market Climate failed to load.')} Try refresh.
            </div>
          )}
        </div>
      )}

      {analysis && (
        <div className="px-6 pt-4">
          <MarketStory analysis={analysis} />
          <PreVettingTabs analysis={analysis} removedAsins={removedAsins} />
          <AtAGlanceCards analysis={analysis} />
        </div>
      )}

      {analysis && (
        <div className="px-6 pb-6 pt-4">
          <details className="group rounded-xl border border-slate-700/60 bg-slate-900/40">
            <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 text-sm font-semibold text-slate-200 hover:text-white">
              <div className="flex flex-col">
                <span>Deep-Dive Chart</span>
                <span className="text-xs font-normal text-slate-400">
                  Per-day price and rank overlay across the top competitors. For power users.
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-700/60 p-4">
              <KeepaTrendsTab analysis={analysis} removedAsins={removedAsins} />
            </div>
          </details>
        </div>
      )}

      {!analysis && !isGenerating && !showWarning && (
        <div className="p-6">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-6 text-sm text-slate-300">
            Market Climate data hasn't been generated yet. Click Generate to load the 12–24 month view.
          </div>
        </div>
      )}
    </div>
  );
};

export default KeepaSignalsHub;
