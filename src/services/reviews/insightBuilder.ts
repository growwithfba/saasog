/**
 * Phase 2.5 — shared transformation from Anthropic analysis → the
 * `offer_products.insights` shape the UI consumes.
 *
 * Extracted from the inline logic in
 * src/app/api/offer/analyze-reviews/route.ts (lines ~787-1151) so the
 * new pull-reviews route can reuse it without duplication. Output
 * shape matches exactly — callers expect the same `reviewInsights`
 * object regardless of whether reviews came from a manual CSV upload
 * or a SerpAPI multi-ASIN pull.
 *
 * Consumers (kept in sync):
 *   - ReviewInsightsPanel.tsx reads the structured fields
 *     (marketSnapshot, topThemes, majorComplaints, whatIsWorking, gapFinder)
 *   - SspBuilderHubTab.tsx reads the legacy string fields
 *     (topLikes, topDislikes, importantInsights, importantQuestions).
 *   See memory reference_review_insights_shape.md for the coupling rules.
 */

export interface AnalysisLike {
  summary_stats?: {
    total_reviews?: number;
    positive_review_count?: number;
    neutral_review_count?: number;
    negative_review_count?: number;
    positive_percentage?: number;
    neutral_percentage?: number;
    negative_percentage?: number;
  } | null;
  praise_clusters?: any[];
  pain_clusters?: any[];
  important_insights?: any;
  market_verdict?: string;
  seller_questions?: any[];
  strengths_takeaway?: string;
  pain_points_takeaway?: string;
  insights_takeaway?: string;
  questions_takeaway?: string;
  gap_finder?: any;
  cross_cutting_insights?: any;
}

export interface ReviewCounts {
  total: number;
  positive?: number;
  neutral?: number;
  negative?: number;
}

const ALLOWED_SSP_CATEGORIES = new Set(['Quantity', 'Functionality', 'Quality', 'Aesthetic', 'Bundle']);

function formatPercent(value: any): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function percentClause(percent: number | null): string {
  if (percent === null) return '';
  if (percent >= 80) return `, showing up in most reviews (around ${percent}%)`;
  if (percent >= 20) {
    const inTen = Math.max(1, Math.min(9, Math.round(percent / 10)));
    return `, with roughly ${inTen} in 10 reviewers mentioning it`;
  }
  return `, appearing in a smaller but meaningful share of reviews (around ${percent}%)`;
}

function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return matches ? matches.map((s) => s.trim()).filter(Boolean) : [];
}

function ensureSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function frequencyLabel(percent: number | null): string {
  if (percent === null) return '';
  if (percent >= 25) return 'Main complaint';
  if (percent >= 10) return 'Frequent complaint';
  if (percent >= 3) return 'Occasionally mentioned';
  return 'Rare mention';
}

function buildClusterLead(theme: string, index: number, type: 'strength' | 'pain'): string {
  if (type === 'strength') {
    if (index === 0) return `${theme} stands out as the most consistent strength`;
    if (index === 1) return `${theme} is another frequently praised strength`;
    if (index === 2) return `${theme} shows up as a recurring positive theme`;
    if (index === 3) return `${theme} appears as a secondary strength`;
    return `${theme} is a less common but still positive signal`;
  }
  if (index === 0) return `${theme} emerges as the most common pain point`;
  if (index === 1) return `${theme} is a frequent frustration`;
  if (index === 2) return `${theme} surfaces regularly in critical feedback`;
  if (index === 3) return `${theme} is an occasional but notable issue`;
  return `${theme} shows up in a smaller slice of complaints`;
}

function buildClusterLine(cluster: any, index: number, type: 'strength' | 'pain'): string {
  const percent = formatPercent(cluster?.mention_percentage);
  const theme = cluster?.theme ? cluster.theme.toString().trim() : 'This theme';
  const insightText = cluster?.insight ? cluster.insight.toString().trim() : '';
  const sentences = splitSentences(insightText);
  const baseSentence = sentences[0]?.replace(/[.!?]+$/, '');
  const lead = buildClusterLead(theme, index, type);
  const clause = percentClause(percent);
  let line = baseSentence ? `${lead}${clause}, ${baseSentence}.` : `${lead}${clause}.`;

  if (sentences.length > 1) line = `${line} ${sentences[1]}`;

  if (type === 'pain') {
    const fixabilityNote = cluster?.fixability?.note ? cluster.fixability.note.toString().trim() : '';
    const fixabilitySentence = ensureSentence(fixabilityNote);
    if (fixabilitySentence) line = `${line} ${fixabilitySentence}`;
    const label = frequencyLabel(percent);
    if (label) line = `${line.replace(/[.!?]$/, '')} (${label}).`;
  }
  return line;
}

function buildCrossCuttingLine(insight: any): string {
  const percent = formatPercent(insight?.supporting_percentage);
  const insightText = insight?.insight ? insight.insight.toString().trim() : '';
  const sentences = splitSentences(insightText);
  const baseSentence = sentences[0]?.replace(/[.!?]+$/, '');
  let line = baseSentence ? `${baseSentence}.` : '';
  if (sentences.length > 1) line = `${line} ${sentences[1]}`;
  if (percent !== null) {
    line = line
      ? `${line.replace(/[.!?]$/, '')} (around ${percent}% of reviews).`
      : `This pattern appears in around ${percent}% of reviews.`;
  }
  return line;
}

function clampSeverity(value: any): 1 | 2 | 3 | 4 | 5 {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 3;
  if (n < 1) return 1;
  if (n > 5) return 5;
  return n as 1 | 2 | 3 | 4 | 5;
}

function sanitizeQuotes(quotes: any): string[] {
  if (!Array.isArray(quotes)) return [];
  return quotes.map((q) => (typeof q === 'string' ? q.trim() : '')).filter(Boolean).slice(0, 3);
}

function mapGapFindings(arr: any): { finding: string }[] {
  return (Array.isArray(arr) ? arr : [])
    .map((item: any) => (item?.finding ? item.finding.toString().trim() : ''))
    .filter(Boolean)
    .slice(0, 4)
    .map((finding: string) => ({ finding }));
}

function summaryLineFromStats(stats: AnalysisLike['summary_stats'], counts: ReviewCounts): string {
  if (!stats) return '';
  const total = counts.total || Number(stats.total_reviews) || 0;
  const pct = (raw: any, count: number | undefined): number | null => {
    const d = Number(raw);
    if (Number.isFinite(d) && d >= 0) return Math.round(d);
    if (typeof count === 'number' && total > 0) return Math.round((count / total) * 100);
    return null;
  };
  const positive = pct(stats.positive_percentage, counts.positive);
  const neutral = pct(stats.neutral_percentage, counts.neutral);
  const negative = pct(stats.negative_percentage, counts.negative);
  const parts = [
    positive !== null ? `${positive}% positive` : null,
    neutral !== null ? `${neutral}% neutral` : null,
    negative !== null ? `${negative}% negative` : null,
  ].filter(Boolean);
  if (parts.length === 0) return '';
  return `Overall sentiment skews ${positive !== null && positive >= 60 ? 'positive' : 'mixed'}, with ${parts.join(', ')} across the review set.`;
}

/**
 * Build the `reviewInsights` payload persisted to
 * offer_products.insights and returned to the UI.
 */
export function buildReviewInsights(
  analysis: AnalysisLike,
  opts: { reviewCounts: ReviewCounts; totalReviewCount: number }
) {
  const { reviewCounts, totalReviewCount } = opts;
  const summaryStats = analysis?.summary_stats || null;
  const praiseClusters = Array.isArray(analysis?.praise_clusters) ? analysis!.praise_clusters : [];
  const painClusters = Array.isArray(analysis?.pain_clusters) ? analysis!.pain_clusters : [];
  const importantInsightsBlock = analysis?.important_insights || null;
  const sellerQuestions = Array.isArray(analysis?.seller_questions) ? analysis!.seller_questions : [];

  // --- Legacy string fields (still read by SspBuilderHubTab) ---
  const topLikes = praiseClusters
    .map((c: any, i: number) => `${i + 1}. ${buildClusterLine(c, i, 'strength')}`)
    .join('\n');
  const topDislikes = painClusters
    .map((c: any, i: number) => `${i + 1}. ${buildClusterLine(c, i, 'pain')}`)
    .join('\n');

  const sentimentSummary = importantInsightsBlock?.sentiment_summary
    ? importantInsightsBlock.sentiment_summary.toString().trim()
    : summaryLineFromStats(summaryStats, reviewCounts);
  const opportunityFraming = importantInsightsBlock?.opportunity_framing
    ? importantInsightsBlock.opportunity_framing.toString().trim()
    : '';
  const additionalInsights = Array.isArray(importantInsightsBlock?.additional_insights)
    ? importantInsightsBlock.additional_insights
    : [];
  const fallbackCrossCutting = Array.isArray(analysis?.cross_cutting_insights)
    ? analysis!.cross_cutting_insights.map((x: any) => buildCrossCuttingLine(x))
    : [];

  const importantInsights = [
    sentimentSummary,
    opportunityFraming,
    ...additionalInsights.map((x: any) => (x ? x.toString().trim() : '')).filter(Boolean),
    ...fallbackCrossCutting,
  ]
    .filter(Boolean)
    .join('\n');

  const importantQuestions = sellerQuestions
    .map((q: any, i: number) => {
      const raw = q?.question ? q.question.toString().trim() : 'What product decision would most improve outcomes?';
      const questionText = raw.endsWith('?') ? raw : `${raw}?`;
      const whyText = q?.why_it_matters ? q.why_it_matters.toString().trim() : '';
      const whySentence = whyText ? ensureSentence(whyText).replace(/[.!?]+$/, '') : '';
      const whyDisplay = whySentence ? `Why it matters: ${whySentence}` : '';
      return `${i + 1}. ${questionText}${whyDisplay ? ` || ${whyDisplay}` : ''}`;
    })
    .join('\n');

  // --- Phase 2.2b structured fields ---
  const majorComplaints = painClusters
    .map((cluster: any) => {
      const complaintText = [cluster?.theme, cluster?.insight]
        .map((s: any) => (s ? s.toString().trim() : ''))
        .filter(Boolean)
        .join(' — ');
      const rawCategory = cluster?.ssp_category ? cluster.ssp_category.toString().trim() : '';
      const sspCategory = ALLOWED_SSP_CATEGORIES.has(rawCategory) ? rawCategory : 'Functionality';
      const opportunity = cluster?.opportunity
        ? cluster.opportunity.toString().trim()
        : cluster?.seller_angle
          ? cluster.seller_angle.toString().trim()
          : '';
      const mentionPercent = formatPercent(cluster?.mention_percentage) ?? 0;
      return {
        complaint: complaintText || (cluster?.insight ? cluster.insight.toString().trim() : ''),
        opportunity,
        sspCategory,
        severity: clampSeverity(cluster?.severity),
        mentionPercent,
        exampleQuotes: sanitizeQuotes(cluster?.example_quotes),
      };
    })
    .filter((c: any) => c.complaint)
    .sort((a: any, b: any) => b.severity - a.severity || b.mentionPercent - a.mentionPercent)
    .slice(0, 6);

  const whatIsWorking = praiseClusters
    .map((c: any) => {
      const theme = c?.theme ? c.theme.toString().trim() : '';
      const insight = c?.insight ? c.insight.toString().trim() : '';
      if (theme && insight) return `${theme} — ${insight}`;
      return theme || insight;
    })
    .filter(Boolean)
    .slice(0, 5);

  const toThemeChip = (cluster: any, sentiment: 'positive' | 'negative') => {
    const label = cluster?.theme ? cluster.theme.toString().trim() : '';
    const mentionPercent = formatPercent(cluster?.mention_percentage) ?? 0;
    return label ? { label, mentionPercent, sentiment } : null;
  };
  const topThemes = [
    ...painClusters.map((c: any) => toThemeChip(c, 'negative')),
    ...praiseClusters.map((c: any) => toThemeChip(c, 'positive')),
  ]
    .filter(Boolean)
    .sort((a: any, b: any) => (b as any).mentionPercent - (a as any).mentionPercent)
    .slice(0, 6);

  const gapFinder = {
    hardwareGaps: mapGapFindings(analysis?.gap_finder?.hardware_gaps),
    installFriction: mapGapFindings(analysis?.gap_finder?.install_friction),
    unservedUseCases: mapGapFindings(analysis?.gap_finder?.unserved_use_cases),
  };

  const negativeThemePercent = (() => {
    if (!painClusters.length) return undefined;
    const total = painClusters.reduce((sum: number, c: any) => {
      const n = Number(c?.mention_percentage);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    return Math.min(100, Math.round(total / painClusters.length));
  })();

  const pickPct = (raw: any, count: number | undefined): number | undefined => {
    const direct = Number(raw);
    if (Number.isFinite(direct) && direct >= 0) return Math.round(direct);
    if (typeof count === 'number' && totalReviewCount > 0) {
      return Math.round((count / totalReviewCount) * 100);
    }
    return undefined;
  };
  let positivePercent = pickPct(summaryStats?.positive_percentage, reviewCounts.positive);
  let neutralPercent = pickPct(summaryStats?.neutral_percentage, reviewCounts.neutral);
  let negativePercent = pickPct(summaryStats?.negative_percentage, reviewCounts.negative);
  if ([positivePercent, neutralPercent, negativePercent].some((v) => typeof v === 'number')) {
    positivePercent = positivePercent ?? 0;
    neutralPercent = neutralPercent ?? 0;
    negativePercent = negativePercent ?? 0;
    const sumPct = positivePercent + neutralPercent + negativePercent;
    if (sumPct > 0 && sumPct !== 100) {
      const drift = 100 - sumPct;
      const max = Math.max(positivePercent, neutralPercent, negativePercent);
      if (max === positivePercent) positivePercent += drift;
      else if (max === neutralPercent) neutralPercent += drift;
      else negativePercent += drift;
    }
  }

  const verdictText =
    (analysis?.market_verdict?.toString().trim()) ||
    (importantInsightsBlock?.sentiment_summary ? importantInsightsBlock.sentiment_summary.toString().trim() : '') ||
    '';

  const marketSnapshot = {
    verdict: verdictText,
    reviewCount: totalReviewCount || 0,
    negativeThemePercent,
    positivePercent,
    neutralPercent,
    negativePercent,
  };

  return {
    marketSnapshot,
    topThemes,
    majorComplaints,
    whatIsWorking,
    gapFinder,
    topLikes,
    topDislikes,
    importantInsights,
    importantQuestions,
    strengthsTakeaway: analysis?.strengths_takeaway || '',
    painPointsTakeaway: analysis?.pain_points_takeaway || '',
    insightsTakeaway: analysis?.insights_takeaway || '',
    questionsTakeaway: analysis?.questions_takeaway || '',
    totalReviewCount,
    positiveReviewCount: reviewCounts.positive,
    neutralReviewCount: reviewCounts.neutral,
    negativeReviewCount: reviewCounts.negative,
  };
}
