'use client';

import { useState, useEffect, useMemo } from 'react';
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

// ===== Hero Snapshot =====

function HeroSnapshot({
  insights,
  working
}: {
  insights: ReviewInsights;
  working: string[];
}) {
  const total = insights.totalReviewCount || insights.marketSnapshot?.reviewCount || 0;
  const positive = insights.positiveReviewCount ?? 0;
  const neutral = insights.neutralReviewCount ?? 0;
  const negative = insights.negativeReviewCount ?? 0;
  const knownSum = positive + neutral + negative;
  const hasSentimentBreakdown = knownSum > 0 && total > 0;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const positivePct = hasSentimentBreakdown ? pct(positive) : null;
  const neutralPct = hasSentimentBreakdown ? pct(neutral) : null;
  const negativePct = hasSentimentBreakdown ? pct(negative) : (insights.marketSnapshot?.negativeThemePercent ?? null);

  const verdict = insights.marketSnapshot?.verdict || '';
  const themes = insights.topThemes || [];

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-800/60 via-slate-900/50 to-slate-900/70 p-6 space-y-5">
      {/* Top row: big count + sentiment bars on left, verdict on right */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: stats */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Reviews analyzed</div>
            <div className="text-5xl font-semibold text-slate-100 tabular-nums leading-none mt-1">
              {total.toLocaleString()}
            </div>
          </div>

          {hasSentimentBreakdown ? (
            <div className="space-y-2">
              <HeroMixBar label="Positive" pct={positivePct!} color="bg-emerald-500" />
              <HeroMixBar label="Neutral"  pct={neutralPct!}  color="bg-slate-500" />
              <HeroMixBar label="Negative" pct={negativePct!} color="bg-red-500" />
            </div>
          ) : negativePct !== null ? (
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Negative theme density</div>
              <HeroMixBar label="Negative themes" pct={negativePct} color="bg-red-500" />
              <p className="text-[11px] text-slate-500 italic">Raw reviews — sentiment inferred from complaint clusters.</p>
            </div>
          ) : null}
        </div>

        {/* Right: verdict */}
        <div className="lg:col-span-3 flex flex-col">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Market verdict</div>
          {verdict ? (
            <p className="text-[16px] leading-relaxed text-slate-100">
              {verdict}
            </p>
          ) : (
            <p className="text-[13px] italic text-slate-500">
              No market verdict yet — run analysis to generate.
            </p>
          )}
        </div>
      </div>

      {/* Top themes strip */}
      {themes.length > 0 && (
        <div className="pt-4 border-t border-slate-700/50">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Top themes</div>
          <div className="flex flex-wrap gap-2">
            {themes.map((t, i) => (
              <ThemeChip key={i} theme={t} />
            ))}
          </div>
        </div>
      )}

      {/* Emerging strengths — inline, never empty */}
      <div className="pt-4 border-t border-slate-700/50">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
          <ThumbsUp className="w-3 h-3" />
          Emerging strengths
        </div>
        {working.length === 0 ? (
          <p className="text-[13px] italic text-slate-400">
            Few dominant strengths surfaced — this market is ripe for disruption on product fundamentals.
          </p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
            {working.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-slate-300">
                <span className="text-emerald-400 mt-0.5 flex-shrink-0" aria-hidden>✓</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HeroMixBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] text-slate-400 mb-1">
        <span>{label}</span>
        <span className="tabular-nums font-semibold text-slate-200">{pct}%</span>
      </div>
      <div className="h-2 w-full bg-slate-900/60 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${width}%` }} />
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

// ===== Severity bar =====

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

// ===== Complaint Accordion =====

function splitComplaintTitle(complaint: string) {
  // The complaint string is built as `${theme} — ${insight}` — we show theme as the
  // accordion title and keep the insight for the expanded body.
  const idx = complaint.indexOf(' — ');
  if (idx === -1) return { title: complaint.trim(), body: '' };
  return {
    title: complaint.slice(0, idx).trim(),
    body: complaint.slice(idx + 3).trim(),
  };
}

function ComplaintAccordion({
  complaint,
  defaultOpen
}: {
  complaint: MajorComplaint;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const style = CATEGORY_STYLE[complaint.sspCategory] || CATEGORY_STYLE.Functionality;
  const { title, body } = splitComplaintTitle(complaint.complaint);
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
            <p className="text-[14px] leading-relaxed text-slate-300">
              {body}
            </p>
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

// ===== Gap Finder column =====

function GapColumn({
  title,
  emoji,
  findings
}: {
  title: string;
  emoji: string;
  findings: { finding: string }[];
}) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
      <h5 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-3">
        <span className="text-base" aria-hidden>{emoji}</span>
        {title}
      </h5>
      {findings.length === 0 ? (
        <p className="text-[12px] italic text-slate-500">No signal from these reviews.</p>
      ) : (
        <ul className="space-y-2">
          {findings.map((f, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-slate-300 flex gap-2">
              <span className="text-slate-500 mt-1" aria-hidden>•</span>
              <span>{f.finding}</span>
            </li>
          ))}
        </ul>
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
    (insights.whatIsWorking && insights.whatIsWorking.length > 0) ||
    insights.gapFinder
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
  const gap = insights.gapFinder;
  const total = insights.totalReviewCount || insights.marketSnapshot?.reviewCount || 0;

  const isEmbedded = variant === 'embedded';

  const header = (
    <div className="flex items-center justify-between mb-5 gap-3">
      <div className="flex items-baseline gap-3 min-w-0">
        <h3 className="text-base font-semibold text-slate-100 truncate">AI Review Insights</h3>
        {total > 0 && (
          <span className="text-[12px] text-slate-500">· {total.toLocaleString()} reviews analyzed</span>
        )}
      </div>
      {!isEmbedded && hasStructured && (
        <button
          onClick={handleReset}
          className="px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-colors flex items-center gap-1"
          aria-label="Reset insights"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      )}
    </div>
  );

  const content = (
    <>
      {header}

      {!hasStructured ? (
        <LegacyFallback data={insights} />
      ) : (
        <div className="space-y-5">
          {/* Hero Snapshot */}
          <HeroSnapshot insights={insights} working={working} />

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
                  <ComplaintAccordion
                    key={i}
                    complaint={c}
                    defaultOpen={i === 0}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Gap Finder */}
          {gap && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-sky-400" />
                <h4 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Gap Finder</h4>
                <span className="text-[11px] text-slate-500">— where competitors are weak</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <GapColumn title="Hardware Gaps" emoji="🔩" findings={gap.hardwareGaps || []} />
                <GapColumn title="Install Friction" emoji="🛠️" findings={gap.installFriction || []} />
                <GapColumn title="Unserved Use Cases" emoji="🎯" findings={gap.unservedUseCases || []} />
              </div>
            </div>
          )}
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
