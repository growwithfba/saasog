import { supabaseAdmin } from '@/utils/supabaseAdmin';

/**
 * Wrapper + logger for every external-service call (Anthropic, OpenAI,
 * Keepa, Stripe, Resend). Writes to the public.usage_events table via
 * the service role so we get per-user, per-operation visibility into
 * spend, latency, and failures.
 *
 * Server-side only. The usage_events table has no INSERT policy for
 * authenticated clients, so these inserts must run in API route
 * handlers or server components.
 *
 * Logging is best-effort: if the insert fails we console.error and
 * move on so downstream callers never fail because of telemetry.
 */

export type UsageProvider =
  | 'anthropic'
  | 'openai'
  | 'keepa'
  | 'stripe'
  | 'resend'
  | 'other';

export type UsageStatus = 'ok' | 'error';

export type TrackCallInput = {
  userId: string | null;
  provider: UsageProvider;
  operation: string;
  model?: string;
  status: UsageStatus;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  latencyMs?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

export async function trackCall(input: TrackCallInput): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('usage_events').insert({
      user_id: input.userId,
      provider: input.provider,
      model: input.model ?? null,
      operation: input.operation,
      status: input.status,
      tokens_in: input.tokensIn ?? null,
      tokens_out: input.tokensOut ?? null,
      cost_usd: input.costUsd ?? null,
      latency_ms: input.latencyMs ?? null,
      error_message: input.errorMessage ?? null,
      metadata: input.metadata ?? null,
    });
    if (error) {
      console.error('[observability] usage_events insert failed:', error.message);
    }
  } catch (err) {
    console.error('[observability] trackCall threw:', err);
  }
}

type WithTrackingMeta<T> = {
  userId: string | null;
  provider: UsageProvider;
  operation: string;
  model?: string;
  metadata?: Record<string, unknown>;
  extractUsage?: (result: T) => {
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
  };
};

/**
 * Run an async operation, time it, and log the outcome to usage_events.
 * Re-throws the original error so callers can handle failures normally.
 */
export async function withTracking<T>(
  meta: WithTrackingMeta<T>,
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    const usage = meta.extractUsage?.(result) ?? {};
    await trackCall({
      userId: meta.userId,
      provider: meta.provider,
      operation: meta.operation,
      model: meta.model,
      status: 'ok',
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costUsd: usage.costUsd,
      latencyMs: Date.now() - startedAt,
      metadata: meta.metadata,
    });
    return result;
  } catch (err) {
    await trackCall({
      userId: meta.userId,
      provider: meta.provider,
      operation: meta.operation,
      model: meta.model,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
      metadata: meta.metadata,
    });
    throw err;
  }
}

// ============================================================
// Cost estimation
// ============================================================
// Prices snapshotted 2026-04-18. Update when providers adjust rates.
// Values are USD per 1,000,000 tokens.

const ANTHROPIC_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  'claude-opus-4-7': { inputPerM: 15, outputPerM: 75 },
  'claude-opus-4-6': { inputPerM: 15, outputPerM: 75 },
  'claude-sonnet-4-6': { inputPerM: 3, outputPerM: 15 },
  'claude-sonnet-4-5': { inputPerM: 3, outputPerM: 15 },
  'claude-haiku-4-5': { inputPerM: 1, outputPerM: 5 },
};

const OPENAI_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  'gpt-4-turbo': { inputPerM: 10, outputPerM: 30 },
  'gpt-4o': { inputPerM: 2.5, outputPerM: 10 },
  'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
};

export function estimateAnthropicCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number
): number | undefined {
  const rate = ANTHROPIC_PRICING[model];
  if (!rate) return undefined;
  return (tokensIn * rate.inputPerM + tokensOut * rate.outputPerM) / 1_000_000;
}

export function estimateOpenAICostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number
): number | undefined {
  const rate = OPENAI_PRICING[model];
  if (!rate) return undefined;
  return (tokensIn * rate.inputPerM + tokensOut * rate.outputPerM) / 1_000_000;
}

// Keepa bills in API tokens (~$0.01/token on the Starter plan; adjust
// if the user is on a different tier). One bulk ASIN request with
// 30 days of history costs ~5 Keepa tokens.
const KEEPA_USD_PER_TOKEN = 0.01;

export function estimateKeepaCostUsd(keepaTokens: number): number {
  return keepaTokens * KEEPA_USD_PER_TOKEN;
}
