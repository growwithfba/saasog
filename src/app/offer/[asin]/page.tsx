'use client';

import MainTemplate from '@/components/MainTemplate';
import { OfferDetailContent } from '@/components/Offer/OfferDetailContent';

export default function OfferDetailPage({ params }: { params: { asin: string } }) {
  const asin = decodeURIComponent(params.asin);

  return (
    <MainTemplate>
      <OfferDetailContent asin={asin} />
    </MainTemplate>
  );
}
