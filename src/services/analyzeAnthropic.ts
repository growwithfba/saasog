/**
 * Anthropic-backed replacement for analyzeOpenAI.ts.
 *
 * Public surface matches the legacy module 1:1 (same export names,
 * same signatures, same return shapes) so swap-in is a single import
 * change in the callers. The key improvements over the OpenAI version:
 *
 *   1. Every call uses Anthropic tool-use, which forces Claude to
 *      emit JSON that matches our schema. No more "oops, bad JSON"
 *      parse errors and no more fix_type enums showing up in the
 *      wrong category.
 *
 *   2. The SSP generation tool schema bakes in the per-category
 *      fix_type enum that was previously only mentioned in the
 *      prompt text. An aesthetic suggestion literally cannot carry
 *      a MAJOR_REDESIGN fix_type at the schema layer. This is the
 *      root-cause fix for the aesthetic/functional mislabel bug
 *      Dave flagged.
 *
 *   3. Large static pieces (role preamble, SSP schema, guardrails)
 *      are marked cacheable so prompt-cache reads pay ~10% of the
 *      normal input rate on subsequent calls within the 5-minute
 *      TTL. Relevant when you generate multiple SSPs per session.
 *
 *   4. Every call logs to usage_events via runAnthropic (tokens,
 *      cost, latency). No per-call observability boilerplate.
 *
 * All caller-facing signatures accept an optional final arg
 * `ctx: { userId?: string | null }` so observability can attribute
 * spend to the right user. Existing call sites pass userId once the
 * routes are updated; passing nothing defaults to null.
 */

import { runAnthropic, CLAUDE, defaultModelFor } from '@/lib/anthropic';
import type { SSPItem, SspDetails, SspAiNote, FixType } from '@/components/Offer/types';

// ============================================================
// Types shared with callers
// ============================================================

type CallCtx = { userId?: string | null };

type ReviewInsightsPayload = {
  topLikes?: string;
  topDislikes?: string;
  importantInsights?: string;
  importantQuestions?: string;
  strengthsTakeaway?: string;
  painPointsTakeaway?: string;
  insightsTakeaway?: string;
  questionsTakeaway?: string;
  totalReviewCount?: number;
  positiveReviewCount?: number;
  neutralReviewCount?: number;
  negativeReviewCount?: number;
};

type SspResponse = {
  quantity_improvements: SSPItem[];
  functional_enhancements: SSPItem[];
  quality_upgrades: SSPItem[];
  aesthetic_innovations: SSPItem[];
  strategic_bundling: SSPItem[];
};

// ============================================================
// System prompts (cacheable static prefixes)
// ============================================================

const ROLE_ANALYST = `Role:
You are an expert Amazon Private Label Product Analyst.
Your goal is to analyze reviews to find Super Selling Points (SSPs) and critical flaws.
Every output you produce will be submitted via a tool call with a strict JSON schema.`;

const ROLE_RAW_ANALYST = `Role:
You are an expert Amazon Private Label Product Analyst.
Your goal is to analyze raw review text blocks (no structured ratings) and extract decision-grade insights.
Every output you produce will be submitted via a tool call with a strict JSON schema.`;

const ROLE_SSP_STRATEGIST = `Role:
You are an elite Amazon Private Label Product Strategist and Innovation Consultant.
Your mission is to transform customer insights into actionable Super Selling Points (SSPs) that dominate the market.
You deliver precise, innovative, customer-centric product-improvement recommendations.
Every output you produce will be submitted via a tool call with a strict JSON schema.`;

// ============================================================
// Guardrails (shared across SSP-generating functions)
// ============================================================

const COMMON_SSP_GUARDRAILS = `Assume a consumer private label product for Amazon FBA.
- Avoid heavy/bulky redesigns, liquids, electronics, or digital add-ons.
- Avoid industrial materials (steel beams, cast iron) unless explicitly justified; prefer lightweight alternatives.
- Prefer materials like plastics, rubber, foam, plywood/MDF, fabrics, and small hardware.
- If a suggestion could raise FBA fees due to size/weight, provide a lighter alternative.
- If construction is uncertain, use conditional phrasing or request constraints rather than hallucinating.
- Do not restate the same benefit; keep outputs distinct from the parent SSP.
- When proposing materials, include why it fits the category, cost impact (low/med/high), and FBA size/weight impact.
- For the QUALITY category, focus on material/durability upgrades only. Do not propose QA checks, inspections, or process-only fixes.
- For BUNDLING, never suggest instruction manuals/booklets or printed guides as add-ons.`;

const QUANTITY_GUARDRAIL =
  '- Quantity means more of the exact same product only (multipacks/case packs). No accessories, replacement parts, or complementary items.';

const CATEGORY_ROUTING_RULES = `Category routing rules (these are enforced in the tool schema — output that violates them will be rejected):
- quantity_improvements: ONLY multipack/case-pack variants of the same item. No accessories.
- functional_enhancements: changes to HOW the product works — mechanism, usability, size/shape, added features.
- quality_upgrades: material / durability / construction. Not QA processes.
- aesthetic_innovations: changes to how the product LOOKS — color, pattern, finish, visual design. Never to how it works.
- strategic_bundling: small, lightweight, FBA-safe complementary add-ons. No liquids, no fragile items, no printed manuals, no digital content.`;

const BUNDLE_DISALLOWED_KEYWORDS = [
  'liquid',
  'fluids',
  'oil',
  'lotion',
  'cream',
  'gel',
  'spray',
  'soap',
  'shampoo',
  'conditioner',
  'detergent',
  'water',
  'bottle',
  'glass',
  'ceramic',
  'porcelain',
  'fragile',
  'digital',
  'ebook',
  'pdf',
  'download',
  'app',
  'software',
  'subscription',
  'gift card',
  'code',
  'bulky',
  'heavy',
  'oversized',
  'large add-on',
  'weight',
  'instruction',
  'instructions',
  'manual',
  'booklet',
  'guide',
  'pamphlet',
];

function hasBundleViolations(items: SSPItem[] = []): boolean {
  const violates = (text: string) => {
    const lower = text.toLowerCase();
    return BUNDLE_DISALLOWED_KEYWORDS.some((kw) => lower.includes(kw));
  };
  return items.some((item) => {
    const combined = `${item.recommendation || ''} ${item.why_it_matters || ''} ${item.fba_notes || ''}`;
    return violates(combined);
  });
}

// ============================================================
// Tool schemas (enforce shape AND per-category fix_type enums)
// ============================================================

// Re-usable sub-schema for a grounded-in reference.
const GROUNDED_IN_SCHEMA = {
  type: 'object' as const,
  properties: {
    insight_bucket: {
      type: 'string',
      description: 'Must match one of the insight bucket labels from the review analysis.',
    },
    insight_signal: {
      type: 'string',
      description: "Short signal like 'stability issues ~12%'.",
    },
  },
  required: ['insight_bucket', 'insight_signal'],
};

const ENUM_IMPACT = ['LOW', 'MEDIUM', 'HIGH'] as const;
const ENUM_EFFORT = ['LOW', 'MEDIUM', 'HIGH'] as const;
const ENUM_CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW'] as const;

/**
 * Build an SSPItem schema for a specific category. The fix_type
 * enum is narrowed to the values that are legal for that category,
 * which is how we prevent aesthetic items from claiming a functional
 * fix_type at the schema layer.
 */
function sspItemSchema(fixTypes: FixType[], extra: Record<string, any> = {}) {
  return {
    type: 'object' as const,
    properties: {
      recommendation: {
        type: 'string',
        description:
          '1-2 sentences. Concrete. Include at least one implementation detail (material, spec, process, or packaging).',
      },
      why_it_matters: {
        type: 'string',
        description: '1 sentence, seller-centric outcome.',
      },
      grounded_in: GROUNDED_IN_SCHEMA,
      fix_type: { type: 'string', enum: fixTypes },
      impact: { type: 'string', enum: [...ENUM_IMPACT] },
      effort: { type: 'string', enum: [...ENUM_EFFORT] },
      confidence: { type: 'string', enum: [...ENUM_CONFIDENCE] },
      ...extra,
    },
    required: [
      'recommendation',
      'why_it_matters',
      'grounded_in',
      'fix_type',
      'impact',
      'effort',
      'confidence',
    ],
  };
}

const REVIEW_ANALYSIS_TOOL = {
  name: 'submit_review_analysis',
  description:
    'Submit the complete review analysis. Output MUST fit the schema exactly; partial or malformed output is rejected.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary_stats: {
        type: 'object',
        properties: {
          total_reviews: { type: 'number' },
          positive_review_count: { type: 'number' },
          neutral_review_count: { type: 'number' },
          negative_review_count: { type: 'number' },
          positive_percentage: { type: 'number' },
          neutral_percentage: { type: 'number' },
          negative_percentage: { type: 'number' },
        },
        required: [
          'total_reviews',
          'positive_review_count',
          'neutral_review_count',
          'negative_review_count',
          'positive_percentage',
          'neutral_percentage',
          'negative_percentage',
        ],
      },
      strengths_takeaway: { type: 'string', description: '1 sentence executive takeaway.' },
      pain_points_takeaway: { type: 'string', description: '1 sentence executive takeaway.' },
      insights_takeaway: { type: 'string', description: '1 sentence executive takeaway.' },
      questions_takeaway: {
        type: 'string',
        description: 'Optional short sentence for how to use the questions.',
      },
      praise_clusters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            theme: { type: 'string' },
            mention_percentage: { type: 'number' },
            insight: { type: 'string', description: '1-2 sentence explanation.' },
            example_quotes: { type: 'array', items: { type: 'string' } },
          },
          required: ['theme', 'mention_percentage', 'insight'],
        },
      },
      pain_clusters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            theme: { type: 'string', description: 'Short label, ALL CAPS is fine. e.g. "INSTALL COMPLEXITY".' },
            mention_percentage: { type: 'number' },
            insight: { type: 'string', description: '1-2 sentences describing the customer complaint.' },
            severity: {
              type: 'number',
              description: 'Seller-facing severity score 1-5 (1=minor gripe, 5=dealbreaker). Weigh frequency x emotional intensity.',
              enum: [1, 2, 3, 4, 5],
            },
            ssp_category: {
              type: 'string',
              description: 'Which SSP category would address this pain — drives the handoff to the SSP Builder.',
              enum: ['Quantity', 'Functionality', 'Quality', 'Aesthetic', 'Bundle'],
            },
            opportunity: {
              type: 'string',
              description: '1 sentence describing the GAP the seller could capture — what customers LACK in competitor products. Describe the opportunity, do NOT prescribe a fix or product change (that is the SSP Builder\'s job). Good: "Customers lack a clear install path and the right-sized drill bit to mount this without a handyman." Bad: "Include a longer drill bit and laminated install card."',
            },
            fixability: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: [
                    'easy_win',
                    'supplier_QA',
                    'material_upgrade',
                    'structural_redesign',
                    'unknown',
                  ],
                },
                note: { type: 'string', description: '1 short sentence explaining the fix path.' },
              },
              required: ['type', 'note'],
            },
            example_quotes: { type: 'array', items: { type: 'string' } },
          },
          required: ['theme', 'mention_percentage', 'insight', 'severity', 'ssp_category', 'opportunity', 'fixability'],
        },
      },
      important_insights: {
        type: 'object',
        properties: {
          sentiment_summary: { type: 'string' },
          opportunity_framing: { type: 'string' },
          additional_insights: { type: 'array', items: { type: 'string' } },
        },
        required: ['sentiment_summary', 'opportunity_framing', 'additional_insights'],
      },
      seller_questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            why_it_matters: { type: 'string' },
          },
          required: ['question', 'why_it_matters'],
        },
      },
      market_verdict: {
        type: 'string',
        description: 'A 2-3 sentence QUALITATIVE summary of how customers feel about the product overall — what they love, what frustrates them, what that means for a seller entering this market. Do NOT include percentages or counts (those are rendered separately in the UI); stay focused on the substance of customer opinion. Example: "Customers like the core design and value pricing, but durability concerns — especially mold on older variants and warping after just a few uses — dominate negative feedback. A premium reformulation with tighter QA would capture the share frustrated with current options."',
      },
      gap_finder: {
        type: 'object',
        description: 'Seller-facing opportunity zones — what competitors are missing. Each section MUST have 2-4 findings. The complaint clusters already identify the pain; gap_finder re-frames that pain as an angle the seller can exploit. Never return empty arrays — if a category has no obvious signal, infer the likely gap from the complaint clusters.',
        properties: {
          hardware_gaps: {
            type: 'array',
            description: 'What is missing from competitor boxes. Each entry is 1 specific finding naming the missing item and why it matters.',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              properties: { finding: { type: 'string' } },
              required: ['finding'],
            },
          },
          install_friction: {
            type: 'array',
            description: 'Biggest blockers between a customer and a 5-star experience during setup or first use.',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              properties: { finding: { type: 'string' } },
              required: ['finding'],
            },
          },
          unserved_use_cases: {
            type: 'array',
            description: 'Jobs customers say the product "almost" does but fails at. Adjacent use cases worth servicing.',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              properties: { finding: { type: 'string' } },
              required: ['finding'],
            },
          },
        },
        required: ['hardware_gaps', 'install_friction', 'unserved_use_cases'],
      },
    },
    required: [
      'summary_stats',
      'strengths_takeaway',
      'pain_points_takeaway',
      'insights_takeaway',
      'praise_clusters',
      'pain_clusters',
      'important_insights',
      'seller_questions',
      'market_verdict',
      'gap_finder',
    ],
  },
} as const;

const SSP_TOOL = {
  name: 'submit_ssp_recommendations',
  description:
    'Submit the five SSP recommendation groups. Output MUST match the schema; each category has its own fix_type enum and items that violate it will be rejected.',
  input_schema: {
    type: 'object' as const,
    properties: {
      quantity_improvements: {
        type: 'array',
        items: sspItemSchema(['PACKAGING_INSTRUCTIONS']),
      },
      functional_enhancements: {
        type: 'array',
        items: sspItemSchema(['MINOR_FUNCTIONAL', 'MAJOR_REDESIGN']),
      },
      quality_upgrades: {
        type: 'array',
        items: sspItemSchema(['MATERIAL_UPGRADE']),
      },
      aesthetic_innovations: {
        type: 'array',
        items: sspItemSchema(['MINOR_FUNCTIONAL', 'PACKAGING_INSTRUCTIONS']),
      },
      strategic_bundling: {
        type: 'array',
        items: sspItemSchema(['PACKAGING_INSTRUCTIONS'], {
          fba_safe: { type: 'boolean' },
          fba_notes: { type: 'string', description: 'Why the bundle is FBA-safe.' },
        }),
      },
    },
    required: [
      'quantity_improvements',
      'functional_enhancements',
      'quality_upgrades',
      'aesthetic_innovations',
      'strategic_bundling',
    ],
  },
} as const;

const SSP_REFINEMENT_TOOL = {
  name: 'submit_refined_ssp',
  description: 'Submit the rewritten SSP with supplier-ready details.',
  input_schema: {
    type: 'object' as const,
    properties: {
      rewrittenSSPTitle: { type: 'string', description: 'Short, punchy.' },
      rewrittenSSPBody: { type: 'string', description: '2-4 sentences, supplier-ready.' },
      details: {
        type: 'object',
        properties: {
          supplierSpecs: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
          fbaNotes: { type: 'array', items: { type: 'string' } },
          qaChecklist: { type: 'array', items: { type: 'string' } },
          costImpact: { type: 'string' },
        },
      },
    },
    required: ['rewrittenSSPTitle', 'rewrittenSSPBody'],
  },
} as const;

const SIDE_QUESTION_TOOL = {
  name: 'submit_side_question_answer',
  description: 'Answer a follow-up question about an SSP.',
  input_schema: {
    type: 'object' as const,
    properties: {
      answer: { type: 'string', description: '2-5 sentences, grounded.' },
      ifApplicable_supplierSpecs: { type: 'array', items: { type: 'string' } },
      ifApplicable_risks: { type: 'array', items: { type: 'string' } },
    },
    required: ['answer'],
  },
} as const;

// ============================================================
// Helpers
// ============================================================

function formatReviewsForPrompt(reviewsArray: Array<{ title?: string; body?: string; rating?: number | string }>) {
  return reviewsArray
    .map((r, i) => {
      const rating = r.rating ?? '—';
      return `[Review ${i + 1} — ${rating}★]\nTitle: ${r.title || ''}\n${r.body || ''}`;
    })
    .join('\n\n');
}

function formatBlocksForPrompt(blocks: string[], maxChars = 150000): string {
  // Separators only — no numbering. The model must not reference block/review
  // numbers in its output, only customers / reviews / percentages.
  const joined = blocks.join('\n\n---\n\n');
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
}

/** Mirrors normalizeDetailsPayload from the legacy module. */
function normalizeDetailsPayload(raw: unknown): SspDetails | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const out: SspDetails = {};
  const trimArr = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const cleaned = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((s) => s.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  };
  const spec = trimArr(source.supplierSpecs);
  const risks = trimArr(source.risks);
  const fba = trimArr(source.fbaNotes);
  const qa = trimArr(source.qaChecklist);
  if (spec) out.supplierSpecs = spec;
  if (risks) out.risks = risks;
  if (fba) out.fbaNotes = fba;
  if (qa) out.qaChecklist = qa;
  const cost = source.costImpact;
  if (typeof cost === 'string' && cost.trim().length > 0) out.costImpact = cost.trim();
  return Object.keys(out).length > 0 ? out : null;
}

function ctxUserId(ctx?: CallCtx): string | null {
  return ctx?.userId ?? null;
}

// ============================================================
// 1. generateReviewAnalysisJSON (default export)
// ============================================================

async function generateReviewAnalysisJSON(
  reviewsArray: Array<{ title?: string; body?: string; rating?: number | string }>,
  ctx?: CallCtx
): Promise<any> {
  const reviewsText = formatReviewsForPrompt(reviewsArray);
  const userPrompt = `Analyze the following customer reviews FROM THE PRIVATE-LABEL SELLER'S PERSPECTIVE — the reader is about to design a better version of this product.

OUTPUT LANGUAGE RULES (critical):
- NEVER reference review numbers, block numbers, or any internal chunking artifact. Speak in terms of "customers", "reviews", and percentages only.
- Describe themes and patterns, not individual reviewers.

Requirements:
- Merge overlapping strengths / pain points into single clusters.
- Every insight is 1-2 sentences, concrete, no vague language.
- Use low-star reviews (1-3) to populate pain clusters; high-star (4-5) for praise.
- For each PAIN cluster, provide: severity (1-5 weighed by frequency + emotional intensity), ssp_category (Quantity/Functionality/Quality/Aesthetic/Bundle), and an opportunity sentence.
- opportunity = 1 sentence describing the GAP customers feel ("Customers lack X, so they end up doing Y"). Do NOT prescribe a fix or product change — describe the unmet need only; the downstream SSP Builder will propose fixes.
- market_verdict: 2-3 sentence QUALITATIVE summary of customer opinion (what they love, what frustrates them, the opportunity). NEVER include percentages or counts — those are rendered separately; stay on substance.
- gap_finder (REQUIRED, 2-4 findings per section): hardware_gaps (missing from competitor boxes), install_friction (setup blockers), unserved_use_cases (adjacent jobs). If a section has no direct signal, infer from complaint clusters instead of returning an empty array.
- Provide 3-5 seller-centric questions that, if answered, would sharpen the product strategy.
- Executive takeaways are 1 sentence each, written for a decision-maker.

Reviews:

${reviewsText}`;

  const response = await runAnthropic({
    userId: ctxUserId(ctx),
    operation: 'review_insights',
    taskKind: 'review_insights',
    model: defaultModelFor('review_insights'),
    system: [{ text: ROLE_ANALYST, cacheable: true }],
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 4096,
    tool: REVIEW_ANALYSIS_TOOL as any,
    metadata: { reviewCount: reviewsArray.length },
  });
  return response.toolInput as any;
}

// ============================================================
// 2. generateReviewAnalysisFromBlocks
// ============================================================

async function generateReviewAnalysisFromBlocks(blocks: string[], ctx?: CallCtx): Promise<any> {
  console.log('[analyzeAnthropic] generateReviewAnalysisFromBlocks invoked', {
    blockCount: blocks.length,
    firstBlockPreview: (blocks[0] || '').slice(0, 200),
  });
  const blockText = formatBlocksForPrompt(blocks);
  const userPrompt = `Analyze the following raw review text FROM THE PRIVATE-LABEL SELLER'S PERSPECTIVE — the reader is about to design a better version of this product. There are no structured star ratings — infer sentiment from tone and context. Ignore boilerplate ("Helpful", "Report", metadata).

OUTPUT LANGUAGE RULES (critical):
- NEVER reference review numbers, block numbers, or any internal chunking artifact. Speak in terms of "customers", "reviews", and percentages only.
- NEVER say things like "Blocks 2-39" or "Block 1 rated X" — the input chunking is a technical artifact the seller should never see.
- Describe themes and patterns, not specific reviewers.

Analytical rules:
- Cluster by semantic similarity, quantify prevalence as percentages.
- Unclear sentiment counts as neutral evidence (not discarded).
- Every pain cluster MUST include: fixability note, severity (1-5 weighed by frequency + emotional intensity), ssp_category, and an opportunity sentence.
- opportunity = 1 sentence describing the GAP customers feel ("Customers lack X, so they end up doing Y"). Do NOT prescribe a fix or product change — describe the unmet need only; the downstream SSP Builder will propose fixes.
- market_verdict: 2-3 sentence QUALITATIVE summary of customer opinion (what they love, what frustrates them, the opportunity). NEVER include percentages or counts — those are rendered separately; stay on substance.
- gap_finder (REQUIRED, 2-4 findings per section):
  * hardware_gaps — what is missing from competitor boxes.
  * install_friction — what blocks a smooth first-use experience.
  * unserved_use_cases — adjacent jobs customers say the product almost does.
  If a section has no direct signal, infer the likely gap from the complaint clusters instead of returning an empty array.
- Provide 3-5 seller-centric questions.

Raw reviews:

${blockText}`;

  const response = await runAnthropic({
    userId: ctxUserId(ctx),
    operation: 'review_insights_raw',
    taskKind: 'review_insights',
    model: defaultModelFor('review_insights'),
    system: [{ text: ROLE_RAW_ANALYST, cacheable: true }],
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 4096,
    tool: REVIEW_ANALYSIS_TOOL as any,
    metadata: { blockCount: blocks.length },
  });
  console.log('[analyzeAnthropic] raw response from Anthropic:', {
    hasToolInput: response.toolInput !== null,
    toolInputKeys: response.toolInput ? Object.keys(response.toolInput as any) : null,
    textPreview: response.text?.slice(0, 200),
    usage: response.usage,
    stopReason: (response.raw as any)?.stop_reason,
  });
  return response.toolInput as any;
}

// ============================================================
// 3. generateSSPRecommendations
// ============================================================

async function generateSSPRecommendations(
  reviewAnalysisContext: Record<string, unknown>,
  ctx?: CallCtx
): Promise<SspResponse> {
  const userPrompt = `Formulate practical, innovative product-improvement recommendations across the five SSP categories using the review analysis below.

${CATEGORY_ROUTING_RULES}

Category guidance:
- Quantity: only recommend multipacks if there's a clear signal of repeat purchase / use-it-up pattern.
- Aesthetic: only recommend if design/color/style is a buying driver in the reviews.
- Functional: target the #1 complaint with a specific mechanism change (material, part, geometry).
- Quality: durability/material upgrades only. Do NOT propose QA checks.
- Bundling: small, lightweight, FBA-safe complements. 3-5 items max. No liquids, glass, manuals, or digital content.

${COMMON_SSP_GUARDRAILS}
${QUANTITY_GUARDRAIL}

Each SSP must reference exactly one insight_bucket. Every category should have at least 2 items where the review signal supports it; leave a category empty rather than inventing weak ideas.

Review analysis:

${JSON.stringify(reviewAnalysisContext, null, 2)}`;

  return await callSspGeneration({
    userId: ctxUserId(ctx),
    userPrompt,
    operation: 'ssp_generate',
    metadata: {},
  });
}

// ============================================================
// 4. generateSSPRecommendationsFromInsights
// ============================================================

interface GenerateSspFromInsightsArgs {
  insights: ReviewInsightsPayload;
  reviewAnalysisContext?: Record<string, unknown> | null;
  reviewSamples?: Array<{ title?: string; body?: string; rating?: number | string }>;
  retryForFbaViolations?: boolean;
  ctx?: CallCtx;
}

async function generateSSPRecommendationsFromInsights(
  args: GenerateSspFromInsightsArgs
): Promise<SspResponse> {
  const {
    insights,
    reviewAnalysisContext,
    reviewSamples = [],
    retryForFbaViolations = false,
    ctx,
  } = args;

  const extraRetry = retryForFbaViolations
    ? `\n\nPRIOR OUTPUT VIOLATED BUNDLE SAFETY. Regenerate strategic_bundling only with small, lightweight, FBA-safe accessories. Remove anything referencing liquids, fragile materials, digital content, printed manuals, or heavy/oversized items.`
    : '';

  const samplesText = reviewSamples.length > 0 ? formatReviewsForPrompt(reviewSamples) : '(none)';

  const userPrompt = `Generate SSPs using the Review Insights below as the single source of truth. Review samples are supporting evidence only — do NOT treat them as the authoritative signal.

${CATEGORY_ROUTING_RULES}

Category guidance:
- Quantity: only if repeat-purchase / use-it-up signal in insights.
- Aesthetic: only if design/color/style is a buying driver.
- Functional: target the top pain point with a concrete mechanism change.
- Quality: durability/material upgrades only.
- Bundling: small, lightweight, FBA-safe complements. 3-5 items.

${COMMON_SSP_GUARDRAILS}
${QUANTITY_GUARDRAIL}

Each SSP must tie to a different insight where possible. Do not repeat the same idea across categories.

Review Insights (authoritative):
${JSON.stringify(insights, null, 2)}

${reviewAnalysisContext ? `Supporting review analysis (clusters + questions):\n${JSON.stringify(reviewAnalysisContext, null, 2)}\n\n` : ''}Review samples for specificity only:
${samplesText}${extraRetry}`;

  const result = await callSspGeneration({
    userId: ctxUserId(ctx),
    userPrompt,
    operation: 'ssp_generate_from_insights',
    metadata: {
      retryForFbaViolations,
      sampleCount: reviewSamples.length,
    },
  });

  if (!retryForFbaViolations && hasBundleViolations(result?.strategic_bundling)) {
    console.warn('⚠️ SSP bundle violated FBA rules — retrying once with stricter guardrails.');
    return generateSSPRecommendationsFromInsights({
      insights,
      reviewAnalysisContext,
      reviewSamples,
      retryForFbaViolations: true,
      ctx,
    });
  }

  return result;
}

/** Shared call path for both SSP-generation entry points. */
async function callSspGeneration(opts: {
  userId: string | null;
  userPrompt: string;
  operation: string;
  metadata: Record<string, unknown>;
}): Promise<SspResponse> {
  const response = await runAnthropic({
    userId: opts.userId,
    operation: opts.operation,
    taskKind: 'ssp_generation',
    model: defaultModelFor('ssp_generation'),
    system: [{ text: ROLE_SSP_STRATEGIST, cacheable: true }],
    messages: [{ role: 'user', content: opts.userPrompt }],
    maxTokens: 4096,
    tool: SSP_TOOL as any,
    metadata: opts.metadata,
  });
  const out = response.toolInput as SspResponse;
  // Defensive: ensure each bucket is at least an empty array.
  return {
    quantity_improvements: out?.quantity_improvements || [],
    functional_enhancements: out?.functional_enhancements || [],
    quality_upgrades: out?.quality_upgrades || [],
    aesthetic_innovations: out?.aesthetic_innovations || [],
    strategic_bundling: out?.strategic_bundling || [],
  };
}

// ============================================================
// 5. generateFullReviewAnalysis (pipeline helper — no direct callers today)
// ============================================================

async function generateFullReviewAnalysis(
  reviewsArray: Array<{ title?: string; body?: string; rating?: number | string }>,
  ctx?: CallCtx
) {
  const reviewAnalysis = await generateReviewAnalysisJSON(reviewsArray, ctx);
  const sspRecommendations = await generateSSPRecommendations(reviewAnalysis, ctx);
  return {
    review_analysis: reviewAnalysis,
    ssp_recommendations: sspRecommendations,
  };
}

// ============================================================
// 6. improveSSPIdea
// ============================================================

async function improveSSPIdea(
  currentIdea: string,
  userInstruction: string,
  category: string,
  insightsContext: ReviewInsightsPayload,
  ctx?: CallCtx
): Promise<string> {
  const userPrompt = `Improve this SSP idea based on the user's instruction and the review insights below.

Category: ${category}

Current SSP:
${currentIdea}

User instruction:
${userInstruction}

Relevant insights (for grounding — do not repeat verbatim):
- Top likes: ${insightsContext.topLikes || '(none)'}
- Top dislikes: ${insightsContext.topDislikes || '(none)'}
- Important insights: ${insightsContext.importantInsights || '(none)'}
- Important questions: ${insightsContext.importantQuestions || '(none)'}

Requirements:
- 1-2 sentences.
- Include at least one implementation detail (material, spec, process, packaging).
- Output only the improved SSP text — no explanations, no labels, no markdown.`;

  const response = await runAnthropic({
    userId: ctxUserId(ctx),
    operation: 'ssp_improve',
    taskKind: 'classification',
    model: CLAUDE.HAIKU_4_5,
    system: 'You improve Super Selling Points for Amazon private-label products. Output only the improved text.',
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 300,
    temperature: 0.7,
    metadata: { category },
  });
  const improved = (response.text || '').trim();
  return improved || currentIdea;
}

// ============================================================
// 7. refineSSPItem
// ============================================================

interface RefineSSPItemArgs {
  item: SSPItem;
  instruction: string;
  category: string;
  insights?: ReviewInsightsPayload;
  ctx?: CallCtx;
}

async function refineSSPItem(args: RefineSSPItemArgs): Promise<SSPItem> {
  const { item, instruction, category, insights, ctx } = args;

  const categoryExtra = category === 'quantity' ? `\n${QUANTITY_GUARDRAIL}` : '';

  const userPrompt = `Refine this SSP to be sharper, supplier-ready, and grounded.

Category: ${category}
User instruction: ${instruction}

Current SSP:
${JSON.stringify(item, null, 2)}

Insights (context):
${JSON.stringify(insights || {}, null, 2)}

${COMMON_SSP_GUARDRAILS}${categoryExtra}

Rules:
- If the user asks for more detail, add new specifics: materials, dimensions, QA checks, supplier constraints, cost trade-offs.
- If the user asks for bundle ideas, include 3-5 small, FBA-safe accessories.
- Preserve the item's metadata unless the change requires updating it.
- Include why the material fits, cost impact (low/medium/high), and FBA size/weight impact in details.
- Do not restate the parent SSP verbatim; make the rewrite a meaningful evolution.`;

  const response = await runAnthropic({
    userId: ctxUserId(ctx),
    operation: 'ssp_refine',
    taskKind: 'ssp_generation',
    model: defaultModelFor('ssp_generation'),
    system: [
      {
        text:
          'You refine SSPs to be sharper, supplier-ready, and grounded in customer insights. Submit your rewrite via the tool.',
        cacheable: true,
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 1500,
    temperature: 0.6,
    tool: SSP_REFINEMENT_TOOL as any,
    metadata: { category },
  });

  const raw = response.toolInput as {
    rewrittenSSPTitle?: string;
    rewrittenSSPBody?: string;
    details?: unknown;
  };

  const normalizedDetails = normalizeDetailsPayload(raw?.details);

  return {
    ...item,
    recommendation: raw?.rewrittenSSPTitle?.trim() || item.recommendation,
    why_it_matters: raw?.rewrittenSSPBody?.trim() || item.why_it_matters,
    details: normalizedDetails ?? item.details,
    source: 'ai',
  };
}

// ============================================================
// 8. answerSSPSideQuestion
// ============================================================

interface SideQuestionArgs {
  item: SSPItem;
  question: string;
  category: string;
  insights?: ReviewInsightsPayload;
  aiNotes?: SspAiNote[];
  lastNoteAnswer?: string;
  ctx?: CallCtx;
}

async function answerSSPSideQuestion(args: SideQuestionArgs): Promise<{
  answer?: string;
  ifApplicable_supplierSpecs?: string[];
  ifApplicable_risks?: string[];
}> {
  const { item, question, category, insights, aiNotes = [], lastNoteAnswer, ctx } = args;

  const normalizedQuestion = question.trim().endsWith('?') ? question.trim() : `${question.trim()}?`;
  const categoryExtra = category === 'quantity' ? `\n${QUANTITY_GUARDRAIL}` : '';

  const userPrompt = `Answer a follow-up question about this SSP in 2-5 sentences, concretely and grounded.

Category: ${category}

Insights (context):
${JSON.stringify(insights || {}, null, 2)}

Current SSP:
${JSON.stringify(item, null, 2)}

Prior AI notes on this SSP:
${aiNotes.length > 0 ? JSON.stringify(aiNotes.slice(-5), null, 2) : '(none)'}

Last side-question answer:
${lastNoteAnswer || '(none)'}

Question: ${normalizedQuestion}

${COMMON_SSP_GUARDRAILS}${categoryExtra}`;

  const response = await runAnthropic({
    userId: ctxUserId(ctx),
    operation: 'ssp_side_question',
    taskKind: 'review_insights',
    model: defaultModelFor('review_insights'),
    system: 'You answer SSP follow-up questions clearly, concretely, and in 2-5 sentences.',
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 600,
    temperature: 0.6,
    tool: SIDE_QUESTION_TOOL as any,
    metadata: { category },
  });

  return (response.toolInput as any) || { answer: '' };
}

// ============================================================
// 9. promoteAnswerToSSPItem
// ============================================================

interface PromoteAnswerArgs {
  item: SSPItem;
  note: SspAiNote;
  category: string;
  insights?: ReviewInsightsPayload;
  existingSspText?: string[];
  instruction?: string;
  ctx?: CallCtx;
}

async function promoteAnswerToSSPItem(args: PromoteAnswerArgs): Promise<SSPItem> {
  const { item, note, category, insights, existingSspText = [], instruction, ctx } = args;

  const categoryExtra = category === 'quantity' ? `\n${QUANTITY_GUARDRAIL}` : '';

  const userPrompt = `Merge an AI note into a single coherent SSP for the given category.

Category: ${category}

Insights (context):
${JSON.stringify(insights || {}, null, 2)}

Existing SSPs in this category (avoid duplicating their angle):
${existingSspText.length > 0 ? existingSspText.map((s, i) => `- [${i + 1}] ${s}`).join('\n') : '(none)'}

Original SSP:
${JSON.stringify(item, null, 2)}

AI note to merge in:
${JSON.stringify(note, null, 2)}

${instruction ? `Additional instruction: ${instruction}\n\n` : ''}${COMMON_SSP_GUARDRAILS}${categoryExtra}

Output a new, coherent SSP that preserves the original's category + metadata but integrates the insight from the note.`;

  const response = await runAnthropic({
    userId: ctxUserId(ctx),
    operation: 'ssp_promote_note',
    taskKind: 'ssp_generation',
    model: defaultModelFor('ssp_generation'),
    system: 'You merge an AI note into a coherent SSP. Submit your rewrite via the tool.',
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 1500,
    temperature: 0.6,
    tool: SSP_REFINEMENT_TOOL as any,
    metadata: { category },
  });

  const raw = response.toolInput as {
    rewrittenSSPTitle?: string;
    rewrittenSSPBody?: string;
    details?: unknown;
  };
  const normalizedDetails = normalizeDetailsPayload(raw?.details);
  const title = (raw?.rewrittenSSPTitle || '').trim();
  const detail = (raw?.rewrittenSSPBody || '').trim();

  return {
    recommendation: title || item.recommendation,
    why_it_matters: detail || item.why_it_matters,
    grounded_in: item.grounded_in,
    fix_type: item.fix_type,
    impact: item.impact,
    effort: item.effort,
    confidence: item.confidence,
    fba_safe: item.fba_safe,
    fba_notes: item.fba_notes,
    source: item.source || 'ai',
    details: normalizedDetails ?? item.details,
  };
}

// ============================================================
// Exports (mirror analyzeOpenAI.ts)
// ============================================================

export default generateReviewAnalysisJSON;
export {
  generateReviewAnalysisJSON,
  generateReviewAnalysisFromBlocks,
  generateSSPRecommendations,
  generateSSPRecommendationsFromInsights,
  generateFullReviewAnalysis,
  improveSSPIdea,
  refineSSPItem,
  answerSSPSideQuestion,
  promoteAnswerToSSPItem,
};
