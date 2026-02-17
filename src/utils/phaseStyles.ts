/**
 * Shared phase styling utilities
 * Reuses the same phase tokens/classes as PhasePill for consistency
 * 
 * Part A: Phase Design Tokens (single source of truth)
 * BloomEngine spectrum colors:
 * - Research → Blue #3b82f6 (glow rgba(59,130,246,0.38))
 * - Vetting → Cyan/Teal #22a2b8 (glow rgba(34,162,184,0.38))
 * - Offering → Emerald #18b79a (glow rgba(24,183,154,0.34))
 * - Sourcing → Lime #2ee800 (glow rgba(46,232,0,0.28))
 */

export type PhaseKey = 'research' | 'vetting' | 'offering' | 'sourcing';
export type PhaseType = 'research' | 'vetting' | 'offer' | 'sourcing'; // Keep 'offer' for backward compatibility
export type PhaseState = 'completed' | 'active' | 'inactive';

interface PhaseStyles {
  borderColor: string;
  bgColor: string;
  glowColor: string;
  textColor: string;
  shadowColor: string;
}

/**
 * Part A: Phase Design Tokens (single source of truth)
 * Central palette for all phase-related UI elements
 */
export interface PhaseTokens {
  label: string;
  glow: string; // CSS rgba value for glow effects
  ring: string; // Tailwind ring color class
  border: string; // Tailwind border color class
  bg: string; // Tailwind background color class
  text: string; // Tailwind text color class
}

export const PHASES: Record<PhaseKey, PhaseTokens> = {
  research: {
    label: 'Research',
    glow: 'rgba(59,130,246,0.38)',
    ring: 'ring-blue-500/50',
    border: 'border-blue-500/50',
    bg: 'bg-blue-500/10',
    text: 'text-blue-500',
  },
  vetting: {
    label: 'Vetting',
    glow: 'rgba(34,162,184,0.38)',
    ring: 'ring-cyan-500/50',
    border: 'border-cyan-500/50',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-500',
  },
  offering: {
    label: 'Offering',
    glow: 'rgba(24,183,154,0.34)',
    ring: 'ring-emerald-500/50',
    border: 'border-emerald-500/50',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-500',
  },
  sourcing: {
    label: 'Sourcing',
    glow: 'rgba(46,232,0,0.28)',
    ring: 'ring-lime-500/50',
    border: 'border-lime-500/50',
    bg: 'bg-lime-500/10',
    text: 'text-lime-500',
  },
};

// Helper to convert 'offer' to 'offering' for token lookup
export function getPhaseKey(phase: PhaseType): PhaseKey {
  return phase === 'offer' ? 'offering' : phase;
}

const phaseConfig = {
  research: {
    completed: {
      borderColor: 'border-emerald-500/50',
      bgColor: 'bg-emerald-500/10',
      glowColor: 'bg-emerald-500/10',
      textColor: 'text-emerald-300',
      shadowColor: 'shadow-lg shadow-emerald-500/15',
    },
    active: {
      borderColor: 'border-emerald-500/70',
      bgColor: 'bg-emerald-500/15',
      glowColor: 'bg-emerald-500/15',
      textColor: 'text-emerald-200',
      shadowColor: 'shadow-xl shadow-emerald-500/25',
    },
    inactive: {
      borderColor: 'border-slate-600/30',
      bgColor: 'bg-slate-800/20',
      glowColor: 'bg-slate-500/5',
      textColor: 'text-slate-500',
      shadowColor: 'shadow-sm shadow-slate-900/10',
    },
  },
  vetting: {
    completed: {
      borderColor: 'border-amber-500/50',
      bgColor: 'bg-amber-500/10',
      glowColor: 'bg-amber-500/10',
      textColor: 'text-amber-300',
      shadowColor: 'shadow-lg shadow-amber-500/15',
    },
    active: {
      borderColor: 'border-amber-500/70',
      bgColor: 'bg-amber-500/15',
      glowColor: 'bg-amber-500/15',
      textColor: 'text-amber-200',
      shadowColor: 'shadow-xl shadow-amber-500/25',
    },
    inactive: {
      borderColor: 'border-slate-600/30',
      bgColor: 'bg-slate-800/20',
      glowColor: 'bg-slate-500/5',
      textColor: 'text-slate-500',
      shadowColor: 'shadow-sm shadow-slate-900/10',
    },
  },
  offer: {
    completed: {
      borderColor: 'border-orange-500/50',
      bgColor: 'bg-orange-500/10',
      glowColor: 'bg-orange-500/10',
      textColor: 'text-orange-300',
      shadowColor: 'shadow-lg shadow-orange-500/15',
    },
    active: {
      borderColor: 'border-orange-500/70',
      bgColor: 'bg-orange-500/15',
      glowColor: 'bg-orange-500/15',
      textColor: 'text-orange-200',
      shadowColor: 'shadow-xl shadow-orange-500/25',
    },
    inactive: {
      borderColor: 'border-slate-600/30',
      bgColor: 'bg-slate-800/20',
      glowColor: 'bg-slate-500/5',
      textColor: 'text-slate-500',
      shadowColor: 'shadow-sm shadow-slate-900/10',
    },
  },
  sourcing: {
    completed: {
      borderColor: 'border-blue-500/50',
      bgColor: 'bg-blue-500/10',
      glowColor: 'bg-blue-500/10',
      textColor: 'text-blue-300',
      shadowColor: 'shadow-lg shadow-blue-500/15',
    },
    active: {
      borderColor: 'border-blue-500/70',
      bgColor: 'bg-blue-500/15',
      glowColor: 'bg-blue-500/15',
      textColor: 'text-blue-200',
      shadowColor: 'shadow-xl shadow-blue-500/25',
    },
    inactive: {
      borderColor: 'border-slate-600/30',
      bgColor: 'bg-slate-800/20',
      glowColor: 'bg-slate-500/5',
      textColor: 'text-slate-500',
      shadowColor: 'shadow-sm shadow-slate-900/10',
    },
  },
};

/**
 * Get phase styles based on phase type and state
 */
export function getPhaseStyles(phase: PhaseType, state: PhaseState): PhaseStyles {
  return phaseConfig[phase][state];
}

/**
 * Get phase border color for title underlines
 */
export function getPhaseBorderColor(phase: PhaseType): string {
  switch (phase) {
    case 'research':
      return 'border-emerald-500/70';
    case 'vetting':
      return 'border-amber-500/70';
    case 'offer':
      return 'border-orange-500/70';
    case 'sourcing':
      return 'border-blue-500/70';
    default:
      return 'border-slate-500/50';
  }
}

/**
 * Get phase gradient for title underlines (premium glow style)
 * Updated to use new BloomEngine spectrum
 */
export function getPhaseGradient(phase: PhaseType): string {
  switch (phase) {
    case 'research':
      return 'from-blue-500/90 via-blue-400/60 to-blue-500/90';
    case 'vetting':
      return 'from-cyan-500/90 via-teal-400/60 to-cyan-500/90';
    case 'offer':
      return 'from-emerald-500/90 via-emerald-400/60 to-emerald-500/90';
    case 'sourcing':
      return 'from-lime-500/90 via-lime-400/60 to-lime-500/90';
    default:
      return 'from-slate-500/50 via-slate-500/30 to-slate-500/50';
  }
}

/**
 * Part B & C: Helper functions for reached/unreached visual rules
 */

/**
 * Get badge classes for reached/unreached states
 */
export function progressBadgeClass(phase: PhaseType, reached: boolean): string {
  const phaseKey = getPhaseKey(phase);
  const tokens = PHASES[phaseKey];
  
  if (reached) {
    // Reached: subtle tinted background, semi border, full opacity
    return `${tokens.bg} ${tokens.border} border-opacity-50`;
  } else {
    // Unreached: greyed out, muted, grayscale
    return 'bg-white/4 border-white/8 opacity-55 grayscale';
  }
}

/**
 * Get glow style for reached badges
 */
export function progressBadgeGlowStyle(phase: PhaseType, reached: boolean): React.CSSProperties {
  if (!reached) {
    return {}; // No glow for unreached
  }
  
  const phaseKey = getPhaseKey(phase);
  const tokens = PHASES[phaseKey];
  
  return {
    '--glow': tokens.glow,
    boxShadow: `0 0 18px var(--glow)`,
  } as React.CSSProperties;
}

/**
 * Get header number classes for reached/unreached states
 */
export function headerNumberClass(phase: PhaseType, reached: boolean): string {
  if (!reached) {
    return 'text-white/35';
  }
  
  const phaseKey = getPhaseKey(phase);
  const tokens = PHASES[phaseKey];
  
  return tokens.text;
}

/**
 * Get header number glow style
 */
export function headerNumberGlowStyle(phase: PhaseType, reached: boolean): React.CSSProperties {
  if (!reached) {
    return {}; // No glow for unreached
  }
  
  const phaseKey = getPhaseKey(phase);
  const tokens = PHASES[phaseKey];
  
  return {
    '--glow': tokens.glow,
    filter: `drop-shadow(0 0 10px var(--glow))`,
  } as React.CSSProperties;
}

