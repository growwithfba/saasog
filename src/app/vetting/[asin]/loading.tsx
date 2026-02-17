'use client';

import { Loader2 } from 'lucide-react';

export default function VettingDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="h-6 bg-gray-200 dark:bg-slate-700 rounded w-3/4 mb-3"></div>
            <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/2"></div>
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-32 bg-gray-200 dark:bg-slate-700 rounded-lg"></div>
            <div className="h-10 w-32 bg-gray-200 dark:bg-slate-700 rounded-lg"></div>
          </div>
        </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 p-8">
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <Loader2 className="h-16 w-16 text-blue-500 dark:text-blue-400 animate-spin" />
          <p className="text-gray-600 dark:text-slate-400 font-medium text-lg">Loading vetting analysis...</p>
          <p className="text-gray-500 dark:text-slate-500 text-sm">Please wait while we fetch your data</p>
        </div>

        {/* Stats Cards Skeleton */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
          <div className="h-32 bg-gray-200 dark:bg-slate-700 rounded-xl"></div>
          <div className="h-32 bg-gray-200 dark:bg-slate-700 rounded-xl"></div>
          <div className="h-32 bg-gray-200 dark:bg-slate-700 rounded-xl"></div>
        </div>

        {/* Chart Skeleton */}
        <div className="mt-8 h-64 bg-gray-200 dark:bg-slate-700 rounded-xl animate-pulse"></div>
      </div>
    </div>
  );
}
