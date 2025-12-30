'use client';

import { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  className?: string;
  valueClassName?: string;
  iconClassName?: string;
}

export function StatTile({ label, value, icon, className = '', valueClassName = '', iconClassName = 'text-slate-400' }: StatTileProps) {
  // If valueClassName is provided, use it (it should include color); otherwise default to white
  const valueClasses = valueClassName 
    ? `text-xl font-bold ${valueClassName}`
    : 'text-xl font-bold text-white';
  
  return (
    <div className={`bg-slate-800/60 rounded-lg border border-slate-700/50 p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon && <div className={iconClassName}>{icon}</div>}
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className={valueClasses}>
        {value}
      </div>
    </div>
  );
}

