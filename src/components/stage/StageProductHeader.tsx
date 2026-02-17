'use client';

import Link from 'next/link';
import React from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

export type StageHeaderTone = 'slate' | 'emerald' | 'amber' | 'red' | 'blue';

export type StageHeaderAction =
  | {
      label: string;
      href: string;
      onClick?: never;
      disabled?: boolean;
      loading?: boolean;
    }
  | {
      label: string;
      href?: never;
      onClick: () => void;
      disabled?: boolean;
      loading?: boolean;
    };

export type StageProductHeaderProps = {
  productName: string;
  asin: string;
  badgeLabel?: string | null;
  badgeTone?: StageHeaderTone;
  leftAction: StageHeaderAction;
  rightAction: StageHeaderAction;
};

function toneClasses(tone: StageHeaderTone): string {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    case 'amber':
      return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    case 'red':
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    case 'blue':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'slate':
    default:
      return 'bg-slate-500/10 text-slate-300 border-slate-500/20';
  }
}

function ActionButton({
  kind,
  action,
}: {
  kind: 'left' | 'right';
  action: StageHeaderAction;
}) {
  const shared =
    kind === 'right'
      ? 'px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white'
      : 'px-4 py-2.5 bg-slate-700/50 hover:bg-slate-700 text-white';

  const disabled = !!action.disabled || !!action.loading;
  const icon =
    kind === 'right' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />;

  const content = (
    <>
      {action.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      <span>{action.label}</span>
    </>
  );

  if ('href' in action) {
    return (
      <Link
        href={action.href}
        aria-disabled={disabled}
        className={`${shared} rounded-lg font-medium transition-colors inline-flex items-center gap-2 ${
          disabled ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      onClick={action.onClick}
      disabled={disabled}
      className={`${shared} rounded-lg font-medium transition-colors inline-flex items-center gap-2 ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      {content}
    </button>
  );
}

export function StageProductHeader({
  productName,
  asin,
  badgeLabel,
  badgeTone = 'slate',
  leftAction,
  rightAction,
}: StageProductHeaderProps) {
  return (
    <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 mb-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-white truncate">{productName}</h2>
            {badgeLabel ? (
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${toneClasses(badgeTone)}`}>
                {badgeLabel}
              </span>
            ) : null}
          </div>
          <p className="text-slate-400 mt-1">
            <span className="text-slate-500">ASIN:</span> {asin}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ActionButton kind="left" action={leftAction} />
          <ActionButton kind="right" action={rightAction} />
        </div>
      </div>
    </div>
  );
}


