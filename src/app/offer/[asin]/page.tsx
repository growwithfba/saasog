'use client';

import { PageShell } from '@/components/layout/PageShell';
import { OfferDetailContent } from '@/components/Offer/OfferDetailContent';

export default function OfferDetailPage({ params }: { params: { asin: string } }) {
  const asin = decodeURIComponent(params.asin);

  

  return (
    <PageShell
      title="Offer"
      subtitle="Build your Super Selling Points and refine the offer that outshines the competition."
      page="offer"
    >
      <OfferDetailContent asin={asin} />
    </PageShell>
  );
}


