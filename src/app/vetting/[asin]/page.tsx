'use client';

import { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { VettingDetailContent } from '@/components/Vetting/VettingDetailContent';
import LearnModal from '@/components/LearnModal';

export default function VettingDetailPage({ params }: { params: { asin: string } }) {
  const asin = decodeURIComponent(params.asin);
  const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);

  return (
    <PageShell
      title="Vetting"
      subtitle="Review your vetted products and launch your next analysis."
      page="vetting"
      learnButton={
        <button
          onClick={() => setIsLearnModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-500/30 rounded-lg text-purple-600 dark:text-purple-300 hover:text-purple-700 dark:hover:text-purple-200 transition-all duration-200 transform hover:scale-105"
        >
          <PlayCircle className="w-4 h-4" />
          <span className="font-medium">Learn</span>
        </button>
      }
    >
      <VettingDetailContent asin={asin} />
      <LearnModal 
        isOpen={isLearnModalOpen} 
        onClose={() => setIsLearnModalOpen(false)} 
        onAction={() => setIsLearnModalOpen(false)} 
      />
    </PageShell>
  );
}
