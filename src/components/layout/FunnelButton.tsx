'use client';

import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';

interface FunnelButtonProps {
  isActive?: boolean;
}

/**
 * "My Funnel" nav button. Deliberately NOT a PhasePill — the funnel is the
 * container of every phase, not a fifth phase, so it must not read as a peer
 * of Discovery / Vetting / Offering / Sourcing.
 */
export function FunnelButton({ isActive = false }: FunnelButtonProps) {
  const base =
    'flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all border focus:outline-none focus:ring-2 focus:ring-violet-400/40';
  const state = isActive
    ? 'text-violet-800 dark:text-violet-200 border-violet-600/60 dark:border-violet-500/70 bg-violet-500/[0.12] dark:bg-violet-500/18'
    : 'text-slate-700 dark:text-violet-200 border-[#1e3a8a]/15 dark:border-violet-500/50 bg-transparent dark:bg-violet-500/10 hover:text-violet-800 dark:hover:text-violet-200 hover:bg-violet-500/10 dark:hover:bg-violet-500/18 hover:border-violet-500/50 dark:hover:border-violet-400/70';

  return (
    <Link href="/dashboard" className={`${base} ${state}`}>
      <LayoutGrid className="w-4 h-4" />
      <span>My Funnel</span>
    </Link>
  );
}
