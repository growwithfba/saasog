'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { ProductHeaderBar } from '@/components/ProductHeaderBar';
import { ProductVettingResults } from '@/components/Results/ProductVettingResults';
import { setDisplayTitle } from '@/store/productTitlesSlice';
import { getProductAsin } from '@/utils/productIdentifiers';
import { buildVettingEngineUrl } from '@/utils/vettingNavigation';

function badgeToneFromStatus(status: string | null | undefined) {
  if (status === 'PASS') return 'emerald' as const;
  if (status === 'RISKY') return 'amber' as const;
  if (status === 'FAIL') return 'red' as const;
  return 'slate' as const;
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
  const isInvalidAsin = !asin || asin === 'undefined' || asin === 'null';

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
      researchProduct?.display_title ||
      submission?.displayTitle ||
      submission?.productName ||
      researchProduct?.title ||
      submission?.title ||
      'Untitled Product'
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
    if (!user) return;
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

      const submissionsUrl = `/api/analyze?userId=${user.id}`;
      const researchUrl = '/api/research';
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
      if (foundResearch?.title) {
        dispatch(setDisplayTitle({ asin: foundResearch.asin || asin, title: foundResearch.title }));
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

  const header = (
    <ProductHeaderBar
      productId={researchProduct?.id || submission?.id}
      asin={safeAsin}
      currentDisplayTitle={productName}
      originalTitle={researchProduct?.title}
      currentPhase="vetting"
      badgeLabel={submission?.status || null}
      badgeTone={badgeToneFromStatus(submission?.status)}
      leftButton={{ label: 'Back to Vetting', href: '/vetting', stage: 'vetting' }}
      rightButton={{
        label: 'Build Offering',
        href: `/offer/${encodeURIComponent(safeAsin)}`,
        disabled: !submission || !safeAsin,
        stage: 'offer',
      }}
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

  return (
    <div className={`transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}>
      {header}
      <ProductVettingResults
        productId={researchProduct?.id || submission?.id}
        competitors={submission.productData?.competitors || []}
        distributions={submission.productData?.distributions}
        keepaResults={submission.keepaResults || []}
        marketScore={marketScore}
        analysisComplete={true}
        productName={productName}
        alreadySaved={true}
      />
    </div>
  );
}


