'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { AlertCircle, FileText, Loader2, Package, Sparkles, X, Download, CheckCircle, Info } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { RootState } from '@/store';
import { ProductHeaderBar } from '@/components/ProductHeaderBar';
import { ProductInfoTab } from './tabs/ProductInfoTab';
import { ReviewAggregatorTab } from './tabs/ReviewAggregatorTab';
import { SspBuilderHubTab } from './tabs/SspBuilderHubTab';
import { OfferGlobalActions } from './OfferGlobalActions';
import type { OfferData } from './types';
import { setDisplayTitle } from '@/store/productTitlesSlice';

type OfferDetailTab = 'product-info' | 'review-aggregator' | 'ssp-builder';

function badgeToneFromStatus(status: string | null | undefined) {
  if (status === 'PASS') return 'emerald' as const;
  if (status === 'RISKY') return 'amber' as const;
  if (status === 'FAIL') return 'red' as const;
  return 'slate' as const;
}

function getDefaultOfferData(asin: string): OfferData {
  return {
    productId: asin,
    reviewInsights: {
      topLikes: '',
      topDislikes: '',
      importantInsights: '',
      importantQuestions: '',
    },
    ssp: {
      quantity: [],
      functionality: [],
      quality: [],
      aesthetic: [],
      bundle: [],
    },
    supplierInfo: {
      supplierName: '',
      contact: '',
      fobPrice: '',
      landedCost: '',
      moq: '',
      leadTime: '',
      notes: '',
    },
    status: 'none',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function hasOfferData(data: OfferData): boolean {
  const ri = data.reviewInsights;
  if (ri.topLikes?.trim() || ri.topDislikes?.trim() || ri.importantInsights?.trim() || ri.importantQuestions?.trim()) {
    return true;
  }
  const ssp = data.ssp;
  if (ssp.quantity.length > 0 || ssp.functionality.length > 0 || ssp.quality.length > 0 || ssp.aesthetic.length > 0 || ssp.bundle.length > 0) {
    return true;
  }
  const si = data.supplierInfo;
  if (si.supplierName?.trim() || si.contact?.trim() || si.fobPrice?.trim() || si.landedCost?.trim() || si.moq?.trim() || si.leadTime?.trim() || si.notes?.trim()) {
    return true;
  }
  return false;
}

export function OfferDetailContent({ asin }: { asin: string }) {
  const { user } = useSelector((state: RootState) => state.auth);
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);
  const router = useRouter();
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<OfferDetailTab>('product-info');
  const [offerData, setOfferData] = useState<OfferData>(() => getDefaultOfferData(asin));
  const [isPushingToSourcing, setIsPushingToSourcing] = useState(false);
  const [storedReviewsCount, setStoredReviewsCount] = useState<number>(0);
  const [isReviewsDirty, setIsReviewsDirty] = useState(false);
  const [isSspDirty, setIsSspDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasStoredInsights, setHasStoredInsights] = useState(false);
  const [hasStoredImprovements, setHasStoredImprovements] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [isAlreadyOffered, setIsAlreadyOffered] = useState(false);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const [pendingTab, setPendingTab] = useState<OfferDetailTab | null>(null);

  const isDirty = isReviewsDirty || isSspDirty;
  const canPushToSourcing = hasStoredInsights && hasStoredImprovements && !isAlreadyOffered;

  const displayName = useMemo(() => {
    return titleByAsin?.[asin] || product?.display_title || product?.title || product?.productName || 'Untitled Product';
  }, [product, titleByAsin, asin]);

  const vettedStatus = useMemo(() => {
    return product?.status || product?.marketScore?.status || product?.extra_data?.status || null;
  }, [product]);

  const fetchProduct = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      // Fetch research product and offer data from API using ASIN
      const offerRes = await fetch(`/api/offer?asin=${encodeURIComponent(asin)}`, {
        headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
        credentials: 'include',
      });

      let researchProduct: any = null;
      let offerProduct: any = null;
      let submission: any = null;

      if (offerRes.ok) {
        const data = await offerRes.json();
        if (data.success) {
          researchProduct = data.data?.researchProduct || null;
          offerProduct = data.data?.offerProduct || null;
          submission = data.data?.submission || null;
        }
      }

      const normalized = researchProduct
          ? {
              ...researchProduct,
              id: researchProduct.id,
              asin,
              title: researchProduct.display_title || researchProduct.title || 'Untitled Product',
              brand: researchProduct.brand ?? null,
              category: researchProduct.category ?? null,
              status: researchProduct?.extra_data?.status || null,
              score: researchProduct?.extra_data?.score || null,
              productData: submission?.submission_data?.productData || null,
              keepaResults: submission?.submission_data?.keepaResults || [],
              marketScore: submission?.submission_data?.marketScore || null,
              metrics: submission?.metrics || {},
              source: 'research_products',
              researchProductId: researchProduct.id,
              display_title: researchProduct?.display_title || null,
              offerProduct: offerProduct,
            }
          : null;

      if (!normalized) {
        setError('Product not found. Return to Offers and select a product.');
        setProduct(null);
        setIsAlreadyOffered(false);
      } else {
        setProduct(normalized);
        if (normalized?.display_title) {
          dispatch(setDisplayTitle({ asin, title: normalized.display_title }));
        }
        
        // Check if product is already offered
        setIsAlreadyOffered(researchProduct?.is_offered === true);
        
        // If we have offer data from the database, load it into state
        if (offerProduct) {
          const loadedOfferData: OfferData = {
            productId: asin,
            reviewInsights: offerProduct.insights || {
              topLikes: '',
              topDislikes: '',
              importantInsights: '',
              importantQuestions: '',
            },
            ssp: offerProduct.improvements || {
              quantity: '',
              functionality: '',
              quality: '',
              aesthetic: '',
              bundle: '',
            },
            supplierInfo: {
              supplierName: '',
              contact: '',
              fobPrice: '',
              landedCost: '',
              moq: '',
              leadTime: '',
              notes: '',
            },
            status: offerProduct.status || 'none',
            createdAt: offerProduct.created_at || new Date().toISOString(),
            updatedAt: offerProduct.updated_at || new Date().toISOString(),
          };
          setOfferData(loadedOfferData);

          // Set stored reviews count
          const reviews = offerProduct.reviews;
          setStoredReviewsCount(Array.isArray(reviews) ? reviews.length : 0);

          // Check if insights and improvements have data
          const insights = offerProduct.insights;
          const improvements = offerProduct.improvements;

          const hasInsightsData = insights && (
            insights.topLikes?.trim() ||
            insights.topDislikes?.trim() ||
            insights.importantInsights?.trim() ||
            insights.importantQuestions?.trim()
          );

          const hasImprovementsData = improvements && (
            improvements.quantity.length > 0 ||
            improvements.functionality.length > 0 ||
            improvements.quality.length > 0 ||
            improvements.aesthetic.length > 0 ||
            improvements.bundle.length > 0
          );

          setHasStoredInsights(!!hasInsightsData);
          setHasStoredImprovements(!!hasImprovementsData);
        } else {
          setStoredReviewsCount(0);
          setHasStoredInsights(false);
          setHasStoredImprovements(false);
        }
      }
    } catch (e) {
      console.error('[OfferDetail] Failed to load:', e);
      setError(e instanceof Error ? e.message : 'Failed to load offer');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, asin]);

  const updateOfferData = (updates: Partial<OfferData>) => {
    const current = offerData || getDefaultOfferData(asin);
    const merged: OfferData = {
      ...current,
      ...updates,
      productId: asin,
      updatedAt: new Date().toISOString(),
    };
    if (!updates.status) {
      merged.status = hasOfferData(merged) && current.status === 'none' ? 'working' : current.status;
    }
    setOfferData(merged);
  };

  // Handle tab change with unsaved changes check
  const handleTabChange = (newTab: OfferDetailTab) => {
    if (isDirty && newTab !== activeTab) {
      setPendingTab(newTab);
      setShowUnsavedChangesModal(true);
    } else {
      setActiveTab(newTab);
    }
  };

  // Save and continue
  const handleSaveAndContinue = async () => {
    await handleSave();
    if (pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab(null);
      setShowUnsavedChangesModal(false);
    }
  };

  // Cancel tab change
  const handleCancelTabChange = () => {
    setPendingTab(null);
    setShowUnsavedChangesModal(false);
  };

  // Handle save
  const handleSave = async () => {
    if (!offerData || !isDirty) return;

    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      const productId = product?.researchProductId || product?.id;

      const { error: upsertError } = await supabase
        .from('offer_products')
        .upsert(
          {
            product_id: productId,
            insights: offerData.reviewInsights,
            improvements: offerData.ssp,
            user_id: userId || null,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'product_id' }
        );

      if (upsertError) {
        console.error('Error saving offer data:', upsertError);
      } else {
        console.log('Offer data saved for product:', productId);
        setIsReviewsDirty(false);
        setIsSspDirty(false);

        // Update stored data flags after successful save
        const ri = offerData.reviewInsights;
        const ssp = offerData.ssp;

        const hasInsightsData = ri && (
          ri.topLikes?.trim() ||
          ri.topDislikes?.trim() ||
          ri.importantInsights?.trim() ||
          ri.importantQuestions?.trim()
        );

        const hasImprovementsData = ssp && (
          ssp.quantity.length > 0 ||
          ssp.functionality.length > 0 ||
          ssp.quality.length > 0 ||
          ssp.aesthetic.length > 0 ||
          ssp.bundle.length > 0
        );

        setHasStoredInsights(!!hasInsightsData);
        setHasStoredImprovements(!!hasImprovementsData);
      }
    } catch (err) {
      console.error('Error saving offer data:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle clear data
  const handleClearData = async () => {
    if (!product) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const productId = product?.researchProductId || product?.id;

      // Delete from Supabase via API
      const response = await fetch(`/api/offer?productId=${productId}`, {
        method: 'DELETE',
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error deleting offer data:', errorData.error);
      } else {
        console.log('Offer data deleted for product:', productId);
      }
    } catch (err) {
      console.error('Error deleting offer data:', err);
    }

    // Reset local state
    const defaultData = getDefaultOfferData(asin);
    setOfferData(defaultData);
    setStoredReviewsCount(0);
    setIsReviewsDirty(false);
    setIsSspDirty(false);
    setHasStoredInsights(false);
    setHasStoredImprovements(false);

    // Also clear localStorage
    try {
      localStorage.removeItem(`offer_${asin}`);
    } catch {
      // ignore
    }
  };

  // Handle send to sourcing
  const handleSendToSourcing = async () => {
    if (!user) return;
    setIsPushingToSourcing(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Get the research_product_id or use product id
      const productId = product?.researchProductId || product?.id;

      console.log('Updating is_offered to true for product:', productId);

      const response = await fetch('/api/research/status', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        credentials: 'include',
        body: JSON.stringify({
          productIds: productId,
          status: 'offered',
          value: true
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log('Product marked as offered successfully');
          updateOfferData({ status: 'completed' });
        } else {
          throw new Error(result.error || 'Failed to update product status');
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update product status');
      }
    } catch (error) {
      console.error('Error sending to sourcing:', error);
      setError(error instanceof Error ? error.message : 'Failed to send product to sourcing');
    } finally {
      setIsPushingToSourcing(false);
    }
  };

  // Download CSV template for reviews
  const downloadTemplate = () => {
    const csvContent = 'Title,Body,Rating\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reviews_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Show modal and download template
  const handleDownloadTemplate = () => {
    setShowTemplateModal(true);
    downloadTemplate();
  };

  const handleBeginSourcing = async () => {
    if (!user) return;

    // Validate that offer record exists in database with complete insights and improvements
    if (!product?.offerProduct) {
      setError('You must save the offer data before proceeding to sourcing.');
      return;
    }

    if (!hasStoredInsights) {
      setError('Please complete and save the Review Insights before proceeding to sourcing.');
      return;
    }

    if (!hasStoredImprovements) {
      setError('Please complete and save the SSP Improvements before proceeding to sourcing.');
      return;
    }

    if (isAlreadyOffered) {
      return router.push(`/sourcing/${encodeURIComponent(asin)}`);
    }

    setIsPushingToSourcing(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Ensure research_products row exists
      const researchRes = await fetch('/api/research', {
        headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
        credentials: 'include',
      });

      let researchProductId: string | null = null;
      if (researchRes.ok) {
        const data = await researchRes.json();
        const existing = Array.isArray(data?.data) ? data.data.find((p: any) => p.asin === asin) : null;
        researchProductId = existing?.id || null;
      }

      if (!researchProductId) throw new Error('Unable to resolve research product ID');

      // Mark offered = true
      const statusRes = await fetch('/api/research/status', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        credentials: 'include',
        body: JSON.stringify({ productIds: researchProductId, status: 'offered', value: true }),
      });

      const result = await statusRes.json().catch(() => ({}));
      if (!statusRes.ok || !result?.success) {
        throw new Error(result?.error || `Failed to update offered status (HTTP ${statusRes.status})`);
      }

      updateOfferData({ status: 'completed' });
      router.push(`/sourcing/${encodeURIComponent(asin)}`);
    } catch (e) {
      console.error('[OfferDetail] Begin sourcing failed:', e);
      setError(e instanceof Error ? e.message : 'Failed to begin sourcing');
    } finally {
      setIsPushingToSourcing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading offer...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-12">
        <div className="flex items-start gap-3 text-slate-300">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
          <div className="min-w-0">
            <p className="font-medium">Could not load product</p>
            <p className="text-slate-400 mt-1">{error || 'Please return to Offers and select a product.'}</p>
            <button
              onClick={() => router.push('/offer')}
              className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
            >
              Back to Offers
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-6 bg-red-600 text-white px-6 py-4 rounded-xl shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            <p className="font-medium">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="hover:bg-red-700 rounded p-1 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <ProductHeaderBar
        productId={product?.researchProductId || product?.id}
        asin={asin}
        currentDisplayTitle={displayName}
        originalTitle={product?.title || displayName}
        currentPhase="offer"
        badgeLabel={vettedStatus}
        badgeTone={badgeToneFromStatus(vettedStatus)}
        leftButton={{ label: 'Vetting Results', href: `/vetting/${encodeURIComponent(asin)}`, stage: 'vetting' }}
        rightButton={{
          label: 'Begin Sourcing',
          onClick: handleBeginSourcing,
          disabled: !asin || asin === 'N/A',
          loading: isPushingToSourcing,
          stage: 'sourcing',
        }}
      />

      <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-700/50 bg-slate-800/50">
          <div className="flex">
            <button
              onClick={() => handleTabChange('product-info')}
              className={`px-6 py-4 font-medium transition-all relative ${
                activeTab === 'product-info' ? 'text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                Product Info
              </span>
              {activeTab === 'product-info' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500" />
              )}
            </button>
            <button
              onClick={() => handleTabChange('review-aggregator')}
              className={`px-6 py-4 font-medium transition-all relative ${
                activeTab === 'review-aggregator' ? 'text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Review Aggregator
              </span>
              {activeTab === 'review-aggregator' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500" />
              )}
            </button>
            <button
              onClick={() => handleTabChange('ssp-builder')}
              className={`px-6 py-4 font-medium transition-all relative ${
                activeTab === 'ssp-builder' ? 'text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                SSP Builder Hub
              </span>
              {activeTab === 'ssp-builder' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500" />
              )}
            </button>
          </div>

          {/* Download CSV Template Button - Only show on Review Aggregator tab */}
          {activeTab === 'review-aggregator' && (
            <button
              onClick={handleDownloadTemplate}
              className="mr-4 px-4 py-2 flex items-center gap-2 text-sm font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-all duration-200"
              title="Download CSV template for reviews"
            >
              <Download className="w-4 h-4" />
              Download Reviews Template
            </button>
          )}
        </div>

        <div className="p-6">
          {activeTab === 'product-info' && <ProductInfoTab productData={product} />}
          {activeTab === 'review-aggregator' && (
            <ReviewAggregatorTab
              productId={product?.researchProductId || product?.id}
              data={offerData?.reviewInsights}
              onChange={(reviewInsights) => updateOfferData({ reviewInsights })}
              storedReviewsCount={storedReviewsCount}
              onDirtyChange={setIsReviewsDirty}
              onInsightsSaved={() => setHasStoredInsights(true)}
            />
          )}
          {activeTab === 'ssp-builder' && (
            <SspBuilderHubTab
              productId={product?.researchProductId || product?.id}
              data={offerData?.ssp}
              reviewInsights={offerData?.reviewInsights}
              onChange={(ssp) => updateOfferData({ ssp })}
              onDirtyChange={setIsSspDirty}
              hasStoredInsights={hasStoredInsights}
              hasStoredImprovements={hasStoredImprovements}
              onImprovementsSaved={() => setHasStoredImprovements(true)}
            />
          )}
        </div>
      </div>

      {/* Global Actions */}
      <OfferGlobalActions
        onSave={handleSave}
        onClear={handleClearData}
        onSendToSourcing={handleSendToSourcing}
        hasData={offerData ? (offerData.status !== 'none' || hasOfferData(offerData)) : false}
        isDirty={isDirty}
        isSaving={isSaving}
        canPushToSourcing={canPushToSourcing}
        isPushingToSourcing={isPushingToSourcing}
        isAlreadyOffered={isAlreadyOffered}
      />

      {/* Template Download Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 border-2 border-emerald-500/50 rounded-2xl shadow-2xl shadow-emerald-500/10 max-w-lg w-full p-6 space-y-5 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10">
              {/* Header with success indicator */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/50">
                  <CheckCircle className="w-6 h-6 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Template Downloaded!</h3>
                  <p className="text-sm text-emerald-400">Your CSV template is ready</p>
                </div>
              </div>

              {/* Info Section */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-white font-semibold mb-2">CSV Format Requirements</h4>
                    <p className="text-slate-400 text-sm">
                      Please follow these guidelines when filling out your reviews template:
                    </p>
                  </div>
                </div>

                {/* Requirements List */}
                <ul className="space-y-3 ml-8">
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-blue-400 text-xs font-bold">1</span>
                    </div>
                    <div>
                      <span className="text-white font-medium">Required Columns</span>
                      <p className="text-slate-400 text-sm mt-0.5">
                        <code className="bg-slate-700/50 px-2 py-0.5 rounded text-emerald-400">Title</code>,{' '}
                        <code className="bg-slate-700/50 px-2 py-0.5 rounded text-emerald-400">Body</code>,{' '}
                        <code className="bg-slate-700/50 px-2 py-0.5 rounded text-emerald-400">Rating</code>
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-amber-400 text-xs font-bold">2</span>
                    </div>
                    <div>
                      <span className="text-white font-medium">Maximum Reviews</span>
                      <p className="text-slate-400 text-sm mt-0.5">
                        Up to <span className="text-amber-400 font-semibold">100 reviews</span> per product
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-purple-400 text-xs font-bold">3</span>
                    </div>
                    <div>
                      <span className="text-white font-medium">Rating Format</span>
                      <p className="text-slate-400 text-sm mt-0.5">
                        Use numbers from <span className="text-purple-400 font-semibold">1 to 5</span> stars
                      </p>
                    </div>
                  </li>
                </ul>
              </div>

              {/* Close Button */}
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 rounded-lg text-white font-semibold transition-all shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40"
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
