'use client';

import { Suspense, useState } from 'react';
import { Dashboard } from '@/components/dashboard/Dashboard';
import MainTemplate from '@/components/MainTemplate';
import { PageTitleBlock } from '@/components/layout/PageTitleBlock';
import LearnModal from '@/components/LearnModal';
import { PlayCircle, Loader2 } from 'lucide-react';

function VettingPageContent() {
  const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);

  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-12 w-12 text-blue-500 dark:text-blue-400 animate-spin mb-4" />
        <p className="text-gray-600 dark:text-slate-400">Loading vetting data...</p>
      </div>
    }>
      <PageTitleBlock
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
      />
      <Dashboard />
      <LearnModal 
        isOpen={isLearnModalOpen} 
        onClose={() => setIsLearnModalOpen(false)} 
        onAction={() => setIsLearnModalOpen(false)} 
      />
    </Suspense>
  );
}

export default function VettingPage() {
  return (
    <MainTemplate>
      <VettingPageContent />
    </MainTemplate>
  );
} 