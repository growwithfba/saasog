'use client';

import { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { ResearchDetailContent } from '@/components/Research/ResearchDetailContent';
import LearnModal from '@/components/LearnModal';

export default function ResearchDetailPage({ params }: { params: { asin: string } }) {
  const asin = decodeURIComponent(params.asin);
  const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);

  const handleLearnModalAction = () => {
    setIsLearnModalOpen(false);
  };

  return (
    <PageShell
      title="Research"
      subtitle="Every product in your funnel is a seed — the more you plant, the more you will grow."
      page="research"
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
      <ResearchDetailContent asin={asin} />
      <LearnModal 
        isOpen={isLearnModalOpen} 
        onClose={() => setIsLearnModalOpen(false)} 
        onAction={handleLearnModalAction} 
      />
    </PageShell>
  );
}


