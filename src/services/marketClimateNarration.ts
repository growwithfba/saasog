/**
 * Phase 2.8d/f.2 — Market Climate AI narration.
 *
 * Takes the computed Market Climate analysis (insights, competitor profiles,
 * events) and produces every plain-English string the redesigned hub renders:
 *
 *   - Market Story        — top-of-page paragraph (60–90 words).
 *   - At-a-Glance         — 3 card explainers (price / demand / seasonal).
 *   - Pre-Vetting Reports — per-competitor 3-lens narratives (launch,
 *                            price/supply, rank) + 3 big-picture summaries.
 *
 * All produced in one batched Sonnet 4.6 call. Voice rules locked in the
 * cached system blocks below: insights-not-data framing, banned-jargon
 * list, never mention Keepa.
 */
import { runAnthropic, defaultModelFor } from '@/lib/anthropic';
import type { MarketEvent } from '@/lib/marketClimate/events';
import type {
  NormalizedKeepaSnapshot,
  NormalizedKeepaCompetitor
} from '@/lib/keepa/normalize';
import type { KeepaComputedAnalysis } from '@/lib/keepa/compute';
import type {
  CompetitorProfileSet,
  CompetitorProfile
} from '@/lib/marketClimate/competitorProfile';

// ============================================================
// Output types
// ============================================================

export interface AtAGlanceNarrative {
  priceClimate: string;
  demandClimate: string;
  seasonalPeak: string;
}

export interface PreVettingCompetitorNarrative {
  asin: string;
  brand?: string;
  /** A scannable one-liner for the collapsed list view. ~14–22 words. */
  headline: string;
  launchNarrative: string;
  priceSupplyNarrative: string;
  rankNarrative: string;
}

export interface PreVettingBigPicture {
  launchPicture: string;
  pricePicture: string;
  rankPicture: string;
}

export interface PreVettingNarration {
  competitors: PreVettingCompetitorNarrative[];
  bigPicture: PreVettingBigPicture;
}

export interface MarketClimateNarration {
  model: string;
  generatedAt: string;
  marketStory: string;
  atAGlance: AtAGlanceNarrative;
  preVetting: PreVettingNarration;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// ============================================================
// Prompts (cacheable)
// ============================================================

const ROLE_MARKET_HISTORIAN = `Role:
You are an Amazon FBA market analyst who writes briefings for private-label sellers about to enter a niche. Many readers are launching their first product — write so a motivated first-time seller understands every sentence without needing a glossary. Every output is submitted via a tool call with a strict JSON schema.

Voice — "insights, not data":
- Do not just describe the numbers. Interpret what they mean for the seller's business.
- Translate behavior into strategy: price is climbing → "shoppers accept premium pricing"; rank averaged 100K all year → "this listing isn't actually a strong seller, despite a recent good month"; one stockout that lasted a month → "supply discipline is a real risk in this market"; lots of price changes → "this seller is paying attention; expect to be undercut quickly".
- Plain English. Short, concrete sentences. No MBA jargon, no military metaphors, no finance-speak.
- Ground every claim in the structured facts AND in the product category inferred from competitor titles/brands. If a fact is absent, do not invent it.
- Sound like a trusted advisor explaining what this market implies for someone smart but new — neither condescending nor clubby.
- Soft-frame expectations. Never promise specific sales numbers.
- When natural, tie findings to SSP opportunities (Quantity / Functionality / Quality / Aesthetic / Bundle).
- Never mention the word "Keepa" or that this data comes from a third-party API — refer to it as "the market history" or similar.

Banned phrases — these are jargon or metaphors that intimidate new sellers. Never use them; rewrite in plain English:
moat, review moat, top-heavy, defensible, entrench, entrenched, direct assault, floor is soft, ceiling is guarded, revenue per seat, wide-open, punch above, TAM, commoditize, commoditized, Keepa.`;

const PRE_VETTING_FRAMEWORK = `Pre-vetting framework you are writing for:

Each competitor is read through three lenses. For every competitor in the input, you must write all three lens-narratives, each grounded in the structured signals you'll see (launch.*, priceSupply.*, rank.*). After the per-competitor narratives, you write a "big picture" paragraph for each lens that synthesizes the pattern across all competitors.

Lens 1 — LAUNCH:
- Read launch.launchedOnSale, launchListPrice, launchBuyBoxPrice, launchDiscountPct.
  "Came in advertising a launch sale" / "Launched at full list price" / "Launched without a list-price anchor".
- Read daysToFirstSale + daysToTraction:
  "Hit traction quickly" (under 30 days) / "Took ~3 months to get noticed" / "Still building, not yet at category median".
- Read daysOnMarket — set context: "fresh launch" (<180d), "hitting their first year", "established", etc.
- Use isWithinAnalysisWindow: only call out launch as a "recent event" if it landed inside the analysis window.

Lens 2 — PRICE & SUPPLY (combined — they go together):
- Read priceFloor / priceCeiling / currentBuyBox: "Floor is around $X — that's where they get sales" / "Currently priced near the high end of their year".
- Read priceActivityLevel + priceChangesPerMonth: "Active seller, adjusts price often — expect to be undercut" / "Lazy seller — hasn't touched price in a year".
- Read stockoutCount + totalStockoutDays + longestStockoutDays: "Ran out of stock once for ~30 days" / "Solid supply discipline — no stockouts" / "Multiple stockouts indicate inventory chaos".

Lens 3 — RANK:
- Read bsrAvg365d (the truth-teller) and bsrCurrent: state the all-year average, then how recent rank compares.
- Read currentVsYearAverage: "Currently doing better than their year average — recent good period" / "Right at their year average — current numbers are normal for them" / "Currently worse than their year average — don't read recent BSR as their normal".
- Read bsrFloor + bsrCeiling: "Best they've done is #X, worst is #Y" — only if both are meaningful.
- Read volatilityPct: low (<30) → "steady demand", mid (30–60) → "regular swings", high (>60) → "wild rank movement".

Big-picture summaries (one per lens, after the per-competitor narratives):
- LAUNCH: how open is this market to newcomers? Reference countOver12mo, countOver24mo, averageDaysToTraction.
- PRICE & SUPPLY: how active and disciplined is this market? Reference activeSellerCount, lazySellerCount, totalStockoutEvents, marketSupplyHealth. Note: stockouts in incumbent listings represent OPPORTUNITY for a new seller (validated demand + weak supply discipline) — frame them positively, not as a market warning.
- RANK: how strong is demand and how stable is rank? These are TWO different axes — do not conflate them.
  • demandStrength is the definitive read on demand quality. "strong" means the category consistently moves volume; "moderate" means decent flow; "weak" means thin demand. Use this verdict directly. Never write "demand is mixed" or "demand is unclear" if demandStrength is "strong" or "moderate".
  • bsrConsistency describes how stable rank is day-to-day, NOT demand strength. A market can have strong demand AND volatile rank (lumpy day-to-day sales but real demand overall).
  • When summarizing: lead with demandStrength, then use bsrConsistency to color the day-to-day picture.

For every competitor, also write a one-sentence "headline" that summarizes their full read in 14–22 words. Used in the collapsed list view.`;

// ============================================================
// Tool schema
// ============================================================

const MARKET_CLIMATE_TOOL = {
  name: 'submit_market_climate_narration',
  description:
    'Submit the Market Climate narrative. Output MUST match the schema exactly. Write for a first-time private-label seller — plain English, insights not data.',
  input_schema: {
    type: 'object' as const,
    properties: {
      marketStory: {
        type: 'string',
        description:
          'A 60–90 word paragraph (3–5 sentences) summarizing what the market has done over the analysis window. Cover: the overall price/demand climate, any notable market-wide patterns, and one thing a first-time seller should take away. Zoom out, do not list every event. No bullet points, no headers.'
      },
      atAGlance: {
        type: 'object',
        description:
          'Three short "so what?" interpretations for the At-a-Glance cards. Each is an insight, not a stats recap.',
        properties: {
          priceClimate: {
            type: 'string',
            description:
              "30–60 words on what the price behavior implies for the seller's strategy. Tie naturally to an SSP angle when prices are climbing/stable. Never repeat raw % values back to the seller — interpret."
          },
          demandClimate: {
            type: 'string',
            description:
              "30–60 words on what the demand pattern means for inventory rhythm and day-to-day reality. Use soft expectations. Never promise specific sales numbers. Don't just describe stable/unstable — explain what it means."
          },
          seasonalPeak: {
            type: 'string',
            description:
              "40–80 words. If there's a clear seasonal pattern, infer WHY from the product category (Mother's Day, holiday gifting, back-to-school, weather). Frame both peak-month expectations and off-month expectations. List peak months in calendar order, never magnitude order. If no clear seasonality, say so plainly and reassure."
          }
        },
        required: ['priceClimate', 'demandClimate', 'seasonalPeak']
      },
      preVetting: {
        type: 'object',
        description:
          'Per-competitor pre-vetting reports plus three big-picture summaries (one per lens).',
        properties: {
          competitors: {
            type: 'array',
            description:
              'One entry per input competitor, in the SAME ORDER as the input. Each entry has a one-line headline + three lens-narratives.',
            items: {
              type: 'object',
              properties: {
                asin: {
                  type: 'string',
                  description: 'The competitor ASIN, matching the input order.'
                },
                headline: {
                  type: 'string',
                  description:
                    "14–22 word scannable summary of this competitor's read. Used in the collapsed list view. Example: 'Established seller with steady supply, but year-average BSR ~80K means recent good month is the exception, not the norm.'"
                },
                launchNarrative: {
                  type: 'string',
                  description:
                    "30–60 words on this competitor's launch story (when they entered, their playbook, time to gain traction). Reference the daysOnMarket / launchedOnSale / daysToTraction signals. If the competitor is established (well outside the analysis window), still note their tenure briefly and call out anything notable about their original launch playbook if knowable; otherwise just state how long they've been on the market and move on."
                },
                priceSupplyNarrative: {
                  type: 'string',
                  description:
                    "40–70 words on this competitor's pricing rhythm AND supply discipline together (they're entangled — when supply runs out, price often spikes first). Reference floor/ceiling/current, priceActivityLevel, stockout history. Tell the seller what to expect from this competitor: will they get undercut, are they reliable inventory-wise."
                },
                rankNarrative: {
                  type: 'string',
                  description:
                    "40–70 words on rank trajectory — the truth-teller of how this listing actually sells over the long haul. Lead with the all-year BSR average. Then the floor (best they've done) and ceiling (worst). Then how the CURRENT BSR compares to their year average — is recent BSR a fluke or the norm? Soft-framed conclusion about what a new seller should expect."
                }
              },
              required: ['asin', 'headline', 'launchNarrative', 'priceSupplyNarrative', 'rankNarrative']
            }
          },
          bigPicture: {
            type: 'object',
            description:
              'Three short summaries (one per lens) that synthesize the pattern across all competitors.',
            properties: {
              launchPicture: {
                type: 'string',
                description:
                  "40–70 words. Is this market open to newcomers? Reference countOver12mo, countOver24mo, averageDaysToTraction. Frame implications for a first-time seller's launch plan."
              },
              pricePicture: {
                type: 'string',
                description:
                  '40–70 words. How active and disciplined is this market? Reference activeSellerCount, lazySellerCount, totalStockoutEvents, marketSupplyHealth. What should a new entrant expect from competitors price-wise?'
              },
              rankPicture: {
                type: 'string',
                description:
                  '40–70 words. Lead with the demandStrength verdict (strong / moderate / weak) — that is the definitive demand call. Then layer in bsrConsistency to describe day-to-day stability. Never call demand "mixed" or "unclear" when demandStrength is "strong" or "moderate"; those words describe rank stability, not demand. Translate BSR ranges into plain-English sales expectations for a first-time seller.'
              }
            },
            required: ['launchPicture', 'pricePicture', 'rankPicture']
          }
        },
        required: ['competitors', 'bigPicture']
      }
    },
    required: ['marketStory', 'atAGlance', 'preVetting']
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

const iso = (ts: number | null | undefined): string | null => {
  if (!ts || !Number.isFinite(ts)) return null;
  return new Date(ts).toISOString().slice(0, 10);
};

type SerializableCompetitor = {
  asin: string;
  brand?: string;
  title?: string;
  launch: Record<string, unknown>;
  priceSupply: Record<string, unknown>;
  rank: Record<string, unknown>;
};

const serializeProfile = (profile: CompetitorProfile): SerializableCompetitor => ({
  asin: profile.asin,
  brand: profile.brand,
  title: profile.title,
  launch: {
    launchDate: iso(profile.launch.launchDate),
    daysOnMarket: profile.launch.daysOnMarket,
    isWithinAnalysisWindow: profile.launch.isWithinAnalysisWindow,
    launchListPrice: profile.launch.launchListPrice,
    launchBuyBoxPrice: profile.launch.launchBuyBoxPrice,
    launchedOnSale: profile.launch.launchedOnSale,
    launchDiscountPct: profile.launch.launchDiscountPct,
    daysToFirstSale: profile.launch.daysToFirstSale,
    daysToTraction: profile.launch.daysToTraction
  },
  priceSupply: {
    currentBuyBox: profile.priceSupply.currentBuyBox,
    currentListPrice: profile.priceSupply.currentListPrice,
    priceFloor: profile.priceSupply.priceFloor,
    priceCeiling: profile.priceSupply.priceCeiling,
    priceChangesPerMonth: profile.priceSupply.priceChangesPerMonth,
    priceActivityLevel: profile.priceSupply.priceActivityLevel,
    stockoutCount: profile.priceSupply.stockoutCount,
    totalStockoutDays: profile.priceSupply.totalStockoutDays,
    longestStockoutDays: profile.priceSupply.longestStockoutDays,
    daysSinceLastStockout: profile.priceSupply.daysSinceLastStockout
  },
  rank: {
    bsrCurrent: profile.rank.bsrCurrent,
    bsrAvg30d: profile.rank.bsrAvg30d,
    bsrAvg90d: profile.rank.bsrAvg90d,
    bsrAvg365d: profile.rank.bsrAvg365d,
    bsrFloor: profile.rank.bsrFloor,
    bsrCeiling: profile.rank.bsrCeiling,
    volatilityPct: profile.rank.volatilityPct,
    currentVsYearAverage: profile.rank.currentVsYearAverage,
    bsrCurrentRatio: profile.rank.bsrCurrentRatio
  }
});

const buildUserPrompt = (args: {
  windowMonths: number;
  insights: KeepaComputedAnalysis['insights'];
  trends: KeepaComputedAnalysis['trends'];
  profileSet: CompetitorProfileSet;
  events: MarketEvent[];
}) => {
  // Compact event list — just type, asin, date, summary. Used by the AI for
  // anchoring claims like "ran a 22% promo in March 2025".
  const eventDigest = args.events.slice(0, 30).map(e => ({
    type: e.type,
    asin: e.asin,
    startDate: iso(e.startTimestamp),
    endDate: iso(e.endTimestamp ?? null) ?? undefined,
    impactScore: e.impactScore,
    summary: e.summary
  }));

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
    competitor_profiles: args.profileSet.competitors.map(serializeProfile),
    big_picture_signals: args.profileSet.bigPicture,
    notable_events: eventDigest
  };

  return `Write the Market Climate narration grounded in the facts below. Three top-level outputs: marketStory, atAGlance, preVetting (with per-competitor narratives + big-picture summaries).

Facts:
${JSON.stringify(payload, null, 2)}

Hard requirements:
- Plain English. A first-time private-label seller must understand every sentence.
- Do NOT mention "Keepa" or any third-party vendor.
- Do NOT use banned phrases from the role prompt.
- preVetting.competitors must include ONE entry per input competitor, in the SAME ORDER, with matching asin.
- Each competitor entry has all four fields: headline, launchNarrative, priceSupplyNarrative, rankNarrative.
- Word counts: marketStory 60–90, headline 14–22, launchNarrative 30–60, priceSupplyNarrative 40–70, rankNarrative 40–70, each bigPicture 40–70.
- Ground every claim in the facts. If a fact is missing, say less rather than invent.
- Use notable_events to anchor specific claims ("ran a 22% promo in March", "stocked out for 24 days in October") — but never list events as bullets.
- For rankNarrative, the all-year BSR average is the truth-teller — lead with it. Then describe the gap between current BSR and the year average.`;
};

// ============================================================
// Entry point
// ============================================================

export const generateMarketClimateNarration = async (args: {
  snapshot: NormalizedKeepaSnapshot;
  computed: KeepaComputedAnalysis;
  profileSet: CompetitorProfileSet;
  events: MarketEvent[];
  userId: string | null;
  submissionId?: string;
}): Promise<MarketClimateNarration> => {
  const { computed, profileSet, events, userId, submissionId } = args;

  const model = defaultModelFor('market_climate_narration');
  const userPrompt = buildUserPrompt({
    windowMonths: computed.windowMonths,
    insights: computed.insights,
    trends: computed.trends,
    profileSet,
    events
  });

  const response = await runAnthropic({
    userId,
    operation: 'market_climate_narration',
    taskKind: 'market_climate_narration',
    model,
    system: [
      { text: ROLE_MARKET_HISTORIAN, cacheable: true },
      { text: PRE_VETTING_FRAMEWORK, cacheable: true }
    ],
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 4000,
    temperature: 0.4,
    tool: MARKET_CLIMATE_TOOL as any,
    metadata: submissionId ? { submissionId } : {}
  });

  const raw = (response.toolInput as {
    marketStory?: unknown;
    atAGlance?: unknown;
    preVetting?: unknown;
  }) || {};

  return {
    model,
    generatedAt: new Date().toISOString(),
    marketStory: sanitizeText(raw.marketStory, 2000),
    atAGlance: sanitizeAtAGlance(raw.atAGlance),
    preVetting: sanitizePreVetting(raw.preVetting, profileSet.competitors),
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

const sanitizeAtAGlance = (raw: unknown): AtAGlanceNarrative => {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    priceClimate: sanitizeText(obj.priceClimate, 1200),
    demandClimate: sanitizeText(obj.demandClimate, 1200),
    seasonalPeak: sanitizeText(obj.seasonalPeak, 1400)
  };
};

const sanitizePreVetting = (
  raw: unknown,
  profiles: CompetitorProfile[]
): PreVettingNarration => {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawCompetitors = Array.isArray(obj.competitors) ? obj.competitors : [];
  const byAsin = new Map<string, any>();
  for (const entry of rawCompetitors) {
    if (!entry || typeof entry !== 'object') continue;
    const asin = typeof (entry as any).asin === 'string' ? (entry as any).asin : '';
    if (asin) byAsin.set(asin, entry);
  }

  const competitors: PreVettingCompetitorNarrative[] = profiles.map(p => {
    const aiEntry = byAsin.get(p.asin) ?? {};
    return {
      asin: p.asin,
      brand: p.brand,
      headline: sanitizeText(aiEntry.headline, 400),
      launchNarrative: sanitizeText(aiEntry.launchNarrative, 1200),
      priceSupplyNarrative: sanitizeText(aiEntry.priceSupplyNarrative, 1400),
      rankNarrative: sanitizeText(aiEntry.rankNarrative, 1400)
    };
  });

  const bigPictureRaw =
    obj.bigPicture && typeof obj.bigPicture === 'object'
      ? (obj.bigPicture as Record<string, unknown>)
      : {};

  return {
    competitors,
    bigPicture: {
      launchPicture: sanitizeText(bigPictureRaw.launchPicture, 1400),
      pricePicture: sanitizeText(bigPictureRaw.pricePicture, 1400),
      rankPicture: sanitizeText(bigPictureRaw.rankPicture, 1400)
    }
  };
};
