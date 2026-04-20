/**
 * Anthropic model constants and default pricing (USD per 1M tokens).
 * Pricing is a local snapshot for cost estimation only; actual spend
 * is logged to usage_events via the observability wrapper.
 */

export const CLAUDE = {
  OPUS_4_7: 'claude-opus-4-7' as const,
  SONNET_4_6: 'claude-sonnet-4-6' as const,
  HAIKU_4_5: 'claude-haiku-4-5' as const,
};

export type ClaudeModel = (typeof CLAUDE)[keyof typeof CLAUDE];

interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
  cachedInputPerM: number;   // prompt cache reads are ~10% of normal input
  cacheWritePerM: number;    // cache writes cost ~125% of normal input
}

// Snapshot taken 2026-04-20. If Anthropic changes prices, update here.
export const CLAUDE_PRICING: Record<ClaudeModel, ModelPricing> = {
  [CLAUDE.OPUS_4_7]: {
    inputPerM: 15,
    outputPerM: 75,
    cachedInputPerM: 1.5,
    cacheWritePerM: 18.75,
  },
  [CLAUDE.SONNET_4_6]: {
    inputPerM: 3,
    outputPerM: 15,
    cachedInputPerM: 0.3,
    cacheWritePerM: 3.75,
  },
  [CLAUDE.HAIKU_4_5]: {
    inputPerM: 1,
    outputPerM: 5,
    cachedInputPerM: 0.1,
    cacheWritePerM: 1.25,
  },
};

/**
 * Recommended model for a given task type. Keep this centralized so
 * we can tune the defaults in one spot. See memory file
 * feedback_conservative_tokens.md for why Sonnet is the default
 * insight model and Haiku handles classification / tagging.
 */
export type TaskKind =
  | 'review_insights'       // rich, user-facing clustering
  | 'ssp_generation'        // SSP output bound to the 5-category schema
  | 'vetting_summary'       // market-score narrative for the user
  | 'classification'        // fixability bucket, tag suggest, etc.
  | 'validation'            // schema sanity checks, mechanical

const DEFAULT_MODEL_BY_TASK: Record<TaskKind, ClaudeModel> = {
  review_insights: CLAUDE.SONNET_4_6,
  ssp_generation: CLAUDE.SONNET_4_6,
  vetting_summary: CLAUDE.SONNET_4_6,
  classification: CLAUDE.HAIKU_4_5,
  validation: CLAUDE.HAIKU_4_5,
};

export function defaultModelFor(task: TaskKind): ClaudeModel {
  return DEFAULT_MODEL_BY_TASK[task];
}

/**
 * Compute the USD cost of a call, accounting for prompt-cache reads
 * and writes separately when the Anthropic response provides those
 * token counts (usage.cache_read_input_tokens /
 * usage.cache_creation_input_tokens).
 */
export function computeAnthropicCostUsd(
  model: ClaudeModel,
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  }
): number {
  const p = CLAUDE_PRICING[model];
  if (!p) return 0;
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  const cachedReads = usage.cache_read_input_tokens ?? 0;
  const cacheWrites = usage.cache_creation_input_tokens ?? 0;
  return (
    (inTok * p.inputPerM +
      outTok * p.outputPerM +
      cachedReads * p.cachedInputPerM +
      cacheWrites * p.cacheWritePerM) /
    1_000_000
  );
}
