'use client';

import { Suspense, useState } from 'react';
import { OfferPageContent } from "@/components/Offer/OfferPageContent";
import { Loader2, PlayCircle } from 'lucide-react';
import MainTemplate from '@/components/MainTemplate';
import { LightsaberUnderline } from '@/components/LightsaberUnderline';
import { PageTitleBlock } from '@/components/layout/PageTitleBlock';
import LearnModal from '@/components/LearnModal';

/**
 * Offer Page - Page 3 in the funnel (Research -> Vetting -> Offer -> Sourcing)
 * 
 * This page allows users to build and refine SSPs (Super Selling Points) for vetted products.
 * 
 * TO HOOK UP REAL AI ENDPOINT:
 * 1. Update /api/offer/analyze-reviews to call OpenAI API with the uploaded CSV
 * 2. Parse the CSV and extract customer reviews
 * 3. Use OpenAI to analyze reviews and generate insights
 * 4. Return the structured response matching the OfferData interface
 * 
 * TO HOOK UP REAL PERSISTENCE:
 * 1. Create an 'offers' table in Supabase with columns matching OfferData interface
 * 2. Update saveOfferData() to persist to Supabase instead of localStorage
 * 3. Update loadOfferData() to fetch from Supabase
 * 4. Add proper error handling and loading states
 */
function OfferPageContentWrapper() {
  const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);

  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
        <p className="text-gray-600 dark:text-slate-400">Loading...</p>
      </div>
    }>
      <PageTitleBlock
        title="Offering"
        subtitle="Build your Super Selling Points and refine the offer that outshines the competition."
        page='offer'
        learnButton={
          <button
            onClick={() => setIsLearnModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-500/30 rounded-lg text-purple-600 dark:text-purple-300 hover:text-purple-700 dark:hover:text-purple-200 transition-all duration-200 transform hover:scale-105"
          >
            <PlayCircle className="w-4 h-4" />
            <span className="font-medium">Learn</span>
          </button>
        }
      />
      <OfferPageContent />
      <LearnModal 
        isOpen={isLearnModalOpen} 
        onClose={() => setIsLearnModalOpen(false)} 
        onAction={() => setIsLearnModalOpen(false)} 
      />
    </Suspense>
  );
}

export default function OfferPage() {
  return (
    <MainTemplate>
      <OfferPageContentWrapper />
    </MainTemplate>
  );
}
