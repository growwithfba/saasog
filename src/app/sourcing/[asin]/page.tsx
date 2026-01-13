'use client';

import MainTemplate from '@/components/MainTemplate';
import { SourcingDetailContent } from '@/components/Sourcing/SourcingDetailContent';

export default function SourcingDetailPage({ params }: { params: { asin: string } }) {
  const asin = decodeURIComponent(params.asin);

  return (
    <MainTemplate>
      <SourcingDetailContent asin={asin} />
    </MainTemplate>
  );
}
