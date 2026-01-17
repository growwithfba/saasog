'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Loader2, Pencil, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import type { RootState } from '@/store';
import { clearDisplayTitle, setDisplayTitle } from '@/store/productTitlesSlice';
import { getPhaseButtonClasses, getPhaseHeaderGlowClasses, getPhaseTokens, type PhaseType } from '@/utils/phaseTokens';

export type ProductHeaderStage = 'research' | 'vetting' | 'offer' | 'sourcing' | 'success';

export type ProductHeaderTone = 'slate' | 'emerald' | 'amber' | 'red' | 'blue';

export type ProductHeaderNavButton =
  | {
      label: string;
      href: string;
      onClick?: never;
      stage: ProductHeaderStage;
      disabled?: boolean;
      loading?: boolean;
    }
  | {
      label: string;
      href?: never;
      onClick: () => void;
      stage: ProductHeaderStage;
      disabled?: boolean;
      loading?: boolean;
    };

export type ProductHeaderBarProps = {
  productId?: string; // optional (we primarily key by ASIN)
  asin: string;
  currentDisplayTitle: string; // renamed title if present, else original Amazon title
  originalTitle?: string;
  leftButton: ProductHeaderNavButton;
  rightButton: ProductHeaderNavButton;
  badgeLabel?: string | null;
  badgeTone?: ProductHeaderTone;
  currentPhase?: PhaseType; // Current phase for container glow styling
};

/**
 * Get button classes for a stage, using phase tokens when available
 * Falls back to legacy styling for 'success' stage
 */
function stageButtonClasses(stage: ProductHeaderStage): string {
  // Use phase tokens for standard phases
  if (stage === 'research' || stage === 'vetting' || stage === 'offer' || stage === 'sourcing') {
    return getPhaseButtonClasses(stage as PhaseType, false);
  }
  
  // Fallback for 'success' stage (not a standard phase)
  if (stage === 'success') {
    return "text-white bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 border-b-emerald-400 border-r-emerald-400 shadow-2xl shadow-emerald-500/25 focus-visible:ring-emerald-300/60 before:from-emerald-500 before:to-green-500";
  }
  
  // Default fallback
  return "text-white bg-slate-700 hover:bg-slate-600 border-b-slate-500 border-r-slate-500 shadow-lg shadow-slate-900/30 focus-visible:ring-slate-300/40 before:from-slate-600 before:to-slate-600";
}

function badgeClasses(tone: ProductHeaderTone) {
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

function sanitizeTitle(input: string) {
  const trimmed = (input || '').trim();
  const maxLen = 80;
  const clipped = trimmed.length > maxLen ? trimmed.slice(0, maxLen).trim() : trimmed;
  return clipped;
}

function NavButton({ kind, config }: { kind: 'left' | 'right'; config: ProductHeaderNavButton }) {
  const disabled = !!config.disabled || !!config.loading;
  const baseClasses = stageButtonClasses(config.stage);
  
  // For phase-based buttons, add decorative glow elements similar to PhasePill
  const isPhaseButton = config.stage === 'research' || config.stage === 'vetting' || config.stage === 'offer' || config.stage === 'sourcing';
  
  const base = `${baseClasses} inline-flex items-center gap-2 ${kind === 'right' ? 'justify-self-end' : ''}`;

  const icon = kind === 'left' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />;
  const content = (
    <>
      {config.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      <span className="whitespace-nowrap relative z-10">{config.label}</span>
    </>
  );

  if ('href' in config) {
    return (
      <Link
        href={config.href}
        aria-disabled={disabled}
        className={`${base} ${disabled ? 'opacity-50 pointer-events-none' : ''} group`}
      >
        {isPhaseButton && (
          <>
            {/* Decorative glow elements matching PhasePill style */}
            <div className="absolute top-0 right-0 w-20 h-20 bg-current rounded-full blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-10 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-12 h-12 bg-current rounded-full blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-5 pointer-events-none" />
          </>
        )}
        {content}
      </Link>
    );
  }

  return (
    <button
      onClick={config.onClick}
      disabled={disabled}
      className={`${base} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} group`}
    >
      {isPhaseButton && (
        <>
          {/* Decorative glow elements matching PhasePill style */}
          <div className="absolute top-0 right-0 w-20 h-20 bg-current rounded-full blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-12 h-12 bg-current rounded-full blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-5 pointer-events-none" />
        </>
      )}
      {content}
    </button>
  );
}

export function ProductHeaderBar({
  asin,
  currentDisplayTitle,
  originalTitle,
  leftButton,
  rightButton,
  badgeLabel,
  badgeTone = 'slate',
  productId,
  currentPhase,
}: ProductHeaderBarProps) {
  const dispatch = useDispatch();
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);

  const storedTitle = titleByAsin?.[asin];
  const resolvedTitle = storedTitle || currentDisplayTitle || 'Untitled Product';

  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(resolvedTitle);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isEditing) setDraftTitle(resolvedTitle);
  }, [resolvedTitle, isEditing]);

  useEffect(() => {
    if (isEditing) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    return;
  }, [isEditing]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const amazonUrl = useMemo(() => `https://www.amazon.com/dp/${encodeURIComponent(asin)}`, [asin]);

  const commitRename = async () => {
    const next = sanitizeTitle(draftTitle);
    if (!next) {
      setToast({ kind: 'error', message: 'Title cannot be empty.' });
      setDraftTitle(resolvedTitle);
      setIsEditing(false);
      return;
    }

    if (next === resolvedTitle) {
      setIsEditing(false);
      return;
    }

    const prevStored = storedTitle;
    dispatch(setDisplayTitle({ asin, title: next }));

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/products/display-title', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        credentials: 'include',
        body: JSON.stringify({ id: productId, displayTitle: next, originalTitle }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to save (HTTP ${res.status})`);
      }

      const saved = sanitizeTitle(data.displayTitle || next);
      dispatch(setDisplayTitle({ asin, title: saved }));
      setToast({ kind: 'success', message: 'Saved.' });
      setIsEditing(false);
    } catch (e) {
      if (prevStored) dispatch(setDisplayTitle({ asin, title: prevStored }));
      else dispatch(clearDisplayTitle({ asin }));
      setToast({ kind: 'error', message: e instanceof Error ? e.message : 'Failed to save title.' });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const cancelRename = () => {
    setDraftTitle(resolvedTitle);
    setIsEditing(false);
  };

  // Get phase-based container glow classes if currentPhase is provided
  const containerGlowClasses = currentPhase 
    ? getPhaseHeaderGlowClasses(currentPhase)
    : 'border-gray-200 dark:border-slate-700/50';
  
  // Get phase tokens for glow effect
  const phaseTokens = currentPhase ? getPhaseTokens(currentPhase) : null;

  return (
    <>
      <div className={`bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border ${containerGlowClasses} p-6 mb-6 relative overflow-hidden`}>
        {/* Subtle phase glow effect on container */}
        {phaseTokens && (
          <>
            <div className={`absolute top-0 right-0 w-40 h-40 ${phaseTokens.glowColor} rounded-full blur-3xl opacity-30 pointer-events-none`} />
            <div className={`absolute bottom-0 left-0 w-32 h-32 ${phaseTokens.glowColor} rounded-full blur-3xl opacity-20 pointer-events-none`} />
          </>
        )}
        {/* Row 1 */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="justify-self-start">
            <NavButton kind="left" config={leftButton} />
          </div>

          <div className="min-w-0">
            {!isEditing ? (
              <div className="flex items-center justify-center gap-3 min-w-0">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white truncate max-w-[min(720px,75vw)] text-center">
                  {resolvedTitle}
                </h2>
                {badgeLabel ? (
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${badgeClasses(badgeTone)}`}>
                    {badgeLabel}
                  </span>
                ) : null}
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 rounded-lg bg-gray-200 dark:bg-slate-700/40 hover:bg-gray-300 dark:hover:bg-slate-700/60 text-gray-700 dark:text-slate-200 transition-colors"
                  title="Rename"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 min-w-0">
                <input
                  ref={inputRef}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') cancelRename();
                  }}
                  onBlur={() => commitRename()}
                  disabled={saving}
                  maxLength={80}
                  className="w-[min(720px,75vw)] bg-white dark:bg-slate-900/40 border border-gray-300 dark:border-slate-600/50 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white text-center text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 disabled:opacity-60"
                />
                {saving ? <Loader2 className="w-5 h-5 text-gray-600 dark:text-slate-300 animate-spin" /> : null}
              </div>
            )}
          </div>

          <div className="justify-self-end">
            <NavButton kind="right" config={rightButton} />
          </div>
        </div>

        {/* Row 2 */}
        <div className="mt-3 flex items-center justify-center">
          <p className="text-gray-600 dark:text-slate-400 text-sm">
            <span className="text-gray-500 dark:text-slate-500">Original ASIN:</span>{' '}
            <a href={amazonUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
              {asin}
            </a>
          </p>
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 border ${
              toast.kind === 'success'
                ? 'bg-emerald-600/90 text-white border-emerald-400/30'
                : 'bg-red-800/90 text-white border-red-400/30'
            }`}
          >
            {toast.kind === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <p className="font-medium">{toast.message}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}


