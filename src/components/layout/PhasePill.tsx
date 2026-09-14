'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

export type PhaseType = 'research' | 'vetting' | 'offer' | 'sourcing';

interface PhasePillProps {
  phase: PhaseType;
  href: string;
  label: string;
  isActive?: boolean;
  className?: string;
  children?: ReactNode;
}

export function PhasePill({ phase, href, label, isActive = false, className = '', children }: PhasePillProps) {
  // BloomEngine Funnel Nav Button Styles.
  // Light: ink text and a navy hairline at rest, the phase hue only on the
  // active pill and on hover — four coloured labels in a row read as noise on
  // white. Dark keeps the tinted, glowing pills.
  const getButtonClasses = () => {
    const baseClasses = 'px-4 py-2 rounded-xl font-semibold text-sm transition-all border bg-opacity-10 focus:outline-none focus:ring-2';
    
    switch (phase) {
      case 'research':
        return `${baseClasses} ${
          isActive 
            ? 'text-blue-800 dark:text-blue-200 border-blue-600/60 dark:border-blue-500/70 bg-blue-500/[0.12] dark:bg-blue-500/18' 
            : 'text-slate-700 dark:text-blue-200 border-[#1e3a8a]/15 dark:border-blue-500/50 bg-transparent dark:bg-blue-500/10 hover:text-blue-800 dark:hover:text-blue-200 hover:bg-blue-500/10 dark:hover:bg-blue-500/18 hover:border-blue-500/50 dark:hover:border-blue-400/70 dark:hover:shadow-[0_0_18px_rgba(59,130,246,0.35)]'
        } focus:ring-blue-400/40`;
      
      case 'vetting':
        return `${baseClasses} ${
          isActive 
            ? 'text-cyan-800 dark:text-cyan-200 border-cyan-600/60 dark:border-cyan-500/70 bg-cyan-500/[0.12] dark:bg-cyan-500/18' 
            : 'text-slate-700 dark:text-cyan-200 border-[#1e3a8a]/15 dark:border-cyan-500/50 bg-transparent dark:bg-cyan-500/10 hover:text-cyan-800 dark:hover:text-cyan-200 hover:bg-cyan-500/10 dark:hover:bg-cyan-500/18 hover:border-cyan-500/50 dark:hover:border-cyan-400/70 dark:hover:shadow-[0_0_18px_rgba(34,162,184,0.35)]'
        } focus:ring-cyan-400/40`;
      
      case 'offer':
        return `${baseClasses} ${
          isActive 
            ? 'text-emerald-800 dark:text-emerald-200 border-emerald-600/60 dark:border-emerald-500/65 bg-emerald-500/[0.12] dark:bg-emerald-500/18' 
            : 'text-slate-700 dark:text-emerald-200 border-[#1e3a8a]/15 dark:border-emerald-500/45 bg-transparent dark:bg-emerald-500/10 hover:text-emerald-800 dark:hover:text-emerald-200 hover:bg-emerald-500/10 dark:hover:bg-emerald-500/18 hover:border-emerald-500/50 dark:hover:border-emerald-400/70 dark:hover:shadow-[0_0_18px_rgba(24,183,154,0.32)]'
        } focus:ring-emerald-400/40`;
      
      case 'sourcing':
        return `${baseClasses} ${
          isActive 
            ? 'text-teal-800 dark:text-teal-200 border-teal-600/60 dark:border-teal-500/65 bg-teal-500/[0.12] dark:bg-teal-500/18' 
            : 'text-slate-700 dark:text-teal-200 border-[#1e3a8a]/15 dark:border-teal-500/45 bg-transparent dark:bg-teal-500/10 hover:text-teal-800 dark:hover:text-teal-200 hover:bg-teal-500/10 dark:hover:bg-teal-500/18 hover:border-teal-500/50 dark:hover:border-teal-400/70 dark:hover:shadow-[0_0_18px_rgba(20,184,166,0.32)]'
        } focus:ring-teal-400/40`;
      
      default:
        return baseClasses;
    }
  };

  return (
    <Link
      href={href}
      className={`${getButtonClasses()} ${className}`}
    >
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label[0]}</span>
      {children}
    </Link>
  );
}

