'use client';

import { Suspense } from 'react';
import { OfferPageContent } from "@/components/Offer/OfferPageContent";
import { Loader2 } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';

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
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading...</p>
      </div>
    }>
      <OfferPageContent />
    </Suspense>
  );
}

export default function OfferPage() {
  return (
    <PageShell
      title="Offer"
      subtitle="Build your Super Selling Points and refine the offer that outshines the competition."
      page="offer"
    >
      <OfferPageContentWrapper />
    </PageShell>
  );
}

