/**
 * Shared phase token utilities
 * Extracted from PhasePill for reuse across components
 * Ensures consistent phase styling (Research/Vetting/Offer/Sourcing)
 */

export type PhaseType = 'research' | 'vetting' | 'offer' | 'sourcing';

export interface PhaseTokenConfig {
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
  borderColor: string;
  borderColorActive: string;
  borderWidth: string;
  borderWidthActive: string;
  shadowColor: string;
  shadowColorActive: string;
  shadowColorHover: string;
  glowColor: string;
  glowColorActive: string;
  textColor: string;
  textColorActive: string;
  ringColor: string;
  ringColorActive: string;
}

/**
 * Phase token configuration matching PhasePill
 * Reduced glow intensity by ~10-15% for premium subtle effect
 */
export const phaseTokens: Record<PhaseType, PhaseTokenConfig> = {
  research: {
    gradientFrom: 'from-blue-900/30',
    gradientVia: 'via-blue-800/20',
    gradientTo: 'to-slate-800/50',
    borderColor: 'border-blue-500/50',
    borderColorActive: 'border-blue-500/70',
    borderWidth: 'border',
    borderWidthActive: 'border-2',
    shadowColor: 'shadow-lg shadow-blue-500/15',
    shadowColorActive: 'shadow-xl shadow-blue-500/25',
    shadowColorHover: 'hover:shadow-xl hover:shadow-blue-500/25',
    glowColor: 'bg-blue-500/10',
    glowColorActive: 'bg-blue-500/15',
    textColor: 'text-blue-300',
    textColorActive: 'text-blue-200',
    ringColor: 'ring-blue-500/40',
    ringColorActive: 'ring-blue-500/60',
  },
  vetting: {
    gradientFrom: 'from-cyan-900/30',
    gradientVia: 'via-teal-800/20',
    gradientTo: 'to-slate-800/50',
    borderColor: 'border-cyan-500/50',
    borderColorActive: 'border-cyan-500/70',
    borderWidth: 'border',
    borderWidthActive: 'border-2',
    shadowColor: 'shadow-lg shadow-cyan-500/15',
    shadowColorActive: 'shadow-xl shadow-cyan-500/25',
    shadowColorHover: 'hover:shadow-xl hover:shadow-cyan-500/25',
    glowColor: 'bg-cyan-500/10',
    glowColorActive: 'bg-cyan-500/15',
    textColor: 'text-cyan-300',
    textColorActive: 'text-cyan-200',
    ringColor: 'ring-cyan-500/40',
    ringColorActive: 'ring-cyan-500/60',
  },
  offer: {
    gradientFrom: 'from-emerald-900/30',
    gradientVia: 'via-emerald-800/20',
    gradientTo: 'to-slate-800/50',
    borderColor: 'border-emerald-500/50',
    borderColorActive: 'border-emerald-500/70',
    borderWidth: 'border',
    borderWidthActive: 'border-2',
    shadowColor: 'shadow-lg shadow-emerald-500/15',
    shadowColorActive: 'shadow-xl shadow-emerald-500/25',
    shadowColorHover: 'hover:shadow-xl hover:shadow-emerald-500/25',
    glowColor: 'bg-emerald-500/10',
    glowColorActive: 'bg-emerald-500/15',
    textColor: 'text-emerald-300',
    textColorActive: 'text-emerald-200',
    ringColor: 'ring-emerald-500/40',
    ringColorActive: 'ring-emerald-500/60',
  },
  sourcing: {
    gradientFrom: 'from-lime-900/30',
    gradientVia: 'via-lime-800/20',
    gradientTo: 'to-slate-800/50',
    borderColor: 'border-lime-500/50',
    borderColorActive: 'border-lime-500/70',
    borderWidth: 'border',
    borderWidthActive: 'border-2',
    shadowColor: 'shadow-lg shadow-lime-500/15',
    shadowColorActive: 'shadow-xl shadow-lime-500/25',
    shadowColorHover: 'hover:shadow-xl hover:shadow-lime-500/25',
    glowColor: 'bg-lime-500/10',
    glowColorActive: 'bg-lime-500/15',
    textColor: 'text-lime-300',
    textColorActive: 'text-lime-200',
    ringColor: 'ring-lime-500/40',
    ringColorActive: 'ring-lime-500/60',
  },
};

/**
 * Get phase tokens for a given phase
 */
export function getPhaseTokens(phase: PhaseType): PhaseTokenConfig {
  return phaseTokens[phase];
}

/**
 * Get container glow classes for product header based on current phase
 * Returns classes for subtle premium glow effect
 */
export function getPhaseHeaderGlowClasses(phase: PhaseType): string {
  const tokens = phaseTokens[phase];
  return [
    tokens.borderColor,
    tokens.shadowColor,
    // Subtle glow effect - reduced intensity for premium look
    'backdrop-blur-xl',
  ].join(' ');
}

/**
 * Get button classes matching PhasePill style for a given phase
 * Returns classes for pill-style buttons with gradient, border, glow
 */
export function getPhaseButtonClasses(phase: PhaseType, isActive: boolean = false): string {
  const tokens = phaseTokens[phase];
  
  return [
    'relative',
    'flex items-center gap-2',
    'px-5 py-2.5',
    'rounded-xl',
    'font-semibold',
    'transition-all duration-300',
    'overflow-hidden',
    'backdrop-blur-sm',
    // Background gradient
    `bg-gradient-to-br ${tokens.gradientFrom} ${tokens.gradientVia} ${tokens.gradientTo}`,
    // Border
    isActive ? tokens.borderWidthActive : tokens.borderWidth,
    isActive ? tokens.borderColorActive : tokens.borderColor,
    // Shadow/glow
    isActive ? tokens.shadowColorActive : tokens.shadowColor,
    // Text color
    isActive ? tokens.textColorActive : tokens.textColor,
    // Hover states
    tokens.shadowColorHover,
    `hover:${tokens.borderColorActive}`,
    `hover:${tokens.borderWidthActive}`,
    'hover:scale-[1.02]',
    'hover:brightness-110',
    // Focus visible for accessibility
    'focus-visible:outline-none',
    `focus-visible:ring-2 ${tokens.ringColorActive}`,
    'focus-visible:ring-offset-2',
    'focus-visible:ring-offset-slate-900',
    // Active state
    isActive && [
      'ring-1',
      tokens.ringColorActive,
      'scale-[1.02]',
      'brightness-110',
    ],
  ].filter(Boolean).join(' ');
}

