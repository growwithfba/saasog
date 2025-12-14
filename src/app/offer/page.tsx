'use client';

import MainTemplate from "@/components/MainTemplate";
import { OfferPageContent } from "@/components/Offer/OfferPageContent";

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
export default function OfferPage() {
  return (
    <MainTemplate>
      <OfferPageContent />
    </MainTemplate>
  );
}

