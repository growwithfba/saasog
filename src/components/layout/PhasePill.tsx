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
  // BloomEngine Funnel Nav Button Styles
  const getButtonClasses = () => {
    const baseClasses = 'px-4 py-2 rounded-xl font-semibold text-sm transition-all border bg-opacity-10 focus:outline-none focus:ring-2';
    
    switch (phase) {
      case 'research':
        return `${baseClasses} ${
          isActive 
            ? 'text-blue-200 border-blue-500/70 bg-blue-500/18' 
            : 'text-blue-200 border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/18 hover:border-blue-400/70 hover:shadow-[0_0_18px_rgba(59,130,246,0.35)]'
        } focus:ring-blue-400/40`;
      
      case 'vetting':
        return `${baseClasses} ${
          isActive 
            ? 'text-cyan-200 border-cyan-500/70 bg-cyan-500/18' 
            : 'text-cyan-200 border-cyan-500/50 bg-cyan-500/10 hover:bg-cyan-500/18 hover:border-cyan-400/70 hover:shadow-[0_0_18px_rgba(34,162,184,0.35)]'
        } focus:ring-cyan-400/40`;
      
      case 'offer':
        return `${baseClasses} ${
          isActive 
            ? 'text-emerald-200 border-emerald-500/65 bg-emerald-500/18' 
            : 'text-emerald-200 border-emerald-500/45 bg-emerald-500/10 hover:bg-emerald-500/18 hover:border-emerald-400/70 hover:shadow-[0_0_18px_rgba(24,183,154,0.32)]'
        } focus:ring-emerald-400/40`;
      
      case 'sourcing':
        return `${baseClasses} ${
          isActive 
            ? 'text-lime-200 border-lime-500/65 bg-lime-500/18' 
            : 'text-lime-200 border-lime-500/45 bg-lime-500/10 hover:bg-lime-500/18 hover:border-lime-400/70 hover:shadow-[0_0_18px_rgba(46,232,0,0.28)]'
        } focus:ring-lime-400/40`;
      
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

