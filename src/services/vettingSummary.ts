/**
 * Phase 2.3 — AI-generated vetting-results summary.
 *
 * Replaces the template "Mad-Libs" paragraph on the vetting results
 * page with a real Claude-authored summary that references the vetting
 * score AND the 5 Grow with FBA SSP categories
 * (Quantity / Functionality / Quality / Aesthetic / Bundle).
 *
 * Shape is locked by a tool-use schema so callers get validated JSON.
 * The summary is persisted to submissions.ai_summary and served from
 * there on subsequent loads (owner + public share both read the cache).
 */
import { runAnthropic, CLAUDE, defaultModelFor } from '@/lib/anthropic';

// ============================================================
// Input types (what the caller derives from a submission)
// ============================================================

export type VettingSummaryMetrics = {
  score: number;                 // 0-100
  status: 'PASS' | 'RISKY' | 'FAIL' | string;
  competitorCount: number;
  marketCapUsd: number;
  revenuePerCompetitor: number;
  top5MarketSharePct?: number;
  top5ReviewSharePct?: number;
  concentration?: {
    top1Share?: number;
    top3Share?: number;
    top5Share?: number;
  };
  avgTop5Reviews?: number;
  avgTop5Rating?: number;
  avgTop5AgeMonths?: number;
  avgBsrStability?: number;      // 0-1
  avgPriceStability?: number;    // 0-1
  competitorStrengthMix?: {
    strong: number;
    decent: number;
    weak: number;
  };
  fulfillmentSplit?: {
    fba?: number;
    fbm?: number;
    amazon?: number;
  };
  ageCohorts?: {
    new?: number;
    growing?: number;
    established?: number;
    mature?: number;
  };
  priceRange?: {
    min?: number;
    max?: number;
    median?: number;
  };
  redFlags?: string[];
  greenFlags?: string[];
};

// ============================================================
// Output types (what gets persisted to submissions.ai_summary)
// ============================================================

export type SspOpportunityCategory =
  | 'Quantity'
  | 'Functionality'
  | 'Quality'
  | 'Aesthetic'
  | 'Bundle';

export type AiVettingSummary = {
  model: string;
  generatedAt: string; // ISO timestamp
  headline: string;
  narrative: string;
  opportunityCategories: SspOpportunityCategory[];
  primaryRisks: string[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
};

// ============================================================
// Prompts (cacheable static blocks)
// ============================================================

const ROLE_MARKET_ANALYST = `Role:
You are an Amazon FBA market analyst who writes briefings for private-label sellers about to enter a niche. Many readers are launching their first product — write so a motivated first-time seller understands every sentence without needing a glossary. Every output is submitted via a tool call with a strict JSON schema.

Voice:
- Plain English. Short, concrete sentences. No MBA jargon, no military metaphors, no finance-speak.
- Ground every claim in the metrics provided. If a metric is absent, do not invent it.
- Sound like an experienced analyst explaining what they see to someone smart but new — neither condescending nor clubby.
- Dry honesty over hype. Say what is hard, what is promising, and why.

Banned phrases — these are jargon or metaphors that intimidate new sellers. Never use them; rewrite in plain English:
moat, review moat, top-heavy, defensible, entrench, entrenched, direct assault, floor is soft, ceiling is guarded, revenue per seat, wide-open, punch above, TAM, commoditize, commoditized.`;

const SSP_FRAMEWORK = `The 5 SSP categories — the Grow with FBA product-improvement framework:
- Quantity: multipack/case-pack variants of the same item (no accessories).
- Functionality: HOW the product works — mechanism, usability, size/shape, added features.
- Quality: material, durability, construction upgrades.
- Aesthetic: how the product LOOKS — color, pattern, finish, visual design.
- Bundle: small, lightweight, FBA-safe complementary add-ons.

When selecting opportunityCategories, pick the lanes where the market signal actually supports a seller edge. Empty array is a valid answer if nothing in the metrics points to a clear lane.`;

// ============================================================
// Tool schema (locks output shape)
// ============================================================

const VETTING_SUMMARY_TOOL = {
  name: 'submit_vetting_summary',
  description:
    'Submit the vetting-results summary. Output MUST match the schema. Do NOT restate raw numbers already visible in the UI (score, competitor count, revenue) unless the number itself is the point being made.',
  input_schema: {
    type: 'object' as const,
    properties: {
      headline: {
        type: 'string',
        description:
          'A one-line verdict for the seller. Max 120 characters. Plain English only — a first-time private-label seller must understand it without a glossary. No jargon, no metaphors. Examples: "Big sellers have most of the market — you will need a clearly better product to break in." / "Low competition and decent sales — a well-made entry has a real shot here." / "The top listings have huge review counts, so new products will take time to get noticed."',
      },
      narrative: {
        type: 'string',
        description:
          '2–4 plain-English sentences for the seller. Explain what the market looks like, what the best angle is, and what to watch out for. Reference specific metrics (not just the score). Do not restate the headline. Never use the phrase "this market" more than once. Write for a smart first-time seller — no jargon, no metaphors, no insider shorthand.',
      },
      opportunityCategories: {
        type: 'array',
        description:
          'Subset of the 5 SSP lanes where review/competitor signals point to a real seller edge. Empty array is a valid answer if no lane is clearly supported. Pick at most 3.',
        items: {
          type: 'string',
          enum: ['Quantity', 'Functionality', 'Quality', 'Aesthetic', 'Bundle'],
        },
      },
      primaryRisks: {
        type: 'array',
        description:
          '1–3 short, concrete risks the seller should weigh. Each risk is one short sentence. Avoid generic risks ("competition exists") — only list risks that the specific metrics support.',
        items: { type: 'string' },
      },
    },
    required: ['headline', 'narrative', 'opportunityCategories', 'primaryRisks'],
  },
} as const;

// ============================================================
// Public entry point
// ============================================================

export async function generateVettingSummary(args: {
  metrics: VettingSummaryMetrics;
  userId: string | null;
  submissionId?: string;
}): Promise<AiVettingSummary> {
  const { metrics, userId, submissionId } = args;

  const userPrompt = buildUserPrompt(metrics);
  const model = defaultModelFor('vetting_summary'); // Sonnet 4.6

  const response = await runAnthropic({
    userId,
    operation: 'vetting_summary_generate',
    taskKind: 'vetting_summary',
    model,
    system: [
      { text: ROLE_MARKET_ANALYST, cacheable: true },
      { text: SSP_FRAMEWORK, cacheable: true },
    ],
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 700,
    temperature: 0.4,
    tool: VETTING_SUMMARY_TOOL as any,
    metadata: submissionId ? { submissionId } : {},
  });

  const raw = (response.toolInput as Partial<AiVettingSummary>) || {};

  return {
    model,
    generatedAt: new Date().toISOString(),
    headline: sanitizeText(raw.headline, 200) || 'Market verdict unavailable',
    narrative: sanitizeText(raw.narrative, 2000) || '',
    opportunityCategories: sanitizeCategories(raw.opportunityCategories),
    primaryRisks: sanitizeRisks(raw.primaryRisks),
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
    },
  };
}

// ============================================================
// Prompt builder
// ============================================================

function buildUserPrompt(m: VettingSummaryMetrics): string {
  // Feed the model a compact, labeled JSON blob. Compact matters for
  // token cost, labels matter for grounding ("the model said 'stability
  // is low' — where did it get that?" traces back to this payload).
  const payload = {
    vetting_score: {
      score_pct: round(m.score, 1),
      status: m.status,
    },
    market_size: {
      competitor_count: m.competitorCount,
      market_cap_usd: round(m.marketCapUsd),
      revenue_per_competitor_usd: round(m.revenuePerCompetitor),
    },
    concentration: m.concentration
      ? {
          top1_share_pct: round(m.concentration.top1Share),
          top3_share_pct: round(m.concentration.top3Share),
          top5_share_pct: round(m.concentration.top5Share),
          top5_market_share_pct: round(m.top5MarketSharePct),
          top5_review_share_pct: round(m.top5ReviewSharePct),
        }
      : undefined,
    top5_competitors: {
      avg_reviews: round(m.avgTop5Reviews),
      avg_rating: round(m.avgTop5Rating, 1),
      avg_age_months: round(m.avgTop5AgeMonths, 1),
    },
    stability: {
      avg_bsr_stability_0_1: round(m.avgBsrStability, 2),
      avg_price_stability_0_1: round(m.avgPriceStability, 2),
    },
    competitor_quality: m.competitorStrengthMix,
    fulfillment_split_pct: m.fulfillmentSplit
      ? {
          fba: round(m.fulfillmentSplit.fba, 1),
          fbm: round(m.fulfillmentSplit.fbm, 1),
          amazon_direct: round(m.fulfillmentSplit.amazon, 1),
        }
      : undefined,
    listing_age_cohorts_pct: m.ageCohorts
      ? {
          new_0_6mo: round(m.ageCohorts.new, 1),
          growing_6_12mo: round(m.ageCohorts.growing, 1),
          established_12_24mo: round(m.ageCohorts.established, 1),
          mature_24mo_plus: round(m.ageCohorts.mature, 1),
        }
      : undefined,
    price_range_usd: m.priceRange
      ? {
          min: round(m.priceRange.min),
          median: round(m.priceRange.median),
          max: round(m.priceRange.max),
        }
      : undefined,
    flagged_risks: m.redFlags?.length ? m.redFlags : undefined,
    flagged_strengths: m.greenFlags?.length ? m.greenFlags : undefined,
  };

  return `Write a vetting-results briefing for the seller, grounded in the metrics below. Focus on what matters for a private-label entry decision: how defensible the market is, where the best angle is, and what to watch for.

Metrics:
${JSON.stringify(payload, null, 2)}

Remember:
- Do NOT repeat the raw score back to the seller — the UI shows it already.
- Reference at least one specific non-score metric in the narrative.
- Write in plain English. A first-time private-label seller must understand every sentence without googling a term.
- Do NOT use these phrases (too jargony — rewrite in plain English): moat, review moat, top-heavy, defensible, entrenched, direct assault, floor is soft, ceiling is guarded, revenue per seat, wide-open, punch above, TAM, commoditize, commoditized.
- opportunityCategories should name SSP lanes with actual supporting signal (e.g. low avg rating → Quality; uniform aesthetics → Aesthetic; high review concentration → Functionality or Bundle). Empty is fine if nothing is clear.
- primaryRisks should be concrete: say WHICH metric is the concern, not "competition is a risk". Describe the risk in plain English.`;
}

// ============================================================
// Output sanitization
// ============================================================

function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

const ALLOWED_CATEGORIES = new Set<SspOpportunityCategory>([
  'Quantity',
  'Functionality',
  'Quality',
  'Aesthetic',
  'Bundle',
]);

function sanitizeCategories(value: unknown): SspOpportunityCategory[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<SspOpportunityCategory>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    if (ALLOWED_CATEGORIES.has(entry as SspOpportunityCategory)) {
      seen.add(entry as SspOpportunityCategory);
    }
    if (seen.size >= 3) break;
  }
  return Array.from(seen);
}

function sanitizeRisks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((r) => (typeof r === 'string' ? r.trim() : ''))
    .filter(Boolean)
    .slice(0, 3);
}

function round(n: unknown, digits = 0): number | undefined {
  const num = Number(n);
  if (!Number.isFinite(num)) return undefined;
  const p = Math.pow(10, digits);
  return Math.round(num * p) / p;
}
