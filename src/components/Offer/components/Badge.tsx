'use client';

interface BadgeProps {
  label: string;
  variant?: 'default' | 'strong' | 'decent' | 'weak' | 'pass' | 'risky' | 'fail' | 'info';
  className?: string;
}

export function Badge({ label, variant = 'default', className = '' }: BadgeProps) {
  const variantStyles = {
    default: 'bg-slate-700/50 text-slate-300 border-slate-600/50',
    strong: 'bg-red-900/30 text-red-400 border-red-500/30',
    decent: 'bg-amber-900/30 text-amber-400 border-amber-500/30',
    weak: 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30',
    pass: 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30',
    risky: 'bg-amber-900/30 text-amber-400 border-amber-500/30',
    fail: 'bg-red-900/30 text-red-400 border-red-500/30',
    info: 'bg-blue-900/30 text-blue-400 border-blue-500/30',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${variantStyles[variant]} ${className}`}>
      {label}
    </span>
  );
}

