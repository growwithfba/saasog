import OpenAI from 'openai';

// Validate API key before initializing client
if (!process.env.OPENAI_SECRET_KEY) {
  console.error('❌ OPENAI_SECRET_KEY is not set in environment variables');
}

const openai = process.env.OPENAI_SECRET_KEY 
  ? new OpenAI({
      apiKey: process.env.OPENAI_SECRET_KEY,
    })
  : null;

// 1. ESTRUCTURA DE SALIDA (JSON SCHEMA) - Review Analysis
const JSON_STRUCTURE_INSTRUCTION = `
Output strictly in valid JSON format using the following structure:
{
  "summary_stats": {
    "total_reviews": number,
    "positive_review_count": number,
    "neutral_review_count": number,
    "negative_review_count": number,
    "positive_percentage": number,
    "neutral_percentage": number,
    "negative_percentage": number
  },
  "strengths_takeaway": "1 sentence executive takeaway",
  "pain_points_takeaway": "1 sentence executive takeaway",
  "insights_takeaway": "1 sentence executive takeaway",
  "questions_takeaway": "Optional short sentence for how to use the questions",
  "praise_clusters": [
    {
      "theme": "string",
      "mention_percentage": number,
      "insight": "1–2 sentence explanation of why customers like this",
      "example_quotes": ["optional short quote"]
    }
  ],
  "pain_clusters": [
    {
      "theme": "string",
      "mention_percentage": number,
      "insight": "1–2 sentence explanation of the issue and its impact",
      "fixability": {
        "type": "easy_win | supplier_QA | material_upgrade | structural_redesign | unknown",
        "note": "1 short sentence explaining the fix path"
      },
      "example_quotes": ["optional short quote"]
    }
  ],
  "important_insights": {
    "sentiment_summary": "1 sentence sentiment summary",
    "opportunity_framing": "1 sentence strategic opportunity framing",
    "additional_insights": ["1–2 additional insights max"]
  },
  "seller_questions": [
    {
      "question": "Seller-focused product strategy question",
      "why_it_matters": "1 sentence linking the question to strengths/pain points"
    }
  ]
}
`;

// 2. ESTRUCTURA DE SALIDA (JSON SCHEMA) - SSP Analysis
const SSP_JSON_STRUCTURE = `
Output strictly in valid JSON format using the following structure:
{
  "quantity_improvements": [
    {
      "recommendation": "1-2 sentences, concrete",
      "why_it_matters": "1 sentence, seller-centric outcome",
      "grounded_in": {
        "insight_bucket": "must match an insight bucket label",
        "insight_signal": "short signal like 'stability issues ~12%'"
      },
      "fix_type": "QA_PROCESS | MATERIAL_UPGRADE | MINOR_FUNCTIONAL | MAJOR_REDESIGN | PACKAGING_INSTRUCTIONS",
      "impact": "LOW | MEDIUM | HIGH",
      "effort": "LOW | MEDIUM | HIGH",
      "confidence": "HIGH | MEDIUM | LOW"
    }
  ],
  "functional_enhancements": [
    {
      "recommendation": "1-2 sentences, concrete",
      "why_it_matters": "1 sentence, seller-centric outcome",
      "grounded_in": {
        "insight_bucket": "must match an insight bucket label",
        "insight_signal": "short signal like 'stability issues ~12%'"
      },
      "fix_type": "MINOR_FUNCTIONAL | MAJOR_REDESIGN",
      "impact": "LOW | MEDIUM | HIGH",
      "effort": "LOW | MEDIUM | HIGH",
      "confidence": "HIGH | MEDIUM | LOW"
    }
  ],
  "quality_upgrades": [
    {
      "recommendation": "1-2 sentences, concrete",
      "why_it_matters": "1 sentence, seller-centric outcome",
      "grounded_in": {
        "insight_bucket": "must match an insight bucket label",
        "insight_signal": "short signal like 'stability issues ~12%'"
      },
      "fix_type": "QA_PROCESS | MATERIAL_UPGRADE",
      "impact": "LOW | MEDIUM | HIGH",
      "effort": "LOW | MEDIUM | HIGH",
      "confidence": "HIGH | MEDIUM | LOW"
    }
  ],
  "aesthetic_innovations": [
    {
      "recommendation": "1-2 sentences, concrete",
      "why_it_matters": "1 sentence, seller-centric outcome",
      "grounded_in": {
        "insight_bucket": "must match an insight bucket label",
        "insight_signal": "short signal like 'design mentions ~15%'"
      },
      "fix_type": "MINOR_FUNCTIONAL | PACKAGING_INSTRUCTIONS",
      "impact": "LOW | MEDIUM | HIGH",
      "effort": "LOW | MEDIUM | HIGH",
      "confidence": "HIGH | MEDIUM | LOW"
    }
  ],
  "strategic_bundling": [
    {
      "recommendation": "1-2 sentences, concrete",
      "why_it_matters": "1 sentence, seller-centric outcome",
      "grounded_in": {
        "insight_bucket": "must match an insight bucket label",
        "insight_signal": "short signal like 'usage pattern mentioned ~10%'"
      },
      "fix_type": "PACKAGING_INSTRUCTIONS",
      "impact": "LOW | MEDIUM | HIGH",
      "effort": "LOW | MEDIUM | HIGH",
      "fba_safe": true,
      "fba_notes": "Why it is FBA-safe",
      "confidence": "HIGH | MEDIUM | LOW"
    }
  ]
}
`;

// 2. HELPER: Convierte tu Array de Objetos a un String legible para la IA
// Esto es vital para que la IA sepa qué texto pertenece a qué calificación.
function formatReviewsForPrompt(reviewsArray) {
  return reviewsArray.map((r, index) => {
    return `Review #${index + 1}:
[Rating: ${r.rating} Stars]
Title: "${r.title}"
Content: "${r.body}"
---`;
  }).join('\n');
}

function formatBlocksForPrompt(blocks: string[], maxChars = 150000) {
  const parts: string[] = [];
  let total = 0;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = (blocks[i] || '').trim();
    if (!block) continue;
    const segment = `REVIEW ${i + 1}:\n${block}`;
    const nextLength = total + segment.length + (parts.length ? 7 : 0);
    if (nextLength > maxChars) break;
    parts.push(segment);
    total = nextLength;
  }

  return parts.join('\n\n---\n\n');
}

const SYSTEM_PROMPT = `
Role:
You are an expert Amazon Private Label Product Analyst. 
Your goal is to analyze reviews to find Super Selling Points (SSPs) and critical flaws.
Output strictly in JSON format.
`;

const RAW_REVIEWS_SYSTEM_PROMPT = `
Role:
You are an expert Amazon Private Label Product Analyst.
Your goal is to analyze raw review text blocks (no structured ratings) and extract decision-grade insights.
Output strictly in JSON format.
`;

const SSP_SYSTEM_PROMPT = `
Role:
You are an elite Amazon Private Label Product Strategist and Innovation Consultant.
Your mission is to transform customer insights into actionable Superhero Selling Points (SSPs) that will dominate the market.
You must deliver precise, innovative, and customer-centric product improvement recommendations.
Output strictly in JSON format.
`;

// 3. FUNCIÓN PRINCIPAL
async function generateReviewAnalysisJSON(reviewsArray) {
  try {
    // Validate OpenAI client is initialized
    if (!openai) {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_SECRET_KEY in your environment variables.');
    }

    // Validate reviews array
    if (!reviewsArray || reviewsArray.length === 0) {
      throw new Error('No reviews provided for analysis. Please upload a CSV file with reviews.');
    }

    console.log(`🔄 Processing ${reviewsArray.length} reviews...`);

    // Convertimos el array a string formateado
    const reviewsTextFormatted = formatReviewsForPrompt(reviewsArray);
    console.log(reviewsTextFormatted);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `
🎯 Your Task:
Analyze the provided Amazon reviews and deliver quantified, decision-grade insights.

Requirements:
- Cluster reviews by semantic similarity, not keywords.
- Count how many reviews fall into each cluster and estimate prevalence.
- Order clusters from most common to least common.
- Each insight must be written as 1–2 complete sentences.
- Include prevalence cues in each cluster, but do not lead with "Approximately X%".
- Do not produce bullet fragments or headlines.
- Avoid vague words like "some users" or "many people."
- Prioritize insights that materially affect buying decisions.
- Themes must be human-readable (e.g., "Stability", "Odor", "Assembly", "Aesthetics").
- Surface overall sentiment distribution across all reviews.
- Important insights must include a strategic opportunity framing sentence, not just sentiment reporting.
- Seller questions must be strategic and seller-centric (not buyer FAQs).
- Provide 3–5 seller questions covering design, materials, manufacturing/QA, cost trade-offs, and differentiation.
- Avoid restating the same strength in different wording unless it adds new insight.
- If strengths overlap (e.g., assembly/setup/simplicity), merge them into one and pick the strongest phrasing.
- Takeaways must be confident, executive-ready one-sentence statements.

Instructions:
- Use Low Star reviews (1–3) to identify pain clusters.
- Use High Star reviews (4–5) to identify praise clusters.
- If a high-rated review contains a complaint, treat it as a hidden opportunity.
- Every pain cluster must include a fixability note with a clear action path.
- Use human, strategist-grade phrasing instead of robotic phrasing.

${JSON_STRUCTURE_INSTRUCTION}

Customer Reviews Data:
"""
${reviewsTextFormatted}
"""
`,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const jsonResponse = JSON.parse(completion.choices[0].message.content);
    return jsonResponse;

  } catch (error) {
    console.error("❌ Error in analysis:", error);
    throw error;
  }
}

async function generateReviewAnalysisFromBlocks(blocks: string[]) {
  try {
    if (!openai) {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_SECRET_KEY in your environment variables.');
    }

    if (!blocks || blocks.length === 0) {
      throw new Error('No review blocks provided for analysis. Please upload a document with review text.');
    }

    console.log(`🔄 Processing ${blocks.length} raw review blocks...`);

    const reviewsTextFormatted = formatBlocksForPrompt(blocks);
    console.log(reviewsTextFormatted);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: RAW_REVIEWS_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `
🎯 Your Task:
Analyze the provided raw review text blocks and deliver quantified, decision-grade insights.

Requirements:
- Cluster reviews by semantic similarity, not keywords.
- Count how many reviews fall into each cluster and estimate prevalence.
- Order clusters from most common to least common.
- Each insight must be written as 1–2 complete sentences.
- Include prevalence cues in each cluster, but do not lead with "Approximately X%".
- Do not produce bullet fragments or headlines.
- Avoid vague words like "some users" or "many people."
- Prioritize insights that materially affect buying decisions.
- Themes must be human-readable (e.g., "Stability", "Odor", "Assembly", "Aesthetics").
- Surface overall sentiment distribution across all reviews.
- Important insights must include a strategic opportunity framing sentence, not just sentiment reporting.
- Seller questions must be strategic and seller-centric (not buyer FAQs).
- Provide 3–5 seller questions covering design, materials, manufacturing/QA, cost trade-offs, and differentiation.
- Avoid restating the same strength in different wording unless it adds new insight.
- If strengths overlap (e.g., assembly/setup/simplicity), merge them into one and pick the strongest phrasing.
- Takeaways must be confident, executive-ready one-sentence statements.
- Ignore boilerplate like "Helpful", "Report", or marketplace metadata.

Instructions:
- Use tone or context clues to infer pain clusters vs praise clusters.
- If sentiment is unclear in a block, treat it as neutral evidence.
- Every pain cluster must include a fixability note with a clear action path.
- Use human, strategist-grade phrasing instead of robotic phrasing.

${JSON_STRUCTURE_INSTRUCTION}

Raw Review Blocks:
"""
${reviewsTextFormatted}
"""
`,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const jsonResponse = JSON.parse(completion.choices[0].message.content);
    return jsonResponse;

  } catch (error) {
    console.error("❌ Error in raw review block analysis:", error);
    throw error;
  }
}

// 5. SSP GENERATION FUNCTION - Uses review analysis context
async function generateSSPRecommendations(reviewAnalysisContext) {
  try {
    // Validate OpenAI client is initialized
    if (!openai) {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_SECRET_KEY in your environment variables.');
    }

    console.log(`🚀 Generating Super Selling Points (SSPs)...`);

    // Format the context for the prompt
    const contextString = JSON.stringify(reviewAnalysisContext, null, 2);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: SSP_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `
🎯 PART 2: ACTIONABLE SUPER SELLING POINTS (SSPs)

Based on the following customer review analysis, formulate clear, practical, and innovative product-improvement recommendations. 
Directly leverage the insights uncovered to create recommendations that will dominate the market.

Grounding & Guardrails:
- Every SSP must reference exactly one insight bucket from review insights.
- If no bucket applies, output fewer items rather than inventing a new one.
- Each SSP must be distinct; do not restate the same benefit in different words.
- Each SSP must be 1–2 sentences with at least one implementation detail (material/spec/process/packaging).
- Quantity: only if customers imply natural multi-unit behavior; include why quantity makes sense.
- Aesthetic: only if aesthetics are a buying driver; otherwise mark LOW confidence and include fewer items.
- Functional: target the #1 repeated complaint; label MINOR vs MAJOR redesign.
- Quality: durability/material upgrades only (no QA checks, inspections, or process-only fixes).
- Bundling: physical, small, lightweight, directly supports use case. No liquids, breakables, digital add-ons, bulky/heavy items, random freebies, or instruction manuals/booklets. Include why relevant + why FBA-safe.

📊 REVIEW ANALYSIS CONTEXT:
"""
${contextString}
"""

Organize your recommendations into these five SSP categories. Output fewer than two if grounding is weak:

📦 1. QUANTITY IMPROVEMENTS
- Only if insights show repeat purchase, replacements, or needing extras.
- Include why quantity makes sense here.
${QUANTITY_GUARDRAIL}
${QUANTITY_GUARDRAIL}

⚙️ 2. FUNCTIONAL ENHANCEMENTS
- Target the most repeated complaint first. Mark MINOR_FUNCTIONAL vs MAJOR_REDESIGN.

🔩 3. QUALITY UPGRADES
- Focus on durability/material improvements only (no QA checks, inspections, or process-only fixes).

🎨 4. AESTHETIC INNOVATIONS
- Only when aesthetics matter; avoid generic "new colors." Use specific finishes/patterns.

🎁 5. STRATEGIC BUNDLING OPPORTUNITIES
- Only small, lightweight, FBA-safe physical accessories. No liquids, breakables, digital items, bulky/heavy additions, random freebies, or instruction manuals/booklets.
- Must include why relevant and why FBA-safe.

🎖️ BEST PRACTICES TO FOLLOW:
- Specificity & Precision: Tie each SSP to customer evidence with a concrete implementation detail.
- Innovation & Differentiation: Prioritize ideas that clearly distinguish the product.
- Customer-Centricity: Reflect authentic customer voices and verified preferences.
- Market Domination Perspective: Frame each recommendation as a strategic lever for advantage.

${SSP_JSON_STRUCTURE}

Deliver your complete, structured analysis now.
`,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const jsonResponse = JSON.parse(completion.choices[0].message.content);
    console.log(`✅ SSP recommendations generated successfully`);
    return jsonResponse;

  } catch (error) {
    console.error("❌ Error generating SSP recommendations:", error);
    throw error;
  }
}

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

type ReviewSample = {
  title?: string;
  body?: string;
  rating?: number | string;
};

type FixType = "QA_PROCESS" | "MATERIAL_UPGRADE" | "MINOR_FUNCTIONAL" | "MAJOR_REDESIGN" | "PACKAGING_INSTRUCTIONS";
type Effort = "LOW" | "MEDIUM" | "HIGH";
type Impact = "LOW" | "MEDIUM" | "HIGH";
type Confidence = "HIGH" | "MEDIUM" | "LOW";

type SspAiNote = {
  id: string;
  mode: 'sideQuestion' | 'refine';
  answer: string;
  question?: string;
  createdAt?: string;
  promoted?: boolean;
  promotedSspId?: string;
};

type SspDetails = {
  supplierSpecs?: string[];
  risks?: string[];
  fbaNotes?: string[];
  qaChecklist?: string[];
  costImpact?: 'low' | 'medium' | 'high' | string;
};

type SSPItem = {
  status?: 'draft' | 'locked';
  recommendation: string;
  why_it_matters: string;
  grounded_in?: {
    insight_bucket: string;
    insight_signal: string;
  };
  fix_type: FixType;
  impact: Impact;
  effort: Effort;
  fba_safe?: boolean;
  fba_notes?: string;
  confidence: Confidence;
  source?: 'ai' | 'manual' | 'promoted_note';
  details?: SspDetails | string;
  aiNotes?: SspAiNote[] | string;
};

type SspResponse = {
  quantity_improvements: SSPItem[];
  functional_enhancements: SSPItem[];
  quality_upgrades: SSPItem[];
  aesthetic_innovations: SSPItem[];
  strategic_bundling: SSPItem[];
};

type GenerateSspFromInsightsArgs = {
  insights: ReviewInsightsPayload;
  reviewAnalysisContext?: any;
  reviewSamples?: ReviewSample[];
  retryForFbaViolations?: boolean;
};

type RefineSSPItemArgs = {
  item: SSPItem;
  instruction: string;
  category: string;
  insights?: ReviewInsightsPayload;
};

type SideQuestionArgs = {
  item: SSPItem;
  question: string;
  category: string;
  insights?: ReviewInsightsPayload;
  aiNotes?: SspAiNote[];
  lastNoteAnswer?: string;
};

type PromoteAnswerArgs = {
  item: SSPItem;
  note: SspAiNote;
  category: string;
  insights?: ReviewInsightsPayload;
  existingSspText?: string[];
  instruction?: string;
};

const formatInsightsForPrompt = (insights: ReviewInsightsPayload) => `
Top Likes:
${insights.topLikes || 'N/A'}

Top Dislikes:
${insights.topDislikes || 'N/A'}

Important Insights:
${insights.importantInsights || 'N/A'}

Important Questions:
${insights.importantQuestions || 'N/A'}

Strengths Takeaway:
${insights.strengthsTakeaway || 'N/A'}

Pain Points Takeaway:
${insights.painPointsTakeaway || 'N/A'}

Insights Takeaway:
${insights.insightsTakeaway || 'N/A'}

Questions Takeaway:
${insights.questionsTakeaway || 'N/A'}
`.trim();

const formatReviewSamples = (samples: ReviewSample[]) => {
  if (!samples || samples.length === 0) return 'N/A';
  return samples.map((sample, index) => {
    const rating = sample.rating ?? 'N/A';
    const title = sample.title ?? '';
    const body = sample.body ?? '';
    return `Sample #${index + 1} [Rating: ${rating}]\nTitle: "${title}"\nContent: "${body}"`;
  }).join('\n---\n');
};

const formatAiNotesForPrompt = (notes: SspAiNote[] = []) => {
  if (!notes.length) return 'N/A';
  return notes.map((note, index) => {
    const question = note.question ? `Q: ${note.question}\n` : '';
    return `Note #${index + 1}\n${question}A: ${note.answer}`;
  }).join('\n---\n');
};

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
  'pamphlet'
];

const hasBundleViolations = (items: SSPItem[] = []) => {
  const violates = (text: string) => {
    const lower = text.toLowerCase();
    return BUNDLE_DISALLOWED_KEYWORDS.some(keyword => lower.includes(keyword));
  };
  return items.some(item => {
    const combined = `${item.recommendation || ''} ${item.why_it_matters || ''} ${item.fba_notes || ''}`;
    return violates(combined);
  });
};

const COMMON_SSP_GUARDRAILS = `
Assume a consumer private label product for Amazon FBA.
- Avoid heavy/bulky redesigns, liquids, electronics, or digital add-ons.
- Avoid industrial materials (steel beams, cast iron) unless explicitly justified; prefer lightweight alternatives.
- Prefer materials like plastics, rubber, foam, plywood/MDF, fabrics, and small hardware.
- If a suggestion could raise FBA fees due to size/weight, provide a lighter alternative.
- If construction is uncertain, use conditional phrasing or request constraints rather than hallucinating.
- Do not restate the same benefit; keep outputs distinct from the parent SSP.
- When proposing materials, include why it fits the category, cost impact (low/med/high), and FBA size/weight impact.
- For QUALITY category, focus on material/durability upgrades only. Do not propose QA checks, inspections, or process-only fixes.
- For BUNDLING, never suggest instruction manuals/booklets or printed guides as add-ons.
`.trim();

const QUANTITY_GUARDRAIL = `- Quantity means more of the exact same product only (multipacks/case packs). No accessories, replacement parts, or complementary items.`;

const SSP_REFINEMENT_JSON_STRUCTURE = `
Output strictly in valid JSON format using the following structure:
{
  "rewrittenSSPTitle": "short, punchy",
  "rewrittenSSPBody": "2-4 sentences, supplier-ready",
  "details": {
    "supplierSpecs": ["optional bullets with specs"],
    "risks": ["optional risks or trade-offs"],
    "fbaNotes": ["optional FBA considerations"],
    "qaChecklist": ["optional QA checklist items"],
    "costImpact": "low | medium | high | optional short note"
  }
}
`;

const normalizeDetailsPayload = (details: unknown): SspDetails | undefined => {
  if (!details || typeof details !== 'object') return undefined;
  const normalizeArray = (value: unknown) =>
    Array.isArray(value)
      ? value.map((entry) => entry?.toString().trim()).filter(Boolean)
      : undefined;
  const payload = details as {
    supplierSpecs?: unknown;
    risks?: unknown;
    fbaNotes?: unknown;
    qaChecklist?: unknown;
    costImpact?: unknown;
  };
  const normalized: SspDetails = {
    supplierSpecs: normalizeArray(payload.supplierSpecs),
    risks: normalizeArray(payload.risks),
    fbaNotes: normalizeArray(payload.fbaNotes),
    qaChecklist: normalizeArray(payload.qaChecklist),
    costImpact: typeof payload.costImpact === 'string'
      ? payload.costImpact.trim()
      : typeof payload.costImpact === 'number'
        ? payload.costImpact.toString()
        : undefined
  };
  const hasContent = Boolean(
    normalized.supplierSpecs?.length ||
    normalized.risks?.length ||
    normalized.fbaNotes?.length ||
    normalized.qaChecklist?.length ||
    normalized.costImpact
  );
  return hasContent ? normalized : undefined;
};

const SIDE_QUESTION_JSON_STRUCTURE = `
Output strictly in valid JSON format using the following structure:
{
  "answer": "detailed but grounded response",
  "ifApplicable_supplierSpecs": ["optional mini bullets"],
  "ifApplicable_risks": ["optional cost/FBA/complexity notes"]
}
`;

async function generateSSPRecommendationsFromInsights({
  insights,
  reviewAnalysisContext,
  reviewSamples = [],
  retryForFbaViolations = false
}: GenerateSspFromInsightsArgs) {
  try {
    if (!openai) {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_SECRET_KEY in your environment variables.');
    }

    console.log(`🚀 Generating Super Selling Points (SSPs) from review insights...`);

    const insightsString = formatInsightsForPrompt(insights);
    const contextString = reviewAnalysisContext ? JSON.stringify(reviewAnalysisContext, null, 2) : 'N/A';
    const samplesString = formatReviewSamples(reviewSamples);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: SSP_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `
🎯 YOUR TASK:
Generate actionable Super Selling Points (SSPs) using the review insights as the primary, authoritative source.

Rules:
- Treat the "Review Insights" section as the single source of truth.
- Use review samples only as supporting detail or to add specificity; do not override insights.
- Every SSP must reference exactly one insight bucket from the Review Insights.
- If no bucket applies, output fewer items rather than inventing a new one.
- Avoid repeating the same idea in different words across categories.
- Each recommendation must be distinct and tied to a different insight or pain point.
- Each SSP must be 1–2 sentences and include at least one implementation detail (material/spec/process/packaging).
- If aesthetics are not evidenced, output fewer aesthetic ideas and mark LOW confidence.
- Quantity ideas only when customers imply natural multi-unit behavior; include why quantity makes sense.
- Functional ideas must target the #1 repeated complaint and mark MINOR vs MAJOR.
- Quality upgrades must be material/durability only (no QA checks, inspections, or process-only fixes).
- Bundles must be small, lightweight, physical, and FBA-safe. No liquids, breakables, digital add-ons, bulky/heavy items, random freebies, or instruction manuals/booklets.
${retryForFbaViolations ? '- Prior output violated bundling rules. Remove any non-compliant bundle ideas and replace only with FBA-safe, small, lightweight accessories that directly support the core use case.' : ''}
- Output strictly in the JSON schema provided.

🧠 REVIEW INSIGHTS (AUTHORITATIVE):
"""
${insightsString}
"""

📊 STRUCTURED CONTEXT (SECONDARY, OPTIONAL):
"""
${contextString}
"""

🧾 REVIEW SAMPLES (SUPPORTING ONLY):
"""
${samplesString}
"""

Organize your recommendations into these five SSP categories. Output fewer than two if grounding is weak:

📦 1. QUANTITY IMPROVEMENTS
- Only if insights show repeat purchase, replacements, or needing extras.
- Include why quantity makes sense here.

⚙️ 2. FUNCTIONAL ENHANCEMENTS
- Target the most repeated complaint first. Mark MINOR_FUNCTIONAL vs MAJOR_REDESIGN.

🔩 3. QUALITY UPGRADES
- Focus on durability/material improvements only (no QA checks, inspections, or process-only fixes).

🎨 4. AESTHETIC INNOVATIONS
- Only when aesthetics matter; avoid generic "new colors." Use specific finishes/patterns.

🎁 5. STRATEGIC BUNDLING OPPORTUNITIES
- Only small, lightweight, FBA-safe physical accessories. No liquids, breakables, digital items, bulky/heavy additions, random freebies, or instruction manuals/booklets.
- Must include why relevant and why FBA-safe.

🎖️ BEST PRACTICES TO FOLLOW:
- Specificity & Precision: Tie each SSP to customer evidence with a concrete implementation detail.
- Innovation & Differentiation: Prioritize ideas that clearly distinguish the product.
- Customer-Centricity: Reflect authentic customer voices and verified preferences.
- Market Domination Perspective: Frame each recommendation as a strategic lever for advantage.

${SSP_JSON_STRUCTURE}

Deliver your complete, structured analysis now.
`,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const jsonResponse = JSON.parse(completion.choices[0].message.content) as SspResponse;
    if (!retryForFbaViolations && hasBundleViolations(jsonResponse?.strategic_bundling)) {
      console.warn('⚠️ Detected FBA-unsafe bundle ideas. Retrying once with guardrails.');
      return generateSSPRecommendationsFromInsights({
        insights,
        reviewAnalysisContext,
        reviewSamples,
        retryForFbaViolations: true
      });
    }
    console.log(`✅ SSP recommendations generated successfully from insights`);
    return jsonResponse;
  } catch (error) {
    console.error("❌ Error generating SSP recommendations from insights:", error);
    throw error;
  }
}

// 6. COMBINED FUNCTION - Runs both analyses in sequence
async function generateFullReviewAnalysis(reviewsArray) {
  try {
    console.log(`🔄 Starting full review analysis pipeline...`);
    
    // Step 1: Generate initial review analysis
    const reviewAnalysis = await generateReviewAnalysisJSON(reviewsArray);
    console.log(`✅ Review analysis complete`);
    
    // Step 2: Generate SSP recommendations based on the analysis
    const sspRecommendations = await generateSSPRecommendations(reviewAnalysis);
    console.log(`✅ SSP recommendations complete`);
    
    // Combine both results
    return {
      review_analysis: reviewAnalysis,
      ssp_recommendations: sspRecommendations
    };
    
  } catch (error) {
    console.error("❌ Error in full analysis pipeline:", error);
    throw error;
  }
}

// 7. IMPROVE SSP IDEA - Improves a single SSP idea based on user instruction and insights context
async function improveSSPIdea(
  currentIdea: string,
  userInstruction: string,
  category: string,
  insightsContext: {
    topLikes?: string;
    topDislikes?: string;
    importantInsights?: string;
    importantQuestions?: string;
  }
): Promise<string> {
  try {
    // Validate OpenAI client is initialized
    if (!openai) {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_SECRET_KEY in your environment variables.');
    }

    console.log(`🔧 Improving SSP idea in category: ${category}`);

    const insightsString = `
Customer Likes: ${insightsContext.topLikes || 'N/A'}

Customer Dislikes: ${insightsContext.topDislikes || 'N/A'}

Important Insights: ${insightsContext.importantInsights || 'N/A'}

Important Questions: ${insightsContext.importantQuestions || 'N/A'}
    `.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert Amazon Private Label Product Strategist. Your task is to improve a Super Selling Point (SSP) idea based on customer insights and specific user instructions. Be concise, actionable, and customer-centric.`,
        },
        {
          role: "user",
          content: `
Based on the following customer review insights, improve this SSP idea.

📊 CUSTOMER INSIGHTS CONTEXT:
"""
${insightsString}
"""

📦 CATEGORY: ${category}

💡 CURRENT SSP IDEA:
"${currentIdea}"

✍️ USER INSTRUCTION FOR IMPROVEMENT:
"${userInstruction}"

🎯 YOUR TASK:
Provide an improved version of this SSP idea that:
1. Incorporates the user's instruction
2. Leverages the customer insights for stronger positioning
3. Is specific, actionable, and market-ready
4. Uses 1–2 sentences with at least one implementation detail

Output ONLY the improved SSP recommendation text. Do not include any explanations or additional text.
`,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const improved = completion.choices[0].message.content?.trim() || currentIdea;
    console.log(`✅ SSP idea improved successfully`);
    return improved;

  } catch (error) {
    console.error("❌ Error improving SSP idea:", error);
    throw error;
  }
}

async function refineSSPItem({
  item,
  instruction,
  category,
  insights
}: RefineSSPItemArgs): Promise<SSPItem> {
  try {
    if (!openai) {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_SECRET_KEY in your environment variables.');
    }

    const insightsString = formatInsightsForPrompt(insights || {});
    const itemString = JSON.stringify(item, null, 2);
  const quantityGuardrail = category === 'quantity'
    ? `\n${QUANTITY_GUARDRAIL}`
    : '';

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an elite Amazon Private Label Product Strategist. You rewrite SSPs to be sharper, supplier-ready, and grounded in insights. Output strictly in JSON.`,
        },
        {
          role: "user",
          content: `
Refine this SSP for the category: ${category}.

Guardrails (must follow):
- No liquids, no heavy/bulky bundles, no digital add-ons.
- Bundles must be small, relevant, packaging-safe, and FBA-safe.
- Do not restate the same benefit in different words.
- Do not quote or paste the user's instruction verbatim into the SSP.
- If the user asks for bundle ideas, include 3-5 compact, relevant add-ons that do not increase FBA fees meaningfully.
- Keep the result 1-2 sentences with at least one concrete implementation detail.
- Preserve existing metadata unless a change is required by the instruction.
- If the user asks for more detail, do NOT repeat previous content. Add new specifics: materials, dimensions, QA checks, supplier-ready constraints, and trade-offs.
- If you mention a material or construction change, include why it fits, cost impact (low/med/high), and FBA size/weight impact.
- Only include the details object when it adds supplier-ready value; omit fields that are not relevant.
${quantityGuardrail}

Additional guardrails:
${COMMON_SSP_GUARDRAILS}

Review Insights (authoritative context):
"""
${insightsString}
"""

Current SSP (JSON):
${itemString}

User instruction:
"${instruction}"

${SSP_REFINEMENT_JSON_STRUCTURE}
`,
        },
      ],
      temperature: 0.6,
      response_format: { type: "json_object" },
    });

    const jsonResponse = JSON.parse(completion.choices[0].message.content) as {
      rewrittenSSPTitle?: string;
      rewrittenSSPBody?: string;
      details?: SspDetails;
    };
    const normalizedDetails = normalizeDetailsPayload(jsonResponse?.details);
    return {
      ...item,
      recommendation: jsonResponse?.rewrittenSSPTitle?.trim() || item.recommendation,
      why_it_matters: jsonResponse?.rewrittenSSPBody?.trim() || item.why_it_matters,
      details: normalizedDetails ?? item.details,
      source: 'ai'
    };
  } catch (error) {
    console.error("❌ Error refining SSP item:", error);
    throw error;
  }
}

async function answerSSPSideQuestion({
  item,
  question,
  category,
  insights,
  aiNotes = [],
  lastNoteAnswer
}: SideQuestionArgs): Promise<{
  answer?: string;
  ifApplicable_supplierSpecs?: string[];
  ifApplicable_risks?: string[];
}> {
  try {
    if (!openai) {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_SECRET_KEY in your environment variables.');
    }

    const insightsString = formatInsightsForPrompt(insights || {});
    const itemString = JSON.stringify(item, null, 2);
    const normalizedQuestion = question.trim().endsWith('?') ? question.trim() : `${question.trim()}?`;
    const notesString = formatAiNotesForPrompt(aiNotes);
    const lastAnswerString = lastNoteAnswer ? lastNoteAnswer.trim() : 'N/A';
  const quantityGuardrail = category === 'quantity'
    ? `\n${QUANTITY_GUARDRAIL}`
    : '';

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You answer SSP follow-up questions clearly and concisely (2-5 sentences).`,
        },
        {
          role: "user",
          content: `
Answer a side question about this SSP in 2-5 sentences.

Guardrails (must follow):
- No liquids, no heavy/bulky bundles, no digital add-ons.
- Bundles must be small, relevant, packaging-safe, and FBA-safe.
- Do not restate the same benefit in different words.
- If the question asks for bundle ideas, provide 3-5 compact, relevant add-ons that do not increase FBA fees meaningfully.
- If the user asks for more detail, do NOT repeat previous content. Add new specifics: materials, dimensions, QA checks, supplier-ready constraints, and trade-offs.
- If you mention a material or construction change, include why it fits, cost impact (low/med/high), and FBA size/weight impact.
${quantityGuardrail}

Additional guardrails:
${COMMON_SSP_GUARDRAILS}

Category: ${category}

Review Insights (authoritative context):
"""
${insightsString}
"""

Current SSP (JSON):
${itemString}

Prior AI notes for this SSP:
"""
${notesString}
"""

Last side-question answer (if any):
"""
${lastAnswerString}
"""

Side question:
"${normalizedQuestion}"

${SIDE_QUESTION_JSON_STRUCTURE}
`,
        },
      ],
      temperature: 0.6,
      max_tokens: 350,
      response_format: { type: "json_object" },
    });

    const jsonResponse = JSON.parse(completion.choices[0].message.content) as {
      answer?: string;
      ifApplicable_supplierSpecs?: string[];
      ifApplicable_risks?: string[];
    };
    return jsonResponse;
  } catch (error) {
    console.error("❌ Error answering SSP side question:", error);
    throw error;
  }
}

async function promoteAnswerToSSPItem({
  item,
  note,
  category,
  insights,
  existingSspText = [],
  instruction
}: PromoteAnswerArgs): Promise<SSPItem> {
  try {
    if (!openai) {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_SECRET_KEY in your environment variables.');
    }

    const insightsString = formatInsightsForPrompt(insights || {});
    const itemString = JSON.stringify(item, null, 2);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You merge an AI note into a single coherent SSP. Output strictly in JSON.`,
        },
        {
          role: "user",
          content: `
Merge this AI note into the existing SSP for the category: ${category}.

Guardrails (must follow):
- No liquids, no heavy/bulky bundles, no digital add-ons.
- Bundles must be small, relevant, packaging-safe, and FBA-safe.
- Do not restate the same benefit in different words.
- Keep the SSP coherent and supplier-ready, with concrete implementation details.
- Preserve metadata defaults when possible, adjusting only if needed for accuracy.
- If you mention a material or construction change, include why it fits, cost impact (low/med/high), and FBA size/weight impact.
- Only include the details object when it adds supplier-ready value; omit fields that are not relevant.

Additional guardrails:
${COMMON_SSP_GUARDRAILS}

Review Insights (authoritative context):
"""
${insightsString}
"""

Existing SSPs in this category (avoid duplicates):
${existingSspText.length ? existingSspText.map((text, index) => `${index + 1}. ${text}`).join('\n') : 'N/A'}

Original SSP (JSON):
${itemString}

AI Note to merge:
${JSON.stringify(note, null, 2)}

${instruction ? `Additional instruction: "${instruction}"` : ''}

${SSP_REFINEMENT_JSON_STRUCTURE}
`,
        },
      ],
      temperature: 0.6,
      response_format: { type: "json_object" },
    });

    const jsonResponse = JSON.parse(completion.choices[0].message.content) as {
      rewrittenSSPTitle?: string;
      rewrittenSSPBody?: string;
      details?: SspDetails;
    };
    const normalizedDetails = normalizeDetailsPayload(jsonResponse?.details);

    const title = (jsonResponse?.rewrittenSSPTitle || '').trim();
    const detail = (jsonResponse?.rewrittenSSPBody || '').trim();
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
      details: normalizedDetails ?? item.details
    };
  } catch (error) {
    console.error("❌ Error promoting SSP answer:", error);
    throw error;
  }
}

export default generateReviewAnalysisJSON;
export {
  generateSSPRecommendations,
  generateSSPRecommendationsFromInsights,
  generateFullReviewAnalysis,
  generateReviewAnalysisFromBlocks,
  improveSSPIdea,
  refineSSPItem,
  answerSSPSideQuestion,
  promoteAnswerToSSPItem
};