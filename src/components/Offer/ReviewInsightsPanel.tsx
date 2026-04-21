'use client';

import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Package,
  Wrench,
  Shield,
  Sparkles,
  Gift,
  MessageSquareQuote,
  Target,
  ThumbsUp,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import type {
  ReviewInsights,
  MajorComplaint,
  ReviewInsightsSspCategory,
  TopTheme
} from './types';

interface ReviewInsightsPanelProps {
  data?: ReviewInsights;
  onChange: (data: ReviewInsights) => void;
  variant?: 'embedded' | 'standalone';
}

const EMPTY_INSIGHTS: ReviewInsights = {
  topLikes: '',
  topDislikes: '',
  importantInsights: '',
  importantQuestions: '',
};

const CATEGORY_STYLE: Record<ReviewInsightsSspCategory, {
  chipClass: string;
  icon: React.ReactNode;
  bar: string;
}> = {
  Quantity:      { chipClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30', icon: <Package className="w-3 h-3" />,  bar: 'bg-indigo-500' },
  Functionality: { chipClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30',   icon: <Wrench className="w-3 h-3" />,   bar: 'bg-amber-500' },
  Quality:       { chipClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', icon: <Shield className="w-3 h-3" />, bar: 'bg-emerald-500' },
  Aesthetic:     { chipClass: 'bg-pink-500/10 text-pink-300 border-pink-500/30',       icon: <Sparkles className="w-3 h-3" />, bar: 'bg-pink-500' },
  Bundle:        { chipClass: 'bg-sky-500/10 text-sky-300 border-sky-500/30',          icon: <Gift className="w-3 h-3" />,     bar: 'bg-sky-500' },
};

// ===== Sentiment Ring =====
// 3-segment SVG donut. Segments ordered negative → neutral → positive,
// starting from 12 o'clock and sweeping clockwise. Each segment is drawn
// as a separate <circle> with stroke-dasharray + a rotation transform.

interface RingSegment {
  pct: number;
  color: string;
  glow: string;
}

function SentimentRing({
  positivePct,
  neutralPct,
  negativePct,
  total
}: {
  positivePct: number | null;
  neutralPct: number | null;
  negativePct: number | null;
  total: number;
}) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 72;
  const strokeWidth = 14;
  const C = 2 * Math.PI * r;

  // Fall back to a single red arc when only negativeThemePercent is available.
  const hasFullBreakdown = positivePct !== null && neutralPct !== null && negativePct !== null;
  const negOnly = !hasFullBreakdown && negativePct !== null;

  const segments: RingSegment[] = hasFullBreakdown
    ? [
        { pct: negativePct!, color: '#ef4444', glow: 'rgba(239,68,68,0.55)' },
        { pct: neutralPct!,  color: '#64748b', glow: 'rgba(100,116,139,0.4)' },
        { pct: positivePct!, color: '#10b981', glow: 'rgba(16,185,129,0.55)' },
      ]
    : negOnly
      ? [{ pct: negativePct!, color: '#ef4444', glow: 'rgba(239,68,68,0.55)' }]
      : [];

  // Convert each pct to an arc length (in px along the circumference). Leave
  // a small gap between segments so the colors read as distinct.
  const gapPx = hasFullBreakdown ? 4 : 0;
  let cumulativeDeg = 0; // 0 = 12 o'clock because of the -90 rotation below

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        <defs>
          <filter id="ringSegmentGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgb(30 41 59 / 0.55)"
          strokeWidth={strokeWidth}
        />

        {segments.map((seg, i) => {
          if (seg.pct <= 0) return null;
          const arcDeg = (seg.pct / 100) * 360;
          const arcLen = (arcDeg / 360) * C;
          const effLen = Math.max(0, arcLen - gapPx);
          const rotation = cumulativeDeg;
          cumulativeDeg += arcDeg;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              strokeDasharray={`${effLen} ${C - effLen}`}
              transform={`rotate(${rotation} ${cx} ${cy})`}
              style={{ filter: `drop-shadow(0 0 6px ${seg.glow})` }}
            />
          );
        })}
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-[40px] leading-none font-semibold text-slate-100 tabular-nums">
          {total.toLocaleString()}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">
          Reviews
        </div>
      </div>
    </div>
  );
}

function RingLegend({
  positivePct,
  neutralPct,
  negativePct
}: {
  positivePct: number | null;
  neutralPct: number | null;
  negativePct: number | null;
}) {
  const rows: Array<{ label: string; pct: number | null; dot: string }> = [
    { label: 'Negative', pct: negativePct, dot: 'bg-red-500' },
    { label: 'Neutral',  pct: neutralPct,  dot: 'bg-slate-500' },
    { label: 'Positive', pct: positivePct, dot: 'bg-emerald-500' },
  ].filter(r => r.pct !== null) as any;

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-[12px] text-slate-300">
          <span className={`w-2 h-2 rounded-full ${r.dot}`} aria-hidden />
          <span className="flex-1">{r.label}</span>
          <span className="tabular-nums text-slate-400">{r.pct}%</span>
        </div>
      ))}
    </div>
  );
}

// ===== Hero Snapshot =====

function HeroSnapshot({ insights }: { insights: ReviewInsights }) {
  const total = insights.totalReviewCount || insights.marketSnapshot?.reviewCount || 0;
  // Prefer the explicit percent fields on marketSnapshot — they come straight
  // from the AI's summary_stats and don't suffer from per-review-count rounding.
  const snapPos = insights.marketSnapshot?.positivePercent;
  const snapNeu = insights.marketSnapshot?.neutralPercent;
  const snapNeg = insights.marketSnapshot?.negativePercent;
  const hasSnapshotPcts =
    typeof snapPos === 'number' ||
    typeof snapNeu === 'number' ||
    typeof snapNeg === 'number';

  // Fall back to deriving from review counts (structured CSV path).
  const positive = insights.positiveReviewCount ?? 0;
  const neutral = insights.neutralReviewCount ?? 0;
  const negative = insights.negativeReviewCount ?? 0;
  const knownSum = positive + neutral + negative;
  const hasCountBreakdown = knownSum > 0 && total > 0 && Math.abs(knownSum - total) / total <= 0.05;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const positivePct = hasSnapshotPcts
    ? (typeof snapPos === 'number' ? snapPos : 0)
    : (hasCountBreakdown ? pct(positive) : null);
  const neutralPct = hasSnapshotPcts
    ? (typeof snapNeu === 'number' ? snapNeu : 0)
    : (hasCountBreakdown ? pct(neutral) : null);
  const negativePct = hasSnapshotPcts
    ? (typeof snapNeg === 'number' ? snapNeg : 0)
    : (hasCountBreakdown ? pct(negative) : (insights.marketSnapshot?.negativeThemePercent ?? null));

  const verdict = insights.marketSnapshot?.verdict || '';
  const themes = insights.topThemes || [];
  const painThemes = themes.filter(t => t.sentiment === 'negative');
  const praiseThemes = themes.filter(t => t.sentiment === 'positive');

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-800/60 via-slate-900/50 to-slate-900/70 p-6 space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
        {/* Ring + legend */}
        <div className="lg:col-span-2 flex items-center gap-6">
          <SentimentRing
            total={total}
            positivePct={positivePct}
            neutralPct={neutralPct}
            negativePct={negativePct}
          />
          <RingLegend
            positivePct={positivePct}
            neutralPct={neutralPct}
            negativePct={negativePct}
          />
        </div>

        {/* Verdict */}
        <div className="lg:col-span-3 flex flex-col">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Market verdict</div>
          {verdict ? (
            <p className="text-[16px] leading-relaxed text-slate-100">{verdict}</p>
          ) : (
            <p className="text-[13px] italic text-slate-500">No market verdict yet — run analysis to generate.</p>
          )}
        </div>
      </div>

      {/* Top themes, split into pain + praise rows */}
      {(painThemes.length > 0 || praiseThemes.length > 0) && (
        <div className="pt-4 border-t border-slate-700/50 space-y-2.5">
          {painThemes.length > 0 && (
            <ThemeRow label="Top pain themes" themes={painThemes} />
          )}
          {praiseThemes.length > 0 && (
            <ThemeRow label="Top praise themes" themes={praiseThemes} />
          )}
        </div>
      )}
    </div>
  );
}

function ThemeRow({ label, themes }: { label: string; themes: TopTheme[] }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-[128px] flex-shrink-0 pt-1 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
        {label}
      </div>
      <div className="flex-1 flex flex-wrap gap-2">
        {themes.map((t, i) => (
          <ThemeChip key={i} theme={t} />
        ))}
      </div>
    </div>
  );
}

function ThemeChip({ theme }: { theme: TopTheme }) {
  const isNeg = theme.sentiment === 'negative';
  const chipClass = isNeg
    ? 'bg-red-500/10 text-red-300 border-red-500/30'
    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
  const Icon = isNeg ? TrendingDown : TrendingUp;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border ${chipClass}`}>
      <Icon className="w-3 h-3" />
      <span>{theme.label}</span>
      {theme.mentionPercent > 0 && (
        <span className="opacity-70 tabular-nums">{theme.mentionPercent}%</span>
      )}
    </span>
  );
}

// ===== Severity bar (used by complaint accordion) =====

function SeverityBar({ severity }: { severity: number }) {
  const segments = [1, 2, 3, 4, 5];
  const colorFor = (filled: boolean) => {
    if (!filled) return 'bg-slate-700/60';
    if (severity >= 4) return 'bg-red-500';
    if (severity === 3) return 'bg-amber-500';
    return 'bg-slate-500';
  };
  return (
    <div className="flex items-center gap-1" aria-label={`Severity ${severity} of 5`}>
      {segments.map((s) => (
        <span key={s} className={`h-1.5 w-4 rounded-full ${colorFor(s <= severity)}`} />
      ))}
      <span className="ml-1.5 text-[11px] text-slate-400 tabular-nums">{severity}/5</span>
    </div>
  );
}

// ===== Shared split helper: "title — body" =====

function splitTitleBody(text: string) {
  const idx = text.indexOf(' — ');
  if (idx === -1) return { title: text.trim(), body: '' };
  return {
    title: text.slice(0, idx).trim(),
    body: text.slice(idx + 3).trim(),
  };
}

// ===== Complaint Accordion =====

function ComplaintAccordion({
  complaint,
  defaultOpen
}: {
  complaint: MajorComplaint;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const style = CATEGORY_STYLE[complaint.sspCategory] || CATEGORY_STYLE.Functionality;
  const { title, body } = splitTitleBody(complaint.complaint);
  const hasQuotes = complaint.exampleQuotes && complaint.exampleQuotes.length > 0;

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/40 hover:border-slate-600 transition-colors">
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${style.bar}`} aria-hidden />
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full pl-5 pr-4 py-3.5 flex items-center gap-3 text-left hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${style.chipClass}`}>
            {style.icon}
            {complaint.sspCategory}
          </span>
          <SeverityBar severity={complaint.severity} />
          {complaint.mentionPercent > 0 && (
            <span className="text-[11px] text-slate-400 tabular-nums">
              {complaint.mentionPercent}%
            </span>
          )}
        </div>
        <h5 className="flex-1 text-[15px] font-semibold text-slate-100 min-w-0 truncate">
          {title || 'Complaint'}
        </h5>
        <span className="text-slate-400 flex-shrink-0" aria-hidden>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div className="pl-5 pr-5 pb-4 pt-1 space-y-3">
          {body && (
            <p className="text-[14px] leading-relaxed text-slate-300">{body}</p>
          )}
          {complaint.opportunity && (
            <div className="flex items-start gap-2 rounded-lg bg-slate-900/50 border border-slate-700/50 px-3 py-2">
              <Target className="w-4 h-4 text-sky-400 mt-0.5 flex-shrink-0" />
              <p className="text-[13px] leading-relaxed text-slate-200">
                <span className="font-semibold text-sky-300">Opportunity:</span> {complaint.opportunity}
              </p>
            </div>
          )}
          {hasQuotes && (
            <ul className="space-y-1.5">
              {complaint.exampleQuotes.map((quote, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-400 italic">
                  <MessageSquareQuote className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                  <span>&ldquo;{quote}&rdquo;</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ===== Strength Accordion =====
// Mirrors the complaint accordion visually but with an emerald bar + check icon.
// Takes a raw "title — body" string from the whatIsWorking array.

function StrengthAccordion({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const { title, body } = splitTitleBody(text);

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/40 hover:border-slate-600 transition-colors">
      <span className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" aria-hidden />
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full pl-5 pr-4 py-3 flex items-center gap-3 text-left hover:bg-slate-800/30 transition-colors"
      >
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 flex-shrink-0" aria-hidden>
          ✓
        </span>
        <h5 className="flex-1 text-[14px] font-semibold text-slate-100 min-w-0 truncate">
          {title || 'Strength'}
        </h5>
        {body && (
          <span className="text-slate-400 flex-shrink-0" aria-hidden>
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        )}
      </button>

      {open && body && (
        <div className="pl-[52px] pr-5 pb-3 pt-1">
          <p className="text-[13px] leading-relaxed text-slate-300">{body}</p>
        </div>
      )}
    </div>
  );
}

// ===== Legacy fallback =====

function LegacyFallback({ data }: { data: ReviewInsights }) {
  const blocks: Array<{ title: string; body: string }> = [
    { title: 'Primary Customer Strengths', body: data.topLikes || '' },
    { title: 'Primary Customer Pain Points', body: data.topDislikes || '' },
    { title: 'Important Insights', body: data.importantInsights || '' },
    { title: 'Important Questions', body: data.importantQuestions || '' },
  ];
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
      <p className="text-[13px] text-amber-200">
        These insights were generated with the previous format. Re-run analysis (Add More Reviews) to see the new seller-focused view.
      </p>
      {blocks.map((b, i) => b.body ? (
        <div key={i}>
          <h5 className="text-sm font-semibold text-slate-200 mb-1">{b.title}</h5>
          <pre className="text-[13px] leading-relaxed text-slate-300 whitespace-pre-wrap font-sans">{b.body}</pre>
        </div>
      ) : null)}
    </div>
  );
}

// ===== Main panel =====

export function ReviewInsightsPanel({ data, onChange, variant = 'standalone' }: ReviewInsightsPanelProps) {
  const insights: ReviewInsights = data || EMPTY_INSIGHTS;

  const hasStructured = useMemo(() => Boolean(
    insights.marketSnapshot?.verdict ||
    (insights.majorComplaints && insights.majorComplaints.length > 0) ||
    (insights.whatIsWorking && insights.whatIsWorking.length > 0)
  ), [insights]);

  const handleReset = () => {
    if (!confirm('Reset all insights? This cannot be undone.')) return;
    onChange({
      ...EMPTY_INSIGHTS,
      totalReviewCount: insights.totalReviewCount,
      positiveReviewCount: insights.positiveReviewCount,
      neutralReviewCount: insights.neutralReviewCount,
      negativeReviewCount: insights.negativeReviewCount,
    });
  };

  const complaints = insights.majorComplaints || [];
  const working = insights.whatIsWorking || [];

  const isEmbedded = variant === 'embedded';

  // Slim header — the panel's outer container already shows "AI Review Insights"
  // as a section title, so the inside of the panel just needs the reset affordance
  // when we have structured data.
  const header = (!isEmbedded && hasStructured) ? (
    <div className="flex items-center justify-end mb-3">
      <button
        onClick={handleReset}
        className="px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-colors flex items-center gap-1"
        aria-label="Reset insights"
      >
        <RotateCcw className="w-3 h-3" />
        Reset
      </button>
    </div>
  ) : null;

  const content = (
    <>
      {header}

      {!hasStructured ? (
        <LegacyFallback data={insights} />
      ) : (
        <div className="space-y-5">
          <HeroSnapshot insights={insights} />

          {/* Major Complaints — full width accordion */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <h4 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Major Complaints</h4>
              <span className="text-[11px] text-slate-500">— ranked by severity, click to expand</span>
            </div>
            {complaints.length === 0 ? (
              <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-5 text-[13px] italic text-slate-500">
                No material complaints surfaced from these reviews.
              </div>
            ) : (
              <div className="space-y-2">
                {complaints.map((c, i) => (
                  <ComplaintAccordion key={i} complaint={c} defaultOpen={i === 0} />
                ))}
              </div>
            )}
          </div>

          {/* Emerging Strengths — mirror accordion */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ThumbsUp className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Emerging Strengths</h4>
              <span className="text-[11px] text-slate-500">— click to expand</span>
            </div>
            {working.length === 0 ? (
              <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 text-[13px] italic text-slate-400">
                Few dominant strengths surfaced — this market is ripe for disruption on product fundamentals.
              </div>
            ) : (
              <div className="space-y-2">
                {working.map((w, i) => (
                  <StrengthAccordion key={i} text={w} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (isEmbedded) return content;

  return (
    <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
      {content}
    </div>
  );
}
