'use client';

import React from 'react';
import type { KeepaAnalysisSnapshot } from './KeepaTypes';

interface MarketStoryProps {
  analysis: KeepaAnalysisSnapshot;
}

/**
 * Section 1 of the Market Climate redesign: a 60–90 word AI-authored
 * paragraph summarizing what the market has done over the analysis window.
 * Reads analysis.computed.narration.marketStory (populated by 2.8d).
 *
 * Renders nothing if narration is missing — the hub's Refresh button is
 * right there and there's no point showing a prompt a user would have to
 * re-discover.
 */
const MarketStory: React.FC<MarketStoryProps> = ({ analysis }) => {
  const story = analysis?.computed?.narration?.marketStory;
  if (!story) return null;

  return (
    <div className="mb-6">
      <div className="rounded-xl border border-[#1e3a8a]/[0.12] dark:border-slate-700/60 bg-[#f5f8fd] dark:bg-transparent dark:bg-gradient-to-br dark:from-slate-800/70 dark:to-slate-900/50 px-5 py-4 dark:shadow-inner">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
          The Story
        </div>
        <p className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed">{story}</p>
      </div>
    </div>
  );
};

export default MarketStory;
