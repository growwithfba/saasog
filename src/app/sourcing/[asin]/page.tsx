'use client';

import { PageShell } from '@/components/layout/PageShell';
import { SourcingDetailContent } from '@/components/Sourcing/SourcingDetailContent';

export default function SourcingDetailPage({ params }: { params: { asin: string } }) {
  const asin = decodeURIComponent(params.asin);

  return (
    <PageShell title="Sourcing" subtitle="Prepare costs, suppliers, and freight details before placing an order.">
      <SourcingDetailContent asin={asin} />
    </PageShell>
  );
}


