'use client';

import { PageTitleBlock } from '@/components/layout/PageTitleBlock';
import MainTemplate from '@/components/MainTemplate';
import { OfferDetailContent } from '@/components/Offer/OfferDetailContent';

export default function OfferDetailPage({ params }: { params: { asin: string } }) {
  const asin = decodeURIComponent(params.asin);

  return (
    <MainTemplate>
      <PageTitleBlock
        title="Offering"
        subtitle="Build your Super Selling Points and refine the offer that outshines the competition."
        page="offer"
      />
      <OfferDetailContent asin={asin} />
    </MainTemplate>
  );
}
