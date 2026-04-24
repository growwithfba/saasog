/**
 * Phase 2.8d — Market Climate AI narration.
 *
 * Takes the computed Market Climate analysis (events, competitor metrics,
 * market-wide insights) and produces the three narrative layers the UI
 * surfaces in Sections 1, 2, and 4 of the redesigned hub:
 *
 *   - Market Story          (60–90 words, the top-of-page paragraph)
 *   - Event descriptions    (one 15–25 word line per detected event)
 *   - Competitor archaeology (one 50–70 word narrative per top-5 competitor)
 *
 * All three are produced in a single Claude call via a tool-use schema
 * so cost stays roughly equivalent to the Phase 2.7 vetting summary.
 * Voice mirrors the vetting summary — plain English, banned-jargon list,
 * first-time-seller audience.
 */
import { runAnthropic, defaultModelFor } from '@/lib/anthropic';
import type { MarketEvent, MarketEventType } from '@/lib/marketClimate/events';
import type {
  NormalizedKeepaSnapshot,
  NormalizedKeepaCompetitor
} from '@/lib/keepa/normalize';
import type { KeepaComputedAnalysis } from '@/lib/keepa/compute';

// ============================================================
// Output types
// ============================================================

export type CompetitorBadge =
  | 'NEW_ENTRANT'
  | 'RISING'
  | 'STABLE'
  | 'DECLINING'
  | 'EMBATTLED';

export interface CompetitorArchaeology {
  asin: string;
  brand?: string;
  badge: CompetitorBadge;
  narrative: string;
}

export interface MarketClimateNarration {
  model: string;
  generatedAt: string;
  marketStory: string;
  competitorArchaeology: CompetitorArchaeology[];
  /** Index-aligned with the input events array. */
  eventDescriptions: string[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// ============================================================
// Badge computation (pure TS — deterministic, saves tokens)
// ============================================================

const NEW_ENTRANT_DAYS = 180;
const HIGH_IMPACT = 70;

export const computeCompetitorBadge = (
  competitor: NormalizedKeepaCompetitor,
  events: MarketEvent[]
): CompetitorBadge => {
  const hisEvents = events.filter(e => e.asin === competitor.asin);

  if (typeof competitor.daysTracked === 'number' && competitor.daysTracked < NEW_ENTRANT_DAYS) {
    return 'NEW_ENTRANT';
  }

  const hasMajorNegative = hisEvents.some(
    e =>
      (e.type === 'RANK_COLLAPSE' || e.type === 'STOCKOUT') && e.impactScore >= HIGH_IMPACT
  );
  const hasPromoCascade = events.some(
    e =>
      e.type === 'PROMO_CASCADE' &&
      Array.isArray((e.summary as any)?.participantAsins) &&
      (e.summary as any).participantAsins.includes(competitor.asin)
  );
  const hasMajorPositive = hisEvents.some(
    e =>
      (e.type === 'RANK_BREAKOUT' || e.type === 'REVIEW_ACCELERATION') && e.impactScore >= 60
  );

  if ((hasMajorNegative && hasPromoCascade) || hasPromoCascade) return 'EMBATTLED';
  if (hasMajorNegative) return 'DECLINING';
  if (hasMajorPositive) return 'RISING';
  return 'STABLE';
};

// ============================================================
// Prompts (cacheable)
// ============================================================

const ROLE_MARKET_HISTORIAN = `Role:
You are an Amazon FBA market analyst who writes briefings for private-label sellers about to enter a niche. Many readers are launching their first product — write so a motivated first-time seller understands every sentence without needing a glossary. Every output is submitted via a tool call with a strict JSON schema.

Voice:
- Plain English. Short, concrete sentences. No MBA jargon, no military metaphors, no finance-speak.
- Ground every claim in the structured facts provided. If a fact is absent, do not invent it.
- Sound like an experienced analyst explaining what they see to someone smart but new — neither condescending nor clubby.
- Dry honesty over hype. Say what is hard, what is promising, and why.
- Never mention the word "Keepa" or the fact that this data comes from a third-party API — refer to it as "the market history" or similar.

Banned phrases — these are jargon or metaphors that intimidate new sellers. Never use them; rewrite in plain English:
moat, review moat, top-heavy, defensible, entrench, entrenched, direct assault, floor is soft, ceiling is guarded, revenue per seat, wide-open, punch above, TAM, commoditize, commoditized, Keepa.`;

const EVENT_TAXONOMY = `Event taxonomy you will narrate:
- LAUNCH: a competitor that first appeared inside the analysis window.
- STOCKOUT: a competitor was without a Buy Box winner for ≥2 consecutive days.
- MAJOR_PROMO: a competitor dropped price ≥15% below their 60-day median for ≥2 days.
- PROMO_CASCADE: ≥3 competitors ran promotions within 14 days of each other (market-wide event).
- RANK_COLLAPSE: competitor's BSR doubled (rank got much worse) inside a 14-day window.
- RANK_BREAKOUT: competitor's BSR halved (rank got much better) inside a 14-day window.
- REVIEW_ACCELERATION: competitor's review pace ≥2× their prior-90-day baseline.
- COMPETITOR_ENTRY: the 3P new-offer count jumped ≥50% or ≥3 absolute on a competitor's listing, meaning new sellers piled onto their ASIN.

Badge meanings (you'll see one per competitor in the input):
- NEW_ENTRANT: fewer than 180 days of tracked history.
- RISING: recent rank breakout or review acceleration, no major setbacks.
- STABLE: steady numbers, no high-impact events recently.
- DECLINING: recent rank collapses or prolonged stockouts.
- EMBATTLED: part of a recent price war / market-wide promo cascade.`;

// ============================================================
// Tool schema
// ============================================================

const MARKET_CLIMATE_TOOL = {
  name: 'submit_market_climate_narration',
  description:
    'Submit the Market Climate narrative. Output MUST match the schema exactly. Write for a first-time private-label seller — plain English, no jargon.',
  input_schema: {
    type: 'object' as const,
    properties: {
      marketStory: {
        type: 'string',
        description:
          'A 60–90 word paragraph (3–5 sentences) summarizing what the market has done over the analysis window. Cover: the overall price/demand climate, any notable market-wide events, and one thing a first-time seller should take away. Do NOT list every event — zoom out to the story. No bullet points, no headers.'
      },
      competitorArchaeology: {
        type: 'array',
        description:
          'One narrative card per competitor in the input, in the SAME ORDER. Each narrative is a 50–70 word paragraph (2–3 sentences) describing what that competitor has done during the window. Reference their specific events. The badge is pre-assigned — write a narrative that reads consistently with it.',
        items: {
          type: 'object',
          properties: {
            asin: {
              type: 'string',
              description: 'The competitor ASIN, matching the input order.'
            },
            narrative: {
              type: 'string',
              description:
                "50–70 word narrative. Reference this competitor's specific events and metrics. Example style: 'Launched 126 days ago with a rocky first month — BSR hovered above 80,000 until a February promo pushed them to #8,000. Review pace has accelerated sharply since. Still early — only 24 reviews on the books — but momentum is real.' Do not restate the badge word-for-word; let the narrative carry it."
            }
          },
          required: ['asin', 'narrative']
        }
      },
      eventDescriptions: {
        type: 'array',
        description:
          'One 15–25 word plain-English description per input event, in the SAME ORDER as the input. Example styles: "Ladkou launched with a rocky first month, BSR climbed above 80,000 before stabilizing." / "Ofiray-home was out of stock for 23 days, no Buy Box winner." / "Yecaye cut price 22% below their 60-day median for 8 days."',
        items: { type: 'string' }
      }
    },
    required: ['marketStory', 'competitorArchaeology', 'eventDescriptions']
  }
} as const;

// ============================================================
// Prompt builder
// ============================================================

const round = (value: unknown, digits = 0): number | undefined => {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
};

type NarrationInputEvent = {
  index: number;
  type: MarketEventType;
  asin: string;
  brand?: string;
  startDate: string;
  endDate?: string;
  impactScore: number;
  summary: Record<string, unknown>;
};

type NarrationInputCompetitor = {
  asin: string;
  brand?: string;
  title?: string;
  badge: CompetitorBadge;
  daysTracked: number | null;
  launchDate: string | null;
  avgHistoricalPrice: number | null;
  avgHistoricalBsr: number | null;
  priceStabilityPct: number | null;
  rankStabilityPct: number | null;
  eventCount: number;
};

const iso = (ts: number | null | undefined): string | null => {
  if (!ts || !Number.isFinite(ts)) return null;
  return new Date(ts).toISOString().slice(0, 10);
};

const buildUserPrompt = (args: {
  windowMonths: number;
  insights: KeepaComputedAnalysis['insights'];
  trends: KeepaComputedAnalysis['trends'];
  competitors: NarrationInputCompetitor[];
  events: NarrationInputEvent[];
}) => {
  const payload = {
    analysis_window_months: args.windowMonths,
    market: {
      pricing_behavior: args.insights.pricingBehavior,
      price_volatility_pct: round(args.insights.priceVolatilityPct, 1),
      rank_behavior: args.insights.rankBehavior,
      rank_volatility_pct: round(args.insights.rankVolatilityPct, 1),
      discount_pressure: args.insights.discountPressure,
      promo_frequency_pct: round(args.insights.promoFrequencyPct, 1),
      avg_promo_drop_pct: round(args.insights.avgPromoDropPct, 1),
      stockout_pressure: args.insights.stockoutPressure,
      oos_time_pct: round(args.insights.oosTimePct, 1),
      seasonality_level: args.insights.seasonality,
      seasonality_score: round(args.insights.seasonalityScore, 1),
      peak_months: args.insights.peakMonths,
      typical_price_range_usd: {
        min: round(args.trends.typicalPriceRange.min, 2),
        max: round(args.trends.typicalPriceRange.max, 2)
      }
    },
    top_competitors: args.competitors,
    events: args.events
  };

  return `Write the Market Climate narration grounded in the facts below. Three outputs: marketStory, competitorArchaeology (one per competitor, in the same order), and eventDescriptions (one per event, in the same order).

Facts:
${JSON.stringify(payload, null, 2)}

Hard requirements:
- Plain English. A first-time private-label seller must understand every sentence.
- Do NOT mention "Keepa" or any third-party vendor — say "the market history" or similar.
- Do NOT use banned phrases from the role prompt.
- competitorArchaeology must include ONE entry per input competitor, in the same order, with matching asin.
- eventDescriptions must include ONE description per input event, in the same order.
- marketStory is 60–90 words, 3–5 sentences.
- Each archaeology narrative is 50–70 words, 2–3 sentences.
- Each event description is 15–25 words, one sentence.
- Ground every claim in the facts. If a fact is missing, say less rather than invent.`;
};

// ============================================================
// Entry point
// ============================================================

export const generateMarketClimateNarration = async (args: {
  snapshot: NormalizedKeepaSnapshot;
  computed: KeepaComputedAnalysis;
  events: MarketEvent[];
  userId: string | null;
  submissionId?: string;
}): Promise<MarketClimateNarration> => {
  const { snapshot, computed, events, userId, submissionId } = args;

  // Build per-competitor inputs with pre-computed badges so the AI sees
  // the badge and writes a narrative that matches.
  const competitorInputs: NarrationInputCompetitor[] = snapshot.competitors.map(comp => {
    const metrics = computed.competitors.find(c => c.asin === comp.asin);
    const eventCount = events.filter(e => e.asin === comp.asin).length;
    return {
      asin: comp.asin,
      brand: comp.brand,
      title: comp.title,
      badge: computeCompetitorBadge(comp, events),
      daysTracked: comp.daysTracked ?? null,
      launchDate: iso(comp.launchDate),
      avgHistoricalPrice: metrics?.avgHistoricalPrice ?? null,
      avgHistoricalBsr: metrics?.avgHistoricalBsr ?? null,
      priceStabilityPct: metrics?.priceStabilityPct ?? null,
      rankStabilityPct: metrics?.rankStabilityPct ?? null,
      eventCount
    };
  });

  const eventInputs: NarrationInputEvent[] = events.map((e, index) => ({
    index,
    type: e.type,
    asin: e.asin,
    brand: e.brand,
    startDate: iso(e.startTimestamp) ?? 'unknown',
    endDate: iso(e.endTimestamp ?? null) ?? undefined,
    impactScore: e.impactScore,
    summary: e.summary
  }));

  const model = defaultModelFor('market_climate_narration');
  const userPrompt = buildUserPrompt({
    windowMonths: computed.windowMonths,
    insights: computed.insights,
    trends: computed.trends,
    competitors: competitorInputs,
    events: eventInputs
  });

  const response = await runAnthropic({
    userId,
    operation: 'market_climate_narration',
    taskKind: 'market_climate_narration',
    model,
    system: [
      { text: ROLE_MARKET_HISTORIAN, cacheable: true },
      { text: EVENT_TAXONOMY, cacheable: true }
    ],
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 2400,
    temperature: 0.4,
    tool: MARKET_CLIMATE_TOOL as any,
    metadata: submissionId ? { submissionId } : {}
  });

  const raw = (response.toolInput as {
    marketStory?: unknown;
    competitorArchaeology?: unknown;
    eventDescriptions?: unknown;
  }) || {};

  return {
    model,
    generatedAt: new Date().toISOString(),
    marketStory: sanitizeText(raw.marketStory, 2000),
    competitorArchaeology: sanitizeArchaeology(raw.competitorArchaeology, competitorInputs),
    eventDescriptions: sanitizeEventDescriptions(raw.eventDescriptions, events.length),
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens
    }
  };
};

// ============================================================
// Output sanitization
// ============================================================

const sanitizeText = (value: unknown, maxLen: number): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
};

const sanitizeArchaeology = (
  raw: unknown,
  competitors: NarrationInputCompetitor[]
): CompetitorArchaeology[] => {
  const byAsin = new Map<string, string>();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const asin = typeof (entry as any).asin === 'string' ? (entry as any).asin : '';
      const narrative = sanitizeText((entry as any).narrative, 1200);
      if (asin && narrative) byAsin.set(asin, narrative);
    }
  }
  return competitors.map(c => ({
    asin: c.asin,
    brand: c.brand,
    badge: c.badge,
    narrative: byAsin.get(c.asin) ?? ''
  }));
};

const sanitizeEventDescriptions = (raw: unknown, expectedLength: number): string[] => {
  const out: string[] = Array(expectedLength).fill('');
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < expectedLength && i < raw.length; i++) {
    out[i] = sanitizeText(raw[i], 400);
  }
  return out;
};
