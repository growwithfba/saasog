'use client';

import { Suspense } from 'react';
import MainTemplate from '@/components/MainTemplate';
import { FunnelDashboard } from '@/components/dashboard/FunnelDashboard';
import Table from '@/components/Table';
import { useProductFunnelStats } from '@/hooks/useProductFunnelStats';

/**
 * My Funnel — the store of every saved product, across all phases.
 * The funnel visual sits on top; the full product table (previously the
 * body of /research) sits beneath it.
 */
export default function DashboardPage() {
  const stats = useProductFunnelStats();

  return (
    <MainTemplate>
      <FunnelDashboard stats={stats} />
      <div className="mt-8">
        {/* Table reads ?tab=new via useSearchParams, which Next.js requires
            to be wrapped in a Suspense boundary. */}
        <Suspense fallback={null}>
          <Table setUpdateProducts={stats.setUpdateProducts} />
        </Suspense>
      </div>
    </MainTemplate>
  );
}
