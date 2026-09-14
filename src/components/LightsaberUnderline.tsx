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
 *
 * Light mode runs the hue a step deeper (600 core, 500 bloom) — the 400s that
 * glow on navy disappear on white.
 */
const BEAM: Record<PhaseType, { core: string; bloom: string }> = {
  research: {
    core: 'from-blue-600 via-blue-500/55 to-blue-500/0 dark:from-blue-400 dark:via-blue-400/55 dark:to-blue-400/0',
    bloom:
      'from-blue-500/40 via-blue-500/10 to-transparent dark:from-blue-400/50 dark:via-blue-400/15 dark:to-transparent',
  },
  vetting: {
    core: 'from-cyan-600 via-cyan-500/55 to-cyan-500/0 dark:from-cyan-400 dark:via-cyan-400/55 dark:to-cyan-400/0',
    bloom:
      'from-cyan-500/40 via-cyan-500/10 to-transparent dark:from-cyan-400/50 dark:via-cyan-400/15 dark:to-transparent',
  },
  offer: {
    core: 'from-emerald-600 via-emerald-500/55 to-emerald-500/0 dark:from-emerald-400 dark:via-emerald-400/55 dark:to-emerald-400/0',
    bloom:
      'from-emerald-500/40 via-emerald-500/10 to-transparent dark:from-emerald-400/50 dark:via-emerald-400/15 dark:to-transparent',
  },
  sourcing: {
    core: 'from-teal-600 via-teal-500/55 to-teal-500/0 dark:from-teal-400 dark:via-teal-400/55 dark:to-teal-400/0',
    bloom:
      'from-teal-500/40 via-teal-500/10 to-transparent dark:from-teal-400/50 dark:via-teal-400/15 dark:to-transparent',
  },
};

export function LightsaberUnderline({ phase, className = '', width = '480px' }: LightsaberUnderlineProps) {
  const style = { width: `min(${width}, calc(100vw - 3rem))` };

  if (!phase) {
    return (
      <div className={`relative h-[2px] ${className}`} style={style}>
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-slate-500/70 via-slate-500/30 to-transparent dark:from-slate-400/70 dark:via-slate-400/30" />
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
