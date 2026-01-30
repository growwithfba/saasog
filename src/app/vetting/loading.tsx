'use client';

import { Loader2 } from 'lucide-react';

export default function VettingLoading() {
  return (
    <div className="space-y-6">
      {/* Content Skeleton */}
      <div className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-8">
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="h-12 w-12 text-blue-500 dark:text-blue-400 animate-spin" />
          <p className="text-gray-600 dark:text-slate-400 font-medium">Loading vetting details...</p>
        </div>

        {/* Additional skeleton content */}
        <div className="mt-8 space-y-4 animate-pulse">
          <div className="h-32 bg-gray-200 dark:bg-slate-700 rounded-lg"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-24 bg-gray-200 dark:bg-slate-700 rounded-lg"></div>
            <div className="h-24 bg-gray-200 dark:bg-slate-700 rounded-lg"></div>
            <div className="h-24 bg-gray-200 dark:bg-slate-700 rounded-lg"></div>
          </div>
          <div className="h-48 bg-gray-200 dark:bg-slate-700 rounded-lg"></div>
        </div>
      </div>
    </div>
  );
}
