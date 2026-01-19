'use client';

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

type StageWorkContainerTab = 'left' | 'right';

export type StageWorkContainerProps = {
  titleLeftTab: string;
  titleRightTab: string;
  leftTabContent: React.ReactNode;
  rightTabContent: React.ReactNode;
  defaultTab?: StageWorkContainerTab;

  /** Header row (under tabs) */
  showHeaderOn?: 'left' | 'right' | 'both' | 'none';
  searchValue?: string;
  onSearchChange?: (next: string) => void;
  searchPlaceholder?: string;
  headerRight?: React.ReactNode;
  /** Content to display on the right side of the tabs (like Learn button) */
  tabsHeaderRight?: React.ReactNode;
};

export function StageWorkContainer({
  titleLeftTab,
  titleRightTab,
  leftTabContent,
  rightTabContent,
  defaultTab = 'left',
  showHeaderOn = 'left',
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  headerRight,
  tabsHeaderRight,
}: StageWorkContainerProps) {
  const [activeTab, setActiveTab] = useState<StageWorkContainerTab>(defaultTab);

  const shouldShowHeader = useMemo(() => {
    if (showHeaderOn === 'none') return false;
    if (showHeaderOn === 'both') return true;
    return showHeaderOn === activeTab;
  }, [activeTab, showHeaderOn]);

  return (
    <div className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 overflow-hidden shadow-lg">
      {/* Tab Navigation (matches Research/Vetting) */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-800/50">
        <div className="flex">
          <button
            onClick={() => setActiveTab('left')}
            className={`px-6 py-4 font-medium transition-all relative ${
              activeTab === 'left' 
                ? 'text-gray-900 dark:text-white' 
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {titleLeftTab}
            {activeTab === 'left' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('right')}
            className={`px-6 py-4 font-medium transition-all relative ${
              activeTab === 'right' 
                ? 'text-gray-900 dark:text-white' 
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {titleRightTab}
            {activeTab === 'right' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500" />
            )}
          </button>
        </div>
        {tabsHeaderRight && (
          <div className="px-6">
            {tabsHeaderRight}
          </div>
        )}
      </div>

      <div className="p-6">
        {shouldShowHeader && (onSearchChange || headerRight) && (
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              {onSearchChange && (
                <>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-400" />
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
                    value={searchValue || ''}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900/50 border border-gray-300 dark:border-slate-700/50 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 shadow-sm"
                  />
                </>
              )}
            </div>
            {headerRight ? <div className="flex items-center gap-2">{headerRight}</div> : null}
          </div>
        )}

        {activeTab === 'left' ? leftTabContent : rightTabContent}
      </div>
    </div>
  );
}


