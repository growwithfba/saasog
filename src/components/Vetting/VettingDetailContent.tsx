'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  RotateCw,
  Share2,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { ProductHeader } from '@/components/Product/ProductHeader';
import { ProductVettingResults } from '@/components/Results/ProductVettingResults';
import { setDisplayTitle } from '@/store/productTitlesSlice';
import { getProductAsin } from '@/utils/productIdentifiers';
import { buildVettingEngineUrl } from '@/utils/vettingNavigation';
import { applyAdjustment, resetAdjustment } from '@/utils/submissionAdjustments';
import { getProductDisplayName } from '@/utils/product';
import {
  CapReachedModal,
  type CapInfo,
} from '@/components/subscription/CapReachedModal';

function badgeToneFromStatus(status: string | null | undefined) {
  if (status === 'PASS') return 'emerald' as const;
  if (status === 'RISKY') return 'amber' as const;
  if (status === 'FAIL') return 'red' as const;
  return 'slate' as const;
}

// Phase 5.4-O — tiny relative-time formatter for the expansion pill +
// history panel. "2 minutes ago", "3 hours ago", "Apr 20" for older
// dates. Avoids pulling in date-fns just for two timestamps.
function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return 'just now';
  if (diff < hr) {
    const m = Math.floor(diff / min);
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  if (diff < day) {
    const h = Math.floor(diff / hr);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  if (diff < 7 * day) {
    const d = Math.floor(diff / day);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function VettingDetailContent({ asin }: { asin: string }) {
  const { user } = useSelector((state: RootState) => state.auth);
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useDispatch();
  const isDev = process.env.NODE_ENV !== 'production';
  const searchString = searchParams.toString();
  const submissionId = searchParams.get('submissionId');

  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [researchProduct, setResearchProduct] = useState<any>(null);
  const [lastRowContext, setLastRowContext] = useState<any>(null);
  const [missingAsinContext, setMissingAsinContext] = useState<any>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareJustCopied, setShareJustCopied] = useState(false);
  const [shareToast, setShareToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  // Keepa-everywhere sweep — Refresh Market Data button state.
  const [refreshingMarketData, setRefreshingMarketData] = useState(false);
  const [aiSummary, setAiSummary] = useState<any>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  // Phase 5.4-J — true when the persisted ai_summary was generated for a
  // different competitor set than what's currently shown. Set by
  // handleCompetitorsUpdated; cleared by refresh and by reset (since reset
  // restores the original ai_summary alongside the original competitors).
  const [summaryStale, setSummaryStale] = useState(false);
  // Phase 5.4-O — Lens-expansion UI state.
  const [recalcing, setRecalcing] = useState(false);
  const [undoingExpansionId, setUndoingExpansionId] = useState<string | null>(null);
  const [expansionPanelOpen, setExpansionPanelOpen] = useState(false);
  const [capReached, setCapReached] = useState<CapInfo | null>(null);
  const expansionPanelRef = useRef<HTMLDivElement | null>(null);
  // Mark-as-read fires once per market visit (clears the dashboard "+N new"
  // badge). Guard so re-renders don't re-fire it.
  const markedReadRef = useRef<string | null>(null);
  const isInvalidAsin = !asin || asin === 'undefined' || asin === 'null';

  // Share-feature hooks — declared at the top of the component so they
  // always run in the same order regardless of early returns below.
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !submission?.id) return '';
    return `${window.location.origin}/submission/${submission.id}`;
  }, [submission?.id]);

  useEffect(() => {
    if (!shareToast) return;
    const t = window.setTimeout(() => setShareToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [shareToast]);

  const resolvedAsin = useMemo(() => {
    return (
      getProductAsin(submission) ||
      getProductAsin(researchProduct) ||
      getProductAsin({ asin }) ||
      ''
    );
  }, [submission, researchProduct, asin]);
  const safeAsin = resolvedAsin || (!isInvalidAsin ? asin : '');

  const productName = useMemo(() => {
    return (
      titleByAsin?.[resolvedAsin] ||
      getProductDisplayName(researchProduct) ||
      getProductDisplayName(submission)
    );
  }, [submission, researchProduct, titleByAsin, resolvedAsin]);

  const marketScore = useMemo(() => {
    const scoreNum =
      typeof submission?.marketScore?.score === 'number'
        ? submission.marketScore.score
        : typeof submission?.score === 'number'
          ? submission.score
          : 0;
    const status =
      submission?.marketScore?.status ||
      submission?.status ||
      'Assessment Unavailable';
    return { score: scoreNum, status };
  }, [submission]);

  const fetchData = async () => {
    if (!user) {
      // Distinguish "auth state still loading" from "definitely not logged in".
      // The Redux user is null during the brief window before AuthProvider
      // hydrates from Supabase, AND it's null for actually-logged-out users.
      // Without this check, unauth visitors saw an endless "Loading vetting
      // analysis…" spinner because fetchData silently returned and never
      // flipped `loading` to false.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const path = pathname + (searchString ? `?${searchString}` : '');
        router.replace(`/login?redirect=${encodeURIComponent(path)}`);
        return;
      }
      // Session exists but Redux hasn't caught up yet — useEffect re-runs
      // when user.id populates, so just wait.
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const routeInfo = {
        asin,
        pathname,
        search: searchString,
      };

      if (isInvalidAsin && !submissionId) {
        const context = {
          ...routeInfo,
          submissionId,
          lastRowContext,
        };
        console.error('[VettingDetail] Missing ASIN in route params', context);
        setMissingAsinContext(context);
        setError('Missing ASIN in route params. See debug details below.');
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      // Narrow both calls server-side so we fetch one submission +
      // one research_product instead of the user's full library.
      // /api/analyze without a narrowing param returns every submission
      // with its full submission_data blob, which is the root of the
      // 20s → 2min vetting load regression once accounts accumulate
      // BloomLens markets.
      const narrowAsin = !isInvalidAsin ? asin : '';
      const analyzeQs = new URLSearchParams({ userId: user.id });
      if (submissionId) {
        analyzeQs.set('submissionId', submissionId);
      } else if (narrowAsin) {
        analyzeQs.set('asin', narrowAsin);
      }
      const submissionsUrl = `/api/analyze?${analyzeQs.toString()}`;
      const researchUrl = narrowAsin
        ? `/api/research?asin=${encodeURIComponent(narrowAsin)}`
        : '/api/research';
      if (isDev) {
        console.debug('[VettingDetail] Fetching data', { submissionsUrl, researchUrl, userId: user.id, asin });
      }

      const [submissionsRes, researchRes] = await Promise.all([
        fetch(submissionsUrl, {
          headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
          credentials: 'include',
        }),
        fetch(researchUrl, {
          headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
          credentials: 'include',
        }),
      ]);

      let foundResearch: any = null;
      let researchData: any = null;
      if (researchRes.ok) {
        researchData = await researchRes.json();
        if (isDev) {
          console.debug('[VettingDetail] Research payload', researchData);
        }
        if (researchData?.success && Array.isArray(researchData.data) && !isInvalidAsin) {
          foundResearch = researchData.data.find((p: any) => p?.asin === asin) || null;
        }
      }

      let foundSubmission: any = null;
      if (submissionsRes.ok) {
        const data = await submissionsRes.json();
        if (isDev) {
          console.debug('[VettingDetail] Submissions payload', data);
        }
        if (data?.success && Array.isArray(data.submissions)) {
          if (!isInvalidAsin && foundResearch?.id) {
            foundSubmission =
              data.submissions.find((s: any) => s?.research_product_id === foundResearch?.id) || null;
          } else if (submissionId) {
            foundSubmission = data.submissions.find((s: any) => s?.id === submissionId) || null;
          } else {
            foundSubmission = data.submissions.find((s: any) => getProductAsin(s) === asin) || null;
          }
        }
      }
      const submissionAsin = getProductAsin(foundSubmission);
      if (!foundResearch && submissionAsin && researchData?.success && Array.isArray(researchData.data)) {
        foundResearch = researchData.data.find((p: any) => p?.asin === submissionAsin) || null;
      }
      if (isDev) {
        console.debug('[VettingDetail] Resolution', {
          asin,
          submissionId,
          foundResearchId: foundResearch?.id,
          foundSubmissionId: foundSubmission?.id,
        });
      }

      setSubmission(foundSubmission);
      setResearchProduct(foundResearch);
      if (foundResearch?.display_name) {
        dispatch(setDisplayTitle({ asin: foundResearch.asin || asin, title: foundResearch.display_name }));
      }

      if (!foundSubmission && !foundResearch) {
        setError('No data found for this ASIN.');
      }
    } catch (e) {
      console.error('[VettingDetail] Failed to load:', e);
      setError(e instanceof Error ? e.message : 'Failed to load vetting detail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, asin, submissionId]);

  // Phase 2.3: when a submission loads, seed or lazily generate the AI
  // summary. If the column is populated we use the cached value; if not,
  // we POST once to /api/vetting/generate-summary. We never regenerate
  // automatically for V9 — that behavior lives in Phase 2.7 alongside
  // the score-save / removed-competitors work.
  useEffect(() => {
    if (!submission?.id) return;

    if (submission.aiSummary) {
      setAiSummary(submission.aiSummary);
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        setAiSummaryLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/vetting/generate-summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
          },
          credentials: 'include',
          body: JSON.stringify({ submissionId: submission.id }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data?.success && data.summary) {
          setAiSummary(data.summary);
        } else {
          console.warn('[VettingDetail] ai summary generation failed:', data?.error);
        }
      } catch (e) {
        if (!cancelled) console.warn('[VettingDetail] ai summary request threw:', e);
      } finally {
        if (!cancelled) setAiSummaryLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [submission?.id, submission?.aiSummary]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.sessionStorage.getItem('vetting:lastRowContext');
      if (stored) {
        setLastRowContext(JSON.parse(stored));
      }
    } catch (storageError) {
      console.warn('[VettingDetail] Failed to read row context:', storageError);
    }
  }, []);

  useEffect(() => {
    if (!isInvalidAsin || submissionId) return;
    setMissingAsinContext({
      asin,
      pathname,
      search: searchString,
      lastRowContext,
    });
  }, [isInvalidAsin, asin, pathname, searchString, lastRowContext, submissionId]);

  // Phase 5.4-O — clear the dashboard "+N new" badge by acknowledging all
  // expansions on detail-page mount. Acknowledged is independent of
  // scoreAfter — the banner stays up until the user actually clicks
  // Recalculate, but the dashboard pill clears as soon as they look.
  useEffect(() => {
    if (!submission?.id) return;
    if (markedReadRef.current === submission.id) return;
    if (!submission.hasUnacknowledgedExpansion) return;

    markedReadRef.current = submission.id;
    let cancelled = false;
    const run = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/submissions/${submission.id}/mark-expansions-read`, {
          method: 'POST',
          headers: {
            ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
          },
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        // Mirror the server-side ack into local state so subsequent
        // analyze fetches don't surprise us.
        setSubmission((prev: any) =>
          prev
            ? {
                ...prev,
                lensExpansions: (prev.lensExpansions ?? []).map((e: any) =>
                  e?.acknowledged ? e : { ...e, acknowledged: true }
                ),
                hasUnacknowledgedExpansion: false,
              }
            : prev
        );
      } catch (e) {
        // Best-effort — badge will clear next page load if this fails.
        console.warn('[VettingDetail] mark-expansions-read failed:', e);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [submission?.id, submission?.hasUnacknowledgedExpansion]);

  // Close the expansion-history panel on outside click.
  useEffect(() => {
    if (!expansionPanelOpen) return;
    const onDocClick = (ev: MouseEvent) => {
      if (!expansionPanelRef.current) return;
      if (!expansionPanelRef.current.contains(ev.target as Node)) {
        setExpansionPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [expansionPanelOpen]);

  if (loading) {
    return (
      <div className={`space-y-6 transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}>
        {/* Header Skeleton */}
        <div className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-6 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="h-6 bg-gray-200 dark:bg-slate-700 rounded w-3/4 mb-3"></div>
              <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/2"></div>
            </div>
            <div className="flex gap-3">
              <div className="h-10 w-32 bg-gray-200 dark:bg-slate-700 rounded-lg"></div>
              <div className="h-10 w-32 bg-gray-200 dark:bg-slate-700 rounded-lg"></div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-8">
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <Loader2 className="h-16 w-16 text-blue-500 dark:text-blue-400 animate-spin" />
            <p className="text-gray-600 dark:text-slate-400 font-medium text-lg">Loading vetting analysis...</p>
            <p className="text-gray-500 dark:text-slate-500 text-sm">Please wait while we fetch your data</p>
          </div>

          {/* Stats Cards Skeleton */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
            <div className="h-32 bg-gray-200 dark:bg-slate-700 rounded-xl"></div>
            <div className="h-32 bg-gray-200 dark:bg-slate-700 rounded-xl"></div>
            <div className="h-32 bg-gray-200 dark:bg-slate-700 rounded-xl"></div>
          </div>

          {/* Chart Skeleton */}
          <div className="mt-8 h-64 bg-gray-200 dark:bg-slate-700 rounded-xl animate-pulse"></div>
        </div>
      </div>
    );
  }

  // Share handlers (non-hook functions, so order is not constrained).
  const toggleShare = async (nextShared: boolean) => {
    if (!submission?.id || shareBusy) return false;
    setShareBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/submissions/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ submissionId: submission.id, shared: nextShared }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update sharing');
      }
      const nextSharedAt = data.submission?.public_shared_at ?? null;
      setSubmission((prev: any) =>
        prev ? { ...prev, is_public: nextShared, public_shared_at: nextSharedAt } : prev
      );
      return true;
    } catch (e) {
      setShareToast({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Could not update sharing.',
      });
      return false;
    } finally {
      setShareBusy(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareJustCopied(true);
      window.setTimeout(() => setShareJustCopied(false), 1800);
    } catch {
      setShareToast({ kind: 'error', message: 'Could not copy link — copy it manually from the URL bar.' });
    }
  };

  const handleShareClick = async () => {
    if (!submission?.id || shareBusy) return;
    const wasShared = Boolean(submission.is_public);
    if (!wasShared) {
      const ok = await toggleShare(true);
      if (!ok) return;
    }
    await copyShareUrl();
    setShareToast({
      kind: 'success',
      message: wasShared
        ? 'Share link copied.'
        : 'Sharing is on — link copied. Anyone with the link can view.',
    });
  };

  const handleUnshare = async () => {
    const ok = await toggleShare(false);
    if (ok) setShareToast({ kind: 'success', message: 'Sharing turned off.' });
  };

  // Keepa-everywhere sweep — Refresh Market Data handler.
  // Calls POST /api/submissions/[id]/refresh-market-data which re-hydrates
  // every competitor's fields from Keepa, replacing stored SERP-DOM values.
  // Preserves sponsored flags (Keepa cannot detect those). After success,
  // reloads the page so the user sees the refreshed data.
  const handleRefreshMarketData = async () => {
    if (!submission?.id || refreshingMarketData) return;
    setRefreshingMarketData(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/submissions/${submission.id}/refresh-market-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to refresh market data');
      }
      setShareToast({
        kind: 'success',
        message: `Refreshed ${data.refreshedCount} competitors from the latest data. Reloading…`,
      });
      // Reload after a short delay so the user sees the toast.
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setShareToast({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Could not refresh market data.',
      });
      setRefreshingMarketData(false);
    }
  };

  // Phase 2.7 — competitor-removal persistence via shared PATCH helper.
  const handleCompetitorsUpdated = async (
    updatedCompetitors: any[],
    removedAsins: string[] = []
  ) => {
    if (!submission?.id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const result = await applyAdjustment({
        submissionId: submission.id,
        session,
        updatedCompetitors,
        removedAsins,
      });
      const updated = result.submission;
      setSubmission((prev: any) =>
        prev
          ? {
              ...prev,
              score: updated.score ?? prev.score,
              status: updated.status ?? prev.status,
              productData: updated.submission_data?.productData ?? prev.productData,
              keepaResults: updated.submission_data?.keepaResults ?? prev.keepaResults,
              marketScore: updated.submission_data?.marketScore ?? result.newMarketScore,
              metrics: updated.metrics ?? prev.metrics,
              adjustment: updated.submission_data?.adjustment ?? null,
              originalSnapshot: updated.submission_data?.originalSnapshot ?? null,
            }
          : prev
      );
      // The persisted ai_summary still reflects the previous competitor set
      // (adjust doesn't touch the column). Mark stale so the Refresh pill
      // surfaces — clears once the user clicks Refresh or resets.
      setSummaryStale(true);
    } catch (err) {
      console.error('[VettingDetail] adjustment save failed:', err);
      setShareToast({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not save adjustment.',
      });
    }
  };

  // Phase 5.4-J — Refresh AI summary against the currently-persisted
  // submission_data. handleCompetitorsUpdated already writes the adjusted
  // competitor set + new score to the row, so a force=true regenerate
  // reads the right state without any extra params.
  const handleRefreshSummary = async () => {
    if (!submission?.id || aiSummaryLoading) return;
    try {
      setAiSummaryLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/vetting/generate-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        credentials: 'include',
        body: JSON.stringify({ submissionId: submission.id, force: true }),
      });
      const data = await res.json();
      if (res.ok && data?.success && data.summary) {
        setAiSummary(data.summary);
        setSummaryStale(false);
      } else {
        setShareToast({
          kind: 'error',
          message: data?.error || 'Could not refresh AI summary.',
        });
      }
    } catch (err) {
      setShareToast({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not refresh AI summary.',
      });
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const handleResetToOriginal = async () => {
    if (!submission?.id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const result = await resetAdjustment({ submissionId: submission.id, session });
      const updated = result.submission;
      setSubmission((prev: any) =>
        prev
          ? {
              ...prev,
              score: updated.score ?? prev.score,
              status: updated.status ?? prev.status,
              productData: updated.submission_data?.productData ?? prev.productData,
              keepaResults: updated.submission_data?.keepaResults ?? prev.keepaResults,
              marketScore: updated.submission_data?.marketScore ?? prev.marketScore,
              metrics: updated.metrics ?? prev.metrics,
              adjustment: null,
              originalSnapshot: updated.submission_data?.originalSnapshot ?? prev.originalSnapshot,
            }
          : prev
      );
      // Phase 5.4-J — server may have restored the original ai_summary from
      // originalSnapshot.aiSummary. If so, swap our state to match and
      // clear staleness so the Refresh pill stays hidden (no Claude call
      // needed — original briefing matches the original market).
      if (updated.ai_summary !== undefined) {
        setAiSummary(updated.ai_summary);
      }
      setSummaryStale(false);
    } catch (err) {
      console.error('[VettingDetail] reset failed:', err);
      setShareToast({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not reset to original.',
      });
    }
  };

  // Phase 5.4-O — inline recalc on /vetting/[asin] when there's an
  // unresolved BloomLens expansion. Hits the new lens-recalc endpoint
  // which runs Keepa enrichment for backfill + scoring + AI summary
  // regeneration server-side, then mirrors the response into local
  // state. 402 surfaces the cap-modal so a Core user at vetting limit
  // sees an upgrade nudge inline (no Stripe redirect — rule).
  const handleLensRecalc = async () => {
    if (!submission?.id || recalcing) return;
    setRecalcing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/submissions/${submission.id}/lens-recalc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        credentials: 'include',
      });
      const data = await res.json();
      if (res.status === 402 && data?.cap) {
        setCapReached(data.cap as CapInfo);
        return;
      }
      if (!res.ok || !data?.success || !data?.submission) {
        throw new Error(data?.error || `Recalc failed (${res.status})`);
      }
      const updated = data.submission;
      setSubmission((prev: any) =>
        prev
          ? {
              ...prev,
              score: updated.score ?? prev.score,
              status: updated.status ?? prev.status,
              productData: updated.submission_data?.productData ?? prev.productData,
              keepaResults: updated.submission_data?.keepaResults ?? prev.keepaResults,
              marketScore: updated.submission_data?.marketScore ?? prev.marketScore,
              metrics: updated.metrics ?? prev.metrics,
              lensExpansions: updated.submission_data?.lensExpansions ?? prev.lensExpansions ?? [],
              hasUnacknowledgedExpansion: false,
            }
          : prev
      );
      if (updated.ai_summary !== undefined) {
        setAiSummary(updated.ai_summary);
      }
      setSummaryStale(false);
    } catch (err) {
      console.error('[VettingDetail] lens-recalc failed:', err);
      setShareToast({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not recalculate.',
      });
    } finally {
      setRecalcing(false);
    }
  };

  // Phase 5.4-O — undo a single expansion batch. Restores from the
  // entry's preExpansionSnapshot and removes that entry from the log.
  // Earlier/later expansions and any `adjustment` are untouched.
  const handleUndoExpansion = async (expansionId: string) => {
    if (!submission?.id || undoingExpansionId) return;
    setUndoingExpansionId(expansionId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/submissions/${submission.id}/undo-expansion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        credentials: 'include',
        body: JSON.stringify({ expansionId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.submission) {
        throw new Error(data?.error || `Undo failed (${res.status})`);
      }
      const updated = data.submission;
      setSubmission((prev: any) =>
        prev
          ? {
              ...prev,
              score: updated.score ?? prev.score,
              status: updated.status ?? prev.status,
              productData: updated.submission_data?.productData ?? prev.productData,
              keepaResults: updated.submission_data?.keepaResults ?? prev.keepaResults,
              marketScore: updated.submission_data?.marketScore ?? prev.marketScore,
              metrics: updated.metrics ?? prev.metrics,
              lensExpansions: updated.submission_data?.lensExpansions ?? [],
              hasUnacknowledgedExpansion: (updated.submission_data?.lensExpansions ?? []).some(
                (e: any) => !e?.acknowledged
              ),
            }
          : prev
      );
      if (updated.ai_summary !== undefined) {
        setAiSummary(updated.ai_summary);
      }
      // Snapshot's ai_summary matched the pre-expansion state, so it's
      // not stale relative to the now-current competitor set.
      setSummaryStale(false);
    } catch (err) {
      console.error('[VettingDetail] undo-expansion failed:', err);
      setShareToast({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not undo expansion.',
      });
    } finally {
      setUndoingExpansionId(null);
    }
  };

  // Icon-only corner actions — refresh + share. Tooltips on hover.
  const cornerActions = submission?.id ? (
    <>
      <button
        type="button"
        onClick={handleRefreshMarketData}
        disabled={refreshingMarketData}
        title="Refresh market data — re-pull the latest data for every competitor"
        aria-label="Refresh market data"
        className={`inline-flex items-center justify-center h-9 w-9 rounded-lg transition-colors bg-slate-700/40 text-slate-200 hover:bg-slate-700/60 ${
          refreshingMarketData ? 'opacity-70 cursor-not-allowed' : ''
        }`}
      >
        {refreshingMarketData ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
      </button>
      <button
        type="button"
        onClick={handleShareClick}
        disabled={shareBusy}
        title={
          submission?.is_public
            ? 'Sharing on — click to copy link again'
            : 'Share — create a public link'
        }
        aria-label={submission?.is_public ? 'Copy share link' : 'Share'}
        className={`inline-flex items-center justify-center h-9 w-9 rounded-lg transition-colors ${
          submission?.is_public
            ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
            : 'bg-slate-700/40 text-slate-200 hover:bg-slate-700/60'
        } ${shareBusy ? 'opacity-70 cursor-not-allowed' : ''}`}
      >
        {shareBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : shareJustCopied ? (
          <Check className="h-4 w-4" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
      </button>
      {submission?.is_public && (
        <button
          type="button"
          onClick={handleUnshare}
          disabled={shareBusy}
          title="Stop sharing — revoke the public link"
          aria-label="Stop sharing"
          className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 transition-colors"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
        </button>
      )}
    </>
  ) : null;

  // Legacy shareAction kept for the old extraInlineAction slot; now
  // null since everything moved to cornerActions.
  const shareAction = submission?.id ? (
    <div className="flex items-center gap-2 hidden">
      <button
        type="button"
        onClick={handleShareClick}
        disabled={shareBusy}
        title={
          submission?.is_public
            ? 'Link is live — click to copy again'
            : 'Create a public share link and copy to clipboard'
        }
        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          submission?.is_public
            ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
            : 'bg-slate-700/40 text-slate-200 hover:bg-slate-700/60 dark:text-slate-200'
        } ${shareBusy ? 'opacity-70 cursor-not-allowed' : ''}`}
      >
        {shareBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : shareJustCopied ? (
          <Check className="h-4 w-4" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        <span>
          {shareJustCopied ? 'Copied' : submission?.is_public ? 'Shared' : 'Share'}
        </span>
        {submission?.is_public && !shareJustCopied && (
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        )}
      </button>
      {submission?.is_public && (
        <button
          type="button"
          onClick={handleUnshare}
          disabled={shareBusy}
          className="text-xs text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline transition-colors"
          title="Revoke the public share link"
        >
          Stop sharing
        </button>
      )}
    </div>
  ) : null;

  const header = (
    <ProductHeader
      productId={researchProduct?.id || submission?.id}
      asin={safeAsin}
      currentDisplayTitle={productName}
      originalTitle={researchProduct?.title}
      currentPhase="vetting"
      stage={{
        vetted: typeof submission?.score === 'number' || !!researchProduct?.is_vetted,
        offered: !!researchProduct?.is_offered,
        sourced: !!researchProduct?.is_sourced,
      }}
      // PASS / RISKY / FAIL badge removed per Dave's header-layout
      // refactor (2026-05-13) — the status is already visible on the
      // dashboard list. Keep header focused on identity + actions.
      leftButton={{ label: 'Back to Vetting', href: '/vetting', stage: 'vetting' }}
      rightButton={{
        label: 'Build Offering',
        href: `/offer/${encodeURIComponent(safeAsin)}`,
        disabled: !submission || !safeAsin,
        stage: 'offer',
      }}
      cornerActions={cornerActions}
    />
  );

  if (!submission) {
    const toEngine = buildVettingEngineUrl({
      productName,
      researchProductId: researchProduct?.id,
      asin: safeAsin,
    });

    return (
      <div>
        {header}
        <div className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-12">
          <div className="flex items-start gap-3 text-gray-700 dark:text-slate-300">
            <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5" />
            <div className="min-w-0">
              <p className="font-medium">No vetting run found for this ASIN</p>
              <p className="text-gray-600 dark:text-slate-400 mt-1">
                Run the Product Analysis Engine to generate vetting results for this product.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => router.push(toEngine)}
                  className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-medium transition-colors shadow-md hover:shadow-lg"
                >
                  Open Vetting Engine
                </button>
                <button
                  onClick={() => router.push('/vetting')}
                  className="px-6 py-2.5 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white font-medium transition-colors shadow-md hover:shadow-lg"
                >
                  Back to Vetting
                </button>
              </div>
              {error ? <p className="text-gray-500 dark:text-slate-500 mt-4 text-sm">{error}</p> : null}
              {missingAsinContext ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-900/20 p-4 text-xs text-amber-900 dark:text-amber-100">
                  <p className="font-semibold mb-2">Missing ASIN debug context</p>
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(missingAsinContext, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Phase 5.4-O — derive Lens-expansion render state. expansions is
  // append-only (one entry per Lens "Add to existing" event); unresolved
  // entries are those that haven't been recalced yet (scoreAfter null).
  const expansions: any[] = Array.isArray(submission?.lensExpansions)
    ? submission.lensExpansions
    : [];
  const unresolvedExpansions = expansions.filter((e) => e?.scoreAfter == null);
  // Transitional fallback: pre-5.4-O analyze-market wrote
  // __lens_pending_recalc=true without creating a lensExpansions[]
  // entry. /api/analyze surfaces that as lensPendingRecalcLegacy.
  // The banner shows for either signal so users with legacy-flag-only
  // data can still recalc; the recalc endpoint handles both paths.
  // Drop after PR A ships to production for a full deploy cycle.
  const hasLegacyPendingRecalc =
    expansions.length === 0 && Boolean(submission?.lensPendingRecalcLegacy);
  const showRecalcBanner = unresolvedExpansions.length > 0 || hasLegacyPendingRecalc;
  const totalAddedFromLens = expansions.reduce(
    (sum, e) => sum + (Array.isArray(e?.addedAsins) ? e.addedAsins.length : 0),
    0
  );
  const mostRecentExpansionAt = expansions.length > 0
    ? expansions
        .map((e) => e?.addedAt)
        .filter((t): t is string => typeof t === 'string')
        .sort()
        .slice(-1)[0]
    : null;

  return (
    <div className={`transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}>
      {header}

      {/* Phase 5.4-O — recalc banner. Shown when there's an unresolved
          lensExpansions entry OR (legacy fallback) the pre-5.4-O
          __lens_pending_recalc flag is set. Click runs the recalc
          endpoint inline. */}
      {showRecalcBanner && submission?.id ? (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50/80 dark:border-amber-500/40 dark:bg-amber-900/20 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 dark:text-amber-300 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-amber-900 dark:text-amber-100">
                New competitors detected
              </p>
              <p className="text-sm text-amber-800/90 dark:text-amber-200/80 mt-1">
                Competitors were added from BloomLens since this market was last vetted.
                Recalculate to refresh the score, stability signals, and AI briefing
                using the latest sales-rank data for the new competitors.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLensRecalc}
              disabled={recalcing}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-400 text-white text-sm font-medium rounded-lg transition-colors shadow-sm flex-shrink-0 inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {recalcing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Recalculating…
                </>
              ) : (
                <>
                  <RotateCw className="w-4 h-4" />
                  Recalculate
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}

      {/* Phase 5.4-O — post-recalc pill + expansion-history panel.
          Shown when expansions exist AND none are unresolved. Click the
          pill to expand the history; per-batch undo lives in the panel. */}
      {unresolvedExpansions.length === 0 && expansions.length > 0 && submission?.id ? (
        <div className="mt-4 relative" ref={expansionPanelRef}>
          <button
            type="button"
            onClick={() => setExpansionPanelOpen((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-400/40 bg-emerald-50/80 dark:bg-emerald-500/10 text-sm font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/80 dark:hover:bg-emerald-500/20 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            +{totalAddedFromLens} from BloomLens
            {mostRecentExpansionAt ? (
              <span className="text-emerald-700/80 dark:text-emerald-300/80">
                · {formatRelativeTime(mostRecentExpansionAt)}
              </span>
            ) : null}
            {expansionPanelOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {expansionPanelOpen ? (
            <div className="absolute z-30 mt-2 w-[28rem] max-w-[90vw] rounded-xl border border-gray-200 dark:border-slate-700/70 bg-white dark:bg-slate-900 shadow-xl p-2">
              <p className="px-3 pt-2 pb-1 text-xs uppercase tracking-wider text-gray-500 dark:text-slate-400">
                Expansion history
              </p>
              <ul className="divide-y divide-gray-100 dark:divide-slate-800">
                {[...expansions]
                  .sort((a, b) => String(b?.addedAt ?? '').localeCompare(String(a?.addedAt ?? '')))
                  .map((e) => {
                    const id = String(e?.id ?? e?.addedAt ?? '');
                    const count = Array.isArray(e?.addedAsins) ? e.addedAsins.length : 0;
                    const before = typeof e?.scoreBefore === 'number' ? e.scoreBefore : null;
                    const after = typeof e?.scoreAfter === 'number' ? e.scoreAfter : null;
                    const isUndoing = undoingExpansionId === id;
                    // Synthesized legacy entries don't have a
                    // preExpansionSnapshot (analyze-market wasn't
                    // capturing one before 5.4-O), so Undo isn't
                    // available — the necessary state to restore to
                    // simply doesn't exist for old data.
                    const canUndo = Boolean(e?.preExpansionSnapshot);
                    return (
                      <li key={id} className="px-3 py-2 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 dark:text-slate-200">
                            +{count} competitor{count === 1 ? '' : 's'} added
                          </p>
                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            {formatRelativeTime(e?.addedAt)}
                            {before != null && after != null ? (
                              <>
                                {' · '}
                                <span className="tabular-nums">
                                  {before.toFixed(1)}% → {after.toFixed(1)}%
                                </span>
                              </>
                            ) : null}
                          </p>
                        </div>
                        {canUndo ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Remove these ${count} competitor${count === 1 ? '' : 's'}? The market will recalculate from the snapshot taken before this batch landed.`
                                )
                              ) {
                                handleUndoExpansion(id);
                              }
                            }}
                            disabled={Boolean(undoingExpansionId)}
                            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isUndoing ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Undo2 className="w-3 h-3" />
                            )}
                            Undo
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <ProductVettingResults
        productId={researchProduct?.id || submission?.id}
        competitors={submission.productData?.competitors || []}
        distributions={submission.productData?.distributions}
        keepaResults={submission.keepaResults || []}
        marketScore={marketScore}
        analysisComplete={true}
        productName={productName}
        alreadySaved={true}
        aiSummary={aiSummary}
        aiSummaryLoading={aiSummaryLoading}
        onCompetitorsUpdated={handleCompetitorsUpdated}
        onResetToOriginal={handleResetToOriginal}
        onRefreshSummary={handleRefreshSummary}
        summaryStale={summaryStale}
        adjustment={submission?.adjustment || null}
        originalSnapshot={submission?.originalSnapshot || null}
      />
      {shareToast && (
        <div className="fixed bottom-4 right-4 z-[200]">
          <div
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg ${
              shareToast.kind === 'success'
                ? 'bg-emerald-600/95 text-white border-emerald-400/40'
                : 'bg-red-700/95 text-white border-red-400/40'
            }`}
          >
            {shareToast.kind === 'success' ? (
              <Check className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <p className="text-sm font-medium">{shareToast.message}</p>
          </div>
        </div>
      )}
      <CapReachedModal
        isOpen={capReached !== null}
        onClose={() => setCapReached(null)}
        cap={capReached}
      />
    </div>
  );
}


