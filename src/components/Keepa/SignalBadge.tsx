import React from 'react';
import { getStatusTone, type StatusCategory, type StatusTone } from '@/lib/keepa/uiStatus';

interface SignalBadgeProps {
  label?: string | null;
  category?: StatusCategory;
  compact?: boolean;
  className?: string;
  toneOverride?: StatusTone;
}

const toneClasses: Record<string, string> = {
  positive: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  neutral: 'border-slate-600/60 bg-slate-800/50 text-slate-200',
  caution: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
  negative: 'border-rose-400/30 bg-rose-500/10 text-rose-200'
};

const SignalBadge: React.FC<SignalBadgeProps> = ({
  label,
  category = 'generic',
  compact = false,
  className,
  toneOverride
}) => {
  const resolvedLabel = label?.toString().trim() || 'N/A';
  const tone = toneOverride ?? getStatusTone(resolvedLabel, category);
  const sizeClasses = compact ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold leading-tight ${sizeClasses} ${toneClasses[tone]} ${className || ''}`}
    >
      {resolvedLabel}
    </span>
  );
};

export default SignalBadge;
