'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Lightbulb, Sparkles } from 'lucide-react';
import { ReviewAggregatorTab } from './ReviewAggregatorTab';
import { SspBuilderHubTab } from './SspBuilderHubTab';
import type { OfferData, ReviewInsights, SspCategories } from '../types';

interface CustomerVoiceTabProps {
  productId: string | null;
  asin: string;
  offerData: OfferData;
  storedReviewsCount: number;
  hasStoredInsights: boolean;
  hasStoredImprovements: boolean;
  onReviewsChange: (reviewInsights: ReviewInsights) => void;
  onSspChange: (ssp: SspCategories) => void;
  onReviewsDirtyChange: (isDirty: boolean) => void;
  onSspDirtyChange: (isDirty: boolean) => void;
  onInsightsSaved: () => void;
  onImprovementsSaved: () => void;
}

/**
 * Phase 2.6 — unifies what used to be two separate tabs (Review
 * Aggregator + SSP Builder Hub) into a single top-to-bottom scrolling
 * experience. Composes the existing tab components as sections and
 * layers a small anchor nav on top once content exists.
 *
 * Rationale: for a newer private-label seller, splitting "listen to
 * customers" from "design your angle" across tabs creates friction.
 * Same data, same mental step — keep it in one room.
 */
export function CustomerVoiceTab({
  productId,
  asin,
  offerData,
  storedReviewsCount,
  hasStoredInsights,
  hasStoredImprovements,
  onReviewsChange,
  onSspChange,
  onReviewsDirtyChange,
  onSspDirtyChange,
  onInsightsSaved,
  onImprovementsSaved,
}: CustomerVoiceTabProps) {
  const reviewsAnchorRef = useRef<HTMLDivElement>(null);
  const sspAnchorRef = useRef<HTMLDivElement>(null);

  // Show the section nav once the second section has something worth
  // jumping to — until SSPs are live, the user is in a single-section
  // page and a nav would be pointless chrome.
  const sspIsLive = hasStoredInsights;

  const [activeAnchor, setActiveAnchor] = useState<'reviews' | 'ssp'>('reviews');

  useEffect(() => {
    if (!sspIsLive) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.boundingClientRect.top || 0) - (b.boundingClientRect.top || 0))[0];
        if (!visible) return;
        setActiveAnchor(visible.target === sspAnchorRef.current ? 'ssp' : 'reviews');
      },
      { rootMargin: '-120px 0px -60% 0px', threshold: [0, 0.25, 0.5] }
    );
    if (reviewsAnchorRef.current) io.observe(reviewsAnchorRef.current);
    if (sspAnchorRef.current) io.observe(sspAnchorRef.current);
    return () => io.disconnect();
  }, [sspIsLive]);

  const scrollTo = (which: 'reviews' | 'ssp') => {
    const el = which === 'reviews' ? reviewsAnchorRef.current : sspAnchorRef.current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-8">
      {sspIsLive && (
        <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-slate-900/85 backdrop-blur-xl border-b border-slate-700/50 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollTo('reviews')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
              activeAnchor === 'reviews'
                ? 'bg-blue-500/15 text-blue-200 border border-blue-500/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent hover:border-slate-700/60'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Reviews & Insights
          </button>
          <button
            type="button"
            onClick={() => scrollTo('ssp')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
              activeAnchor === 'ssp'
                ? 'bg-purple-500/15 text-purple-200 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent hover:border-slate-700/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Super Selling Points
          </button>
        </div>
      )}

      {/* Section 1 — Reviews + Insights */}
      <div ref={reviewsAnchorRef} id="customer-voice-reviews">
        <ReviewAggregatorTab
          productId={productId}
          data={offerData.reviewInsights}
          onChange={onReviewsChange}
          storedReviewsCount={storedReviewsCount}
          onDirtyChange={onReviewsDirtyChange}
          onInsightsSaved={onInsightsSaved}
        />
      </div>

      {/* Section 2 — SSP generator + 5 category cards. Only visible
          once insights exist. Wrapped in the same card chrome as the
          AI Review Insights section above so the two sections read as
          a consistent family, not two unrelated tools. */}
      {sspIsLive && (
        <div
          ref={sspAnchorRef}
          id="customer-voice-ssp"
          className="bg-gradient-to-br from-blue-900/20 via-indigo-900/10 to-slate-800/40 rounded-2xl border border-blue-500/40 p-6 relative"
        >
          <div className="flex items-center gap-3 mb-4 relative z-10">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/30 shrink-0">
              <Sparkles className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent">
              Super Selling Points
            </h3>
          </div>

          <div className="relative z-10">
            <SspBuilderHubTab
              productId={productId}
              asin={asin}
              data={offerData.ssp}
              reviewInsights={offerData.reviewInsights}
              onChange={onSspChange}
              onDirtyChange={onSspDirtyChange}
              hasStoredInsights={hasStoredInsights}
              hasStoredImprovements={hasStoredImprovements}
              onImprovementsSaved={onImprovementsSaved}
            />
          </div>
        </div>
      )}
    </div>
  );
}
