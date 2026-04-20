'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ThumbsUp,
  AlertTriangle,
  Copy,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Package,
  Wrench,
  Shield,
  Sparkles,
  Gift,
  MessageSquareQuote,
  Target
} from 'lucide-react';
import type {
  ReviewInsights,
  MajorComplaint,
  ReviewInsightsSspCategory
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
  Quantity:      { chipClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30', icon: <Package className="w-3 h-3" />,   bar: 'bg-indigo-500' },
  Functionality: { chipClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30',   icon: <Wrench className="w-3 h-3" />,    bar: 'bg-amber-500' },
  Quality:       { chipClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', icon: <Shield className="w-3 h-3" />, bar: 'bg-emerald-500' },
  Aesthetic:     { chipClass: 'bg-pink-500/10 text-pink-300 border-pink-500/30',       icon: <Sparkles className="w-3 h-3" />, bar: 'bg-pink-500' },
  Bundle:        { chipClass: 'bg-sky-500/10 text-sky-300 border-sky-500/30',          icon: <Gift className="w-3 h-3" />,     bar: 'bg-sky-500' },
};

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
        <span key={s} className={`h-1.5 w-5 rounded-full ${colorFor(s <= severity)}`} />
      ))}
      <span className="ml-2 text-[11px] text-slate-400">{severity}/5</span>
    </div>
  );
}

function ComplaintCard({ complaint }: { complaint: MajorComplaint }) {
  const [showQuotes, setShowQuotes] = useState(false);
  const style = CATEGORY_STYLE[complaint.sspCategory] || CATEGORY_STYLE.Functionality;
  const hasQuotes = complaint.exampleQuotes && complaint.exampleQuotes.length > 0;

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/40 backdrop-blur-sm hover:border-slate-600 transition-colors">
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${style.bar}`} aria-hidden />
      <div className="pl-5 pr-5 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${style.chipClass}`}>
              {style.icon}
              {complaint.sspCategory}
            </span>
            {complaint.mentionPercent > 0 && (
              <span className="text-[11px] text-slate-400">
                {complaint.mentionPercent}% of reviews
              </span>
            )}
          </div>
          <SeverityBar severity={complaint.severity} />
        </div>

        <p className="text-[15px] leading-relaxed text-slate-100 font-medium mb-2">
          {complaint.complaint}
        </p>

        {complaint.sellerAngle && (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-slate-900/50 border border-slate-700/50 px-3 py-2">
            <Target className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
            <p className="text-[13px] leading-relaxed text-slate-200">
              <span className="font-semibold text-emerald-300">Your angle:</span> {complaint.sellerAngle}
            </p>
          </div>
        )}

        {hasQuotes && (
          <button
            onClick={() => setShowQuotes(v => !v)}
            className="mt-3 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            {showQuotes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {complaint.exampleQuotes.length} review quote{complaint.exampleQuotes.length === 1 ? '' : 's'}
          </button>
        )}

        {showQuotes && hasQuotes && (
          <ul className="mt-2 space-y-1.5">
            {complaint.exampleQuotes.map((quote, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-400 italic">
                <MessageSquareQuote className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                <span>&ldquo;{quote}&rdquo;</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

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

export function ReviewInsightsPanel({ data, onChange, variant = 'standalone' }: ReviewInsightsPanelProps) {
  const insights: ReviewInsights = data || EMPTY_INSIGHTS;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const hasStructured = useMemo(() => {
    return Boolean(
      insights.marketSnapshot?.verdict ||
      (insights.majorComplaints && insights.majorComplaints.length > 0) ||
      (insights.whatIsWorking && insights.whatIsWorking.length > 0) ||
      insights.gapFinder
    );
  }, [insights]);

  const handleCopyAll = async () => {
    const parts: string[] = ['AI Review Insights Summary'];
    if (insights.marketSnapshot?.verdict) {
      parts.push('', 'Market Verdict:', insights.marketSnapshot.verdict);
    }
    if (insights.majorComplaints?.length) {
      parts.push('', 'Major Complaints:');
      insights.majorComplaints.forEach((c, i) => {
        parts.push(`${i + 1}. [${c.sspCategory} · Severity ${c.severity}/5] ${c.complaint}`);
        if (c.sellerAngle) parts.push(`   Angle: ${c.sellerAngle}`);
      });
    }
    if (insights.whatIsWorking?.length) {
      parts.push('', "What's Working:");
      insights.whatIsWorking.forEach(w => parts.push(`- ${w}`));
    }
    if (insights.gapFinder) {
      const sections: Array<[string, { finding: string }[]]> = [
        ['Hardware Gaps', insights.gapFinder.hardwareGaps || []],
        ['Install Friction', insights.gapFinder.installFriction || []],
        ['Unserved Use Cases', insights.gapFinder.unservedUseCases || []],
      ];
      sections.forEach(([title, items]) => {
        if (items.length) {
          parts.push('', `${title}:`);
          items.forEach(it => parts.push(`- ${it.finding}`));
        }
      });
    }
    try {
      await navigator.clipboard.writeText(parts.join('\n'));
      setCopied(true);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

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

  const snapshot = insights.marketSnapshot;
  const complaints = insights.majorComplaints || [];
  const working = insights.whatIsWorking || [];
  const gap = insights.gapFinder;

  const isEmbedded = variant === 'embedded';

  const toolbar = (
    <div className={`flex items-center justify-end gap-2 ${isEmbedded ? 'mb-4' : ''}`}>
      <button
        onClick={handleCopyAll}
        className="px-2.5 py-1 rounded-lg bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-slate-700/70 transition-colors text-xs font-medium flex items-center gap-1.5"
      >
        <Copy className="w-3.5 h-3.5" />
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      {!isEmbedded && (
        <button
          onClick={handleReset}
          className="px-2.5 py-1 rounded-lg bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50 transition-colors text-xs font-medium flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      )}
    </div>
  );

  const content = (
    <>
      {!isEmbedded && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">AI Review Insights</h3>
            <p className="text-xs text-slate-400">Seller-focused intelligence synthesized from customer reviews</p>
          </div>
          {toolbar}
        </div>
      )}
      {isEmbedded && toolbar}

      {!hasStructured ? (
        <LegacyFallback data={insights} />
      ) : (
        <div className="space-y-6">
          {/* 1 — Market Snapshot */}
          {snapshot && (
            <div className="rounded-xl border border-slate-700/60 bg-gradient-to-br from-slate-800/60 to-slate-900/40 p-5">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Market Snapshot</span>
                <div className="h-4 w-px bg-slate-700" aria-hidden />
                <div className="flex items-center gap-3 text-[12px] text-slate-400">
                  {typeof snapshot.reviewCount === 'number' && snapshot.reviewCount > 0 && (
                    <span>{snapshot.reviewCount} reviews analyzed</span>
                  )}
                  {typeof snapshot.negativeThemePercent === 'number' && (
                    <span>· {snapshot.negativeThemePercent}% negative themes</span>
                  )}
                </div>
              </div>
              {snapshot.verdict && (
                <p className="text-[15px] leading-relaxed text-slate-100">
                  {snapshot.verdict}
                </p>
              )}
            </div>
          )}

          {/* 2+3 — Major Complaints (60%) + What's Working (40%) */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h4 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Major Complaints</h4>
                <span className="text-[11px] text-slate-500">— ranked by severity</span>
              </div>
              {complaints.length === 0 ? (
                <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-5 text-[13px] italic text-slate-500">
                  No material complaints surfaced from these reviews.
                </div>
              ) : (
                <div className="space-y-3">
                  {complaints.map((c, i) => (
                    <ComplaintCard key={i} complaint={c} />
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <ThumbsUp className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">What's Working</h4>
                <span className="text-[11px] text-slate-500">— table stakes</span>
              </div>
              <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
                {working.length === 0 ? (
                  <p className="text-[13px] italic text-slate-500">No dominant strengths surfaced.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {working.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-slate-300">
                        <span className="text-emerald-400 mt-0.5" aria-hidden>✓</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* 4 — Gap Finder */}
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
