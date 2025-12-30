'use client';

import { ReactNode } from 'react';

interface InfoRowProps {
  label: string;
  value: string | number | ReactNode;
  icon?: ReactNode;
  helperText?: string;
  className?: string;
}

export function InfoRow({ label, value, icon, helperText, className = '' }: InfoRowProps) {
  return (
    <div className={`flex items-start justify-between py-2.5 border-b border-slate-700/30 last:border-b-0 ${className}`}>
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        {icon && <div className="text-slate-400 flex-shrink-0">{icon}</div>}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-300">{label}</div>
          {helperText && (
            <div className="text-xs text-slate-500 mt-0.5">{helperText}</div>
          )}
        </div>
      </div>
      <div className="text-sm font-semibold text-white text-right ml-4 flex-shrink-0">
        {value}
      </div>
    </div>
  );
}

