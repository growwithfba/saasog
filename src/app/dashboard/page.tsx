'use client';

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
  const { setUpdateProducts } = useProductFunnelStats();

  return (
    <MainTemplate>
      <FunnelDashboard />
      <div className="mt-8">
        <Table setUpdateProducts={setUpdateProducts} />
      </div>
    </MainTemplate>
  );
}
