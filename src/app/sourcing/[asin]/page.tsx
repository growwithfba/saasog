'use client';

import { PageTitleBlock } from '@/components/layout/PageTitleBlock';
import MainTemplate from '@/components/MainTemplate';
import { SourcingDetailContent } from '@/components/Sourcing/SourcingDetailContent';

export default function SourcingDetailPage({ params }: { params: { asin: string } }) {
  const asin = decodeURIComponent(params.asin);

  return (
    <MainTemplate>
      <PageTitleBlock
        title="Sourcing"
        subtitle="Prepare costs, suppliers, and freight details before placing an order."
        page="sourcing"
      />
      <SourcingDetailContent asin={asin} />
    </MainTemplate>
  );
}
