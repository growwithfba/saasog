'use client';

import { Suspense } from 'react';
import { SourcingPageContent } from "@/components/Sourcing/SourcingPageContent";
import { Loader2 } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';

/**
 * Sourcing Page - Page 4 in the funnel (Research -> Vetting -> Offer -> Sourcing)
 * 
 * This page allows users to manage supplier quotes, calculate profitability,
 * plan freight and compliance, and finalize packaging specs before placing orders.
 */
function SourcingPageContentWrapper() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
        <p className="text-gray-600 dark:text-slate-400">Loading...</p>
      </div>
    }>
      <SourcingPageContent />
    </Suspense>
  );
}

export default function SourcingPage() {
  return (
    <PageShell
      title="Sourcing"
      subtitle="Prepare costs, suppliers, and freight details before placing an order."
    >
      <SourcingPageContentWrapper />
    </PageShell>
  );
}

