'use client';

import { useState, useEffect } from 'react';
import { 
  ThumbsUp, 
  ThumbsDown, 
  Lightbulb, 
  HelpCircle, 
  Copy, 
  RotateCcw, 
  Sparkles,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Pencil
} from 'lucide-react';
import { 
  parseLines, 
  normalizeLine, 
  isNumberedList, 
  extractKeywords,
  formatText,
  splitTheme
} from '@/utils/textList';

interface ReviewInsightsPanelProps {
  data?: {
    topLikes: string;
    topDislikes: string;
    importantInsights: string;
    importantQuestions: string;
  };
  onChange: (data: {
    topLikes: string;
    topDislikes: string;
    importantInsights: string;
    importantQuestions: string;
  }) => void;
  variant?: 'embedded' | 'standalone';
}

type InsightField = 'topLikes' | 'topDislikes' | 'importantInsights' | 'importantQuestions';

interface InsightCardProps {
  title: string;
  subtitle: string;
  value: string;
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
  
  const isLikesOrDislikes = cardType === 'likes' || cardType === 'dislikes';
  const isInsightsOrQuestions = cardType === 'insights' || cardType === 'questions';

  const lines = parseLines(value);
  const isNumbered = isNumberedList(lines);
  const hasContent = lines.length > 0;
  const shouldCollapse = lines.length > 6;
  const displayLines = shouldCollapse && !isExpanded ? lines.slice(0, 6) : lines;

  // Extract tags from all lines (up to 4 unique)
  const allTags = new Set<string>();
  lines.forEach(line => {
    const keywords = extractKeywords(normalizeLine(line), 2);
    keywords.forEach(kw => allTags.add(kw));
  });
  const tags = Array.from(allTags).slice(0, 4);

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

  return (
    <div className={`bg-slate-800/40 backdrop-blur-xl rounded-xl border ${accent.border} ${accent.borderHover} p-5 transition-all ${accent.glow}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          <div className={`${accent.text} mt-0.5`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-base font-semibold text-white">{title}</h4>
              {showConfidenceChip && !isEditing && (
                <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-red-500/10 text-red-400/80 border border-red-500/30">
                  Limited negative reviews
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>
        </div>
        {!isEditing && (
          <button
            onClick={handleEdit}
            className="ml-2 p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
            aria-label="Edit insights"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tags */}
      {!isEditing && tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {tags.map((tag, idx) => (
            <span
              key={idx}
              className={`px-2 py-0.5 rounded-md text-xs font-medium ${accent.bg} ${accent.text} border ${accent.border}`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

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
            {isNumbered ? (
              <ol className={`${isInsightsOrQuestions ? 'space-y-2.5 pl-5' : 'space-y-2 list-inside'} text-sm text-slate-300 list-decimal`}>
                {displayLines.map((line, idx) => {
                  const normalized = normalizeLine(line);
                  if (isLikesOrDislikes) {
                    const { theme, detail } = splitTheme(normalized);
                    return (
                      <li key={idx} className={isInsightsOrQuestions ? 'leading-relaxed' : 'pl-2'}>
                        <span className="font-semibold text-white">{theme}</span>
                        {detail && <span className="text-slate-300/80"> — {detail}</span>}
                      </li>
                    );
                  }
                  return (
                    <li key={idx} className={isInsightsOrQuestions ? 'leading-relaxed' : 'pl-2'}>
                      <span className="text-white">{normalized}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <ul className={`${isInsightsOrQuestions ? 'space-y-2.5 pl-5' : 'space-y-2 list-inside'} text-sm text-slate-300 list-disc`}>
                {displayLines.map((line, idx) => {
                  const normalized = normalizeLine(line);
                  if (isLikesOrDislikes) {
                    const { theme, detail } = splitTheme(normalized);
                    return (
                      <li key={idx} className={isInsightsOrQuestions ? 'leading-relaxed' : 'pl-2'}>
                        <span className="font-semibold text-white">{theme}</span>
                        {detail && <span className="text-slate-300/80"> — {detail}</span>}
                      </li>
                    );
                  }
                  return (
                    <li key={idx} className={isInsightsOrQuestions ? 'leading-relaxed' : 'pl-2'}>
                      <span className="text-white">{normalized}</span>
                    </li>
                  );
                })}
              </ul>
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
                    Show all ({lines.length})
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
    importantQuestions: ''
  };

  const [copied, setCopied] = useState(false);
  const [formatted, setFormatted] = useState(false);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  useEffect(() => {
    if (formatted) {
      const timer = setTimeout(() => setFormatted(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [formatted]);

  const handleChange = (field: InsightField, value: string) => {
    onChange({
      ...reviewInsights,
      [field]: value
    });
  };

  const handleCopyAll = async () => {
    const formatted = `Review Insights Summary

Top 5 Customer Likes:
${reviewInsights.topLikes || '(No data)'}

Top 5 Customer Dislikes:
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
        importantQuestions: ''
      });
    }
  };

  const handleFormat = () => {
    onChange({
      topLikes: formatText(reviewInsights.topLikes),
      topDislikes: formatText(reviewInsights.topDislikes),
      importantInsights: formatText(reviewInsights.importantInsights),
      importantQuestions: formatText(reviewInsights.importantQuestions)
    });
    setFormatted(true);
  };

  // Check if dislikes should show confidence chip
  const dislikesLines = parseLines(reviewInsights.topDislikes);
  const showDislikesChip = dislikesLines.length > 0 && dislikesLines.length < 3;

  const isEmbedded = variant === 'embedded';

  const content = (
    <>
      {/* Header with Toolbar - Only show in standalone mode */}
      {!isEmbedded && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Review Insights</h3>
            <p className="text-xs text-slate-400">Based on customer reviews</p>
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
              onClick={handleFormat}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/20 hover:border-emerald-500/70 transition-colors text-sm font-medium flex items-center gap-1.5"
              aria-label="Format text"
            >
              <Sparkles className="w-4 h-4" />
              {formatted ? 'Formatted ✓' : 'Format'}
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
          <button
            onClick={handleFormat}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/20 hover:border-emerald-500/70 transition-colors text-xs font-medium flex items-center gap-1.5"
            aria-label="Format text"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {formatted ? 'Formatted ✓' : 'Format'}
          </button>
        </div>
      )}
      
      {/* Insight Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <InsightCard
          title="Top 5 Customer Likes"
          subtitle="Based on customer reviews"
          value={reviewInsights.topLikes}
          onValueChange={(value) => handleChange('topLikes', value)}
          accentVariant="green"
          icon={<ThumbsUp className="w-5 h-5" />}
          placeholder="Enter the top 5 things customers like about this product..."
          cardType="likes"
        />
        
        <InsightCard
          title="Top 5 Customer Dislikes"
          subtitle="Based on customer reviews"
          value={reviewInsights.topDislikes}
          onValueChange={(value) => handleChange('topDislikes', value)}
          accentVariant="red"
          icon={<ThumbsDown className="w-5 h-5" />}
          placeholder="Enter the top 5 things customers dislike about this product..."
          cardType="dislikes"
          showConfidenceChip={showDislikesChip}
        />
        
        <InsightCard
          title="Important Insights"
          subtitle="Based on customer reviews"
          value={reviewInsights.importantInsights}
          onValueChange={(value) => handleChange('importantInsights', value)}
          accentVariant="amber"
          icon={<Lightbulb className="w-5 h-5" />}
          placeholder="Enter important insights from customer reviews..."
          cardType="insights"
        />
        
        <InsightCard
          title="Important Questions"
          subtitle="Based on customer reviews"
          value={reviewInsights.importantQuestions}
          onValueChange={(value) => handleChange('importantQuestions', value)}
          accentVariant="blue"
          icon={<HelpCircle className="w-5 h-5" />}
          placeholder="Enter important questions customers ask about this product..."
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

