'use client';

import React from 'react';
import { PhaseType, getPhaseGradient, PHASES, getPhaseKey } from '@/utils/phaseStyles';

interface LightsaberUnderlineProps {
  phase?: PhaseType;
  className?: string;
  width?: string; // e.g., '320px' or '100%'
}

/**
 * Part F: LightsaberUnderline Component
 * A thin glowing underline with gradient bloom effect
 */
export function LightsaberUnderline({ phase, className = '', width = '320px' }: LightsaberUnderlineProps) {
  if (!phase) {
    // Default neutral underline
    return (
      <div 
        className={`h-[3px] ${className}`}
        style={{ width, maxWidth: '100%' }}
      >
        <div className="h-full bg-gradient-to-r from-slate-500/50 via-slate-500/30 to-slate-500/50 opacity-90" />
        <div className="h-full bg-gradient-to-r from-slate-500/50 via-slate-500/30 to-slate-500/50 blur-[10px] opacity-35 -mt-[3px]" />
      </div>
    );
  }

  const phaseKey = getPhaseKey(phase);
  const tokens = PHASES[phaseKey];
  const gradient = getPhaseGradient(phase);

  return (
    <div 
      className={`h-[3px] relative ${className}`}
      style={{ width, maxWidth: '100%' }}
    >
      {/* Core beam (sharp) */}
      <div 
        className={`h-full bg-gradient-to-r ${gradient} opacity-90`}
        style={{
          filter: `drop-shadow(0 0 4px ${tokens.glow})`,
        }}
      />
      {/* Bloom layer (blur) */}
      <div 
        className={`h-full bg-gradient-to-r ${gradient} blur-[10px] opacity-35 -mt-[3px] absolute top-0 left-0 right-0`}
      />
    </div>
  );
}
