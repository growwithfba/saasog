'use client';

import Link from 'next/link';
import {
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Pencil,
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import type { RootState } from '@/store';
import { clearDisplayTitle, setDisplayTitle } from '@/store/productTitlesSlice';
import {
  getPhaseButtonClasses,
  getPhaseHeaderGlowClasses,
  getPhaseTokens,
  type PhaseType,
} from '@/utils/phaseTokens';
import { ListingThumbnail } from '@/components/Product/ListingThumbnail';
import { useListingImages } from '@/hooks/useListingImages';

// Phase 3.3 — unified product header. Replaces ProductHeaderBar across
// /research/[id], /vetting/[asin], /offer/[id], /sourcing/[asin].
//
// Adds two things on top of the previous header:
//   1. A funnel-stage strip in the center (Research → Vetting → Offering
//      → Sourcing). Each chip lights up based on data presence; the
//      current phase is emphasized; lit non-current chips link to the
//      matching detail page.
//   2. A sticky compact mode. The header is always position-sticky
//      below the global AppHeader (top: 64px). An IntersectionObserver
//      sentinel above the header flips a data-sticky attribute when
//      the header becomes pinned — that switches the markup to a slim
//      variant: thumb + name + current-stage pill + primary action.
//
// Sticky-toggle is intentionally an instant render swap, not a CSS
// transition — the IntersectionObserver fires fast enough that animation
// would just feel sluggish.

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

// What the header needs to know about funnel state. Researched is implied
// (you can't be on a detail page for an ASIN that isn't in the funnel),
// so it's not part of the prop — it's always lit.
export type StageState = {
  vetted: boolean;
  offered: boolean;
  sourced: boolean;
};

export type ProductHeaderProps = {
  productId?: string;
  asin: string;
  /** Renamed alias if present, else original Amazon title. */
  currentDisplayTitle: string;
  /** Original Amazon title — passed through to the rename PATCH for forward-compat. */
  originalTitle?: string;
  leftButton: ProductHeaderNavButton;
  rightButton: ProductHeaderNavButton;
  badgeLabel?: string | null;
  badgeTone?: ProductHeaderTone;
  /** Which phase the user is currently viewing — drives chip emphasis. */
  currentPhase: PhaseType;
  /** Funnel data presence per stage. Drives chip lit/unlit. */
  stage: StageState;
  /** Optional inline action rendered in the title row next to the rename pencil (expanded only). */
  extraInlineAction?: ReactNode;
};

// ============ small helpers ============

function stageButtonClasses(stage: ProductHeaderStage): string {
  if (stage === 'research' || stage === 'vetting' || stage === 'offer' || stage === 'sourcing') {
    return getPhaseButtonClasses(stage as PhaseType, false);
  }
  if (stage === 'success') {
    return [
      'relative',
      'flex items-center gap-2',
      'px-5 py-2.5',
      'rounded-xl',
      'font-semibold',
      'transition-all duration-300',
      'overflow-hidden',
      'backdrop-blur-sm',
      'bg-gradient-to-br from-violet-900/30 via-violet-800/20 to-slate-800/50',
      'border border-violet-500/50',
      'shadow-lg shadow-violet-500/15',
      'text-violet-300',
      'hover:shadow-xl hover:shadow-violet-500/25',
      'hover:border-2 hover:border-violet-500/70',
      'hover:scale-[1.02]',
      'hover:brightness-110',
      'focus-visible:outline-none',
      'focus-visible:ring-2 ring-violet-500/60',
      'focus-visible:ring-offset-2',
      'focus-visible:ring-offset-slate-900',
    ].join(' ');
  }
  return 'text-white bg-slate-700 hover:bg-slate-600';
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
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen).trim() : trimmed;
}

// ============ NavButton — left/right action ============

function NavButton({ kind, config, compact = false }: {
  kind: 'left' | 'right';
  config: ProductHeaderNavButton;
  compact?: boolean;
}) {
  const disabled = !!config.disabled || !!config.loading;
  const baseClasses = stageButtonClasses(config.stage);
  const isPhaseButton = config.stage === 'research' || config.stage === 'vetting' || config.stage === 'offer' || config.stage === 'sourcing' || config.stage === 'success';
  const sizeClasses = compact ? 'px-3 py-1.5 text-sm' : '';
  const base = `${baseClasses} ${sizeClasses} inline-flex items-center gap-2 ${kind === 'right' ? 'justify-self-end' : ''}`;
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
          <div className="absolute top-0 right-0 w-20 h-20 bg-current rounded-full blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-12 h-12 bg-current rounded-full blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-5 pointer-events-none" />
        </>
      )}
      {content}
    </button>
  );
}

// ============ Stage strip ============

const STAGE_LABELS: Record<PhaseType, string> = {
  research: 'Research',
  vetting: 'Vetting',
  offer: 'Offering',
  sourcing: 'Sourcing',
};

function stagePath(stage: PhaseType, asin: string): string {
  if (stage === 'research') return `/research/${encodeURIComponent(asin)}`;
  if (stage === 'vetting') return `/vetting/${encodeURIComponent(asin)}`;
  if (stage === 'offer') return `/offer/${encodeURIComponent(asin)}`;
  return `/sourcing/${encodeURIComponent(asin)}`;
}

function StageChip({
  stage,
  current,
  lit,
  asin,
}: {
  stage: PhaseType;
  current: boolean;
  lit: boolean;
  asin: string;
}) {
  const tokens = getPhaseTokens(stage);
  // Three visual states:
  //   - current: filled, emphasized (current page user is on)
  //   - lit not-current: outlined + clickable navigation
  //   - unlit: dimmed slate, no nav
  const baseClasses = 'inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors';
  let stateClasses: string;
  if (current) {
    stateClasses = `bg-gradient-to-br ${tokens.gradientFrom} ${tokens.gradientVia} ${tokens.gradientTo} border-2 ${tokens.borderColorActive} ${tokens.textColorActive} ${tokens.shadowColor}`;
  } else if (lit) {
    stateClasses = `bg-slate-800/40 border ${tokens.borderColor} ${tokens.textColor} hover:bg-slate-700/40`;
  } else {
    stateClasses = 'bg-slate-800/30 border border-slate-700/40 text-slate-500 cursor-not-allowed';
  }
  const className = `${baseClasses} ${stateClasses}`;
  const label = STAGE_LABELS[stage];

  if (!lit || current) {
    return <span className={className}>{label}</span>;
  }
  return (
    <Link href={stagePath(stage, asin)} className={className}>
      {label}
    </Link>
  );
}

// Gradient connector classes between adjacent phase chips. Renders as
// a thin, glowing "lightsaber" — bright when both endpoints are lit,
// dim when one is unlit.
const CONNECTOR_GRADIENT: Record<string, string> = {
  'research-vetting': 'from-blue-500 to-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.45)]',
  'vetting-offer': 'from-cyan-500 to-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.45)]',
  'offer-sourcing': 'from-emerald-500 to-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.45)]',
};

function StageConnector({
  fromKey,
  toKey,
  active,
}: {
  fromKey: PhaseType;
  toKey: PhaseType;
  active: boolean;
}) {
  const gradient = CONNECTOR_GRADIENT[`${fromKey}-${toKey}`] ?? 'from-slate-600 to-slate-600';
  return (
    <div className="flex-1 flex items-center justify-center px-2" aria-hidden>
      <div
        className={`h-[2px] w-full rounded-full bg-gradient-to-r ${
          active ? gradient : 'from-slate-700/40 to-slate-700/40'
        }`}
      />
    </div>
  );
}

function StageStrip({
  asin,
  currentPhase,
  stage,
}: {
  asin: string;
  currentPhase: PhaseType;
  stage: StageState;
}) {
  const stages: Array<{ key: PhaseType; lit: boolean }> = [
    { key: 'research', lit: true }, // implied — page exists for this ASIN
    { key: 'vetting', lit: stage.vetted },
    { key: 'offer', lit: stage.offered },
    { key: 'sourcing', lit: stage.sourced },
  ];
  return (
    <div className="flex items-center w-full max-w-3xl mx-auto">
      {stages.map(({ key, lit }, idx) => (
        <div key={key} className="flex items-center flex-1 last:flex-none">
          <StageChip stage={key} current={key === currentPhase} lit={lit} asin={asin} />
          {idx < stages.length - 1 && (
            <StageConnector
              fromKey={key}
              toKey={stages[idx + 1].key}
              active={lit && stages[idx + 1].lit}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ============ Sticky observer ============

function useSticky(sentinelRef: React.RefObject<HTMLDivElement>) {
  const [isSticky, setIsSticky] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // When the sentinel scrolls behind the AppHeader (top 64px), the
    // sticky-positioned header has engaged. rootMargin offsets the
    // viewport top by -64 so detection happens at exactly the AppHeader
    // boundary instead of at viewport top.
    const observer = new IntersectionObserver(
      ([entry]) => setIsSticky(!entry.isIntersecting),
      { rootMargin: '-64px 0px 0px 0px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [sentinelRef]);
  return isSticky;
}

// ============ Main component ============

export function ProductHeader({
  productId,
  asin,
  currentDisplayTitle,
  originalTitle,
  leftButton,
  rightButton,
  badgeLabel,
  badgeTone = 'slate',
  currentPhase,
  stage,
  extraInlineAction,
}: ProductHeaderProps) {
  const dispatch = useDispatch();
  const titleByAsin = useSelector((state: RootState) => state.productTitles.byAsin);
  const { imageUrlByAsin } = useListingImages(useMemo(() => [asin], [asin]));
  const thumbnailSrc = imageUrlByAsin.get(asin?.toUpperCase() || '') ?? null;

  const storedTitle = titleByAsin?.[asin];
  const resolvedTitle = storedTitle || currentDisplayTitle || 'Untitled Product';

  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(resolvedTitle);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sticky sentinel — placed just above the sticky header so its
  // intersection state mirrors whether the header is pinned.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isSticky = useSticky(sentinelRef);

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

  const amazonUrl = useMemo(
    () => `https://www.amazon.com/dp/${encodeURIComponent(asin)}`,
    [asin]
  );

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

  const containerGlowClasses = getPhaseHeaderGlowClasses(currentPhase);
  const phaseTokens = getPhaseTokens(currentPhase);

  return (
    <>
      {/* Sentinel — flipped to "sticky" when this scrolls behind the AppHeader. */}
      <div ref={sentinelRef} aria-hidden className="h-px" />

      <div
        data-sticky={isSticky ? 'true' : 'false'}
        className={`sticky top-16 z-30 mb-6 ${
          isSticky
            ? `bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b ${phaseTokens.borderColor} ${phaseTokens.shadowColor}`
            : `bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border ${containerGlowClasses}`
        } ${isSticky ? '' : 'p-6'} relative overflow-hidden`}
      >
        {/* Phase glow blobs — same treatment in compact and expanded so
            the sticky bar still feels like the same surface. Slightly
            scaled down in compact mode since the bar is shorter. */}
        {phaseTokens && (
          <>
            <div
              className={`absolute top-0 right-0 ${phaseTokens.glowColor} rounded-full blur-3xl pointer-events-none ${
                isSticky ? 'w-24 h-24 opacity-25' : 'w-40 h-40 opacity-30'
              }`}
            />
            <div
              className={`absolute bottom-0 left-0 ${phaseTokens.glowColor} rounded-full blur-3xl pointer-events-none ${
                isSticky ? 'w-20 h-20 opacity-15' : 'w-32 h-32 opacity-20'
              }`}
            />
          </>
        )}

        {isSticky ? (
          // ============ COMPACT layout ============
          <div className="flex items-center gap-3 px-4 py-2">
            <ListingThumbnail
              src={thumbnailSrc}
              size="md"
              alt={resolvedTitle}
              linkHref={asin ? amazonUrl : undefined}
              linkLabel={asin ? `Open ${asin} on Amazon` : undefined}
            />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate flex-1 min-w-0">
              {resolvedTitle}
            </h2>
            <div className="shrink-0">
              <StageChip stage={currentPhase} current lit asin={asin} />
            </div>
            <div className="shrink-0">
              <NavButton kind="right" config={rightButton} compact />
            </div>
          </div>
        ) : (
          // ============ EXPANDED layout ============
          // Outer grid: left button | center stack (title row + stage strip) |
          // right button. items-center vertically centers the buttons against
          // the whole stack rather than just the title row.
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
            <div className="justify-self-start">
              <NavButton kind="left" config={leftButton} />
            </div>

            <div className="min-w-0 flex flex-col items-center gap-4">
              {/* Title row */}
              {!isEditing ? (
                <div className="flex items-center justify-center gap-3 min-w-0">
                  <ListingThumbnail
                    src={thumbnailSrc}
                    size="lg"
                    alt={resolvedTitle}
                    linkHref={asin ? amazonUrl : undefined}
                    linkLabel={asin ? `Open ${asin} on Amazon` : undefined}
                  />
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white truncate max-w-[min(640px,60vw)] text-center tracking-tight">
                    {resolvedTitle}
                  </h2>
                  {badgeLabel ? (
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${badgeClasses(badgeTone)}`}>
                      {badgeLabel}
                    </span>
                  ) : null}
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-2 rounded-lg bg-gray-200 dark:bg-slate-700/40 hover:bg-gray-300 dark:hover:bg-slate-700/60 text-gray-700 dark:text-slate-200 transition-colors shrink-0"
                    title="Rename"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {extraInlineAction}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3 min-w-0">
                  <ListingThumbnail src={thumbnailSrc} size="lg" alt={resolvedTitle} />
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
                    className="w-[min(640px,60vw)] bg-white dark:bg-slate-900/40 border border-gray-300 dark:border-slate-600/50 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white text-center text-3xl font-bold tracking-tight focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 disabled:opacity-60"
                  />
                  {saving ? <Loader2 className="w-5 h-5 text-gray-600 dark:text-slate-300 animate-spin" /> : null}
                </div>
              )}

              {/* Stage progress strip */}
              <StageStrip asin={asin} currentPhase={currentPhase} stage={stage} />
            </div>

            <div className="justify-self-end">
              <NavButton kind="right" config={rightButton} />
            </div>
          </div>
        )}
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
