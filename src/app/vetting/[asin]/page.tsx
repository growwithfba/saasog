'use client';

import { PageShell } from '@/components/layout/PageShell';
import { VettingDetailContent } from '@/components/Vetting/VettingDetailContent';

export default function VettingDetailPage({ params }: { params: { asin: string } }) {
  const asin = decodeURIComponent(params.asin);

  return (
    <PageShell title="Vetting" subtitle="Review your vetted products and launch your next analysis.">
      <VettingDetailContent asin={asin} />
    </PageShell>
  );
}


