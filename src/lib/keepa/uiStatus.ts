export type StatusTone = 'positive' | 'neutral' | 'caution' | 'negative';

export type StatusCategory =
  | 'seasonality'
  | 'pricing'
  | 'discount'
  | 'demand'
  | 'stockout'
  | 'trend'
  | 'generic';

const normalizeLabel = (label?: string | null) => (label ?? '').toString().trim().toLowerCase();

const isUnknownLabel = (label: string) =>
  !label || label === 'n/a' || label === 'na' || label === 'unknown' || label === 'not enough history';

export const getStatusTone = (label?: string | null, category: StatusCategory = 'generic'): StatusTone => {
  const normalized = normalizeLabel(label);
  if (isUnknownLabel(normalized)) return 'neutral';

  switch (category) {
    case 'seasonality':
      if (normalized === 'high') return 'caution';
      if (normalized === 'medium') return 'neutral';
      if (normalized === 'low') return 'positive';
      return 'neutral';
    case 'pricing':
      if (normalized === 'stable') return 'positive';
      if (normalized === 'moderate') return 'caution';
      if (normalized === 'volatile') return 'negative';
      return 'neutral';
    case 'discount':
      if (normalized === 'low') return 'positive';
      if (normalized === 'medium') return 'caution';
      if (normalized === 'high') return 'negative';
      return 'neutral';
    case 'demand':
      if (normalized === 'stable') return 'positive';
      if (normalized === 'unstable') return 'caution';
      return 'neutral';
    case 'stockout':
      if (normalized === 'none detected') return 'neutral';
      if (normalized === 'low') return 'positive';
      if (normalized === 'medium') return 'caution';
      if (normalized === 'high') return 'negative';
      return 'neutral';
    case 'trend':
      if (normalized === 'improving') return 'positive';
      if (normalized === 'flat') return 'neutral';
      if (normalized === 'declining') return 'negative';
      return 'neutral';
    default:
      if (normalized === 'low') return 'positive';
      if (normalized === 'medium') return 'caution';
      if (normalized === 'high') return 'negative';
      if (normalized === 'stable') return 'positive';
      if (normalized === 'moderate') return 'caution';
      if (normalized === 'volatile') return 'negative';
      if (normalized === 'unstable') return 'caution';
      if (normalized === 'improving') return 'positive';
      if (normalized === 'flat') return 'neutral';
      if (normalized === 'declining') return 'negative';
      if (normalized === 'none detected') return 'neutral';
      return 'neutral';
  }
};
