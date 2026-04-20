import Anthropic from '@anthropic-ai/sdk';
import { withTracking } from '@/utils/observability';
import { computeAnthropicCostUsd, type ClaudeModel, type TaskKind } from './models';

/**
 * Lazy-initialized Anthropic client.
 * Server-side only — the API key is never sent to the browser.
 * Throws a clear error at first use if ANTHROPIC_API_KEY is missing
 * (rather than at import time, which would break Vercel builds).
 */
let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not configured. Set it in .env.local and Vercel env vars.'
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// ---- Types ----

/**
 * A system prompt passed to the Messages API. Use the object form with
 * `cacheable: true` when the system text is static across requests
 * (e.g. the SSP schema or Grow with FBA framework doc). The wrapper
 * converts it into an ephemeral cache_control block so subsequent
 * calls with the same prefix hit the prompt cache.
 */
export type AnthropicSystem = string | Array<{ text: string; cacheable?: boolean }>;

export type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export interface RunAnthropicParams {
  /** Supabase user id for usage_events attribution; may be null for system jobs. */
  userId: string | null;
  /** Business-level operation label (e.g. 'review_insights', 'ssp_generate'). */
  operation: string;
  /** Short task taxonomy — used only for metadata/analytics. */
  taskKind?: TaskKind;
  /** Full Claude model id (e.g. CLAUDE.SONNET_4_6). */
  model: ClaudeModel;
  system?: AnthropicSystem;
  messages: AnthropicMessage[];
  maxTokens?: number;
  temperature?: number;
  /**
   * When provided, Claude is forced to call exactly this tool. Use for
   * strict-JSON responses (returns content block of type "tool_use"
   * whose `input` is guaranteed to match the tool's input_schema).
   */
  tool?: {
    name: string;
    description: string;
    input_schema: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
  /** Free-form metadata merged into the usage_events row. */
  metadata?: Record<string, unknown>;
}

export interface AnthropicResponse {
  raw: Anthropic.Message;
  text: string;
  toolInput: unknown | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// ---- Core wrapper ----

function normalizeSystem(system: AnthropicSystem | undefined) {
  if (system === undefined) return undefined;
  if (typeof system === 'string') return system;
  return system.map((block) => ({
    type: 'text' as const,
    text: block.text,
    ...(block.cacheable ? { cache_control: { type: 'ephemeral' as const } } : {}),
  }));
}

function extractText(message: Anthropic.Message): string {
  const blocks = message.content || [];
  return blocks
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

function extractToolInput(message: Anthropic.Message, toolName: string): unknown | null {
  const block = (message.content || []).find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === toolName
  );
  return block?.input ?? null;
}

/**
 * Run an Anthropic call with full observability instrumentation:
 *   - Times the call, logs latency
 *   - Computes USD cost from usage tokens (accounts for prompt-cache
 *     reads and writes separately when the response reports them)
 *   - Writes a usage_events row with status/tokens/cost/metadata
 *   - Re-throws errors so callers can handle them normally
 */
export async function runAnthropic(params: RunAnthropicParams): Promise<AnthropicResponse> {
  const {
    userId,
    operation,
    model,
    system,
    messages,
    maxTokens = 2048,
    temperature,
    tool,
    metadata,
  } = params;

  return withTracking<AnthropicResponse>(
    {
      userId,
      provider: 'anthropic',
      operation,
      model,
      metadata: { ...metadata, taskKind: params.taskKind },
      extractUsage: (result) => ({
        tokensIn:
          (result.usage.input_tokens ?? 0) +
          (result.usage.cache_read_input_tokens ?? 0) +
          (result.usage.cache_creation_input_tokens ?? 0),
        tokensOut: result.usage.output_tokens ?? 0,
        costUsd: computeAnthropicCostUsd(model, result.usage),
      }),
    },
    async () => {
      const client = getClient();
      const request: Anthropic.MessageCreateParamsNonStreaming = {
        model,
        max_tokens: maxTokens,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        ...(system !== undefined ? { system: normalizeSystem(system) as any } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(tool
          ? {
              tools: [tool],
              tool_choice: { type: 'tool' as const, name: tool.name },
            }
          : {}),
      };

      const message = await client.messages.create(request);
      const usage = {
        input_tokens: message.usage?.input_tokens ?? 0,
        output_tokens: message.usage?.output_tokens ?? 0,
        cache_read_input_tokens: (message.usage as any)?.cache_read_input_tokens,
        cache_creation_input_tokens: (message.usage as any)?.cache_creation_input_tokens,
      };
      return {
        raw: message,
        text: extractText(message),
        toolInput: tool ? extractToolInput(message, tool.name) : null,
        usage,
      };
    }
  );
}
