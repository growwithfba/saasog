'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { ProductHeaderBar } from '@/components/ProductHeaderBar';
import { ProductVettingResults } from '@/components/Results/ProductVettingResults';
import { setDisplayTitle } from '@/store/productTitlesSlice';

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
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [researchProduct, setResearchProduct] = useState<any>(null);

  const productName = useMemo(() => {
    return (
      titleByAsin?.[asin] ||
      researchProduct?.display_title ||
      submission?.displayTitle ||
      submission?.productName ||
      researchProduct?.title ||
      submission?.title ||
      'Untitled Product'
    );
  }, [submission, researchProduct, titleByAsin, asin]);

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

      const { data: { session } } = await supabase.auth.getSession();

      const [submissionsRes, researchRes] = await Promise.all([
        fetch(`/api/analyze?userId=${user.id}`, {
          headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
          credentials: 'include',
        }),
        fetch('/api/research', {
          headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
          credentials: 'include',
        }),
      ]);

      let foundResearch: any = null;
      if (researchRes.ok) {
        const data = await researchRes.json();
        if (data?.success && Array.isArray(data.data)) {
          foundResearch = data.data.find((p: any) => p?.asin === asin) || null;
        }
      }

      let foundSubmission: any = null;
      if (submissionsRes.ok) {
        const data = await submissionsRes.json();
        if (data?.success && Array.isArray(data.submissions)) {
          foundSubmission =
            data.submissions.find((s: any) => s?.research_product_id === foundResearch?.id) || null;
        }
      }

      setSubmission(foundSubmission);
      setResearchProduct(foundResearch);
      if (foundResearch?.title) {
        dispatch(setDisplayTitle({ asin, title: foundResearch.title }));
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
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, asin]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
        <p className="text-gray-600 dark:text-slate-400">Loading vetting detail...</p>
      </div>
    );
  }

  const header = (
    <ProductHeaderBar
      productId={researchProduct?.id || submission?.id}
      asin={asin}
      currentDisplayTitle={productName}
      originalTitle={researchProduct?.title}
      currentPhase="vetting"
      badgeLabel={submission?.status || null}
      badgeTone={badgeToneFromStatus(submission?.status)}
      leftButton={{ label: 'Back to Vetting', href: '/vetting', stage: 'vetting' }}
      rightButton={{
        label: 'Build Offering',
        href: `/offer/${encodeURIComponent(asin)}`,
        disabled: !submission,
        stage: 'offer',
      }}
    />
  );

  if (!submission) {
    const researchProductId = researchProduct?.id ? encodeURIComponent(researchProduct.id) : '';
    const productNameParam = encodeURIComponent(productName || '');
    const asinParam = encodeURIComponent(asin);
    const toEngine = `/vetting?tab=new${productNameParam ? `&productName=${productNameParam}` : ''}${
      researchProductId ? `&researchProductId=${researchProductId}` : ''
    }&asin=${asinParam}`;

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
                  Open Product Analysis Engine
                </button>
                <button
                  onClick={() => router.push('/vetting')}
                  className="px-6 py-2.5 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white font-medium transition-colors shadow-md hover:shadow-lg"
                >
                  Back to Vetting
                </button>
              </div>
              {error ? <p className="text-gray-500 dark:text-slate-500 mt-4 text-sm">{error}</p> : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <ProductVettingResults
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


