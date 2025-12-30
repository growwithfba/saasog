'use client';

import { PageShell } from '@/components/layout/PageShell';
import { ResearchDetailContent } from '@/components/Research/ResearchDetailContent';

export default function ResearchDetailPage({ params }: { params: { asin: string } }) {
  const asin = decodeURIComponent(params.asin);

  return (
    <PageShell
      title="Research"
      subtitle="Every product in your funnel is a seed — the more you plant, the more you will grow."
    >
      <ResearchDetailContent asin={asin} />
    </PageShell>
  );
}


