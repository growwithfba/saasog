'use client';

import React from 'react';
import { PhaseType, PHASES, getPhaseKey } from '@/utils/phaseStyles';

interface LightsaberUnderlineProps {
  phase?: PhaseType;
  className?: string;
  /** Length of the beam, e.g. '480px' or '100%'. */
  width?: string;
}

/**
 * The beam under a page title — the loudest line on the page.
 *
 * Same language as the header rule and the section rules: lit in the phase
 * hue at the left, dimming along its length, with a bloom over the lit part.
 * Heavier than a section rule (2px core, wider bloom) so the hierarchy holds:
 * header rule → page title beam → section rule.
 *
 * Not clamped to its parent's width: a title block that shrink-wraps its text
 * would otherwise cut the beam at the last letter. It is capped to the
 * viewport instead so it never overflows a phone.
 */
const BEAM: Record<PhaseType, { core: string; bloom: string }> = {
  research: {
    core: 'from-blue-400 via-blue-400/55 to-blue-400/0',
    bloom: 'from-blue-400/50 via-blue-400/15 to-transparent',
  },
  vetting: {
    core: 'from-cyan-400 via-cyan-400/55 to-cyan-400/0',
    bloom: 'from-cyan-400/50 via-cyan-400/15 to-transparent',
  },
  offer: {
    core: 'from-emerald-400 via-emerald-400/55 to-emerald-400/0',
    bloom: 'from-emerald-400/50 via-emerald-400/15 to-transparent',
  },
  sourcing: {
    core: 'from-teal-400 via-teal-400/55 to-teal-400/0',
    bloom: 'from-teal-400/50 via-teal-400/15 to-transparent',
  },
};

export function LightsaberUnderline({ phase, className = '', width = '480px' }: LightsaberUnderlineProps) {
  const style = { width: `min(${width}, calc(100vw - 3rem))` };

  if (!phase) {
    return (
      <div className={`relative h-[2px] ${className}`} style={style}>
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-slate-400/70 via-slate-400/30 to-transparent" />
      </div>
    );
  }

  const beam = BEAM[phase];
  const glow = PHASES[getPhaseKey(phase)].glow;

  return (
    <div className={`relative h-[2px] ${className}`} style={style}>
      {/* Core beam */}
      <div
        className={`absolute inset-0 rounded-full bg-gradient-to-r ${beam.core}`}
        style={{ filter: `drop-shadow(0 0 4px ${glow})` }}
      />
      {/* Bloom over the lit part */}
      <div
        className={`absolute inset-x-0 -top-[2px] h-[6px] rounded-full blur-[4px] bg-gradient-to-r ${beam.bloom}`}
      />
    </div>
  );
}
