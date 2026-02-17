'use client';

import { useState, useEffect } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  HelpCircle,
  Copy,
  RotateCcw,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Pencil
} from 'lucide-react';
import {
  parseLines,
  normalizeLine,
  isNumberedList
} from '@/utils/textList';

interface ReviewInsightsPanelProps {
  data?: {
    topLikes: string;
    topDislikes: string;
    importantInsights: string;
    importantQuestions: string;
    strengthsTakeaway?: string;
    painPointsTakeaway?: string;
    insightsTakeaway?: string;
    questionsTakeaway?: string;
    totalReviewCount?: number;
    positiveReviewCount?: number;
    neutralReviewCount?: number;
    negativeReviewCount?: number;
  };
  onChange: (data: {
    topLikes: string;
    topDislikes: string;
    importantInsights: string;
    importantQuestions: string;
    strengthsTakeaway?: string;
    painPointsTakeaway?: string;
    insightsTakeaway?: string;
    questionsTakeaway?: string;
    totalReviewCount?: number;
    positiveReviewCount?: number;
    neutralReviewCount?: number;
    negativeReviewCount?: number;
  }) => void;
  variant?: 'embedded' | 'standalone';
}

type InsightField = 'topLikes' | 'topDislikes' | 'importantInsights' | 'importantQuestions';

interface InsightCardProps {
  title: string;
  subtitle: string;
  value: string;
  takeaway?: string;
  onValueChange: (value: string) => void;
  accentVariant: 'green' | 'red' | 'amber' | 'blue';
  icon: React.ReactNode;
  placeholder: string;
  cardType?: 'likes' | 'dislikes' | 'insights' | 'questions';
  showConfidenceChip?: boolean;
}

function InsightCard({ 
  title, 
  subtitle, 
  value, 
  takeaway,
  onValueChange, 
  accentVariant, 
  icon, 
  placeholder,
  cardType,
  showConfidenceChip = false
}: InsightCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editValue, setEditValue] = useState(value);
  
  const isInsightsOrQuestions = cardType === 'insights' || cardType === 'questions';

  const lines = parseLines(value);
  const isNumbered = isNumberedList(lines);
  const isBulleted = lines.some((line) => /^[-*•]\s+/.test(line));
  const isList = isNumbered || isBulleted;
  const hasContent = lines.length > 0 || Boolean(takeaway);
  const previewItemCount = 3;
  const previewCharCount = 320;
  const totalText = lines.join(' ');
  const shouldCollapseList = isList && lines.length > previewItemCount;
  const shouldCollapseParagraph = !isList && totalText.length > previewCharCount;
  const shouldCollapse = shouldCollapseList || shouldCollapseParagraph;
  const displayLines = isExpanded ? lines : lines.slice(0, previewItemCount);
  const previewParagraph = shouldCollapseParagraph && !isExpanded
    ? `${totalText.slice(0, previewCharCount).trimEnd()}…`
    : null;
  const shouldShowTakeaway = Boolean(takeaway) && (cardType === 'likes' || cardType === 'dislikes');

  // Accent color classes
  const accentClasses = {
    green: {
      border: 'border-emerald-500/50',
      borderHover: 'hover:border-emerald-500/70',
      ring: 'ring-emerald-500/50',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      focus: 'focus:border-emerald-500/70 focus:ring-emerald-500/50',
      glow: 'shadow-lg shadow-emerald-500/15'
    },
    red: {
      border: 'border-red-500/50',
      borderHover: 'hover:border-red-500/70',
      ring: 'ring-red-500/50',
      bg: 'bg-red-500/10',
      text: 'text-red-400',
      focus: 'focus:border-red-500/70 focus:ring-red-500/50',
      glow: 'shadow-lg shadow-red-500/15'
    },
    amber: {
      border: 'border-amber-500/50',
      borderHover: 'hover:border-amber-500/70',
      ring: 'ring-amber-500/50',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      focus: 'focus:border-amber-500/70 focus:ring-amber-500/50',
      glow: 'shadow-lg shadow-amber-500/15'
    },
    blue: {
      border: 'border-blue-500/50',
      borderHover: 'hover:border-blue-500/70',
      ring: 'ring-blue-500/50',
      bg: 'bg-blue-500/10',
      text: 'text-blue-400',
      focus: 'focus:border-blue-500/70 focus:ring-blue-500/50',
      glow: 'shadow-lg shadow-blue-500/15'
    }
  };

  const accent = accentClasses[accentVariant];

  const handleEdit = () => {
    setEditValue(value);
    setIsEditing(true);
  };

  const handleSave = () => {
    onValueChange(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const splitLineForEmphasis = (line: string) => {
    const normalized = normalizeLine(line);
    const colonIndex = normalized.indexOf(':');
    if (colonIndex > 0 && colonIndex < normalized.length - 1) {
      return {
        lead: normalized.slice(0, colonIndex + 1),
        rest: normalized.slice(colonIndex + 1).trimStart()
      };
    }

    const dashMatch = normalized.match(/\s[-–—]\s/);
    if (dashMatch?.index !== undefined) {
      const splitIndex = dashMatch.index;
      return {
        lead: normalized.slice(0, splitIndex),
        rest: normalized.slice(splitIndex).trimStart()
      };
    }

    const words = normalized.split(/\s+/);
    if (words.length <= 2) {
      return { lead: normalized, rest: '' };
    }
    const leadCount = words.length >= 5 ? 3 : 2;
    const lead = words.slice(0, leadCount).join(' ');
    const rest = normalized.slice(lead.length).trimStart();
    return { lead, rest };
  };

  const renderEmphasizedText = (line: string) => {
    const { lead, rest } = splitLineForEmphasis(line);
    return (
      <>
        <span className="font-semibold text-slate-100">{lead}</span>
        {rest && <span className="text-slate-300">{` ${rest}`}</span>}
      </>
    );
  };

  const getAmazonBulletParts = (line: string) => {
    const normalized = normalizeLine(line);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'as', 'is', 'are', 'was', 'were']);
    const separators = [' — ', ' – ', ' - ', ':', '. ', ', '];
    let mainSource = normalized;
    let rest = '';

    for (const separator of separators) {
      const idx = normalized.indexOf(separator);
      if (idx > 0) {
        mainSource = normalized.slice(0, idx).trim();
        rest = normalized.slice(idx + separator.length).trim();
        break;
      }
    }

    const words = mainSource.split(/\s+/).filter(Boolean);
    let candidate = words;

    if (words.length > 5) {
      const filtered = words.filter(word => !stopWords.has(word.toLowerCase()));
      candidate = filtered.length >= 2 ? filtered : words;
    }

    if (candidate.length < 2) {
      candidate = normalized.split(/\s+/).filter(Boolean).slice(0, 2);
    }

    const mainPoint = candidate.slice(0, 5).map(word => word.replace(/[^\w'-]/g, '')).filter(Boolean).join(' ');

    if (!rest && normalized.toLowerCase().startsWith(mainSource.toLowerCase())) {
      rest = normalized.slice(mainSource.length).trimStart().replace(/^[-–—:.,]\s*/, '');
    }

    return { mainPoint, rest };
  };

  const renderAmazonBullet = (line: string) => {
    const { mainPoint, rest } = getAmazonBulletParts(line);

    return (
      <>
        <span className="font-semibold tracking-wide text-slate-100">{mainPoint.toUpperCase()}</span>
        {rest && <span className="text-slate-300">{` — ${rest}`}</span>}
      </>
    );
  };

  const renderQuestionContent = (line: string) => {
    const normalized = normalizeLine(line);
    const [questionText, whyTextRaw] = normalized.split('||').map(part => part.trim());
    const normalizeWhyItMatters = (text: string) => {
      if (!text) return '';
      const trimmed = text.trim();
      return trimmed.replace(/^why\s+it\s+matters\s*:\s*/i, '').trim();
    };
    const whyText = whyTextRaw ? normalizeWhyItMatters(whyTextRaw) : '';

    return (
      <>
        <span className="font-semibold text-slate-100">{questionText}</span>
        {whyText && (
          <span className="mt-2 block text-[13px] leading-relaxed text-slate-400">
            Why it matters: {whyText}
          </span>
        )}
      </>
    );
  };

  const renderLineContent = (line: string) => {
    if (cardType === 'likes' || cardType === 'dislikes') {
      return renderAmazonBullet(line);
    }
    if (cardType === 'insights') {
      return <span className="font-semibold text-slate-100">{normalizeLine(line)}</span>;
    }
    if (cardType === 'questions') {
      return renderQuestionContent(line);
    }
    return renderEmphasizedText(line);
  };

  return (
    <div className={`bg-slate-800/40 backdrop-blur-xl rounded-xl border ${accent.border} ${accent.borderHover} p-6 transition-all ${accent.glow}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          <div className={`${accent.text} mt-0.5`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-lg font-semibold text-slate-100">{title}</h4>
              {showConfidenceChip && !isEditing && (
                <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-red-500/10 text-red-400/80 border border-red-500/30">
                  Limited negative reviews
                </span>
              )}
            </div>
            <p className="text-[11px] leading-snug text-slate-400">{subtitle}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      {isEditing ? (
        <div className="space-y-3">
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={8}
            className={`w-full px-4 py-3 bg-slate-900/50 border ${accent.border} rounded-lg text-white placeholder-slate-500 focus:outline-none ${accent.focus} resize-none`}
            placeholder={placeholder}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className={`px-3 py-1.5 rounded-lg ${accent.bg} ${accent.text} border ${accent.border} hover:opacity-80 transition-opacity text-sm font-medium flex items-center gap-1.5`}
            >
              <Check className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:opacity-80 transition-opacity text-sm font-medium flex items-center gap-1.5"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>
      ) : hasContent ? (
        <div className="relative">
          {/* Edit affordance above content */}
          <div className="absolute top-0 right-0">
            <button
              onClick={handleEdit}
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors text-xs"
              aria-label="Edit"
            >
              <Pencil className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>
          
          {/* List content with proper spacing */}
          <div className="pt-6">
            {shouldShowTakeaway && (
              <div className={`mb-5 rounded-md border-l-2 ${accent.border} bg-slate-900/60 px-4 py-3 text-[15px] leading-relaxed text-slate-200`}>
                <span className="font-semibold text-slate-100">What matters most:</span>{' '}
                <span className="text-slate-200">{takeaway}</span>
              </div>
            )}
            {displayLines.length > 0 && (
              isList ? (
                isNumbered ? (
                  <ol className={`text-[15px] leading-relaxed text-slate-300 list-decimal ${isInsightsOrQuestions ? 'pl-5' : 'list-inside'}`}>
                    {displayLines.map((line, idx) => (
                      <li
                        key={`line-${idx}`}
                        className={`py-3 border-b border-slate-700/50 last:border-b-0 ${isInsightsOrQuestions ? '' : 'pl-2'}`}
                      >
                        {renderLineContent(line)}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ul className={`text-[15px] leading-relaxed text-slate-300 list-disc ${isInsightsOrQuestions ? 'pl-5' : 'list-inside'}`}>
                    {displayLines.map((line, idx) => (
                      <li
                        key={`line-${idx}`}
                        className={`py-3 border-b border-slate-700/50 last:border-b-0 ${isInsightsOrQuestions ? '' : 'pl-2'}`}
                      >
                        {renderLineContent(line)}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <div className="space-y-3 text-[15px] leading-relaxed text-slate-300">
                  {previewParagraph ? (
                    <p>{previewParagraph}</p>
                  ) : (
                    lines.map((line, idx) => (
                      <p key={`paragraph-${idx}`}>{line}</p>
                    ))
                  )}
                </div>
              )
            )}
            {shouldCollapse && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-3 text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Show more
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-500 italic py-4 text-center">
          No insights yet — run analysis to generate.
        </div>
      )}
    </div>
  );
}

export function ReviewInsightsPanel({ data, onChange, variant = 'standalone' }: ReviewInsightsPanelProps) {
  const reviewInsights = data || {
    topLikes: '',
    topDislikes: '',
    importantInsights: '',
    importantQuestions: '',
    strengthsTakeaway: '',
    painPointsTakeaway: '',
    insightsTakeaway: '',
    questionsTakeaway: '',
    totalReviewCount: 0,
    positiveReviewCount: 0,
    neutralReviewCount: 0,
    negativeReviewCount: 0
  };

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const handleChange = (field: InsightField, value: string) => {
    onChange({
      ...reviewInsights,
      [field]: value
    });
  };

  const handleCopyAll = async () => {
    const formatted = `AI Review Insights Summary

Primary Customer Strengths:
${reviewInsights.topLikes || '(No data)'}

Primary Customer Pain Points:
${reviewInsights.topDislikes || '(No data)'}

Important Insights:
${reviewInsights.importantInsights || '(No data)'}

Important Questions:
${reviewInsights.importantQuestions || '(No data)'}`;

    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all insights? This cannot be undone.')) {
      onChange({
        topLikes: '',
        topDislikes: '',
        importantInsights: '',
        importantQuestions: '',
        strengthsTakeaway: '',
        painPointsTakeaway: '',
        insightsTakeaway: '',
        questionsTakeaway: '',
        totalReviewCount: reviewInsights.totalReviewCount,
        positiveReviewCount: reviewInsights.positiveReviewCount,
        neutralReviewCount: reviewInsights.neutralReviewCount,
        negativeReviewCount: reviewInsights.negativeReviewCount
      });
    }
  };

  // Check if dislikes should show confidence chip
  const dislikesLines = parseLines(reviewInsights.topDislikes);
  const showDislikesChip = dislikesLines.length > 0 && dislikesLines.length < 3;

  const formatReviewCount = (value?: number) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric) : null;
  };

  const positiveCount = formatReviewCount(reviewInsights.positiveReviewCount);
  const negativeCount = formatReviewCount(reviewInsights.negativeReviewCount);
  const likesSubtitle = positiveCount !== null
    ? `Analyzed from ${positiveCount} positive reviews uploaded`
    : 'Analyzed from positive reviews uploaded';
  const dislikesSubtitle = negativeCount !== null
    ? `Analyzed from ${negativeCount} negative reviews uploaded`
    : 'Analyzed from negative reviews uploaded';

  const isEmbedded = variant === 'embedded';

  const content = (
    <>
      {/* Header with Toolbar - Only show in standalone mode */}
      {!isEmbedded && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">AI Review Insights</h3>
            <p className="text-xs text-slate-400">Strategic intelligence derived from real customer feedback</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAll}
              className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-slate-700/70 hover:border-slate-600/70 transition-colors text-sm font-medium flex items-center gap-1.5"
              aria-label="Copy all insights"
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50 transition-colors text-sm font-medium flex items-center gap-1.5"
              aria-label="Reset all insights"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          </div>
        </div>
      )}
      
      {/* Toolbar for embedded mode - compact version */}
      {isEmbedded && (
        <div className="flex items-center justify-end gap-2 mb-4">
          <button
            onClick={handleCopyAll}
            className="px-2.5 py-1 rounded-lg bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-slate-700/70 hover:border-slate-600/70 transition-colors text-xs font-medium flex items-center gap-1.5"
            aria-label="Copy all insights"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
      )}
      
      {/* Insight Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <InsightCard
          title="Primary Customer Strengths"
          subtitle={likesSubtitle}
          value={reviewInsights.topLikes}
          takeaway={reviewInsights.strengthsTakeaway}
          onValueChange={(value) => handleChange('topLikes', value)}
          accentVariant="green"
          icon={<ThumbsUp className="w-5 h-5" />}
          placeholder="Enter the dominant strengths surfaced from customer reviews..."
          cardType="likes"
        />
        
        <InsightCard
          title="Primary Customer Pain Points"
          subtitle={dislikesSubtitle}
          value={reviewInsights.topDislikes}
          takeaway={reviewInsights.painPointsTakeaway}
          onValueChange={(value) => handleChange('topDislikes', value)}
          accentVariant="red"
          icon={<ThumbsDown className="w-5 h-5" />}
          placeholder="Enter the most common pain points customers report..."
          cardType="dislikes"
          showConfidenceChip={showDislikesChip}
        />
        
        <InsightCard
          title="Important Insights"
          subtitle="Based on customer reviews"
          value={reviewInsights.importantInsights}
          takeaway={reviewInsights.insightsTakeaway}
          onValueChange={(value) => handleChange('importantInsights', value)}
          accentVariant="amber"
          icon={<Lightbulb className="w-5 h-5" />}
          placeholder="Enter important insights from customer reviews..."
          cardType="insights"
        />
        
        <InsightCard
          title="Important Questions"
          subtitle="Seller-focused questions to unlock SSP opportunities"
          value={reviewInsights.importantQuestions}
          takeaway={reviewInsights.questionsTakeaway}
          onValueChange={(value) => handleChange('importantQuestions', value)}
          accentVariant="blue"
          icon={<HelpCircle className="w-5 h-5" />}
          placeholder="Enter seller-focused questions tied to review patterns..."
          cardType="questions"
        />
      </div>
    </>
  );

  // In embedded mode, return content without outer wrapper
  if (isEmbedded) {
    return content;
  }

  // In standalone mode, wrap in container
  return (
    <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
      {content}
    </div>
  );
}

